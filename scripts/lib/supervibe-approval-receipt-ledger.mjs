import { appendFile, mkdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { redactSensitiveText } from "./autonomous-loop-provider-policy-guard.mjs";

const DEFAULT_LEASE_MINUTES = 30;

export function defaultApprovalReceiptLedgerPath(rootDir = process.cwd()) {
  return join(rootDir, ".claude", "memory", "policy", "approval-receipts.jsonl");
}

export function createApprovalReceipt({
  receiptId = null,
  action,
  target,
  scope,
  approverLabel,
  createdAt = new Date().toISOString(),
  expiresAt = null,
  relatedTask = null,
  relatedRun = null,
  allowedSideEffects = [],
  evidence = [],
  metadata = {},
} = {}) {
  const created = toDate(createdAt);
  const expires = expiresAt ? toDate(expiresAt) : new Date(created.getTime() + DEFAULT_LEASE_MINUTES * 60_000);
  const safeAction = redactSensitiveText(action || "approval");
  const safeTarget = redactSensitiveText(target || "target");
  const safeScope = redactSensitiveText(scope || safeAction);
  const safeSideEffects = asArray(allowedSideEffects).map((item) => redactSensitiveText(item));
  const seed = `${safeAction}:${safeTarget}:${safeScope}:${approverLabel || "unknown"}:${created.toISOString()}:${expires.toISOString()}`;
  return {
    receiptId: receiptId || `approval-${createHash("sha1").update(seed).digest("hex").slice(0, 12)}`,
    action: safeAction,
    target: safeTarget,
    scope: safeScope,
    approverLabel: redactSensitiveText(approverLabel || "unlabeled-approver"),
    createdAt: created.toISOString(),
    expiresAt: expires.toISOString(),
    relatedTask,
    relatedRun,
    allowedSideEffects: safeSideEffects,
    evidence: asArray(evidence).map((item) => redactSensitiveText(item)),
    metadata: redactObject(metadata),
    rawSecretValuesStored: false,
  };
}

export async function appendApprovalReceipt(filePath, receiptInput = {}) {
  await mkdir(dirname(filePath), { recursive: true });
  const receipt = createApprovalReceipt(receiptInput);
  await appendFile(filePath, `${JSON.stringify(receipt)}\n`, "utf8");
  return receipt;
}

export async function readApprovalReceipts(filePath = defaultApprovalReceiptLedgerPath()) {
  try {
    const content = await readFile(filePath, "utf8");
    return content.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

export function receiptAllowsAction(receipt = {}, {
  action = null,
  target = null,
  sideEffect = null,
  now = new Date().toISOString(),
} = {}) {
  if (!receipt?.receiptId) {
    return {
      allowed: false,
      status: "approval_receipt_missing",
      nextAction: "request a scoped approval receipt before running this action",
    };
  }
  if (isReceiptExpired(receipt, now)) {
    return {
      allowed: false,
      status: "approval_receipt_expired",
      receiptId: receipt.receiptId,
      nextAction: `request a fresh approval receipt for ${receipt.action || action || "this action"}`,
    };
  }
  const actionAllowed = !action || receipt.action === action || receipt.scope === action || asArray(receipt.allowedSideEffects).includes(action);
  const targetAllowed = !target || receipt.target === redactSensitiveText(target) || receipt.scope === redactSensitiveText(target);
  const sideEffectAllowed = !sideEffect || asArray(receipt.allowedSideEffects).includes(redactSensitiveText(sideEffect)) || receipt.scope === redactSensitiveText(sideEffect);
  const allowed = actionAllowed && targetAllowed && sideEffectAllowed;
  return {
    allowed,
    status: allowed ? "approval_receipt_allowed" : "approval_receipt_scope_mismatch",
    receiptId: receipt.receiptId,
    nextAction: allowed ? "continue within receipt scope" : "request a scoped approval receipt for the exact action and target",
  };
}

export function receiptToApprovalLease(receipt = {}) {
  const scopes = unique([receipt.scope, receipt.action, receipt.target, ...asArray(receipt.allowedSideEffects)]);
  return {
    receiptId: receipt.receiptId,
    actionClass: receipt.action,
    scope: receipt.scope,
    scopes,
    targets: unique([receipt.target, ...asArray(receipt.allowedSideEffects)]),
    tools: scopes,
    approverLabel: receipt.approverLabel,
    expires_at: receipt.expiresAt,
    expired: isReceiptExpired(receipt),
  };
}

export function summarizeApprovalReceipts(receipts = [], { now = new Date().toISOString() } = {}) {
  const activeReceipts = receipts.filter((receipt) => !isReceiptExpired(receipt, now));
  const expiredReceipts = receipts.filter((receipt) => isReceiptExpired(receipt, now));
  const riskyActions = receipts.filter((receipt) => /remote|production|credential|billing|dns|network|mcp/i.test(`${receipt.action} ${receipt.scope} ${receipt.allowedSideEffects?.join(" ")}`));
  return {
    total: receipts.length,
    active: activeReceipts.length,
    expired: expiredReceipts.length,
    risky: riskyActions.length,
    receiptIds: receipts.map((receipt) => receipt.receiptId),
    riskyReceiptIds: riskyActions.map((receipt) => receipt.receiptId),
    activeReceiptIds: activeReceipts.map((receipt) => receipt.receiptId),
  };
}

export function formatApprovalReceiptSummary(summaryOrReceipts = {}, options = {}) {
  const summary = Array.isArray(summaryOrReceipts)
    ? summarizeApprovalReceipts(summaryOrReceipts, options)
    : summaryOrReceipts;
  return [
    "SUPERVIBE_APPROVAL_RECEIPTS",
    `TOTAL: ${summary.total || 0}`,
    `ACTIVE: ${summary.active || 0}`,
    `EXPIRED: ${summary.expired || 0}`,
    `RISKY: ${summary.risky || 0}`,
    `RECEIPTS: ${asArray(summary.receiptIds).join(",") || "none"}`,
  ].join("\n");
}

export function approvalReceiptSummaryForSideEffect(sideEffect = {}, receipts = []) {
  const receipt = receipts.find((candidate) => candidate.receiptId === sideEffect.approvalReceiptId);
  if (!receipt) {
    return {
      actionId: sideEffect.actionId,
      approvalReceiptId: sideEffect.approvalReceiptId || null,
      status: sideEffect.approvalReceiptId ? "receipt_not_found" : "receipt_not_required",
    };
  }
  return {
    actionId: sideEffect.actionId,
    approvalReceiptId: receipt.receiptId,
    action: receipt.action,
    scope: receipt.scope,
    expiresAt: receipt.expiresAt,
    status: isReceiptExpired(receipt) ? "expired" : "active",
  };
}

function isReceiptExpired(receipt = {}, now = new Date().toISOString()) {
  const expires = Date.parse(receipt.expiresAt || "");
  const current = Date.parse(now instanceof Date ? now.toISOString() : now);
  return Number.isFinite(expires) && Number.isFinite(current) && expires <= current;
}

function redactObject(value) {
  if (Array.isArray(value)) return value.map((item) => redactObject(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, redactObject(child)]));
  }
  if (typeof value === "string") return redactSensitiveText(value);
  return value;
}

function toDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid approval receipt date: ${value}`);
  return date;
}

function asArray(value) {
  if (Array.isArray(value)) return value.filter((item) => item !== undefined && item !== null && item !== "");
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

function unique(values = []) {
  return [...new Set(values.filter((value) => value !== undefined && value !== null && value !== ""))];
}
