const TERMINAL_STATUSES = new Set(["done", "complete", "completed", "closed"]);
const SKIPPED_STATUSES = new Set(["skipped", "skip", "cancelled", "canceled"]);
const NON_BLOCKING_TYPES = new Set(["followup"]);
const PASS_STATUSES = new Set(["pass", "passed", "ok", "approved", "ready", "production-ready", "done", "complete", "completed"]);
const FAIL_STATUSES = new Set(["fail", "failed", "rejected", "not-ready"]);
const BLOCKER_STATUSES = new Set(["blocker", "blocked"]);
const WAIVED_STATUSES = new Set(["waived", "skip", "skipped", "accepted-risk"]);

function createFinalReviewEntry({
  taskId,
  status = "pass",
  score = 10,
  reviewerAgentId = null,
  receiptIds = [],
  receiptId = null,
  evidence = [],
  evidencePath = null,
  notes = null,
  checkedAt = new Date().toISOString(),
  productionReady = null,
} = {}) {
  const reviewStatus = normalizeReviewStatus(status);
  const normalizedScore = normalizeScore(score);
  const receipts = uniqueStrings([receiptId, ...normalizeArray(receiptIds)]);
  const evidencePaths = uniqueStrings([evidencePath, ...normalizeArray(evidence)]);
  return {
    schemaVersion: 1,
    taskId: String(taskId || ""),
    status: reviewStatus,
    score: normalizedScore,
    productionReady: productionReady == null
      ? isProductionReadyReview({ status: reviewStatus, score: normalizedScore })
      : Boolean(productionReady),
    reviewerAgentId: reviewerAgentId || null,
    receiptIds: receipts,
    evidencePaths,
    notes: notes || null,
    checkedAt,
  };
}

export function createFinalReviewerSweep(graphOrState = {}, options = {}) {
  const now = options.now || new Date().toISOString();
  const requiredItems = requiredReviewItems(graphOrState, options);
  const suppliedReviews = [
    ...extractExistingReviews(graphOrState),
    ...asArray(options.taskReviews || options.reviews),
  ];
  const suppliedByTask = new Map();
  for (const review of suppliedReviews) {
    const entry = normalizeReviewEntry(review, { now, reviewerAgentId: options.reviewerAgentId });
    if (entry.taskId) suppliedByTask.set(entry.taskId, entry);
  }
  const existingSweep = graphOrState.finalReviewerSweep || graphOrState.final_reviewer_sweep || graphOrState.finalReviewSweep || {};
  if ((existingSweep.coversAll || existingSweep.covers_all) && existingSweep.pass !== false) {
    for (const item of requiredItems) {
      const taskId = item.itemId || item.id;
      if (!suppliedByTask.has(taskId)) {
        suppliedByTask.set(taskId, createFinalReviewEntry({
          taskId,
          status: "pass",
          score: 10,
          reviewerAgentId: existingSweep.reviewerAgentId || existingSweep.reviewer_agent_id || options.reviewerAgentId,
          receiptIds: existingSweep.receiptIds || existingSweep.receipt_ids || [],
          notes: "legacy coversAll final reviewer sweep coverage",
          checkedAt: now,
        }));
      }
    }
  }

  const taskReviews = requiredItems.map((item) => {
    const taskId = item.itemId || item.id;
    const itemStatus = normalizeStatus(item.status);
    const terminal = isTerminalStatus(itemStatus) || isSkippedStatus(itemStatus);
    const review = suppliedByTask.get(taskId);
    if (!terminal) {
      return {
        schemaVersion: 1,
        taskId,
        status: "not-ready",
        score: null,
        productionReady: false,
        reviewerAgentId: review?.reviewerAgentId || options.reviewerAgentId || null,
        receiptIds: review?.receiptIds || [],
        evidencePaths: review?.evidencePaths || [],
        notes: review?.notes || "Task is not terminal; final reviewer sweep is release-only.",
        checkedAt: review?.checkedAt || null,
      };
    }
    if (review) return review;
    return {
      schemaVersion: 1,
      taskId,
      status: "pending",
      score: null,
      productionReady: false,
      reviewerAgentId: options.reviewerAgentId || null,
      receiptIds: [],
      evidencePaths: [],
      notes: "Awaiting final reviewer sweep.",
      checkedAt: null,
    };
  });

  const summary = summarizeFinalReviewTaskEntries(taskReviews, requiredItems);
  const status = finalReviewSweepStatus(summary);
  const receiptIds = uniqueStrings([
    ...normalizeArray(options.receiptIds || options.receipt_ids),
    ...taskReviews.flatMap((review) => review.receiptIds || []),
  ]);

  return {
    schemaVersion: 1,
    status,
    pass: status === "complete",
    requiredAt: "graph-release-gate",
    mode: "final-sweep",
    midGraphBlocking: false,
    productionReady: status === "complete" && summary.productionReady === summary.required,
    reviewerAgentId: options.reviewerAgentId || firstTruthy(taskReviews.map((review) => review.reviewerAgentId)) || null,
    receiptIds,
    summary,
    taskReviews,
    createdAt: graphOrState.finalReviewerSweep?.createdAt || graphOrState.final_reviewer_sweep?.createdAt || now,
    updatedAt: now,
    nextAction: nextActionForSweepStatus(status, summary),
  };
}

export function upsertFinalReviewerSweep(graph = {}, options = {}) {
  const entries = asArray(options.entries || options.reviews || options.taskReviews)
    .map((entry) => normalizeReviewEntry(entry, {
      now: options.now || new Date().toISOString(),
      reviewerAgentId: options.reviewerAgentId,
    }));
  const existing = extractExistingReviews(graph);
  const byTask = new Map(existing.map((entry) => [entry.taskId, entry]));
  for (const entry of entries) {
    if (entry.taskId) byTask.set(entry.taskId, entry);
  }
  const next = {
    ...graph,
    reviewPolicy: {
      ...(graph.reviewPolicy || graph.review_policy || {}),
      mode: "final-sweep",
      reviewersRequiredAt: "graph-release-gate",
      midGraphBlocking: false,
    },
  };
  next.finalReviewerSweep = createFinalReviewerSweep(next, {
    ...options,
    taskReviews: [...byTask.values()],
  });
  return next;
}

export function evaluateFinalReviewerSweep(graphOrState = {}, options = {}) {
  const sweep = options.sweep || createFinalReviewerSweep(graphOrState, options);
  const issues = [];
  const trustedReceiptIds = new Set(normalizeArray(options.trustedReceiptIds || options.trusted_receipt_ids));
  const requireTrustedReceipt = options.requireReceipt === true && options.requireTrustedReceipt !== false;
  for (const review of sweep.taskReviews || []) {
    if (review.status === "not-ready") {
      issues.push(reviewIssue("final-review-not-ready", review.taskId, `${review.taskId} is not terminal; final review is release-only.`));
    } else if (review.status === "pending") {
      issues.push(reviewIssue("final-review-pending", review.taskId, `${review.taskId} has not been checked by the final reviewer sweep.`));
    } else if (review.status === "fail") {
      issues.push(reviewIssue("final-review-failed", review.taskId, `${review.taskId} failed final reviewer sweep.`));
    } else if (review.status === "blocker") {
      issues.push(reviewIssue("final-review-blocker", review.taskId, `${review.taskId} has a final reviewer blocker.`));
    } else if (review.productionReady !== true) {
      issues.push(reviewIssue("final-review-not-production-ready", review.taskId, `${review.taskId} is reviewed but not production-ready.`));
    }
    if (options.requireReceipt && !review.receiptIds?.length) {
      issues.push(reviewIssue("final-review-missing-receipt", review.taskId, `${review.taskId} final review has no runtime receipt.`));
    } else if (requireTrustedReceipt) {
      for (const receiptId of review.receiptIds || []) {
        if (!trustedReceiptIds.has(String(receiptId))) {
          issues.push(reviewIssue("final-review-untrusted-receipt", review.taskId, `${review.taskId} final review receipt is not trusted runtime reviewer evidence: ${receiptId}.`));
        }
      }
    }
  }
  return {
    pass: issues.length === 0 && sweep.pass === true,
    status: issues.length === 0 ? sweep.status : "blocked",
    score: issues.length === 0 ? 10 : Math.max(0, Number((10 - issues.length * 0.5).toFixed(1))),
    sweep,
    issues,
  };
}

export function formatFinalReviewerSweepReport(sweep = {}, { includeTasks = true } = {}) {
  const summary = sweep.summary || {};
  const lines = [
    "SUPERVIBE_FINAL_REVIEWER_SWEEP",
    `FINAL_REVIEW_SWEEP: ${sweep.status || "pending"}`,
    `REQUIRED_AT: ${sweep.requiredAt || "graph-release-gate"}`,
    `MID_GRAPH_BLOCKING: ${sweep.midGraphBlocking === true}`,
    `PRODUCTION_READY: ${sweep.productionReady === true}`,
    `TASKS_REVIEWED: ${summary.reviewed || 0}/${summary.required || 0}`,
    `TASKS_PENDING: ${summary.pending || 0}`,
    `TASKS_NOT_READY: ${summary.notReady || 0}`,
    `TASKS_FAILED: ${summary.failed || 0}`,
    `TASKS_BLOCKED: ${summary.blockers || 0}`,
    `REVIEW_RECEIPTS: ${(sweep.receiptIds || []).join(",") || "none"}`,
    `NEXT_ACTION: ${sweep.nextAction || "run final reviewer sweep after all graph tasks are complete"}`,
  ];
  if (includeTasks) {
    for (const review of sweep.taskReviews || []) {
      lines.push(`FINAL_REVIEW_TASK: ${review.taskId} STATUS: ${review.status} SCORE: ${review.score ?? "none"} PRODUCTION_READY: ${review.productionReady === true} REVIEWER: ${review.reviewerAgentId || "none"} RECEIPTS: ${(review.receiptIds || []).join(",") || "none"}`);
    }
  }
  return lines.join("\n");
}

function requiredReviewItems(graphOrState = {}, { includeFollowups = false } = {}) {
  const items = Array.isArray(graphOrState.items) ? graphOrState.items : [];
  if (items.length > 0) {
    return items.filter((item) => {
      if (!item || item.type === "epic") return false;
      if (!includeFollowups && NON_BLOCKING_TYPES.has(item.type)) return false;
      return true;
    }).map((item) => ({ ...item, itemId: item.itemId || item.id }));
  }
  return (graphOrState.tasks || graphOrState.task_graph?.tasks || [])
    .filter((task) => task?.id || task?.itemId)
    .map((task) => ({
      ...task,
      itemId: task.itemId || task.id,
      type: task.type || "task",
    }));
}

function extractExistingReviews(graphOrState = {}) {
  const sweep = graphOrState.finalReviewerSweep || graphOrState.final_reviewer_sweep || graphOrState.finalReviewSweep || {};
  const explicitReviews = asArray(sweep.taskReviews || sweep.task_reviews || sweep.taskLedger || sweep.task_ledger || sweep.reviews);
  const legacyCovered = normalizeArray(sweep.coveredTaskIds || sweep.covered_task_ids || sweep.taskIds || sweep.task_ids)
    .filter((taskId) => !["*", "all"].includes(String(taskId).toLowerCase()))
    .map((taskId) => ({
      taskId,
      status: sweep.pass === false ? "pending" : "pass",
      score: 10,
      reviewerAgentId: sweep.reviewerAgentId || sweep.reviewer_agent_id || null,
      receiptIds: sweep.receiptIds || sweep.receipt_ids || [],
      notes: "legacy final reviewer sweep coverage",
    }));
  return [...explicitReviews, ...legacyCovered]
    .map((entry) => normalizeReviewEntry(entry))
    .filter((entry) => entry.taskId);
}

function normalizeReviewEntry(entry = {}, defaults = {}) {
  if (typeof entry === "string") return createFinalReviewEntry({ taskId: entry, checkedAt: defaults.now });
  return createFinalReviewEntry({
    taskId: entry.taskId || entry.itemId || entry.id,
    status: entry.status || entry.reviewStatus || entry.verdict || entry.result,
    score: entry.score ?? entry.finalScore ?? entry.rating,
    reviewerAgentId: entry.reviewerAgentId || entry.reviewer_agent_id || defaults.reviewerAgentId,
    receiptIds: entry.receiptIds || entry.receipt_ids || entry.receipts,
    receiptId: entry.receiptId || entry.receipt || entry.workflowReceiptId,
    evidence: entry.evidencePaths || entry.evidence || entry.evidencePath,
    notes: entry.notes || entry.summary || entry.outputSummary,
    checkedAt: entry.checkedAt || entry.checked_at || defaults.now,
    productionReady: entry.productionReady ?? entry.production_ready,
  });
}

function summarizeFinalReviewTaskEntries(taskReviews = [], requiredItems = []) {
  const summary = {
    required: requiredItems.length,
    terminal: 0,
    reviewed: 0,
    passed: 0,
    waived: 0,
    failed: 0,
    blockers: 0,
    pending: 0,
    notReady: 0,
    productionReady: 0,
  };
  const statusByTask = new Map(requiredItems.map((item) => [item.itemId || item.id, normalizeStatus(item.status)]));
  for (const review of taskReviews) {
    const itemStatus = statusByTask.get(review.taskId);
    if (isTerminalStatus(itemStatus) || isSkippedStatus(itemStatus)) summary.terminal += 1;
    if (["pass", "waived", "fail", "blocker"].includes(review.status)) summary.reviewed += 1;
    if (review.status === "pass") summary.passed += 1;
    else if (review.status === "waived") summary.waived += 1;
    else if (review.status === "fail") summary.failed += 1;
    else if (review.status === "blocker") summary.blockers += 1;
    else if (review.status === "pending") summary.pending += 1;
    else if (review.status === "not-ready") summary.notReady += 1;
    if (review.productionReady === true) summary.productionReady += 1;
  }
  return summary;
}

function finalReviewSweepStatus(summary = {}) {
  if (summary.notReady > 0 || summary.terminal < summary.required) return "not-ready";
  if (summary.failed > 0 || summary.blockers > 0) return "blocked";
  if (summary.pending > 0 || summary.reviewed < summary.required) return "pending";
  if (summary.productionReady === summary.required) return "complete";
  return "blocked";
}

function nextActionForSweepStatus(status, summary = {}) {
  if (status === "complete") return "release gate can proceed after final checks pass";
  if (status === "not-ready") return "finish all graph tasks before running reviewer agents";
  if (status === "pending") return `run final reviewer sweep for ${summary.pending || 0} pending tasks`;
  return "fix final reviewer blockers or re-open affected tasks";
}

function normalizeReviewStatus(value) {
  const normalized = String(value || "pending").trim().toLowerCase().replace(/_/g, "-");
  if (PASS_STATUSES.has(normalized)) return "pass";
  if (FAIL_STATUSES.has(normalized)) return "fail";
  if (BLOCKER_STATUSES.has(normalized)) return "blocker";
  if (WAIVED_STATUSES.has(normalized)) return "waived";
  if (normalized === "not-ready") return "not-ready";
  return "pending";
}

function isProductionReadyReview({ status, score }) {
  if (status === "waived") return true;
  if (status !== "pass") return false;
  return score == null || score >= 9;
}

function normalizeScore(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(10, Number(number.toFixed(1))));
}

function normalizeArray(value) {
  if (value == null || value === "") return [];
  if (Array.isArray(value)) return value.flatMap(normalizeArray);
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function asArray(value) {
  if (value == null || value === "") return [];
  return Array.isArray(value) ? value : [value];
}

function uniqueStrings(values = []) {
  return [...new Set(values.flatMap(normalizeArray).filter(Boolean).map(String))];
}

function firstTruthy(values = []) {
  return values.find(Boolean) || null;
}

function normalizeStatus(status) {
  return String(status || "open").trim().toLowerCase().replace(/_/g, "-");
}

function isTerminalStatus(status) {
  return TERMINAL_STATUSES.has(normalizeStatus(status));
}

function isSkippedStatus(status) {
  return SKIPPED_STATUSES.has(normalizeStatus(status));
}

function reviewIssue(code, itemId, message) {
  return {
    code,
    itemId: itemId || null,
    message,
    nextAction: nextActionForReviewIssue(code, itemId),
  };
}

function nextActionForReviewIssue(code, itemId) {
  const id = itemId || "graph";
  if (code === "final-review-not-ready") return `finish or explicitly skip ${id} before final reviewer sweep`;
  if (code === "final-review-pending") return `record final reviewer verdict for ${id}`;
  if (code === "final-review-missing-receipt") return `attach reviewer receipt evidence to ${id}`;
  return `fix final reviewer finding for ${id}`;
}
