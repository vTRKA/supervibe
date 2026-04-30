import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateDependencyDepth,
  createPriorityOverrideAudit,
  formatPriorityExplanation,
  orderReadyWorkItems,
  scoreDueUrgency,
  scoreWorkItemPriority,
} from "../scripts/lib/supervibe-work-item-priority-formula.mjs";

test("priority formula orders ready work by severity, critical path, fit, and risk", () => {
  const graph = {
    tasks: [
      { id: "a", dependencies: [] },
      { id: "b", dependencies: ["a"] },
      { id: "c", dependencies: ["b"] },
    ],
  };
  const items = [
    { itemId: "low", title: "Low", severity: "low", priority: 1 },
    { itemId: "a", title: "Critical path", severity: "critical", priority: 1, blocks: ["b"], createdAt: "2026-04-28T00:00:00.000Z" },
  ];
  const ordered = orderReadyWorkItems(items, { graph, now: "2026-04-29T00:00:00.000Z", worktreeFit: { a: true } });

  assert.equal(ordered[0].itemId, "a");
  assert.equal(calculateDependencyDepth("a", graph.tasks), 2);
  assert.match(formatPriorityExplanation(ordered[0]), /dependencyDepth=2/);
  assert.equal(scoreWorkItemPriority(ordered[0], { graph }).criticalPath, true);
  assert.equal(scoreDueUrgency({ dueAt: "2026-04-29T12:00:00.000Z" }, { now: "2026-04-29T00:00:00.000Z" }), 12);
});

test("priority overrides require visible audit reasons", () => {
  assert.throws(() => createPriorityOverrideAudit({ itemId: "t1", from: 1, to: 10, reason: "short" }), /visible reason/);
  const audit = createPriorityOverrideAudit({ itemId: "t1", from: 1, to: 10, reason: "Customer launch blocker" });
  assert.equal(audit.type, "priority-override");
});
