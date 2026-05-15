import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { createHash } from "node:crypto";

export const TRUSTED_TASK_COMPLETION_COMMANDS = Object.freeze(["/supervibe-loop", "/supervibe-execute-plan"]);
export const TRUSTED_GRAPH_COMPLETION_STAGES = Object.freeze([
  "final-review-sweep",
  "final-review-sweep-graph-evidence",
  "release-completion",
  "work-item-graph-release",
]);

export function graphIdentity(graph = {}) {
  return graph.epicId || graph.graph_id || graph.graphId || (graph.items || []).find((item) => item.type === "epic")?.itemId || null;
}

export function receiptTaskBinding(receipt = {}) {
  const taskId = receipt.taskId || receipt.workItemId || receipt.graphTaskId || receipt.workItemBinding?.taskId || null;
  const graphId = receipt.graphId || receipt.workGraphId || receipt.workItemBinding?.graphId || inferGraphIdFromTaskId(taskId) || null;
  return compactOptionalObject({ graphId, taskId }) || {};
}

function inferGraphIdFromTaskId(taskId = "") {
  const normalizedTaskId = String(taskId || "").trim();
  if (!normalizedTaskId) return null;
  const match = /^(.*?)-(?:a\d{3,}|t\d+[a-z]?(?:-sub\d+)?)$/i.exec(normalizedTaskId);
  const graphId = match?.[1] || null;
  if (!graphId || graphId === normalizedTaskId) return null;
  return graphId;
}

export function isTrustedTaskCompletionReceiptForGraph(receipt = {}, graph = null) {
  const subjectType = String(receipt.subjectType || "").toLowerCase();
  if (!["agent", "worker", "reviewer"].includes(subjectType)) return false;
  if (!TRUSTED_TASK_COMPLETION_COMMANDS.includes(String(receipt.command || ""))) return false;
  if (!receipt.hostInvocation?.source || !receipt.hostInvocation?.invocationId) return false;
  if (!graph) return true;
  const graphId = graphIdentity(graph);
  const binding = receiptTaskBinding(receipt);
  if (binding.graphId && graphId && binding.graphId !== graphId) return false;
  if (binding.graphId && !binding.taskId) return false;
  if (binding.taskId && !findGraphEntry(graph, binding.taskId)) return false;
  if (!binding.graphId && !binding.taskId && !receiptMatchesGraphSource(receipt, graph)) return false;
  return true;
}

export function isTrustedGraphCompletionReceiptForGraph(receipt = {}, graph = {}, { graphPath = null, rootDir = process.cwd(), allowedStages = TRUSTED_GRAPH_COMPLETION_STAGES } = {}) {
  const graphId = typeof graph === "string" ? graph : graphIdentity(graph);
  if (!graphId) return false;
  if (receipt.command !== "/supervibe-loop") return false;
  if (!new Set(allowedStages).has(String(receipt.stage || ""))) return false;
  const subjectType = String(receipt.subjectType || "").toLowerCase();
  if (!["agent", "reviewer"].includes(subjectType)) return false;
  if (!receipt.hostInvocation?.source || !receipt.hostInvocation?.invocationId) return false;
  const binding = receiptTaskBinding(receipt);
  if (binding.graphId !== graphId) return false;
  if (binding.taskId && !isGraphWideCompletionReceipt(receipt, binding.taskId)) return false;
  if (graphPath && !receiptOutputsCurrentGraph(rootDir, receipt, graphPath)) return false;
  return true;
}

export function trustedReceiptScopeFromReceipt(receipt = {}, graph = null) {
  const binding = receiptTaskBinding(receipt);
  const scope = compactOptionalObject({
    receiptId: String(receipt.receiptId || ""),
    command: receipt.command || null,
    subjectType: receipt.subjectType || null,
    subjectId: receipt.subjectId || receipt.agentId || null,
    stage: receipt.stage || null,
    graphId: binding.graphId,
    taskId: binding.taskId,
    graphWide: Boolean(binding.graphId && !binding.taskId) || isGraphWideCompletionReceipt(receipt, binding.taskId),
    unbound: !binding.graphId && !binding.taskId,
    sourceMatchesGraph: graph ? receiptMatchesGraphSource(receipt, graph) : false,
  }) || {};
  const hostInvocation = receipt.hostInvocation ? compactOptionalObject({
    source: receipt.hostInvocation.source || null,
    invocationId: receipt.hostInvocation.invocationId || null,
  }) : null;
  if (hostInvocation) scope.hostInvocation = hostInvocation;
  return scope;
}

export function trustedReceiptScopesById(receipts = [], graph = null) {
  const out = {};
  for (const receipt of receipts || []) {
    if (!receipt?.receiptId) continue;
    out[String(receipt.receiptId)] = trustedReceiptScopeFromReceipt(receipt, graph);
  }
  return out;
}

export function evidenceMatchesTrustedReceiptScope(evidence = {}, { scope = null, graph = null, taskId = null } = {}) {
  if (!scope) return true;
  const graphId = graph ? graphIdentity(graph) : null;
  if (scope.graphId && graphId && scope.graphId !== graphId) return false;
  if (scope.taskId) {
    const evidenceTaskIds = new Set([
      taskId,
      evidence.taskId,
      evidence.itemId,
      evidence.graphTaskId,
      evidence.inheritedFromTaskId,
      ...(Array.isArray(evidence.coveredTaskIds) ? evidence.coveredTaskIds : []),
      ...(Array.isArray(evidence.autoClosedCoveredItems) ? evidence.autoClosedCoveredItems : []),
    ].map(String).filter(Boolean));
    return evidenceTaskIds.has(String(scope.taskId));
  }
  if (scope.graphId) return scope.graphWide === true;
  if (scope.unbound) return scope.sourceMatchesGraph === true;
  return false;
}

export function isGraphWideCompletionReceipt(receipt = {}, taskId = "") {
  const normalizedTaskId = String(taskId || "").toLowerCase();
  if (!normalizedTaskId) return true;
  return /(?:graph|epic|release)[-_ ]?(?:close|completion|handoff|proof|evidence)|completion[-_ ]?proof/.test(normalizedTaskId);
}

export function receiptMatchesGraphSource(receipt = {}, graph = {}) {
  const sourceHashes = new Set([graph.source?.sha256, graph.metadata?.sourcePlanSnapshot?.sha256].filter(Boolean).map(String));
  const sourcePaths = new Set([graph.source?.path, graph.metadata?.sourcePlanSnapshot?.path, graph.planPath].filter(Boolean).map(normalizeComparablePath));
  for (const input of receipt.inputHashes || []) {
    if (input?.sha256 && sourceHashes.has(String(input.sha256))) return true;
    if (input?.path && sourcePaths.has(normalizeComparablePath(input.path))) return true;
  }
  for (const input of receipt.inputEvidence || []) {
    if (sourcePaths.has(normalizeComparablePath(input))) return true;
  }
  return false;
}

export function receiptOutputsCurrentGraph(rootDir = process.cwd(), receipt = {}, graphPath = "") {
  if (!graphPath) return false;
  const absoluteGraphPath = resolve(rootDir, graphPath);
  if (!existsSync(absoluteGraphPath)) return false;
  const currentHash = sha256File(absoluteGraphPath);
  const candidates = new Set([
    normalizeComparablePath(graphPath),
    normalizeComparablePath(absoluteGraphPath),
    normalizeComparablePath(relative(rootDir, absoluteGraphPath)),
  ]);
  for (const output of receipt.outputHashes || []) {
    if (!output?.path || !candidates.has(normalizeComparablePath(output.path))) continue;
    if (output.exists === false) return false;
    return String(output.sha256 || "") === currentHash;
  }
  return false;
}

function findGraphEntry(graph = {}, id = "") {
  return [...(graph.items || []), ...(graph.tasks || [])].find((entry) => (entry.itemId || entry.id || entry.taskId) === id) || null;
}

function sha256File(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function normalizeComparablePath(value = "") {
  return String(value || "").replace(/\\/g, "/").toLowerCase();
}

function compactOptionalObject(value = {}) {
  const entries = Object.entries(value).filter(([, item]) => item !== null && item !== undefined && item !== "");
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}
