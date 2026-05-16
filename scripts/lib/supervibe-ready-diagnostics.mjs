import { createBlockerV1, validateBlockerV1 } from "./supervibe-work-state.mjs";

export const READY_DIAGNOSTIC_SCHEMA_VERSION = "ReadyDiagnosticV1";
export const EMPTY_READY_BLOCKER_CODE = "dependency-not-ready";
export const EMPTY_READY_REPAIR_COMMAND = "node scripts/work-state-ready.mjs --why";
export const EMPTY_READY_NEXT_ACTION = "repair or defer blocked dependencies before claiming ready work";
export const EMPTY_READY_RELEASE_IMPACT = "No work item can be released from this ready front until at least one blocked task becomes ready or is explicitly deferred.";
export const DEPENDENCY_BLOCKER_CODE = "dependency-not-ready";
export const DEPENDENCY_BLOCKER_REPAIR_COMMAND = "node scripts/work-state-ready.mjs --why";
export const DEPENDENCY_BLOCKER_NEXT_ACTION = "repair, defer, or unblock upstream task dependencies before continuing.";
export const DEPENDENCY_BLOCKER_RELEASE_IMPACT = "Dependent work remains blocked from release until upstream tasks are ready or explicitly deferred.";
export const WRITE_CONFLICT_BLOCKER_CODE = "write-set-conflict";
export const WRITE_CONFLICT_REPAIR_COMMAND = "git status --short";
export const WRITE_CONFLICT_NEXT_ACTION = "coordinate ownership and resolve write-set conflicts before writing or releasing the affected tasks.";
export const WRITE_CONFLICT_RELEASE_IMPACT = "Release is blocked until overlapping write ownership is resolved without reverting unrelated edits.";
export const GRAPH_SOURCE_TRUST_BLOCKER_CODE = "policy-hard-stop";
export const GRAPH_SOURCE_TRUST_REPAIR_COMMAND = "node scripts/build-code-index.mjs --root . --force --health --no-embeddings";
export const GRAPH_SOURCE_TRUST_NEXT_ACTION = "refresh or verify graph source evidence before using graph-derived readiness decisions.";
export const GRAPH_SOURCE_TRUST_RELEASE_IMPACT = "Graph-derived readiness claims remain blocked until source freshness and trust are established.";

export function buildEmptyReadyExplanation(input = {}) {
  const affectedTaskIds = normalizeTaskIds(input.affectedTaskIds || input.taskIds || input.blockedTaskIds || input.tasks);
  const blocker = createReadyBlocker({
    code: input.code || EMPTY_READY_BLOCKER_CODE,
    message: input.message || messageForAffectedTasks(affectedTaskIds),
    affectedTaskIds,
    nextAction: input.nextAction || EMPTY_READY_NEXT_ACTION,
    repairCommand: input.repairCommand || EMPTY_READY_REPAIR_COMMAND,
    releaseImpact: input.releaseImpact || EMPTY_READY_RELEASE_IMPACT,
    priority: input.priority,
  });

  return {
    schemaVersion: READY_DIAGNOSTIC_SCHEMA_VERSION,
    status: "blocked",
    ready: false,
    reason: "empty-ready-front",
    affectedTaskIds,
    nextAction: blocker.nextAction,
    repairCommand: blocker.repairCommand,
    releaseImpact: blocker.releaseImpact,
    blockers: [blocker],
  };
}

export function buildDependencyBlockerExplanation(input = {}) {
  const affectedTaskIds = normalizeTaskIds(input.affectedTaskIds || input.taskIds || input.blockedTaskIds || input.tasks);
  return buildReadyDiagnostic({
    reason: "dependency-blocker",
    affectedTaskIds,
    blocker: {
      code: input.code || DEPENDENCY_BLOCKER_CODE,
      message: input.message || dependencyMessageForAffectedTasks(affectedTaskIds),
      affectedTaskIds,
      nextAction: input.nextAction || DEPENDENCY_BLOCKER_NEXT_ACTION,
      repairCommand: input.repairCommand || DEPENDENCY_BLOCKER_REPAIR_COMMAND,
      releaseImpact: input.releaseImpact || DEPENDENCY_BLOCKER_RELEASE_IMPACT,
      priority: input.priority,
    },
  });
}

export function buildWriteConflictExplanation(input = {}) {
  const affectedTaskIds = normalizeTaskIds(input.affectedTaskIds || input.taskIds || input.conflictingTaskIds || input.tasks);
  const writeSet = normalizeStringList(input.writeSet || input.paths || input.files);
  return buildReadyDiagnostic({
    reason: "write-conflict",
    affectedTaskIds,
    writeSet,
    blocker: {
      code: input.code || WRITE_CONFLICT_BLOCKER_CODE,
      message: input.message || writeConflictMessageForAffectedTasks(affectedTaskIds, writeSet),
      affectedTaskIds,
      nextAction: input.nextAction || WRITE_CONFLICT_NEXT_ACTION,
      repairCommand: input.repairCommand || WRITE_CONFLICT_REPAIR_COMMAND,
      releaseImpact: input.releaseImpact || WRITE_CONFLICT_RELEASE_IMPACT,
      priority: input.priority,
    },
  });
}

export function buildGraphSourceTrustLabel(input = {}) {
  const affectedTaskIds = normalizeTaskIds(input.affectedTaskIds || input.taskIds || input.tasks);
  const sourceLabel = normalizeTrustLabel(input.sourceLabel || input.trustLabel || input.label);
  return buildReadyDiagnostic({
    reason: "graph-source-trust",
    affectedTaskIds,
    sourceTrustLabel: sourceLabel,
    graphSource: normalizeText(input.graphSource || input.source || ""),
    blocker: {
      code: input.code || GRAPH_SOURCE_TRUST_BLOCKER_CODE,
      message: input.message || graphSourceTrustMessage(sourceLabel),
      affectedTaskIds,
      nextAction: input.nextAction || GRAPH_SOURCE_TRUST_NEXT_ACTION,
      repairCommand: input.repairCommand || GRAPH_SOURCE_TRUST_REPAIR_COMMAND,
      releaseImpact: input.releaseImpact || GRAPH_SOURCE_TRUST_RELEASE_IMPACT,
      priority: input.priority,
    },
  });
}

export function createReadyBlocker(input = {}) {
  const blocker = createBlockerV1(input);
  const extended = {
    ...blocker,
    affectedTaskIds: normalizeTaskIds(input.affectedTaskIds || input.taskIds || input.tasks),
    nextAction: normalizeText(input.nextAction) || EMPTY_READY_NEXT_ACTION,
  };
  const validation = validateReadyBlocker(extended);
  if (!validation.pass) {
    const message = validation.issues.map((issue) => `${issue.field}: ${issue.message}`).join("; ");
    throw new TypeError(`Invalid ready blocker: ${message}`);
  }
  return extended;
}

function buildReadyDiagnostic(input = {}) {
  const blocker = createReadyBlocker(input.blocker);
  return {
    schemaVersion: READY_DIAGNOSTIC_SCHEMA_VERSION,
    status: "blocked",
    ready: false,
    reason: input.reason,
    affectedTaskIds: input.affectedTaskIds || blocker.affectedTaskIds,
    nextAction: blocker.nextAction,
    repairCommand: blocker.repairCommand,
    releaseImpact: blocker.releaseImpact,
    blockers: [blocker],
    ...optionalObject({
      writeSet: input.writeSet && input.writeSet.length ? input.writeSet : undefined,
      sourceTrustLabel: input.sourceTrustLabel,
      graphSource: input.graphSource || undefined,
    }),
  };
}

export function validateReadyBlocker(blocker = {}) {
  const issues = validateBlockerV1(blocker, { fieldPrefix: "blocker" }).issues.slice();
  if (!Array.isArray(blocker.affectedTaskIds)) {
    issues.push(issue("invalid-affected-task-ids", "blocker.affectedTaskIds", "affectedTaskIds must be an array."));
  } else if (!blocker.affectedTaskIds.every(isStrongString)) {
    issues.push(issue("invalid-affected-task-id", "blocker.affectedTaskIds", "affectedTaskIds entries must be non-empty strings."));
  }
  if (!isStrongString(blocker.nextAction)) {
    issues.push(issue("invalid-next-action", "blocker.nextAction", "nextAction must be a non-empty string."));
  }
  return {
    schemaVersion: READY_DIAGNOSTIC_SCHEMA_VERSION,
    pass: issues.length === 0,
    issues,
  };
}

export function sortReadyBlockers(blockers = []) {
  return [...blockers].sort((left, right) => {
    const priority = Number(right.priority || 0) - Number(left.priority || 0);
    if (priority !== 0) return priority;
    const code = String(left.code || "").localeCompare(String(right.code || ""));
    if (code !== 0) return code;
    return normalizeTaskIds(left.affectedTaskIds).join(",").localeCompare(normalizeTaskIds(right.affectedTaskIds).join(","));
  });
}

function messageForAffectedTasks(affectedTaskIds) {
  if (affectedTaskIds.length === 0) return "Ready front is empty because no task currently satisfies its readiness requirements.";
  return `Ready front is empty; blocked tasks: ${affectedTaskIds.join(", ")}.`;
}

function dependencyMessageForAffectedTasks(affectedTaskIds) {
  if (affectedTaskIds.length === 0) return "Task is blocked because at least one upstream dependency is not ready.";
  return `Task is blocked by upstream dependencies: ${affectedTaskIds.join(", ")}.`;
}

function writeConflictMessageForAffectedTasks(affectedTaskIds, writeSet) {
  const taskText = affectedTaskIds.length ? ` for tasks: ${affectedTaskIds.join(", ")}` : "";
  const pathText = writeSet.length ? ` Paths: ${writeSet.join(", ")}.` : "";
  return `Write-set conflict detected${taskText}.${pathText}`;
}

function graphSourceTrustMessage(sourceLabel) {
  return `Graph source trust label is ${sourceLabel}; graph-derived readiness decisions require verified source evidence.`;
}

function normalizeTaskIds(value) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(list.map(taskIdFrom).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function normalizeStringList(value) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(list.map(normalizeText).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function normalizeTrustLabel(value) {
  const label = normalizeText(value || "unverified").toLowerCase();
  if (label === "trusted" || label === "verified") return "trusted";
  if (label === "stale") return "stale";
  if (label === "missing") return "missing";
  return "unverified";
}

function optionalObject(entries) {
  return Object.fromEntries(Object.entries(entries).filter(([, value]) => value !== undefined));
}

function taskIdFrom(value) {
  if (typeof value === "string" || typeof value === "number") return normalizeText(value);
  if (!value || typeof value !== "object") return "";
  return normalizeText(value.id || value.taskId || value.workItemId);
}

function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isStrongString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function issue(code, field, message) {
  return { code, field, message };
}
