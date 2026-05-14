import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { formatCleanupOrchestratorReport, runCleanupOrchestrator } from "../scripts/lib/supervibe-cleanup-orchestrator.mjs";

test("cleanup orchestrator is dry-run by default and reports component summaries", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-cleanup-orchestrator-"));
  try {
    await writeText(root, ".supervibe/memory/workflow-invocation-ledger.jsonl", "");
    const report = await runCleanupOrchestrator({ rootDir: root, now: "2026-05-06T00:00:00.000Z" });
    assert.equal(report.mode, "dry-run");
    assert.equal(report.dryRun, true);
    assert.ok(report.components.reachability);
    assert.match(formatCleanupOrchestratorReport(report), /SUPERVIBE_CLEANUP_ORCHESTRATOR/);
    assert.match(formatCleanupOrchestratorReport(report), /ACTION_REPORT:/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cleanup orchestrator keeps auto-safe behind policy decisions", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-cleanup-orchestrator-auto-"));
  try {
    await writeText(root, ".supervibe/logs/runtime.log", "old log");
    const report = await runCleanupOrchestrator({ rootDir: root, mode: "auto-safe", now: "2026-05-06T00:00:00.000Z" });
    assert.equal(report.mode, "auto-safe");
    assert.ok(report.actions.delete >= 1);
    assert.equal(report.dryRun, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function writeText(root, relPath, value) {
  const abs = join(root, ...relPath.split("/"));
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, value, "utf8");
}
