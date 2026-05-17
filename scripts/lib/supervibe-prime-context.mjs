import { redactSensitiveContent } from "./autonomous-loop-artifact-retention.mjs";
import { createWorkItemIndex, detectOrphanWorkItems, detectStaleWorkItems, groupWorkItemsByStatus } from "./supervibe-work-item-query.mjs";
import { validateEpicCompletion } from "./supervibe-epic-completion-validator.mjs";

const TERMINAL_STATUSES = new Set(["done", "complete", "completed", "closed", "skipped", "cancelled", "canceled"]);

export function buildSupervibePrimeContext({ graph = {}, graphPath = null, limit = 5 } = {}) {
  const index = createWorkItemIndex({ graph, claims: graph.claims || [], gates: graph.gates || [], evidence: graph.evidence || [] });
  const grouped = groupWorkItemsByStatus(index);
  const workItems = index.filter((item) => String(item.type || "").toLowerCase() !== "epic");
  const stale = detectStaleWorkItems(index);
  const orphans = detectOrphanWorkItems(index, graph);
  const lifecycle = inferLifecycle(graph);
  const ready = compactItems(grouped.ready, limit);
  const blocked = compactItems(grouped.blocked, limit);
  const claimed = compactItems([...(grouped.claimed || []), ...(grouped.in_progress || [])], limit);
  const deferred = compactItems(grouped.deferred, limit);
  const nextReady = ready[0]?.id || null;
  return {
    schemaVersion: 1,
    kind: "supervibe-prime-context",
    epicId: graph.epicId || graph.graph_id || graph.graphId || null,
    graphPath,
    lifecycle,
    counts: {
      total: workItems.length,
      ready: countNonEpic(grouped.ready),
      claimed: countNonEpic([...(grouped.claimed || []), ...(grouped.in_progress || [])]),
      blocked: countNonEpic(grouped.blocked),
      deferred: countNonEpic(grouped.deferred),
      review: countNonEpic(grouped.review),
      done: workItems.filter((item) => TERMINAL_STATUSES.has(String(item.effectiveStatus || item.status || "").toLowerCase())).length,
      stale: stale.length,
      orphan: orphans.length,
    },
    nextReady,
    ready,
    claimed,
    blocked,
    deferred,
    nextAction: inferNextAction({ lifecycle, nextReady, blocked, stale, orphans }),
    maintenance: {
      indexRefresh: "automatic-or-final-gate",
      archive: lifecycle === "completed" ? "automatic-hidden-maintenance" : "not-needed",
      rawReceipts: "excluded-from-prime",
      rawLedgers: "excluded-from-prime",
    },
  };
}

export function redactSupervibePrimeContext(model = {}) {
  return redactPrimeValue(model);
}

export function formatSupervibePrimeContext(model = {}) {
  model = redactSupervibePrimeContext(model);
  const lines = [
    "SUPERVIBE_PRIME",
    `SCHEMA_VERSION: ${model.schemaVersion || 1}`,
    `EPIC: ${safe(model.epicId || "none")}`,
    `GRAPH: ${safe(model.graphPath || "none")}`,
    `LIFECYCLE: ${safe(model.lifecycle || "unknown")}`,
    `COUNTS: total=${num(model.counts?.total)} ready=${num(model.counts?.ready)} claimed=${num(model.counts?.claimed)} blocked=${num(model.counts?.blocked)} deferred=${num(model.counts?.deferred)} review=${num(model.counts?.review)} done=${num(model.counts?.done)} stale=${num(model.counts?.stale)} orphan=${num(model.counts?.orphan)}`,
    `NEXT_READY: ${safe(model.nextReady || "none")}`,
    `NEXT_ACTION: ${safe(model.nextAction || "inspect active work graph")}`,
    "READY:",
    ...formatItems(model.ready),
    "CLAIMED:",
    ...formatItems(model.claimed),
    "BLOCKED:",
    ...formatItems(model.blocked),
    "DEFERRED:",
    ...formatItems(model.deferred),
    `MAINTENANCE: indexRefresh=${safe(model.maintenance?.indexRefresh || "automatic")} archive=${safe(model.maintenance?.archive || "not-needed")} receipts=${safe(model.maintenance?.rawReceipts || "excluded")}`,
  ];
  return redactSensitiveContent(lines.join("\n"));
}

function redactPrimeValue(value) {
  if (typeof value === "string") return redactSensitiveContent(value);
  if (Array.isArray(value)) return value.map((item) => redactPrimeValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, redactPrimeValue(entry)]));
  }
  return value;
}

function inferLifecycle(graph = {}) {
  const archivedAt = graph.archivedAt || graph.archived_at || graph.metadata?.archivedAt || null;
  if (archivedAt) return "archived";
  try {
    if (validateEpicCompletion(graph).pass === true || isOperationallyClosedWorkGraph(graph)) return "completed";
  } catch {
    if (isOperationallyClosedWorkGraph(graph)) return "completed";
  }
  return "active";
}

function isOperationallyClosedWorkGraph(graph = {}) {
  const items = Array.isArray(graph.items) ? graph.items : [];
  const workItems = items.filter((item) => String(item.type || "").toLowerCase() !== "epic" && String(item.type || "").toLowerCase() !== "followup");
  return workItems.length > 0 && workItems.every((item) => TERMINAL_STATUSES.has(String(item.status || "").toLowerCase()));
}

function inferNextAction({ lifecycle, nextReady, blocked = [], stale = [], orphans = [] } = {}) {
  if (lifecycle === "completed") return "finish here | verify the work | prepare release handoff";
  if (stale.length || orphans.length) return "recover stale graph state, then continue from ready work";
  if (nextReady) return `claim ${nextReady} or run sv work claim ${nextReady}`;
  if (blocked.length) return "inspect blockers or add a discovered follow-up with sv work discover";
  return "prepare a loop-ready plan or inspect active graph status";
}

function compactItems(items = [], limit = 5) {
  return (items || [])
    .filter((item) => String(item.type || "").toLowerCase() !== "epic")
    .slice(0, limit)
    .map((item) => ({
      id: item.itemId || item.id || item.taskId || "unknown",
      title: safe(item.title || item.goal || "untitled", 140),
      type: item.type || item.category || "task",
      status: item.effectiveStatus || item.status || "unknown",
      owner: item.owner || item.claimOwner || item.assignee || null,
      parentId: item.parentId || null,
    }));
}

function formatItems(items = []) {
  if (!items.length) return ["- none"];
  return items.map((item) => `- ${safe(item.id)} [${safe(item.status)}] ${safe(item.title)}`);
}

function countNonEpic(items = []) {
  return (items || []).filter((item) => String(item.type || "").toLowerCase() !== "epic").length;
}

function num(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safe(value, maxLength = 180) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, Math.max(0, maxLength - 3))}...` : normalized;
}
