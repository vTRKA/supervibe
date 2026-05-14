#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { parseArgs } from "node:util";
import {
  normalizeApprovalRecord,
  normalizeArtifactManifest,
  normalizeEvidenceMap,
  normalizeGoal,
  normalizeQuestionRecord,
  normalizeSpecialistEvidenceRecord,
  normalizeStageSummaryRecord,
  normalizeWaiverRecord,
  validateApprovalRecord,
  validateArtifactManifest,
  validateEvidenceMap,
  validateGoal,
  validateQuestionRecord,
  validateSpecialistEvidenceRecord,
  validateStageSummaryRecord,
  validateWaiverRecord,
} from "./lib/supervibe-goals-contract.mjs";

export function normalizeGoalsContractRecord(record = {}) {
  const source = isPlainObject(record) ? record : {};
  return {
    goals: array(source.goals).map(normalizeGoal),
    questions: array(firstPresent(source.questions, source.questionRecords)).map(normalizeQuestionRecord),
    approvals: array(source.approvals).map(normalizeApprovalRecord),
    waivers: array(source.waivers).map(normalizeWaiverRecord),
    evidence: normalizeEvidenceMap(firstPresent(source.evidence, source.evidenceMap, source.evidence_map)),
    artifactManifest: normalizeArtifactManifest(firstPresent(source.artifactManifest, source.artifact_manifest, { artifacts: source.artifacts })),
    summaries: array(firstPresent(source.summaries, source.stageSummaries, source.stage_summaries)).map(normalizeStageSummaryRecord),
    specialistEvidence: array(firstPresent(source.specialistEvidence, source.specialist_evidence)).map(normalizeSpecialistEvidenceRecord),
  };
}

export function validateGoalsContractRecord(record = {}, options = {}) {
  const issues = [];
  const normalized = normalizeGoalsContractRecord(record);
  if (!isPlainObject(record)) add(issues, "goals-contract-record-invalid", "record", "goals contract record must be an object");
  if (normalized.goals.length === 0) add(issues, "goals-contract-goals-missing", "goals", "at least one goal is required");
  appendNestedIssues(issues, normalized.goals, validateGoal, "goals", options);
  appendNestedIssues(issues, normalized.questions, validateQuestionRecord, "questions", options);
  appendNestedIssues(issues, normalized.approvals, validateApprovalRecord, "approvals", options);
  appendNestedIssues(issues, normalized.waivers, validateWaiverRecord, "waivers", options);
  issues.push(...validateEvidenceMap(normalized.evidence, { ...options, path: "evidence" }).issues);
  if (hasArtifactManifest(record)) {
    issues.push(...validateArtifactManifest(normalized.artifactManifest, { ...options, path: "artifactManifest" }).issues);
  }
  appendNestedIssues(issues, normalized.summaries, validateStageSummaryRecord, "summaries", options);
  appendNestedIssues(issues, normalized.specialistEvidence, validateSpecialistEvidenceRecord, "specialistEvidence", options);
  validateDuplicateIds(normalized.goals, "goals-contract-goal-duplicate", "goals", issues);
  validateDuplicateIds(normalized.questions, "goals-contract-question-duplicate", "questions", issues);
  return { pass: issues.length === 0, record: normalized, issues };
}

function appendNestedIssues(issues, records, validator, path, options = {}) {
  for (const [index, item] of records.entries()) {
    issues.push(...validator(item, { ...options, path: `${path}[${index}]` }).issues);
  }
}

function validateDuplicateIds(records, code, path, issues) {
  const seen = new Set();
  for (const record of records) {
    if (!record.id) continue;
    if (seen.has(record.id)) add(issues, code, path, `duplicate id ${record.id}`);
    seen.add(record.id);
  }
}

function hasArtifactManifest(record) {
  return Boolean(record?.artifactManifest || record?.artifact_manifest || record?.artifacts);
}

async function readRecord(file) {
  const text = await readFile(file, "utf8");
  return JSON.parse(text);
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
    console.log("Usage:\n  node scripts/validate-goals-contract.mjs --file record.json\n  node scripts/validate-goals-contract.mjs --fixture-dir tests/fixtures/goals-contract");
    return;
  }
  const root = process.cwd();
  const explicit = Array.isArray(values.file) ? values.file : values.file ? [values.file] : [];
  const files = explicit.length ? explicit : values["fixture-dir"] ? await walkJson(join(root, values["fixture-dir"])) : [];
  if (files.length === 0) {
    console.log("[validate-goals-contract] no goals contract records found; skipping");
    return;
  }
  const results = [];
  for (const file of files) {
    const result = validateGoalsContractRecord(await readRecord(file));
    results.push({ file, ...result });
    printResult("goals-contract", root, file, result);
  }
  exitForResults(results, "goals contract record(s)");
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

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const isMain = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`;
if (isMain || process.argv[1]?.endsWith("validate-goals-contract.mjs")) {
  main().catch((error) => {
    console.error(error);
    process.exit(2);
  });
}
