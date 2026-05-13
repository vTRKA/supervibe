import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  readCurrentActiveWorkflowState,
  recordActiveWorkflowAcceptedAnswer,
} from "../scripts/lib/supervibe-active-workflow-state.mjs";
import {
  formatCommandMatch,
  resolveCommandRequest,
} from "../scripts/lib/supervibe-command-catalog.mjs";
import {
  formatNextStepBlock,
  recordNextStepHandoffQuestion,
} from "../scripts/lib/supervibe-skill-chain.mjs";
import {
  validateMultistageUserGates,
} from "../scripts/validate-multistage-user-gates.mjs";
import {
  routeWorkflowIntent,
} from "../scripts/lib/supervibe-workflow-router.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const RUNTIME_HARDENING_DOC = join(ROOT, "docs", "supervibe-runtime-ui-memory-rag-codegraph-10-of-10.md");
const PACKAGE_JSON = join(ROOT, "package.json");
const HANDOFF_FIXTURE = join(ROOT, "tests", "fixtures", "workflows", "plan-review-handoff-user-gate.json");

function withTempRoot(fn) {
  const root = mkdtempSync(join(tmpdir(), "supervibe-user-gates-"));
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("command router preflight hard-stops missing slash commands before retrieval", () => {
  const match = resolveCommandRequest("/supervibe-not-a-real-command please", {
    pluginRoot: ROOT,
    projectRoot: ROOT,
  });

  assert.equal(match.intent, "missing_slash_command");
  assert.equal(match.command, null);
  assert.equal(match.hardStop, true);
  assert.equal(match.doNotSearchProject, true);

  const output = formatCommandMatch(match);
  assert.match(output, /INTENT: missing_slash_command/);
  assert.match(output, /HARD_STOP: true/);
  assert.match(output, /DO_NOT_SEARCH_PROJECT: true/);
  assert.match(output, /COMMAND: none/);
  assert.match(output, /do not inspect source files/i);
});

test("runtime hardening contract records command router preflight before retrieval", () => {
  assert.equal(
    existsSync(RUNTIME_HARDENING_DOC),
    true,
    "runtime hardening doc must exist before workflow execution can claim router-preflight coverage",
  );

  const doc = readFileSync(RUNTIME_HARDENING_DOC, "utf8");
  assert.match(doc, /## Command Router Preflight Contract/);
  assert.match(doc, /node scripts\/supervibe-commands\.mjs --match "<user request>"/);
  assert.match(doc, /INTENT: missing_slash_command/);
  assert.match(doc, /HARD_STOP: true/);
  assert.match(doc, /DO_NOT_SEARCH_PROJECT: true/);
  assert.match(doc, /blocks project memory, Code RAG, CodeGraph, and source search/i);
});

test("runtime hardening baseline names doc-only handoff and strict readiness contradictions", () => {
  const doc = readFileSync(RUNTIME_HARDENING_DOC, "utf8");

  assert.match(doc, /## Current Audit Evidence Baseline/);
  assert.match(doc, /doc-only NEXT_STEP_HANDOFF baseline/i);
  assert.match(doc, /strict-readiness contradiction baseline/i);
  assert.match(doc, /questions written only into Markdown/i);
  assert.match(doc, /maturity score can diverge from strict readiness/i);
});

test("runtime hardening baseline cites required evidence commands", () => {
  const doc = readFileSync(RUNTIME_HARDENING_DOC, "utf8");

  assert.match(doc, /node scripts\/search-memory\.mjs --query "NEXT_STEP_HANDOFF loop UI memory RAG CodeGraph receipts provider config 10 of 10" --limit 10/);
  assert.match(doc, /node scripts\/search-code\.mjs --context "NEXT_STEP_HANDOFF active workflow question choices loop UI RAG memory CodeGraph blocked by provider config doctor receipt drift" --limit 20/);
  assert.match(doc, /node scripts\/search-code\.mjs --impact "active workflow user question handoff persistence" --depth 2/);
  assert.match(doc, /node scripts\/supervibe-status\.mjs/);
  assert.match(doc, /node scripts\/workflow-receipt\.mjs recovery-status/);
  assert.match(doc, /npm run validate:workflow-receipts/);
  assert.match(doc, /node scripts\/supervibe-loop\.mjs --status --file .supervibe\/memory\/work-items\/epic-supervibe-runtime-ui-memory-rag-codegraph-10-of-10-implementation-plan-fc69f6\/graph.json --no-auto-ui/);
});

test("runtime hardening defines final 10 of 10 proof entrypoints with release-only full check", () => {
  const doc = readFileSync(RUNTIME_HARDENING_DOC, "utf8");
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON, "utf8"));

  assert.match(doc, /## Final Runtime 10\/10 Proof Contract/);
  assert.match(doc, /npm run supervibe:runtime-10of10-targeted/);
  assert.match(doc, /npm run supervibe:runtime-10of10-proof/);
  assert.match(doc, /npm run check:release/);
  assert.match(doc, /SUPERVIBE_RUNTIME_10_OF_10_PROOF/);
  assert.match(doc, /REFUSES_10_OF_10_WHEN_MISSING: true/);
  assert.match(doc, /full repository check is a release gate/i);
  assert.ok(pkg.scripts["supervibe:runtime-10of10-targeted"]);
  assert.ok(pkg.scripts["supervibe:runtime-10of10-proof"]);
  assert.match(pkg.scripts["supervibe:runtime-10of10-proof"], /supervibe:runtime-10of10-targeted/);
  assert.match(pkg.scripts["supervibe:runtime-10of10-proof"], /check:release/);
  assert.equal(pkg.scripts["check:release"], "npm run check:release-strict");
});

test("next-step handoff question is durable runtime state, not only markdown", () => {
  withTempRoot((root) => {
    const options = {
      phase: "plan-review",
      artifactPath: ".supervibe/artifacts/plans/example.md",
      locale: "en",
      handoffId: "handoff-plan-review-example",
    };
    const markdown = formatNextStepBlock(options);
    const markdownOnly = readCurrentActiveWorkflowState(root);

    assert.match(markdown, /NEXT_STEP_HANDOFF/);
    assert.equal(markdownOnly.exists, false);

    const state = recordNextStepHandoffQuestion(root, options);
    const current = readCurrentActiveWorkflowState(root);

    assert.equal(current.pass, true);
    assert.equal(state.stage, "work-item-atomization");
    assert.equal(state.handoffId, "handoff-plan-review-example");
    assert.equal(state.question.id, "handoff-plan-review-example");
    assert.equal(state.question.stage, "work-item-atomization");
    assert.match(state.question.prompt, /atomize the reviewed plan/i);
    assert.equal(state.nextCommand, "/supervibe-loop --atomize-plan .supervibe/artifacts/plans/example.md --plan-review-passed");
    assert.equal(state.acceptedAnswer, null);
    assert.equal(state.artifacts[0].path, ".supervibe/artifacts/plans/example.md");
    assert.ok(state.choices.some((choice) => choice.id === "continue-supervibe-artifacts-plans-example-md"));
  });
});

test("next-step handoff questions include full UI-safe title, reason, and choice descriptions", () => {
  withTempRoot((root) => {
    const state = recordNextStepHandoffQuestion(root, {
      phase: "plan-review",
      artifactPath: ".supervibe/artifacts/plans/example.md",
      locale: "en",
      handoffId: "handoff-ui-payload-example",
    });

    assert.match(state.question.title, /Atomize/);
    assert.match(state.question.reason, /reviewed plan/i);
    assert.match(state.question.prompt, /Step 1\/1/);
    assert.deepEqual(state.question.choices, state.choices);
    for (const choice of state.question.choices) {
      assert.ok(choice.id, "choice must have a stable id");
      assert.ok(choice.label.length > 0 && choice.label.length <= 96, "choice label must fit compact UI");
      assert.ok(choice.description.length > 0, "choice must explain the impact to the user");
    }
  });
});

test("workflow router exposes normalized question payload for CLI and UI consumers", () => {
  const route = routeWorkflowIntent({
    userPhrase: "continue",
    lastCompletedPhase: "plan-review",
    artifacts: {
      planReviewPassed: true,
      planPath: ".supervibe/artifacts/plans/example.md",
    },
  });

  assert.ok(route.questionPayload);
  assert.equal(route.questionPayload.title, route.questionTitle);
  assert.equal(route.questionPayload.reason, route.questionReason);
  assert.equal(route.questionPayload.prompt, route.nextQuestion);
  assert.deepEqual(route.questionPayload.choices, route.questionChoices);
  assert.ok(route.questionPayload.choices.length > 0);
  for (const choice of route.questionPayload.choices) {
    assert.ok(choice.label.length > 0 && choice.label.length <= 96);
    assert.ok(choice.description.length > 0);
  }
});

test("plan-review handoff fixtures cover every user-visible gate shape", () => {
  const fixture = JSON.parse(readFileSync(HANDOFF_FIXTURE, "utf8"));
  const cases = Array.isArray(fixture.cases) ? fixture.cases : [];
  const requiredIds = ["plan-scope", "plan-review", "atomization", "execution", "inspect-readiness"];

  assert.equal(fixture.schemaVersion, 1);
  assert.deepEqual([...new Set(cases.map((item) => item.id))].sort(), requiredIds.sort());

  for (const item of cases) {
    assert.equal(item.runtimeStateRequired, true, `${item.id} must require runtime state`);
    assert.ok(item.stage, `${item.id} must name the workflow stage`);
    assert.ok(item.question?.title, `${item.id} must have a title`);
    assert.ok(item.question?.prompt, `${item.id} must have a prompt`);
    assert.ok(item.question?.reason, `${item.id} must explain the reason`);
    assert.ok(Array.isArray(item.choices) && item.choices.length >= 2, `${item.id} must have user choices`);
    for (const choice of item.choices) {
      assert.ok(choice.id, `${item.id} choice must have id`);
      assert.ok(choice.label.length > 0 && choice.label.length <= 96, `${item.id} choice label must fit UI`);
      assert.ok(choice.description, `${item.id} choice must describe impact`);
    }
  }
});

test("active workflow answer binding stores receipt trace and rejects silent re-answer", () => {
  withTempRoot((root) => {
    recordNextStepHandoffQuestion(root, {
      phase: "plan-review",
      artifactPath: ".supervibe/artifacts/plans/example.md",
      locale: "en",
      handoffId: "handoff-plan-review-answer",
    });

    const answered = recordActiveWorkflowAcceptedAnswer(root, "continue-supervibe-artifacts-plans-example-md", {
      actor: "user",
      answeredAt: "2026-05-12T20:10:00.000Z",
      receiptId: "workflow-user-answer-1",
      receiptPath: ".supervibe/artifacts/_workflow-invocations/supervibe-loop/user-answer.json",
    }, {
      requireReceipt: true,
    });

    assert.equal(answered.acceptedAnswer.choiceId, "continue-supervibe-artifacts-plans-example-md");
    assert.equal(answered.acceptedAnswer.actor, "user");
    assert.equal(answered.acceptedAnswer.answeredAt, "2026-05-12T20:10:00.000Z");
    assert.equal(answered.acceptedAnswer.receiptId, "workflow-user-answer-1");
    assert.ok(answered.receipts.some((receipt) => receipt.id === "workflow-user-answer-1"));
    assert.throws(
      () => recordActiveWorkflowAcceptedAnswer(root, "inspect-readiness-for-supervibe-artifacts-plans-example-md", {
        actor: "user",
        receiptId: "workflow-user-answer-2",
      }, {
        requireReceipt: true,
      }),
      /already answered/,
    );

    const superseded = recordActiveWorkflowAcceptedAnswer(root, "inspect-readiness-for-supervibe-artifacts-plans-example-md", {
      actor: "user",
      answeredAt: "2026-05-12T20:11:00.000Z",
      receiptId: "workflow-user-answer-2",
    }, {
      requireReceipt: true,
      supersede: true,
    });

    assert.equal(superseded.acceptedAnswer.choiceId, "inspect-readiness-for-supervibe-artifacts-plans-example-md");
    assert.equal(superseded.acceptedAnswer.supersedes.receiptId, "workflow-user-answer-1");
    assert.ok(superseded.receipts.some((receipt) => receipt.id === "workflow-user-answer-2"));
  });
});

test("validator rejects active doc-only handoff without runtime question", () => {
  withTempRoot((root) => {
    recordNextStepHandoffQuestion(root, {
      phase: "plan-review",
      artifactPath: ".supervibe/artifacts/plans/example.md",
      locale: "en",
      handoffId: "handoff-runtime-question",
    });
    const valid = validateMultistageUserGates(root);
    assert.equal(valid.issues.some((issue) => issue.code === "active-handoff-question-missing"), false);

    const statePath = join(root, ".supervibe", "memory", "active-workflow.json");
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    state.question = null;
    state.activeQuestion = null;
    state.choices = [];
    state.acceptedAnswer = null;
    state.nextAction = "answer active workflow question";
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");

    const invalid = validateMultistageUserGates(root);
    const issue = invalid.issues.find((item) => item.code === "active-handoff-question-missing");
    assert.ok(issue);
    assert.match(issue.message, /no runtime question/i);
    assert.match(issue.message, /reissuing the question/i);
  });
});
