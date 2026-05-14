import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  ACTIVE_WORKFLOW_STATE_SCHEMA,
  activeWorkflowStateToWorkflow,
  archiveActiveWorkflowState,
  buildActiveWorkflowResumeInfo,
  clearActiveWorkflowState,
  normalizeActiveWorkflowState,
  readCurrentActiveWorkflowState,
  recordActiveWorkflowAcceptedAnswer,
  recordActiveWorkflowQuestion,
  recordActiveWorkflowStage,
  upsertActiveWorkflowState,
  validateActiveWorkflowStateDocument,
} from "../scripts/lib/supervibe-active-workflow-state.mjs";
import {
  validateActiveWorkflows,
} from "../scripts/validate-active-workflows.mjs";

const ROOT = process.cwd();

function validState(overrides = {}) {
  return {
    schemaVersion: ACTIVE_WORKFLOW_STATE_SCHEMA.schemaVersion,
    command: "/supervibe-plan",
    stage: "execution-ready",
    question: {
      id: "scope",
      prompt: "Choose implementation scope",
      resumeCursor: "question:scope",
    },
    choices: [
      { id: "narrow", label: "Narrow" },
      { id: "full", label: "Full" },
    ],
    acceptedAnswer: {
      choiceId: "narrow",
    },
    artifacts: [
      { id: "plan", path: ".supervibe/artifacts/plans/example.md" },
    ],
    receipts: [
      { id: "receipt-1", path: ".supervibe/artifacts/_workflow-invocations/example.json" },
    ],
    nextAction: "atomize approved plan into work items",
    ...overrides,
  };
}

function codes(result) {
  return new Set(result.issues.map((issue) => issue.code));
}

function withTempRoot(fn) {
  const root = mkdtempSync(join(tmpdir(), "supervibe-active-state-"));
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("active workflow state helper accepts a valid state", () => {
  const result = validateActiveWorkflowStateDocument(validState(), {
    file: ".supervibe/memory/active-workflow.json",
  });
  const normalized = normalizeActiveWorkflowState(validState({
    command: "supervibe-plan",
    nextCommand: "supervibe-loop",
    nextAction: undefined,
  }));

  assert.equal(result.pass, true);
  assert.deepEqual(result.issues, []);
  assert.equal(normalized.command, "/supervibe-plan");
  assert.equal(normalized.nextCommand, "/supervibe-loop");
});

test("active workflow state helper reports missing required fields", () => {
  const state = validState();
  delete state.command;

  const result = validateActiveWorkflowStateDocument(state);

  assert.equal(result.pass, false);
  assert.ok(codes(result).has("active-workflow-state-command-missing"));
});

test("active workflow state helper reports invalid stage", () => {
  const result = validateActiveWorkflowStateDocument(validState({
    stage: "almost-ready",
  }));

  assert.equal(result.pass, false);
  assert.ok(codes(result).has("active-workflow-state-stage-invalid"));
});

test("active workflow state helper reports invalid question and choices", () => {
  const result = validateActiveWorkflowStateDocument(validState({
    question: "Choose implementation scope",
    choices: [
      { id: "narrow" },
    ],
  }));

  assert.equal(result.pass, false);
  assert.ok(codes(result).has("active-workflow-state-question-invalid"));
  assert.ok(codes(result).has("active-workflow-state-choice-invalid"));
});

test("active workflow state helper reports malformed choices with accepted answer without throwing", () => {
  let result;

  assert.doesNotThrow(() => {
    result = validateActiveWorkflowStateDocument(validState({
      choices: [null],
      acceptedAnswer: {
        choiceId: "missing",
      },
    }));
  });

  assert.equal(result.pass, false);
  assert.ok(codes(result).has("active-workflow-state-choice-invalid"));
  assert.ok(codes(result).has("active-workflow-state-accepted-answer-choice"));
});

test("active workflow state helper reports invalid artifacts and receipts", () => {
  const result = validateActiveWorkflowStateDocument(validState({
    artifacts: [
      { id: "plan" },
    ],
    receipts: [
      {},
    ],
  }));

  assert.equal(result.pass, false);
  assert.ok(codes(result).has("active-workflow-state-artifact-invalid"));
  assert.ok(codes(result).has("active-workflow-state-receipt-invalid"));
});

test("active workflow validator fails strict mode when no state exists", () => {
  withTempRoot((root) => {
    const result = validateActiveWorkflows(root, {
      pluginRoot: ROOT,
      strict: true,
    });

    assert.equal(result.pass, false);
    assert.equal(result.status, "blocked");
    assert.ok(result.issues.some((issue) => issue.code === "active-workflow-state-missing"));
  });
});

test("active workflow validator reports malformed active workflow JSON", () => {
  withTempRoot((root) => {
    const stateDir = join(root, ".supervibe", "memory");
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(join(stateDir, "active-workflow.json"), "{ invalid", "utf8");

    const result = validateActiveWorkflows(root, {
      pluginRoot: ROOT,
    });

    assert.equal(result.pass, false);
    assert.equal(result.status, "blocked");
    assert.equal(result.activeWorkflows, 0);
    assert.ok(result.issues.some((issue) => issue.code === "active-workflow-state-invalid-json"));
    assert.ok(result.warnings.some((warning) => warning.code === "active-workflow-not-started"));
  });
});

test("active workflow validator CLI reports strict no-state failure", () => {
  withTempRoot((root) => {
    const result = spawnSync(process.execPath, [
      join(ROOT, "scripts", "validate-active-workflows.mjs"),
      "--root",
      root,
      "--plugin-root",
      ROOT,
      "--strict",
    ], {
      cwd: ROOT,
      encoding: "utf8",
    });

    assert.equal(result.status, 1);
    assert.match(result.stdout, /SUPERVIBE_ACTIVE_WORKFLOWS/);
    assert.match(result.stdout, /ISSUE: active-workflow-state-missing/);
  });
});

test("active workflow validator keeps default no-state mode diagnostic", () => {
  withTempRoot((root) => {
    const result = validateActiveWorkflows(root, {
      pluginRoot: ROOT,
    });

    assert.equal(result.pass, true);
    assert.equal(result.status, "not-started");
    assert.equal(result.activeWorkflows, 0);
    assert.ok(result.warnings.some((warning) => warning.code === "active-workflow-not-started"));
  });
});

test("active workflow validator keeps legacy minimal state compatible in default mode", () => {
  withTempRoot((root) => {
    const stateDir = join(root, ".supervibe", "memory");
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(join(stateDir, "active-workflow.json"), JSON.stringify({
      command: "/supervibe-plan",
      host: "codex",
      handoffId: "legacy",
    }, null, 2), "utf8");

    const defaultResult = validateActiveWorkflows(root, {
      pluginRoot: ROOT,
    });
    const strictResult = validateActiveWorkflows(root, {
      pluginRoot: ROOT,
      strict: true,
    });
    const defaultSchemaIssues = defaultResult.issues.filter((issue) => issue.code.startsWith("active-workflow-state-"));
    const strictSchemaIssues = strictResult.issues.filter((issue) => issue.code.startsWith("active-workflow-state-"));

    assert.equal(defaultResult.activeWorkflows, 1);
    assert.deepEqual(defaultSchemaIssues, []);
    assert.ok(defaultResult.issues.some((issue) => issue.code === "active-command-agent-plan-blocked"));
    assert.ok(strictSchemaIssues.some((issue) => issue.code === "active-workflow-state-stage-missing"));
    assert.ok(strictSchemaIssues.some((issue) => issue.code === "active-workflow-state-question-missing"));
  });
});

test("active workflow validator resumes plural active state when singleton is inactive", () => {
  withTempRoot((root) => {
    const stateDir = join(root, ".supervibe", "memory");
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(join(stateDir, "active-workflow.json"), JSON.stringify(validState({
      stage: "archived",
      nextCommand: undefined,
      nextAction: "none",
    }), null, 2), "utf8");
    writeFileSync(join(stateDir, "active-workflows.json"), JSON.stringify({
      activeWorkflows: [
        validState({
          command: "/supervibe-plan",
          stage: "executing",
          nextCommand: "/supervibe-loop",
          nextAction: "continue active execution from plural file",
        }),
      ],
    }, null, 2), "utf8");

    const result = validateActiveWorkflows(root, {
      pluginRoot: ROOT,
    });

    assert.equal(result.activeWorkflows, 1);
    assert.equal(result.resume.canResume, true);
    assert.equal(result.resume.nextCommand, "/supervibe-loop");
    assert.equal(result.resume.nextAction, "continue active execution from plural file");
  });
});

test("active workflow state to workflow preserves normalized stage aliases", () => {
  const workflow = activeWorkflowStateToWorkflow({
    command: "supervibe-plan",
    stage: "execute",
  });

  assert.equal(workflow.command, "/supervibe-plan");
  assert.equal(workflow.stage, "executing");
});

test("active workflow persistence writes and reads current state", () => {
  withTempRoot((root) => {
    const written = upsertActiveWorkflowState(root, validState({
      stage: "plan-draft",
      nextCommand: "/supervibe-plan",
      nextAction: undefined,
    }));
    const current = readCurrentActiveWorkflowState(root);

    assert.equal(written.stage, "plan-draft");
    assert.equal(current.exists, true);
    assert.equal(current.pass, true);
    assert.equal(current.state.command, "/supervibe-plan");
    assert.equal(current.state.nextCommand, "/supervibe-plan");
  });
});

test("active workflow persistence updates stage with workflow aliases", () => {
  withTempRoot((root) => {
    upsertActiveWorkflowState(root, validState());

    const expected = [
      ["plan", "plan-draft"],
      ["review", "review"],
      ["review-plan", "plan-review"],
      ["atomize", "work-item-atomization"],
      ["execute", "executing"],
      ["verify", "verification"],
      ["ship", "ship"],
      ["archive", "archived"],
      ["resume", "resume"],
    ];
    for (const [alias, stage] of expected) {
      assert.equal(recordActiveWorkflowStage(root, alias).stage, stage);
    }
    const ui = recordActiveWorkflowStage(root, "UI", {
      nextCommand: "/supervibe-ui",
      nextAction: undefined,
    });

    assert.equal(ui.stage, "ui");
    assert.equal(ui.nextCommand, "/supervibe-ui");
  });
});

test("active workflow persistence records current question and accepted answer", () => {
  withTempRoot((root) => {
    upsertActiveWorkflowState(root, validState({
      question: null,
      choices: [],
      acceptedAnswer: null,
    }));

    const questioned = recordActiveWorkflowQuestion(root, {
      id: "review",
      prompt: "Approve the reviewed plan?",
    }, {
      choices: [
        { id: "approve", label: "Approve" },
        { id: "revise", label: "Revise" },
      ],
    });
    const answered = recordActiveWorkflowAcceptedAnswer(root, {
      choiceId: "approve",
      note: "Reviewed plan accepted",
    });

    assert.equal(questioned.acceptedAnswer, null);
    assert.equal(questioned.choices.length, 2);
    assert.equal(answered.acceptedAnswer.choiceId, "approve");
  });
});

test("active workflow persistence archives and clears completed state", () => {
  withTempRoot((root) => {
    upsertActiveWorkflowState(root, validState({
      stage: "verification",
    }));

    const archived = archiveActiveWorkflowState(root);
    const current = readCurrentActiveWorkflowState(root);

    assert.equal(archived.archived, true);
    assert.equal(archived.cleared, true);
    assert.equal(archived.state.stage, "archived");
    assert.equal(current.exists, false);
  });
});

test("active workflow persistence clear is compatible with missing state", () => {
  withTempRoot((root) => {
    const cleared = clearActiveWorkflowState(root);
    const current = readCurrentActiveWorkflowState(root);

    assert.equal(cleared.cleared, false);
    assert.equal(current.exists, false);
  });
});

test("active workflow resume info prefers explicit next command and falls back by stage", () => {
  const explicit = buildActiveWorkflowResumeInfo(validState({
    stage: "executing",
    nextCommand: "/supervibe-loop",
    nextAction: undefined,
  }));
  const fallback = buildActiveWorkflowResumeInfo(validState({
    stage: "verification",
    nextCommand: undefined,
    nextAction: undefined,
  }));
  const missing = buildActiveWorkflowResumeInfo(null);

  assert.equal(explicit.canResume, true);
  assert.equal(explicit.nextCommand, "/supervibe-loop");
  assert.equal(fallback.nextCommand, "/supervibe-verify");
  assert.equal(fallback.nextAction, "run workflow verification");
  assert.equal(missing.canResume, false);
  assert.equal(missing.nextAction, "none");
});

test("active workflow resume info restores current question, choices, history, cursor, blockers, summaries, and artifacts", () => {
  withTempRoot((root) => {
    const summaryStages = [
      "brainstorm",
      "spec-approval",
      "plan-approval",
      "loop-completion",
      "verify",
      "review",
      "ship",
    ];
    const summaries = summaryStages.flatMap((stage) => [
      {
        id: `summary-${stage}-pre`,
        stage,
        kind: "pre-action",
        summary: `${stage} pre-action summary.`,
        createdAt: "2026-05-14T00:00:00.000Z",
      },
      {
        id: `summary-${stage}-post`,
        stage,
        kind: "post-artifact",
        summary: `${stage} post-artifact summary.`,
        createdAt: "2026-05-14T00:00:00.000Z",
        artifactIds: ["plan"],
      },
    ]);
    const written = upsertActiveWorkflowState(root, validState({
      stage: "review",
      question: {
        id: "approve-plan",
        prompt: "Approve the reviewed plan?",
        resumeCursor: "question:approve-plan",
      },
      choices: [
        { id: "approve", label: "Approve" },
        { id: "revise", label: "Revise" },
      ],
      acceptedAnswer: null,
      answerHistory: [
        {
          questionId: "approve-plan",
          choiceId: "revise",
          actor: "user",
          answeredAt: "2026-05-14T00:00:00.000Z",
        },
      ],
      resumeCursor: "question:approve-plan",
      blockedDecision: {
        id: "decision-review",
        reason: "waiting for approval",
      },
      nextCommand: "/supervibe-loop",
      summaries,
      artifactManifest: {
        id: "artifact-manifest-1",
        artifacts: [
          {
            id: "plan",
            path: ".supervibe/artifacts/plans/example.md",
            hash: "sha256:abc123",
          },
        ],
      },
    }));
    const current = readCurrentActiveWorkflowState(root);
    const resume = buildActiveWorkflowResumeInfo(current.state);

    assert.equal(written.summaries.length, 14);
    assert.equal(resume.hasPendingQuestion, true);
    assert.equal(resume.question.resumeCursor, "question:approve-plan");
    assert.deepEqual(resume.choices.map((choice) => choice.id), ["approve", "revise"]);
    assert.equal(resume.answerHistory[0].choiceId, "revise");
    assert.equal(resume.resumeCursor, "question:approve-plan");
    assert.equal(resume.blockedDecision.id, "decision-review");
    assert.equal(resume.nextCommand, "/supervibe-loop");
    assert.equal(resume.summaries.length, 14);
    assert.equal(resume.artifactManifest.artifacts[0].hash, "sha256:abc123");
  });
});

test("active workflow validation fails question records without resume cursors", () => {
  const result = validateActiveWorkflowStateDocument(validState({
    question: {
      id: "approve-plan",
      prompt: "Approve the reviewed plan?",
    },
    choices: [{ id: "approve", label: "Approve" }],
    acceptedAnswer: null,
  }));

  assert.equal(result.pass, false);
  assert.ok(codes(result).has("question-record-resume-cursor-missing"));
});


test("active workflow production review resumes through review command", () => {
  const resume = buildActiveWorkflowResumeInfo(validState({
    stage: "review",
    nextCommand: undefined,
    nextAction: undefined,
  }));

  assert.equal(resume.stage, "review");
  assert.equal(resume.nextCommand, "/supervibe-review");
  assert.equal(resume.nextAction, "run workflow review");
});

test("active workflow release-ready resumes through ship command", () => {
  const resume = buildActiveWorkflowResumeInfo(validState({
    stage: "release-ready",
    nextCommand: undefined,
    nextAction: undefined,
  }));

  assert.equal(resume.nextCommand, "/supervibe-ship");
  assert.equal(resume.nextAction, "run release ship readiness");
});
