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
    `SCOPE_ACTIVE: ${result.scope?.active === true}`,
    `SCOPE_HANDOFF: ${result.scope?.handoffId || "none"}`,
    `SCOPE_SLUG: ${result.scope?.slug || "none"}`,
    `APPROVAL_READY: ${approvalReady(result)}`,
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

function approvalReady(result = {}) {
  return result.pass === true
    && result.scope?.active === true
    && Number(result.checked || 0) > 0
    && result.executionMode === "real-agents"
    && (result.warnings || []).length === 0;
}

function coverageStatus(result = {}) {
  if (result.executionMode === "not-started" && result.receipts === 0 && result.checked === 0) return "not-started-no-durable-design-outputs";
  if (result.executionMode === "receipt-only" && result.receipts > 0 && result.checked === 0) return "receipt-only-no-durable-design-output-checks";
  if ((result.missingAgents || []).length > 0) return "blocked-missing-agent-receipts";
  if (result.executionMode === "real-agents") return "agent-receipts-present";
  return result.executionMode || "unknown";
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv);
  const result = validateDesignAgentInvocationReceipts(process.cwd(), options);
  console.log(formatDesignAgentReceiptsReport(result));
  process.exit(result.pass ? 0 : 1);
}

function parseArgs(argv = []) {
  const options = {};
  for (let index = 2; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      if (key === "active") options.active = true;
      else options[key] = true;
      continue;
    }
    index += 1;
    if (key === "handoff" || key === "handoff-id") options.handoffId = value;
    else if (key === "workflow-run-id") options.workflowRunId = value;
    else if (key === "slug" || key === "prototype-slug") options.slug = value;
    else if (key === "secret") options.secret = value;
    else options[key] = value;
  }
  return options;
}
