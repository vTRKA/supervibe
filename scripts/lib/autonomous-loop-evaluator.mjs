export function evaluateTask(task, evidence = {}, options = {}) {
  const dimensions = {
    acceptance: hasItems(task.acceptanceCriteria) && evidence.acceptance !== false ? 2 : 0,
    verification: hasItems(evidence.verificationEvidence) || hasItems(task.verificationCommands) ? 2 : 0,
    tests: evidence.testsPassed === true || task.verificationCommands?.length === 0 ? 1 : 0,
    integration: evidence.integrationWorks === true || task.category !== "integration" ? 1 : 0,
    regressions: evidence.noRegressions === false ? 0 : 1,
    codeGraph: evidence.codeGraphHandled === true || !requiresCodeGraph(task) ? 1 : 0,
    handoff: evidence.handoffComplete === false ? 0 : 1,
    policy: evidence.policyCompliant === false ? 0 : 1,
  };
  let score = Object.values(dimensions).reduce((sum, value) => sum + value, 0);
  const caps = [];

  if (task.policyRiskLevel === "high" && !evidence.userApproval) caps.push({ score: 6, reason: "high-risk action requires user approval" });
  if (task.policyRiskLevel === "medium" && !evidence.independentReview) caps.push({ score: 8, reason: "medium-risk task lacks independent review" });
  if (hasItems(task.verificationCommands) && !evidence.verificationRan) caps.push({ score: 8, reason: "mandatory verification was not run" });
  if (!hasItems(task.acceptanceCriteria)) caps.push({ score: 8, reason: "acceptance criteria are incomplete" });
  if (evidence.policyCompliant === false) caps.push({ score: 7, reason: "policy risk is unresolved" });
  if (evidence.verificationEvidenceMissing) caps.push({ score: 6, reason: "verification evidence is missing" });
  if (evidence.changedUndeclaredFiles) caps.push({ score: 5, reason: "undeclared file changes" });
  if (evidence.independentEvaluationRequired && !evidence.independentReview) caps.push({ score: 8, reason: "independent evaluator unavailable" });

  for (const cap of caps) score = Math.min(score, cap.score);
  const finalScore = Number(score.toFixed(1));
  return {
    taskId: task.id,
    dimensions,
    caps,
    finalScore,
    status: finalScore >= 9 ? "complete" : "scored_below_gate",
    complete: finalScore >= 9,
  };
}

export function evaluateRun(tasks, scores) {
  const activeTasks = tasks.filter((task) => !["cancelled"].includes(task.status));
  const scoreByTask = new Map(scores.map((score) => [score.taskId, score.finalScore]));
  const allComplete = activeTasks.every((task) => scoreByTask.get(task.id) >= 9 || task.status === "complete");
  const runScore = activeTasks.length === 0
    ? 0
    : activeTasks.reduce((sum, task) => sum + Number(scoreByTask.get(task.id) || 0), 0) / activeTasks.length;
  return {
    allComplete,
    runScore: Number(runScore.toFixed(1)),
    complete: allComplete && runScore >= 9,
  };
}

function hasItems(value) {
  return Array.isArray(value) && value.length > 0;
}

function requiresCodeGraph(task) {
  return /(refactor|integration|dependency|public api|architecture)/i.test(`${task.goal} ${task.category}`);
}
