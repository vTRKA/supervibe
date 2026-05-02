import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  buildDesignAgentPlan,
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
  assert.ok(plan.stages.some((stage) => stage.agentId === "creative-director"));
  assert.ok(plan.stages.some((stage) => stage.skillId === "supervibe:brandbook"));
  assert.ok(plan.stages.some((stage) => stage.agentId === "ux-ui-designer"));
  assert.ok(plan.stages.some((stage) => stage.agentId === "prototype-builder"));
  assert.ok(plan.stages.some((stage) => stage.skillId === "supervibe:mcp-discovery" && stage.reason.includes("website")));
  assert.ok(plan.stages.some((stage) => stage.skillId === "supervibe:design-intelligence" && stage.reason.includes("pdf")));
});

test("design agent receipt validator rejects durable outputs without completed receipts", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-agent-receipts-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/brandbook/direction.md", "# Direction\n");
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/spec.md", "# Spec\n");

    const result = validateDesignAgentInvocationReceipts(root);

    assert.equal(result.pass, false);
    assert.ok(result.issues.some((issue) => issue.expectedAgentId === "creative-director"));
    assert.ok(result.issues.some((issue) => issue.expectedAgentId === "ux-ui-designer"));
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

test("design agent receipt validator accepts runtime-issued receipts with ledger and artifact hashes", async () => {
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
