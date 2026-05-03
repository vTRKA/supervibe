#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import {
  validateWorkflowReceipts,
} from "./lib/supervibe-workflow-receipt-runtime.mjs";

export function formatWorkflowReceiptsReport(result) {
  const lines = [
    "SUPERVIBE_WORKFLOW_RECEIPTS",
    `PASS: ${result.pass}`,
    `CHECKED: ${result.checked}`,
    `RECEIPTS: ${result.receipts}`,
    `LEDGER_ENTRIES: ${result.ledgerEntries}`,
    `COVERAGE_STATUS: ${coverageStatus(result)}`,
    `ISSUES: ${result.issues.length}`,
  ];
  for (const issue of result.issues) {
    lines.push(`ISSUE: ${issue.code} ${issue.file} - ${issue.message}`);
  }
  return lines.join("\n");
}

function coverageStatus(result = {}) {
  if (result.receipts === 0 && result.ledgerEntries === 0) return "not-started-no-receipts";
  if (result.receipts === 0) return "ledger-without-readable-receipts";
  return "receipts-present";
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = validateWorkflowReceipts(process.cwd());
  console.log(formatWorkflowReceiptsReport(result));
  process.exit(result.pass ? 0 : 1);
}
