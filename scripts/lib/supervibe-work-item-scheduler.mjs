import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const DEFER_CONDITIONS = Object.freeze([
  "timestamp",
  "ci-event",
  "manual-approval",
  "dependency-close",
  "retry-window",
]);

export function deferWorkItemInGraph(graph = {}, { itemId, until, condition = "timestamp", reason = "deferred by user", actor = "user", now = new Date().toISOString() } = {}) {
  if (!itemId) throw new Error("defer requires itemId");
  if (!DEFER_CONDITIONS.includes(condition)) throw new Error(`unsupported defer condition: ${condition}`);
  if (condition === "timestamp" || condition === "retry-window") validateTimestamp(until);

  let changed = false;
  const deferred = {
    condition,
    until: until || null,
    reason,
    actor,
    createdAt: now,
    status: "deferred",
  };
  const update = (entry) => {
    const id = entry.itemId || entry.id;
    if (id !== itemId) return entry;
    changed = true;
    return {
      ...entry,
      status: entry.status === "complete" ? entry.status : "deferred",
      deferred,
      deferredUntil: until || entry.deferredUntil || null,
      deferReason: reason,
      updatedAt: now,
    };
  };

  const next = {
    ...graph,
    items: (graph.items || []).map(update),
    tasks: (graph.tasks || []).map(update),
  };
  if (!changed) throw new Error(`work item not found: ${itemId}`);
  return {
    graph: next,
    itemId,
    deferred,
    changed,
  };
}

export function isWorkItemDeferred(item = {}, { now = new Date().toISOString() } = {}) {
  const deferred = item.deferred || item.task?.deferred || null;
  const until = item.deferredUntil || item.defer_until || deferred?.until || null;
  const condition = deferred?.condition || (until ? "timestamp" : null);
  if (!condition) return false;
  if (["manual-approval", "ci-event", "dependency-close"].includes(condition)) return deferred?.status !== "released";
  const due = Date.parse(until || "");
  const current = Date.parse(now instanceof Date ? now.toISOString() : now);
  if (!Number.isFinite(due) || !Number.isFinite(current)) return true;
  return due > current;
}

export function createScheduledCheck({ itemId, at, action = "re-evaluate", reason = "scheduled check", createdAt = "deterministic-local" } = {}) {
  if (!itemId) throw new Error("scheduled check requires itemId");
  validateTimestamp(at);
  return { itemId, at, action, reason, createdAt, status: "scheduled" };
}

export function evaluateScheduledChecks({ checks = [], index = [], now = new Date().toISOString() } = {}) {
  const current = Date.parse(now instanceof Date ? now.toISOString() : now);
  const byId = new Map(index.map((item) => [item.itemId || item.id, item]));
  const due = [];
  const pending = [];
  for (const check of checks) {
    const at = Date.parse(check.at || "");
    const event = {
      ...check,
      item: byId.get(check.itemId) || null,
      remoteMutation: false,
      codeMutation: false,
    };
    if (Number.isFinite(at) && at <= current) due.push({ ...event, status: "due" });
    else pending.push(event);
  }
  return { due, pending, now: new Date(current).toISOString(), remoteMutation: false };
}

export function buildSchedulerSnapshot(index = [], { checks = [], now = new Date().toISOString() } = {}) {
  const deferred = index.filter((item) => isWorkItemDeferred(item, { now }));
  const dueForReview = index.filter((item) => hasDeferredRelease(item, { now }));
  const scheduled = evaluateScheduledChecks({ checks, index, now });
  return {
    deferred,
    dueForReview,
    scheduledDue: scheduled.due,
    scheduledPending: scheduled.pending,
    summary: {
      deferred: deferred.length,
      dueForReview: dueForReview.length,
      scheduledDue: scheduled.due.length,
      scheduledPending: scheduled.pending.length,
    },
  };
}

export async function deferWorkItemFile(graphPath, options = {}) {
  const graph = JSON.parse(await readFile(graphPath, "utf8"));
  const result = deferWorkItemInGraph(graph, options);
  if (!options.dryRun) {
    await mkdir(dirname(graphPath), { recursive: true });
    const backupPath = `${graphPath}.bak`;
    try {
      await copyFile(graphPath, backupPath);
    } catch {
      // A missing backup source should not hide the write error below.
    }
    await writeFile(graphPath, `${JSON.stringify(result.graph, null, 2)}\n`, "utf8");
    result.backupPath = backupPath;
  }
  result.dryRun = Boolean(options.dryRun);
  return result;
}

export function formatSchedulerSnapshot(snapshot = {}) {
  return [
    "SUPERVIBE_WORK_ITEM_SCHEDULER",
    `DEFERRED: ${snapshot.summary?.deferred || 0}`,
    `DUE_FOR_REVIEW: ${snapshot.summary?.dueForReview || 0}`,
    `SCHEDULED_DUE: ${snapshot.summary?.scheduledDue || 0}`,
    `SCHEDULED_PENDING: ${snapshot.summary?.scheduledPending || 0}`,
    ...(snapshot.dueForReview || []).map((item) => `- due ${item.itemId || item.id}: ${item.deferReason || item.deferred?.reason || "deferred"}`),
  ].join("\n");
}

function hasDeferredRelease(item, { now }) {
  if (!item.deferred && !item.deferredUntil && !item.task?.deferred) return false;
  return !isWorkItemDeferred(item, { now });
}

function validateTimestamp(value) {
  if (!value || !Number.isFinite(Date.parse(value))) throw new Error("defer/schedule timestamp must be ISO-like and parseable");
}
