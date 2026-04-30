import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createWorkItemWatchRecord,
  defaultWorkItemDaemonPath,
  diagnoseWorkItemDaemonState,
  formatWorkItemWatchStatus,
  heartbeatWorkItemWatch,
  readWorkItemDaemonState,
  stopWorkItemWatch,
  upsertWorkItemWatch,
  writeWorkItemDaemonState,
} from "../scripts/lib/supervibe-work-item-daemon.mjs";
import { diagnoseTaskTracker } from "../scripts/lib/supervibe-task-tracker-doctor.mjs";

test("work-item watch records are opt-in, visible, and read-only", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-watch-"));
  const path = defaultWorkItemDaemonPath(root);
  const record = createWorkItemWatchRecord({
    runId: "run-1",
    epicId: "epic-1",
    pid: 123,
    snapshot: { ready: 2, blocked: 1, delegated: 1, review: 1 },
  });
  const state = upsertWorkItemWatch({ watches: [] }, record);
  await writeWorkItemDaemonState(path, state);
  const loaded = await readWorkItemDaemonState(path);

  assert.equal(loaded.watches[0].mutationMode, "read-only");
  assert.match(formatWorkItemWatchStatus(loaded), /ready=2/);

  const heartbeat = heartbeatWorkItemWatch(loaded, record.id, { now: "2026-04-29T01:00:00.000Z" });
  assert.equal(heartbeat.watches[0].heartbeatAt, "2026-04-29T01:00:00.000Z");
  assert.equal(stopWorkItemWatch(heartbeat, record.id).watches[0].status, "stopped");
});

test("doctor detects orphan or stale watch daemon state", () => {
  const state = {
    watches: [createWorkItemWatchRecord({ id: "ignored", pid: 999999, startedAt: "2026-04-29T00:00:00.000Z", heartbeatAt: "2026-04-29T00:00:00.000Z" })],
  };
  const diagnosis = diagnoseWorkItemDaemonState(state, {
    now: "2026-04-29T01:00:00.000Z",
    pidAlive: () => false,
    staleMinutes: 5,
  });
  assert.ok(diagnosis.issues.some((issue) => issue.code === "orphan-watch-daemon"));
  assert.ok(diagnosis.issues.some((issue) => issue.code === "stale-watch-daemon"));

  const tracker = diagnoseTaskTracker({ graph: { items: [] }, mapping: {}, daemonState: state });
  assert.ok(tracker.counts.staleDaemons >= 1);
});
