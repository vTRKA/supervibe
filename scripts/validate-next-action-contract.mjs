#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import { parseArgs } from "node:util";
import { normalizeChoiceRecord, validateChoiceRecord } from "./lib/supervibe-goals-contract.mjs";

export function normalizeNextActionContract(source = {}) {
  if (typeof source === "string") return { primaryUx: source.trim(), choices: [] };
  const record = isPlainObject(source) ? source : {};
  return {
    primaryUx: text(firstPresent(record.primaryUx, record.primaryUX, record.output, record.message, record.text, record.chatOutput)),
    resumeCursor: text(firstPresent(record.resumeCursor, record.resume_cursor, record.cursor)),
    nextCommand: text(firstPresent(record.nextCommand, record.next_command)),
    choices: array(firstPresent(record.choices, record.options)).map(normalizeChoiceRecord),
  };
}

export function validateNextActionContract(source = {}) {
  const record = normalizeNextActionContract(source);
  const issues = [];
  if (!record.primaryUx) add(issues, "next-action-primary-ux-missing", "primaryUx", "primary UX text is required");
  if (hasRawHandoffBeforeHumanDecision(record.primaryUx)) {
    add(issues, "next-action-raw-handoff-primary-ux", "primaryUx", "raw NEXT_STEP_HANDOFF must not be the primary user-facing UX");
  }
  if (!/(?:^|\n)\s*(?:Question:\s*)?Step\s+\d+\/\d+\s*:/i.test(record.primaryUx)) {
    add(issues, "next-action-step-question-missing", "primaryUx", "primary UX should include a concrete Step N/N question");
  }
  if (!record.resumeCursor) add(issues, "next-action-resume-cursor-missing", "resumeCursor", "resume cursor is required");
  else if (!safeId(record.resumeCursor)) add(issues, "next-action-resume-cursor-invalid", "resumeCursor", "resume cursor must be ASCII-safe");
  if (!Array.isArray(record.choices) || record.choices.length < 2) {
    add(issues, "next-action-choices-missing", "choices", "at least two stable choices are required");
  }
  for (const [index, choice] of record.choices.entries()) {
    issues.push(...validateChoiceRecord(choice, { path: `choices[${index}]` }).issues);
  }
  validateDuplicateChoiceIds(record.choices, issues);
  if (record.nextCommand && !/^\/[^\s/][^\r\n]*$/.test(record.nextCommand)) {
    add(issues, "next-action-command-invalid", "nextCommand", "next command must be a slash command when provided");
  }
  return { pass: issues.length === 0, record, issues };
}

export function validateWorkflowResponseUx(source = {}) {
  const result = validateNextActionContract(source);
  const record = result.record;
  const issues = [...result.issues];
  if (hasRawHandoffBeforeHumanDecision(record.primaryUx)) {
    addUnique(issues, "workflow-response-raw-handoff-primary-ux", "primaryUx", "workflow responses must lead with a human decision card or Step N/N question before machine handoff state");
  }
  if (!/(?:^|\n)\s*(?:Decision Card|Recommendation:|Question:\s*Step\s+\d+\/\d+|Step\s+\d+\/\d+)\b/i.test(record.primaryUx)) {
    addUnique(issues, "workflow-response-human-decision-missing", "primaryUx", "workflow response must present a human-first decision, recommendation, or next question");
  }
  return { pass: issues.length === 0, record, issues };
}

async function readInput(file) {
  const source = await readFile(file, "utf8");
  if (extname(file).toLowerCase() === ".json") return JSON.parse(source);
  return source;
}

async function walkFiles(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walkFiles(path));
    else if (/\.(?:json|txt|md)$/i.test(entry.name)) out.push(path);
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
    console.log("Usage:\n  node scripts/validate-next-action-contract.mjs --file next-action.json\n  node scripts/validate-next-action-contract.mjs --fixture-dir tests/fixtures/next-action");
    return;
  }
  const root = process.cwd();
  const explicit = Array.isArray(values.file) ? values.file : values.file ? [values.file] : [];
  const files = explicit.length ? explicit : values["fixture-dir"] ? await walkFiles(join(root, values["fixture-dir"])) : [];
  if (files.length === 0) {
    console.log("[validate-next-action-contract] no next action records found; skipping");
    return;
  }
  const results = [];
  for (const file of files) {
    const result = validateNextActionContract(await readInput(file));
    results.push({ file, ...result });
    printResult("next-action", root, file, result);
  }
  exitForResults(results, "next action record(s)");
}

function hasRawHandoffBeforeHumanDecision(value = "") {
  const text = String(value || "");
  const handoffIndex = text.search(/\bNEXT_STEP_HANDOFF\b/i);
  if (handoffIndex < 0) return false;
  const humanMarkers = [
    text.search(/(?:^|\n)\s*Decision Card\b/i),
    text.search(/(?:^|\n)\s*(?:Question:\s*)?Step\s+\d+\/\d+\s*:/i),
    text.search(/(?:^|\n)\s*Recommendation:/i),
  ].filter((index) => index >= 0);
  const firstHuman = humanMarkers.length ? Math.min(...humanMarkers) : -1;
  return firstHuman < 0 || handoffIndex <= firstHuman;
}

function addUnique(issues, code, path, message) {
  if (!issues.some((issue) => issue.code === code && issue.path === path)) add(issues, code, path, message);
}

function validateDuplicateChoiceIds(choices, issues) {
  const seen = new Set();
  for (const choice of choices || []) {
    if (!choice.id) continue;
    if (seen.has(choice.id)) add(issues, "next-action-choice-duplicate", "choices", `duplicate choice id ${choice.id}`);
    seen.add(choice.id);
  }
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

function text(value) {
  return String(value ?? "").trim();
}

function safeId(value) {
  return /^[\x21-\x7e]+$/.test(String(value || ""));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const isMain = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`;
if (isMain || process.argv[1]?.endsWith("validate-next-action-contract.mjs")) {
  main().catch((error) => {
    console.error(error);
    process.exit(2);
  });
}
