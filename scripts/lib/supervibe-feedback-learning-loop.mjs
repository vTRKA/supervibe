const STATES = Object.freeze(["new", "triaged", "accepted", "rejected", "promoted-to-memory", "promoted-to-eval", "resolved"]);

export function createFeedbackItem(input = {}) {
  return {
    schemaVersion: 1,
    id: input.id || `feedback-${Date.now()}`,
    state: input.state || "new",
    userCorrection: input.userCorrection || input.comment || "",
    affectedDiagnosticEvent: input.affectedDiagnosticEvent || null,
    failureTaxonomy: input.failureTaxonomy || "unknown",
    severity: input.severity || "medium",
    recurrence: Number(input.recurrence || 1),
    suggestedFix: input.suggestedFix || "",
    reviewerNotes: input.reviewerNotes || "",
    reviewerAction: input.reviewerAction || null,
    memoryCandidate: input.memoryCandidate || null,
    evalCandidate: input.evalCandidate || null,
    regressionFixture: input.regressionFixture || null,
    archivedReason: input.archivedReason || null,
  };
}

function transitionFeedbackItem(item = {}, nextState, patch = {}) {
  if (!STATES.includes(nextState)) throw new Error(`invalid feedback state: ${nextState}`);
  return createFeedbackItem({
    ...item,
    ...patch,
    state: nextState,
    reviewerAction: patch.reviewerAction || reviewerActionFor(nextState),
  });
}

function promoteFeedbackItem(item = {}) {
  const feedback = createFeedbackItem(item);
  if (feedback.state === "rejected") {
    return { ...feedback, archivedReason: feedback.archivedReason || "review rejected" };
  }
  if (!["accepted", "triaged", "new"].includes(feedback.state)) return feedback;
  const memoryCandidate = feedback.memoryCandidate || {
    id: `memory-candidate:${feedback.id}`,
    tags: ["feedback", feedback.failureTaxonomy].filter(Boolean),
    confidence: feedback.severity === "high" ? 9 : 8,
    summary: feedback.userCorrection.slice(0, 240),
  };
  const evalCandidate = feedback.evalCandidate || {
    id: `eval-candidate:${feedback.id}`,
    caseType: feedback.failureTaxonomy,
    expectedBehavior: feedback.suggestedFix || feedback.userCorrection,
  };
  const regressionFixture = feedback.severity === "high" || feedback.recurrence > 1
    ? feedback.regressionFixture || { id: `regression:${feedback.id}`, sourceFeedbackId: feedback.id, blocking: true }
    : feedback.regressionFixture;
  return createFeedbackItem({
    ...feedback,
    state: feedback.severity === "high" ? "promoted-to-eval" : "promoted-to-memory",
    reviewerAction: "promote-reviewed-feedback",
    memoryCandidate,
    evalCandidate,
    regressionFixture,
  });
}

export function evaluateFeedbackLearningQueue(items = []) {
  const reviewed = items.map(createFeedbackItem).map((item) => ["accepted", "triaged", "new"].includes(item.state) ? promoteFeedbackItem(item) : item);
  const results = reviewed.map((item) => {
    const failures = [];
    if (!item.state) failures.push("feedback item missing annotation state, memory candidate, eval candidate or reviewer action");
    if (!item.reviewerAction) failures.push("feedback item missing annotation state, memory candidate, eval candidate or reviewer action");
    if (["accepted", "promoted-to-memory", "promoted-to-eval"].includes(item.state) && !item.memoryCandidate) failures.push("feedback item missing annotation state, memory candidate, eval candidate or reviewer action");
    if (["accepted", "promoted-to-memory", "promoted-to-eval"].includes(item.state) && !item.evalCandidate) failures.push("feedback item missing annotation state, memory candidate, eval candidate or reviewer action");
    if ((item.severity === "high" || item.recurrence > 1) && !item.regressionFixture && item.state !== "rejected") failures.push("high-severity or repeated feedback missing regression fixture");
    return { id: item.id, pass: failures.length === 0, failures, item };
  });
  const failed = results.filter((result) => !result.pass);
  return {
    pass: failed.length === 0,
    total: results.length,
    failed,
    results,
    reviewed,
  };
}

export function runFeedbackLearningSmoke() {
  return evaluateFeedbackLearningQueue([
    createFeedbackItem({
      id: "feedback-smoke",
      state: "accepted",
      userCorrection: "Context pack did not explain why memory was skipped.",
      failureTaxonomy: "context-provenance",
      severity: "high",
      recurrence: 2,
      suggestedFix: "Add repair action and regression fixture for skipped memory provenance.",
      reviewerAction: "accept",
    }),
  ]);
}

export function formatFeedbackLearningReport(report = {}) {
  const lines = [
    "SUPERVIBE_FEEDBACK_LEARNING_LOOP",
    `PASS: ${Boolean(report.pass)}`,
    `ITEMS: ${report.total || 0}`,
    `FAILED: ${report.failed?.length || 0}`,
  ];
  for (const result of report.results || []) {
    lines.push(`- ${result.id}: state=${result.item.state} memory=${Boolean(result.item.memoryCandidate)} eval=${Boolean(result.item.evalCandidate)} regression=${Boolean(result.item.regressionFixture)}`);
  }
  for (const result of report.failed || []) lines.push(`  ! ${result.id}: ${result.failures.join("; ")}`);
  return lines.join("\n");
}

function reviewerActionFor(state) {
  const actions = {
    new: "await-review",
    triaged: "triage",
    accepted: "accept",
    rejected: "reject",
    "promoted-to-memory": "promote-memory",
    "promoted-to-eval": "promote-eval",
    resolved: "resolve",
  };
  return actions[state] || "review";
}
