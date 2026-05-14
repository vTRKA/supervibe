import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  createWorkflowReceiptEvidenceSnapshot,
  readWorkflowReceiptEvidenceSnapshot,
  validateWorkflowReceiptEvidenceSnapshot,
} from "../scripts/lib/supervibe-receipt-snapshot-store.mjs";
import {
  issueWorkflowInvocationReceipt,
  validateWorkflowReceipts,
} from "../scripts/lib/supervibe-workflow-receipt-runtime.mjs";

async function writeUtf8(root, relPath, content) {
  const absPath = join(root, ...relPath.split("/"));
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, content, "utf8");
}

test("receipt evidence snapshot store writes compact immutable snapshot records", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-receipt-snapshot-"));
  try {
    const snapshotRef = await createWorkflowReceiptEvidenceSnapshot({
      rootDir: root,
      receiptId: "workflow-test",
      command: "/supervibe-plan",
      subjectType: "skill",
      subjectId: "supervibe:writing-plans",
      stage: "stage-1-plan",
      handoffId: "plan-test",
      createdAt: "2026-05-14T00:00:00.000Z",
      inputHashes: [],
      outputHashes: [{ path: ".supervibe/artifacts/plans/plan.md", exists: true, sha256: "abc123" }],
    });

    assert.match(snapshotRef.path, /_workflow-receipt-snapshots\/supervibe-plan\/plan-test\/workflow-test\.json$/);
    assert.match(snapshotRef.sha256, /^[a-f0-9]{64}$/);
    const snapshot = JSON.parse(await readFile(join(root, ...snapshotRef.path.split("/")), "utf8"));
    assert.equal(snapshot.receiptId, "workflow-test");
    assert.deepEqual(snapshot.outputHashes, [{ path: ".supervibe/artifacts/plans/plan.md", exists: true, sha256: "abc123" }]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("receipt trust survives live output changes but fails missing or forged snapshots", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-receipt-snapshot-trust-"));
  try {
    const output = ".supervibe/artifacts/loops/checkout/run.md";
    await writeUtf8(root, output, "# Original\n");
    const issued = await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/supervibe-loop",
      subjectType: "command",
      subjectId: "loop-runner",
      stage: "wave-1",
      invocationReason: "snapshot-backed proof",
      outputArtifacts: [output],
      startedAt: "2026-05-14T00:00:00.000Z",
      completedAt: "2026-05-14T00:01:00.000Z",
      handoffId: "snapshot-trust",
      secret: "test-secret",
    });

    assert.equal(validateWorkflowReceipts(root, { secret: "test-secret" }).pass, true);
    await writeUtf8(root, output, "# Mutated Later\n");
    const mutated = validateWorkflowReceipts(root, { secret: "test-secret" });
    assert.equal(mutated.pass, true);
    assert.ok(mutated.diagnostics.some((item) => /live-output-changed/.test(item.message)));

    const snapshot = await readWorkflowReceiptEvidenceSnapshot(root, issued.receipt);
    assert.equal(snapshot.receiptId, issued.receipt.receiptId);

    const snapshotPath = join(root, ...issued.receipt.evidenceSnapshot.path.split("/"));
    await writeFile(snapshotPath, JSON.stringify({ ...snapshot, outputHashes: [] }, null, 2) + "\n", "utf8");
    const forged = validateWorkflowReceiptEvidenceSnapshot(root, issued.receipt);
    assert.equal(forged.pass, false);
    assert.ok(forged.issues.some((issue) => /hash mismatch|output hashes mismatch/.test(issue)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
