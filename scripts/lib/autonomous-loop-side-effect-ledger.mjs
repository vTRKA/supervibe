import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import { redactSensitiveText } from "./autonomous-loop-provider-policy-guard.mjs";

export function createSideEffect(action) {
  const seed = `${action.type || "action"}:${action.targetEnvironment || "local"}:${action.expectedSideEffect || ""}`;
  return {
    actionId: action.actionId || createHash("sha1").update(seed).digest("hex").slice(0, 10),
    type: action.type || "action",
    idempotencyKey: action.idempotencyKey || createHash("sha1").update(`${seed}:idempotency`).digest("hex").slice(0, 16),
    targetEnvironment: action.targetEnvironment || "local",
    expectedSideEffect: redactSensitiveText(action.expectedSideEffect || "none"),
    approvalLeaseId: action.approvalLeaseId || null,
    approvalReceiptId: action.approvalReceiptId || null,
    approvalReceiptSummary: action.approvalReceiptSummary || null,
    commandOrToolClass: action.commandOrToolClass || "local",
    permissionAuditId: action.permissionAuditId || null,
    permissionDecision: action.permissionDecision || null,
    approvedToolClasses: action.approvedToolClasses || [],
    promptRequiredToolClasses: action.promptRequiredToolClasses || [],
    deniedToolClasses: action.deniedToolClasses || [],
    rateLimitState: action.rateLimitState || null,
    networkApprovalState: action.networkApprovalState || null,
    secretReferences: action.secretReferences || [],
    rawSecretValuesStored: false,
    adapterId: action.adapterId || null,
    sessionId: action.sessionId || null,
    worktreePath: action.worktreePath || null,
    branchName: action.branchName || null,
    cleanupPolicy: action.cleanupPolicy || null,
    executionMode: action.executionMode || null,
    processId: action.processId || null,
    outputPath: action.outputPath || null,
    verificationCommand: action.verificationCommand || null,
    rollbackOrCleanupAction: action.rollbackOrCleanupAction || null,
    status: action.status || "planned",
    stoppable: action.stoppable ?? false,
    stopCommand: action.stopCommand || null,
    startedByLoop: action.startedByLoop ?? true,
    trackedInSideEffectLedger: action.trackedInSideEffectLedger ?? true,
  };
}

export function createProcessSideEffect(action = {}) {
  return createSideEffect({
    ...action,
    type: "process",
    targetEnvironment: action.targetEnvironment || "local",
    expectedSideEffect: action.expectedSideEffect || "fresh-context execution adapter process",
    commandOrToolClass: action.commandOrToolClass || `adapter:${action.adapterId || "unknown"}`,
    rollbackOrCleanupAction: action.rollbackOrCleanupAction || "stop adapter process and discard unverified output",
    verificationCommand: action.verificationCommand || "adapter completion signal and verification evidence summary",
    stoppable: action.stoppable ?? true,
    stopCommand: action.stopCommand || "supervibe-loop --stop <run-id>",
  });
}

export function createWorktreeSideEffect(action = {}) {
  return createSideEffect({
    ...action,
    type: "worktree",
    targetEnvironment: "local",
    expectedSideEffect: action.expectedSideEffect || "isolated git worktree session",
    commandOrToolClass: action.commandOrToolClass || "git-worktree",
    rollbackOrCleanupAction: action.rollbackOrCleanupAction || "archive session artifacts, verify clean tree, then remove worktree",
    verificationCommand: action.verificationCommand || "git worktree list and session registry heartbeat",
    stoppable: action.stoppable ?? true,
    stopCommand: action.stopCommand || `supervibe-loop --stop ${action.sessionId || "<session-id>"}`,
    status: action.status || "started",
    cleanupPolicy: action.cleanupPolicy || "keep-until-reviewed",
  });
}

export async function appendSideEffect(filePath, action) {
  await mkdir(dirname(filePath), { recursive: true });
  const entry = createSideEffect(action);
  await appendFile(filePath, `${JSON.stringify(entry)}\n`, "utf8");
  return entry;
}

export async function readSideEffects(filePath) {
  try {
    const content = await readFile(filePath, "utf8");
    return content.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

export function reconcileSideEffects(entries = []) {
  const unknown = entries.filter((entry) => entry.status === "started" && !entry.verificationCommand);
  const cleanup = entries.filter((entry) => entry.status === "cleanup_required");
  return {
    ok: unknown.length === 0,
    status: unknown.length > 0 ? "side_effect_reconciliation_required" : cleanup.length > 0 ? "cleanup_required" : "reconciled",
    unknown,
    cleanup,
  };
}
