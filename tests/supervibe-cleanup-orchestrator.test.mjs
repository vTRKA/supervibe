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

test("cleanup orchestrator reports global host-managed debt as diagnostic outside strict release", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-cleanup-orchestrator-host-debt-"));
  try {
    await writeText(root, ".supervibe/memory/agent-invocations.jsonl", JSON.stringify({
      ts: "2026-05-14T00:00:00.000Z",
      agent_id: "repo-researcher",
      host: "codex",
      host_invocation_source: "codex-spawn-agent",
      host_invocation_id: "codex-worker-1",
      invocation_id: "codex-worker-1",
      status: "completed",
    }) + "\n");

    const dryRun = await runCleanupOrchestrator({ rootDir: root, mode: "dry-run", now: "2026-05-06T00:00:00.000Z" });
    assert.equal(dryRun.blocked, false);
    assert.deepEqual(dryRun.terminalSignals.blocked, []);
    assert.deepEqual(dryRun.terminalSignals.diagnostics, ["host-managed-subagent-close-state"]);
    assert.equal(dryRun.terminalSignals.hostManaged.blockingCount, 0);
    assert.equal(dryRun.terminalSignals.hostManaged.diagnosticCount, 1);

    const strict = await runCleanupOrchestrator({ rootDir: root, mode: "manual-apply", now: "2026-05-06T00:00:00.000Z" });
    assert.equal(strict.blocked, true);
    assert.deepEqual(strict.terminalSignals.blocked, ["host-managed-subagent-close-state"]);
    assert.equal(strict.terminalSignals.hostManaged.blockingCount, 1);
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
