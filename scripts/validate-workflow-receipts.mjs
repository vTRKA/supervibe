#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import {
  validateScopedWorkflowReceipts,
  validateWorkflowReceipts,
} from "./lib/supervibe-workflow-receipt-runtime.mjs";
import {
  resolveCliRoots,
} from "./lib/supervibe-cli-roots.mjs";

export function formatWorkflowReceiptsReport(result) {
  const lines = [
    "SUPERVIBE_WORKFLOW_RECEIPTS",
    `PASS: ${result.pass}`,
    `CHECKED: ${result.checked}`,
    `RECEIPTS: ${result.receipts}`,
    `LEDGER_ENTRIES: ${result.ledgerEntries ?? "scope-skipped"}`,
    `COVERAGE_STATUS: ${coverageStatus(result)}`,
    `ISSUES: ${result.issues.length}`,
  ];
  if (result.scopeMode === "scoped") {
    lines.splice(1, 0, "SCOPE: scoped");
    lines.push(`BATCHING_OPTIMIZATION: ${result.batchingOptimization || "scoped-trust-fast-path"}`);
  }
  if (!result.pass) {
    lines.push(`NEXT_SAFE_ACTION: ${result.nextRepairCommand || "node scripts/workflow-receipt.mjs recovery-status"}`);
  }
  for (const issue of result.issues) {
    lines.push(`ISSUE: ${issue.code} ${issue.file} - ${issue.message}`);
  }
  return lines.join("\n");
}

function coverageStatus(result = {}) {
  if (result.scopeMode === "scoped" && result.receipts === 0) return "scoped-no-matching-receipts";
  if (result.scopeMode === "scoped") return "scoped-receipts-present";
  if (result.receipts === 0 && result.ledgerEntries === 0) return "not-started-no-receipts";
  if (result.receipts === 0) return "ledger-without-readable-receipts";
  return "receipts-present";
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
    if (options[key] === undefined) options[key] = next;
    else if (Array.isArray(options[key])) options[key].push(next);
    else options[key] = [options[key], next];
    index += 1;
  }
  return options;
}

function hasScopedOptions(options = {}) {
  return [
    "command",
    "workflow-command",
    "cmd",
    "handoff",
    "handoff-id",
    "slug",
    "stage",
    "stages",
    "stage-id",
    "subject-id",
    "subject-ids",
    "agent",
    "agent-id",
    "skill",
    "skill-id",
    "artifact",
    "artifact-path",
    "output",
    "output-artifact",
    "artifact-hash",
    "artifact-hashes",
    "host-invocation-id",
    "host-invocation-source",
    "host-invocation-evidence",
  ].some((key) => options[key] !== undefined);
}

function scopedOptionsFromCli(options = {}) {
  return {
    command: options.command || options["workflow-command"] || options.cmd,
    handoffId: options["handoff-id"] || options.handoff || options.slug,
    stage: options.stage || options["stage-id"],
    stages: options.stages,
    subjectId: options["subject-id"] || options.agent || options["agent-id"] || options.skill || options["skill-id"],
    subjectIds: options["subject-ids"],
    artifact: options.artifact || options["artifact-path"] || options.output || options["output-artifact"],
    artifactHash: options["artifact-hash"],
    artifactHashes: options["artifact-hashes"],
    hostInvocation: (options["host-invocation-id"] || options["host-invocation-source"] || options["host-invocation-evidence"])
      ? {
          source: options["host-invocation-source"] || null,
          invocationId: options["host-invocation-id"] || null,
          evidencePath: options["host-invocation-evidence"] || null,
        }
      : null,
    secret: options.secret || null,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv);
  const roots = resolveCliRoots({ argv: process.argv.slice(2) });
  const result = hasScopedOptions(options)
    ? validateScopedWorkflowReceipts(roots.root, scopedOptionsFromCli(options))
    : validateWorkflowReceipts(roots.root, { secret: options.secret || null });
  console.log(formatWorkflowReceiptsReport(result));
  process.exit(result.pass ? 0 : 1);
}
