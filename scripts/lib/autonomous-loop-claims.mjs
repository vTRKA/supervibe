import { createHash } from "node:crypto";
import { approvalLeaseAllows } from "./autonomous-loop-policy-guard.mjs";

export function createClaimRecord({
  taskId,
  agentId,
  attemptId,
  now = new Date(),
  ttlMinutes = 30,
  waveId = null,
  worktreeSessionId = null,
}) {
  const claimedAt = toDate(now);
  const expiresAt = new Date(claimedAt.getTime() + Number(ttlMinutes) * 60 * 1000);
  const seed = `${taskId}:${agentId}:${attemptId}:${claimedAt.toISOString()}`;
  return {
    taskId,
    agentId,
    claimId: `claim-${createHash("sha1").update(seed).digest("hex").slice(0, 10)}`,
    claimedAt: claimedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    status: "active",
    attemptId,
    ...(waveId ? { waveId } : {}),
    ...(worktreeSessionId ? { worktreeSessionId } : {}),
  };
}

export function claimTask({
  claims = [],
  task,
  agentId,
  attemptId,
  approvalLease = null,
  now = new Date(),
  ttlMinutes,
  waveId = null,
  worktreeSessionId = null,
} = {}) {
  const currentClaims = expireClaims(claims, now);
  const activeClaim = currentClaims.find((claim) => claim.taskId === task.id && isClaimActive(claim, now));
  if (activeClaim) {
    return { ok: false, reason: "task_already_claimed", claims: currentClaims, activeClaim };
  }

  if (task.policyRiskLevel === "high") {
    const action = {
      type: task.category,
      description: task.goal,
      environment: task.environment || task.targetEnvironment || "production",
      policyRiskLevel: "high",
    };
    if (!approvalLease?.actionClass || !approvalLeaseAllows(approvalLease, action)) {
      return { ok: false, reason: "exact_approval_lease_required", claims: currentClaims };
    }
  }

  const claim = createClaimRecord({
    taskId: task.id,
    agentId,
    attemptId,
    now,
    ttlMinutes: ttlMinutes ?? leaseTtlMinutes(approvalLease),
    waveId,
    worktreeSessionId,
  });
  return { ok: true, claim, claims: [...currentClaims, claim] };
}

export function releaseClaim(claims = [], claimId, status = "released", releasedAt = new Date()) {
  return claims.map((claim) => {
    if (claim.claimId !== claimId) return claim;
    return {
      ...claim,
      status,
      releasedAt: toDate(releasedAt).toISOString(),
    };
  });
}

export function attachExternalClaim(claims = [], claimId, externalClaim = {}) {
  return claims.map((claim) => {
    if (claim.claimId !== claimId) return claim;
    return {
      ...claim,
      externalTrackerClaim: {
        externalId: externalClaim.externalId || null,
        owner: externalClaim.owner || null,
        sessionId: externalClaim.sessionId || null,
        worktreePath: externalClaim.worktreePath || null,
        status: externalClaim.status || "active",
        claimedAt: externalClaim.claimedAt || new Date().toISOString(),
      },
    };
  });
}

export function expireClaims(claims = [], now = new Date()) {
  const instant = toDate(now).getTime();
  return claims.map((claim) => {
    if (claim.status !== "active") return claim;
    if (new Date(claim.expiresAt).getTime() > instant) return claim;
    return { ...claim, status: "expired", expiredAt: toDate(now).toISOString() };
  });
}

export function isClaimActive(claim, now = new Date()) {
  return claim?.status === "active" && new Date(claim.expiresAt).getTime() > toDate(now).getTime();
}

export function summarizeClaims(claims = [], now = new Date()) {
  const current = expireClaims(claims, now);
  return {
    active: current.filter((claim) => claim.status === "active").length,
    expired: current.filter((claim) => claim.status === "expired").length,
    released: current.filter((claim) => claim.status === "released").length,
    completed: current.filter((claim) => claim.status === "completed").length,
  };
}

function leaseTtlMinutes(approvalLease) {
  if (!approvalLease?.budget?.max_runtime_minutes) return 30;
  return Number(approvalLease.budget.max_runtime_minutes);
}

function toDate(value) {
  return value instanceof Date ? value : new Date(value);
}
