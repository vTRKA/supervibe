const DEFAULT_TASK_BUDGET_POLICY = Object.freeze({
  schemaVersion: 1,
  maxTasksPerPhase: 12,
  maxChildItemsPerAtomizationRun: 80,
  requirePhaseSplitDecision: true,
});

const ACCEPTED_BUDGET_DECISION_ACTIONS = new Set([
  "phase-split-approved",
  "explicit-budget-override",
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
  const hasPhaseSplitRule = /\bphase[- ]split\b/i.test(source) || /\bsplit\s+(?:the\s+)?(?:plan\s+)?(?:into\s+)?phases\b/i.test(source);
  const hasBudgetLanguage = /\b(task\s+budget|budget|anti-bloat)\b/i.test(source);

  return normalizeTaskBudgetPolicy({
    maxTasksPerPhase,
    maxChildItemsPerAtomizationRun,
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

export function evaluateTaskBudgetPolicy({ items = [], policy, decision } = {}) {
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
    },
    violations,
  };
  return {
    ...report,
    prompt: exceeded ? formatTaskBudgetPhaseSplitPrompt(report) : null,
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
    requirePhaseSplitDecision: policy.requirePhaseSplitDecision !== false,
    hasExplicitPolicy: Boolean(policy.hasExplicitPolicy),
    childItems: totals.childItems ?? null,
    implementationItems: totals.implementationItems ?? null,
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
    `PHASE_SPLIT_REQUIRED: ${summary.requirePhaseSplitDecision}`,
    `TASK_BUDGET_CHILD_ITEMS: ${summary.childItems ?? "unknown"}`,
    `TASK_BUDGET_LARGEST_PHASE: ${largestPhase.count ?? "unknown"}/${summary.maxTasksPerPhase ?? "unknown"} phase=${largestPhase.phaseId || "none"}`,
    `TASK_BUDGET_DECISION: ${summary.decisionStatus || "missing"}`,
  ];
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
  ];
  for (const violation of violations) {
    lines.push(`VIOLATION: ${violation.code} actual=${violation.actual} limit=${violation.limit}${violation.phaseId ? ` phase=${violation.phaseId}` : ""}`);
  }
  lines.push("PHASE_SPLIT_REQUIRED: split the plan into smaller phases, defer lower-priority work, or record an explicit approved budget override before graph write.");
  lines.push("NEXT_QUESTION: Which phase should be written now, and which task ids should move to the next phase?");
  return lines.join("\n");
}

function countItemsByPhase(items) {
  const counts = new Map();
  for (const item of items) {
    const phaseId = String(
      item.executionHints?.parentTaskRef
      || item.parallelGroup
      || item.executionHints?.sourceTaskRef
      || "unmapped",
    );
    counts.set(phaseId, (counts.get(phaseId) || 0) + 1);
  }
  return counts;
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
