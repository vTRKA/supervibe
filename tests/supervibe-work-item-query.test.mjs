import assert from "node:assert/strict";
import test from "node:test";
import { atomizePlanToWorkItems } from "../scripts/lib/supervibe-plan-to-work-items.mjs";
import { createWorkItemComment } from "../scripts/lib/supervibe-work-item-comments.mjs";
import {
  applyWorkItemFilters,
  classifyWorkItemQuestion,
  createWorkItemIndex,
  detectDuplicateWorkItems,
  detectFollowupBacklog,
  detectOrphanEvidence,
  detectOrphanWorkItems,
  detectStaleWorkItems,
  detectTrackerDrift,
  groupWorkItemsByStatus,
  queryWorkItems,
  workItemStorageMode,
} from "../scripts/lib/supervibe-work-item-query.mjs";

function graph() {
  const result = atomizePlanToWorkItems(`# Plan

Critical path: T1 -> T2

## Task 1: Build feature
**Acceptance Criteria:**
- Feature works
\`\`\`bash
npm test
\`\`\`

## Task 2: Review feature
**Acceptance Criteria:**
- Review passes
\`\`\`bash
npm test
\`\`\`
`, { epicId: "epic-query", repo: "web", package: "ui", planReviewPassed: true });
  result.items.push({
    ...result.items.find((item) => item.itemId === "epic-query-t1"),
    itemId: "epic-query-duplicate",
  });
  result.items.push({
    itemId: "epic-query-orphan",
    type: "subtask",
    status: "open",
    title: "Orphan Subtask",
    parentId: "missing-parent",
    blocks: [],
    blockedBy: [],
    related: [],
    acceptanceCriteria: ["Orphan is reported"],
    verificationCommands: ["npm test"],
  });
  result.items.push({
    itemId: "epic-query-followup",
    type: "followup",
    status: "open",
    title: "Later follow-up",
    parentId: "epic-query",
    required: false,
    blocks: [],
    blockedBy: [],
    related: [],
  });
  return result;
}

test("work-item query classifies natural-language status questions", () => {
  assert.equal(classifyWorkItemQuestion("what is ready?"), "ready");
  assert.equal(classifyWorkItemQuestion("почему заблокировано?"), "why-blocked");
  assert.equal(classifyWorkItemQuestion("summarize epic progress"), "summary");
});

test("query answers ready, blocked, owner, changed, next, and summary questions", () => {
  const workGraph = graph();
  const comments = [
    createWorkItemComment({ workItemId: "epic-query-t1", type: "handoff", body: "Changed file.", links: ["src/a.ts"] }),
  ];
  const claims = [{ taskId: "epic-query-t2", status: "active", agentId: "worker-1", claimedAt: "2000-01-01T00:00:00.000Z" }];
  const gates = [{ gateId: "gate-1", taskId: "epic-query-t2", status: "blocked" }];
  const index = createWorkItemIndex({ graph: workGraph, comments, claims, gates, now: "2000-01-01T00:05:00.000Z" });

  assert.match(queryWorkItems("what is ready?", { index }).answer, /epic-query-t1/);
  assert.match(queryWorkItems("what is blocked?", { index }).answer, /epic-query-t2/);
  assert.match(queryWorkItems("who owns this?", { index }).answer, /worker-1/);
  assert.match(queryWorkItems("what changed?", { index }).answer, /epic-query-t1/);
  assert.match(queryWorkItems("summarize epic progress", { index }).answer, /ready=/);
  assert.match(queryWorkItems("what should I run next?", { index }).nextAction, /claim/);
  assert.equal(groupWorkItemsByStatus(index).ready.length >= 1, true);
});

test("dependencies unblock when blocker task is terminal", () => {
  const workGraph = graph();
  const blockerId = "epic-query-t1";
  const dependentId = "epic-query-t2";
  workGraph.items = workGraph.items.map((item) => item.itemId === blockerId ? { ...item, status: "complete" } : item);
  workGraph.tasks = workGraph.tasks.map((task) => task.id === blockerId ? { ...task, status: "complete" } : task);

  const index = createWorkItemIndex({ graph: workGraph, now: "2026-05-09T00:00:00.000Z" });
  const dependent = index.find((item) => item.itemId === dependentId);

  assert.equal(dependent.task.dependencies.includes(blockerId), true);
  assert.equal(dependent.effectiveStatus, "ready");
  assert.match(queryWorkItems("what is ready?", { index }).answer, /epic-query-t2/);
});

test("terminal review and gate items are grouped as done instead of pending review", () => {
  const grouped = groupWorkItemsByStatus([
    { itemId: "review-complete", type: "review", effectiveStatus: "done" },
    { itemId: "gate-complete", type: "gate", effectiveStatus: "done" },
    { itemId: "gate-open", type: "gate", effectiveStatus: "gate" },
  ]);

  assert.deepEqual(grouped.done.map((item) => item.itemId), ["review-complete", "gate-complete"]);
  assert.deepEqual(grouped.review.map((item) => item.itemId), ["gate-open"]);
});

test("query helpers detect duplicates, stale claims, orphan evidence, drift, and multi-repo filters", () => {
  const workGraph = graph();
  const index = createWorkItemIndex({
    graph: workGraph,
    mapping: {
      items: {
        "epic-query-t1": { externalId: "EXT-1", status: "blocked", externalStatus: "blocked" },
      },
    },
    claims: [{ taskId: "epic-query-t1", status: "active", claimedAt: "2000-01-01T00:00:00.000Z" }],
    evidence: [{ id: "orphan", path: "unknown.log" }],
    now: "2000-01-01T01:00:00.000Z",
  });

  assert.ok(detectDuplicateWorkItems(index).length >= 1);
  assert.ok(detectStaleWorkItems(index, { now: "2000-01-01T01:00:00.000Z", staleMinutes: 30 }).length >= 1);
  assert.ok(detectOrphanWorkItems(index, workGraph).some((item) => item.itemId === "epic-query-orphan"));
  assert.equal(detectOrphanEvidence({ graph: workGraph, evidence: [{ id: "orphan", path: "unknown.log" }] }).length, 1);
  assert.ok(detectFollowupBacklog(index).some((item) => item.itemId === "epic-query-followup" && item.blockingCompletion === false));
  assert.ok(detectTrackerDrift(index).some((item) => item.itemId === "epic-query-t1"));
  assert.ok(applyWorkItemFilters(index, { repo: "web", package: "ui" }).length > 0);
  assert.equal(applyWorkItemFilters(index, { repo: "api" }).length, 0);
  assert.match(queryWorkItems("orphan work", { index, graph: workGraph }).answer, /epic-query-orphan/);
  assert.match(queryWorkItems("followup backlog", { index }).answer, /epic-query-followup/);
});

test("storage mode keeps protected and contributor workflows local by default", () => {
  assert.equal(workItemStorageMode({ branch: "main" }).mode, "protected-local");
  assert.equal(workItemStorageMode({ branch: "feature", contributor: true }).mode, "contributor-local");
  assert.equal(workItemStorageMode({ branch: "feature" }).safeSyncAction, "local-write");
});
