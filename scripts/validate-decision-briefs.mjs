#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { parseArgs } from "node:util";

const REQUIRED_SECTIONS = Object.freeze([
  "Executive Summary",
  "User Decision",
  "Visual Explanation",
  "Options",
  "Risk And Tradeoff Summary",
  "Implementation Snapshot",
  "Next User Actions",
  "Acceptance And Evidence",
]);

const PLACEHOLDER_PATTERNS = Object.freeze([
  /\bTBD\b/i,
  /<[^>\n]+>/,
  /\.\.\./,
  /\bto be decided\b/i,
]);

function hasSection(markdown, section) {
  return new RegExp(`^##\\s+${escapeRegex(section)}\\s*$`, "im").test(markdown);
}

function sectionBody(markdown, section) {
  const re = new RegExp(`^##\\s+${escapeRegex(section)}\\s*$`, "im");
  const match = re.exec(markdown);
  if (!match) return "";
  const start = match.index + match[0].length;
  const rest = markdown.slice(start);
  const next = /^##\s+/im.exec(rest);
  return (next ? rest.slice(0, next.index) : rest).trim();
}

function countCheckedActions(body) {
  return body.split(/\r?\n/).filter((line) => /^\s*-\s+\[[ xX]\]\s+\S/.test(line)).length;
}

function hasVisualEvidence(body) {
  const text = String(body || "");
  const fallback = /\b(text\s+fallback|fallback)\b/i.test(text);
  const browserFirst = /\b(browser-first|preview|visual\s+packet|table-only)\b/i.test(text) && fallback;
  const mermaidFallback = /\bMermaid\b/i.test(text) && /accTitle/i.test(text) && /accDescr/i.test(text) && fallback;
  return browserFirst || mermaidFallback;
}

export function validateDecisionBrief(markdown) {
  const issues = [];
  if (!/^#\s+Decision Brief:/im.test(markdown)) {
    issues.push('format: missing "# Decision Brief:" heading');
  }
  for (const section of REQUIRED_SECTIONS) {
    if (!hasSection(markdown, section)) issues.push(`missing section: ${section}`);
  }

  const summary = sectionBody(markdown, "Executive Summary");
  for (const term of ["Plain-language outcome", "Recommended action", "Confidence", "Main reason"]) {
    if (!new RegExp(escapeRegex(term), "i").test(summary)) issues.push(`executive summary: missing ${term}`);
  }

  const decision = sectionBody(markdown, "User Decision");
  for (const choice of ["Continue", "Revise", "Defer", "Stop"]) {
    if (!new RegExp(`\\b${choice}\\b`, "i").test(decision)) issues.push(`user decision: missing ${choice}`);
  }

  const visual = sectionBody(markdown, "Visual Explanation");
  if (!hasVisualEvidence(visual)) {
    issues.push("visual explanation: missing browser-first visual packet or accessible Mermaid fallback");
  }

  const options = sectionBody(markdown, "Options");
  if (!/\|\s*Option\s*\|\s*Benefit\s*\|\s*Cost\s*\|\s*Risk\s*\|(?:\s*Reversibility\s*\|)?\s*Recommendation\s*\|/i.test(options)) {
    issues.push("options: missing benefit/cost/risk/recommendation table");
  }

  const risk = sectionBody(markdown, "Risk And Tradeoff Summary");
  for (const term of ["Highest risk", "Mitigation", "Scope tradeoff", "Rollback path"]) {
    if (!new RegExp(escapeRegex(term), "i").test(risk)) issues.push(`risk summary: missing ${term}`);
  }

  const snapshot = sectionBody(markdown, "Implementation Snapshot");
  for (const term of ["Architecture impact", "API contract impact", "Frontend integration impact", "Data and privacy impact", "Task tracker impact"]) {
    if (!new RegExp(escapeRegex(term), "i").test(snapshot)) issues.push(`implementation snapshot: missing ${term}`);
  }

  const actions = sectionBody(markdown, "Next User Actions");
  if (countCheckedActions(actions) < 4) issues.push("next user actions: expected at least 4 checkbox choices");
  for (const action of ["Continue", "Revise", "Defer", "Stop"]) {
    if (!new RegExp(`\\b${action}\\b`, "i").test(actions)) issues.push(`next user actions: missing ${action}`);
  }

  const evidence = sectionBody(markdown, "Acceptance And Evidence");
  for (const term of ["10/10", "Verification evidence", "Source citations", "Open blockers"]) {
    if (!new RegExp(escapeRegex(term), "i").test(evidence)) issues.push(`acceptance and evidence: missing ${term}`);
  }

  if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(markdown))) {
    issues.push("placeholders: unresolved placeholder text found");
  }
  return issues;
}

async function walkMarkdown(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walkMarkdown(path));
    else if (entry.name.endsWith(".md")) out.push(path);
  }
  return out;
}

export async function validateDecisionBriefFiles({ rootDir = process.cwd(), files = [] } = {}) {
  const results = [];
  for (const file of files) {
    const markdown = await readFile(file, "utf8");
    results.push({ file, issues: validateDecisionBrief(markdown) });
  }
  return {
    pass: results.every((result) => result.issues.length === 0),
    results,
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      file: { type: "string", short: "f" },
      all: { type: "boolean", default: false },
      "fixture-dir": { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    console.log(`Usage:
  node scripts/validate-decision-briefs.mjs --file .supervibe/artifacts/decision-briefs/<brief>.md
  node scripts/validate-decision-briefs.mjs --all
  node scripts/validate-decision-briefs.mjs --fixture-dir tests/fixtures/artifacts/decision-briefs`);
    return;
  }

  const root = process.cwd();
  const files = values.file
    ? [values.file]
    : values["fixture-dir"]
      ? await walkMarkdown(join(root, values["fixture-dir"]))
      : await walkMarkdown(join(root, ".supervibe", "artifacts", "decision-briefs"));

  if (files.length === 0) {
    console.log("[validate-decision-briefs] no decision brief markdown files found; skipping");
    return;
  }

  const report = await validateDecisionBriefFiles({ rootDir: root, files });
  for (const result of report.results) {
    const rel = relative(root, result.file).split(sep).join("/");
    if (result.issues.length === 0) {
      console.log(`OK   decision-brief ${rel}`);
    } else {
      console.error(`FAIL decision-brief ${rel}`);
      for (const issue of result.issues) console.error(`  - ${issue}`);
    }
  }
  if (!report.pass) {
    console.error(`\n${report.results.filter((item) => item.issues.length > 0).length}/${report.results.length} decision brief artifact(s) failed`);
    process.exit(1);
  }
  console.log(`\nAll ${report.results.length} decision brief artifact(s) passed`);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const isMain = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`;
if (isMain || process.argv[1]?.endsWith("validate-decision-briefs.mjs")) {
  main().catch((error) => {
    console.error(error);
    process.exit(2);
  });
}
