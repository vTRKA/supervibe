import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  validateAgentProducerReceipts,
} from "../scripts/lib/agent-producer-contract.mjs";
import {
  issueWorkflowInvocationReceipt,
} from "../scripts/lib/supervibe-workflow-receipt-runtime.mjs";

async function writeUtf8(root, relPath, content) {
  const absPath = join(root, ...relPath.split("/"));
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, content, "utf8");
}

async function writeInvocation(root, {
  invocationId = "creative-director-run-1",
  agentId = "creative-director",
  taskSummary = "brand direction required",
} = {}) {
  await writeUtf8(root, ".supervibe/memory/agent-invocations.jsonl", `${JSON.stringify({
    schemaVersion: 1,
    invocation_id: invocationId,
    ts: "2026-05-03T00:00:30.000Z",
    agent_id: agentId,
    task_summary: taskSummary,
    confidence_score: 9.3,
  })}\n`);
  return {
    source: "agent-invocations-jsonl",
    invocationId,
  };
}

test("agent producer validator rejects durable agent outputs without exact producer receipt", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-agent-producers-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/brandbook/direction.md", "# Direction\n");
    await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/supervibe-design",
      subjectType: "command",
      subjectId: "supervibe-design",
      stage: "stage-1-brand-direction",
      invocationReason: "main command drafted direction",
      outputArtifacts: [".supervibe/artifacts/brandbook/direction.md"],
      startedAt: "2026-05-03T00:00:00.000Z",
      completedAt: "2026-05-03T00:01:00.000Z",
      handoffId: "design-agent-chat",
      secret: "test-secret",
    });

    const result = validateAgentProducerReceipts(root, { secret: "test-secret" });

    assert.equal(result.pass, false);
    assert.ok(result.issues.some((issue) => issue.code === "missing-agent-producer-receipt"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("agent producer validator rejects agent receipts without host invocation proof", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-agent-producers-"));
  try {
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

test("agent producer validator accepts exact producer receipt with host invocation proof", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-agent-producers-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/brandbook/direction.md", "# Direction\n");
    const hostInvocation = await writeInvocation(root);
    await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/supervibe-design",
      subjectType: "agent",
      subjectId: "creative-director",
      agentId: "creative-director",
      stage: "stage-1-brand-direction",
      invocationReason: "brand direction required",
      outputArtifacts: [".supervibe/artifacts/brandbook/direction.md"],
      startedAt: "2026-05-03T00:00:00.000Z",
      completedAt: "2026-05-03T00:01:00.000Z",
      handoffId: "design-agent-chat",
      hostInvocation,
      secret: "test-secret",
    });

    const result = validateAgentProducerReceipts(root, { secret: "test-secret" });

    assert.equal(result.pass, true);
    assert.equal(result.agentReceipts, 1);
    assert.deepEqual(result.issues, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("workflow receipt issue rejects host invocation agent mismatch", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-agent-producers-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/brandbook/direction.md", "# Direction\n");
    const hostInvocation = await writeInvocation(root, { agentId: "ux-ui-designer" });
    await assert.rejects(
      issueWorkflowInvocationReceipt({
        rootDir: root,
        command: "/supervibe-design",
        subjectType: "agent",
        subjectId: "creative-director",
        agentId: "creative-director",
        stage: "stage-1-brand-direction",
        invocationReason: "brand direction required",
        outputArtifacts: [".supervibe/artifacts/brandbook/direction.md"],
        startedAt: "2026-05-03T00:00:00.000Z",
        completedAt: "2026-05-03T00:01:00.000Z",
        handoffId: "design-agent-chat",
        hostInvocation,
        secret: "test-secret",
      }),
      /hostInvocation agent mismatch/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
