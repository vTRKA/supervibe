import { copyFile, mkdir, open, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { deferWorkItemInGraph } from "./supervibe-work-item-scheduler.mjs";

const DONE_STATUSES = new Set(["done", "complete", "completed", "closed"]);
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
  else if (type === "reopen") result = updateStatus(graph, action, action.status || "ready", { clearTerminal: true });
  else if (type === "claim") result = claimWorkItem(graph, action);
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}
