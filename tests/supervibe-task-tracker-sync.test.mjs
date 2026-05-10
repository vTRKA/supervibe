import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import { atomizePlanToWorkItems } from "../scripts/lib/supervibe-plan-to-work-items.mjs";
import { mergeExternalTrackerStatus, reconcileReadyFrontWithTracker } from "../scripts/lib/autonomous-loop-task-graph.mjs";
import { createMemoryTaskTrackerAdapter, createUnavailableTaskTrackerAdapter } from "../scripts/lib/supervibe-durable-task-tracker-adapter.mjs";
import {
  diagnoseTrackerSyncConflicts,
  materializeEpicAndTasks,
  readTrackerMapping,
  redactTrackerSyncDiagnostics,
  syncClaim,
  syncClose,
  syncPush,
  syncReadyFront,
  validateTrackerMapping,
} from "../scripts/lib/supervibe-task-tracker-sync.mjs";
import { validateWorktreeTrackerVisibility } from "../scripts/lib/supervibe-worktree-session-manager.mjs";

const execFileAsync = promisify(execFile);

function sampleGraph() {
  return atomizePlanToWorkItems(`# Plan

Critical path: T1 -> T2

## Task 1: Build core
**Acceptance Criteria:**
- Core works
\`\`\`bash
npm test
\`\`\`

## Task 2: Verify integration
**Acceptance Criteria:**
- Integration works
\`\`\`bash
npm test
\`\`\`
`, { planPath: ".supervibe/artifacts/plans/sample.md", epicId: "epic-sample", planReviewPassed: true });
}

test("sync push materializes epic, child tasks, dependencies, and writes mapping", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-tracker-sync-"));
  const graph = sampleGraph();
  const adapter = createMemoryTaskTrackerAdapter();
  const mappingPath = join(rootDir, "task-tracker-map.json");

  const result = await materializeEpicAndTasks(graph, adapter, { rootDir, mappingPath });
  const mapping = await readTrackerMapping(mappingPath);

  assert.equal(graph.graph_id, graph.epicId);
  assert.equal(graph.items[0].type, "epic");
  assert.equal(graph.items[0].parentId, null);
  assert.equal(result.status, "synced");
  assert.equal(result.nativeGraphPreserved, true);
  assert.equal(result.created.tasks.length, graph.items.length - 1);
  assert.ok(Object.values(mapping.items).every((item) => item.externalId));
});

test("unavailable external adapter keeps canonical native graph without failing planning", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-tracker-fallback-"));
  const result = await materializeEpicAndTasks(sampleGraph(), createUnavailableTaskTrackerAdapter(), {
    rootDir,
    mappingPath: join(rootDir, "map.json"),
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "native-ready");
  assert.equal(result.nativeGraphPreserved, true);
});

test("ready, claim, close, and status reconciliation use native mapping", async () => {
  const graph = sampleGraph();
  const adapter = createMemoryTaskTrackerAdapter();
  const pushed = await syncPush(graph, adapter, { dryRun: true });
  const task = graph.tasks.find((candidate) => candidate.id.endsWith("-t1"));

  const ready = await syncReadyFront(graph, adapter, pushed.mapping);
  assert.ok(ready.reconciledReady.some((item) => item.id === task.id));

  const claim = await syncClaim({
    claims: [],
    task,
    adapter,
    mapping: pushed.mapping,
    agentId: "worker-1",
    attemptId: "attempt-1",
    session: { sessionId: "session-1", worktreePath: ".worktrees/session-1" },
  });
  assert.equal(claim.ok, true);
  assert.equal(claim.claim.externalTrackerClaim.sessionId, "session-1");

  assert.equal((await syncClose({ task, adapter, mapping: pushed.mapping })).ok, false);
  assert.equal((await syncClose({ task, adapter, mapping: pushed.mapping, evidence: ["npm test"] })).ok, true);

  const merged = mergeExternalTrackerStatus(graph, [{ nativeId: task.id, externalId: pushed.mapping.items[task.id].externalId, status: "done" }]);
  assert.equal(merged.tasks.find((item) => item.id === task.id).status, "complete");

  const reconciled = reconcileReadyFrontWithTracker([task], [{ externalId: pushed.mapping.items[task.id].externalId }], pushed.mapping);
  assert.equal(reconciled[0].trackerReady, true);
});

test("tracker ready front unblocks dependents after blocker closes", async () => {
  const graph = sampleGraph();
  const adapter = createMemoryTaskTrackerAdapter();
  const pushed = await syncPush(graph, adapter, { dryRun: true });
  const blocker = graph.tasks.find((candidate) => candidate.id.endsWith("-t1"));
  const dependent = graph.tasks.find((candidate) => candidate.id.endsWith("-t2"));

  assert.equal((await syncClose({ task: blocker, adapter, mapping: pushed.mapping, evidence: ["node --test"] })).ok, true);
  const nativeClosedGraph = {
    ...graph,
    tasks: graph.tasks.map((task) => task.id === blocker.id ? { ...task, status: "complete" } : task),
  };
  const ready = await syncReadyFront(nativeClosedGraph, adapter, pushed.mapping);

  assert.ok(ready.nativeReady.some((item) => item.id === dependent.id));
  assert.ok(ready.reconciledReady.some((item) => item.id === dependent.id));
  assert.equal(ready.blockedByTracker.some((item) => item.id === dependent.id), false);
});

test("task graph only materialization creates mapping and dependency edges", async () => {
  const graph = {
    graph_id: "loop-run-1",
    source: { type: "request", request: "validate integrations" },
    tasks: [
      {
        id: "task-a",
        goal: "Build foundation",
        status: "open",
        dependencies: [],
        verificationCommands: ["npm test"],
      },
      {
        id: "task-b",
        goal: "Verify dependent",
        status: "open",
        dependencies: ["task-a"],
        verificationCommands: ["npm test"],
      },
    ],
  };
  const adapter = createMemoryTaskTrackerAdapter();
  const result = await syncPush(graph, adapter, { dryRun: true });

  assert.equal(result.status, "synced");
  assert.ok(result.mapping.items["task-a"].externalId);
  assert.ok(result.mapping.items["task-b"].externalId);
  assert.equal(result.created.tasks.length, 2);
  assert.equal(result.created.dependencies.length, 1);

  const ready = await syncReadyFront(graph, adapter, result.mapping);
  assert.deepEqual(ready.reconciledReady.map((item) => item.id), ["task-a"]);

  assert.equal((await syncClose({
    task: graph.tasks[0],
    adapter,
    mapping: result.mapping,
    evidence: ["node --test"],
  })).ok, true);

  const closedGraph = {
    ...graph,
    tasks: graph.tasks.map((task) => task.id === "task-a" ? { ...task, status: "complete" } : task),
  };
  const afterClose = await syncReadyFront(closedGraph, adapter, result.mapping);
  assert.deepEqual(afterClose.reconciledReady.map((item) => item.id), ["task-b"]);
});

test("worktree visibility validates shared tracker mapping", async () => {
  const graph = sampleGraph();
  const pushed = await syncPush(graph, createMemoryTaskTrackerAdapter(), { dryRun: true });
  const taskId = graph.items.find((item) => item.type !== "epic").itemId;

  assert.equal(validateWorktreeTrackerVisibility({ sessionId: "s1", epicId: graph.epicId, workItemIds: [taskId] }, pushed.mapping).ok, true);
  assert.equal(validateWorktreeTrackerVisibility({ sessionId: "s2", epicId: "other", workItemIds: [taskId] }, pushed.mapping).ok, false);
});

test("tracker mapping validation rejects stale or duplicate native links before sync", async () => {
  const graph = sampleGraph();
  const pushed = await syncPush(graph, createMemoryTaskTrackerAdapter(), { dryRun: true });
  const taskId = graph.items.find((item) => item.type !== "epic").itemId;
  const invalid = {
    ...pushed.mapping,
    items: {
      ...pushed.mapping.items,
      orphan: { nativeId: "orphan", externalId: pushed.mapping.items[taskId].externalId },
    },
  };

  const report = validateTrackerMapping({ graph, mapping: invalid, requireComplete: true });

  assert.equal(report.ok, false);
  assert.ok(report.issues.some((item) => item.code === "orphan-mapping"));
});

test("tracker sync reports native, external, and both-changed conflicts without mutating mapping", async () => {
  const graph = sampleGraph();
  const pushed = await syncPush(graph, createMemoryTaskTrackerAdapter(), { dryRun: true });
  const items = graph.items.slice(0, 3);
  const mapping = {
    ...pushed.mapping,
    updatedAt: "2026-01-01T00:00:00.000Z",
    items: { ...pushed.mapping.items },
  };
  mapping.items[items[0].itemId] = { ...mapping.items[items[0].itemId], externalItemHash: "old-epic" };
  mapping.items[items[1].itemId] = { ...mapping.items[items[1].itemId], externalItemHash: "stable-task" };
  mapping.items[items[2].itemId] = { ...mapping.items[items[2].itemId], externalItemHash: "old-task" };
  const dirtyGraph = {
    ...graph,
    items: graph.items.map((item) => {
      if (item.itemId === items[0].itemId || item.itemId === items[1].itemId) {
        return { ...item, title: `${item.title} changed`, updatedAt: "2026-02-01T00:00:00.000Z" };
      }
      return item;
    }),
  };
  const externalState = {
    tasks: [
      { externalId: mapping.items[items[0].itemId].externalId, itemHash: "new-epic", updatedAt: "2026-02-01T00:00:00.000Z" },
      { externalId: mapping.items[items[2].itemId].externalId, itemHash: "new-task", updatedAt: "2026-02-01T00:00:00.000Z" },
    ],
  };

  const report = diagnoseTrackerSyncConflicts({ graph: dirtyGraph, mapping, externalState });
  const statuses = new Set(report.conflicts.map((item) => item.status));

  assert.equal(report.ok, false);
  assert.ok(statuses.has("both-changed"));
  assert.ok(statuses.has("native-newer"));
  assert.ok(statuses.has("external-newer"));
});

test("partial tracker sync preserves created mapping and returns retry guidance", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-tracker-partial-"));
  const mappingPath = join(rootDir, "map.json");
  const adapter = {
    id: "failing-tracker",
    async detect() {
      return { available: true, status: "available-ready", adapterId: "failing-tracker" };
    },
    async createEpic(epic) {
      return { ok: true, externalId: `EXT-${epic.itemId}` };
    },
    async createTask() {
      throw new Error("upstream rejected token=secret-value");
    },
    async addDependency() {
      return { ok: true };
    },
  };

  const result = await materializeEpicAndTasks(sampleGraph(), adapter, { rootDir, mappingPath });
  const mapping = await readTrackerMapping(mappingPath);

  assert.equal(result.ok, false);
  assert.equal(result.status, "partial-sync");
  assert.equal(result.error, "upstream rejected token=[REDACTED]");
  assert.equal(mapping.status, "partial-sync");
  assert.ok(Object.values(mapping.items).some((item) => item.externalId));
  assert.match(result.recovery.nextAction, /rerun tracker sync push/);
});

test("tracker sync diagnostics redact secrets in nested payloads", () => {
  const redacted = redactTrackerSyncDiagnostics({
    apiKey: "abc123",
    reason: "failed with Bearer abcdefghijklmnop and token=secret-value",
    nested: [{ password: "pw", note: "safe" }],
  });

  assert.equal(redacted.apiKey, "[REDACTED]");
  assert.equal(redacted.nested[0].password, "[REDACTED]");
  assert.equal(redacted.nested[0].note, "safe");
  assert.match(redacted.reason, /Bearer \[REDACTED\]/);
  assert.match(redacted.reason, /token=\[REDACTED\]/);
});

test("loop CLI tracker sync push writes mapping and preserves native graph", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-tracker-cli-"));
  const graphPath = join(rootDir, "graph.json");
  await writeFile(graphPath, `${JSON.stringify(sampleGraph(), null, 2)}\n`, "utf8");

  const scriptPath = join(process.cwd(), "scripts", "supervibe-loop.mjs");
  const { stdout } = await execFileAsync(process.execPath, [
    scriptPath,
    "--tracker-sync-push",
    "--tracker",
    "memory",
    "--file",
    graphPath,
  ], { cwd: rootDir });

  assert.match(stdout, /SUPERVIBE_TRACKER_SYNC_PUSH/);
  assert.match(stdout, /STATUS: synced/);
  const mapping = await readFile(join(rootDir, ".supervibe", "memory", "loops", "task-tracker-map.json"), "utf8");
  assert.match(mapping, /epic-sample/);
});
