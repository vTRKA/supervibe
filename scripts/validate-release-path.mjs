#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { parseArgs } from "node:util";
import {
  normalizeWorkflowEvent,
  normalizeWorkflowState,
  validateProductionReleasePath,
  validateWorkflowEvent,
  validateWorkflowState,
} from "./lib/supervibe-release-path.mjs";

export function validateReleasePathContract(record = {}, options = {}) {
  const stateLike = isWorkflowState(record);
  const normalized = stateLike ? normalizeWorkflowState(record) : normalizeWorkflowEvent(record);
  const base = stateLike ? validateWorkflowState(record, options) : validateWorkflowEvent(record, options);
  const production = stateLike
    ? validateProductionReleasePath(normalized, { ...options, validateState: false })
    : { issues: [] };
  const issues = [...base.issues, ...production.issues];
  if (stateLike) validateStateReleasePath(normalized, issues);
  return { pass: issues.length === 0, record: normalized, issues: dedupeIssues(issues) };
}

function validateStateReleasePath(state, issues) {
  const evidenceIds = new Set(Object.keys(state.evidence || {}));
  if (evidenceIds.size === 0) {
    add(issues, "release-path-receipt-evidence-missing", "evidence", "release path must include receipt-backed evidence");
  }
  const receiptEvidence = Object.values(state.evidence || {}).filter((entry) => /receipt/i.test(entry.kind || entry.path || entry.id || ""));
  if (receiptEvidence.length === 0) {
    add(issues, "release-path-receipt-evidence-missing", "evidence", "release path evidence must include at least one receipt entry");
  }
  for (const ref of collectEvidenceRefs(state)) {
    if (!evidenceIds.has(ref.id)) {
      add(issues, "release-path-evidence-reference-missing", ref.path, `evidence id ${ref.id} is referenced but not present in evidence map`);
    }
  }
  if (["verify", "review", "ship"].includes(state.stage)) {
    if (!state.artifactManifest?.artifacts?.length) add(issues, "release-path-artifacts-missing", "artifactManifest.artifacts", "verify/review/ship stages require at least one output artifact");
    if (!state.summaries?.length) add(issues, "release-path-summary-missing", "summaries", "verify/review/ship stages require at least one stage summary");
  }
  if (state.stage === "ship" && !state.approvals?.length) {
    add(issues, "release-path-approval-missing", "approvals", "ship stage requires an approval record");
  }
}

function collectEvidenceRefs(state) {
  const refs = [];
  collectFromRecords(state.goals, "goals", refs);
  for (const [goalIndex, goal] of (state.goals || []).entries()) {
    collectFromRecords(goal.acceptanceCriteria, `goals[${goalIndex}].acceptanceCriteria`, refs);
  }
  collectFromRecords(state.answerHistory, "answerHistory", refs);
  collectFromRecords(state.approvals, "approvals", refs);
  collectFromRecords(state.waivers, "waivers", refs);
  collectFromRecords(state.summaries, "summaries", refs);
  collectFromRecords(state.specialistEvidence, "specialistEvidence", refs);
  collectFromRecords(state.events, "events", refs);
  collectFromRecords(state.artifactManifest?.artifacts, "artifactManifest.artifacts", refs);
  return refs;
}

function collectFromRecords(records, path, refs) {
  for (const [index, record] of (records || []).entries()) {
    for (const id of record.evidenceIds || []) refs.push({ id, path: `${path}[${index}].evidenceIds` });
  }
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
    console.log("Usage:\n  node scripts/validate-release-path.mjs --file workflow-state.json\n  node scripts/validate-release-path.mjs --fixture-dir tests/fixtures/release-path");
    return;
  }
  const root = process.cwd();
  const explicit = Array.isArray(values.file) ? values.file : values.file ? [values.file] : [];
  const files = explicit.length ? explicit : values["fixture-dir"] ? await walkJson(join(root, values["fixture-dir"])) : [];
  if (files.length === 0) {
    console.log("[validate-release-path] no release path records found; skipping");
    return;
  }
  const results = [];
  for (const file of files) {
    const result = validateReleasePathContract(JSON.parse(await readFile(file, "utf8")));
    results.push({ file, ...result });
    printResult("release-path", root, file, result);
  }
  exitForResults(results, "release path record(s)");
}

function isWorkflowState(record) {
  return Boolean(record && typeof record === "object" && (record.goals || record.command || record.workflowRunId || record.workflow_run_id || record.nextAction || record.next_action));
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

const isMain = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`;
if (isMain || process.argv[1]?.endsWith("validate-release-path.mjs")) {
  main().catch((error) => {
    console.error(error);
    process.exit(2);
  });
}
