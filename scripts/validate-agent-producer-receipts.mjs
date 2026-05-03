#!/usr/bin/env node
import { fileURLToPath } from "node:url";

import {
  validateAgentProducerReceipts,
} from "./lib/agent-producer-contract.mjs";

export function formatAgentProducerReceiptsReport(result) {
  const lines = [
    "SUPERVIBE_AGENT_PRODUCER_RECEIPTS",
    `PASS: ${result.pass}`,
    `CHECKED: ${result.checked}`,
    `RECEIPTS: ${result.receipts}`,
    `AGENT_RECEIPTS: ${result.agentReceipts}`,
    `EXPECTATIONS: ${result.expectations}`,
    `COVERAGE_STATUS: ${coverageStatus(result)}`,
    `ISSUES: ${result.issues.length}`,
  ];
  for (const issue of result.issues) {
    lines.push(`ISSUE: ${issue.code} ${issue.file} - ${issue.message}`);
  }
  return lines.join("\n");
}

function coverageStatus(result = {}) {
  if (result.receipts === 0 && result.expectations === 0) return "not-started-no-durable-outputs";
  if (result.agentReceipts === 0 && result.expectations > 0) return "blocked-missing-agent-receipts";
  if (result.agentReceipts === 0) return "no-agent-receipts";
  return "agent-receipts-present";
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = validateAgentProducerReceipts(process.cwd());
  console.log(formatAgentProducerReceiptsReport(result));
  process.exit(result.pass ? 0 : 1);
}
