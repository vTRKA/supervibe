import assert from "node:assert/strict";
import test from "node:test";
import {
  createFinalReviewerSweep,
  evaluateFinalReviewerSweep,
  upsertFinalReviewerSweep,
} from "../scripts/lib/supervibe-final-review-sweep.mjs";

test("final reviewer sweep is not ready while worker graph is still active", () => {
  const sweep = createFinalReviewerSweep({
    items: [
      { itemId: "epic", type: "epic", status: "open" },
      { itemId: "t1", type: "task", status: "claimed" },
    ],
  });

  assert.equal(sweep.status, "not-ready");
  assert.equal(sweep.midGraphBlocking, false);
  assert.equal(sweep.taskReviews[0].status, "not-ready");
});

test("final reviewer sweep records per-task production readiness", () => {
  const graph = {
    items: [
      { itemId: "epic", type: "epic", status: "done" },
      { itemId: "t1", type: "task", status: "done" },
      { itemId: "t2", type: "task", status: "done" },
    ],
  };
  const next = upsertFinalReviewerSweep(graph, {
    reviewerAgentId: "quality-gate-reviewer",
    entries: [
      { taskId: "t1", status: "pass", score: 10, receiptId: "receipt-1" },
      { taskId: "t2", status: "pass", score: 9, receiptId: "receipt-2" },
    ],
  });

  assert.equal(next.finalReviewerSweep.status, "complete");
  assert.equal(next.finalReviewerSweep.productionReady, true);
  assert.equal(evaluateFinalReviewerSweep(next).pass, true);
  const untrusted = evaluateFinalReviewerSweep(next, { requireReceipt: true, trustedReceiptIds: ["receipt-1"] });
  assert.equal(untrusted.pass, false);
  assert.ok(untrusted.issues.some((issue) => issue.code === "final-review-untrusted-receipt" && issue.itemId === "t2"));
  assert.equal(evaluateFinalReviewerSweep(next, { requireReceipt: true, trustedReceiptIds: ["receipt-1", "receipt-2"] }).pass, true);
});

test("final reviewer sweep fails production readiness when a task is missing review", () => {
  const graph = {
    items: [
      { itemId: "epic", type: "epic", status: "done" },
      { itemId: "t1", type: "task", status: "done" },
      { itemId: "t2", type: "task", status: "done" },
    ],
    finalReviewerSweep: {
      taskReviews: [{ taskId: "t1", status: "pass", score: 10, receiptId: "receipt-1" }],
    },
  };

  const result = evaluateFinalReviewerSweep(graph);
  assert.equal(result.pass, false);
  assert.equal(result.sweep.status, "pending");
  assert.ok(result.issues.some((issue) => issue.code === "final-review-pending" && issue.itemId === "t2"));
});
