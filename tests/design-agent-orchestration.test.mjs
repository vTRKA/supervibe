import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  assertDesignWriteAllowed,
  buildDesignAgentPlan,
  buildDesignWriteGate,
  formatDesignPlanPrompt,
  validateDesignAgentInvocationReceipts,
} from "../scripts/lib/design-agent-orchestration.mjs";
import {
  issueWorkflowInvocationReceipt,
} from "../scripts/lib/supervibe-workflow-receipt-runtime.mjs";

async function writeUtf8(root, relPath, content) {
  const absPath = join(root, ...relPath.split("/"));
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, content, "utf8");
}

async function writeAgentInvocation(root, {
  invocationId = "agent-invocation-1",
  agentId = "creative-director",
  taskSummary = "brand direction required",
  ts = "2026-05-03T00:00:30.000Z",
  confidenceScore = 9.5,
} = {}) {
  await writeUtf8(root, ".supervibe/memory/agent-invocations.jsonl", `${JSON.stringify({
    schemaVersion: 1,
    invocation_id: invocationId,
    ts,
    agent_id: agentId,
    task_summary: taskSummary,
    confidence_score: confidenceScore,
  })}\n`);
  return {
    source: "agent-invocations-jsonl",
    invocationId,
  };
}

test("design agent plan maps source types and stages to explicit agents and skills", () => {
  const plan = buildDesignAgentPlan({
    brief: "new desktop agent chat app with website and pdf references",
    target: "desktop-app",
    referenceSources: [
      { kind: "website", value: "https://example.com" },
      { kind: "pdf", value: "C:\\refs\\brand.pdf" },
    ],
    flowType: "in-product",
  });

  assert.equal(plan.requiresReceipts, true);
  assert.equal(plan.receiptDirectory, ".supervibe/artifacts/_workflow-invocations/supervibe-design/<handoff-id>/");
  assert.equal(plan.executionStatus.executionMode, "real-agents");
  assert.equal(plan.executionStatus.missingAgents.length, 0);
  assert.ok(plan.wizard.questionQueue.some((question) => question.axis === "mode"));
  assert.ok(plan.wizard.questionQueue.some((question) => question.axis === "viewport"));
  assert.equal(plan.viewportPolicy.requiresActualWindowQuestion, true);
  assert.ok(plan.stages.some((stage) => stage.agentId === "creative-director"));
  assert.ok(plan.stages.some((stage) => stage.skillId === "supervibe:brandbook"));
  assert.ok(plan.stages.some((stage) => stage.agentId === "ux-ui-designer"));
  assert.ok(plan.stages.some((stage) => stage.agentId === "prototype-builder"));
  assert.ok(plan.stages.some((stage) => stage.skillId === "supervibe:mcp-discovery" && stage.reason.includes("website")));
  assert.ok(plan.stages.some((stage) => stage.skillId === "supervibe:design-intelligence" && stage.reason.includes("pdf")));

  const prompt = formatDesignPlanPrompt(plan);
  assert.match(prompt, /NEXT_WIZARD_QUESTION/);
  assert.match(prompt, /Step 1\//);
});

test("design write gate blocks durable artifacts when wizard or agent questions are open", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-write-gate-"));
  try {
    const plan = buildDesignAgentPlan({
      brief: "New Tauri design. Use graphite cyan only.",
      target: "tauri",
      rootDir: root,
      intake: { needsQuestion: false },
    });

    assert.equal(plan.executionStatus.executionMode, "agent-required-blocked");
    assert.equal(plan.writeGate.durableWritesAllowed, false);
    assert.ok(plan.writeGate.blockedReasons.some((reason) => reason.code === "agent-required-blocked"));
    assert.ok(plan.writeGate.blockedReasons.some((reason) => reason.code === "tokens-locked"));
    assert.deepEqual(plan.writeGate.allowedWriteClasses, ["run-state", "diagnostic-scratch"]);
    assert.equal(assertDesignWriteAllowed(plan.writeGate, { writeClass: "diagnostic-scratch", artifact: "scratch" }), true);
    assert.throws(
      () => assertDesignWriteAllowed(plan.writeGate, { writeClass: "durable-design-artifacts", artifact: "tokens.css" }),
      /durable-design-artifacts write blocked/,
    );

    const prompt = formatDesignPlanPrompt(plan);
    assert.match(prompt, /WRITE_GATE: blocked/);
    assert.match(prompt, /specialist agents are unavailable/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design execution modes are explicit and non-real modes cannot claim specialist output", () => {
  const inlinePlan = buildDesignAgentPlan({
    brief: "Draft a design direction using deterministic checks only.",
    target: "web",
    rootDir: process.cwd(),
    requestedExecutionMode: "inline",
    mode: "design-system-only",
  });

  assert.equal(inlinePlan.executionStatus.executionMode, "inline");
  assert.equal(inlinePlan.executionStatus.agentReceiptsAllowed, false);
  assert.equal(inlinePlan.writeGate.durableWritesAllowed, false);
  assert.ok(inlinePlan.writeGate.blockedReasons.some((reason) => reason.code === "non-real-agent-execution-mode"));

  const hybridPlan = buildDesignAgentPlan({
    brief: "Hybrid design run with agents for final outputs.",
    target: "web",
    rootDir: process.cwd(),
    requestedExecutionMode: "hybrid",
    mode: "design-system-only",
  });

  assert.equal(hybridPlan.executionStatus.executionMode, "hybrid");
  assert.equal(hybridPlan.executionStatus.agentReceiptsAllowed, true);
  assert.equal(hybridPlan.writeGate.durableWritesAllowed, false);
  assert.match(formatDesignPlanPrompt(hybridPlan), /hybrid/i);
});

test("design write gate prioritizes intake question before wizard or artifact writes", () => {
  const intake = {
    needsQuestion: true,
    needsOldArtifactScopeQuestion: true,
    reason: "old-artifact-reference-scope-required",
    oldArtifactReferences: ["docs/old prototypes"],
    referenceSources: [],
    artifacts: [],
  };
  const plan = buildDesignAgentPlan({
    brief: "Use old prototypes.",
    target: "web",
    mode: "design-system-only",
    intake,
  });
  const gate = buildDesignWriteGate({ intake, plan });

  assert.equal(gate.durableWritesAllowed, false);
  assert.equal(gate.nextQuestion.source, "intake");
  assert.match(gate.nextQuestion.markdown, /Old artifact reference scope/);
  assert.match(formatDesignPlanPrompt(plan, { intake, writeGate: gate }), /NEXT_BLOCKING_QUESTION/);
});

test("design agent receipt validator rejects durable outputs without completed receipts", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-agent-receipts-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/brandbook/direction.md", "# Direction\n");
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/spec.md", "# Spec\n");

    const result = validateDesignAgentInvocationReceipts(root);

    assert.equal(result.pass, false);
    assert.equal(result.executionMode, "agent-required-blocked");
    assert.deepEqual(result.missingAgents.sort(), ["creative-director", "ux-ui-designer"].sort());
    assert.match(result.qualityImpact, /creative-director/);
    assert.ok(result.issues.some((issue) => issue.expectedAgentId === "creative-director"));
    assert.ok(result.issues.some((issue) => issue.expectedAgentId === "ux-ui-designer"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design agent plan consumes host-provided Tauri window metrics", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-window-metrics-"));
  try {
    await writeUtf8(root, ".supervibe/memory/desktop-window-metrics.json", `${JSON.stringify({
      target: "tauri",
      currentWindow: { width: 1366, height: 768, deviceScaleFactor: 1.25, label: "Current Tauri window" },
      minWindow: { width: 800, height: 600 },
    })}\n`);

    const plan = buildDesignAgentPlan({
      brief: "Tauri desktop app",
      target: "tauri",
      rootDir: root,
    });

    assert.equal(plan.viewportPolicy.metricsSource, ".supervibe/memory/desktop-window-metrics.json");
    assert.equal(plan.viewportPolicy.defaultViewports[0].width, 1366);
    assert.equal(plan.viewportPolicy.defaultViewports[0].deviceScaleFactor, 1.25);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design agent receipt validator does not let command receipts substitute specialist receipts", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-agent-receipts-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/brandbook/direction.md", "# Direction\n");
    await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/supervibe-design",
      subjectType: "command",
      subjectId: "supervibe-design",
      stage: "stage-1-brand-direction",
      invocationReason: "main command drafted direction manually",
      outputArtifacts: [".supervibe/artifacts/brandbook/direction.md"],
      startedAt: "2026-05-03T00:00:00.000Z",
      completedAt: "2026-05-03T00:01:00.000Z",
      handoffId: "design-agent-chat",
      secret: "test-secret",
    });

    const result = validateDesignAgentInvocationReceipts(root, { secret: "test-secret" });

    assert.equal(result.pass, false);
    assert.equal(result.executionMode, "agent-required-blocked");
    assert.ok(result.issues.some((issue) => issue.code === "missing-design-agent-receipt" && issue.expectedAgentId === "creative-director"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design agent receipt validator rejects hand-written completed receipts without runtime provenance", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-agent-receipts-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/brandbook/direction.md", "# Direction\n");
    await writeUtf8(root, ".supervibe/artifacts/_workflow-invocations/supervibe-design/design-agent-chat/creative-director-stage-1.json", JSON.stringify({
      schemaVersion: 1,
      command: "/supervibe-design",
      invokedBy: "supervibe-design",
      subjectType: "agent",
      subjectId: "creative-director",
      agentId: "creative-director",
      stage: "stage-1-brand-direction",
      status: "completed",
      invocationReason: "brand direction required",
      inputEvidence: ["preferences.json"],
      outputArtifacts: [".supervibe/artifacts/brandbook/direction.md"],
      startedAt: "2026-05-03T00:00:00.000Z",
      completedAt: "2026-05-03T00:01:00.000Z",
      handoffId: "design-agent-chat",
    }, null, 2));

    const result = validateDesignAgentInvocationReceipts(root);

    assert.equal(result.pass, false);
    assert.ok(result.issues.some((issue) => issue.code === "untrusted-design-agent-receipt"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design agent receipt validator rejects runtime-issued agent receipts without host invocation proof", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-agent-receipts-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/brandbook/preferences.json", "{\"ok\":true}\n");
    await writeUtf8(root, ".supervibe/artifacts/brandbook/direction.md", "# Direction\n");

    await assert.rejects(
      issueWorkflowInvocationReceipt({
        rootDir: root,
        command: "/supervibe-design",
        subjectType: "agent",
        subjectId: "creative-director",
        agentId: "creative-director",
        stage: "stage-1-brand-direction",
        invocationReason: "brand direction required",
        inputEvidence: [".supervibe/artifacts/brandbook/preferences.json"],
        outputArtifacts: [".supervibe/artifacts/brandbook/direction.md"],
        startedAt: "2026-05-03T00:00:00.000Z",
        completedAt: "2026-05-03T00:01:00.000Z",
        handoffId: "design-agent-chat",
        secret: "test-secret",
      }),
      /hostInvocation proof required/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design agent receipt validator accepts runtime-issued receipts with host invocation proof", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-agent-receipts-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/brandbook/preferences.json", "{\"ok\":true}\n");
    await writeUtf8(root, ".supervibe/artifacts/brandbook/direction.md", "# Direction\n");
    const hostInvocation = await writeAgentInvocation(root);

    await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/supervibe-design",
      subjectType: "agent",
      subjectId: "creative-director",
      agentId: "creative-director",
      stage: "stage-1-brand-direction",
      invocationReason: "brand direction required",
      inputEvidence: [".supervibe/artifacts/brandbook/preferences.json"],
      outputArtifacts: [".supervibe/artifacts/brandbook/direction.md"],
      startedAt: "2026-05-03T00:00:00.000Z",
      completedAt: "2026-05-03T00:01:00.000Z",
      handoffId: "design-agent-chat",
      hostInvocation,
      secret: "test-secret",
    });

    const result = validateDesignAgentInvocationReceipts(root, { secret: "test-secret" });

    assert.equal(result.pass, true);
    assert.deepEqual(result.issues, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design agent receipt validator rejects output artifact hash drift", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-agent-receipts-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/brandbook/preferences.json", "{\"ok\":true}\n");
    await writeUtf8(root, ".supervibe/artifacts/brandbook/direction.md", "# Direction\n");
    await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/supervibe-design",
      subjectType: "agent",
      subjectId: "creative-director",
      agentId: "creative-director",
      stage: "stage-1-brand-direction",
      invocationReason: "brand direction required",
      inputEvidence: [".supervibe/artifacts/brandbook/preferences.json"],
      outputArtifacts: [".supervibe/artifacts/brandbook/direction.md"],
      startedAt: "2026-05-03T00:00:00.000Z",
      completedAt: "2026-05-03T00:01:00.000Z",
      handoffId: "design-agent-chat",
      hostInvocation: await writeAgentInvocation(root),
      secret: "test-secret",
    });
    await writeUtf8(root, ".supervibe/artifacts/brandbook/direction.md", "# Changed after receipt\n");

    const result = validateDesignAgentInvocationReceipts(root, { secret: "test-secret" });

    assert.equal(result.pass, false);
    assert.ok(result.issues.some((issue) => issue.code === "untrusted-design-agent-receipt" && /hash mismatch/.test(issue.message)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design agent receipt validator rejects missing artifact link manifest", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-agent-receipts-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/brandbook/preferences.json", "{\"ok\":true}\n");
    await writeUtf8(root, ".supervibe/artifacts/brandbook/direction.md", "# Direction\n");
    await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/supervibe-design",
      subjectType: "agent",
      subjectId: "creative-director",
      agentId: "creative-director",
      stage: "stage-1-brand-direction",
      invocationReason: "brand direction required",
      inputEvidence: [".supervibe/artifacts/brandbook/preferences.json"],
      outputArtifacts: [".supervibe/artifacts/brandbook/direction.md"],
      startedAt: "2026-05-03T00:00:00.000Z",
      completedAt: "2026-05-03T00:01:00.000Z",
      handoffId: "design-agent-chat",
      hostInvocation: await writeAgentInvocation(root),
      secret: "test-secret",
    });
    await rm(join(root, ".supervibe", "artifacts", "_workflow-invocations", "supervibe-design", "design-agent-chat", "artifact-links.json"), { force: true });

    const result = validateDesignAgentInvocationReceipts(root, { secret: "test-secret" });

    assert.equal(result.pass, false);
    assert.ok(result.issues.some((issue) => issue.code === "missing-design-artifact-receipt-link"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
