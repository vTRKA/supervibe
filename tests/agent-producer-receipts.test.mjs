import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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

const ROOT = process.cwd();

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
    assert.equal(result.hostAgentReceipts, 1);
    assert.equal(result.producerReceipts, 1);
    assert.equal(result.skillReceipts, 0);
    assert.deepEqual(result.issues, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("agent invocation CLI can log host invocation and issue matching producer receipt", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-agent-producers-cli-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/brandbook/preferences.json", "{\"ok\":true}\n");
    await writeUtf8(root, ".supervibe/artifacts/brandbook/direction.md", "# Direction\n");

    const output = execFileSync(process.execPath, [
      join(ROOT, "scripts", "agent-invocation.mjs"),
      "log",
      "--root",
      root,
      "--agent",
      "creative-director",
      "--host",
      "codex",
      "--host-invocation-id",
      "codex-agent-1",
      "--task",
      "brand direction required",
      "--confidence",
      "9.2",
      "--changed-files",
      ".supervibe/artifacts/brandbook/direction.md",
      "--issue-receipt",
      "--command",
      "/supervibe-design",
      "--stage",
      "stage-1-brand-direction",
      "--handoff-id",
      "design-agent-chat",
      "--input-evidence",
      ".supervibe/artifacts/brandbook/preferences.json",
      "--output-artifacts",
      ".supervibe/artifacts/brandbook/direction.md",
      "--secret",
      "test-secret",
    ], {
      cwd: ROOT,
      encoding: "utf8",
    });

    assert.match(output, /SUPERVIBE_AGENT_INVOCATION_LOGGED/);
    assert.match(output, /WORKFLOW_RECEIPT:/);
    assert.match(output, /AGENT_OUTPUT_JSON: .supervibe\/artifacts\/_agent-outputs\/codex-agent-1\/agent-output\.json/);

    const result = validateAgentProducerReceipts(root, { secret: "test-secret" });
    assert.equal(result.pass, true);
    assert.equal(result.hostAgentReceipts, 1);
    assert.equal(result.producerReceipts, 1);
    assert.deepEqual(result.issues, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("agent invocation CLI help exits cleanly before log validation", () => {
  const output = execFileSync(process.execPath, [
    join(ROOT, "scripts", "agent-invocation.mjs"),
    "--help",
  ], {
    cwd: ROOT,
    encoding: "utf8",
  });

  assert.match(output, /SUPERVIBE_AGENT_INVOCATION/);
  assert.match(output, /--issue-receipt/);
});

test("agent producer validator requires canonical stage ids for skill-owned design artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-agent-producers-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/prototypes/_design-system/tokens.css", ":root { --color-primary: #123456; }\n");
    await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/supervibe-design",
      subjectType: "skill",
      subjectId: "supervibe:brandbook",
      skillId: "supervibe:brandbook",
      stage: "candidate-design-system",
      invocationReason: "brandbook skill produced candidate tokens",
      outputArtifacts: [".supervibe/artifacts/prototypes/_design-system/tokens.css"],
      startedAt: "2026-05-03T00:00:00.000Z",
      completedAt: "2026-05-03T00:01:00.000Z",
      handoffId: "design-agent-chat",
      secret: "test-secret",
    });

    const result = validateAgentProducerReceipts(root, { secret: "test-secret" });

    assert.equal(result.pass, false);
    assert.ok(result.issues.some((issue) => issue.code === "missing-agent-producer-receipt"));
    assert.match(result.issues.find((issue) => issue.code === "missing-agent-producer-receipt")?.message || "", /supervibe:brandbook/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("agent producer validator distinguishes trusted skill producers from host agents", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-skill-producers-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/prototypes/_design-system/tokens.css", ":root { --color-primary: #123456; }\n");
    await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/supervibe-design",
      subjectType: "skill",
      subjectId: "supervibe:brandbook",
      skillId: "supervibe:brandbook",
      stage: "stage-2-design-system",
      invocationReason: "brandbook skill produced candidate tokens",
      inputEvidence: [".supervibe/artifacts/prototypes/_design-system/tokens.css"],
      outputArtifacts: [".supervibe/artifacts/prototypes/_design-system/tokens.css"],
      startedAt: "2026-05-04T00:00:00.000Z",
      completedAt: "2026-05-04T00:01:00.000Z",
      handoffId: "design-agent-chat",
    });

    const result = validateAgentProducerReceipts(root);
    assert.equal(result.pass, true);
    assert.equal(result.producerReceipts, 1);
    assert.equal(result.skillReceipts, 1);
    assert.equal(result.hostAgentReceipts, 0);
    assert.equal(result.agentReceipts, 0);

    const report = execFileSync(process.execPath, [
      join(ROOT, "scripts", "validate-agent-producer-receipts.mjs"),
    ], {
      cwd: root,
      encoding: "utf8",
    });
    assert.match(report, /PRODUCER_RECEIPTS: 1/);
    assert.match(report, /SKILL_RECEIPTS: 1/);
    assert.match(report, /HOST_AGENT_RECEIPTS: 0/);
    assert.match(report, /COVERAGE_STATUS: skill-producer-receipts-present/);
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
