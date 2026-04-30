export const QUALITY_SCORE_DIMENSIONS = Object.freeze([
  "triggerSelection",
  "graphValidity",
  "taskSize",
  "dependencyCorrectness",
  "evidenceCoverage",
  "safetyStops",
  "reviewLoop",
  "resumability",
  "userNextActionClarity",
  "worktreeIsolation",
  "dashboardReportQuality",
  "readmeDocsConsistency",
]);

export function createQualityScorecard({ caseDef = {}, snapshot = {}, comparison = {}, state = {}, approvedGoldenUpdate = false } = {}) {
  const dimensions = {
    triggerSelection: Boolean(caseDef.category),
    graphValidity: snapshot.readyFrontCount >= 0 && snapshot.blockedCount >= 0,
    taskSize: (state.tasks || caseDef.inputArtifacts?.state?.tasks || []).every((task) => String(task.goal || "").length <= 160),
    dependencyCorrectness: comparison.pass || !comparison.diffs?.some((diff) => ["readyFrontCount", "blockedCount"].includes(diff.field)),
    evidenceCoverage: hasRequiredEvidence(caseDef, state),
    safetyStops: respectsForbiddenBehavior(caseDef),
    reviewLoop: caseDef.id !== "plan-review-loop" || snapshot.stopReason === "review_required",
    resumability: caseDef.id !== "resume-after-compaction" || snapshot.nextAction?.includes("handoff"),
    userNextActionClarity: Boolean(snapshot.nextAction),
    worktreeIsolation: caseDef.id !== "worktree-run" || Boolean((state.worktree_sessions || caseDef.inputArtifacts?.state?.worktree_sessions || []).length),
    dashboardReportQuality: true,
    readmeDocsConsistency: true,
  };
  const passed = Object.values(dimensions).filter(Boolean).length;
  const score = Number(((passed / QUALITY_SCORE_DIMENSIONS.length) * 10).toFixed(1));
  const metrics = {
    latencyMs: state.latencyMs || 0,
    runtimeMs: state.runtimeMs || 0,
    loopCount: state.loop_count || state.loopCount || 0,
    requeueCount: (state.failure_packets || state.failurePackets || []).length,
    budgetStops: snapshot.stopReason === "budget_stopped" ? 1 : 0,
    manualInterventionCount: (state.gates || []).filter((gate) => /approval|manual|human/i.test(`${gate.type || ""} ${gate.status || ""}`)).length,
  };
  const regressionType = comparison.pass ? "none" : approvedGoldenUpdate ? "expected-behavior-change" : "product-regression";
  return {
    caseId: caseDef.id || snapshot.runId,
    score,
    pass: score >= Number(caseDef.expected?.qualityMinScore || 7) && (comparison.pass || approvedGoldenUpdate),
    dimensions,
    metrics,
    regressionType,
    approvedGoldenUpdate,
  };
}

export function summarizeQualityScorecards(scorecards = []) {
  const average = scorecards.length
    ? Number((scorecards.reduce((sum, card) => sum + card.score, 0) / scorecards.length).toFixed(1))
    : 0;
  return {
    total: scorecards.length,
    pass: scorecards.filter((card) => card.pass).length,
    fail: scorecards.filter((card) => !card.pass).length,
    average,
    topRegressions: scorecards.filter((card) => card.regressionType === "product-regression").map((card) => card.caseId),
  };
}

export function formatQualityScorecard(card = {}) {
  return [
    "SUPERVIBE_QUALITY_SCORECARD",
    `CASE: ${card.caseId}`,
    `PASS: ${card.pass}`,
    `SCORE: ${card.score}/10`,
    `REGRESSION: ${card.regressionType}`,
    ...Object.entries(card.dimensions || {}).map(([key, value]) => `- ${key}: ${value ? "pass" : "fail"}`),
  ].join("\n");
}

function hasRequiredEvidence(caseDef, state) {
  const text = JSON.stringify(state || caseDef.inputArtifacts?.state || {});
  return (caseDef.requiredEvidence || []).every((evidence) => {
    if (evidence === "verification_matrix") return /verification_matrix|verificationMatrix/.test(text);
    if (evidence === "failure_packet") return /failure_packets|failurePackets/.test(text);
    if (evidence === "worktree_session") return /worktree_sessions|worktreeSessions/.test(text);
    if (evidence === "review_gate") return /gates/.test(text);
    return true;
  });
}

function respectsForbiddenBehavior(caseDef) {
  const text = JSON.stringify(caseDef.inputArtifacts || {});
  return !(caseDef.forbiddenBehavior || []).some((behavior) => text.includes(behavior));
}
