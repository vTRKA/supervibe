import { copyFile, mkdir, open, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { evaluateTaskBudgetPolicy } from "./supervibe-task-budget-policy.mjs";
import { deferWorkItemInGraph } from "./supervibe-work-item-scheduler.mjs";
import { inferRootDirFromGraphPath, updateActiveWorkItemGraph } from "./supervibe-work-item-registry.mjs";
import { createWorkItemComment } from "./supervibe-work-item-comments.mjs";

const DONE_STATUSES = new Set(["done", "complete", "completed", "closed", "skipped", "cancelled", "canceled"]);
const ACTIVE_CLAIM_STATUSES = new Set(["active", "claimed", "in_progress"]);
const CREATABLE_WORK_ITEM_TYPES = new Set(["epic", "task", "subtask", "bug", "chore", "review", "gate", "followup"]);
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
    await updateActiveWorkItemGraph({
      rootDir: action.rootDir || inferRootDirFromGraphPath(graphPath),
      graphPath,
      graph: result.graph,
      reason: `mutation:${result.action || action.type || "unknown"}`,
    });
    result.backupPath = backupPath;
    return { ...result, dryRun: false };
  });
}

export function mutateWorkItemGraph(graph = {}, action = {}) {
  const type = String(action.type || action.action || "").toLowerCase();
  if (!type) throw new Error("work-item action type is required");
  let result;
  if (type === "defer") {
    if (!action.until && !action.reason && !action.indefinite) {
      throw new Error("defer requires --until or an explicit reason for indefinite deferral");
    }
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
  else if (type === "create" || type === "create-work-item") result = createWorkItem(graph, action);
  else if (type === "complete") result = updateStatus(graph, action, "complete");
  else if (type === "skip") result = updateStatus(graph, action, "skipped");
  else if (type === "cancel" || type === "cancelled" || type === "canceled") result = updateStatus(graph, action, "cancelled");
  else if (type === "block") result = blockWorkItem(graph, action);
  else if (type === "unblock") result = unblockWorkItem(graph, action);
  else if (type === "comment") result = appendWorkItemCommentToGraph(graph, action);
  else if (type === "handoff") result = appendWorkItemHandoff(graph, action);
  else if (type === "recover-stale" || type === "recover-stale-claim") result = recoverStaleWorkItemClaim(graph, action);
  else if (type === "reopen") result = updateStatus(graph, action, action.status || "ready", { clearTerminal: true });
  else if (type === "claim") result = claimWorkItem(graph, action);
  else if (type === "claim-wave") result = claimWorkItemWave(graph, action);
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
  if (["skipped", "cancelled"].includes(status) && !action.reason && !action.force) {
    throw new Error(`${status} requires reason`);
  }
  const impact = action.impact || action.skipImpact || action.cancelImpact || action.scopeImpact || action.goalImpact;
  if (["skipped", "cancelled"].includes(status) && !impact && !action.force) {
    throw new Error(`${status} requires impact`);
  }
  const now = action.now || new Date().toISOString();
  let changed = false;
  let targetChanged = false;
  const coveredSubstepIds = shouldCloseCoveredSubsteps(status, action, options)
    ? findCoveredSubstepIds(graph, action.itemId)
    : new Set();
  const update = (entry) => {
    const id = entry.itemId || entry.id;
    if (id !== action.itemId && !coveredSubstepIds.has(id)) return entry;
    if (isTerminalWorkItemStatus(entry.status) && id !== action.itemId) return entry;
    changed = true;
    if (id === action.itemId) targetChanged = true;
    const next = {
      ...entry,
      status,
      updatedAt: now,
      updatedBy: action.actor || "user",
    };
    if (status === "closed" || status === "complete") {
      next.closedAt = now;
      next.closeReason = action.reason || (status === "complete" ? "completed by user" : "closed by user");
      const verificationEvidence = normalizeVerificationEvidence(action.verificationEvidence || action.evidence, id, {
        now,
        reason: next.closeReason,
      });
      if (verificationEvidence.length > 0) {
        next.verificationEvidence = uniqueEvidence([...(next.verificationEvidence || []), ...verificationEvidence]);
      }
    }
    if (status === "skipped") {
      next.skipReason = action.reason || "skipped by user";
      next.skipImpact = impact || "impact accepted by user";
    }
    if (status === "cancelled") {
      next.cancelReason = action.reason || "cancelled by user";
      next.cancelImpact = impact || "impact accepted by user";
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
  const claimTargets = !options.clearTerminal && isTerminalWorkItemStatus(status)
    ? new Set([action.itemId, ...coveredSubstepIds])
    : new Set();
  const claimRetirement = retireWorkItemClaims(graph.claims || [], claimTargets, {
    now,
    actor: action.actor || "user",
    status,
    reason: action.reason || null,
  });
  const nextGraph = {
    ...graph,
    updatedAt: now,
    claims: claimRetirement.claims,
    items: (graph.items || []).map(update),
    tasks: (graph.tasks || []).map(update),
  };
  if (!targetChanged) throw new Error(`work item not found: ${action.itemId}`);
  return {
    graph: nextGraph,
    itemId: action.itemId,
    action: status,
    changed,
    autoClosedCoveredItems: [...coveredSubstepIds],
    retiredClaims: claimRetirement.retiredClaims,
  };
}

function shouldCloseCoveredSubsteps(status, action, options) {
  if (options.clearTerminal) return false;
  if (!["closed", "complete"].includes(status)) return false;
  const value = action.closeCoveredSubsteps ?? action.coveredSubsteps;
  return value !== false && value !== "false" && value !== "0";
}

function findCoveredSubstepIds(graph, parentId) {
  const ids = new Set();
  for (const entry of [...(graph.items || []), ...(graph.tasks || [])]) {
    const id = entry.itemId || entry.id;
    if (!id || id === parentId) continue;
    if (isTerminalWorkItemStatus(entry.status)) continue;
    if (isCoveredSubstep(entry, parentId)) ids.add(id);
  }
  return ids;
}

function isCoveredSubstep(entry, parentId) {
  const id = entry.itemId || entry.id || "";
  const type = String(entry.type || "").toLowerCase();
  const discoveredFrom = entry.discoveredFrom || {};
  if (discoveredFrom.type === "plan-step" && discoveredFrom.parentItemId === parentId) return true;
  if (entry.parentId !== parentId) return false;
  if (!["subtask", "step", "checklist"].includes(type)) return false;
  return id.startsWith(`${parentId}-s`) || id.startsWith(`${parentId}.sub`) || discoveredFrom.type === "plan-step";
}

function blockWorkItem(graph, action) {
  if (!action.itemId) throw new Error("block requires itemId");
  if (!action.reason) throw new Error("block requires reason");
  const now = action.now || new Date().toISOString();
  let changed = false;
  const update = (entry) => {
    const id = entry.itemId || entry.id;
    if (id !== action.itemId) return entry;
    changed = true;
    return {
      ...entry,
      status: "blocked",
      blockerReason: action.reason,
      blockerNextAction: action.nextAction || action["next-action"] || "resolve blocker and reopen task",
      blockedAt: now,
      updatedAt: now,
      updatedBy: action.actor || "user",
    };
  };
  const nextGraph = {
    ...graph,
    updatedAt: now,
    items: (graph.items || []).map(update),
    tasks: (graph.tasks || []).map(update),
  };
  if (!changed) throw new Error(`work item not found: ${action.itemId}`);
  return {
    graph: nextGraph,
    itemId: action.itemId,
    action: "block",
    changed: true,
    blocker: {
      reason: action.reason,
      nextAction: action.nextAction || action["next-action"] || "resolve blocker and reopen task",
    },
  };
}

function unblockWorkItem(graph, action) {
  if (!action.itemId) throw new Error("unblock requires itemId");
  const now = action.now || new Date().toISOString();
  let changed = false;
  const update = (entry) => {
    const id = entry.itemId || entry.id;
    if (id !== action.itemId) return entry;
    changed = true;
    const next = {
      ...entry,
      status: action.status || "ready",
      unblockedAt: now,
      unblockReason: action.reason || "blocker resolved",
      updatedAt: now,
      updatedBy: action.actor || "user",
    };
    delete next.blockerReason;
    delete next.blockerNextAction;
    return next;
  };
  const nextGraph = {
    ...graph,
    updatedAt: now,
    items: (graph.items || []).map(update),
    tasks: (graph.tasks || []).map(update),
  };
  if (!changed) throw new Error(`work item not found: ${action.itemId}`);
  return { graph: nextGraph, itemId: action.itemId, action: "unblock", changed: true };
}

function appendWorkItemCommentToGraph(graph, action) {
  if (!action.itemId) throw new Error("comment requires itemId");
  const now = action.now || new Date().toISOString();
  const body = action.body || action.comment || action.reason || "";
  if (!body) throw new Error("comment requires body");
  let changed = false;
  const comment = createWorkItemComment({
    workItemId: action.itemId,
    author: action.actor || action.author || "user",
    type: action.commentType || action.comment_type || "implementation-note",
    body,
    links: normalizeStringList(action.links || action.link),
    createdAt: now,
  });
  const update = (entry) => {
    const id = entry.itemId || entry.id;
    if (id !== action.itemId) return entry;
    changed = true;
    return {
      ...entry,
      comments: [...(entry.comments || []), comment],
      activity: [...(entry.activity || []), { type: "comment", commentId: comment.commentId, at: now }],
      updatedAt: now,
    };
  };
  const nextGraph = {
    ...graph,
    updatedAt: now,
    comments: [...(graph.comments || []), comment],
    items: (graph.items || []).map(update),
    tasks: (graph.tasks || []).map(update),
  };
  if (!changed) throw new Error(`work item not found: ${action.itemId}`);
  return { graph: nextGraph, itemId: action.itemId, action: "comment", changed: true, comment };
}

function appendWorkItemHandoff(graph, action) {
  if (!action.itemId) throw new Error("handoff requires itemId");
  const now = action.now || new Date().toISOString();
  const handoff = {
    handoffId: action.handoffId || `${action.itemId}-handoff-${Date.parse(now) || Date.now()}`,
    itemId: action.itemId,
    producer: action.producer || action.from || action.actor || "unknown",
    recipient: action.recipient || action.to || action.owner || "unknown",
    receiptId: action.receiptId || action.receipt || null,
    summary: action.summary || action.reason || null,
    at: now,
  };
  let changed = false;
  const update = (entry) => {
    const id = entry.itemId || entry.id;
    if (id !== action.itemId) return entry;
    changed = true;
    return {
      ...entry,
      handoffs: [...(entry.handoffs || []), handoff],
      updatedAt: now,
    };
  };
  const nextGraph = {
    ...graph,
    updatedAt: now,
    handoffs: [...(graph.handoffs || []), handoff],
    items: (graph.items || []).map(update),
    tasks: (graph.tasks || []).map(update),
  };
  if (!changed) throw new Error(`work item not found: ${action.itemId}`);
  return { graph: nextGraph, itemId: action.itemId, action: "handoff", changed: true, handoff };
}

function recoverStaleWorkItemClaim(graph, action) {
  if (!action.itemId) throw new Error("recover-stale requires itemId");
  const now = action.now || new Date().toISOString();
  const expiredClaims = expireWorkItemClaims(graph.claims || [], now);
  const recoveredClaims = [];
  const claims = expiredClaims.map((claim) => {
    const matchesTarget = claim.taskId === action.itemId;
    const shouldRecover = matchesTarget && (
      claim.status === "expired" || (action.force && isPotentiallyActiveClaim(claim))
    );
    if (!shouldRecover) return claim;
    const recovered = {
      ...claim,
      status: "recovered",
      recoveredAt: now,
      recoveredBy: action.actor || "user",
      recoveryReason: action.reason || (claim.status === "expired" ? "stale claim recovered" : "active claim force-recovered"),
    };
    recoveredClaims.push(recovered);
    return recovered;
  });
  if (recoveredClaims.length === 0 && !action.force) {
    throw new Error(`no stale claim found for ${action.itemId}`);
  }
  let changed = recoveredClaims.length > 0;
  const update = (entry) => {
    const id = entry.itemId || entry.id;
    if (id !== action.itemId) return entry;
    changed = true;
    return {
      ...entry,
      status: isTerminalWorkItemStatus(entry.status) ? entry.status : "ready",
      owner: null,
      staleRecoveredAt: now,
      updatedAt: now,
    };
  };
  return {
    graph: {
      ...graph,
      updatedAt: now,
      claims,
      items: (graph.items || []).map(update),
      tasks: (graph.tasks || []).map(update),
    },
    itemId: action.itemId,
    action: "recover-stale",
    changed,
    recoveredClaims,
  };
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
    waveId: action.waveId || null,
    writeSet: normalizeStringList(action.writeSet),
    writeSetLock: action.writeSetLock || null,
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

function claimWorkItemWave(graph, action) {
  const entries = normalizeClaimWaveEntries(action);
  if (entries.length === 0) throw new Error("claim-wave requires claims or itemIds");
  const now = action.now || new Date().toISOString();
  const existingClaims = expireWorkItemClaims(graph.claims || [], now);
  const conflicts = entries
    .map((entry) => {
      const activeClaim = existingClaims.find((candidate) => candidate.taskId === entry.itemId && isActiveWorkItemClaim(candidate, now));
      return activeClaim ? {
        itemId: entry.itemId,
        reason: "work-item-already-claimed",
        claimId: activeClaim.claimId,
        agentId: activeClaim.agentId,
      } : null;
    })
    .filter(Boolean);
  if (conflicts.length > 0 && !action.force) {
    return {
      graph: { ...graph, claims: existingClaims },
      itemId: entries[0].itemId,
      action: "claim-wave-blocked",
      changed: false,
      conflicts,
      nextAction: "wait for claim expiry, refresh heartbeat, or retry with force after manual review",
    };
  }

  let current = { ...graph, claims: existingClaims };
  const claimResults = [];
  for (const [index, entry] of entries.entries()) {
    const result = claimWorkItem(current, {
      ...action,
      ...entry,
      type: "claim",
      now,
      claimId: entry.claimId || `${entry.itemId}-${Date.parse(now) || Date.now()}-${index + 1}`,
    });
    current = result.graph;
    claimResults.push({
      itemId: entry.itemId,
      claimId: result.claim?.claimId || null,
      changed: result.changed,
    });
  }
  return {
    graph: current,
    itemId: entries[0].itemId,
    action: "claim-wave",
    changed: claimResults.some((item) => item.changed),
    claimResults,
    waveId: action.waveId || null,
  };
}

function normalizeClaimWaveEntries(action = {}) {
  if (Array.isArray(action.claims)) {
    return action.claims
      .map((entry) => ({
        ...entry,
        itemId: entry.itemId || entry.id || entry.taskId,
      }))
      .filter((entry) => entry.itemId);
  }
  return normalizeStringList(action.itemIds || action.items || action.itemId)
    .map((itemId) => ({ itemId }));
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
  const deletedItem = (graph.items || []).find((entry) => (entry.itemId || entry.id) === action.itemId);
  const tombstone = {
    itemId: action.itemId,
    deletedAt: now,
    deletedBy: action.actor || "user",
    reason: action.reason || "deleted by user",
    snapshot: deletedItem || null,
  };
  return {
    graph: {
      ...graph,
      updatedAt: now,
      tombstones: [...(graph.tombstones || []), tombstone],
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
    tombstone,
    dependentsRemoved: action.force ? dependents : [],
  };
}

function createWorkItem(graph, action) {
  const now = action.now || new Date().toISOString();
  const source = action.item || action;
  const itemType = source.workItemType || source.itemType || source.formType || "task";
  const normalizedType = normalizeCreatedItemType(itemType);
  const title = String(source.title || source.goal || "").trim();
  if (!title) throw new Error("create requires title");
  const ids = new Set((graph.items || []).map((entry) => entry.itemId || entry.id));
  const parentId = source.parentId ?? source.parent ?? (normalizedType === "epic" ? null : graph.epicId || graph.graph_id || null);
  if (parentId && !ids.has(parentId)) throw new Error(`parent work item not found: ${parentId}`);
  const itemId = uniqueWorkItemId(ids, source.itemId || source.id || `${graph.epicId || graph.graph_id || "work"}-${slugify(title)}`);
  const item = {
    itemId,
    epicId: source.epicId || graph.epicId || graph.graph_id || itemId,
    parentId,
    type: normalizedType,
    title,
    status: source.status || "open",
    priority: source.priority ?? 0,
    owner: source.owner || source.assignee || null,
    assignee: source.assignee || null,
    labels: normalizeStringList(source.labels),
    blocks: normalizeStringList(source.blocks),
    blockedBy: normalizeStringList(source.blockedBy || source.dependencies),
    related: normalizeStringList(source.related),
    acceptanceCriteria: normalizeStringList(source.acceptanceCriteria || source.acceptance),
    verificationCommands: normalizeStringList(source.verificationCommands || source.verification || source.verificationHints),
    writeScope: Array.isArray(source.writeScope) ? source.writeScope : [],
    createdAt: now,
    createdBy: action.actor || source.owner || "user",
    updatedAt: now,
  };
  const task = item.type === "epic" ? null : itemToTask(item);
  const dependencyEdges = [
    ...(graph.dependencyEdges || []),
    ...(parentId ? [{ from: parentId, to: itemId, type: "parent-child" }] : []),
    ...item.blockedBy.map((from) => ({ from, to: itemId, type: "blocks" })),
    ...item.blocks.map((to) => ({ from: itemId, to, type: "blocks" })),
    ...item.related.map((to) => ({ from: itemId, to, type: "related" })),
  ];
  return {
    graph: {
      ...graph,
      updatedAt: now,
      items: [...(graph.items || []), item],
      tasks: task ? [...(graph.tasks || []), task] : (graph.tasks || []),
      dependencyEdges,
    },
    itemId,
    action: "create",
    changed: true,
    createdItems: [itemId],
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
  const nextGraph = {
      ...graph,
      updatedAt: now,
      items: (graph.items || []).map(updateItem),
      tasks: (graph.tasks || []).map(updateTask),
      dependencyEdges: add
        ? addEdge(graph.dependencyEdges || [], edge)
        : removeEdge(graph.dependencyEdges || [], edge),
    };
  if (add && depType !== "related" && hasDependencyCycle(nextGraph.tasks || [])) {
    throw new Error(`dependency cycle detected for ${from}->${to}`);
  }
  return {
    graph: nextGraph,
    itemId: from,
    action: mode === "add" ? "dep-add" : "dep-remove",
    changed: true,
    dependency: edge,
  };
}

function hasDependencyCycle(tasks = []) {
  const byId = new Map(tasks.map((task) => [task.id || task.itemId, task]));
  const visiting = new Set();
  const visited = new Set();
  const visit = (id) => {
    if (!id || visited.has(id)) return false;
    if (visiting.has(id)) return true;
    visiting.add(id);
    const task = byId.get(id);
    for (const dependencyId of task?.dependencies || []) {
      if (visit(dependencyId)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return [...byId.keys()].some((id) => visit(id));
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
  const nextGraph = refreshDerivedGraphMetadata({
    ...graph,
    updatedAt: now,
    items: [...nextItems, ...createdItems],
    tasks: [...nextTasks, ...createdItems.map(itemToTask)],
    dependencyEdges: createdItems.reduce((edges, item) => addEdge(addEdge(addEdge(
      edges,
      { from: action.itemId, to: item.itemId, type: "parent-child" },
    ), { from: item.itemId, to: action.itemId, type: "blocks" }), {
      from: action.itemId,
      to: item.itemId,
      type: "discovered-from",
    }), graph.dependencyEdges || []),
  }, { createdItems });
  return {
    graph: nextGraph,
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

function retireWorkItemClaims(claims = [], targetIds = new Set(), { now = new Date().toISOString(), actor = "user", status = "closed", reason = null } = {}) {
  if (!targetIds.size) return { claims, retiredClaims: [] };
  const retiredClaims = [];
  const nextClaims = claims.map((claim) => {
    if (!targetIds.has(claim.taskId) || !isPotentiallyActiveClaim(claim)) return claim;
    const retired = {
      ...claim,
      status: "completed",
      completedAt: now,
      completedBy: actor,
      completionStatus: status,
      completionReason: reason,
    };
    retiredClaims.push(retired);
    return retired;
  });
  return { claims: nextClaims, retiredClaims };
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
  if (result.claimResults?.length) event.claimResults = result.claimResults.map((claim) => ({
    itemId: claim.itemId,
    claimId: claim.claimId,
  }));
  if (result.waveId) event.waveId = result.waveId;
  if (result.blocker) event.blocker = result.blocker;
  if (result.comment?.commentId) event.commentId = result.comment.commentId;
  if (result.handoff?.handoffId) event.handoffId = result.handoff.handoffId;
  if (action.impact || action.skipImpact || action.cancelImpact || action.scopeImpact || action.goalImpact) {
    event.impact = action.impact || action.skipImpact || action.cancelImpact || action.scopeImpact || action.goalImpact;
  }
  if (result.tombstone) event.tombstone = { itemId: result.tombstone.itemId, deletedAt: result.tombstone.deletedAt };
  if (result.recoveredClaims?.length) event.recoveredClaims = result.recoveredClaims.map((claim) => claim.claimId);
  if (result.retiredClaims?.length) event.retiredClaims = result.retiredClaims.map((claim) => claim.claimId);
  if (result.autoClosedCoveredItems?.length) event.autoClosedCoveredItems = result.autoClosedCoveredItems;
  const verificationEvidence = normalizeVerificationEvidence(action.verificationEvidence || action.evidence, event.itemId || event.taskId, {
    now: event.at,
    reason: event.reason,
  });
  if (verificationEvidence.length > 0) event.verificationEvidence = verificationEvidence;
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
    "impact",
    "skipImpact",
    "cancelImpact",
    "scopeImpact",
    "goalImpact",
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

function normalizeVerificationEvidence(value, itemId, { now, reason } = {}) {
  const entries = Array.isArray(value) ? value : value ? [value] : [];
  return entries
    .map((entry) => {
      if (entry && typeof entry === "object" && !Array.isArray(entry)) {
        return {
          taskId: entry.taskId || entry.itemId || itemId,
          status: entry.status || entry.verdict || entry.result || "pass",
          source: entry.source || "work-item-action",
          recordedAt: entry.recordedAt || now,
          ...entry,
        };
      }
      const text = String(entry || "").trim();
      if (!text) return null;
      const looksLikeCommand = /^(?:node|npm|npx|pnpm|yarn|bun)\b/i.test(text);
      return {
        taskId: itemId,
        status: "pass",
        source: "work-item-action",
        recordedAt: now,
        command: looksLikeCommand ? text : undefined,
        outputSummary: looksLikeCommand ? `verified with ${text}` : text,
        reason: reason || undefined,
      };
    })
    .filter(Boolean);
}

function uniqueEvidence(entries = []) {
  const seen = new Set();
  const result = [];
  for (const entry of entries) {
    const key = JSON.stringify(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(entry);
  }
  return result;
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
  const parentId = parent.itemId || parent.id;
  const itemId = `${parentId}.sub${index}`;
  const parentSource = parent.discoveredFrom || {};
  const parentExecutionHints = parent.executionHints || {};
  return {
    ...parent,
    itemId,
    id: undefined,
    title,
    type: "subtask",
    status: "open",
    priority: parent.priority || "medium",
    parentId,
    blocks: [parentId],
    blockedBy: [],
    related: [],
    discoveredFrom: {
      type: "split",
      itemId: parentId,
      parentItemId: parentId,
      path: parentSource.path || parentExecutionHints.sourcePlan || null,
      line: parentSource.line || null,
      taskRef: parentSource.taskRef || parentExecutionHints.sourceTaskRef || null,
      source: parentSource,
    },
    executionHints: {
      ...parentExecutionHints,
      splitParentItemId: parentId,
      splitIndex: index,
      sourceTaskRef: parentExecutionHints.sourceTaskRef || parentSource.taskRef || null,
      sourcePlanPath: parentSource.path || parentExecutionHints.sourcePlan || null,
    },
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
    dependencies: uniqueStrings([...(item.dependencies || []), ...(item.blockedBy || [])]),
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

function refreshDerivedGraphMetadata(graph, { createdItems = [] } = {}) {
  const metadata = graph.metadata || {};
  const nextMetadata = { ...metadata };
  if (metadata.taskBudgetPolicy) {
    const report = evaluateTaskBudgetPolicy({
      items: graph.items || [],
      policy: metadata.taskBudgetPolicy.policy || metadata.taskBudgetPolicy.report?.policy,
      decision: metadata.taskBudgetPolicy.decision || metadata.taskBudgetPolicy.report?.decision,
    });
    nextMetadata.taskBudgetPolicy = {
      ...metadata.taskBudgetPolicy,
      policy: report.policy,
      decision: report.decision,
      report,
    };
  }
  if (metadata.semanticEpicGrouping || Array.isArray(metadata.semanticEpics)) {
    const candidates = (graph.items || []).filter((item) => !["epic", "gate", "followup"].includes(item.type));
    const nextSemanticEpics = Array.isArray(metadata.semanticEpics)
      ? metadata.semanticEpics.map((epic) => ({
        ...epic,
        taskIds: [...(epic.taskIds || [])],
      }))
      : [];
    for (const item of createdItems) {
      const parentId = item.discoveredFrom?.parentItemId || item.parentId;
      const parent = (graph.items || []).find((candidate) => (candidate.itemId || candidate.id) === parentId);
      const semanticEpicId = item.executionHints?.semanticEpicId || parent?.executionHints?.semanticEpicId;
      const semanticEpic = nextSemanticEpics.find((entry) => entry.id === semanticEpicId)
        || nextSemanticEpics.find((entry) => (entry.taskIds || []).includes(parentId));
      if (!semanticEpic) continue;
      if (!semanticEpic.taskIds.includes(item.itemId)) semanticEpic.taskIds.push(item.itemId);
      semanticEpic.taskCount = semanticEpic.taskIds.length;
    }
    const averageConfidence = nextSemanticEpics.length
      ? Number((nextSemanticEpics.reduce((sum, epic) => sum + Number(epic.confidence || 0), 0) / nextSemanticEpics.length).toFixed(2))
      : 0;
    nextMetadata.semanticEpicGrouping = {
      ...(metadata.semanticEpicGrouping || {}),
      taskCount: candidates.length,
      epicCount: nextSemanticEpics.length,
      averageConfidence,
    };
    if (nextSemanticEpics.length > 0) nextMetadata.semanticEpics = nextSemanticEpics;
  }
  return {
    ...graph,
    metadata: nextMetadata,
  };
}

function normalizeStringList(value) {
  if (Array.isArray(value)) return uniqueStrings(value.map((item) => String(item).trim()).filter(Boolean));
  return uniqueStrings(String(value || "").split(/\s*(?:,|\n|;)\s*/).map((item) => item.trim()).filter(Boolean));
}

function uniqueWorkItemId(existingIds, candidate) {
  const base = slugify(candidate || "work-item") || "work-item";
  if (!existingIds.has(base)) return base;
  let index = 2;
  while (existingIds.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function normalizeCreatedItemType(value) {
  const type = String(value || "task").toLowerCase().replace(/_/g, "-");
  if (type === "review-request") return "review";
  if (type === "blocker") return "gate";
  if (CREATABLE_WORK_ITEM_TYPES.has(type)) return type;
  return "task";
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}
