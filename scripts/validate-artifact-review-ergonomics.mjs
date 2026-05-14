#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { parseArgs } from "node:util";

const REQUIRED_SECTIONS = Object.freeze([
  "Outcome Summary",
  "Pre-Artifact Summary",
  "Changed Artifacts",
  "Post-Artifact Summary",
  "Reviewer Decision",
  "Evidence",
  "Risks And Gaps",
  "Acceptance Mapping",
  "Next User Decision",
]);

const PLACEHOLDER_PATTERNS = Object.freeze([/\bTBD\b/i, /<[^>\n]+>/, /\.\.\./, /\blooks good\b/i, /\bto be decided\b/i]);

export function validateArtifactReviewErgonomics(source = "") {
  const text = String(source || "");
  const issues = [];
  if (!/^#\s+Artifact Review\b/im.test(text)) add(issues, "artifact-review-heading-missing", "heading", "artifact review heading is required");
  for (const section of REQUIRED_SECTIONS) {
    if (!hasSection(text, section)) add(issues, "artifact-review-section-missing", section, `missing section: ${section}`);
  }
  if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(text))) {
    add(issues, "artifact-review-placeholder", "record", "unresolved placeholder or weak review wording found");
  }
  if (/\bNEXT_STEP_HANDOFF\b/i.test(text)) {
    add(issues, "artifact-review-raw-handoff-leak", "record", "artifact review prose must not expose raw NEXT_STEP_HANDOFF blocks");
  }
  validateSummaryBody(text, "Pre-Artifact Summary", "artifact-review-pre-summary-missing", issues);
  validateSummaryBody(text, "Post-Artifact Summary", "artifact-review-post-summary-missing", issues);
  if (!/(?:^|\n)\s*-?\s*(?:Workflow receipt|Receipt)\s*:\s*`?[^`\s][^`\r\n]*`?/i.test(text)) {
    add(issues, "artifact-review-receipt-missing", "Evidence", "review evidence must include a workflow receipt id");
  }
  if (!/verification command\s*:\s*`?[^`\r\n]+`?/i.test(text)) {
    add(issues, "artifact-review-verification-command-missing", "Evidence", "review evidence must include a verification command");
  }
  if (!/artifact hash\s*:\s*`?(?:sha256:)?[A-Za-z0-9_.:-]+`?/i.test(text)) {
    add(issues, "artifact-review-hash-missing", "Evidence", "review evidence must include an artifact hash");
  }
  const confidence = /confidence\s*:\s*([0-9]+(?:\.[0-9]+)?)\s*\/\s*10/i.exec(text);
  if (!confidence) add(issues, "artifact-review-confidence-missing", "Reviewer Decision", "reviewer decision must include confidence out of 10");
  else if (Number(confidence[1]) < 8) add(issues, "artifact-review-confidence-low", "Reviewer Decision", "review confidence must be at least 8/10");
  if (!/\bVerdict\s*:\s*(pass|revise|block|stop)\b/i.test(text)) {
    add(issues, "artifact-review-verdict-missing", "Reviewer Decision", "reviewer decision must include pass, revise, block, or stop verdict");
  }
  if (bulletCount(sectionBody(text, "Next User Decision")) < 2) {
    add(issues, "artifact-review-next-decision-thin", "Next User Decision", "next user decision must expose at least two choices");
  }
  return { pass: issues.length === 0, record: { format: "markdown", sections: REQUIRED_SECTIONS.filter((section) => hasSection(text, section)) }, issues };
}

async function walkFiles(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walkFiles(path));
    else if (/\.(?:md|txt)$/i.test(entry.name)) out.push(path);
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
    console.log("Usage:\n  node scripts/validate-artifact-review-ergonomics.mjs --file review.md\n  node scripts/validate-artifact-review-ergonomics.mjs --fixture-dir tests/fixtures/artifact-reviews");
    return;
  }
  const root = process.cwd();
  const explicit = Array.isArray(values.file) ? values.file : values.file ? [values.file] : [];
  const files = explicit.length ? explicit : values["fixture-dir"] ? await walkFiles(join(root, values["fixture-dir"])) : [];
  if (files.length === 0) {
    console.log("[validate-artifact-review-ergonomics] no artifact review records found; skipping");
    return;
  }
  const results = [];
  for (const file of files) {
    const result = validateArtifactReviewErgonomics(await readFile(file, "utf8"));
    results.push({ file, ...result });
    printResult("artifact-review", root, file, result);
  }
  exitForResults(results, "artifact review record(s)");
}

function validateSummaryBody(markdown, section, code, issues) {
  const body = sectionBody(markdown, section);
  if (wordCount(body) < 10) {
    add(issues, code, section, `${section} must summarize the human decision context and artifact impact`);
  }
}

function wordCount(value) {
  return (String(value || "").match(/\b[0-9A-Za-z][0-9A-Za-z_.:-]*\b/g) || []).length;
}

function hasSection(markdown, section) {
  return new RegExp(`^##\\s+${escapeRegex(section)}\\s*$`, "im").test(markdown);
}

function sectionBody(markdown, section) {
  const match = new RegExp(`^##\\s+${escapeRegex(section)}\\s*$`, "im").exec(markdown);
  if (!match) return "";
  const rest = markdown.slice(match.index + match[0].length);
  const next = /^##\s+/im.exec(rest);
  return (next ? rest.slice(0, next.index) : rest).trim();
}

function bulletCount(text) {
  return (text.match(/^\s*[-*]\s+\S/gm) || []).length;
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

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const isMain = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`;
if (isMain || process.argv[1]?.endsWith("validate-artifact-review-ergonomics.mjs")) {
  main().catch((error) => {
    console.error(error);
    process.exit(2);
  });
}
