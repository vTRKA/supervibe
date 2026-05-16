const DEFAULT_TASK_BUDGET_POLICY = Object.freeze({
  schemaVersion: 1,
  maxTasksPerPhase: 12,
  maxChildItemsPerAtomizationRun: 80,
  maxActiveTasksPerPhase: 3,
  maxSameFileActiveWriters: 1,
  requirePhaseSplitDecision: true,
});

const ACCEPTED_BUDGET_DECISION_ACTIONS = new Set([
  "phase-split-approved",
  "explicit-budget-override",
]);

const ACTIVE_TASK_STATUSES = new Set([
  "active",
  "assigned",
  "claimed",
  "in_progress",
  "planned",
  "reserved",
  "running",
  "staged",
]);

const ACTIVE_SESSION_STATUSES = new Set([
  "active",
  "planned",
  "ready",
  "reserved",
  "running",
  "staged",
]);

export function parseTaskBudgetPolicyFromText(text) {
  const source = String(text ?? "");
  const maxTasksPerPhase = matchPositiveInteger(source, [
    /\bmax(?:imum)?\s+tasks\s+per\s+phase\s*[:=]\s*(\d+)/i,
    /\bmaxTasksPerPhase\s*[:=]\s*(\d+)/i,
  ]);
  const maxChildItemsPerAtomizationRun = matchPositiveInteger(source, [
    /\bmax(?:imum)?\s+child\s+items?\s+per\s+atomization\s+run\s*[:=]\s*(\d+)/i,
    /\bmaxChildItemsPerAtomizationRun\s*[:=]\s*(\d+)/i,
  ]);
  const maxActiveTasksPerPhase = matchPositiveInteger(source, [
    /\bmax(?:imum)?\s+active\s+tasks?\s+per\s+phase\s*[:=]\s*(\d+)/i,
    /\bmaxActiveTasksPerPhase\s*[:=]\s*(\d+)/i,
  ]);
  const maxSameFileActiveWriters = matchPositiveInteger(source, [
    /\bmax(?:imum)?\s+same[- ]file\s+(?:active\s+)?writers?\s*[:=]\s*(\d+)/i,
    /\bmaxSameFileActiveWriters\s*[:=]\s*(\d+)/i,
  ]);
  const hasPhaseSplitRule = /\bphase[- ]split\b/i.test(source) || /\bsplit\s+(?:the\s+)?(?:plan\s+)?(?:into\s+)?phases\b/i.test(source);
  const hasBudgetLanguage = /\b(task\s+budget|budget|anti-bloat)\b/i.test(source);

  return normalizeTaskBudgetPolicy({
    maxTasksPerPhase,
    maxChildItemsPerAtomizationRun,
    maxActiveTasksPerPhase,
    maxSameFileActiveWriters,
    hasExplicitPolicy: maxTasksPerPhase != null && maxChildItemsPerAtomizationRun != null && hasPhaseSplitRule && hasBudgetLanguage,
    hasPhaseSplitRule,
    source: source.trim() || null,
  });
}

function normalizeTaskBudgetPolicy(input = {}) {
  return {
    schemaVersion: 1,
    maxTasksPerPhase: positiveIntegerOrDefault(input.maxTasksPerPhase, DEFAULT_TASK_BUDGET_POLICY.maxTasksPerPhase),
    maxChildItemsPerAtomizationRun: positiveIntegerOrDefault(
      input.maxChildItemsPerAtomizationRun,
      DEFAULT_TASK_BUDGET_POLICY.maxChildItemsPerAtomizationRun,
    ),
    maxActiveTasksPerPhase: positiveIntegerOrDefault(
      input.maxActiveTasksPerPhase,
      DEFAULT_TASK_BUDGET_POLICY.maxActiveTasksPerPhase,
    ),
    maxSameFileActiveWriters: positiveIntegerOrDefault(
      input.maxSameFileActiveWriters,
      DEFAULT_TASK_BUDGET_POLICY.maxSameFileActiveWriters,
    ),
    requirePhaseSplitDecision: input.requirePhaseSplitDecision !== false,
    hasExplicitPolicy: Boolean(input.hasExplicitPolicy),
    hasPhaseSplitRule: Boolean(input.hasPhaseSplitRule),
    source: input.source || null,
  };
}

function normalizeTaskBudgetDecision(input = {}) {
  if (!input || typeof input !== "object") {
    return {
      schemaVersion: 1,
      status: "missing",
      action: null,
      reason: null,
      approvedBy: null,
      approvedAt: null,
    };
  }
  const action = input.action || input.status || null;
  const reason = typeof input.reason === "string" && input.reason.trim() ? input.reason.trim() : null;
  const accepted = ACCEPTED_BUDGET_DECISION_ACTIONS.has(String(action || "")) && reason;
  return {
    schemaVersion: 1,
    status: accepted ? "accepted" : (input.status || "recorded"),
    action,
    reason,
    approvedBy: input.approvedBy || null,
    approvedAt: input.approvedAt || null,
  };
}

export function evaluateTaskBudgetPolicy({ items = [], activeItems, sessions = [], claims = [], policy, decision } = {}) {
  const normalizedPolicy = normalizeTaskBudgetPolicy(policy);
  const normalizedDecision = normalizeTaskBudgetDecision(decision);
  const childItems = items.filter((item) => item?.type !== "epic");
  const implementationItems = items.filter((item) => !["epic", "gate", "followup"].includes(item?.type));
  const phaseCounts = countItemsByPhase(implementationItems);
  const largestPhase = [...phaseCounts.entries()]
    .map(([phaseId, count]) => ({ phaseId, count }))
    .sort((a, b) => b.count - a.count || a.phaseId.localeCompare(b.phaseId))[0] || { phaseId: null, count: 0 };
  const violations = [];

  if (largestPhase.count > normalizedPolicy.maxTasksPerPhase) {
    violations.push({
      code: "max-tasks-per-phase-exceeded",
      phaseId: largestPhase.phaseId,
      actual: largestPhase.count,
      limit: normalizedPolicy.maxTasksPerPhase,
    });
  }
  if (childItems.length > normalizedPolicy.maxChildItemsPerAtomizationRun) {
    violations.push({
      code: "max-child-items-per-atomization-run-exceeded",
      actual: childItems.length,
      limit: normalizedPolicy.maxChildItemsPerAtomizationRun,
    });
  }
  const activeBudget = evaluatePhaseActiveBudgetPolicy({
    items: implementationItems,
    activeItems,
    sessions,
    claims,
    policy: normalizedPolicy,
  });
  violations.push(...activeBudget.violations);

  const decisionAccepted = normalizedDecision.status === "accepted";
  const exceeded = violations.length > 0 && !decisionAccepted;
  const report = {
    schemaVersion: 1,
    pass: !exceeded,
    exceeded,
    policy: normalizedPolicy,
    decision: normalizedDecision,
    totals: {
      childItems: childItems.length,
      implementationItems: implementationItems.length,
      phases: phaseCounts.size,
      largestPhase,
      activeBudget,
    },
    violations,
  };
  return {
    ...report,
    prompt: exceeded ? formatTaskBudgetPhaseSplitPrompt(report) : null,
  };
}

export function evaluatePhaseActiveBudgetPolicy({ items = [], activeItems = null, sessions = [], claims = [], policy } = {}) {
  const normalizedPolicy = normalizeTaskBudgetPolicy(policy);
  const activeRecords = resolveActiveBudgetItems({ items, activeItems, sessions, claims });
  const activePhaseCounts = countItemsByPhase(activeRecords);
  const largestActivePhase = [...activePhaseCounts.entries()]
    .map(([phaseId, count]) => ({ phaseId, count }))
    .sort((a, b) => b.count - a.count || a.phaseId.localeCompare(b.phaseId))[0] || { phaseId: null, count: 0 };
  const sameFileWriters = countSameFileWriters(activeRecords);
  const busiestFile = sameFileWriters[0] || { filePath: null, count: 0, taskIds: [] };
  const violations = [];

  if (largestActivePhase.count > normalizedPolicy.maxActiveTasksPerPhase) {
    violations.push({
      code: "max-active-tasks-per-phase-exceeded",
      phaseId: largestActivePhase.phaseId,
      actual: largestActivePhase.count,
      limit: normalizedPolicy.maxActiveTasksPerPhase,
    });
  }
  if (busiestFile.count > normalizedPolicy.maxSameFileActiveWriters) {
    violations.push({
      code: "max-same-file-active-writers-exceeded",
      filePath: busiestFile.filePath,
      taskIds: busiestFile.taskIds,
      actual: busiestFile.count,
      limit: normalizedPolicy.maxSameFileActiveWriters,
    });
  }

  const report = {
    schemaVersion: 1,
    pass: violations.length === 0,
    exceeded: violations.length > 0,
    policy: {
      maxActiveTasksPerPhase: normalizedPolicy.maxActiveTasksPerPhase,
      maxSameFileActiveWriters: normalizedPolicy.maxSameFileActiveWriters,
    },
    totals: {
      activeTasks: activeRecords.length,
      phases: activePhaseCounts.size,
      largestActivePhase,
      busiestFile,
      sameFileWriters,
    },
    violations,
  };
  return {
    ...report,
    reason: formatPhaseActiveBudgetReason(report),
  };
}

export function assertTaskBudgetAllowsGraphWrite(graph = {}, options = {}) {
  const report = graph.metadata?.taskBudgetPolicy?.report
    || evaluateTaskBudgetPolicy({
      items: graph.items || [],
      policy: graph.metadata?.taskBudgetPolicy?.policy,
      decision: graph.metadata?.taskBudgetPolicy?.decision,
    });
  if (report.pass || options.allowTaskBudgetOverride) {
    return { pass: true, report };
  }
  return {
    pass: false,
    report,
    message: formatTaskBudgetPhaseSplitPrompt(report),
  };
}

export function summarizeTaskBudgetPolicy(taskBudgetPolicy = {}) {
  if (!taskBudgetPolicy || typeof taskBudgetPolicy !== "object") {
    return { recorded: false, status: "not-recorded" };
  }
  if (Object.hasOwn(taskBudgetPolicy, "recorded") && Object.hasOwn(taskBudgetPolicy, "status")) {
    return taskBudgetPolicy;
  }
  const report = taskBudgetPolicy.report && typeof taskBudgetPolicy.report === "object"
    ? taskBudgetPolicy.report
    : taskBudgetPolicy;
  const policy = report.policy || taskBudgetPolicy.policy || null;
  if (!policy) return { recorded: false, status: "not-recorded" };
  const totals = report.totals || {};
  const largestPhase = totals.largestPhase || {};
  return {
    recorded: true,
    status: report.pass === false ? "exceeded" : report.pass === true ? "pass" : "recorded",
    maxTasksPerPhase: policy.maxTasksPerPhase ?? null,
    maxChildItemsPerAtomizationRun: policy.maxChildItemsPerAtomizationRun ?? null,
    maxActiveTasksPerPhase: policy.maxActiveTasksPerPhase ?? null,
    maxSameFileActiveWriters: policy.maxSameFileActiveWriters ?? null,
    requirePhaseSplitDecision: policy.requirePhaseSplitDecision !== false,
    hasExplicitPolicy: Boolean(policy.hasExplicitPolicy),
    childItems: totals.childItems ?? null,
    implementationItems: totals.implementationItems ?? null,
    activeBudget: totals.activeBudget || null,
    largestPhase: {
      phaseId: largestPhase.phaseId ?? null,
      count: largestPhase.count ?? null,
    },
    decisionStatus: report.decision?.status || taskBudgetPolicy.decision?.status || "missing",
    violations: Array.isArray(report.violations) ? report.violations : [],
    splitRecommendation: report.prompt || null,
  };
}

export function formatTaskBudgetPolicySummary(taskBudgetPolicy = {}) {
  const summary = summarizeTaskBudgetPolicy(taskBudgetPolicy);
  if (!summary.recorded) return "TASK_BUDGET_POLICY: not-recorded";
  const largestPhase = summary.largestPhase || {};
  const lines = [
    `TASK_BUDGET_POLICY: ${summary.status}`,
    `MAX_TASKS_PER_PHASE: ${summary.maxTasksPerPhase ?? "unknown"}`,
    `MAX_CHILD_ITEMS_PER_ATOMIZATION_RUN: ${summary.maxChildItemsPerAtomizationRun ?? "unknown"}`,
    `MAX_ACTIVE_TASKS_PER_PHASE: ${summary.maxActiveTasksPerPhase ?? "unknown"}`,
    `MAX_SAME_FILE_ACTIVE_WRITERS: ${summary.maxSameFileActiveWriters ?? "unknown"}`,
    `PHASE_SPLIT_REQUIRED: ${summary.requirePhaseSplitDecision}`,
    `TASK_BUDGET_CHILD_ITEMS: ${summary.childItems ?? "unknown"}`,
    `TASK_BUDGET_LARGEST_PHASE: ${largestPhase.count ?? "unknown"}/${summary.maxTasksPerPhase ?? "unknown"} phase=${largestPhase.phaseId || "none"}`,
    `TASK_BUDGET_DECISION: ${summary.decisionStatus || "missing"}`,
  ];
  if (summary.activeBudget) {
    lines.push(`PHASE_ACTIVE_BUDGET: ${safeInline(summary.activeBudget.reason, 220)}`);
  }
  if (summary.violations.length > 0) {
    lines.push(`TASK_BUDGET_VIOLATIONS: ${summary.violations.map((violation) => violation.code).join(",")}`);
  }
  if (summary.splitRecommendation) {
    lines.push(`TASK_BUDGET_SPLIT_RECOMMENDATION: ${safeInline(summary.splitRecommendation, 220)}`);
  }
  return lines.join("\n");
}

function formatTaskBudgetPhaseSplitPrompt(report = {}) {
  const violations = Array.isArray(report.violations) ? report.violations : [];
  const lines = [
    "TASK_BUDGET_EXCEEDED",
    `MAX_TASKS_PER_PHASE: ${report.policy?.maxTasksPerPhase ?? "unknown"}`,
    `MAX_CHILD_ITEMS_PER_ATOMIZATION_RUN: ${report.policy?.maxChildItemsPerAtomizationRun ?? "unknown"}`,
    `MAX_ACTIVE_TASKS_PER_PHASE: ${report.policy?.maxActiveTasksPerPhase ?? "unknown"}`,
    `MAX_SAME_FILE_ACTIVE_WRITERS: ${report.policy?.maxSameFileActiveWriters ?? "unknown"}`,
  ];
  for (const violation of violations) {
    lines.push(`VIOLATION: ${violation.code} actual=${violation.actual} limit=${violation.limit}${violation.phaseId ? ` phase=${violation.phaseId}` : ""}${violation.filePath ? ` file=${violation.filePath}` : ""}`);
  }
  lines.push("PHASE_SPLIT_REQUIRED: split the plan into smaller phases, reduce active wave size, defer same-file work, or record an explicit approved budget override before writing.");
  lines.push("NEXT_QUESTION: Which phase should be written now, and which task ids should move to the next phase?");
  return lines.join("\n");
}

function countItemsByPhase(items) {
  const counts = new Map();
  for (const item of items) {
    const phaseId = String(
      item.phaseId
      || item.executionHints?.parentTaskRef
      || item.parallelGroup
      || item.executionHints?.sourceTaskRef
      || "unmapped",
    );
    counts.set(phaseId, (counts.get(phaseId) || 0) + 1);
  }
  return counts;
}

function resolveActiveBudgetItems({ items = [], activeItems = null, sessions = [], claims = [] } = {}) {
  const byId = new Map(items.map((item) => [taskIdentifier(item), item]));
  const records = [];
  const seen = new Set();
  const addRecord = (record) => {
    const id = taskIdentifier(record);
    const key = `${id}:${taskWriteSet(record).join("|")}:${record.phaseId || record.parallelGroup || ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    records.push(record);
  };

  if (Array.isArray(activeItems)) {
    for (const item of activeItems) addRecord(item);
    return records;
  }

  for (const item of items) {
    if (ACTIVE_TASK_STATUSES.has(String(item?.status || "").toLowerCase())) addRecord(item);
  }
  for (const claim of claims) {
    if (!ACTIVE_TASK_STATUSES.has(String(claim?.status || "").toLowerCase())) continue;
    const taskId = taskIdentifier(claim);
    addRecord({ ...byId.get(taskId), ...claim, id: taskId || byId.get(taskId)?.id });
  }
  for (const session of sessions) {
    if (!ACTIVE_SESSION_STATUSES.has(String(session?.status || "").toLowerCase())) continue;
    const taskIds = session.assignedTaskIds || session.workItemIds || [];
    if (taskIds.length === 0) {
      addRecord({
        id: session.sessionId,
        phaseId: session.assignedWaveId || session.phaseId || "active-session",
        targetFiles: session.assignedWriteSet || session.writeSet || [],
      });
      continue;
    }
    for (const taskId of taskIds) {
      addRecord({
        ...byId.get(taskId),
        id: taskId,
        phaseId: session.assignedWaveId || byId.get(taskId)?.phaseId,
        targetFiles: session.assignedWriteSet || byId.get(taskId)?.targetFiles || [],
      });
    }
  }
  return records;
}

function countSameFileWriters(items = []) {
  const byFile = new Map();
  for (const item of items) {
    const taskId = taskIdentifier(item);
    for (const filePath of taskWriteSet(item)) {
      if (!byFile.has(filePath)) byFile.set(filePath, new Set());
      byFile.get(filePath).add(taskId);
    }
  }
  return [...byFile.entries()]
    .map(([filePath, taskIds]) => ({ filePath, count: taskIds.size, taskIds: [...taskIds].sort() }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count || a.filePath.localeCompare(b.filePath));
}

function formatPhaseActiveBudgetReason(report = {}) {
  const policy = report.policy || {};
  const totals = report.totals || {};
  const largest = totals.largestActivePhase || {};
  const busiest = totals.busiestFile || {};
  const prefix = report.pass ? "PHASE_ACTIVE_BUDGET_OK" : "PHASE_ACTIVE_BUDGET_EXCEEDED";
  const parts = [
    prefix,
    `activeTasks=${totals.activeTasks ?? 0}`,
    `largestPhase=${largest.count ?? 0}/${policy.maxActiveTasksPerPhase ?? "unknown"} phase=${largest.phaseId || "none"}`,
    `sameFileWriters=${busiest.count ?? 0}/${policy.maxSameFileActiveWriters ?? "unknown"} file=${busiest.filePath || "none"}`,
  ];
  if (Array.isArray(report.violations) && report.violations.length > 0) {
    parts.push(`violations=${report.violations.map((violation) => violation.code).join(",")}`);
  }
  return parts.join("; ");
}

function taskWriteSet(task = {}) {
  return [
    ...(task.targetFiles || []),
    ...(task.filesTouched || []),
    ...(task.fileImpact || []),
    ...(task.assignedWriteSet || []),
    ...(task.writeSet || []),
    ...(task.writeScope || [])
      .filter((entry) => {
        if (!entry || typeof entry !== "object") return true;
        const action = String(entry.action || entry.mode || "modify").toLowerCase();
        return !["test", "read", "verify", "verification"].includes(action);
      })
      .map((entry) => entry.path || entry),
  ].map(normalizePath).filter(Boolean).sort();
}

function normalizePath(path = "") {
  return String(path || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function taskIdentifier(task = {}) {
  return task.id || task.taskId || task.itemId || task.workItemId || "unknown-task";
}

function matchPositiveInteger(source, patterns) {
  for (const pattern of patterns) {
    const match = pattern.exec(source);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isInteger(value) && value > 0) return value;
  }
  return null;
}

function positiveIntegerOrDefault(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function safeInline(value, maxLength) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}
