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
    `PRODUCER_RECEIPTS: ${result.producerReceipts ?? result.receipts}`,
    `HOST_AGENT_RECEIPTS: ${result.hostAgentReceipts ?? result.agentReceipts}`,
    `SKILL_RECEIPTS: ${result.skillReceipts ?? 0}`,
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
  if ((result.producerReceipts ?? 0) === 0 && result.expectations > 0) return "blocked-missing-producer-receipts";
  if ((result.hostAgentReceipts ?? result.agentReceipts ?? 0) === 0 && (result.skillReceipts ?? 0) > 0) return "skill-producer-receipts-present";
  if ((result.hostAgentReceipts ?? result.agentReceipts ?? 0) === 0) return "no-host-agent-receipts";
  return "host-agent-receipts-present";
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = validateAgentProducerReceipts(process.cwd());
  console.log(formatAgentProducerReceiptsReport(result));
  process.exit(result.pass ? 0 : 1);
}
