#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { parseArgs } from "node:util";
import { normalizeSpecialistEvidenceRecord, validateSpecialistEvidenceRecord } from "./lib/supervibe-goals-contract.mjs";

export function normalizeSpecialistEvidenceContract(record = {}) {
  const source = isPlainObject(record) ? record : {};
  return {
    ...normalizeSpecialistEvidenceRecord(source),
    role: text(firstPresent(source.role, source.subjectType, source.subject_type)),
    invocationId: text(firstPresent(source.invocationId, source.invocation_id, source.agentId, source.agent_id)),
    receiptId: text(firstPresent(source.receiptId, source.receipt_id, source.workflowReceiptId, source.workflow_receipt_id)),
    outputArtifact: text(firstPresent(source.outputArtifact, source.output_artifact, source.artifact, source.artifactPath, source.artifact_path)),
    artifactHash: text(firstPresent(source.artifactHash, source.artifact_hash, source.hash, source.sha256)),
    confidence: numberOrNull(source.confidence),
    decisions: stringArray(source.decisions),
    risks: stringArray(source.risks),
    acceptanceMapping: array(firstPresent(source.acceptanceMapping, source.acceptance_mapping)).map(normalizeAcceptanceMapping),
    unresolvedGaps: stringArray(firstPresent(source.unresolvedGaps, source.unresolved_gaps, source.gaps)),
  };
}

export function validateSpecialistEvidenceContract(record = {}) {
  const normalized = normalizeSpecialistEvidenceContract(record);
  const issues = [];
  issues.push(...validateSpecialistEvidenceRecord(normalized, { path: "record" }).issues);
  requireSafeText(normalized.role, "specialist-evidence-role", "role", issues);
  if (!normalized.invocationId && !normalized.receiptId) add(issues, "specialist-evidence-proof-missing", "invocationId", "invocationId or receiptId is required");
  if (normalized.invocationId) requireSafeText(normalized.invocationId, "specialist-evidence-invocation-id", "invocationId", issues);
  requireSafeText(normalized.receiptId, "specialist-evidence-receipt-id", "receiptId", issues);
  requireSafeText(normalized.outputArtifact, "specialist-evidence-output-artifact", "outputArtifact", issues);
  requireSafeText(normalized.artifactHash, "specialist-evidence-artifact-hash", "artifactHash", issues);
  if (normalized.confidence === null) add(issues, "specialist-evidence-confidence-missing", "confidence", "confidence is required");
  else if (normalized.confidence < 8 || normalized.confidence > 10) add(issues, "specialist-evidence-confidence-low", "confidence", "confidence must be between 8 and 10");
  requireArrayIfPresent(normalized.decisions, "specialist-evidence-decisions", "decisions", issues);
  requireArrayIfPresent(normalized.risks, "specialist-evidence-risks", "risks", issues);
  if (!Object.hasOwn(record, "unresolvedGaps") && !Object.hasOwn(record, "unresolved_gaps") && !Object.hasOwn(record, "gaps")) add(issues, "specialist-evidence-unresolved-gaps-missing", "unresolvedGaps", "unresolvedGaps is required and may be empty");
  if (normalized.acceptanceMapping.length === 0) {
    add(issues, "specialist-evidence-acceptance-mapping-missing", "acceptanceMapping", "acceptance mapping is required");
  }
  for (const [index, mapping] of normalized.acceptanceMapping.entries()) {
    requireSafeText(mapping.criterionId, "specialist-evidence-acceptance-criterion-id", `acceptanceMapping[${index}].criterionId`, issues);
    requireSafeText(mapping.evidence, "specialist-evidence-acceptance-evidence", `acceptanceMapping[${index}].evidence`, issues);
  }
  return { pass: issues.length === 0, record: normalized, issues: dedupeIssues(issues) };
}

function normalizeAcceptanceMapping(record = {}) {
  const source = isPlainObject(record) ? record : {};
  return {
    criterionId: text(firstPresent(source.criterionId, source.criterion_id, source.acceptanceId, source.acceptance_id)),
    evidence: text(firstPresent(source.evidence, source.evidenceId, source.evidence_id, source.summary)),
  };
}

async function walkJson(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walkJson(path));
    else if (entry.name.endsWith(".json")) out.push(path);
  }
  return out.sort();
}

async function main() {
  const { values } = parseArgs({
    options: {
      file: { type: "string", short: "f", multiple: true },
      "fixture-dir": { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help) {
    console.log("Usage:\n  node scripts/validate-specialist-evidence.mjs --file evidence.json\n  node scripts/validate-specialist-evidence.mjs --fixture-dir tests/fixtures/specialist-evidence");
    return;
  }
  const root = process.cwd();
  const explicit = Array.isArray(values.file) ? values.file : values.file ? [values.file] : [];
  const files = explicit.length ? explicit : values["fixture-dir"] ? await walkJson(join(root, values["fixture-dir"])) : [];
  if (files.length === 0) {
    console.log("[validate-specialist-evidence] no specialist evidence records found; skipping");
    return;
  }
  const results = [];
  for (const file of files) {
    const result = validateSpecialistEvidenceContract(JSON.parse(await readFile(file, "utf8")));
    results.push({ file, ...result });
    printResult("specialist-evidence", root, file, result);
  }
  exitForResults(results, "specialist evidence record(s)");
}

function requireSafeText(value, codeBase, path, issues) {
  if (!value) add(issues, `${codeBase}-missing`, path, `${path} is required`);
  else if (!/^[\x09\x0a\x0d\x20-\x7e]+$/.test(value)) add(issues, `${codeBase}-invalid`, path, `${path} must be ASCII-safe text`);
}

function requireNonEmptyArray(value, codeBase, path, issues) {
  if (!Array.isArray(value) || value.length === 0) add(issues, `${codeBase}-missing`, path, `${path} must include at least one entry`);
}

function requireArrayIfPresent(value, codeBase, path, issues) {
  if (value === undefined) return;
  if (!Array.isArray(value)) add(issues, codeBase + "-invalid", path, path + " must be an array when provided");
}

function dedupeIssues(issues) {
  const seen = new Set();
  return issues.filter((issue) => {
    const key = `${issue.code}\0${issue.path}\0${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function printResult(label, root, file, result) {
  const rel = relative(root, file).split(sep).join("/");
  if (result.pass) console.log(`OK   ${label} ${rel}`);
  else {
    console.error(`FAIL ${label} ${rel}`);
    for (const issue of result.issues) console.error(`  - [${issue.code}] ${issue.path}: ${issue.message}`);
  }
}

function exitForResults(results, label) {
  const failed = results.filter((result) => !result.pass).length;
  if (failed > 0) {
    console.error(`\n${failed}/${results.length} ${label} failed`);
    process.exit(1);
  }
  console.log(`\nAll ${results.length} ${label} passed`);
}

function add(issues, code, path, message) {
  issues.push({ code, path, message });
}

function firstPresent(...values) {
  return values.find((value) => value !== undefined);
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function stringArray(value) {
  return array(value).map(text).filter(Boolean);
}

function text(value) {
  return String(value ?? "").trim();
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const isMain = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`;
if (isMain || process.argv[1]?.endsWith("validate-specialist-evidence.mjs")) {
  main().catch((error) => {
    console.error(error);
    process.exit(2);
  });
}
