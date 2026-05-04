#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import {
  validateDesignAgentInvocationReceipts,
} from "./lib/design-agent-orchestration.mjs";

export function formatDesignAgentReceiptsReport(result) {
  const lines = [
    "SUPERVIBE_DESIGN_AGENT_RECEIPTS",
    `PASS: ${result.pass}`,
    `CHECKED: ${result.checked}`,
    `RECEIPTS: ${result.receipts}`,
    `EXECUTION_MODE: ${result.executionMode || "unknown"}`,
    `COVERAGE_STATUS: ${coverageStatus(result)}`,
    `MISSING_AGENTS: ${(result.missingAgents || []).join(",") || "none"}`,
    `MISSING_SUBJECTS: ${(result.missingSubjects || []).join(",") || "none"}`,
    `QUALITY_IMPACT: ${result.qualityImpact || "none"}`,
    `WARNINGS: ${(result.warnings || []).length}`,
    `ISSUES: ${result.issues.length}`,
  ];
  for (const warning of result.warnings || []) {
    lines.push(`WARNING: ${warning.code} ${warning.file} - ${warning.message}`);
  }
  for (const issue of result.issues) {
    lines.push(`ISSUE: ${issue.code} ${issue.file} - ${issue.message}`);
  }
  return lines.join("\n");
}

function coverageStatus(result = {}) {
  if (result.executionMode === "not-started" && result.receipts === 0 && result.checked === 0) return "not-started-no-durable-design-outputs";
  if (result.executionMode === "receipt-only" && result.receipts > 0 && result.checked === 0) return "receipt-only-no-durable-design-output-checks";
  if ((result.missingAgents || []).length > 0) return "blocked-missing-agent-receipts";
  if (result.executionMode === "real-agents") return "agent-receipts-present";
  return result.executionMode || "unknown";
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = validateDesignAgentInvocationReceipts(process.cwd());
  console.log(formatDesignAgentReceiptsReport(result));
  process.exit(result.pass ? 0 : 1);
}
