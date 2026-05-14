const COMPLETE_STATUSES = new Set(["complete", "cancelled", "policy_stopped", "budget_stopped"]);
const OPEN_STATUSES = new Set(["open", "ready", "pending"]);
const RISK_ORDER = { none: 0, low: 1, medium: 2, high: 3 };

export function buildExecutionWaves({
  tasks = [],
  readyFront = null,
  maxConcurrency = 3,
  maxPolicyRiskLevel = "medium",
  reviewers = ["quality-gate-reviewer"],
  reviewMode = "final-sweep",
  worktreeSessions = [],
  claims = [],
  requireWriteSet = false,
  writeSetLocks = [],
} = {}) {
  const blockers = [];
  const normalizedReviewMode = normalizeReviewMode(reviewMode);
  const finalSweepReview = normalizedReviewMode === "final-sweep";
  const staleSessions = worktreeSessions.filter((session) => session.status === "stale");
  const lockReport = normalizeWriteSetLocks(writeSetLocks);
  if (!finalSweepReview && reviewers.length === 0) blockers.push("missing-reviewer");
  if (staleSessions.length > 0) blockers.push("stale-worktree-session");
  if (lockReport.stale.length > 0) blockers.push("stale-write-set-lock");
  if (claims.some((claim) => claim.status === "active" && claim.blocked === true)) blockers.push("blocked-worker-claim");

  const candidates = Array.isArray(readyFront?.parallel) && readyFront.parallel.length > 0
    ? readyFront.parallel
    : Array.isArray(readyFront?.ready)
      ? readyFront.ready
      : computeReadyTasks(tasks);
  const selection = selectSafeExecutionWave({
    tasks: candidates,
    maxConcurrency,
    maxPolicyRiskLevel,
    requireWriteSet,
    writeSetLocks: lockReport.active,
  });
  const { selected, blocked, serialized, conflicts } = selection;

  const readyWorktrees = worktreeSessions.filter((session) => ["ready", "active"].includes(session.status));
  const wave = selected.length > 0 ? {
    waveId: "wave-1",
    status: blockers.length ? "paused" : "ready",
    tasks: selected.map((task) => task.id),
    maxConcurrency,
    worktrees: readyWorktrees.slice(0, selected.length).map((session) => session.sessionId),
    reviewers: finalSweepReview ? [] : reviewers.slice(0, Math.max(1, selected.length)),
    reviewerPolicy: {
      mode: normalizedReviewMode,
      deferredUntil: finalSweepReview ? "graph-release-gate" : null,
    },
    verificationPlan: selected.map((task) => ({ taskId: task.id, required: task.verificationCommands || [] })),
    writeSetLocks: selected.map((task) => createReservedWriteSetLock(task)),
    stopConditions: ["policy_stop", "failed_gate", "stale_worker_session", "write_set_conflict"],
    mergeStrategy: finalSweepReview ? "verify-reconcile-final-review" : "verify-review-reconcile",
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
    reviewPolicy: {
      mode: normalizedReviewMode,
      reviewersRequiredAt: finalSweepReview ? "final-graph-sweep" : "per-wave",
    },
  };
}

export function detectWriteSetConflicts(tasks = []) {
  const byFile = new Map();
  for (const task of tasks) {
    for (const file of taskWriteSet(task)) {
      if (!byFile.has(file)) byFile.set(file, []);
      byFile.get(file).push(task.id);
    }
  }
  return [...byFile.entries()]
    .filter(([, taskIds]) => taskIds.length > 1)
    .map(([filePath, taskIds]) => ({ filePath, taskIds }));
}

export function selectSafeExecutionWave({
  tasks = [],
  maxConcurrency = 3,
  maxPolicyRiskLevel = "medium",
  requireWriteSet = false,
  writeSetLocks = [],
} = {}) {
  const blocked = [];
  const serialized = [];
  const selected = [];
  const usedFiles = new Map();
  const conflicts = detectWriteSetConflicts(tasks);
  const activeLocks = Array.isArray(writeSetLocks?.active) ? writeSetLocks.active : writeSetLocks;
  const parsedMaxConcurrency = Number(maxConcurrency);
  const effectiveMaxConcurrency = Number.isFinite(parsedMaxConcurrency)
    ? Math.max(0, Math.floor(parsedMaxConcurrency))
    : 1;

  for (const task of tasks) {
    const taskId = task.id || task.taskId || task.itemId;
    const writeSet = taskWriteSet(task);
    if (requireWriteSet && writeSet.length === 0) {
      blocked.push({ taskId, reason: "missing write-set declaration" });
      continue;
    }
    const lockConflicts = findWriteSetLockConflicts({ taskId, writeSet }, activeLocks);
    if (lockConflicts.length > 0) {
      blocked.push({
        taskId,
        reason: `write-set lock conflict: ${lockConflicts.map((lock) => lock.lockId).join(",")}`,
        locks: lockConflicts.map((lock) => lock.lockId),
      });
      continue;
    }
    if ((RISK_ORDER[task.policyRiskLevel || "low"] ?? 1) > (RISK_ORDER[maxPolicyRiskLevel] ?? 2)) {
      blocked.push({ taskId, reason: `risk ${task.policyRiskLevel || "low"} exceeds wave max ${maxPolicyRiskLevel}` });
      continue;
    }
    const conflictingPath = writeSet.find((file) => usedFiles.has(file));
    if (conflictingPath) {
      serialized.push({ taskId, reason: `write-set conflict with ${usedFiles.get(conflictingPath)} on ${conflictingPath}` });
      continue;
    }
    if (selected.length >= effectiveMaxConcurrency) {
      serialized.push({ taskId, reason: `max concurrency ${effectiveMaxConcurrency} reached` });
      continue;
    }
    selected.push(task);
    for (const file of writeSet) usedFiles.set(file, taskId);
  }

  return {
    selected,
    blocked,
    serialized,
    conflicts,
  };
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

export function taskWriteSet(task = {}) {
  return [
    ...(task.targetFiles || []),
    ...(task.filesTouched || []),
    ...(task.fileImpact || []),
    ...(task.writeScope || [])
      .filter((entry) => {
        if (!entry || typeof entry !== "object") return true;
        const action = String(entry.action || entry.mode || "modify").toLowerCase();
        return !["test", "read", "verify", "verification"].includes(action);
      })
      .map((entry) => entry.path || entry),
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
    writeSet: taskWriteSet(task),
  };
}

function uniqueNormalizedPaths(paths = []) {
  return [...new Set(paths.map(normalizePath).filter(Boolean))].sort();
}

function normalizePath(path = "") {
  return String(path || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function normalizeReviewMode(value) {
  const normalized = String(value || "final-sweep").trim().toLowerCase().replace(/_/g, "-");
  if (["per-task", "per-wave", "inline", "wave", "stage-2"].includes(normalized)) return "per-wave";
  return "final-sweep";
}
