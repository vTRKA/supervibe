import { validateWorkItemGraph } from "./supervibe-plan-to-work-items.mjs";

const TERMINAL_STATUSES = new Set(["done", "complete", "completed", "closed"]);
const EXPLICITLY_SKIPPED_STATUSES = new Set(["skipped", "skip", "cancelled", "canceled"]);
const NON_BLOCKING_TYPES = new Set(["followup"]);

export function validateEpicCompletion(graph = {}, options = {}) {
  const issues = [];
  const warnings = [];
  const strictProduction = options.production !== false;
  const allowSkipped = options.allowSkipped !== false;
  const allowDryRunEvidence = Boolean(options.allowDryRunEvidence);
  const requireEpicClosed = options.requireEpicClosed !== false;
  const requireEvidence = options.requireEvidence !== false;
  const includeFollowups = Boolean(options.requireFollowups);
  const graphValidation = validateWorkItemGraph(graph);

  for (const issue of graphValidation.issues || []) {
    issues.push(completionIssue("graph-invalid", issue.itemId, issue.message, { graphIssue: issue }));
  }

  const items = Array.isArray(graph.items) ? graph.items : [];
  const tasks = Array.isArray(graph.tasks) ? graph.tasks : [];
  const ids = new Set(items.map((item) => item.itemId || item.id).filter(Boolean));
  const epic = items.find((item) => item.type === "epic") || null;
  const requiredItems = items.filter((item) => isRequiredForCompletion(item, { includeFollowups }));
  const evidenceByTask = collectEvidenceByTask(graph);

  if (requireEpicClosed && epic && !isTerminalStatus(epic.status)) {
    issues.push(completionIssue("epic-not-closed", epic.itemId || epic.id, "Epic must be closed after all required work items are complete."));
  }

  for (const item of requiredItems) {
    const id = item.itemId || item.id;
    const status = normalizeStatus(item.status);
    if (!isTerminalStatus(status) && !isSkippedStatus(status)) {
      issues.push(completionIssue("item-open", id, `${id} is not terminal: ${item.status || "open"}.`));
      continue;
    }

    if (isSkippedStatus(status)) {
      if (!allowSkipped) {
        issues.push(completionIssue("item-skipped", id, `${id} is skipped or cancelled, but skipped work is not allowed.`));
      }
      if (!hasSkipReason(item)) {
        issues.push(completionIssue("missing-skip-reason", id, `${id} is skipped or cancelled without an explicit reason.`));
      }
      continue;
    }

    if (requireEvidence) {
      const evidence = evidenceByTask.get(id) || [];
      if (evidence.length === 0) {
        issues.push(completionIssue("missing-evidence", id, `${id} is complete without verification evidence.`));
      } else if (strictProduction && !allowDryRunEvidence && evidence.some(isDryRunEvidence)) {
        issues.push(completionIssue("dry-run-evidence", id, `${id} uses dry-run evidence and cannot close production completion.`));
      }
    }
  }

  const itemById = new Map(items.map((item) => [item.itemId || item.id, item]));
  const taskById = new Map(tasks.map((task) => [task.id || task.itemId, task]));
  for (const item of requiredItems) {
    const id = item.itemId || item.id;
    const dependencies = new Set([
      ...(Array.isArray(item.blockedBy) ? item.blockedBy : []),
      ...(Array.isArray(taskById.get(id)?.dependencies) ? taskById.get(id).dependencies : []),
      ...(graph.dependencyEdges || [])
        .filter((edge) => edge.type !== "parent-child" && edge.to === id)
        .map((edge) => edge.from),
    ].filter(Boolean));
    for (const dependencyId of dependencies) {
      if (!ids.has(dependencyId)) {
        issues.push(completionIssue("unknown-dependency", id, `${id} depends on unknown item ${dependencyId}.`, { dependencyId }));
        continue;
      }
      const dependency = itemById.get(dependencyId);
      if (isRequiredForCompletion(dependency, { includeFollowups }) && !isTerminalOrSkipped(dependency.status)) {
        issues.push(completionIssue("dependency-open", id, `${id} depends on non-terminal item ${dependencyId}.`, { dependencyId }));
      }
    }
  }

  const counts = countCompletion(items, { includeFollowups });
  if (counts.required === 0) {
    warnings.push(completionIssue("no-required-items", graph.epicId || graph.graph_id, "Graph has no required work items beyond the epic."));
  }

  return {
    pass: issues.length === 0,
    score: issues.length === 0 ? 10 : Math.max(0, Number((10 - issues.length * 0.5).toFixed(1))),
    epicId: graph.epicId || graph.graph_id || epic?.itemId || null,
    counts,
    production: strictProduction,
    requireEvidence,
    allowSkipped,
    allowDryRunEvidence,
    issues,
    warnings,
  };
}

export function formatEpicCompletionReport(report = {}) {
  const lines = [
    "SUPERVIBE_EPIC_COMPLETION",
    `EPIC: ${report.epicId || "unknown"}`,
    `PASS: ${report.pass === true}`,
    `SCORE: ${report.score ?? 0}/10`,
    `PRODUCTION: ${report.production !== false}`,
    `REQUIRE_EVIDENCE: ${report.requireEvidence !== false}`,
    `COUNTS: required=${report.counts?.required || 0} complete=${report.counts?.complete || 0} skipped=${report.counts?.skipped || 0} open=${report.counts?.open || 0}`,
  ];
  if (report.issues?.length) {
    lines.push("ISSUES:");
    for (const issue of report.issues) lines.push(`- ${issue.code}: ${issue.itemId || "graph"}: ${issue.message} NEXT_ACTION: ${issue.nextAction || "inspect blocker"}`);
  }
  if (report.warnings?.length) {
    lines.push("WARNINGS:");
    for (const warning of report.warnings) lines.push(`- ${warning.code}: ${warning.itemId || "graph"}: ${warning.message}`);
  }
  return lines.join("\n");
}

function isRequiredForCompletion(item = {}, { includeFollowups = false } = {}) {
  if (!item || item.type === "epic") return false;
  if (!includeFollowups && NON_BLOCKING_TYPES.has(item.type)) return false;
  return true;
}

function collectEvidenceByTask(graph = {}) {
  const evidenceByTask = new Map();
  const add = (taskId, evidence) => {
    if (!taskId || evidence == null) return;
    const list = evidenceByTask.get(taskId) || [];
    if (Array.isArray(evidence)) list.push(...evidence);
    else list.push(evidence);
    evidenceByTask.set(taskId, list);
  };

  for (const item of graph.items || []) {
    const id = item.itemId || item.id;
    add(id, item.verificationEvidence);
    add(id, item.evidence);
  }
  for (const task of graph.tasks || []) {
    const id = task.id || task.itemId;
    add(id, task.verificationEvidence);
    add(id, task.evidence);
  }
  for (const evidence of graph.evidence || []) {
    add(evidence.taskId || evidence.itemId || evidence.id, evidence);
  }
  for (const event of graph.events || []) {
    if (["close", "complete", "closed", "completed"].includes(normalizeStatus(event.action || event.type))) {
      add(event.itemId || event.taskId, event.evidence || event.reason || event);
    }
  }
  return evidenceByTask;
}

function countCompletion(items = [], options = {}) {
  const requiredItems = items.filter((item) => isRequiredForCompletion(item, options));
  return requiredItems.reduce((counts, item) => {
    if (isTerminalStatus(item.status)) counts.complete += 1;
    else if (isSkippedStatus(item.status)) counts.skipped += 1;
    else counts.open += 1;
    return counts;
  }, { required: requiredItems.length, complete: 0, skipped: 0, open: 0 });
}

function isTerminalOrSkipped(status) {
  return isTerminalStatus(status) || isSkippedStatus(status);
}

function isTerminalStatus(status) {
  return TERMINAL_STATUSES.has(normalizeStatus(status));
}

function isSkippedStatus(status) {
  return EXPLICITLY_SKIPPED_STATUSES.has(normalizeStatus(status));
}

function normalizeStatus(status) {
  return String(status || "open").trim().toLowerCase();
}

function hasSkipReason(item = {}) {
  return Boolean(item.skipReason || item.cancelReason || item.cancelledReason || item.closeReason || item.reason || item.decisionReason);
}

function isDryRunEvidence(evidence) {
  const text = typeof evidence === "string" ? evidence : JSON.stringify(evidence || {});
  return /\bdry[-_ ]?run\b/i.test(text);
}

function completionIssue(code, itemId, message, details = {}) {
  return { code, itemId: itemId || null, message, nextAction: nextActionForIssue(code, itemId, details), ...details };
}

function nextActionForIssue(code, itemId, details = {}) {
  const id = itemId || "graph";
  if (code === "graph-invalid") return `repair work-item graph shape before completion (${details.graphIssue?.code || "invalid"})`;
  if (code === "epic-not-closed") return `close epic ${id} after required work validates`;
  if (code === "item-open") return `complete, skip with reason, or split blocker for ${id}`;
  if (code === "item-skipped") return `restore ${id} or provide an explicit completion override`;
  if (code === "missing-skip-reason") return `add skip/cancel reason to ${id}`;
  if (code === "missing-evidence") return `attach verification evidence to ${id}`;
  if (code === "dry-run-evidence") return `replace dry-run evidence on ${id} with production verification`;
  if (code === "unknown-dependency") return `repair dependency ${details.dependencyId || ""} for ${id}`;
  if (code === "dependency-open") return `complete dependency ${details.dependencyId || ""} before ${id}`;
  return "inspect completion blocker";
}
