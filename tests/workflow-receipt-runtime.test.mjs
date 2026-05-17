import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
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
  validateWorkflowReceiptTrust,
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
    const afterLiveChange = validateWorkflowReceipts(root, { secret: "test-secret" });
    assert.equal(afterLiveChange.pass, true);
    assert.ok(afterLiveChange.diagnostics.some((item) => /live-output-changed/.test(item.message)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("workflow receipt output classifier blocks mutable log-like artifacts", () => {
  const blocked = classifyWorkflowReceiptOutputArtifact(".supervibe/memory/agent-invocations.jsonl");
  const mutableState = classifyWorkflowReceiptOutputArtifact(".supervibe/memory/genesis/state.json");
  const mutableWorkItemIndex = classifyWorkflowReceiptOutputArtifact(".supervibe/memory/work-items/index.json");
  const stable = classifyWorkflowReceiptOutputArtifact(".supervibe/artifacts/_agent-outputs/run-1/agent-output.json");

  assert.equal(blocked.receiptable, false);
  assert.equal(blocked.reason, "mutable-log-like-output-artifact");
  assert.equal(mutableState.receiptable, false);
  assert.equal(mutableWorkItemIndex.receiptable, false);
  assert.match(mutableState.recommendation, /state snapshot/);
  assert.match(blocked.recommendation, /stable per-agent/i);
  assert.equal(stable.receiptable, true);
});

test("workflow receipt validation treats live work-item graph drift as snapshot-backed diagnostic", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-workflow-graph-drift-"));
  try {
    const graphRel = ".supervibe/memory/work-items/epic-graph/graph.json";
    await writeUtf8(root, graphRel, `${JSON.stringify({ items: [{ itemId: "T1", status: "open" }] }, null, 2)}\n`);

    await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/supervibe-loop",
      subjectType: "command",
      subjectId: "supervibe:autonomous-agent-loop",
      stage: "work-item-execution",
      invocationReason: "graph lifecycle state is a durable workflow output",
      outputArtifacts: [graphRel],
      startedAt: "2026-05-07T00:00:00.000Z",
      completedAt: "2026-05-07T00:01:00.000Z",
      handoffId: "graph-drift",
      secret: "test-secret",
      taskId: "T1",
      graphId: "epic-graph",
    });
    assert.equal(validateWorkflowReceipts(root, { secret: "test-secret" }).pass, true);

    await writeUtf8(root, graphRel, `${JSON.stringify({ items: [{ itemId: "T1", status: "closed" }] }, null, 2)}\n`);
    const drifted = validateWorkflowReceipts(root, { secret: "test-secret" });
    assert.equal(drifted.pass, true);
    assert.ok(drifted.diagnostics.some((issue) => /live-output-changed/.test(issue.message)));

    await writeUtf8(root, graphRel, `${JSON.stringify({ items: [{ itemId: "T1", status: "open" }] }, null, 2)}\n`);
    const sourceDir = join(root, ".supervibe", "memory", "work-items", "epic-graph");
    const archiveDir = join(root, ".supervibe", "memory", "work-items", ".archive", "epic-graph-2026-05-07");
    await mkdir(dirname(archiveDir), { recursive: true });
    await rename(sourceDir, archiveDir);
    await writeUtf8(root, ".supervibe/memory/work-items/.archive/_archive-log.jsonl", `${JSON.stringify({
      type: "work-item-graph",
      graphId: "epic-graph",
      archivedAt: "2026-05-07T00:02:00.000Z",
      reason: "completed-retention",
      originalPath: sourceDir,
      archivePath: archiveDir,
    })}\n`);
    assert.equal(validateWorkflowReceipts(root, { secret: "test-secret" }).pass, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("sv receipts status reports split-brain as non-blocking warning", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-receipt-status-"));
  try {
    const outputRel = ".supervibe/artifacts/plans/status/plan.md";
    await writeUtf8(root, outputRel, "# Plan\n");
    await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/supervibe-plan",
      subjectType: "command",
      subjectId: "supervibe:writing-plans",
      stage: "stage-1-plan",
      invocationReason: "status warning fixture",
      outputArtifacts: [outputRel],
      startedAt: "2026-05-07T00:00:00.000Z",
      completedAt: "2026-05-07T00:01:00.000Z",
      handoffId: "status-warning",
      secret: "test-secret",
    });
    await rm(join(root, ...outputRel.split("/")), { force: true });

    const { stdout } = await execFileAsync(process.execPath, [
      join(REPO_ROOT, "bin", "supervibe.mjs"),
      "receipts",
      "status",
      "--secret",
      "test-secret",
    ], { cwd: root, maxBuffer: 1024 * 1024 });

    assert.match(stdout, /SUPERVIBE_WORKFLOW_RECEIPT_STATUS/);
    assert.match(stdout, /USER_BLOCKING: false/);
    assert.match(stdout, /STALE: 1/);
    assert.match(stdout, /SPLIT_BRAIN: true/);
    assert.match(stdout, /WARNING_RECEIPT: workflow-/);
    assert.ok(stdout.includes("DETAILS_COMMAND: node scripts/workflow-receipt.mjs inspect"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("sv receipts status reports ledger split-brain as non-blocking warning", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-receipt-ledger-status-"));
  try {
    const outputRel = ".supervibe/artifacts/plans/status-ledger/plan.md";
    await writeUtf8(root, outputRel, "# Plan\n");
    await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/supervibe-plan",
      subjectType: "command",
      subjectId: "supervibe:writing-plans",
      stage: "stage-1-plan",
      invocationReason: "ledger warning fixture",
      outputArtifacts: [outputRel],
      startedAt: "2026-05-07T00:00:00.000Z",
      completedAt: "2026-05-07T00:01:00.000Z",
      handoffId: "status-ledger-warning",
      secret: "test-secret",
    });
    await rm(defaultWorkflowReceiptLedgerPath(root), { force: true });

    const { stdout } = await execFileAsync(process.execPath, [
      join(REPO_ROOT, "bin", "supervibe.mjs"),
      "receipts",
      "status",
      "--secret",
      "test-secret",
    ], { cwd: root, maxBuffer: 1024 * 1024 });

    assert.match(stdout, /SUPERVIBE_WORKFLOW_RECEIPT_STATUS/);
    assert.match(stdout, /USER_BLOCKING: false/);
    assert.match(stdout, /STALE: 1/);
    assert.match(stdout, /SPLIT_BRAIN: true/);
    assert.match(stdout, /ledger entry missing for receipt/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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
    assert.equal(invalid.pass, true);
    assert.ok(invalid.diagnostics.some((issue) => /live-output-changed/.test(issue.message)));
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

test("workflow receipt trust can require durable host invocation proof", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-workflow-host-proof-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/reviews/final-review.json", "{\"status\":\"pass\"}\n");
    const issued = await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/supervibe-loop",
      subjectType: "reviewer",
      subjectId: "quality-gate-reviewer",
      agentId: "quality-gate-reviewer",
      stage: "final-review-sweep",
      invocationReason: "final review proof",
      outputArtifacts: [".supervibe/artifacts/reviews/final-review.json"],
      startedAt: "2026-05-03T00:00:00.000Z",
      completedAt: "2026-05-03T00:01:00.000Z",
      handoffId: "final-review-sweep",
      graphId: "epic-test",
      hostInvocation: {
        source: "codex-spawn-agent",
        invocationId: "missing-host-invocation",
        agentId: "quality-gate-reviewer",
      },
      allowMissingHostInvocationProof: true,
    });

    const receipt = { ...issued.receipt, __file: issued.receiptPath };
    const weakTrust = validateWorkflowReceiptTrust(root, receipt);
    assert.equal(weakTrust.pass, true);

    const strongTrust = validateWorkflowReceiptTrust(root, receipt, { requireHostInvocationProof: true });
    assert.equal(strongTrust.pass, false);
    assert.ok(strongTrust.issues.some((issue) => /hostInvocation missing-host-invocation not found/.test(issue)));
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

test("workflow receipt runtime suppresses deleted ephemeral temp plan diagnostics", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-workflow-temp-plan-"));
  try {
    const outputRel = ".supervibe/artifacts/plans/temp-autonomy-todo.md";
    await writeUtf8(root, outputRel, "# Temporary Plan: autonomy todo\nStatus: temporary ephemeral\n");
    await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/supervibe-plan",
      subjectType: "command",
      subjectId: "supervibe:writing-plans",
      stage: "stage-1-plan",
      invocationReason: "temporary ephemeral plan deleted-after-completion",
      outputArtifacts: [outputRel],
      startedAt: "2026-05-17T00:00:00.000Z",
      completedAt: "2026-05-17T00:01:00.000Z",
      handoffId: "temp-autonomy-todo",
      secret: "test-secret",
    });
    await rm(join(root, ...outputRel.split("/")), { force: true });

    const result = validateWorkflowReceipts(root, { secret: "test-secret" });

    assert.equal(result.pass, true);
    assert.equal(result.diagnostics.some((item) => /temp-autonomy-todo/.test(item.message || item)), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("workflow receipt runtime keeps snapshot trust and diagnoses artifact drift", async () => {
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

    assert.equal(result.pass, true);
    assert.ok(result.diagnostics.some((issue) => /live-output-changed/.test(issue.message)));
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
    const driftedBeforeReissue = validateWorkflowReceipts(root, { secret: "test-secret" });
    assert.equal(driftedBeforeReissue.pass, true);
    assert.ok(driftedBeforeReissue.diagnostics.some((issue) => /live-output-changed/.test(issue.message)));

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
    assert.match(stdout, /SUPERSEDES_RECEIPT_ID:/);
    assert.match(stdout, /EVIDENCE_SNAPSHOT:/);
    const afterReissue = validateWorkflowReceipts(root, { secret: "test-secret" });
    assert.equal(afterReissue.pass, true);
    assert.equal(afterReissue.diagnostics.length, 0);
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
      snapshotEvidence: false,
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
      snapshotEvidence: false,
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

test("workflow receipt CLI gives Codex spawn-id recovery when host invocation is missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-workflow-codex-missing-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/loops/t55c/agent-output.json", JSON.stringify({ ok: true }, null, 2));

    await assert.rejects(
      execFileAsync(process.execPath, [
        "scripts/workflow-receipt.mjs",
        "issue",
        "--root",
        root,
        "--command",
        "/supervibe-loop",
        "--agent",
        "quality-gate-reviewer",
        "--host-invocation-id",
        "codex-spawn-missing",
        "--stage",
        "work-item-execution",
        "--reason",
        "reviewer proof for T55C",
        "--output",
        ".supervibe/artifacts/loops/t55c/agent-output.json",
        "--handoff",
        "t55c",
      ], { cwd: REPO_ROOT }),
      (error) => {
        const output = `${error.stdout || ""}${error.stderr || ""}`;
        assert.match(output, /hostInvocation codex-spawn-missing not found/);
        assert.match(output, /codex-spawn-agent/);
        assert.match(output, /node scripts\/agent-invocation\.mjs log --agent quality-gate-reviewer --host codex --host-invocation-id codex-spawn-missing/);
        assert.match(output, /--issue-receipt --command <workflow-command>/);
        return true;
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("agent invocation CLI can atomically register Codex spawn id and issue bound receipt", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-workflow-codex-recovery-"));
  try {
    const { stdout } = await execFileAsync(process.execPath, [
      "scripts/agent-invocation.mjs",
      "log",
      "--root",
      root,
      "--agent",
      "quality-gate-reviewer",
      "--host",
      "codex",
      "--host-invocation-id",
      "codex-spawn-recovered",
      "--task",
      "reviewer proof for T55C",
      "--confidence",
      "9",
      "--issue-receipt",
      "--command",
      "/supervibe-loop",
      "--stage",
      "work-item-execution",
      "--handoff-id",
      "t55c",
      "--output-artifacts",
      ".supervibe/artifacts/_agent-outputs/codex-spawn-recovered/agent-output.json",
      "--graph-id",
      "epic-runtime",
      "--task-id",
      "epic-runtime-t55c",
      "--secret",
      "test-secret",
    ], { cwd: REPO_ROOT });

    assert.match(stdout, /SUPERVIBE_AGENT_INVOCATION_LOGGED/);
    assert.match(stdout, /HOST_SOURCE: codex-spawn-agent/);
    assert.match(stdout, /WORKFLOW_RECEIPT:/);
    const result = validateWorkflowReceipts(root, { secret: "test-secret" });
    assert.equal(result.pass, true);
    assert.equal(result.checked, 1);
    const receiptPath = result.receipts
      ? null
      : null;
    const receiptFiles = await readFile(join(root, ".supervibe", "memory", "workflow-invocation-ledger.jsonl"), "utf8");
    assert.match(receiptFiles, /epic-runtime-t55c/);
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
