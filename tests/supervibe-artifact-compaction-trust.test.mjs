import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  archiveSupervibeArtifactGcCandidates,
  scanSupervibeArtifactGc,
  validateSupervibeGcStrict,
  verifyCompactManifestDigest,
} from "../scripts/lib/supervibe-artifact-gc.mjs";
import { issueWorkflowInvocationReceipt } from "../scripts/lib/supervibe-workflow-receipt-runtime.mjs";

const NOW = "2026-05-06T00:00:00.000Z";

test("trusted receipt-linked outputs compact to manifest with receipt ids and digest proof", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-compaction-trust-"));
  try {
    const outputRel = ".supervibe/artifacts/_agent-outputs/run/agent-output.json";
    const summaryRel = ".supervibe/artifacts/_agent-outputs/run/summary.md";
    await writeText(root, outputRel, JSON.stringify({ proof: "payload" }, null, 2) + "\n");
    await writeText(root, summaryRel, "# Summary\n");
    await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/codex-task",
      subjectType: "skill",
      subjectId: "supervibe:verification",
      stage: "verification",
      invocationReason: "fixture proof",
      outputArtifacts: [outputRel],
      startedAt: "2026-04-01T00:00:00.000Z",
      completedAt: "2026-04-01T00:01:00.000Z",
      handoffId: "cleanup-compaction-test",
    });
    const old = new Date("2026-04-01T00:00:00.000Z");
    await utimes(join(root, ...outputRel.split("/")), old, old);
    await utimes(join(root, ...summaryRel.split("/")), old, old);
    await utimes(join(root, ".supervibe", "artifacts", "_agent-outputs", "run"), old, old);

    const scan = await scanSupervibeArtifactGc({ rootDir: root, now: NOW, retentionDays: 14, compactAgentOutputDays: 14 });
    assert.equal(scan.compactable.length, 1);
    const result = await archiveSupervibeArtifactGcCandidates(scan, { rootDir: root, dryRun: false, runTimestamp: NOW });
    assert.equal(result.errors.length, 0);
    const manifest = JSON.parse(await readFile(join(root, ...outputRel.split("/")), "utf8"));
    assert.equal(manifest.type, "supervibe-agent-output-compact-manifest");
    assert.equal(manifest.receiptIds.length, 1);
    assert.match(manifest.receiptIds[0], /^workflow-/);
    assert.match(manifest.restoreCommand, /supervibe-gc/);
    assert.equal(existsSync(join(root, ...manifest.archivePath.split("/"))), true);
    assert.equal((await verifyCompactManifestDigest({ rootDir: root, manifestPath: outputRel })).pass, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("strict artifact GC rejects receipt-linked delete plans", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-compaction-strict-"));
  try {
    const outputRel = ".supervibe/artifacts/_agent-outputs/run/agent-output.json";
    await writeText(root, outputRel, "{}\n");
    await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/codex-task",
      subjectType: "skill",
      subjectId: "supervibe:verification",
      stage: "verification",
      invocationReason: "fixture proof",
      outputArtifacts: [outputRel],
      startedAt: "2026-04-01T00:00:00.000Z",
      completedAt: "2026-04-01T00:01:00.000Z",
      handoffId: "cleanup-strict-delete-test",
    });
    const strict = await validateSupervibeGcStrict({
      rootDir: root,
      now: NOW,
      scan: {
        summary: { candidates: 1, activeNoise: 0, compactable: 0, archiveCleanup: 0 },
        candidates: [{ relPath: outputRel, reason: "bad-plan" }],
        archiveCleanup: [],
      },
    });
    assert.equal(strict.pass, false);
    assert.match(strict.failures.join("\n"), /receipt-linked output would be deleted/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function writeText(root, relPath, value) {
  const abs = join(root, ...relPath.split("/"));
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, value, "utf8");
}
