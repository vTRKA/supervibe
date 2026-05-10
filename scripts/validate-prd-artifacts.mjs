#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { parseArgs } from "node:util";

const REQUIRED_SECTIONS = Object.freeze([
  "Problem Statement",
  "Users And Jobs",
  "Goals And Non-Goals",
  "Scope",
  "User Stories",
  "Requirements",
  "Success Metrics",
  "Data And Privacy",
  "Risks And Open Questions",
  "Launch And Readiness",
  "Acceptance And Evidence",
]);

const PLACEHOLDER_PATTERNS = Object.freeze([
  /\bTBD\b/i,
  /<[^>\n]+>/,
  /\.\.\./,
  /\bto be decided\b/i,
  /\bfill (?:this )?in\b/i,
]);

export function validatePrdArtifact(markdown) {
  const issues = [];
  if (!/^#\s+PRD:/im.test(markdown)) issues.push('format: missing "# PRD:" heading');
  for (const section of REQUIRED_SECTIONS) {
    if (!hasSection(markdown, section)) issues.push(`missing section: ${section}`);
  }

  const problem = sectionBody(markdown, "Problem Statement");
  for (const term of ["problem", "user", "impact", "current workaround"]) {
    if (!new RegExp(term, "i").test(problem)) issues.push(`problem statement: missing ${term}`);
  }

  const users = sectionBody(markdown, "Users And Jobs");
  if (countListItems(users) < 2) issues.push("users and jobs: expected at least 2 user/job entries");

  const scope = sectionBody(markdown, "Scope");
  for (const term of ["included", "deferred", "rejected", "tradeoff"]) {
    if (!new RegExp(term, "i").test(scope)) issues.push(`scope: missing ${term}`);
  }

  const requirements = sectionBody(markdown, "Requirements");
  if (countListItems(requirements) < 3) issues.push("requirements: expected at least 3 requirements");
  for (const term of ["behavior", "data", "contract"]) {
    if (!new RegExp(term, "i").test(requirements)) issues.push(`requirements: missing ${term}`);
  }

  const metrics = sectionBody(markdown, "Success Metrics");
  if (!/\b\d+\s*(%|ms|s|min|h|days?|users?|requests?|errors?|tasks?)\b/i.test(metrics) && !/[<>]=?\s*\d+/.test(metrics)) {
    issues.push("success metrics: expected at least one measurable threshold");
  }

  const privacy = sectionBody(markdown, "Data And Privacy");
  for (const term of ["PII", "permission", "redaction", "retention"]) {
    if (!new RegExp(term, "i").test(privacy)) issues.push(`data and privacy: missing ${term}`);
  }

  const launch = sectionBody(markdown, "Launch And Readiness");
  for (const term of ["test", "rollout", "rollback", "support", "observability"]) {
    if (!new RegExp(term, "i").test(launch)) issues.push(`launch and readiness: missing ${term}`);
  }

  const evidence = sectionBody(markdown, "Acceptance And Evidence");
  for (const term of ["10/10", "verification", "source", "blocker"]) {
    if (!new RegExp(term.replace("/", "\\/"), "i").test(evidence)) issues.push(`acceptance and evidence: missing ${term}`);
  }

  if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(markdown))) {
    issues.push("placeholders: unresolved placeholder text found");
  }
  return issues;
}

export async function validatePrdFiles({ rootDir = process.cwd(), files = [] } = {}) {
  const results = [];
  for (const file of files) {
    const markdown = await readFile(file, "utf8");
    results.push({ file, issues: validatePrdArtifact(markdown) });
  }
  return { pass: results.every((result) => result.issues.length === 0), results };
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
  node scripts/validate-prd-artifacts.mjs --file .supervibe/artifacts/specs/<prd>.md
  node scripts/validate-prd-artifacts.mjs --all
  node scripts/validate-prd-artifacts.mjs --fixture-dir tests/fixtures/artifacts/prds`);
    return;
  }

  const root = process.cwd();
  const discoveredFiles = values.file
    ? [values.file]
    : values["fixture-dir"]
      ? await walkMarkdown(join(root, values["fixture-dir"]))
      : await walkMarkdown(join(root, ".supervibe", "artifacts", "specs"));
  const files = values.file || values["fixture-dir"]
    ? discoveredFiles
    : await filterMatchingHeading(discoveredFiles, /^#\s+PRD:/im);

  if (files.length === 0) {
    console.log("[validate-prd-artifacts] no PRD markdown files found; skipping");
    return;
  }

  const report = await validatePrdFiles({ rootDir: root, files });
  for (const result of report.results) {
    const rel = relative(root, result.file).split(sep).join("/");
    if (result.issues.length === 0) console.log(`OK   prd        ${rel}`);
    else {
      console.error(`FAIL prd        ${rel}`);
      for (const issue of result.issues) console.error(`  - ${issue}`);
    }
  }
  if (!report.pass) {
    console.error(`\n${report.results.filter((item) => item.issues.length > 0).length}/${report.results.length} PRD artifact(s) failed`);
    process.exit(1);
  }
  console.log(`\nAll ${report.results.length} PRD artifact(s) passed`);
}

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

function countListItems(body) {
  return body.split(/\r?\n/).filter((line) => /^\s*[-*]\s+\S/.test(line)).length;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function filterMatchingHeading(files, headingRe) {
  const out = [];
  for (const file of files) {
    const markdown = await readFile(file, "utf8");
    if (headingRe.test(markdown)) out.push(file);
  }
  return out;
}

const isMain = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`;
if (isMain || process.argv[1]?.endsWith("validate-prd-artifacts.mjs")) {
  main().catch((error) => {
    console.error(error);
    process.exit(2);
  });
}
