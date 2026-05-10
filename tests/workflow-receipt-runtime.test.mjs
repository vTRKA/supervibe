import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import {
  WORKFLOW_RECEIPT_ISSUER,
  classifyWorkflowReceiptOutputArtifact,
  defaultWorkflowReceiptKeyPath,
  defaultWorkflowReceiptLedgerPath,
  issueWorkflowInvocationReceipt,
  validateWorkflowReceiptLedgerChain,
  validateWorkflowReceipts,
} from "../scripts/lib/supervibe-workflow-receipt-runtime.mjs";
import {
  readTraceSpans,
} from "../scripts/lib/supervibe-runtime-trace.mjs";

const execFileAsync = promisify(execFile);
const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));

async function writeUtf8(root, relPath, content) {
  const absPath = join(root, ...relPath.split("/"));
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, content, "utf8");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

test("workflow receipt runtime accepts command receipts for brainstorm outputs", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-workflow-receipts-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/brainstorm/chat-system/brief.md", "# Brief\n");

    await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/supervibe-brainstorm",
      subjectType: "skill",
      subjectId: "supervibe:brainstorming",
      stage: "stage-1-brief",
      invocationReason: "brainstorm command produced approved brief",
      outputArtifacts: [".supervibe/artifacts/brainstorm/chat-system/brief.md"],
      startedAt: "2026-05-03T00:00:00.000Z",
      completedAt: "2026-05-03T00:01:00.000Z",
      handoffId: "brainstorm-chat-system",
      secret: "test-secret",
    });

    const result = validateWorkflowReceipts(root, { secret: "test-secret" });
    const ledger = validateWorkflowReceiptLedgerChain(root, { secret: "test-secret" });

    assert.equal(result.pass, true);
    assert.equal(result.checked, 1);
    assert.deepEqual(result.issues, []);
    assert.equal(ledger.pass, true);
    assert.match(defaultWorkflowReceiptKeyPath(root), /workflow-receipt-runtime\.key$/);
    assert.match(defaultWorkflowReceiptLedgerPath(root), /workflow-invocation-ledger\.jsonl$/);
    assert.equal(WORKFLOW_RECEIPT_ISSUER, "supervibe-workflow-receipt-runtime");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("workflow receipt runtime preserves host trace metadata and emits receipt spans", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-workflow-trace-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/plans/trace/plan.md", "# Plan\n");

    const issued = await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/supervibe-plan",
      subjectType: "command",
      subjectId: "supervibe:writing-plans",
      stage: "stage-1-plan",
      invocationReason: "traceable plan output",
      outputArtifacts: [".supervibe/artifacts/plans/trace/plan.md"],
      startedAt: "2026-05-07T00:00:00.000Z",
      completedAt: "2026-05-07T00:01:00.000Z",
      handoffId: "trace-plan",
      secret: "test-secret",
      hostInvocation: {
        source: "codex-spawn-agent",
        invocationId: "codex-trace-run-1",
        traceId: "trace-receipt-1",
        spanId: "span-agent-1",
      },
    });

    assert.equal(issued.receipt.hostInvocation.traceId, "trace-receipt-1");
    assert.equal(issued.receipt.hostInvocation.spanId, "span-agent-1");
    assert.equal(validateWorkflowReceipts(root, { secret: "test-secret" }).pass, true);

    const spans = await readTraceSpans({ rootDir: root });
    const receiptSpan = spans.find((span) => span.name === "supervibe.workflow.receipt.issue");
    assert.ok(receiptSpan);
    assert.equal(receiptSpan.traceId, "trace-receipt-1");
    assert.equal(receiptSpan.parentSpanId, "span-agent-1");
    assert.equal(receiptSpan.attributes["supervibe.workflow.receipt_id"], issued.receipt.receiptId);

    await writeUtf8(root, ".supervibe/artifacts/plans/trace/plan.md", "# Modified\n");
    assert.equal(validateWorkflowReceipts(root, { secret: "test-secret" }).pass, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("workflow receipt output classifier blocks mutable log-like artifacts", () => {
  const blocked = classifyWorkflowReceiptOutputArtifact(".supervibe/memory/agent-invocations.jsonl");
  const mutableState = classifyWorkflowReceiptOutputArtifact(".supervibe/memory/genesis/state.json");
  const stable = classifyWorkflowReceiptOutputArtifact(".supervibe/artifacts/_agent-outputs/run-1/agent-output.json");

  assert.equal(blocked.receiptable, false);
  assert.equal(blocked.reason, "mutable-log-like-output-artifact");
  assert.equal(mutableState.receiptable, false);
  assert.match(mutableState.recommendation, /state snapshot/);
  assert.match(blocked.recommendation, /stable per-agent/i);
  assert.equal(stable.receiptable, true);
});

test("workflow receipt runtime accepts compact agent-output manifest when archived gzip preserves original digest", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-workflow-compact-manifest-"));
  try {
    const outputRel = ".supervibe/artifacts/_agent-outputs/run-compact/agent-output.json";
    const archiveRel = ".supervibe/.archive/agent-outputs/run-compact/agent-output.json.gz";
    const original = `${JSON.stringify({
      schemaVersion: 1,
      invocationId: "run-compact",
      agentId: "repo-researcher",
      taskSummary: "compact manifest validation",
    }, null, 2)}\n`;
    await writeUtf8(root, outputRel, original);

    await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/codex-task",
      subjectType: "skill",
      subjectId: "supervibe:verification",
      stage: "verification",
      invocationReason: "compactable output fixture",
      outputArtifacts: [outputRel],
      startedAt: "2026-05-06T00:00:00.000Z",
      completedAt: "2026-05-06T00:01:00.000Z",
      handoffId: "compact-manifest",
      secret: "test-secret",
    });
    assert.equal(validateWorkflowReceipts(root, { secret: "test-secret" }).pass, true);

    const compressed = gzipSync(Buffer.from(original, "utf8"));
    await writeUtf8(root, archiveRel, compressed.toString("base64"));
    await writeFile(join(root, ...archiveRel.split("/")), compressed);
    await writeUtf8(root, outputRel, `${JSON.stringify({
      schemaVersion: 1,
      type: "supervibe-agent-output-compact-manifest",
      originalPath: outputRel,
      originalSha256: sha256(original),
      originalBytes: Buffer.byteLength(original),
      archivePath: archiveRel,
      archiveSha256: sha256(compressed),
      archiveBytes: compressed.length,
      compression: "gzip",
      compactedAt: "2026-05-06T00:02:00.000Z",
    }, null, 2)}\n`);

    assert.equal(validateWorkflowReceipts(root, { secret: "test-secret" }).pass, true);

    const manifest = JSON.parse(await readFile(join(root, ...outputRel.split("/")), "utf8"));
    manifest.originalSha256 = "bad-digest";
    await writeUtf8(root, outputRel, `${JSON.stringify(manifest, null, 2)}\n`);
    const invalid = validateWorkflowReceipts(root, { secret: "test-secret" });
    assert.equal(invalid.pass, false);
    assert.ok(invalid.issues.some((issue) => /hash mismatch|missing/.test(issue.message)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("workflow receipt runtime rejects hand-written command receipts", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-workflow-receipts-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/plans/checkout/plan.md", "# Plan\n");
    await writeUtf8(root, ".supervibe/artifacts/_workflow-invocations/supervibe-plan/checkout/supervibe-writing-plans-stage-1.json", JSON.stringify({
      schemaVersion: 2,
      command: "/supervibe-plan",
      invokedBy: "supervibe-plan",
      subjectType: "skill",
      subjectId: "supervibe:writing-plans",
      stage: "stage-1-plan",
      status: "completed",
      invocationReason: "plan created",
      inputEvidence: [],
      outputArtifacts: [".supervibe/artifacts/plans/checkout/plan.md"],
      startedAt: "2026-05-03T00:00:00.000Z",
      completedAt: "2026-05-03T00:01:00.000Z",
      handoffId: "plan-checkout",
    }, null, 2));

    const result = validateWorkflowReceipts(root, { secret: "test-secret" });

    assert.equal(result.pass, false);
    assert.ok(result.issues.some((issue) => issue.code === "untrusted-workflow-receipt"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("workflow receipt runtime keeps multiple receipt links for the same artifact", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-workflow-receipts-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/plans/shared-todo.md", "# Shared Todo\n");

    await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/codex-task",
      subjectType: "skill",
      subjectId: "supervibe:project-memory",
      stage: "discovery",
      invocationReason: "memory search informed the todo",
      outputArtifacts: [".supervibe/artifacts/plans/shared-todo.md"],
      startedAt: "2026-05-03T00:00:00.000Z",
      completedAt: "2026-05-03T00:01:00.000Z",
      handoffId: "shared-todo",
      secret: "test-secret",
    });
    await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/codex-task",
      subjectType: "skill",
      subjectId: "supervibe:code-search",
      stage: "discovery",
      invocationReason: "code search informed the same todo",
      outputArtifacts: [".supervibe/artifacts/plans/shared-todo.md"],
      startedAt: "2026-05-03T00:02:00.000Z",
      completedAt: "2026-05-03T00:03:00.000Z",
      handoffId: "shared-todo",
      secret: "test-secret",
    });

    const result = validateWorkflowReceipts(root, { secret: "test-secret" });

    assert.equal(result.pass, true);
    assert.equal(result.checked, 2);
    assert.deepEqual(result.issues, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("workflow receipt runtime binds receipts to work graph task ids without breaking trust validation", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-workflow-task-binding-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/loops/epic-task/run.md", "# Run\n");

    const issued = await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/supervibe-loop",
      subjectType: "command",
      subjectId: "supervibe-loop-runner",
      stage: "wave-1",
      invocationReason: "loop wave completed for task",
      outputArtifacts: [".supervibe/artifacts/loops/epic-task/run.md"],
      startedAt: "2026-05-03T00:00:00.000Z",
      completedAt: "2026-05-03T00:01:00.000Z",
      handoffId: "loop-epic-task",
      graphId: "epic-task",
      taskId: "epic-task-t1",
      secret: "test-secret",
    });

    assert.deepEqual(issued.receipt.workItemBinding, {
      graphId: "epic-task",
      taskId: "epic-task-t1",
    });
    assert.equal(validateWorkflowReceipts(root, { secret: "test-secret" }).pass, true);

    const ledger = (await readFile(defaultWorkflowReceiptLedgerPath(root), "utf8")).trim().split(/\r?\n/).map(JSON.parse);
    assert.deepEqual(ledger[0].workItemBinding, issued.receipt.workItemBinding);
    const links = JSON.parse(await readFile(join(root, ".supervibe", "artifacts", "_workflow-invocations", "supervibe-loop", "loop-epic-task", "artifact-links.json"), "utf8"));
    assert.deepEqual(links.links[0].workItemBinding, issued.receipt.workItemBinding);

    const { stdout } = await execFileAsync(process.execPath, [
      "scripts/workflow-receipt.mjs",
      "issue",
      "--root",
      root,
      "--command",
      "/supervibe-loop",
      "--subject-type",
      "command",
      "--subject-id",
      "supervibe-loop-runner",
      "--stage",
      "wave-2",
      "--reason",
      "loop wave completed for second task",
      "--output",
      ".supervibe/artifacts/loops/epic-task/run.md",
      "--handoff",
      "loop-epic-task",
      "--graph-id",
      "epic-task",
      "--task-id",
      "epic-task-t2",
      "--secret",
      "test-secret",
    ], { cwd: REPO_ROOT });

    assert.match(stdout, /GRAPH_ID: epic-task/);
    assert.match(stdout, /TASK_ID: epic-task-t2/);
    assert.equal(validateWorkflowReceipts(root, { secret: "test-secret" }).pass, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("workflow receipt runtime rejects mutable log-like output artifacts before issuing", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-workflow-receipts-mutable-"));
  try {
    await writeUtf8(root, ".supervibe/memory/agent-invocations.jsonl", "{}\n");

    await assert.rejects(
      issueWorkflowInvocationReceipt({
        rootDir: root,
        command: "/supervibe-design",
        subjectType: "agent",
        subjectId: "creative-director",
        agentId: "creative-director",
        stage: "stage-1-brand-direction",
        invocationReason: "bad mutable output",
        outputArtifacts: [".supervibe/memory/agent-invocations.jsonl"],
        startedAt: "2026-05-03T00:00:00.000Z",
        completedAt: "2026-05-03T00:01:00.000Z",
        handoffId: "design-agent-chat",
        allowMissingHostInvocationProof: true,
      }),
      /mutable\/log-like.*per-agent.*agent-output\.json/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("workflow receipt runtime reruns replace same receipt path without stale ledger entries", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-workflow-rerun-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/loops/checkout/run.md", "# Run\n");
    const base = {
      rootDir: root,
      command: "/supervibe-loop",
      subjectType: "command",
      subjectId: "supervibe-loop-runner",
      stage: "wave-1",
      invocationReason: "loop wave completed",
      outputArtifacts: [".supervibe/artifacts/loops/checkout/run.md"],
      handoffId: "loop-checkout",
      secret: "test-secret",
    };
    await issueWorkflowInvocationReceipt({
      ...base,
      startedAt: "2026-05-03T00:00:00.000Z",
      completedAt: "2026-05-03T00:01:00.000Z",
      runTimestamp: "2026-05-03T00:01:00.000Z",
    });
    await issueWorkflowInvocationReceipt({
      ...base,
      startedAt: "2026-05-03T00:02:00.000Z",
      completedAt: "2026-05-03T00:03:00.000Z",
      runTimestamp: "2026-05-03T00:03:00.000Z",
    });

    const result = validateWorkflowReceipts(root, { secret: "test-secret" });
    const ledger = validateWorkflowReceiptLedgerChain(root, { secret: "test-secret" });

    assert.equal(result.pass, true);
    assert.equal(result.receipts, 1);
    assert.equal(ledger.pass, true);
    assert.equal(ledger.entries, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("workflow receipt runtime serializes parallel ledger appends", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-workflow-receipts-"));
  try {
    const outputs = Array.from({ length: 8 }, (_, index) => `.supervibe/artifacts/parallel/out-${index}.md`);
    for (const [index, output] of outputs.entries()) {
      await writeUtf8(root, output, `# Output ${index}\n`);
    }

    await Promise.all(outputs.map((output, index) => issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/supervibe-loop",
      subjectType: "skill",
      subjectId: `supervibe:parallel-${index}`,
      stage: `stage-${index}`,
      invocationReason: `parallel output ${index}`,
      outputArtifacts: [output],
      startedAt: "2026-05-03T00:00:00.000Z",
      completedAt: "2026-05-03T00:01:00.000Z",
      handoffId: "parallel-ledger",
      secret: "test-secret",
    })));

    const result = validateWorkflowReceipts(root, { secret: "test-secret" });
    const ledger = validateWorkflowReceiptLedgerChain(root, { secret: "test-secret" });
    const ledgerLines = (await readFile(defaultWorkflowReceiptLedgerPath(root), "utf8")).trim().split(/\r?\n/);

    assert.equal(result.pass, true);
    assert.equal(result.checked, outputs.length);
    assert.equal(ledger.pass, true);
    assert.equal(ledger.entries, outputs.length);
    assert.equal(ledgerLines.length, outputs.length);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("workflow receipt runtime rejects ledger tampering and artifact drift", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-workflow-receipts-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/loops/checkout/run.md", "# Run\n");
    await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/supervibe-loop",
      subjectType: "command",
      subjectId: "supervibe-loop-runner",
      stage: "wave-1",
      invocationReason: "loop wave completed",
      outputArtifacts: [".supervibe/artifacts/loops/checkout/run.md"],
      startedAt: "2026-05-03T00:00:00.000Z",
      completedAt: "2026-05-03T00:01:00.000Z",
      handoffId: "loop-checkout",
      secret: "test-secret",
    });
    await writeUtf8(root, ".supervibe/artifacts/loops/checkout/run.md", "# Modified\n");

    const result = validateWorkflowReceipts(root, { secret: "test-secret" });

    assert.equal(result.pass, false);
    assert.ok(result.issues.some((issue) => /hash mismatch/.test(issue.message)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("workflow receipt CLI reissue repairs artifact drift and rebuilds ledger", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-workflow-reissue-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/loops/checkout/run.md", "# Run\n");
    const issued = await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/supervibe-loop",
      subjectType: "command",
      subjectId: "supervibe-loop-runner",
      stage: "wave-1",
      invocationReason: "loop wave completed",
      outputArtifacts: [".supervibe/artifacts/loops/checkout/run.md"],
      startedAt: "2026-05-03T00:00:00.000Z",
      completedAt: "2026-05-03T00:01:00.000Z",
      handoffId: "loop-checkout",
      secret: "test-secret",
    });
    await writeUtf8(root, ".supervibe/artifacts/loops/checkout/run.md", "# Modified\n");
    assert.equal(validateWorkflowReceipts(root, { secret: "test-secret" }).pass, false);

    const { stdout } = await execFileAsync(process.execPath, [
      "scripts/workflow-receipt.mjs",
      "reissue",
      "--root",
      root,
      "--receipt",
      issued.receiptPath,
      "--reason",
      "artifact intentionally updated",
      "--secret",
      "test-secret",
    ], { cwd: REPO_ROOT });

    assert.match(stdout, /SUPERVIBE_WORKFLOW_RECEIPT_REISSUED/);
    assert.equal(validateWorkflowReceipts(root, { secret: "test-secret" }).pass, true);
    assert.equal(validateWorkflowReceiptLedgerChain(root, { secret: "test-secret" }).entries, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("workflow receipt CLI prune-stale archives drifted receipts and rebuilds ledger", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-workflow-prune-stale-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/loops/checkout/run.md", "# Run\n");
    await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/supervibe-loop",
      subjectType: "command",
      subjectId: "supervibe-loop-runner",
      stage: "wave-1",
      invocationReason: "loop wave completed",
      outputArtifacts: [".supervibe/artifacts/loops/checkout/run.md"],
      startedAt: "2026-05-03T00:00:00.000Z",
      completedAt: "2026-05-03T00:01:00.000Z",
      handoffId: "loop-checkout",
      secret: "test-secret",
    });
    await writeUtf8(root, ".supervibe/artifacts/loops/checkout/run.md", "# Modified\n");

    const { stdout } = await execFileAsync(process.execPath, [
      "scripts/workflow-receipt.mjs",
      "prune-stale",
      "--root",
      root,
      "--apply",
      "--secret",
      "test-secret",
    ], { cwd: REPO_ROOT });

    assert.match(stdout, /SUPERVIBE_WORKFLOW_RECEIPT_PRUNE_STALE/);
    assert.match(stdout, /ARCHIVED: 1/);
    const result = validateWorkflowReceipts(root, { secret: "test-secret" });
    assert.equal(result.pass, true);
    assert.equal(result.receipts, 0);
    assert.equal(result.ledgerEntries, 0);
    assert.equal(existsSync(join(root, ".supervibe", "memory", "workflow-receipts-stale")), false);
    assert.equal(existsSync(join(root, ".supervibe", ".archive", "workflow-receipts-stale")), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("workflow receipt CLI recovery-status reports trusted stage and dirty receipts", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-workflow-recovery-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/loops/checkout/run.md", "# Run\n");
    await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/supervibe-loop",
      subjectType: "command",
      subjectId: "supervibe-loop-runner",
      stage: "wave-1",
      invocationReason: "loop wave completed",
      outputArtifacts: [".supervibe/artifacts/loops/checkout/run.md"],
      startedAt: "2026-05-03T00:00:00.000Z",
      completedAt: "2026-05-03T00:01:00.000Z",
      handoffId: "loop-checkout",
      secret: "test-secret",
    });
    await writeUtf8(root, ".supervibe/artifacts/loops/checkout/run.md", "# Modified\n");

    const { stdout } = await execFileAsync(process.execPath, [
      "scripts/workflow-receipt.mjs",
      "recovery-status",
      "--root",
      root,
      "--secret",
      "test-secret",
    ], { cwd: REPO_ROOT });

    assert.match(stdout, /SUPERVIBE_WORKFLOW_RECOVERY_STATUS/);
    assert.match(stdout, /UNTRUSTED_RECEIPTS: 1/);
    assert.match(stdout, /NEXT_SAFE_ACTION: run workflow-receipt reissue\/prune-stale\/rebuild-ledger/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("workflow receipt CLI supports command-wide agent aliases", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-workflow-receipts-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/brandbook/direction.md", "# Direction\n");
    await writeUtf8(root, ".supervibe/memory/agent-invocations.jsonl", `${JSON.stringify({
      schemaVersion: 1,
      invocation_id: "creative-director-run-1",
      ts: "2026-05-03T00:00:30.000Z",
      agent_id: "creative-director",
      task_summary: "brand direction was produced",
      confidence_score: 9.5,
    })}\n`);

    const { stdout } = await execFileAsync(process.execPath, [
      "scripts/workflow-receipt.mjs",
      "issue",
      "--root",
      root,
      "--command",
      "/supervibe-design",
      "--agent",
      "creative-director",
      "--host-invocation-id",
      "creative-director-run-1",
      "--stage",
      "stage-1-brand-direction",
      "--reason",
      "brand direction was produced",
      "--output",
      ".supervibe/artifacts/brandbook/direction.md",
      "--slug",
      "agent-chat",
    ], { cwd: REPO_ROOT });

    assert.match(stdout, /SUPERVIBE_WORKFLOW_RECEIPT_ISSUED/);
    const result = validateWorkflowReceipts(root);
    assert.equal(result.pass, true);
    assert.equal(result.checked, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("workflow receipt CLI shows issue help before attempting issuance", async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    "scripts/workflow-receipt.mjs",
    "issue",
    "--help",
  ], { cwd: REPO_ROOT });

  assert.match(stdout, /SUPERVIBE_WORKFLOW_RECEIPT/);
  assert.match(stdout, /USAGE:/);
  assert.match(stdout, /issue --command/);
});
