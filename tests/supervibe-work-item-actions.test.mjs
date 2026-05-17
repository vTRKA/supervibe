import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { mutateWorkItemGraph, mutateWorkItemGraphFile } from "../scripts/lib/supervibe-work-item-actions.mjs";
import { buildCommandPalette } from "../scripts/lib/supervibe-command-palette.mjs";

const execFileAsync = promisify(execFile);

const baseGraph = () => ({
  kind: "supervibe-work-item-graph",
  graph_id: "epic-claims",
  epicId: "epic-claims",
  items: [
    { itemId: "epic-claims", type: "epic", status: "open", title: "Epic", parentId: null, blocks: [], related: [], blockedBy: [] },
    { itemId: "task-1", type: "task", status: "open", title: "Task 1", parentId: "epic-claims", blocks: [], related: [], blockedBy: [] },
    { itemId: "task-2", type: "task", status: "open", title: "Task 2", parentId: "epic-claims", blocks: [], related: [], blockedBy: [] },
  ],
  tasks: [
    { id: "task-1", status: "open", dependencies: [] },
    { id: "task-2", status: "open", dependencies: [] },
  ],
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
  assert.equal(result.graph.items.find((item) => item.itemId === "task-1").status, "claimed");
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

test("claim-wave atomically claims disjoint assignments and records wave metadata", () => {
  const result = mutateWorkItemGraph(baseGraph(), {
    type: "claim-wave",
    actor: "codex-wave",
    waveId: "wave-1",
    now: "2026-05-07T00:00:00.000Z",
    claims: [
      { itemId: "task-1", writeSet: ["src/a.ts"], writeSetLock: { lockId: "write-set-task-1" } },
      { itemId: "task-2", writeSet: ["src/b.ts"], writeSetLock: { lockId: "write-set-task-2" } },
    ],
  });

  assert.equal(result.action, "claim-wave");
  assert.deepEqual(result.claimResults.map((claim) => claim.itemId), ["task-1", "task-2"]);
  assert.equal(result.graph.claims.length, 2);
  assert.equal(result.graph.claims[0].waveId, "wave-1");
  assert.deepEqual(result.graph.claims[0].writeSet, ["src/a.ts"]);
  assert.equal(result.graph.claims[0].writeSetLock.lockId, "write-set-task-1");
  assert.equal(result.graph.events[0].action, "claim-wave");
  assert.equal(result.graph.events[0].waveId, "wave-1");
});

test("claim-wave refuses all claims when one target already has an active claim", () => {
  const claimed = mutateWorkItemGraph(baseGraph(), {
    type: "claim",
    itemId: "task-1",
    actor: "agent-a",
    now: "2026-05-07T00:00:00.000Z",
  });
  const blocked = mutateWorkItemGraph(claimed.graph, {
    type: "claim-wave",
    actor: "codex-wave",
    waveId: "wave-2",
    now: "2026-05-07T00:01:00.000Z",
    claims: [
      { itemId: "task-1" },
      { itemId: "task-2" },
    ],
  });

  assert.equal(blocked.action, "claim-wave-blocked");
  assert.equal(blocked.changed, false);
  assert.equal(blocked.graph.claims.length, 1);
  assert.equal(blocked.graph.items.find((item) => item.itemId === "task-2").status, "open");
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

  assert.equal(result.graph.items.find((item) => item.itemId === "task-1").status, "complete");
  assert.equal(result.graph.events.length, 1);
  assert.equal(result.graph.events[0].action, "complete");
  assert.equal(result.graph.events[0].reason, "verified");
});

test("terminal actions retire active claims for the closed work item", () => {
  const claimed = mutateWorkItemGraph(baseGraph(), {
    type: "claim",
    itemId: "task-1",
    actor: "agent-a",
    now: "2026-05-07T00:00:00.000Z",
    leaseTtlMinutes: 60,
  });
  const closed = mutateWorkItemGraph(claimed.graph, {
    type: "complete",
    itemId: "task-1",
    actor: "agent-a",
    now: "2026-05-07T00:10:00.000Z",
    reason: "targeted verification passed",
  });

  assert.equal(closed.graph.claims[0].status, "completed");
  assert.equal(closed.graph.claims[0].completedBy, "agent-a");
  assert.equal(closed.graph.claims[0].completionStatus, "complete");
  assert.deepEqual(closed.retiredClaims.map((claim) => claim.claimId), [claimed.claim.claimId]);
  assert.deepEqual(closed.graph.events.at(-1).retiredClaims, [claimed.claim.claimId]);
});

test("terminal child completion auto-closes only its real parent epic chain", () => {
  const graph = {
    kind: "supervibe-work-item-graph",
    graph_id: "epic-root",
    epicId: "epic-root",
    items: [
      { itemId: "epic-root", type: "epic", status: "open", title: "Root", parentId: null, blocks: [], blockedBy: [] },
      { itemId: "epic-a", type: "epic", status: "open", title: "A", parentId: "epic-root", blocks: [], blockedBy: [] },
      { itemId: "epic-b", type: "epic", status: "open", title: "B", parentId: "epic-root", blocks: [], blockedBy: [] },
      { itemId: "task-a", type: "task", status: "open", title: "A task", parentId: "epic-a", blocks: [], blockedBy: [] },
      { itemId: "task-b", type: "task", status: "open", title: "B task", parentId: "epic-b", blocks: [], blockedBy: [] },
      { itemId: "task-root", type: "task", status: "open", title: "Root task", parentId: "epic-root", epicId: "epic-b", blocks: [], blockedBy: [] },
      { itemId: "follow-up", type: "followup", status: "open", title: "Deferred follow-up", parentId: "epic-a", blocks: [], blockedBy: [] },
    ],
    tasks: [
      { id: "epic-root", status: "open" },
      { id: "epic-a", status: "open" },
      { id: "epic-b", status: "open" },
      { id: "task-a", status: "open", parentId: "epic-a", dependencies: [] },
      { id: "task-b", status: "open", parentId: "epic-b", dependencies: [] },
      { id: "task-root", status: "open", parentId: "epic-root", epicId: "epic-b", dependencies: [] },
    ],
    claims: [],
  };

  const first = mutateWorkItemGraph(graph, {
    type: "complete",
    itemId: "task-a",
    actor: "agent-a",
    now: "2026-05-07T00:00:00.000Z",
  });

  assert.deepEqual(first.autoClosedEpics, ["epic-a"]);
  assert.equal(first.graph.items.find((item) => item.itemId === "epic-a").status, "closed");
  assert.equal(first.graph.items.find((item) => item.itemId === "epic-root").status, "open");
  assert.equal(first.graph.items.find((item) => item.itemId === "epic-b").status, "open");
  assert.equal(first.graph.items.find((item) => item.itemId === "follow-up").status, "open");

  const second = mutateWorkItemGraph(first.graph, {
    type: "complete",
    itemId: "task-root",
    actor: "agent-a",
    now: "2026-05-07T00:01:00.000Z",
  });

  assert.deepEqual(second.autoClosedEpics, []);
  assert.equal(second.graph.items.find((item) => item.itemId === "epic-b").status, "open");
  assert.equal(second.graph.items.find((item) => item.itemId === "epic-root").status, "open");

  const third = mutateWorkItemGraph(second.graph, {
    type: "complete",
    itemId: "task-b",
    actor: "agent-a",
    now: "2026-05-07T00:02:00.000Z",
  });

  assert.deepEqual(third.autoClosedEpics.sort(), ["epic-b", "epic-root"]);
  assert.equal(third.graph.items.find((item) => item.itemId === "epic-b").status, "closed");
  assert.equal(third.graph.items.find((item) => item.itemId === "epic-root").status, "closed");
});

test("terminal task completion auto-closes metadata semantic epics", () => {
  const graph = baseGraph();
  graph.items.find((item) => item.itemId === "epic-claims").status = "closed";
  graph.items.find((item) => item.itemId === "task-2").status = "complete";
  graph.tasks.find((task) => task.id === "task-2").status = "complete";
  graph.items.find((item) => item.itemId === "task-1").executionHints = { semanticEpicId: "semantic-epic-dev" };
  graph.items.find((item) => item.itemId === "task-2").executionHints = { semanticEpicId: "semantic-epic-dev" };
  graph.metadata = {
    semanticEpicGrouping: { version: 1, taskCount: 2, epicCount: 1 },
    semanticEpics: [{
      id: "semantic-epic-dev",
      type: "epic",
      status: "open",
      taskIds: ["task-1", "task-2"],
      taskCount: 2,
      confidence: 0.82,
    }],
  };

  const result = mutateWorkItemGraph(graph, {
    type: "complete",
    itemId: "task-1",
    actor: "agent-a",
    now: "2026-05-07T00:03:00.000Z",
  });

  assert.deepEqual(result.autoClosedEpics, ["semantic-epic-dev"]);
  assert.equal(result.graph.metadata.semanticEpics[0].status, "closed");
  assert.equal(result.graph.metadata.semanticEpics[0].closedAt, "2026-05-07T00:03:00.000Z");
  assert.equal(result.graph.items.find((item) => item.itemId === "epic-claims").status, "closed");
});

test("closing a parent auto-closes covered plan-step subtasks", () => {
  const graph = baseGraph();
  graph.items.push(
    {
      itemId: "task-1-s1",
      type: "subtask",
      status: "blocked",
      title: "Step 1",
      parentId: "task-1",
      blockedBy: ["task-1"],
      blocks: ["task-1-s2"],
      discoveredFrom: { type: "plan-step", parentItemId: "task-1" },
    },
    {
      itemId: "task-1-s2",
      type: "subtask",
      status: "blocked",
      title: "Step 2",
      parentId: "task-1",
      blockedBy: ["task-1", "task-1-s1"],
      blocks: [],
      discoveredFrom: { type: "plan-step", parentItemId: "task-1" },
    },
  );
  graph.tasks.push(
    { id: "task-1-s1", status: "blocked", dependencies: ["task-1"], parentId: "task-1" },
    { id: "task-1-s2", status: "blocked", dependencies: ["task-1", "task-1-s1"], parentId: "task-1" },
  );

  const result = mutateWorkItemGraph(graph, {
    type: "close",
    itemId: "task-1",
    actor: "agent-a",
    reason: "parent work covered generated plan steps",
    now: "2026-05-07T00:00:00.000Z",
  });

  assert.deepEqual(result.autoClosedCoveredItems.sort(), ["task-1-s1", "task-1-s2"]);
  assert.equal(result.graph.items.find((item) => item.itemId === "task-1-s1").status, "closed");
  assert.equal(result.graph.items.find((item) => item.itemId === "task-1-s2").status, "closed");
  assert.equal(result.graph.tasks.find((task) => task.id === "task-1-s1").status, "closed");
  assert.deepEqual(result.graph.events[0].autoClosedCoveredItems.sort(), ["task-1-s1", "task-1-s2"]);
});

test("work-item terminal actions preserve structured verification evidence", () => {
  const evidence = {
    command: "node --test tests/first.test.mjs",
    status: "pass",
    outputSummary: "targeted test passed",
    receiptId: "workflow-test",
  };
  const result = mutateWorkItemGraph(baseGraph(), {
    type: "complete",
    itemId: "task-1",
    actor: "agent-a",
    reason: "verified",
    verificationEvidence: [evidence],
    now: "2026-05-07T00:00:00.000Z",
  });

  const item = result.graph.items.find((candidate) => candidate.itemId === "task-1");
  const task = result.graph.tasks.find((candidate) => candidate.id === "task-1");
  assert.equal(item.verificationEvidence[0].taskId, "task-1");
  assert.equal(item.verificationEvidence[0].command, "node --test tests/first.test.mjs");
  assert.equal(item.verificationEvidence[0].outputSummary, "targeted test passed");
  assert.equal(task.verificationEvidence[0].receiptId, "workflow-test");
  assert.equal(result.graph.events[0].verificationEvidence[0].status, "pass");
});

test("work-item edit updates items and loop tasks", () => {
  const result = mutateWorkItemGraph(baseGraph(), {
    type: "edit",
    itemId: "task-1",
    patch: { title: "Updated title", priority: "high", owner: "agent-a" },
    actor: "lead",
    now: "2026-05-07T00:00:00.000Z",
  });

  assert.equal(result.changed, true);
  assert.equal(result.graph.items.find((item) => item.itemId === "task-1").title, "Updated title");
  assert.equal(result.graph.tasks.find((task) => task.id === "task-1").title, "Updated title");
  assert.equal(result.graph.events[0].action, "edit");
});

test("work-item split creates blocking subtasks under parent", () => {
  const result = mutateWorkItemGraph(baseGraph(), {
    type: "split",
    itemId: "task-1",
    titles: ["Part A", "Part B"],
    actor: "lead",
    now: "2026-05-07T00:00:00.000Z",
  });

  const subtasks = result.graph.items.filter((item) => item.type === "subtask");
  assert.equal(subtasks.length, 2);
  assert.deepEqual(subtasks.map((item) => item.parentId), ["task-1", "task-1"]);
  assert.ok(subtasks.every((item) => item.blocks.includes("task-1")));
  assert.deepEqual(result.graph.tasks.find((task) => task.id === "task-1").dependencies.sort(), subtasks.map((item) => item.itemId).sort());
});

test("work-item split preserves provenance and refreshes derived metadata", () => {
  const graph = baseGraph();
  graph.items.find((item) => item.itemId === "task-1").discoveredFrom = {
    type: "plan",
    path: ".supervibe/artifacts/plans/example.md",
    line: 12,
    taskRef: "T001",
  };
  graph.items.find((item) => item.itemId === "task-1").executionHints = {
    sourceTaskRef: "T001",
    semanticEpicId: "semantic-epic-tests",
  };
  graph.items.find((item) => item.itemId === "task-2").executionHints = {
    sourceTaskRef: "T002",
    semanticEpicId: "semantic-epic-tests",
  };
  graph.metadata = {
    taskBudgetPolicy: {
      policy: {
        schemaVersion: 1,
        maxTasksPerPhase: 30,
        maxChildItemsPerAtomizationRun: 80,
        requirePhaseSplitDecision: true,
      },
      decision: { schemaVersion: 1, status: "recorded" },
      report: { totals: { childItems: 2, implementationItems: 2 } },
    },
    semanticEpicGrouping: { version: 1, taskCount: 2, epicCount: 1 },
    semanticEpics: [{
      id: "semantic-epic-tests",
      type: "epic",
      taskIds: ["task-1", "task-2"],
      taskCount: 2,
      confidence: 0.8,
    }],
  };

  const result = mutateWorkItemGraph(graph, {
    type: "split",
    itemId: "task-1",
    titles: ["Part A", "Part B"],
    actor: "lead",
    now: "2026-05-07T00:00:00.000Z",
  });

  const subtask = result.graph.items.find((item) => item.itemId === "task-1.sub1");
  assert.equal(subtask.discoveredFrom.parentItemId, "task-1");
  assert.equal(subtask.discoveredFrom.path, ".supervibe/artifacts/plans/example.md");
  assert.equal(subtask.discoveredFrom.taskRef, "T001");
  assert.equal(subtask.executionHints.splitParentItemId, "task-1");
  assert.ok(result.graph.dependencyEdges.some((edge) => edge.from === "task-1" && edge.to === "task-1.sub1" && edge.type === "discovered-from"));
  assert.equal(result.graph.metadata.taskBudgetPolicy.report.totals.childItems, 4);
  assert.equal(result.graph.metadata.taskBudgetPolicy.report.totals.implementationItems, 4);
  assert.equal(result.graph.metadata.semanticEpicGrouping.taskCount, 4);
  assert.deepEqual(result.graph.metadata.semanticEpics[0].taskIds.sort(), ["task-1", "task-1.sub1", "task-1.sub2", "task-2"].sort());
});

test("work-item skip, cancel, reparent, and dependency mutations are audit logged", () => {
  const skipped = mutateWorkItemGraph(baseGraph(), {
    type: "skip",
    itemId: "task-1",
    reason: "out of scope",
    impact: "does not affect the accepted goal",
    now: "2026-05-07T00:00:00.000Z",
  });
  assert.equal(skipped.graph.items.find((item) => item.itemId === "task-1").status, "skipped");
  assert.equal(skipped.graph.items.find((item) => item.itemId === "task-1").skipReason, "out of scope");
  assert.equal(skipped.graph.items.find((item) => item.itemId === "task-1").skipImpact, "does not affect the accepted goal");

  const cancelled = mutateWorkItemGraph(baseGraph(), {
    type: "cancel",
    itemId: "task-1",
    reason: "duplicate work",
    impact: "duplicate is already covered by task-2",
    now: "2026-05-07T00:00:00.000Z",
  });
  assert.equal(cancelled.graph.items.find((item) => item.itemId === "task-1").status, "cancelled");

  const reparented = mutateWorkItemGraph(baseGraph(), {
    type: "reparent",
    itemId: "task-1",
    parentId: "task-2",
    now: "2026-05-07T00:00:00.000Z",
  });
  assert.equal(reparented.graph.items.find((item) => item.itemId === "task-1").parentId, "task-2");

  const depAdded = mutateWorkItemGraph(baseGraph(), {
    type: "dep-add",
    from: "task-1",
    to: "task-2",
    depType: "blocks",
    now: "2026-05-07T00:00:00.000Z",
  });
  assert.deepEqual(depAdded.graph.items.find((item) => item.itemId === "task-1").blocks, ["task-2"]);
  assert.deepEqual(depAdded.graph.tasks.find((task) => task.id === "task-2").dependencies, ["task-1"]);

  const depRemoved = mutateWorkItemGraph(depAdded.graph, {
    type: "dep-remove",
    from: "task-1",
    to: "task-2",
    depType: "blocks",
    now: "2026-05-07T00:01:00.000Z",
  });
  assert.deepEqual(depRemoved.graph.tasks.find((task) => task.id === "task-2").dependencies, []);
});

test("work-item block, unblock, comments, handoff, and stale recovery are task-scoped", () => {
  const blocked = mutateWorkItemGraph(baseGraph(), {
    type: "block",
    itemId: "task-1",
    reason: "missing API contract",
    nextAction: "write contract",
    actor: "agent-a",
    now: "2026-05-07T00:00:00.000Z",
  });
  assert.equal(blocked.graph.items.find((item) => item.itemId === "task-1").status, "blocked");
  assert.equal(blocked.graph.events[0].blocker.nextAction, "write contract");

  const unblocked = mutateWorkItemGraph(blocked.graph, {
    type: "unblock",
    itemId: "task-1",
    reason: "contract merged",
    now: "2026-05-07T00:01:00.000Z",
  });
  assert.equal(unblocked.graph.items.find((item) => item.itemId === "task-1").status, "ready");

  const commented = mutateWorkItemGraph(unblocked.graph, {
    type: "comment",
    itemId: "task-1",
    body: "Implementation note",
    actor: "agent-a",
    now: "2026-05-07T00:02:00.000Z",
  });
  assert.equal(commented.comment.workItemId, "task-1");
  assert.equal(commented.graph.items.find((item) => item.itemId === "task-1").comments.length, 1);
  assert.equal(commented.graph.events.at(-1).action, "comment");

  const handoff = mutateWorkItemGraph(commented.graph, {
    type: "handoff",
    itemId: "task-1",
    producer: "worker",
    recipient: "reviewer",
    receiptId: "receipt-1",
    now: "2026-05-07T00:03:00.000Z",
  });
  assert.equal(handoff.handoff.receiptId, "receipt-1");
  assert.equal(handoff.graph.events.at(-1).handoffId, handoff.handoff.handoffId);

  const claimed = mutateWorkItemGraph(handoff.graph, {
    type: "claim",
    itemId: "task-1",
    actor: "agent-a",
    now: "2026-05-07T00:04:00.000Z",
    leaseTtlMinutes: 1,
  });
  const recovered = mutateWorkItemGraph(claimed.graph, {
    type: "recover-stale",
    itemId: "task-1",
    actor: "lead",
    now: "2026-05-07T00:06:00.000Z",
  });
  assert.equal(recovered.graph.claims.at(-1).status, "recovered");
  assert.equal(recovered.graph.items.find((item) => item.itemId === "task-1").status, "ready");
});

test("forced stale recovery retires active claims before returning item to ready", () => {
  const claimed = mutateWorkItemGraph(baseGraph(), {
    type: "claim",
    itemId: "task-1",
    actor: "agent-a",
    now: "2026-05-07T00:00:00.000Z",
    leaseTtlMinutes: 30,
  });
  assert.equal(claimed.graph.claims.at(-1).status, "claimed");

  assert.throws(
    () => mutateWorkItemGraph(claimed.graph, {
      type: "recover-stale",
      itemId: "task-1",
      actor: "lead",
      now: "2026-05-07T00:05:00.000Z",
    }),
    /no stale claim found/,
  );

  const recovered = mutateWorkItemGraph(claimed.graph, {
    type: "recover-stale",
    itemId: "task-1",
    actor: "lead",
    now: "2026-05-07T00:05:00.000Z",
    force: true,
    reason: "host worker was never spawned",
  });

  assert.equal(recovered.graph.claims.at(-1).status, "recovered");
  assert.equal(recovered.graph.claims.at(-1).recoveryReason, "host worker was never spawned");
  assert.equal(recovered.graph.items.find((item) => item.itemId === "task-1").status, "ready");
  assert.deepEqual(recovered.graph.events.at(-1).recoveredClaims, [recovered.graph.claims.at(-1).claimId]);
});

test("dependency add rejects cycles before writing graph", () => {
  const graph = mutateWorkItemGraph(baseGraph(), {
    type: "dep-add",
    from: "task-1",
    to: "task-2",
    now: "2026-05-07T00:00:00.000Z",
  }).graph;

  assert.throws(
    () => mutateWorkItemGraph(graph, {
      type: "dep-add",
      from: "task-2",
      to: "task-1",
      now: "2026-05-07T00:01:00.000Z",
    }),
    /dependency cycle/i,
  );
});

test("work-item delete refuses dependents unless forced", () => {
  const graph = mutateWorkItemGraph(baseGraph(), {
    type: "dep-add",
    from: "task-1",
    to: "task-2",
    now: "2026-05-07T00:00:00.000Z",
  }).graph;

  assert.throws(
    () => mutateWorkItemGraph(graph, { type: "delete", itemId: "task-1" }),
    /dependents/,
  );

  const deleted = mutateWorkItemGraph(graph, {
    type: "delete",
    itemId: "task-1",
    force: true,
    now: "2026-05-07T00:01:00.000Z",
  });
  assert.equal(deleted.graph.items.some((item) => item.itemId === "task-1"), false);
  assert.equal(deleted.graph.tombstones[0].itemId, "task-1");
  assert.equal(deleted.graph.events[1].tombstone.itemId, "task-1");
  assert.deepEqual(deleted.graph.tasks.find((task) => task.id === "task-2").dependencies, []);
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

test("idempotent graph file replay skips graph, backup, and registry writes", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-actions-idempotent-"));
  const graphDir = join(rootDir, ".supervibe", "memory", "work-items", "epic-claims");
  const graphPath = join(graphDir, "graph.json");
  const registryPath = join(rootDir, ".supervibe", "memory", "work-items", "index.json");
  await mkdir(graphDir, { recursive: true });
  await writeFile(graphPath, JSON.stringify(baseGraph(), null, 2) + "\n", "utf8");

  const first = await mutateWorkItemGraphFile(graphPath, {
    type: "claim",
    itemId: "task-1",
    actor: "agent-a",
    now: "2026-05-07T00:00:00.000Z",
    operationId: "claim-task-1-once",
    rootDir,
  });
  assert.equal(first.changed, true);
  assert.equal(first.backupMode, "skipped-default");
  await assert.rejects(access(graphPath + ".bak"), /ENOENT/);

  const graphAfterFirst = await stat(graphPath);
  const registryAfterFirst = await stat(registryPath);
  await new Promise((resolve) => setTimeout(resolve, 25));

  const second = await mutateWorkItemGraphFile(graphPath, {
    type: "claim",
    itemId: "task-1",
    actor: "agent-a",
    now: "2026-05-07T00:01:00.000Z",
    operationId: "claim-task-1-once",
    rootDir,
  });
  const saved = JSON.parse(await readFile(graphPath, "utf8"));
  const graphAfterSecond = await stat(graphPath);
  const registryAfterSecond = await stat(registryPath);

  assert.equal(second.action, "idempotent-replay");
  assert.equal(second.changed, false);
  assert.equal(second.backupPath, null);
  assert.equal(second.backupMode, "skipped-idempotent-replay");
  assert.equal(saved.events.length, 1);
  assert.equal(graphAfterSecond.mtimeMs, graphAfterFirst.mtimeMs);
  assert.equal(registryAfterSecond.mtimeMs, registryAfterFirst.mtimeMs);
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

test("loop CLI routes claim and preview delete work-item actions", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-actions-cli-"));
  const graphPath = join(rootDir, "graph.json");
  await writeFile(graphPath, `${JSON.stringify(baseGraph(), null, 2)}\n`, "utf8");
  const scriptPath = join(process.cwd(), "scripts", "supervibe-loop.mjs");

  const claim = await execFileAsync(process.execPath, [
    scriptPath,
    "--claim",
    "task-1",
    "--file",
    graphPath,
    "--actor",
    "agent-a",
  ], { cwd: rootDir });
  assert.match(claim.stdout, /SUPERVIBE_WORK_ITEM_ACTION/);
  assert.match(claim.stdout, /ACTION: claim/);

  const split = await execFileAsync(process.execPath, [
    scriptPath,
    "--split",
    "task-2",
    "--titles",
    "Part A,Part B",
    "--file",
    graphPath,
  ], { cwd: rootDir });
  assert.match(split.stdout, /ACTION: split/);
  assert.match(split.stdout, /CREATED_ITEMS: task-2\.sub1,task-2\.sub2/);

  const status = await execFileAsync(process.execPath, [
    scriptPath,
    "--status",
    "--file",
    graphPath,
  ], { cwd: rootDir });
  assert.match(status.stdout, /SUPERVIBE_EPIC_STATUS/);
  assert.match(status.stdout, /CLAIMED: 1/);

  const preview = await execFileAsync(process.execPath, [
    scriptPath,
    "--delete",
    "task-1",
    "--file",
    graphPath,
    "--preview",
    "--force",
  ], { cwd: rootDir });
  assert.match(preview.stdout, /ACTION: delete/);
  assert.match(preview.stdout, /DRY_RUN: true/);
});

test("loop status does not display completed claims as active owners", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-actions-completed-claim-"));
  const graphPath = join(rootDir, "graph.json");
  await writeFile(graphPath, `${JSON.stringify(baseGraph(), null, 2)}\n`, "utf8");
  const scriptPath = join(process.cwd(), "scripts", "supervibe-loop.mjs");

  await execFileAsync(process.execPath, [
    scriptPath,
    "--claim",
    "task-1",
    "--file",
    graphPath,
    "--actor",
    "agent-a",
  ], { cwd: rootDir });
  await execFileAsync(process.execPath, [
    scriptPath,
    "--complete",
    "task-1",
    "--file",
    graphPath,
    "--actor",
    "agent-a",
    "--reason",
    "verified",
  ], { cwd: rootDir });
  const status = await execFileAsync(process.execPath, [
    scriptPath,
    "--status",
    "--file",
    graphPath,
    "--no-auto-ui",
  ], { cwd: rootDir });

  assert.match(status.stdout, /CLAIMED: 0/);
  assert.match(status.stdout, /TASK: task-1 STATUS: done .* CLAIM: none /);
  assert.doesNotMatch(status.stdout, /SUPERVIBE_RELEASE_FULL_CHECK_GATE/);
  assert.doesNotMatch(status.stdout, /SUPERVIBE_FINAL_REVIEWER_SWEEP/);
});

test("command palette claim action points at implemented loop action", () => {
  const palette = buildCommandPalette({
    index: [{ itemId: "task-1", type: "task", effectiveStatus: "ready" }],
    graphPath: ".supervibe/memory/work-items/epic-claims/graph.json",
  });
  assert.match(palette.actions.find((item) => item.id === "claim-next-task").command, /--claim task-1/);
});
