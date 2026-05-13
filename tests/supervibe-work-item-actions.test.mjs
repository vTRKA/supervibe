import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
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

test("command palette claim action points at implemented loop action", () => {
  const palette = buildCommandPalette({
    index: [{ itemId: "task-1", type: "task", effectiveStatus: "ready" }],
    graphPath: ".supervibe/memory/work-items/epic-claims/graph.json",
  });
  assert.match(palette.actions.find((item) => item.id === "claim-next-task").command, /--claim task-1/);
});
