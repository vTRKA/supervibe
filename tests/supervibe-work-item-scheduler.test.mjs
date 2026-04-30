import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createWorkItemIndex } from "../scripts/lib/supervibe-work-item-query.mjs";
import {
  buildSchedulerSnapshot,
  createScheduledCheck,
  DEFER_CONDITIONS,
  deferWorkItemFile,
  deferWorkItemInGraph,
  evaluateScheduledChecks,
  formatSchedulerSnapshot,
  isWorkItemDeferred,
} from "../scripts/lib/supervibe-work-item-scheduler.mjs";

const execFileAsync = promisify(execFile);
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function graph() {
  return {
    items: [{ itemId: "task-123", title: "Deferred task", status: "open" }],
    tasks: [{ id: "task-123", status: "open", dependencies: [] }],
  };
}

test("scheduler defers work deterministically and evaluates scheduled checks without mutation", () => {
  const result = deferWorkItemInGraph(graph(), {
    itemId: "task-123",
    until: "2026-05-01T09:00:00.000Z",
    now: "2026-04-30T09:00:00.000Z",
  });
  const index = createWorkItemIndex({ graph: result.graph, now: "2026-04-30T10:00:00.000Z" });
  const check = createScheduledCheck({ itemId: "task-123", at: "2026-04-30T09:30:00.000Z" });
  const scheduled = evaluateScheduledChecks({ checks: [check], index, now: "2026-04-30T10:00:00.000Z" });
  const snapshot = buildSchedulerSnapshot(index, { checks: [check], now: "2026-04-30T10:00:00.000Z" });

  assert.ok(DEFER_CONDITIONS.includes("timestamp"));
  assert.equal(isWorkItemDeferred(index[0], { now: "2026-04-30T10:00:00.000Z" }), true);
  assert.equal(index[0].effectiveStatus, "deferred");
  assert.equal(scheduled.remoteMutation, false);
  assert.equal(scheduled.due.length, 1);
  assert.match(formatSchedulerSnapshot(snapshot), /DEFERRED: 1/);
});

test("defer file and loop CLI write local graph updates with backup", async () => {
  const dir = await mkdtemp(join(tmpdir(), "supervibe-defer-"));
  const graphPath = join(dir, "graph.json");
  await writeFile(graphPath, JSON.stringify(graph()), "utf8");

  const dryRun = await deferWorkItemFile(graphPath, {
    itemId: "task-123",
    until: "2026-05-01T09:00:00.000Z",
    dryRun: true,
  });
  assert.equal(dryRun.dryRun, true);
  assert.doesNotMatch(await readFile(graphPath, "utf8"), /deferredUntil/);

  const cli = await execFileAsync(process.execPath, [
    join(ROOT, "scripts", "supervibe-loop.mjs"),
    "--defer",
    "task-123",
    "--until",
    "2026-05-01T09:00:00.000Z",
    "--file",
    graphPath,
  ], { cwd: ROOT });
  const updated = JSON.parse(await readFile(graphPath, "utf8"));

  assert.match(cli.stdout, /SUPERVIBE_WORK_ITEM_DEFER/);
  assert.equal(updated.items[0].deferredUntil, "2026-05-01T09:00:00.000Z");
});
