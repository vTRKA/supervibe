#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { parseArgs } from "node:util";

const REQUIRED_SECTIONS = Object.freeze([
  "Summary",
  "Motivation",
  "Proposal",
  "Contracts",
  "Compatibility And Migration",
  "Rollout And Rollback",
  "Verification Plan",
  "Security Privacy Observability",
  "Open Questions",
]);

const PLACEHOLDER_PATTERNS = Object.freeze([
  /\bTBD\b/i,
  /<[^>\n]+>/,
  /\.\.\./,
  /\bto be decided\b/i,
]);

export function validateRfcArtifact(markdown) {
  const issues = [];
  if (!/^#\s+RFC:/im.test(markdown)) issues.push('format: missing "# RFC:" heading');
  for (const section of REQUIRED_SECTIONS) {
    if (!hasSection(markdown, section)) issues.push(`missing section: ${section}`);
  }

  const summary = sectionBody(markdown, "Summary");
  for (const term of ["owner", "status", "outcome"]) {
    if (!new RegExp(term, "i").test(summary)) issues.push(`summary: missing ${term}`);
  }

  const proposal = sectionBody(markdown, "Proposal");
  for (const term of ["architecture", "data", "API", "failure mode"]) {
    if (!new RegExp(term, "i").test(proposal)) issues.push(`proposal: missing ${term}`);
  }

  const contracts = sectionBody(markdown, "Contracts");
  for (const term of ["schema", "event", "error", "permission", "observability"]) {
    if (!new RegExp(term, "i").test(contracts)) issues.push(`contracts: missing ${term}`);
  }

  const migration = sectionBody(markdown, "Compatibility And Migration");
  for (const term of ["backward compatibility", "migration", "version", "consumer"]) {
    if (!new RegExp(term, "i").test(migration)) issues.push(`compatibility and migration: missing ${term}`);
  }

  const rollout = sectionBody(markdown, "Rollout And Rollback");
  for (const term of ["rollout", "rollback", "flag", "owner", "stop"]) {
    if (!new RegExp(term, "i").test(rollout)) issues.push(`rollout and rollback: missing ${term}`);
  }

  const verification = sectionBody(markdown, "Verification Plan");
  for (const term of ["unit", "integration", "contract", "performance", "security"]) {
    if (!new RegExp(term, "i").test(verification)) issues.push(`verification plan: missing ${term}`);
  }

  const spo = sectionBody(markdown, "Security Privacy Observability");
  for (const term of ["PII", "secret", "metric", "alert", "trace"]) {
    if (!new RegExp(term, "i").test(spo)) issues.push(`security privacy observability: missing ${term}`);
  }

  if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(markdown))) {
    issues.push("placeholders: unresolved placeholder text found");
  }
  return issues;
}

export async function validateRfcFiles({ rootDir = process.cwd(), files = [] } = {}) {
  const results = [];
  for (const file of files) {
    const markdown = await readFile(file, "utf8");
    results.push({ file, issues: validateRfcArtifact(markdown) });
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
  node scripts/validate-rfc-artifacts.mjs --file .supervibe/artifacts/specs/<rfc>.md
  node scripts/validate-rfc-artifacts.mjs --all
  node scripts/validate-rfc-artifacts.mjs --fixture-dir tests/fixtures/artifacts/rfcs`);
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
    : await filterMatchingHeading(discoveredFiles, /^#\s+RFC:/im);

  if (files.length === 0) {
    console.log("[validate-rfc-artifacts] no RFC markdown files found; skipping");
    return;
  }

  const report = await validateRfcFiles({ rootDir: root, files });
  for (const result of report.results) {
    const rel = relative(root, result.file).split(sep).join("/");
    if (result.issues.length === 0) console.log(`OK   rfc        ${rel}`);
    else {
      console.error(`FAIL rfc        ${rel}`);
      for (const issue of result.issues) console.error(`  - ${issue}`);
    }
  }
  if (!report.pass) {
    console.error(`\n${report.results.filter((item) => item.issues.length > 0).length}/${report.results.length} RFC artifact(s) failed`);
    process.exit(1);
  }
  console.log(`\nAll ${report.results.length} RFC artifact(s) passed`);
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
if (isMain || process.argv[1]?.endsWith("validate-rfc-artifacts.mjs")) {
  main().catch((error) => {
    console.error(error);
    process.exit(2);
  });
}
