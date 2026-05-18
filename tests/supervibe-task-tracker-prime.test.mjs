import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createTaskTrackerPrimeSummary,
  formatTaskTrackerPrimeReminder,
} from "../scripts/lib/supervibe-task-tracker-prime.mjs";
import {
  buildSupervibePrimeContext,
  formatSupervibePrimeContext,
} from "../scripts/lib/supervibe-prime-context.mjs";

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
  assert.match(summary.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(summary.activeGraphHash, /^[a-f0-9]{64}$/);
  assert.equal(summary.epics[0].graphHash, summary.activeGraphHash);
  assert.match(reminder, /activeGraphHash=/);
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


test("task tracker prime surfaces active graph hash and ready-front cache metadata", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-prime-cache-"));
  const graphDir = join(rootDir, ".supervibe", "memory", "work-items", "epic-cache");
  await mkdir(graphDir, { recursive: true });
  await writeFile(join(graphDir, "graph.json"), JSON.stringify({
    epicId: "epic-cache",
    graph_id: "epic-cache",
    items: [
      { itemId: "epic-cache", type: "epic", title: "Cache Epic", status: "open" },
      { itemId: "task-a", type: "task", title: "Ready A", status: "open" },
    ],
    tasks: [
      { id: "task-a", goal: "Ready A", status: "open" },
    ],
  }, null, 2), "utf8");

  const summary = await createTaskTrackerPrimeSummary({ rootDir });
  const reminder = formatTaskTrackerPrimeReminder(summary);

  assert.match(summary.activeGraphHash, /^[a-f0-9]{64}$/);
  assert.equal(summary.epics[0].readyFrontCache.status, "miss");
  assert.match(reminder, /ready-cache: miss/);
});

test("task tracker prime degrades on active registry and mapping mismatches", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-prime-degraded-"));
  const graphDir = join(rootDir, ".supervibe", "memory", "work-items", "epic-visible");
  const registryDir = join(rootDir, ".supervibe", "memory", "work-items");
  const loopsDir = join(rootDir, ".supervibe", "memory", "loops");
  await mkdir(graphDir, { recursive: true });
  await mkdir(loopsDir, { recursive: true });
  await writeFile(join(graphDir, "graph.json"), JSON.stringify({
    epicId: "epic-visible",
    graph_id: "epic-visible",
    items: [
      { itemId: "epic-visible", type: "epic", title: "Visible", status: "open" },
      { itemId: "task-visible", type: "task", title: "Visible task", status: "ready" },
    ],
  }, null, 2), "utf8");
  await mkdir(join(registryDir, "broken"), { recursive: true });
  await writeFile(join(registryDir, "broken", "graph.json"), "{not json", "utf8");
  await writeFile(join(registryDir, "index.json"), JSON.stringify({
    schemaVersion: 1,
    activeEpicId: "epic-other",
    activeGraphPath: ".supervibe/memory/work-items/epic-missing/graph.json",
    epics: {},
  }, null, 2), "utf8");
  await writeFile(join(loopsDir, "task-tracker-map.json"), JSON.stringify({
    schemaVersion: 1,
    status: "synced",
    graphId: "epic-mapping-other",
    items: {},
  }, null, 2), "utf8");

  const summary = await createTaskTrackerPrimeSummary({ rootDir });

  assert.equal(summary.degraded, true);
  assert.ok(summary.degradedReasons.includes("active-graph-not-found"));
  assert.ok(summary.degradedReasons.includes("active-epic-mismatch"));
  assert.ok(summary.degradedReasons.includes("tracker-mapping-graph-mismatch"));
  assert.ok(summary.degradedReasons.includes("malformed-graph-skipped"));
  assert.equal(summary.nextAction, "repair prime context mismatch before claiming work");
});

test("supervibe prime context prints graph hash, generated time, and degraded reasons", () => {
  const graph = {
    epicId: "epic-prime-context",
    graph_id: "epic-prime-context",
    items: [
      { itemId: "epic-prime-context", type: "epic", status: "open", title: "Prime Context" },
      { itemId: "task-ready", type: "task", status: "ready", title: "Ready task" },
    ],
  };

  const context = buildSupervibePrimeContext({
    graph,
    graphPath: ".supervibe/memory/work-items/epic-prime-context/graph.json",
    registry: { activeEpicId: "epic-other", activeGraphPath: ".supervibe/memory/work-items/epic-other/graph.json" },
    mapping: { graphId: "epic-mapping-other" },
    indexHealth: { status: "failed" },
  });
  const formatted = formatSupervibePrimeContext(context);

  assert.match(context.graphHash, /^[a-f0-9]{64}$/);
  assert.match(context.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(context.degraded, true);
  assert.deepEqual(context.degradedReasons.sort(), [
    "active-registry-epic-mismatch",
    "active-registry-graph-mismatch",
    "index-health-not-ready",
    "tracker-mapping-graph-mismatch",
  ].sort());
  assert.match(formatted, /GRAPH_HASH:/);
  assert.match(formatted, /GENERATED_AT:/);
  assert.match(formatted, /DEGRADED: true/);
});
