import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createHash } from "node:crypto";

export function createSideEffect(action) {
  const seed = `${action.type || "action"}:${action.targetEnvironment || "local"}:${action.expectedSideEffect || ""}`;
  return {
    actionId: action.actionId || createHash("sha1").update(seed).digest("hex").slice(0, 10),
    idempotencyKey: action.idempotencyKey || createHash("sha1").update(`${seed}:idempotency`).digest("hex").slice(0, 16),
    targetEnvironment: action.targetEnvironment || "local",
    expectedSideEffect: action.expectedSideEffect || "none",
    approvalLeaseId: action.approvalLeaseId || null,
    commandOrToolClass: action.commandOrToolClass || "local",
    verificationCommand: action.verificationCommand || null,
    rollbackOrCleanupAction: action.rollbackOrCleanupAction || null,
    status: action.status || "planned",
    startedByLoop: true,
    trackedInSideEffectLedger: true,
  };
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
