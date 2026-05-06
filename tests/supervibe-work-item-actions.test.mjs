import assert from "node:assert/strict";
import test from "node:test";

import { mutateWorkItemGraph } from "../scripts/lib/supervibe-work-item-actions.mjs";

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
