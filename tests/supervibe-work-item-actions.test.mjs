import assert from "node:assert/strict";
import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { mutateWorkItemGraph, mutateWorkItemGraphFile } from "../scripts/lib/supervibe-work-item-actions.mjs";

const baseGraph = () => ({
  kind: "supervibe-work-item-graph",
  graph_id: "epic-claims",
  items: [{ itemId: "task-1", type: "task", status: "open", title: "Task 1" }],
  tasks: [{ id: "task-1", status: "open" }],
  claims: [],
});

test("work-item claim writes an expiring lease", () => {
  const result = mutateWorkItemGraph(baseGraph(), {
    type: "claim",
    itemId: "task-1",
    actor: "agent-a",
    now: "2026-05-07T00:00:00.000Z",
    leaseTtlMinutes: 10,
  });

  assert.equal(result.action, "claim");
  assert.equal(result.changed, true);
  assert.equal(result.claim.expiresAt, "2026-05-07T00:10:00.000Z");
  assert.equal(result.graph.items[0].status, "claimed");
  assert.equal(result.graph.events.length, 1);
  assert.equal(result.graph.events[0].action, "claim");
  assert.equal(result.graph.events[0].actor, "agent-a");
});

test("work-item claim blocks duplicate active leases with conflict evidence", () => {
  const first = mutateWorkItemGraph(baseGraph(), {
    type: "claim",
    itemId: "task-1",
    actor: "agent-a",
    now: "2026-05-07T00:00:00.000Z",
    leaseTtlMinutes: 10,
  });
  const second = mutateWorkItemGraph(first.graph, {
    type: "claim",
    itemId: "task-1",
    actor: "agent-b",
    now: "2026-05-07T00:01:00.000Z",
  });

  assert.equal(second.action, "claim-blocked");
  assert.equal(second.changed, false);
  assert.equal(second.conflict.reason, "work-item-already-claimed");
  assert.equal(second.conflict.agentId, "agent-a");
  assert.equal(second.graph.claims.length, 1);
  assert.equal(second.graph.events.length, 2);
  assert.equal(second.graph.events[1].action, "claim-blocked");
  assert.equal(second.graph.events[1].changed, false);
});

test("work-item claim safely recovers expired stale leases", () => {
  const first = mutateWorkItemGraph(baseGraph(), {
    type: "claim",
    itemId: "task-1",
    actor: "agent-a",
    now: "2026-05-07T00:00:00.000Z",
    leaseTtlMinutes: 1,
  });
  const second = mutateWorkItemGraph(first.graph, {
    type: "claim",
    itemId: "task-1",
    actor: "agent-b",
    now: "2026-05-07T00:02:00.000Z",
  });

  assert.equal(second.action, "claim");
  assert.equal(second.graph.claims[0].status, "expired");
  assert.equal(second.graph.claims[0].recovery, "safe-stale-claim-recovery");
  assert.equal(second.graph.claims[1].agentId, "agent-b");
});

test("work-item terminal actions append audit events", () => {
  const result = mutateWorkItemGraph(baseGraph(), {
    type: "complete",
    itemId: "task-1",
    actor: "agent-a",
    reason: "verified",
    now: "2026-05-07T00:00:00.000Z",
  });

  assert.equal(result.graph.items[0].status, "complete");
  assert.equal(result.graph.events.length, 1);
  assert.equal(result.graph.events[0].action, "complete");
  assert.equal(result.graph.events[0].reason, "verified");
});

test("work-item graph file mutations use lock file and remove it after write", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-actions-"));
  const graphPath = join(rootDir, "graph.json");
  await writeFile(graphPath, `${JSON.stringify(baseGraph(), null, 2)}\n`, "utf8");

  const result = await mutateWorkItemGraphFile(graphPath, {
    type: "claim",
    itemId: "task-1",
    actor: "agent-a",
    now: "2026-05-07T00:00:00.000Z",
  });
  const saved = JSON.parse(await readFile(graphPath, "utf8"));

  assert.equal(result.changed, true);
  assert.equal(saved.events[0].action, "claim");
  await assert.rejects(access(`${graphPath}.lock`));
});

test("work-item graph file mutation refuses active lock", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-actions-locked-"));
  const graphPath = join(rootDir, "graph.json");
  await writeFile(graphPath, `${JSON.stringify(baseGraph(), null, 2)}\n`, "utf8");
  await writeFile(`${graphPath}.lock`, JSON.stringify({ acquiredAt: "2026-05-07T00:00:00.000Z" }), "utf8");

  await assert.rejects(
    mutateWorkItemGraphFile(graphPath, {
      type: "claim",
      itemId: "task-1",
      actor: "agent-a",
      now: "2026-05-07T00:00:01.000Z",
      lockTimeoutMs: 20,
      lockRetryDelayMs: 1,
      staleLockMs: 60_000,
    }),
    /locked/,
  );
});
