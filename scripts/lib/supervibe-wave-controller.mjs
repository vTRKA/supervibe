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
  requireWriteSet = false,
  writeSetLocks = [],
} = {}) {
  const blockers = [];
  const staleSessions = worktreeSessions.filter((session) => session.status === "stale");
  const lockReport = normalizeWriteSetLocks(writeSetLocks);
  if (reviewers.length === 0) blockers.push("missing-reviewer");
  if (staleSessions.length > 0) blockers.push("stale-worktree-session");
  if (lockReport.stale.length > 0) blockers.push("stale-write-set-lock");
  if (claims.some((claim) => claim.status === "active" && claim.blocked === true)) blockers.push("blocked-worker-claim");

  const candidates = readyFront?.ready || readyFront?.parallel || computeReadyTasks(tasks);
  const conflicts = detectWriteSetConflicts(candidates);
  const conflictTaskIds = new Set(conflicts.flatMap((conflict) => conflict.taskIds.slice(1)));
  const blocked = [];
  const serialized = [];
  const selected = [];
  const usedFiles = new Set();

  for (const task of candidates) {
    const taskWriteSet = writeSet(task);
    if (requireWriteSet && taskWriteSet.length === 0) {
      blocked.push({ taskId: task.id, reason: "missing write-set declaration" });
      continue;
    }
    const lockConflicts = findWriteSetLockConflicts({ taskId: task.id, writeSet: taskWriteSet }, lockReport.active);
    if (lockConflicts.length > 0) {
      blocked.push({
        taskId: task.id,
        reason: `write-set lock conflict: ${lockConflicts.map((lock) => lock.lockId).join(",")}`,
        locks: lockConflicts.map((lock) => lock.lockId),
      });
      continue;
    }
    if ((RISK_ORDER[task.policyRiskLevel || "low"] ?? 1) > (RISK_ORDER[maxPolicyRiskLevel] ?? 2)) {
      blocked.push({ taskId: task.id, reason: `risk ${task.policyRiskLevel || "low"} exceeds wave max ${maxPolicyRiskLevel}` });
      continue;
    }
    if (conflictTaskIds.has(task.id) || taskWriteSet.some((file) => usedFiles.has(file))) {
      serialized.push({ taskId: task.id, reason: `write-set conflict: ${taskWriteSet.join(",") || "unknown"}` });
      continue;
    }
    if (selected.length >= maxConcurrency) {
      serialized.push({ taskId: task.id, reason: `max concurrency ${maxConcurrency} reached` });
      continue;
    }
    selected.push(task);
    for (const file of taskWriteSet) usedFiles.add(file);
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
    writeSetLocks: selected.map((task) => createReservedWriteSetLock(task)),
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
    writeSetLocks: lockReport,
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
  const staleLocks = plan.writeSetLocks?.stale || [];
  const activeLocks = plan.writeSetLocks?.active || [];
  return [
    "SUPERVIBE_WAVES",
    `STATUS: ${summary.status}`,
    `CURRENT_WAVE: ${plan.currentWave?.waveId || "none"}`,
    `CURRENT_TASKS: ${plan.currentWave?.tasks?.join(",") || "none"}`,
    `NEXT_WAVE: ${plan.nextWave?.tasks?.join(",") || "none"}`,
    `BLOCKED: ${(plan.blocked || []).map((item) => `${item.taskId}:${item.reason}`).join(" | ") || "none"}`,
    `SERIALIZED: ${(plan.serialized || []).map((item) => `${item.taskId}:${item.reason}`).join(" | ") || "none"}`,
    `WRITE_SET_LOCKS: active=${activeLocks.length} stale=${staleLocks.length}`,
    `STALE_WRITE_SET_LOCKS: ${staleLocks.map((lock) => lock.lockId).join(",") || "none"}`,
    `RECOVER_WRITE_SET_LOCKS: ${staleLocks.map((lock) => lock.recoverCommand).join(" | ") || "none"}`,
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

function normalizeWriteSetLocks(locks = []) {
  const all = locks.map((lock, index) => {
    const lockId = lock.lockId || lock.id || `write-set-lock-${index + 1}`;
    return {
      lockId,
      taskId: lock.taskId || lock.itemId || null,
      owner: lock.owner || lock.agentId || null,
      status: String(lock.status || "active").toLowerCase(),
      writeSet: uniqueNormalizedPaths(lock.writeSet || lock.assignedWriteSet || lock.targetFiles || lock.files || []),
      staleAt: lock.staleAt || null,
      recoverCommand: `/supervibe-loop --recover-stale-lock ${lockId}`,
    };
  }).filter((lock) => lock.writeSet.length > 0);
  return {
    all,
    active: all.filter((lock) => ["planned", "ready", "active", "locked", "reserved"].includes(lock.status)),
    stale: all.filter((lock) => lock.status === "stale"),
  };
}

function findWriteSetLockConflicts(taskLock = {}, locks = []) {
  const taskFiles = new Set(taskLock.writeSet || []);
  if (taskFiles.size === 0) return [];
  return locks.filter((lock) => {
    if (lock.taskId && taskLock.taskId && lock.taskId === taskLock.taskId) return false;
    return (lock.writeSet || []).some((file) => taskFiles.has(file));
  });
}

function createReservedWriteSetLock(task = {}) {
  const taskId = task.id || task.taskId || "unknown-task";
  return {
    lockId: `write-set-${taskId}`,
    taskId,
    status: "reserved",
    writeSet: writeSet(task),
  };
}

function uniqueNormalizedPaths(paths = []) {
  return [...new Set(paths.map(normalizePath).filter(Boolean))].sort();
}

function normalizePath(path = "") {
  return String(path || "").replace(/\\/g, "/").replace(/^\.\//, "");
}
