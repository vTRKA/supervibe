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
    `TRUSTED_HOST_AGENT_RECEIPTS: ${result.trustedHostAgentReceipts ?? result.agentReceipts ?? 0}`,
    `SKILL_RECEIPTS: ${result.skillReceipts ?? 0}`,
    `AGENT_RECEIPTS: ${result.agentReceipts}`,
    `AGENT_INVOCATIONS: ${result.agentInvocations ?? 0}`,
    `LOGGED_AGENT_INVOCATIONS: ${result.loggedAgentInvocations ?? result.agentInvocations ?? 0}`,
    `EXPECTATIONS: ${result.expectations}`,
    `COVERAGE_STATUS: ${coverageStatus(result)}`,
    `ISSUES: ${result.issues.length}`,
  ];
  for (const issue of result.issues) {
    lines.push(`ISSUE: ${issue.code} ${issue.file} - ${issue.message}`);
  }
  if (!result.pass) {
    lines.push(`NEXT_ACTION: ${nextAction(result)}`);
  }
  return lines.join("\n");
}

function coverageStatus(result = {}) {
  const trustedHostReceipts = result.trustedHostAgentReceipts ?? result.agentReceipts ?? 0;
  if (result.receipts === 0 && result.expectations === 0) return "not-started-no-durable-outputs";
  if ((result.producerReceipts ?? 0) === 0 && result.expectations > 0) return "blocked-missing-producer-receipts";
  if (trustedHostReceipts === 0 && (result.skillReceipts ?? 0) > 0) return "skill-producer-receipts-present";
  if (trustedHostReceipts === 0) return "no-trusted-host-agent-receipts";
  return "trusted-host-agent-receipts-present";
}

function parseArgs(argv = []) {
  const options = {};
  for (let index = 2; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      options[key] = true;
      continue;
    }
    options[key] = next;
    index += 1;
  }
  return options;
}

function nextAction(result = {}) {
  if ((result.issues || []).some((issue) => issue.code === "insufficient-agent-telemetry")) {
    return "Run real host-agent stages, then log each with `node scripts/agent-invocation.mjs log ... --issue-receipt`.";
  }
  if ((result.issues || []).some((issue) => issue.code === "insufficient-host-agent-receipts" || issue.code === "missing-host-agent-invocation")) {
    return "Use `node scripts/agent-invocation.mjs log --host <host> --host-invocation-id <id> --issue-receipt ...` for the claimed agent output.";
  }
  if ((result.issues || []).some((issue) => /receipt/i.test(issue.code))) {
    return "Run `node scripts/workflow-receipt.mjs recovery-status`, then reissue or prune stale receipts as reported.";
  }
  return "Inspect the ISSUE lines above and rerun this validator after repair.";
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv);
  const result = validateAgentProducerReceipts(process.cwd(), {
    requireHostAgentReceipts: Boolean(options["strict-host-agents"]),
    minHostAgentReceipts: options["min-host-agent-receipts"],
    minAgentInvocations: options["min-agent-invocations"],
  });
  console.log(formatAgentProducerReceiptsReport(result));
  process.exit(result.pass ? 0 : 1);
}
