#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { parseArgs } from "node:util";

const REQUIRED_SECTIONS = Object.freeze([
  "Status",
  "Context",
  "Decision",
  "Alternatives",
  "Consequences",
  "Compatibility And Migration",
  "Rollback And Review",
  "Evidence",
]);

const PLACEHOLDER_PATTERNS = Object.freeze([
  /\bTBD\b/i,
  /<[^>\n]+>/,
  /\.\.\./,
  /\bto be decided\b/i,
]);

export function validateAdrArtifact(markdown) {
  const issues = [];
  if (!/^#\s+ADR:/im.test(markdown)) issues.push('format: missing "# ADR:" heading');
  for (const section of REQUIRED_SECTIONS) {
    if (!hasSection(markdown, section)) issues.push(`missing section: ${section}`);
  }

  const status = sectionBody(markdown, "Status");
  if (!/\b(proposed|accepted|superseded|rejected)\b/i.test(status)) {
    issues.push("status: expected proposed, accepted, superseded, or rejected");
  }

  const context = sectionBody(markdown, "Context");
  for (const term of ["constraint", "driver", "current", "problem"]) {
    if (!new RegExp(term, "i").test(context)) issues.push(`context: missing ${term}`);
  }

  const decision = sectionBody(markdown, "Decision");
  for (const term of ["decision", "because", "owner"]) {
    if (!new RegExp(term, "i").test(decision)) issues.push(`decision: missing ${term}`);
  }

  const alternatives = sectionBody(markdown, "Alternatives");
  if ((alternatives.match(/^[-*]\s+/gm) || []).length < 3) {
    issues.push("alternatives: expected at least 3 alternatives");
  }
  for (const term of ["benefit", "cost", "risk"]) {
    if (!new RegExp(term, "i").test(alternatives)) issues.push(`alternatives: missing ${term}`);
  }

  const consequences = sectionBody(markdown, "Consequences");
  for (const term of ["positive", "negative", "tradeoff"]) {
    if (!new RegExp(term, "i").test(consequences)) issues.push(`consequences: missing ${term}`);
  }

  const migration = sectionBody(markdown, "Compatibility And Migration");
  for (const term of ["compatibility", "migration", "consumer", "version"]) {
    if (!new RegExp(term, "i").test(migration)) issues.push(`compatibility and migration: missing ${term}`);
  }

  const rollback = sectionBody(markdown, "Rollback And Review");
  for (const term of ["rollback", "review date", "trigger", "owner"]) {
    if (!new RegExp(term, "i").test(rollback)) issues.push(`rollback and review: missing ${term}`);
  }

  const evidence = sectionBody(markdown, "Evidence");
  for (const term of ["source", "CodeGraph", "RAG", "verification"]) {
    if (!new RegExp(term, "i").test(evidence)) issues.push(`evidence: missing ${term}`);
  }

  if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(markdown))) {
    issues.push("placeholders: unresolved placeholder text found");
  }
  return issues;
}

export async function validateAdrFiles({ rootDir = process.cwd(), files = [] } = {}) {
  const results = [];
  for (const file of files) {
    const markdown = await readFile(file, "utf8");
    results.push({ file, issues: validateAdrArtifact(markdown) });
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
  node scripts/validate-adr-artifacts.mjs --file .supervibe/artifacts/specs/<adr>.md
  node scripts/validate-adr-artifacts.mjs --all
  node scripts/validate-adr-artifacts.mjs --fixture-dir tests/fixtures/artifacts/adrs`);
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
    : await filterMatchingHeading(discoveredFiles, /^#\s+ADR:/im);

  if (files.length === 0) {
    console.log("[validate-adr-artifacts] no ADR markdown files found; skipping");
    return;
  }

  const report = await validateAdrFiles({ rootDir: root, files });
  for (const result of report.results) {
    const rel = relative(root, result.file).split(sep).join("/");
    if (result.issues.length === 0) console.log(`OK   adr        ${rel}`);
    else {
      console.error(`FAIL adr        ${rel}`);
      for (const issue of result.issues) console.error(`  - ${issue}`);
    }
  }
  if (!report.pass) {
    console.error(`\n${report.results.filter((item) => item.issues.length > 0).length}/${report.results.length} ADR artifact(s) failed`);
    process.exit(1);
  }
  console.log(`\nAll ${report.results.length} ADR artifact(s) passed`);
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
if (isMain || process.argv[1]?.endsWith("validate-adr-artifacts.mjs")) {
  main().catch((error) => {
    console.error(error);
    process.exit(2);
  });
}
