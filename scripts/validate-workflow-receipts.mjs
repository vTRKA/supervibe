#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  readWorkflowReceipts,
  validateScopedWorkflowReceipts,
  validateWorkflowReceipts,
  workflowReceiptMatchesScope,
} from "./lib/supervibe-workflow-receipt-runtime.mjs";
import {
  resolveCliRoots,
} from "./lib/supervibe-cli-roots.mjs";

const ARTIFACT_LINKS_FILE = "artifact-links.json";
const DURABLE_PROOF_SUBJECT_TYPES = new Set([
  "agent",
  "worker",
  "reviewer",
  "tool",
  "external-tool",
  "skill",
  "validator",
]);

export function formatWorkflowReceiptsReport(result) {
  const lines = [
    "SUPERVIBE_WORKFLOW_RECEIPTS",
    `PASS: ${result.pass}`,
    `CHECKED: ${result.checked}`,
    `RECEIPTS: ${result.receipts}`,
    `LEDGER_ENTRIES: ${result.ledgerEntries ?? "scope-skipped"}`,
    `COVERAGE_STATUS: ${coverageStatus(result)}`,
    `PROOF_PROJECTION_GATE: ${proofProjectionGateStatus(result)}`,
    `ISSUES: ${result.issues.length}`,
    `DIAGNOSTICS: ${(result.diagnostics || []).length}`,
  ];
  if (result.scopeMode === "scoped") {
    lines.splice(1, 0, "SCOPE: scoped");
    lines.push(`INDEX_MODE: ${result.indexMode || "unknown"}`);
    lines.push(`BATCHING_OPTIMIZATION: ${result.batchingOptimization || "scoped-trust-fast-path"}`);
  }
  if (!result.pass) {
    lines.push(`NEXT_SAFE_ACTION: ${result.nextRepairCommand || "node scripts/workflow-receipt.mjs recovery-status"}`);
  }
  for (const issue of result.issues) {
    lines.push(`ISSUE: ${issue.code} ${issue.file} - ${issue.message}`);
  }
  for (const diagnostic of result.diagnostics || []) {
    lines.push(`DIAGNOSTIC: ${diagnostic.code} ${diagnostic.file} - ${diagnostic.message}`);
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

function proofProjectionGateStatus(result = {}) {
  const gate = result.proofProjectionGate;
  if (!gate) return "not-run";
  if (gate.checked === 0) return "no-durable-claims";
  return gate.pass ? `pass:${gate.checked}` : `fail:${gate.issues}`;
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
  const scopedOptions = scopedOptionsFromCli(options);
  const scoped = hasScopedOptions(options);
  const result = scoped
    ? validateScopedWorkflowReceipts(roots.root, scopedOptions)
    : validateWorkflowReceipts(roots.root, { secret: options.secret || null });
  applyProofProjectionGate(result, roots.root, scoped ? scopedOptions : null);
  console.log(formatWorkflowReceiptsReport(result));
  process.exit(result.pass ? 0 : 1);
}

export function applyProofProjectionGate(result, rootDir = process.cwd(), scopeOptions = null) {
  const receipts = readWorkflowReceipts(rootDir)
    .filter((receipt) => !receipt.__invalidJson)
    .filter((receipt) => scopeOptions ? workflowReceiptMatchesScope(receipt, scopeOptions) : true)
    .filter(isDurableCompletedClaimReceipt);
  const issues = [];

  for (const receipt of receipts) {
    if (hasTrustedProofProjection(receipt) || hasEquivalentOutputBinding(rootDir, receipt)) continue;
    issues.push({
      code: "missing-durable-proof-projection",
      file: receipt.__file || "workflow receipt",
      message: `${receipt.__file || receipt.receiptId}: completed durable ${receipt.subjectType} claim requires trusted proof projection metadata or receipt-bound output artifact link`,
    });
  }

  result.proofProjectionGate = {
    pass: issues.length === 0,
    checked: receipts.length,
    issues: issues.length,
  };
  if (issues.length > 0) {
    result.pass = false;
    result.issues.push(...issues);
    result.nextRepairCommand = result.nextRepairCommand || "node scripts/workflow-receipt.mjs recovery-status";
  }
  return result;
}

function isDurableCompletedClaimReceipt(receipt = {}) {
  if (receipt.status !== "completed") return false;
  if (receipt.recovery || receipt.runtime?.recovery) return false;
  return DURABLE_PROOF_SUBJECT_TYPES.has(String(receipt.subjectType || "").toLowerCase());
}

function hasTrustedProofProjection(receipt = {}) {
  const projections = [
    receipt.proofProjection,
    receipt.proof_projection,
    ...(Array.isArray(receipt.proofProjections) ? receipt.proofProjections : []),
    ...(Array.isArray(receipt.proof_projections) ? receipt.proof_projections : []),
  ].filter(isPlainObject);
  if (projections.length === 0) return false;

  const outputs = new Set([
    ...(Array.isArray(receipt.outputArtifacts) ? receipt.outputArtifacts : []),
    ...(Array.isArray(receipt.outputHashes) ? receipt.outputHashes.map((item) => item?.path) : []),
  ].map(normalizeRelPath).filter(Boolean));
  return projections.some((projection) => {
    if (projection.schemaVersion !== "ProofProjectionV1") return false;
    if (projection.trustStatus !== "trusted") return false;
    if (projection.receiptId && projection.receiptId !== receipt.receiptId) return false;
    if (projection.provenance?.receiptId && projection.provenance.receiptId !== receipt.receiptId) return false;
    const artifactPath = normalizeRelPath(projection.artifactPath);
    return artifactPath && outputs.has(artifactPath);
  });
}

function hasEquivalentOutputBinding(rootDir, receipt = {}) {
  const hashes = Array.isArray(receipt.outputHashes) ? receipt.outputHashes : [];
  if (hashes.length === 0) return false;
  return hashes.every((output) => {
    const relPath = normalizeRelPath(output?.path);
    if (!relPath || output.exists !== true || !output.sha256) return false;
    if (!existsSync(join(rootDir, ...relPath.split("/")))) return false;
    const link = findArtifactLink(rootDir, receipt, relPath);
    return Boolean(link)
      && link.receiptId === receipt.receiptId
      && normalizeRelPath(link.artifactPath) === relPath
      && link.sha256 === output.sha256;
  });
}

function findArtifactLink(rootDir, receipt = {}, artifactPath = "") {
  if (!receipt.__file) return null;
  const manifestPath = join(rootDir, ...dirname(receipt.__file).split("/"), ARTIFACT_LINKS_FILE);
  const manifest = readJson(manifestPath);
  if (!manifest || !Array.isArray(manifest.links)) return null;
  return manifest.links.find((link) => {
    return normalizeRelPath(link.artifactPath) === artifactPath
      && link.receiptId === receipt.receiptId;
  }) || null;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeRelPath(path) {
  return String(path ?? "").split(sep).join("/").replace(/^\.\//, "");
}
