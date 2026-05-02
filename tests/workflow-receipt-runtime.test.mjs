import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
  WORKFLOW_RECEIPT_ISSUER,
  defaultWorkflowReceiptKeyPath,
  defaultWorkflowReceiptLedgerPath,
  issueWorkflowInvocationReceipt,
  validateWorkflowReceiptLedgerChain,
  validateWorkflowReceipts,
} from "../scripts/lib/supervibe-workflow-receipt-runtime.mjs";

const execFileAsync = promisify(execFile);
const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));

async function writeUtf8(root, relPath, content) {
  const absPath = join(root, ...relPath.split("/"));
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, content, "utf8");
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

test("workflow receipt CLI supports command-wide agent aliases", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-workflow-receipts-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/brandbook/direction.md", "# Direction\n");

    const { stdout } = await execFileAsync(process.execPath, [
      "scripts/workflow-receipt.mjs",
      "issue",
      "--root",
      root,
      "--command",
      "/supervibe-design",
      "--agent",
      "creative-director",
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
