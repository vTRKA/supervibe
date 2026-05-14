import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
  findWorkflowReceiptIndexMatches,
  readWorkflowReceiptIndex,
} from "../scripts/lib/supervibe-receipt-index.mjs";
import {
  issueWorkflowInvocationReceipt,
  validateScopedWorkflowReceipts,
} from "../scripts/lib/supervibe-workflow-receipt-runtime.mjs";

const execFileAsync = promisify(execFile);
const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));

async function writeUtf8(root, relPath, content) {
  const absPath = join(root, ...relPath.split("/"));
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, content, "utf8");
}

test("workflow receipt index is updated at issue time and powers scoped validation", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-receipt-index-"));
  try {
    const output = ".supervibe/artifacts/loops/ship/run.md";
    await writeUtf8(root, output, "# Scoped\n");
    await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/supervibe-loop",
      subjectType: "command",
      subjectId: "ship-runner",
      stage: "work-item-execution",
      invocationReason: "indexed receipt proof",
      outputArtifacts: [output],
      startedAt: "2026-05-14T00:00:00.000Z",
      completedAt: "2026-05-14T00:01:00.000Z",
      handoffId: "ship-indexed",
      secret: "test-secret",
    });

    const index = readWorkflowReceiptIndex(root);
    assert.equal(index.receipts.length, 1);
    const matches = findWorkflowReceiptIndexMatches(root, {
      command: "/supervibe-loop",
      handoffId: "ship-indexed",
      stages: ["work-item-execution"],
      subjectIds: ["ship-runner"],
      artifactPaths: [output],
    });
    assert.equal(matches.available, true);
    assert.equal(matches.receiptPaths.length, 1);

    const scoped = validateScopedWorkflowReceipts(root, {
      command: "/supervibe-loop",
      handoffId: "ship-indexed",
      stage: "work-item-execution",
      subjectId: "ship-runner",
      artifact: output,
      secret: "test-secret",
    });
    assert.equal(scoped.pass, true);
    assert.equal(scoped.indexMode, "indexed");
    assert.equal(scoped.checked, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("workflow receipt validator reports indexed scoped fast path", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-receipt-index-cli-"));
  try {
    const output = ".supervibe/artifacts/loops/ship/run.md";
    await writeUtf8(root, output, "# Scoped\n");
    await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/supervibe-loop",
      subjectType: "command",
      subjectId: "ship-runner",
      stage: "work-item-execution",
      invocationReason: "indexed receipt proof",
      outputArtifacts: [output],
      startedAt: "2026-05-14T00:00:00.000Z",
      completedAt: "2026-05-14T00:01:00.000Z",
      handoffId: "ship-indexed",
      secret: "test-secret",
    });

    const { stdout } = await execFileAsync(process.execPath, [
      "scripts/validate-workflow-receipts.mjs",
      "--root",
      root,
      "--command",
      "/supervibe-loop",
      "--handoff-id",
      "ship-indexed",
      "--stage",
      "work-item-execution",
      "--subject-id",
      "ship-runner",
      "--artifact",
      output,
      "--secret",
      "test-secret",
    ], { cwd: REPO_ROOT });

    assert.match(stdout, /INDEX_MODE: indexed/);
    assert.match(stdout, /BATCHING_OPTIMIZATION: scoped-trust-fast-path/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
