import { copyFile, mkdir, open, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { deferWorkItemInGraph } from "./supervibe-work-item-scheduler.mjs";

const DONE_STATUSES = new Set(["done", "complete", "completed", "closed", "skipped", "cancelled", "canceled"]);
const ACTIVE_CLAIM_STATUSES = new Set(["active", "claimed", "in_progress"]);
const DEFAULT_CLAIM_TTL_MINUTES = 240;
const DEFAULT_LOCK_TIMEOUT_MS = 5_000;
const DEFAULT_LOCK_RETRY_DELAY_MS = 25;
const DEFAULT_STALE_LOCK_MS = 30_000;

export async function mutateWorkItemGraphFile(graphPath, action = {}) {
  if (action.dryRun) {
    const graph = JSON.parse(String(await readFile(graphPath, "utf8")).replace(/^\uFEFF/, ""));
    const result = mutateWorkItemGraph(graph, action);
    return { ...result, dryRun: true };
  }
  return withGraphFileLock(graphPath, action, async () => {
    const graph = JSON.parse(String(await readFile(graphPath, "utf8")).replace(/^\uFEFF/, ""));
    const result = mutateWorkItemGraph(graph, action);
    await mkdir(dirname(graphPath), { recursive: true });
    const backupPath = `${graphPath}.bak`;
    try {
      await copyFile(graphPath, backupPath);
    } catch {
      // If the source is missing, the write below will surface the real error.
    }
    await writeFile(graphPath, `${JSON.stringify(result.graph, null, 2)}\n`, "utf8");
    result.backupPath = backupPath;
    return { ...result, dryRun: false };
  });
}

export function mutateWorkItemGraph(graph = {}, action = {}) {
  const type = String(action.type || action.action || "").toLowerCase();
  if (!type) throw new Error("work-item action type is required");
  let result;
  if (type === "defer") {
    result = deferWorkItemInGraph(graph, {
      itemId: action.itemId,
      until: action.until,
      condition: action.condition || "timestamp",
      reason: action.reason || "deferred by user",
      actor: action.actor || "user",
      now: action.now || new Date().toISOString(),
    });
    return appendAuditEvent(result, action, type);
  }
  if (type === "close") result = updateStatus(graph, action, "closed");
  else if (type === "complete") result = updateStatus(graph, action, "complete");
  else if (type === "skip") result = updateStatus(graph, action, "skipped");
  else if (type === "cancel" || type === "cancelled" || type === "canceled") result = updateStatus(graph, action, "cancelled");
  else if (type === "reopen") result = updateStatus(graph, action, action.status || "ready", { clearTerminal: true });
  else if (type === "claim") result = claimWorkItem(graph, action);
  else if (type === "edit") result = editWorkItem(graph, action);
  else if (type === "delete" || type === "remove") result = deleteWorkItem(graph, action);
  else if (type === "reparent") result = reparentWorkItem(graph, action);
  else if (type === "dep-add" || type === "dependency-add") result = mutateDependency(graph, action, "add");
  else if (type === "dep-remove" || type === "dependency-remove") result = mutateDependency(graph, action, "remove");
  else if (type === "split") result = splitWorkItem(graph, action);
  else throw new Error(`unsupported work-item action: ${type}`);
  return appendAuditEvent(result, action, type);
}

export function isTerminalWorkItemStatus(status) {
  return DONE_STATUSES.has(String(status || "").toLowerCase());
}

function updateStatus(graph, action, status, options = {}) {
  if (!action.itemId) throw new Error("work-item action requires itemId");
  const now = action.now || new Date().toISOString();
  let changed = false;
  const update = (entry) => {
    const id = entry.itemId || entry.id;
    if (id !== action.itemId) return entry;
    changed = true;
    const next = {
      ...entry,
      status,
      updatedAt: now,
      updatedBy: action.actor || "user",
    };
    if (status === "closed" || status === "complete") {
      next.closedAt = now;
      next.closeReason = action.reason || (status === "complete" ? "completed by user" : "closed by user");
    }
    if (options.clearTerminal) {
      delete next.closedAt;
      delete next.closeReason;
      delete next.deferred;
      delete next.deferredUntil;
      next.reopenedAt = now;
      next.reopenReason = action.reason || "reopened by user";
    }
    return next;
  };
  const nextGraph = {
    ...graph,
    updatedAt: now,
    items: (graph.items || []).map(update),
    tasks: (graph.tasks || []).map(update),
  };
  if (!changed) throw new Error(`work item not found: ${action.itemId}`);
  return { graph: nextGraph, itemId: action.itemId, action: status, changed: true };
}

function claimWorkItem(graph, action) {
  if (!action.itemId) throw new Error("claim requires itemId");
  const now = action.now || new Date().toISOString();
  const leaseTtlMinutes = Number(action.leaseTtlMinutes || action.ttlMinutes || DEFAULT_CLAIM_TTL_MINUTES);
  const expiresAt = new Date(Date.parse(now) + leaseTtlMinutes * 60 * 1000).toISOString();
  const existingClaims = expireWorkItemClaims(graph.claims || [], now);
  const activeClaim = existingClaims.find((candidate) => candidate.taskId === action.itemId && isActiveWorkItemClaim(candidate, now));
  if (activeClaim && !action.force) {
    return {
      graph: { ...graph, claims: existingClaims },
      itemId: action.itemId,
      action: "claim-blocked",
      changed: false,
      conflict: {
        reason: "work-item-already-claimed",
        claimId: activeClaim.claimId,
        agentId: activeClaim.agentId,
        expiresAt: activeClaim.expiresAt || null,
        heartbeatAt: activeClaim.heartbeatAt || null,
      },
      nextAction: "wait for claim expiry, refresh heartbeat, or retry with force after manual review",
    };
  }
  const claim = {
    claimId: action.claimId || `${action.itemId}-${Date.parse(now) || Date.now()}`,
    taskId: action.itemId,
    agentId: action.actor || action.owner || "user",
    status: "claimed",
    claimedAt: now,
    heartbeatAt: now,
    expiresAt,
    leaseTtlMinutes,
    worktreeSessionId: action.worktreeSessionId || null,
    reason: action.reason || "claimed from Supervibe UI",
  };
  let changed = false;
  const update = (entry) => {
    const id = entry.itemId || entry.id;
    if (id !== action.itemId) return entry;
    changed = true;
    return {
      ...entry,
      status: isTerminalWorkItemStatus(entry.status) ? entry.status : "claimed",
      owner: action.owner || action.actor || entry.owner || "user",
      updatedAt: now,
    };
  };
  const nextGraph = {
    ...graph,
    updatedAt: now,
    claims: [...existingClaims, claim],
    items: (graph.items || []).map(update),
    tasks: (graph.tasks || []).map(update),
  };
  if (!changed) throw new Error(`work item not found: ${action.itemId}`);
  return { graph: nextGraph, itemId: action.itemId, action: "claim", claim, changed: true };
}

function editWorkItem(graph, action) {
  if (!action.itemId) throw new Error("edit requires itemId");
  const now = action.now || new Date().toISOString();
  const patch = normalizeEditPatch(action.patch || action);
  if (Object.keys(patch).length === 0) throw new Error("edit requires at least one mutable field");
  let changed = false;
  const nextItems = (graph.items || []).map((entry) => {
    if ((entry.itemId || entry.id) !== action.itemId) return entry;
    changed = true;
    return applyPatchToEntry(entry, patch, now, action);
  });
  if (!changed) throw new Error(`work item not found: ${action.itemId}`);
  const patchedItem = nextItems.find((entry) => (entry.itemId || entry.id) === action.itemId);
  const nextTasks = (graph.tasks || []).map((entry) => {
    if ((entry.itemId || entry.id) !== action.itemId) return entry;
    return syncTaskFromItem(applyPatchToEntry(entry, patch, now, action), patchedItem);
  });
  return {
    graph: { ...graph, updatedAt: now, items: nextItems, tasks: nextTasks },
    itemId: action.itemId,
    action: "edit",
    changed: true,
    patch,
  };
}

function deleteWorkItem(graph, action) {
  if (!action.itemId) throw new Error("delete requires itemId");
  const now = action.now || new Date().toISOString();
  const ids = new Set((graph.items || []).map((entry) => entry.itemId || entry.id));
  if (!ids.has(action.itemId)) throw new Error(`work item not found: ${action.itemId}`);
  const dependents = findDependents(graph, action.itemId);
  if (dependents.length > 0 && !action.force) {
    throw new Error(`delete refused; ${action.itemId} has dependents: ${dependents.join(",")}`);
  }
  const clean = (entry) => ({
    ...entry,
    blocks: removeValue(entry.blocks, action.itemId),
    blockedBy: removeValue(entry.blockedBy, action.itemId),
    related: removeValue(entry.related, action.itemId),
    dependencies: removeValue(entry.dependencies, action.itemId),
    updatedAt: now,
  });
  return {
    graph: {
      ...graph,
      updatedAt: now,
      items: (graph.items || [])
        .filter((entry) => (entry.itemId || entry.id) !== action.itemId)
        .map(clean),
      tasks: (graph.tasks || [])
        .filter((entry) => (entry.itemId || entry.id) !== action.itemId)
        .map(clean),
      claims: (graph.claims || []).filter((claim) => claim.taskId !== action.itemId),
      dependencyEdges: (graph.dependencyEdges || []).filter((edge) => edge.from !== action.itemId && edge.to !== action.itemId),
    },
    itemId: action.itemId,
    action: "delete",
    changed: true,
    dependentsRemoved: action.force ? dependents : [],
  };
}

function reparentWorkItem(graph, action) {
  if (!action.itemId) throw new Error("reparent requires itemId");
  if (!action.parentId && action.parentId !== null) throw new Error("reparent requires parentId");
  const now = action.now || new Date().toISOString();
  const items = graph.items || [];
  const ids = new Set(items.map((entry) => entry.itemId || entry.id));
  if (!ids.has(action.itemId)) throw new Error(`work item not found: ${action.itemId}`);
  if (action.parentId !== null && !ids.has(action.parentId)) throw new Error(`parent work item not found: ${action.parentId}`);
  if (action.parentId === action.itemId) throw new Error("work item cannot be its own parent");
  if (action.parentId && isDescendant(items, action.parentId, action.itemId)) {
    throw new Error(`reparent would create a cycle: ${action.itemId} -> ${action.parentId}`);
  }
  const update = (entry) => {
    if ((entry.itemId || entry.id) !== action.itemId) return entry;
    return { ...entry, parentId: action.parentId, updatedAt: now, updatedBy: action.actor || "user" };
  };
  return {
    graph: {
      ...graph,
      updatedAt: now,
      items: items.map(update),
      tasks: (graph.tasks || []).map(update),
    },
    itemId: action.itemId,
    action: "reparent",
    changed: true,
    parentId: action.parentId,
  };
}

function mutateDependency(graph, action, mode) {
  const from = action.from || action.fromId || action.itemId;
  const to = action.to || action.toId || action.blocks || action.dependsOn;
  if (!from || !to) throw new Error(`${mode === "add" ? "dep-add" : "dep-remove"} requires from and to`);
  const depType = action.depType || action.dependencyType || action.typeName || "blocks";
  const now = action.now || new Date().toISOString();
  const ids = new Set((graph.items || []).map((entry) => entry.itemId || entry.id));
  if (!ids.has(from)) throw new Error(`dependency source not found: ${from}`);
  if (!ids.has(to)) throw new Error(`dependency target not found: ${to}`);
  const add = mode === "add";
  const updateItem = (entry) => {
    const id = entry.itemId || entry.id;
    if (id === from) {
      if (depType === "related") return { ...entry, related: updateList(entry.related, to, add), updatedAt: now };
      return { ...entry, blocks: updateList(entry.blocks, to, add), updatedAt: now };
    }
    if (id === to && depType !== "related") {
      return { ...entry, blockedBy: updateList(entry.blockedBy, from, add), updatedAt: now };
    }
    return entry;
  };
  const updateTask = (entry) => {
    const id = entry.itemId || entry.id;
    if (id === to && depType !== "related") return { ...entry, dependencies: updateList(entry.dependencies, from, add), updatedAt: now };
    return entry;
  };
  const edge = { from, to, type: depType };
  return {
    graph: {
      ...graph,
      updatedAt: now,
      items: (graph.items || []).map(updateItem),
      tasks: (graph.tasks || []).map(updateTask),
      dependencyEdges: add
        ? addEdge(graph.dependencyEdges || [], edge)
        : removeEdge(graph.dependencyEdges || [], edge),
    },
    itemId: from,
    action: mode === "add" ? "dep-add" : "dep-remove",
    changed: true,
    dependency: edge,
  };
}

function splitWorkItem(graph, action) {
  if (!action.itemId) throw new Error("split requires itemId");
  const now = action.now || new Date().toISOString();
  const items = graph.items || [];
  const parent = items.find((entry) => (entry.itemId || entry.id) === action.itemId);
  if (!parent) throw new Error(`work item not found: ${action.itemId}`);
  const titles = normalizeSplitTitles(action.titles || action.title || action.subtasks);
  if (titles.length === 0) throw new Error("split requires at least one subtask title");
  const existingCount = items.filter((entry) => entry.parentId === action.itemId && entry.type === "subtask").length;
  const createdItems = titles.map((title, index) => createSubtaskFromParent(parent, {
    title,
    index: existingCount + index + 1,
    actor: action.actor || "user",
    now,
  }));
  const createdIds = createdItems.map((entry) => entry.itemId);
  const nextItems = items.map((entry) => {
    if ((entry.itemId || entry.id) !== action.itemId) return entry;
    return {
      ...entry,
      blockedBy: uniqueStrings([...(entry.blockedBy || []), ...createdIds]),
      updatedAt: now,
      updatedBy: action.actor || "user",
    };
  });
  const nextTasks = (graph.tasks || []).map((entry) => {
    if ((entry.itemId || entry.id) !== action.itemId) return entry;
    return {
      ...entry,
      dependencies: uniqueStrings([...(entry.dependencies || []), ...createdIds]),
      updatedAt: now,
    };
  });
  return {
    graph: {
      ...graph,
      updatedAt: now,
      items: [...nextItems, ...createdItems],
      tasks: [...nextTasks, ...createdItems.map(itemToTask)],
      dependencyEdges: [
        ...(graph.dependencyEdges || []),
        ...createdItems.flatMap((item) => [
          { from: action.itemId, to: item.itemId, type: "parent-child" },
          { from: item.itemId, to: action.itemId, type: "blocks" },
        ]),
      ],
    },
    itemId: action.itemId,
    action: "split",
    changed: true,
    createdItems: createdItems.map((entry) => entry.itemId),
  };
}

function expireWorkItemClaims(claims = [], now = new Date().toISOString()) {
  const instant = Date.parse(now);
  return claims.map((claim) => {
    if (!isPotentiallyActiveClaim(claim)) return claim;
    if (!claim.expiresAt) return claim;
    const expires = Date.parse(claim.expiresAt);
    if (!Number.isFinite(expires) || expires > instant) return claim;
    return {
      ...claim,
      status: "expired",
      expiredAt: now,
      recovery: "safe-stale-claim-recovery",
    };
  });
}

function isActiveWorkItemClaim(claim, now = new Date().toISOString()) {
  if (!isPotentiallyActiveClaim(claim)) return false;
  if (!claim.expiresAt) return true;
  const expires = Date.parse(claim.expiresAt);
  return !Number.isFinite(expires) || expires > Date.parse(now);
}

function isPotentiallyActiveClaim(claim = {}) {
  return ACTIVE_CLAIM_STATUSES.has(String(claim.status || "").toLowerCase());
}

async function withGraphFileLock(graphPath, action, fn) {
  const lockPath = `${graphPath}.lock`;
  const timeoutMs = Number(action.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS);
  const retryDelayMs = Number(action.lockRetryDelayMs ?? DEFAULT_LOCK_RETRY_DELAY_MS);
  const staleLockMs = Number(action.staleLockMs ?? DEFAULT_STALE_LOCK_MS);
  const startMs = Date.now();
  const actionNowMs = Date.parse(action.now || "");
  const nowMs = Number.isFinite(actionNowMs) ? actionNowMs : startMs;

  await mkdir(dirname(graphPath), { recursive: true });
  while (true) {
    let handle = null;
    try {
      handle = await open(lockPath, "wx");
      await handle.writeFile(`${JSON.stringify({
        pid: process.pid,
        acquiredAt: new Date(nowMs).toISOString(),
        graphPath,
      })}\n`, "utf8");
      try {
        return await fn();
      } finally {
        await handle.close();
        handle = null;
        await unlink(lockPath).catch(() => {});
      }
    } catch (error) {
      if (handle) await handle.close().catch(() => {});
      if (error.code !== "EEXIST") throw error;
      if (await removeStaleLock(lockPath, nowMs, staleLockMs)) continue;
      if (Date.now() - startMs >= timeoutMs) {
        throw new Error(`work-item graph is locked: ${graphPath}`);
      }
      await delay(retryDelayMs);
    }
  }
}

async function removeStaleLock(lockPath, nowMs, staleLockMs) {
  try {
    const raw = await readFile(lockPath, "utf8");
    const lock = JSON.parse(raw);
    const acquiredAt = Date.parse(lock.acquiredAt || "");
    if (!Number.isFinite(acquiredAt) || nowMs - acquiredAt <= staleLockMs) return false;
    await unlink(lockPath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return true;
    return false;
  }
}

function appendAuditEvent(result, action, requestedType) {
  const now = action.now || new Date().toISOString();
  const eventAction = result.action || requestedType;
  const event = {
    eventId: action.eventId || `${result.itemId || action.itemId || "graph"}-${eventAction}-${Date.parse(now) || Date.now()}`,
    itemId: result.itemId || action.itemId || null,
    action: eventAction,
    requestedAction: requestedType,
    actor: action.actor || action.owner || "user",
    changed: Boolean(result.changed),
    status: resolveItemStatus(result.graph, result.itemId || action.itemId),
    reason: action.reason || result.conflict?.reason || null,
    at: now,
  };
  if (result.conflict) event.conflict = result.conflict;
  if (result.claim?.claimId) event.claimId = result.claim.claimId;
  return {
    ...result,
    graph: {
      ...result.graph,
      events: [...(result.graph.events || []), event],
    },
  };
}

function resolveItemStatus(graph = {}, itemId = null) {
  const item = (graph.items || []).find((candidate) => candidate.itemId === itemId || candidate.id === itemId);
  const task = (graph.tasks || []).find((candidate) => candidate.itemId === itemId || candidate.id === itemId);
  return item?.status || task?.status || null;
}

function normalizeEditPatch(source = {}) {
  const allowed = new Set([
    "title",
    "description",
    "status",
    "priority",
    "owner",
    "assignee",
    "labels",
    "acceptanceCriteria",
    "verificationCommands",
    "writeScope",
    "estimatedSize",
    "parallelGroup",
    "dueAt",
    "reason",
  ]);
  const ignored = new Set([
    "type",
    "action",
    "itemId",
    "actor",
    "now",
    "dryRun",
    "lockTimeoutMs",
    "lockRetryDelayMs",
    "staleLockMs",
  ]);
  const patch = {};
  for (const [key, value] of Object.entries(source || {})) {
    if (ignored.has(key) || value === undefined) continue;
    if (allowed.has(key)) patch[key] = normalizePatchValue(key, value);
  }
  return patch;
}

function normalizePatchValue(key, value) {
  if (["labels", "acceptanceCriteria", "verificationCommands"].includes(key)) {
    if (Array.isArray(value)) return uniqueStrings(value);
    return String(value).split(/\s*(?:,|\n)\s*/).map((item) => item.trim()).filter(Boolean);
  }
  return value;
}

function applyPatchToEntry(entry, patch, now, action) {
  return {
    ...entry,
    ...patch,
    updatedAt: now,
    updatedBy: action.actor || action.owner || "user",
  };
}

function syncTaskFromItem(task, item) {
  return {
    ...task,
    id: task.id || item.itemId,
    title: item.title ?? task.title,
    goal: item.title ?? task.goal,
    status: item.status ?? task.status,
    priority: item.priority ?? task.priority,
    owner: item.owner ?? task.owner,
    acceptanceCriteria: item.acceptanceCriteria ?? task.acceptanceCriteria,
    verificationCommands: item.verificationCommands ?? task.verificationCommands,
    writeScope: item.writeScope ?? task.writeScope,
    parentId: item.parentId ?? task.parentId,
    epicId: item.epicId ?? task.epicId,
  };
}

function findDependents(graph, itemId) {
  const dependents = new Set();
  for (const item of graph.items || []) {
    if (item.itemId === itemId || item.id === itemId) continue;
    if (item.parentId === itemId) dependents.add(item.itemId || item.id);
    if ((item.blockedBy || []).includes(itemId)) dependents.add(item.itemId || item.id);
    if ((item.dependencies || []).includes(itemId)) dependents.add(item.itemId || item.id);
  }
  for (const task of graph.tasks || []) {
    if (task.id === itemId || task.itemId === itemId) continue;
    if (task.parentId === itemId) dependents.add(task.id || task.itemId);
    if ((task.dependencies || []).includes(itemId)) dependents.add(task.id || task.itemId);
  }
  for (const edge of graph.dependencyEdges || []) {
    if (edge.from === itemId) dependents.add(edge.to);
  }
  return [...dependents].filter(Boolean);
}

function isDescendant(items, candidateId, ancestorId) {
  let current = items.find((entry) => (entry.itemId || entry.id) === candidateId);
  const visited = new Set();
  while (current?.parentId) {
    if (current.parentId === ancestorId) return true;
    if (visited.has(current.parentId)) return true;
    visited.add(current.parentId);
    current = items.find((entry) => (entry.itemId || entry.id) === current.parentId);
  }
  return false;
}

function normalizeSplitTitles(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return String(value || "").split(/\s*(?:,|\n)\s*/).map((item) => item.trim()).filter(Boolean);
}

function createSubtaskFromParent(parent, { title, index, actor, now }) {
  const itemId = `${parent.itemId || parent.id}.sub${index}`;
  return {
    ...parent,
    itemId,
    id: undefined,
    title,
    type: "subtask",
    status: "open",
    priority: parent.priority || "medium",
    parentId: parent.itemId || parent.id,
    blocks: [parent.itemId || parent.id],
    blockedBy: [],
    related: [],
    discoveredFrom: { type: "split", itemId: parent.itemId || parent.id },
    owner: null,
    updatedAt: now,
    createdAt: now,
    createdBy: actor,
  };
}

function itemToTask(item) {
  return {
    id: item.itemId,
    title: item.title,
    goal: item.title,
    category: "implementation",
    status: item.status || "open",
    priority: item.priority || "medium",
    dependencies: [],
    parentId: item.parentId,
    epicId: item.epicId,
    acceptanceCriteria: item.acceptanceCriteria || [],
    verificationCommands: item.verificationCommands || [],
    writeScope: item.writeScope || [],
    labels: item.labels || [],
    owner: item.owner || null,
  };
}

function updateList(values = [], value, add) {
  return add ? uniqueStrings([...(values || []), value]) : removeValue(values, value);
}

function removeValue(values = [], value) {
  return (values || []).filter((entry) => entry !== value);
}

function addEdge(edges, edge) {
  if (edges.some((candidate) => sameEdge(candidate, edge))) return edges;
  return [...edges, edge];
}

function removeEdge(edges, edge) {
  return edges.filter((candidate) => !sameEdge(candidate, edge));
}

function sameEdge(left, right) {
  return left.from === right.from && left.to === right.to && left.type === right.type;
}

function uniqueStrings(values) {
  return [...new Set((values || []).map(String).filter(Boolean))];
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}
