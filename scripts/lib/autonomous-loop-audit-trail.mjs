import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { nowIso, versionEnvelope } from "./autonomous-loop-constants.mjs";

export function createAuditEvent(type, payload = {}) {
  return versionEnvelope({
    at: nowIso(),
    type,
    payload,
  });
}

export async function appendAuditEvent(filePath, type, payload = {}) {
  await mkdir(dirname(filePath), { recursive: true });
  const event = createAuditEvent(type, payload);
  await appendFile(filePath, `${JSON.stringify(event)}\n`, "utf8");
  return event;
}

export function finalReportProvenance({ tasks = [], handoffs = [], scores = [], approvals = [], verification = [], finalReviewerSweep = null } = {}) {
  const sweep = finalReviewerSweep || {};
  return {
    taskIds: tasks.map((task) => task.id),
    handoffIds: handoffs.map((handoff, index) => handoff.id || `${handoff.taskId}:${index}`),
    scoreTaskIds: scores.map((score) => score.taskId),
    approvals,
    verification,
    finalReviewerSweepReceiptIds: sweep.receiptIds || sweep.receipt_ids || [],
    finalReviewerSweepTaskIds: (sweep.taskReviews || sweep.task_reviews || sweep.taskLedger || sweep.task_ledger || [])
      .map((review) => review.taskId || review.itemId || review.id)
      .filter(Boolean),
  };
}
