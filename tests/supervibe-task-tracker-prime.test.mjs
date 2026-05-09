import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createTaskTrackerPrimeSummary,
  formatTaskTrackerPrimeReminder,
} from "../scripts/lib/supervibe-task-tracker-prime.mjs";

test("task tracker prime summarizes active graph state without noisy details", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-prime-"));
  const graphDir = join(rootDir, ".supervibe", "memory", "work-items", "epic-prime");
  await mkdir(graphDir, { recursive: true });
  await mkdir(join(rootDir, ".supervibe", "memory", "loops"), { recursive: true });
  await writeFile(join(graphDir, "graph.json"), JSON.stringify({
    epicId: "epic-prime",
    graph_id: "epic-prime",
    items: [
      { itemId: "epic-prime", type: "epic", title: "Prime Epic", status: "open" },
      { itemId: "task-ready", type: "task", title: "Ready task", status: "ready" },
      { itemId: "task-claimed", type: "task", title: "Claimed task", status: "claimed", owner: "agent-a" },
      { itemId: "task-blocked", type: "task", title: "Blocked task", status: "blocked", blockers: ["task-ready"] },
    ],
  }, null, 2), "utf8");
  await writeFile(join(rootDir, ".supervibe", "memory", "loops", "task-tracker-map.json"), JSON.stringify({
    schemaVersion: 1,
    adapterId: "memory-tracker",
    status: "synced",
    graphId: "epic-prime",
    items: {
      "task-ready": { nativeId: "task-ready", externalId: "EXT-ready" },
      "task-claimed": { nativeId: "task-claimed", externalId: "EXT-claimed" },
    },
    lastSync: { status: "synced" },
  }, null, 2), "utf8");

  const summary = await createTaskTrackerPrimeSummary({ rootDir });
  const reminder = formatTaskTrackerPrimeReminder(summary);

  assert.equal(summary.active, true);
  assert.equal(summary.epics[0].epicId, "epic-prime");
  assert.equal(summary.totals.ready, 1);
  assert.equal(summary.totals.claimed, 1);
  assert.equal(summary.totals.blocked, 1);
  assert.equal(summary.mapping.status, "synced");
  assert.match(reminder, /task tracker prime/i);
  assert.match(reminder, /Ready task/);
  assert.doesNotMatch(reminder, /secret|password|token/i);
});

test("task tracker prime is quiet when no active graph exists", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-prime-empty-"));
  const summary = await createTaskTrackerPrimeSummary({ rootDir });
  assert.equal(summary.active, false);
  assert.equal(formatTaskTrackerPrimeReminder(summary), null);
});
