import {
  assertAgentOutputProofBinding,
  enforceGateCForAutomation,
  planDryRunHostInvocation,
} from "./supervibe-agent-run-bridge.mjs";

const COMPLETE_STATUSES = new Set(["complete", "cancelled", "policy_stopped", "budget_stopped"]);
const OPEN_STATUSES = new Set(["open", "ready", "pending"]);
const RISK_ORDER = { none: 0, low: 1, medium: 2, high: 3 };
const REVIEW_TASK_TYPES = new Set(["review", "review-gate", "reviewer", "quality-gate"]);
const REVIEW_AGENT_PATTERN = /(^|[-_.])(review|reviewer|qa|quality-gate)([-_.]|$)/i;
const FINAL_SWEEP_PATTERN = /\b(final[- ]?(sweep|review|gate)|release[- ]?(sweep|gate)|readiness[- ]?sweep|merge[- ]?sweep|sweep)\b/i;

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

  const candidates = resolveWaveCandidates({ tasks, readyFront });
  const candidateGroups = partitionWaveCandidates(candidates);
  const selection = selectSafeExecutionWave({
    tasks: candidateGroups.implementation,
    maxConcurrency,
    maxPolicyRiskLevel,
    requireWriteSet,
    writeSetLocks: lockReport.active,
  });
  const { selected, blocked, serialized, conflicts } = selection;
  const reviewWork = candidateGroups.review.map((task) => createReviewWorkItem(task, normalizedReviewMode));

  const readyWorktrees = worktreeSessions.filter((session) => ["ready", "active"].includes(session.status));
  const wave = selected.length > 0 ? {
    waveId: "wave-1",
    status: blockers.length ? "paused" : "ready",
    tasks: selected.map((task) => taskIdentifier(task)),
    maxConcurrency,
    worktrees: readyWorktrees.slice(0, selected.length).map((session) => session.sessionId),
    reviewers: finalSweepReview ? [] : reviewers.slice(0, Math.max(1, selected.length)),
    reviewerPolicy: {
      mode: normalizedReviewMode,
      deferredUntil: finalSweepReview ? "graph-release-gate" : null,
    },
    verificationPlan: selected.map((task) => ({ taskId: taskIdentifier(task), required: task.verificationCommands || [] })),
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
    reviewWork,
    finalSweepWork: reviewWork.filter((item) => item.workKind === "final-sweep" || item.workKind === "release-sweep"),
    conflicts,
    writeSetLocks: lockReport,
    reviewPolicy: {
      mode: normalizedReviewMode,
      reviewersRequiredAt: finalSweepReview ? "final-graph-sweep" : "per-wave",
    },
  };
}

export function buildDispatchDryRunPlan({
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
  host = "codex",
  hostInvocationSource = null,
  command = null,
  stage = null,
  handoffId = null,
  actions = ["spawn", "receipt"],
  now = "dry-run-planned",
} = {}) {
  const wavePlan = buildExecutionWaves({
    tasks,
    readyFront,
    maxConcurrency,
    maxPolicyRiskLevel,
    reviewers,
    reviewMode,
    worktreeSessions,
    claims,
    requireWriteSet,
    writeSetLocks,
  });
  const candidates = resolveWaveCandidates({ tasks, readyFront });
  const selectedIds = new Set(wavePlan.currentWave?.tasks || []);
  const blockedReasons = blockedReasonMap(wavePlan.blocked, wavePlan.serialized);
  const candidateSummaries = candidates.map((task) => {
    const taskId = taskIdentifier(task);
    const workKind = classifyWaveTask(task);
    const reviewWork = workKind !== "implementation";
    return {
      taskId,
      agentId: taskAgentId(task),
      workKind,
      status: reviewWork
        ? `${workKind}-ready`
        : selectedIds.has(taskId) ? "planned" : blockedReasons.has(taskId) ? "blocked" : "candidate",
      writeSet: taskWriteSet(task),
      policyRiskLevel: task.policyRiskLevel || "low",
      blockedReasons: blockedReasons.get(taskId) || [],
    };
  });
  const plannedHostInvocations = candidates
    .filter((task) => selectedIds.has(taskIdentifier(task)))
    .map((task, index) => planDryRunHostInvocation({
      task,
      taskId: taskIdentifier(task),
      agentId: taskAgentId(task),
      workKind: "implementation",
      host,
      hostInvocationSource: hostInvocationSource || undefined,
      waveId: wavePlan.currentWave?.waveId || "wave-1",
      sequence: index + 1,
      actions,
      command,
      stage,
      handoffId,
      now,
    }));

  return {
    schemaVersion: 1,
    dryRun: true,
    lifecycle: "dispatch-dry-run-planned",
    status: wavePlan.status,
    spawned: false,
    applied: false,
    receiptIssued: false,
    maxConcurrency: effectiveMaxConcurrency(maxConcurrency),
    candidates: candidateSummaries,
    selected: [...selectedIds],
    blocked: wavePlan.blocked || [],
    serialized: wavePlan.serialized || [],
    blockers: wavePlan.blockers || [],
    writeConflicts: wavePlan.conflicts || [],
    writeSetLocks: wavePlan.writeSetLocks,
    waves: wavePlan.waves || [],
    reviewWork: wavePlan.reviewWork || [],
    finalSweepWork: wavePlan.finalSweepWork || [],
    plannedHostInvocations,
  };
}

export async function applyDispatchTransaction({
  plan = {},
  approvalArtifact = null,
  existingClaims = [],
  spawnExecutor = null,
  receiptIssuer = null,
  outputBindings = {},
  now = new Date().toISOString(),
  forceSpawnFailure = false,
} = {}) {
  const planned = Array.isArray(plan.plannedHostInvocations) ? plan.plannedHostInvocations : [];
  const startingClaims = cloneJson(existingClaims);
  const stagedClaims = planned.map((item, index) => ({
    claimId: `claim-${sanitizeId(item.taskId)}-${index + 1}`,
    taskId: item.taskId,
    agentId: item.agentId,
    runId: item.runId,
    hostInvocation: item.hostInvocation,
    status: "staged",
    createdAt: now,
  }));

  try {
    for (const item of planned) {
      const actions = Array.isArray(item.actions) ? item.actions : [];
      for (const action of actions) {
        enforceGateCForAutomation({ record: item.record, approvalArtifact, action });
      }
      if (item.respawnPolicy?.allowed === false) {
        throw new Error(`Respawn blocked for ${item.taskId}: ${item.respawnPolicy.reason}`);
      }
    }

    if (planned.length > 0 && typeof spawnExecutor !== "function") {
      throw new Error("spawnExecutor is required for dispatch apply");
    }

    const spawned = [];
    for (const [index, item] of planned.entries()) {
      if (forceSpawnFailure) throw new Error("forced spawn failure");
      const result = await spawnExecutor({
        plannedInvocation: item,
        claim: stagedClaims[index],
        sequence: index + 1,
      });
      spawned.push({
        ...item,
        claim: { ...stagedClaims[index], status: "active" },
        spawnResult: result || {},
      });
    }

    const proofBindings = [];
    for (const item of spawned) {
      if (!item.actions.includes("receipt")) continue;
      const issued = typeof receiptIssuer === "function"
        ? await receiptIssuer({ plannedInvocation: item, spawnResult: item.spawnResult })
        : null;
      const binding = issued?.outputBinding || outputBindings[item.taskId] || item.spawnResult?.outputBinding;
      proofBindings.push(assertAgentOutputProofBinding({ record: item.record, outputBinding: binding }));
    }

    return {
      status: "applied",
      applied: true,
      retryable: false,
      claims: [...startingClaims, ...spawned.map((item) => item.claim)],
      stagedClaims: [],
      spawned: spawned.map((item) => ({
        taskId: item.taskId,
        agentId: item.agentId,
        claimId: item.claim.claimId,
        hostInvocation: item.hostInvocation,
      })),
      proofBindings,
      rollback: { applied: false, reason: null },
    };
  } catch (error) {
    return {
      status: "retryable_failure",
      applied: false,
      retryable: true,
      error: error.message,
      claims: startingClaims,
      stagedClaims: [],
      spawned: [],
      proofBindings: [],
      rollback: {
        applied: true,
        reason: error.message,
        activeClaimsAdded: 0,
      },
    };
  }
}

export function formatDispatchDryRunPlan(plan = {}) {
  return [
    "SUPERVIBE_DISPATCH_DRY_RUN",
    `STATUS: ${plan.status || "unknown"}`,
    `MAX_CONCURRENCY: ${plan.maxConcurrency ?? "unknown"}`,
    `CANDIDATES: ${(plan.candidates || []).length}`,
    `PLANNED: ${(plan.plannedHostInvocations || []).map((item) => `${item.taskId}:${item.hostInvocation.invocationId}`).join(",") || "none"}`,
    `REVIEW_WORK: ${(plan.reviewWork || []).map((item) => `${item.taskId}:${item.workKind}`).join(",") || "none"}`,
    `FINAL_SWEEP_WORK: ${(plan.finalSweepWork || []).map((item) => item.taskId).join(",") || "none"}`,
    `BLOCKED: ${(plan.blocked || []).map((item) => `${item.taskId}:${item.reason}`).join(" | ") || "none"}`,
    `SERIALIZED: ${(plan.serialized || []).map((item) => `${item.taskId}:${item.reason}`).join(" | ") || "none"}`,
    `WRITE_CONFLICTS: ${(plan.writeConflicts || []).map((item) => `${item.filePath}:${item.taskIds.join(",")}`).join(" | ") || "none"}`,
    `SPAWNED: ${plan.spawned === true}`,
    `APPLIED: ${plan.applied === true}`,
    `RECEIPT_ISSUED: ${plan.receiptIssued === true}`,
  ].join("\n");
}

export function detectWriteSetConflicts(tasks = []) {
  const byFile = new Map();
  for (const task of tasks) {
    for (const file of taskWriteSet(task)) {
      if (!byFile.has(file)) byFile.set(file, []);
      byFile.get(file).push(taskIdentifier(task));
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
    const taskId = taskIdentifier(task);
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
  const taskId = taskIdentifier(task);
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

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function sanitizeId(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

function normalizeReviewMode(value) {
  const normalized = String(value || "final-sweep").trim().toLowerCase().replace(/_/g, "-");
  if (["per-task", "per-wave", "inline", "wave", "stage-2"].includes(normalized)) return "per-wave";
  return "final-sweep";
}

function resolveWaveCandidates({ tasks = [], readyFront = null } = {}) {
  if (Array.isArray(readyFront?.parallel) && readyFront.parallel.length > 0) return readyFront.parallel;
  if (Array.isArray(readyFront?.ready)) return readyFront.ready;
  return computeReadyTasks(tasks);
}

function partitionWaveCandidates(tasks = []) {
  return tasks.reduce((groups, task) => {
    const workKind = classifyWaveTask(task);
    groups[workKind === "implementation" ? "implementation" : "review"].push(task);
    return groups;
  }, { implementation: [], review: [] });
}

function createReviewWorkItem(task = {}, reviewMode = "final-sweep") {
  const workKind = classifyWaveTask(task);
  return {
    taskId: taskIdentifier(task),
    agentId: taskAgentId(task),
    workKind,
    status: "ready",
    dispatchPolicy: "separate-review-sweep",
    deferredUntil: workKind === "review" && reviewMode !== "final-sweep" ? "per-wave-review-gate" : "graph-release-gate",
    plannedHostInvocation: false,
    writeSet: taskWriteSet(task),
  };
}

function blockedReasonMap(blocked = [], serialized = []) {
  const byTask = new Map();
  for (const item of [...blocked, ...serialized]) {
    if (!item?.taskId) continue;
    if (!byTask.has(item.taskId)) byTask.set(item.taskId, []);
    byTask.get(item.taskId).push(item.reason || "blocked");
  }
  return byTask;
}

function effectiveMaxConcurrency(maxConcurrency) {
  const parsed = Number(maxConcurrency);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 1;
}

function taskIdentifier(task = {}) {
  return task.id || task.taskId || task.itemId || "unknown-task";
}

function taskAgentId(task = {}) {
  return task.agentId || task.ownerCapability || task.owner || "worker";
}

export function classifyWaveTask(task = {}) {
  const explicit = normalizeWorkKind(task.workKind || task.dispatchKind || task.waveKind || task.executionKind);
  if (explicit !== "implementation") return explicit;

  const type = String(task.type || task.kind || task.category || "").trim().toLowerCase().replace(/_/g, "-");
  const text = [
    task.title,
    task.summary,
    task.description,
    task.stage,
    task.phase,
    ...(Array.isArray(task.labels) ? task.labels : []),
    ...(Array.isArray(task.requiredGates) ? task.requiredGates : []),
  ].map((value) => String(value || "")).join(" ");

  if (FINAL_SWEEP_PATTERN.test(`${type} ${text}`)) return "final-sweep";
  if (REVIEW_TASK_TYPES.has(type)) return "review";
  if (REVIEW_AGENT_PATTERN.test(taskAgentId(task)) || REVIEW_AGENT_PATTERN.test(String(task.requiredAgentCapability || ""))) {
    return "review";
  }
  return "implementation";
}

function normalizeWorkKind(value = "implementation") {
  const normalized = String(value || "implementation").trim().toLowerCase().replace(/_/g, "-");
  if (["review", "final-sweep", "release-sweep"].includes(normalized)) return normalized;
  return "implementation";
}
