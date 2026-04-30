const COMPLETE_STATUSES = new Set(["complete", "cancelled", "policy_stopped", "budget_stopped"]);
const OPEN_STATUSES = new Set(["open", "ready", "pending"]);
const RISK_ORDER = { none: 0, low: 1, medium: 2, high: 3 };

export function buildExecutionWaves({
  tasks = [],
  readyFront = null,
  maxConcurrency = 3,
  maxPolicyRiskLevel = "medium",
  reviewers = ["quality-gate-reviewer"],
  worktreeSessions = [],
  claims = [],
} = {}) {
  const blockers = [];
  const staleSessions = worktreeSessions.filter((session) => session.status === "stale");
  if (reviewers.length === 0) blockers.push("missing-reviewer");
  if (staleSessions.length > 0) blockers.push("stale-worktree-session");
  if (claims.some((claim) => claim.status === "active" && claim.blocked === true)) blockers.push("blocked-worker-claim");

  const candidates = readyFront?.ready || readyFront?.parallel || computeReadyTasks(tasks);
  const conflicts = detectWriteSetConflicts(candidates);
  const conflictTaskIds = new Set(conflicts.flatMap((conflict) => conflict.taskIds.slice(1)));
  const blocked = [];
  const serialized = [];
  const selected = [];
  const usedFiles = new Set();

  for (const task of candidates) {
    if ((RISK_ORDER[task.policyRiskLevel || "low"] ?? 1) > (RISK_ORDER[maxPolicyRiskLevel] ?? 2)) {
      blocked.push({ taskId: task.id, reason: `risk ${task.policyRiskLevel || "low"} exceeds wave max ${maxPolicyRiskLevel}` });
      continue;
    }
    if (conflictTaskIds.has(task.id) || writeSet(task).some((file) => usedFiles.has(file))) {
      serialized.push({ taskId: task.id, reason: `write-set conflict: ${writeSet(task).join(",") || "unknown"}` });
      continue;
    }
    if (selected.length >= maxConcurrency) {
      serialized.push({ taskId: task.id, reason: `max concurrency ${maxConcurrency} reached` });
      continue;
    }
    selected.push(task);
    for (const file of writeSet(task)) usedFiles.add(file);
  }

  const readyWorktrees = worktreeSessions.filter((session) => ["ready", "active"].includes(session.status));
  const wave = selected.length > 0 ? {
    waveId: "wave-1",
    status: blockers.length ? "paused" : "ready",
    tasks: selected.map((task) => task.id),
    maxConcurrency,
    worktrees: readyWorktrees.slice(0, selected.length).map((session) => session.sessionId),
    reviewers: reviewers.slice(0, Math.max(1, selected.length)),
    verificationPlan: selected.map((task) => ({ taskId: task.id, required: task.verificationCommands || [] })),
    stopConditions: ["policy_stop", "failed_gate", "stale_worker_session", "write_set_conflict"],
    mergeStrategy: "verify-review-reconcile",
  } : null;

  return {
    status: blockers.length ? "paused" : "ready",
    blockers,
    waves: wave ? [wave] : [],
    currentWave: wave,
    nextWave: serialized.length ? { tasks: serialized.map((item) => item.taskId), reason: "serialized work" } : null,
    blocked,
    serialized,
    conflicts,
  };
}

export function detectWriteSetConflicts(tasks = []) {
  const byFile = new Map();
  for (const task of tasks) {
    for (const file of writeSet(task)) {
      if (!byFile.has(file)) byFile.set(file, []);
      byFile.get(file).push(task.id);
    }
  }
  return [...byFile.entries()]
    .filter(([, taskIds]) => taskIds.length > 1)
    .map(([filePath, taskIds]) => ({ filePath, taskIds }));
}

export function summarizeWavePlan(plan = {}) {
  return {
    status: plan.status || "unknown",
    waves: (plan.waves || []).length,
    currentTasks: plan.currentWave?.tasks?.length || 0,
    blocked: (plan.blocked || []).length,
    serialized: (plan.serialized || []).length,
    blockers: plan.blockers || [],
  };
}

export function formatWaveStatus(plan = {}) {
  const summary = summarizeWavePlan(plan);
  return [
    "SUPERVIBE_WAVES",
    `STATUS: ${summary.status}`,
    `CURRENT_WAVE: ${plan.currentWave?.waveId || "none"}`,
    `CURRENT_TASKS: ${plan.currentWave?.tasks?.join(",") || "none"}`,
    `NEXT_WAVE: ${plan.nextWave?.tasks?.join(",") || "none"}`,
    `BLOCKED: ${(plan.blocked || []).map((item) => `${item.taskId}:${item.reason}`).join(" | ") || "none"}`,
    `SERIALIZED: ${(plan.serialized || []).map((item) => `${item.taskId}:${item.reason}`).join(" | ") || "none"}`,
    `BLOCKERS: ${(plan.blockers || []).join(",") || "none"}`,
  ].join("\n");
}

function computeReadyTasks(tasks = []) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  return tasks.filter((task) => {
    if (!OPEN_STATUSES.has(task.status || "open")) return false;
    return (task.dependencies || []).every((dependencyId) => COMPLETE_STATUSES.has(byId.get(dependencyId)?.status));
  });
}

function writeSet(task = {}) {
  return [
    ...(task.targetFiles || []),
    ...(task.filesTouched || []),
    ...(task.fileImpact || []),
    ...(task.writeScope || []).map((entry) => entry.path || entry),
  ].map(normalizePath).filter(Boolean).sort();
}

function normalizePath(path = "") {
  return String(path || "").replace(/\\/g, "/").replace(/^\.\//, "");
}
