export function explainAssignment({
  task = {},
  worker = {},
  reviewer = {},
  alternatives = [],
  wave = null,
  policy = null,
  notParallelizedBecause = [],
  requiredEvidence = [],
} = {}) {
  const semanticAnchors = (task.semanticAnchors || []).map((anchor) => anchor.anchorId || anchor.id).filter(Boolean);
  return {
    taskId: task.id || null,
    workerAgentId: worker.agentId || worker.agent?.agentId || null,
    reviewerAgentId: reviewer.agentId || reviewer.agent?.agentId || null,
    waveId: wave?.waveId || null,
    whyWorker: buildWhy(worker, task),
    whyReviewer: buildWhy(reviewer, task),
    rejectedAlternatives: alternatives.map((item) => `${item.agentId || item.agent?.agentId}: ${item.rejectedBecause || item.reason || "lower capability match"}`),
    evidenceRequired: [
      ...requiredEvidence,
      ...(worker.requiredEvidence || []),
      ...(reviewer.requiredEvidence || []),
    ],
    notParallelizedBecause,
    taskType: task.category || "implementation",
    touchedFiles: task.targetFiles || task.filesTouched || [],
    moduleContracts: task.fileLocalContractRefs || [],
    semanticAnchors,
    risk: task.policyRiskLevel || "low",
    policyConstraints: policy ? [policy.status || policy.name || policy.profileName || "policy configured"] : [],
    priorOutcomes: worker.priorOutcomes || [],
  };
}

export function answerAssignmentQuestion(question = "", explanation = {}) {
  const text = String(question || "").toLowerCase();
  if (/why.*agent|why.*worker|why.*assigned/.test(text)) {
    return `Agent ${explanation.workerAgentId || "unknown"} was selected because ${explanation.whyWorker || "it was the best available capability match"}.`;
  }
  if (/why.*parallel|not parallel|serialize/.test(text)) {
    return (explanation.notParallelizedBecause || []).length
      ? `Not parallelized: ${explanation.notParallelizedBecause.join("; ")}.`
      : "Parallel execution is allowed for this assignment.";
  }
  return formatAssignmentExplanation(explanation);
}

export function formatAssignmentExplanation(explanation = {}) {
  return [
    "SUPERVIBE_ASSIGNMENT_EXPLANATION",
    `TASK: ${explanation.taskId || "unknown"}`,
    `WORKER: ${explanation.workerAgentId || "manual"}`,
    `REVIEWER: ${explanation.reviewerAgentId || "manual"}`,
    `WHY_WORKER: ${explanation.whyWorker || "none"}`,
    `WHY_REVIEWER: ${explanation.whyReviewer || "none"}`,
    `REJECTED: ${(explanation.rejectedAlternatives || []).join(" | ") || "none"}`,
    `EVIDENCE: ${(explanation.evidenceRequired || []).join(",") || "none"}`,
    `ANCHORS: ${(explanation.semanticAnchors || []).join(",") || "none"}`,
    `NOT_PARALLELIZED: ${(explanation.notParallelizedBecause || []).join(" | ") || "none"}`,
  ].join("\n");
}

function buildWhy(matchOrPreset = {}, task = {}) {
  const reasons = matchOrPreset.reasons || [];
  if (reasons.length > 0) return reasons.join("; ");
  if (matchOrPreset.preset) return `preset=${matchOrPreset.preset}`;
  if (matchOrPreset.name) return `preset=${matchOrPreset.name}`;
  return `taskType=${task.category || "implementation"} risk=${task.policyRiskLevel || "low"}`;
}
