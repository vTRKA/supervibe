import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  readDesignWizardRuntimeState,
} from "../scripts/lib/design-wizard-runtime-state.mjs";
import {
  buildSpecialistQuestionProposal,
} from "../scripts/lib/specialist-question-contract.mjs";

const ROOT = process.cwd();

async function writeUtf8(root, relPath, content) {
  const absPath = join(root, ...relPath.split("/"));
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, content, "utf8");
}

async function readJson(root, relPath) {
  return JSON.parse(await readFile(join(root, ...relPath.split("/")), "utf8"));
}

test("design-wizard-answer records a single user answer without manual config patching", async () => {
  const root = await mkdtemp(join(tmpdir(), "design-wizard-answer-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/config.json", `${JSON.stringify({
      brief: "Agent chat workspace with approvals and trace review.",
      target: "tauri",
      mode: "full-prototype-pipeline",
      designWizard: {
        decisions: {
          viewport: { axis: "viewport", answer: "1440x900", choiceId: "custom", source: "user" },
        },
      },
    }, null, 2)}\n`);

    const output = execFileSync(process.execPath, [
      join(ROOT, "scripts", "design-wizard-answer.mjs"),
      "--root",
      root,
      "--slug",
      "agent-chat",
      "--axis",
      "information_density",
      "--choice",
      "compact",
      "--source",
      "user",
      "--timestamp",
      "2026-05-04T00:00:00.000Z",
    ], {
      cwd: ROOT,
      encoding: "utf8",
    });
    const config = await readJson(root, ".supervibe/artifacts/prototypes/agent-chat/config.json");
    const runtime = readDesignWizardRuntimeState(root, config);

    assert.match(output, /SUPERVIBE_DESIGN_WIZARD_ANSWER/);
    assert.match(output, /RUNTIME_STATE: \.supervibe\/memory\/design-wizard\/agent-chat\.runtime\.json/);
    assert.match(output, /AXES_UPDATED: information_density/);
    assert.equal(config.designWizard.storage, "external-runtime-state");
    assert.equal(config.designWizard.runtimeStatePath, ".supervibe/memory/design-wizard/agent-chat.runtime.json");
    assert.equal(config.designWizard.decisions.information_density.choiceId, "compact");
    assert.equal(config.designWizard.decisions.information_density.source, "user");
    assert.ok(!config.designWizard.questionQueue);
    assert.ok(!runtime.questionQueue.some((question) => question.axis === "information_density"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design-wizard-answer accepts trusted specialist proposal choice ids from runtime state", async () => {
  const root = await mkdtemp(join(tmpdir(), "design-wizard-answer-trusted-proposal-"));
  try {
    const brief = "\u043b\u0435\u043d\u0434\u0438\u043d\u0433 \u044e\u0440\u0438\u0434\u0438\u0447\u0435\u0441\u043a\u043e\u0433\u043e \u0441\u0430\u0439\u0442\u0430";
    const runtimeStatePath = ".supervibe/memory/design-wizard/legal.runtime.json";
    const proposal = buildSpecialistQuestionProposal({
      proposalId: "stage-1-brand-direction:creative-director:audience_trust_posture",
      axis: "audience_trust_posture",
      stage: "stage-1-brand-direction",
      specialist: "creative-director",
      ownerAgent: "creative-director",
      question: "Which legal trust posture should lead the first viewport before visual direction locks?",
      why: "The answer changes direction.md, legal assurance cues, and claim-risk copy before tokens are written.",
      whyNow: "The legal landing brief needs authority and restraint before palette, type, and proof sections are generated.",
      choices: [
        { id: "boutique-strategic-precision", label: "Boutique strategic precision", tradeoff: "Signals senior legal judgment without fear-based claims.", unlocks: ["direction.md"], risk: "May feel too reserved for broad lead-gen.", evidence: ["legal landing brief", "regulated trust signal"], artifactImpact: "legal trust posture", recommended: true },
        { id: "institutional-assurance", label: "Institutional assurance", tradeoff: "Maximizes formal authority for high-stakes matters.", unlocks: ["direction.md"], risk: "Can feel generic if proof is thin.", evidence: ["legal services domain", "trust requirement"], artifactImpact: "assurance hierarchy" },
        { id: "client-advocacy-clarity", label: "Client advocacy clarity", tradeoff: "Makes the page approachable while preserving professional restraint.", unlocks: ["copy tone"], risk: "Can under-signal expertise for complex cases.", evidence: ["landing flow", "legal copy risk"], artifactImpact: "copy tone and CTA proof" },
      ],
      blocks: ["direction.md", "copy tone", "assurance cues"],
      artifactImpact: "direction.md trust posture, assurance cues, and copy tone",
      skipDefault: "Stop and regenerate a legal-specific specialist proposal if none fit.",
      canAnswerFromEvidence: false,
      evidence: ["legal landing brief", "regulated trust signal"],
      decisionUnlocked: "direction.md trust posture and legal assurance cue strategy",
      currentContext: "legal services landing page with regulated trust and brand launch signals",
      producer: {
        type: "agent",
        id: "creative-director",
        stageId: "stage-1-brand-direction",
        receiptTrusted: true,
        receiptPresent: true,
        hostInvocation: {
          source: "agent-invocations-jsonl",
          invocationId: "creative-director-legal-1",
        },
      },
      proposalSource: "real-specialist-proposal",
    });
    await writeUtf8(root, ".supervibe/artifacts/prototypes/legal/config.json", `${JSON.stringify({
      brief,
      target: "unknown",
      mode: "full-prototype-pipeline",
      designWizardRuntimeStatePath: runtimeStatePath,
    }, null, 2)}\n`);
    await writeUtf8(root, runtimeStatePath, `${JSON.stringify({
      schemaVersion: 1,
      questionProposals: [proposal],
    }, null, 2)}\n`);

    const output = execFileSync(process.execPath, [
      join(ROOT, "scripts", "design-wizard-answer.mjs"),
      "--root",
      root,
      "--slug",
      "legal",
      "--axis",
      "audience_trust_posture",
      "--choice",
      "boutique-strategic-precision",
      "--timestamp",
      "2026-05-04T00:00:00.000Z",
    ], {
      cwd: ROOT,
      encoding: "utf8",
    });
    const config = await readJson(root, ".supervibe/artifacts/prototypes/legal/config.json");
    const runtime = readDesignWizardRuntimeState(root, config);

    assert.match(output, /AXES_UPDATED: audience_trust_posture/);
    assert.equal(config.target, "web");
    assert.equal(config.flowType, "landing");
    assert.equal(config.designWizard.locale, "ru");
    assert.equal(config.designWizard.decisions.audience_trust_posture.choiceId, "boutique-strategic-precision");
    assert.equal(config.designWizard.decisions.audience_trust_posture.answer, "Boutique strategic precision");
    assert.ok(!runtime.questionQueue.some((question) => question.axis === "audience_trust_posture"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design-wizard-answer can delegate remaining recommendations while keeping review gate closed", async () => {
  const root = await mkdtemp(join(tmpdir(), "design-wizard-answer-delegate-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/config.json", `${JSON.stringify({
      brief: "Agent chat workspace with approvals, tool calls, subagents, and trace review.",
      target: "tauri",
      mode: "full-prototype-pipeline",
      designWizard: {
        decisions: {
          viewport: { axis: "viewport", answer: "1440x900", choiceId: "custom", source: "user" },
        },
      },
    }, null, 2)}\n`);

    const output = execFileSync(process.execPath, [
      join(ROOT, "scripts", "design-wizard-answer.mjs"),
      "--root",
      root,
      "--slug",
      "agent-chat",
      "--delegate-safe-defaults",
      "--timestamp",
      "2026-05-04T00:00:00.000Z",
    ], {
      cwd: ROOT,
      encoding: "utf8",
    });
    const config = await readJson(root, ".supervibe/artifacts/prototypes/agent-chat/config.json");
    const runtime = readDesignWizardRuntimeState(root, config);

    assert.match(output, /SOURCE: delegated-to-agent/);
    assert.match(output, /DELEGATED_REVIEW_REQUIRED: true/);
    assert.equal(config.designWizard.gates.delegatedReviewRequired, true);
    assert.equal(config.designWizard.gates.tokensUnlocked, false);
    assert.ok(config.designWizard.coverage.delegatedAxes.length >= 3);
    assert.ok(Object.values(config.designWizard.decisions).some((decision) => decision.source === "delegated-to-agent"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design-wizard-answer accepts --answer alias for viewport values and closes the viewport gate", async () => {
  const root = await mkdtemp(join(tmpdir(), "design-wizard-answer-viewport-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/config.json", `${JSON.stringify({
      brief: "Tauri desktop app",
      target: "tauri",
      mode: "full-prototype-pipeline",
    }, null, 2)}\n`);

    const output = execFileSync(process.execPath, [
      join(ROOT, "scripts", "design-wizard-answer.mjs"),
      "--root",
      root,
      "--slug",
      "agent-chat",
      "--axis",
      "viewport",
      "--answer",
      "1920x1080",
      "--timestamp",
      "2026-05-04T00:00:00.000Z",
    ], {
      cwd: ROOT,
      encoding: "utf8",
    });
    const config = await readJson(root, ".supervibe/artifacts/prototypes/agent-chat/config.json");
    const runtime = readDesignWizardRuntimeState(root, config);

    assert.match(output, /CONFIG_REVISION: 1/);
    assert.match(output, /AXES_UPDATED: viewport/);
    assert.equal(config.configRevision, 1);
    assert.equal(config.designWizard.decisions.viewport.answer, "1920x1080");
    assert.equal(config.designWizard.decisions.viewport.choiceId, "wide-desktop");
    assert.equal(config.designWizard.gates.viewportPolicyRecorded, true);
    assert.ok(!config.designWizard.questionQueue);
    assert.ok(!runtime.questionQueue.some((question) => question.axis === "viewport"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design-wizard-answer rejects concurrent writes for the same slug unless explicitly waiting", async () => {
  const root = await mkdtemp(join(tmpdir(), "design-wizard-answer-lock-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/config.json", `${JSON.stringify({
      brief: "Agent chat workspace with approvals and trace review.",
      target: "tauri",
      mode: "full-prototype-pipeline",
    }, null, 2)}\n`);
    await writeUtf8(root, ".supervibe/memory/locks/design-wizard/agent-chat.lock", `${JSON.stringify({
      pid: 12345,
      slug: "agent-chat",
      startedAt: new Date().toISOString(),
    })}\n`);

    assert.throws(() => execFileSync(process.execPath, [
      join(ROOT, "scripts", "design-wizard-answer.mjs"),
      "--root",
      root,
      "--slug",
      "agent-chat",
      "--axis",
      "information_density",
      "--choice",
      "compact",
    ], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: "pipe",
    }), /wizard state is already locked/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design-wizard-answer fails fast on unknown args and stale config revisions", async () => {
  const root = await mkdtemp(join(tmpdir(), "design-wizard-answer-revision-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/config.json", `${JSON.stringify({
      brief: "Agent chat workspace with approvals and trace review.",
      target: "tauri",
      mode: "full-prototype-pipeline",
      configRevision: 3,
      designWizard: {
        decisions: {
          viewport: { axis: "viewport", answer: "1440x900", choiceId: "custom", source: "user" },
        },
      },
    }, null, 2)}\n`);

    assert.throws(() => execFileSync(process.execPath, [
      join(ROOT, "scripts", "design-wizard-answer.mjs"),
      "--root",
      root,
      "--slug",
      "agent-chat",
      "--axis",
      "information_density",
      "--unknown",
      "value",
    ], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: "pipe",
    }), /Unknown argument: --unknown/);

    assert.throws(() => execFileSync(process.execPath, [
      join(ROOT, "scripts", "design-wizard-answer.mjs"),
      "--root",
      root,
      "--slug",
      "agent-chat",
      "--axis",
      "information_density",
      "--choice",
      "compact",
      "--expected-revision",
      "2",
    ], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: "pipe",
    }), /config revision mismatch: expected 2, got 3/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
