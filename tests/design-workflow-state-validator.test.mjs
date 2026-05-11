import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

const ROOT = process.cwd();

import {
  validateDesignWorkflowState,
} from "../scripts/validate-design-workflow-state.mjs";
import {
  syncApprovedPrototypeState,
} from "../scripts/lib/design-workflow-state-sync.mjs";
import {
  issueWorkflowInvocationReceipt,
} from "../scripts/lib/supervibe-workflow-receipt-runtime.mjs";

async function writeUtf8(root, relPath, content) {
  const absPath = join(root, ...relPath.split("/"));
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, content, "utf8");
}

async function readJson(root, relPath) {
  return JSON.parse(await readFile(join(root, ...relPath.split("/")), "utf8"));
}

async function writeAgentInvocation(root, {
  invocationId,
  agentId,
  taskSummary,
  ts = "2026-05-06T00:00:00.000Z",
  confidenceScore = 9.5,
}) {
  const absPath = join(root, ".supervibe", "memory", "agent-invocations.jsonl");
  await mkdir(dirname(absPath), { recursive: true });
  await appendFile(absPath, `${JSON.stringify({
    schemaVersion: 1,
    invocation_id: invocationId,
    ts,
    agent_id: agentId,
    task_summary: taskSummary,
    confidence_score: confidenceScore,
  })}\n`, "utf8");
  return {
    source: "agent-invocations-jsonl",
    invocationId,
  };
}

async function issueDesignReceipt(root, {
  subjectType,
  subjectId,
  stage,
  outputArtifacts,
  invocationReason,
  handoffId = "agent-chat",
}) {
  const isHostAgent = ["agent", "worker", "reviewer"].includes(subjectType);
  const hostInvocation = isHostAgent
    ? await writeAgentInvocation(root, {
        invocationId: `${subjectId}-${stage}-invocation`,
        agentId: subjectId,
        taskSummary: invocationReason,
      })
    : null;
  await issueWorkflowInvocationReceipt({
    rootDir: root,
    command: "/supervibe-design",
    subjectType,
    subjectId,
    agentId: isHostAgent ? subjectId : null,
    skillId: subjectType === "skill" ? subjectId : null,
    stage,
    invocationReason,
    inputEvidence: [outputArtifacts[0]],
    outputArtifacts,
    startedAt: "2026-05-06T00:00:00.000Z",
    completedAt: "2026-05-06T00:01:00.000Z",
    handoffId,
    ...(hostInvocation ? { hostInvocation } : {}),
  });
}

test("design workflow state validator fails when config says no prototype but index exists", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-state-validator-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/prototypes/_design-system/design-flow-state.json", `${JSON.stringify({
      design_system: { status: "approved", approved_sections: [] },
      prototype: { requested: "ALLOWED" },
    }, null, 2)}\n`);
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/config.json", `${JSON.stringify({
      mode: "design-system-only",
      prototypeExists: false,
    }, null, 2)}\n`);
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/spec.md", "# Spec\n");
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/content/copy.md", "# Copy\n");
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/index.html", "<!doctype html><title>Prototype</title>\n");

    const result = validateDesignWorkflowState(root);

    assert.equal(result.pass, false);
    assert.ok(result.issues.some((issue) => issue.code === "config-prototype-exists-drift"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design workflow state validator CLI supports JSON output", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-state-json-"));
  try {
    const output = execFileSync(process.execPath, [
      join(ROOT, "scripts", "validate-design-workflow-state.mjs"),
      "--root",
      root,
      "--json",
    ], {
      cwd: ROOT,
      encoding: "utf8",
    });
    const parsed = JSON.parse(output);
    assert.equal(parsed.pass, true);
    assert.equal(parsed.checked, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design workflow state validator fails on wizard next-question drift", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-next-validator-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/config.json", `${JSON.stringify({
      mode: "full-prototype-pipeline",
      designWizardRuntimeStatePath: ".supervibe/memory/design-wizard/agent-chat.runtime.json",
      designWizard: {
        nextQuestionAxis: "creative_alternatives",
        runtimeStatePath: ".supervibe/memory/design-wizard/agent-chat.runtime.json",
      },
    }, null, 2)}\n`);
    await writeUtf8(root, ".supervibe/memory/design-wizard/agent-chat.runtime.json", `${JSON.stringify({
      schemaVersion: 1,
      runtimeStatus: { nextQuestionAxis: "viewport" },
      questionQueue: [{ axis: "viewport" }],
    }, null, 2)}\n`);

    const result = validateDesignWorkflowState(root);

    assert.equal(result.pass, false);
    assert.ok(result.issues.some((issue) => issue.code === "design-wizard-next-question-drift"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("approved prototype state sync repairs config, flow state, and manifest drift", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-approved-sync-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/prototypes/_design-system/manifest.json", `${JSON.stringify({
      status: "approved",
      tokensState: "final",
      target: "unknown",
      workflowState: { prototypeApproved: false, handoffBlocked: true },
    }, null, 2)}\n`);
    await writeUtf8(root, ".supervibe/artifacts/prototypes/_design-system/design-flow-state.json", `${JSON.stringify({
      designSystemApproved: false,
      prototypeUnlocked: false,
      prototypeApproved: false,
      design_system: { status: "candidate" },
      prototype: {
        requested: "BLOCKED",
        exists: false,
        status: "prototype-draft",
        handoff_blocked_reason: "handoff requires approved prototype",
      },
    }, null, 2)}\n`);
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/config.json", `${JSON.stringify({
      target: "unknown",
      themeVariant: "commerce-dossier-dark",
      designSystemStatus: "missing",
      status: "prototype-draft",
      handoffBlocked: true,
      prototypeExists: false,
      prototypeUnlocked: false,
    }, null, 2)}\n`);
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/spec.md", "# Spec\n");
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/content/copy.md", "# Copy\n");
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/index.html", "<!doctype html><title>Prototype</title>\n");
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/.approval.json", `${JSON.stringify({
      status: "approved",
    }, null, 2)}\n`);
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/_reviews/polish.md", "# Polish\n\nVerdict: PASS\n\nBlockers: none\nHigh issues: none\n");
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/_reviews/a11y.md", "# A11y\n\nVerdict: PASS\n\nBlockers: none\nHigh issues: none\n");
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/_reviews/quality-gate.json", `${JSON.stringify({
      pass: true,
      confidence: 10,
      generatedAt: "2026-05-06T00:00:00.000Z",
    }, null, 2)}\n`);
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/designer-package.json", "{}\n");
    await issueDesignReceipt(root, {
      subjectType: "skill",
      subjectId: "supervibe:brandbook",
      stage: "stage-2-design-system",
      outputArtifacts: [
        ".supervibe/artifacts/prototypes/_design-system/manifest.json",
        ".supervibe/artifacts/prototypes/_design-system/design-flow-state.json",
      ],
      invocationReason: "brandbook producer materialized approved design-system state",
    });
    await issueDesignReceipt(root, {
      subjectType: "agent",
      subjectId: "ux-ui-designer",
      stage: "stage-3-screen-spec",
      outputArtifacts: [".supervibe/artifacts/prototypes/agent-chat/spec.md"],
      invocationReason: "ux ui designer produced approved prototype screen spec",
    });
    await issueDesignReceipt(root, {
      subjectType: "agent",
      subjectId: "copywriter",
      stage: "stage-4-copy",
      outputArtifacts: [".supervibe/artifacts/prototypes/agent-chat/content/copy.md"],
      invocationReason: "copywriter finalized approved prototype microcopy",
    });
    await issueDesignReceipt(root, {
      subjectType: "agent",
      subjectId: "prototype-builder",
      stage: "stage-5-prototype-build",
      outputArtifacts: [".supervibe/artifacts/prototypes/agent-chat/index.html"],
      invocationReason: "prototype builder produced durable approved prototype",
    });
    await issueDesignReceipt(root, {
      subjectType: "reviewer",
      subjectId: "ui-polish-reviewer",
      stage: "stage-6-polish-review",
      outputArtifacts: [".supervibe/artifacts/prototypes/agent-chat/_reviews/polish.md"],
      invocationReason: "ui polish reviewer accepted approved prototype",
    });
    await issueDesignReceipt(root, {
      subjectType: "reviewer",
      subjectId: "accessibility-reviewer",
      stage: "stage-6-a11y-review",
      outputArtifacts: [".supervibe/artifacts/prototypes/agent-chat/_reviews/a11y.md"],
      invocationReason: "accessibility reviewer accepted approved prototype",
    });
    await issueDesignReceipt(root, {
      subjectType: "reviewer",
      subjectId: "quality-gate-reviewer",
      stage: "stage-7-quality-gate",
      outputArtifacts: [".supervibe/artifacts/prototypes/agent-chat/_reviews/quality-gate.json"],
      invocationReason: "quality gate reviewer verified approved prototype provenance",
    });

    const sync = await syncApprovedPrototypeState(root, {
      slug: "agent-chat",
      target: "web",
      updatedAt: "2026-05-06T00:00:00.000Z",
    });

    assert.equal(sync.pass, true);
    const config = await readJson(root, ".supervibe/artifacts/prototypes/agent-chat/config.json");
    assert.equal(config.target, "web");
    assert.equal(config.designSystemStatus, "approved");
    assert.equal(config.status, "approved");
    assert.equal(config.prototypeApproved, true);
    assert.equal(config.handoffBlocked, false);

    const flow = await readJson(root, ".supervibe/artifacts/prototypes/_design-system/design-flow-state.json");
    assert.equal(flow.designSystemApproved, true);
    assert.equal(flow.prototypeUnlocked, true);
    assert.equal(flow.prototypeApproved, true);
    assert.equal(flow.prototype.status, "approved");
    assert.equal(flow.prototype.handoff_blocked_reason, null);

    const manifest = await readJson(root, ".supervibe/artifacts/prototypes/_design-system/manifest.json");
    assert.equal(manifest.target, "web");
    assert.equal(manifest.approvedVariant, "commerce-dossier-dark");
    assert.equal(manifest.workflowState.prototypeApproved, true);
    assert.equal(manifest.workflowState.handoffBlocked, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
