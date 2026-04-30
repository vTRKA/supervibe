import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  appendApprovalReceipt,
  createApprovalReceipt,
  formatApprovalReceiptSummary,
  readApprovalReceipts,
  receiptAllowsAction,
  receiptToApprovalLease,
  summarizeApprovalReceipts,
} from "../scripts/lib/supervibe-approval-receipt-ledger.mjs";

test("approval receipts are scoped, expiring, and convertible to leases", () => {
  const receipt = createApprovalReceipt({
    action: "remote_mutation",
    target: "github:repo/pull/1",
    scope: "remote_mutation",
    approverLabel: "maintainer",
    createdAt: "2026-04-30T10:00:00.000Z",
    expiresAt: "2026-04-30T11:00:00.000Z",
    relatedTask: "T29",
    relatedRun: "run-1",
    allowedSideEffects: ["remote_mutation", "network:github"],
  });

  const allowed = receiptAllowsAction(receipt, {
    action: "remote_mutation",
    target: "github:repo/pull/1",
    sideEffect: "network:github",
    now: "2026-04-30T10:30:00.000Z",
  });
  const expired = receiptAllowsAction(receipt, {
    action: "remote_mutation",
    target: "github:repo/pull/1",
    now: "2026-04-30T11:30:00.000Z",
  });
  const lease = receiptToApprovalLease(receipt);

  assert.equal(receipt.receiptId.startsWith("approval-"), true);
  assert.equal(allowed.allowed, true);
  assert.equal(expired.allowed, false);
  assert.equal(expired.status, "approval_receipt_expired");
  assert.match(expired.nextAction, /request a fresh approval receipt/);
  assert.ok(lease.scopes.includes("remote_mutation"));
  assert.ok(lease.scopes.includes("network:github"));
});

test("approval receipt ledger redacts secrets and round-trips JSONL", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-receipts-"));
  const ledgerPath = join(rootDir, "receipts.jsonl");

  const receipt = await appendApprovalReceipt(ledgerPath, {
    action: "network",
    target: "https://example.invalid?token=abcdefghijklmnopqrstuvwxyz",
    scope: "network:https://example.invalid",
    approverLabel: "owner",
    createdAt: "2026-04-30T10:00:00.000Z",
    expiresAt: "2026-04-30T10:30:00.000Z",
    allowedSideEffects: ["network:https://example.invalid"],
  });
  const receipts = await readApprovalReceipts(ledgerPath);
  const summary = summarizeApprovalReceipts(receipts, { now: "2026-04-30T10:10:00.000Z" });

  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].receiptId, receipt.receiptId);
  assert.equal(JSON.stringify(receipts).includes("abcdefghijklmnopqrstuvwxyz"), false);
  assert.equal(summary.active, 1);
  assert.equal(summary.expired, 0);
  assert.match(formatApprovalReceiptSummary(summary), /ACTIVE: 1/);
});
