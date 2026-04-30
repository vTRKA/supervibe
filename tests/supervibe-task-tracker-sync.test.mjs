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
  materializeEpicAndTasks,
  readTrackerMapping,
  syncClaim,
  syncClose,
  syncPush,
  syncReadyFront,
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
`, { planPath: "docs/plans/sample.md", epicId: "epic-sample", planReviewPassed: true });
}

test("sync push materializes epic, child tasks, dependencies, and writes mapping", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-tracker-sync-"));
  const graph = sampleGraph();
  const adapter = createMemoryTaskTrackerAdapter();
  const mappingPath = join(rootDir, "task-tracker-map.json");

  const result = await materializeEpicAndTasks(graph, adapter, { rootDir, mappingPath });
  const mapping = await readTrackerMapping(mappingPath);

  assert.equal(result.status, "synced");
  assert.equal(result.nativeGraphPreserved, true);
  assert.equal(result.created.tasks.length, graph.items.length - 1);
  assert.ok(Object.values(mapping.items).every((item) => item.externalId));
});

test("unavailable adapter falls back to native graph without failing planning", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-tracker-fallback-"));
  const result = await materializeEpicAndTasks(sampleGraph(), createUnavailableTaskTrackerAdapter(), {
    rootDir,
    mappingPath: join(rootDir, "map.json"),
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "native-fallback");
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

test("worktree visibility validates shared tracker mapping", async () => {
  const graph = sampleGraph();
  const pushed = await syncPush(graph, createMemoryTaskTrackerAdapter(), { dryRun: true });
  const taskId = graph.items.find((item) => item.type !== "epic").itemId;

  assert.equal(validateWorktreeTrackerVisibility({ sessionId: "s1", epicId: graph.epicId, workItemIds: [taskId] }, pushed.mapping).ok, true);
  assert.equal(validateWorktreeTrackerVisibility({ sessionId: "s2", epicId: "other", workItemIds: [taskId] }, pushed.mapping).ok, false);
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
  const mapping = await readFile(join(rootDir, ".claude", "memory", "loops", "task-tracker-map.json"), "utf8");
  assert.match(mapping, /epic-sample/);
});
