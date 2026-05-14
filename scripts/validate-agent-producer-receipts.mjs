#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  validateAgentProducerReceipts,
  validateHostInvocationProof,
} from "./lib/agent-producer-contract.mjs";
import {
  normalizeWorkflowReceiptScope,
  readWorkflowReceipts,
  validateWorkflowReceiptTrust,
  workflowReceiptMatchesScope,
} from "./lib/supervibe-workflow-receipt-runtime.mjs";
import {
  resolveCliRoots,
} from "./lib/supervibe-cli-roots.mjs";

const HOST_AGENT_SUBJECT_TYPES = Object.freeze(["agent", "worker", "reviewer"]);

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
  if (result.scopeMode === "scoped") {
    lines.splice(1, 0, "SCOPE: scoped");
    lines.push(`BATCHING_OPTIMIZATION: ${result.batchingOptimization || "scoped-trust-fast-path"}`);
  }
  for (const issue of result.issues) {
    lines.push(`ISSUE: ${issue.code} ${issue.file} - ${issue.message}`);
  }
  if (!result.pass) {
    lines.push(`NEXT_ACTION: ${nextAction(result)}`);
  }
  return lines.join("\n");
}

function coverageStatus(result = {}) {
  if (result.scopeMode === "scoped" && result.receipts === 0) return "scoped-missing-producer-receipts";
  if (result.scopeMode === "scoped" && (result.trustedHostAgentReceipts ?? 0) > 0) return "scoped-trusted-host-agent-receipts-present";
  if (result.scopeMode === "scoped") return "scoped-producer-receipts-present";
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
    if (options[key] === undefined) options[key] = next;
    else if (Array.isArray(options[key])) options[key].push(next);
    else options[key] = [options[key], next];
    index += 1;
  }
  return options;
}

function nextAction(result = {}) {
  if ((result.issues || []).some((issue) => issue.code === "insufficient-agent-telemetry" || issue.code === "insufficient-scoped-agent-telemetry")) {
    return "Run real host-agent stages, then log each with `node scripts/agent-invocation.mjs log ... --issue-receipt`.";
  }
  if ((result.issues || []).some((issue) => issue.code === "insufficient-host-agent-receipts" || issue.code === "missing-host-agent-invocation" || issue.code === "insufficient-scoped-host-agent-receipts" || issue.code === "missing-scoped-agent-producer-receipt")) {
    return "Use `node scripts/agent-invocation.mjs log --host <host> --host-invocation-id <id> --issue-receipt ...` for the claimed agent output.";
  }
  if ((result.issues || []).some((issue) => /receipt/i.test(issue.code))) {
    return "Run `node scripts/workflow-receipt.mjs recovery-status`, then reissue or prune stale receipts as reported.";
  }
  return "Inspect the ISSUE lines above and rerun this validator after repair.";
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
    requireHostAgentReceipts: Boolean(options["strict-host-agents"]),
    minHostAgentReceipts: options["min-host-agent-receipts"],
    minAgentInvocations: options["min-agent-invocations"],
  };
}

function validateScopedAgentProducerReceiptsCli(rootDir = process.cwd(), options = {}) {
  const scope = normalizeWorkflowReceiptScope(options);
  const allReceipts = readWorkflowReceipts(rootDir);
  const scopedReceipts = allReceipts
    .filter((receipt) => workflowReceiptMatchesScope(receipt, scope))
    .filter((receipt) => receipt.__invalidJson || isProducerReceipt(receipt));
  const issues = [];
  const trustedHostAgentReceiptIds = new Set();
  const receiptBoundInvocationIds = new Set();
  const trustedSubjects = new Set();

  for (const receipt of scopedReceipts) {
    if (receipt.__invalidJson) {
      issues.push({
        code: "invalid-scoped-agent-producer-receipt",
        file: receipt.__file || "workflow receipt",
        message: `${receipt.__file || "workflow receipt"}: invalid JSON in scoped producer receipt`,
      });
      continue;
    }
    if (isRecoveryReceipt(receipt)) {
      issues.push({
        code: "recovery-receipt-not-producer-proof",
        file: receipt.__file || "workflow receipt",
        message: `${receipt.__file || receipt.receiptId}: recovery/reissue receipt is repair evidence only and cannot satisfy an active producer stage`,
      });
      continue;
    }

    const trust = validateWorkflowReceiptTrust(rootDir, receipt, { ...options, skipLedgerChain: true });
    for (const message of trust.issues) {
      issues.push({
        code: /artifact link manifest missing|artifact link missing/i.test(message)
          ? "missing-scoped-agent-producer-artifact-link"
          : "untrusted-scoped-agent-producer-receipt",
        file: receipt.__file,
        message: `${receipt.__file}: ${message}`,
      });
    }

    const hostIssues = isHostAgentReceipt(receipt)
      ? validateHostInvocationProof(rootDir, receipt)
      : [];
    issues.push(...hostIssues);

    if (receipt.status === "completed" && trust.issues.length === 0 && hostIssues.length === 0) {
      const subjectId = receipt.subjectId || receipt.agentId || receipt.skillId;
      if (subjectId) trustedSubjects.add(subjectId);
      if (isHostAgentReceipt(receipt)) {
        trustedHostAgentReceiptIds.add(receipt.receiptId || receipt.__file);
        const invocationId = receipt.hostInvocation?.invocationId || receipt.hostInvocation?.invocation_id;
        if (invocationId) receiptBoundInvocationIds.add(invocationId);
      }
    }
  }

  for (const subjectId of scope.subjectIds) {
    if (trustedSubjects.has(subjectId)) continue;
    issues.push({
      code: "missing-scoped-agent-producer-receipt",
      file: scopedReceiptFileHint(scope),
      expectedAgentId: subjectId,
      message: `${subjectId}: missing trusted scoped runtime receipt for ${scope.command || "requested command"}${scope.handoffId ? ` handoff ${scope.handoffId}` : ""}`,
    });
  }

  const minHostAgentReceipts = numberOrZero(options.minHostAgentReceipts ?? (options.requireHostAgentReceipts ? 1 : 0));
  const minAgentInvocations = numberOrZero(options.minAgentInvocations ?? 0);
  if (minHostAgentReceipts > 0 && trustedHostAgentReceiptIds.size < minHostAgentReceipts) {
    issues.push({
      code: "insufficient-scoped-host-agent-receipts",
      file: scopedReceiptFileHint(scope),
      message: `trusted scoped host-agent receipt coverage ${trustedHostAgentReceiptIds.size}/${minHostAgentReceipts}; run the required host agents for this command/handoff and issue runtime receipts`,
    });
  }
  if (minAgentInvocations > 0 && receiptBoundInvocationIds.size < minAgentInvocations) {
    issues.push({
      code: "insufficient-scoped-agent-telemetry",
      file: ".supervibe/memory/agent-invocations.jsonl",
      message: `scoped receipt-bound agent invocation telemetry ${receiptBoundInvocationIds.size}/${minAgentInvocations}; every required agent must have hostInvocation proof for this command/handoff`,
    });
  }

  const producerReceipts = scopedReceipts.filter((receipt) => !receipt.__invalidJson && isProducerReceipt(receipt) && !isRecoveryReceipt(receipt));
  return {
    pass: issues.length === 0,
    checked: scopedReceipts.length,
    receipts: scopedReceipts.length,
    producerReceipts: producerReceipts.length,
    hostAgentReceipts: producerReceipts.filter(isHostAgentReceipt).length,
    trustedHostAgentReceipts: trustedHostAgentReceiptIds.size,
    skillReceipts: producerReceipts.filter(isSkillProducerReceipt).length,
    agentReceipts: trustedHostAgentReceiptIds.size,
    agentInvocations: receiptBoundInvocationIds.size,
    loggedAgentInvocations: countLoggedAgentInvocations(rootDir),
    expectations: 0,
    scopeMode: "scoped",
    scope,
    batchingOptimization: "scoped-trust-fast-path",
    issues: dedupeIssues(issues),
  };
}

function isHostAgentReceipt(receipt = {}) {
  return HOST_AGENT_SUBJECT_TYPES.includes(String(receipt.subjectType || "").toLowerCase());
}

function isSkillProducerReceipt(receipt = {}) {
  return String(receipt.subjectType || "").toLowerCase() === "skill";
}

function isProducerReceipt(receipt = {}) {
  return isSkillProducerReceipt(receipt) || isHostAgentReceipt(receipt);
}

function isRecoveryReceipt(receipt = {}) {
  return Boolean(receipt?.recovery || receipt?.runtime?.recovery);
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : 0;
}

function countLoggedAgentInvocations(rootDir) {
  const logPath = join(rootDir, ".supervibe", "memory", "agent-invocations.jsonl");
  if (!existsSync(logPath)) return 0;
  return readFileSync(logPath, "utf8").split(/\r?\n/).filter(Boolean).length;
}

function scopedReceiptFileHint(scope = {}) {
  const commandPath = String(scope.command || "workflow").replace(/^\//, "") || "workflow";
  if (scope.handoffId) return `.supervibe/artifacts/_workflow-invocations/${commandPath}/${scope.handoffId}`;
  if (scope.workflowRunId) return `.supervibe/artifacts/_workflow-invocations/${commandPath}/${scope.workflowRunId}`;
  return `.supervibe/artifacts/_workflow-invocations/${commandPath}`;
}

function dedupeIssues(issues = []) {
  const seen = new Set();
  const out = [];
  for (const issue of issues) {
    const key = `${issue.code}:${issue.file}:${issue.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(issue);
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv);
  const roots = resolveCliRoots({ argv: process.argv.slice(2) });
  const result = hasScopedOptions(options)
    ? validateScopedAgentProducerReceiptsCli(roots.root, scopedOptionsFromCli(options))
    : validateAgentProducerReceipts(roots.root, {
        requireHostAgentReceipts: Boolean(options["strict-host-agents"]),
        minHostAgentReceipts: options["min-host-agent-receipts"],
        minAgentInvocations: options["min-agent-invocations"],
        secret: options.secret || null,
      });
  console.log(formatAgentProducerReceiptsReport(result));
  process.exit(result.pass ? 0 : 1);
}
