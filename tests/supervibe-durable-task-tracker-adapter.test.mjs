import assert from "node:assert/strict";
import test from "node:test";
import {
  assertTaskTrackerAdapter,
  createMemoryTaskTrackerAdapter,
  createUnavailableTaskTrackerAdapter,
  detectTaskTrackerCapability,
  parseJsonAdapterOutput,
} from "../scripts/lib/supervibe-durable-task-tracker-adapter.mjs";

test("task tracker adapter interface exposes required methods", () => {
  const adapter = createMemoryTaskTrackerAdapter();

  assert.equal(assertTaskTrackerAdapter(adapter), true);
  assert.equal(adapter.id, "memory-tracker");
});

test("capability detection falls back to native graph when tracker is unavailable", async () => {
  const adapter = createUnavailableTaskTrackerAdapter("missing cli");
  const detection = await adapter.detect();

  assert.equal(detection.status, "unavailable");
  assert.equal(detection.capabilities.nativeGraphFallback, true);
  assert.equal(detectTaskTrackerCapability({ availableCommands: {} }).status, "unavailable");
});

test("memory adapter creates epic, child task, dependency, ready query, claim, and close", async () => {
  const adapter = createMemoryTaskTrackerAdapter();
  const epic = await adapter.createEpic({ itemId: "epic-1", title: "Epic" });
  const task = await adapter.createTask({ itemId: "task-1", title: "Task" });
  const blocked = await adapter.createTask({ itemId: "task-2", title: "Blocked" });
  await adapter.addDependency({ fromExternalId: task.externalId, toExternalId: blocked.externalId, type: "blocks" });

  const ready = await adapter.ready();
  assert.deepEqual(ready.tasks.map((item) => item.externalId), [task.externalId]);

  const claim = await adapter.claim({ externalId: task.externalId, owner: "worker", sessionId: "session-1" });
  assert.equal(claim.ok, true);
  assert.equal((await adapter.claim({ externalId: task.externalId, owner: "other" })).ok, false);

  const closed = await adapter.close({ externalId: task.externalId, evidence: ["npm test"], reason: "verified" });
  assert.equal(closed.record.status, "complete");
  assert.equal(epic.ok, true);
});

test("adapter output parser requires typed JSON or reports parse error", () => {
  assert.deepEqual(parseJsonAdapterOutput('{"ok":true}'), { ok: true, value: { ok: true } });
  assert.equal(parseJsonAdapterOutput("not json").ok, false);
});
