#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { parseArgs } from "node:util";

const PLACEHOLDER_PATTERNS = Object.freeze([
  /\bTBD\b/i,
  /\.\.\./,
  /\bto be decided\b/i,
]);

function hasMermaid(text) {
  return /```mermaid|class=["']?mermaid\b|\bMermaid\b/i.test(text);
}

function hasBrowserFirstMode(text) {
  return /\b(browser-first|visual\s+packet|preview\s+(?:url|path)|data-visual-mode=["']browser-first["'])\b/i.test(text);
}

function hasTableOnlyMode(text) {
  return /\btable-only(?:\s+approved)?\b/i.test(text) && /\|.+\|/.test(text);
}

function hasTextFirstSummaryMode(text) {
  return /\b(text-first|text first|summary-first|human-readable summary|stage map|ASCII\s+(?:map|diagram)|improvised\s+(?:scheme|diagram)|compact\s+(?:table|stage))\b/i.test(text)
    && (/\|.+\|/.test(text) || /(?:->|=>|\bthen\b|\bstep\s+\d+)/i.test(text));
}

export function validateVisualExplanationArtifact(source) {
  const text = String(source || "");
  const issues = [];
  if (!/(<title>[^<]+<\/title>|^#\s+\S|<h1[^>]*>[^<]+<\/h1>)/im.test(text)) {
    issues.push("format: missing title or h1");
  }
  if (!hasTextFirstSummaryMode(text) && !hasBrowserFirstMode(text) && !hasTableOnlyMode(text)) {
    issues.push("visual mode: expected text-first summary, browser preview, or table-only approved mode");
  }
  for (const term of ["Text fallback", "Audience summary", "Stop condition"]) {
    if (!new RegExp(term, "i").test(text)) issues.push(`content: missing ${term}`);
  }
  if (!/\bno color-only\b/i.test(text)) {
    issues.push("accessibility: missing no color-only status statement");
  }
  if (hasMermaid(text) && (!/accTitle/i.test(text) || !/accDescr/i.test(text))) {
    issues.push("mermaid fallback: missing accTitle or accDescr");
  }
  if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(text))) {
    issues.push("placeholders: unresolved placeholder text found");
  }
  return issues;
}

async function walkFiles(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walkFiles(path));
    else if (/\.(?:html|md)$/i.test(entry.name)) out.push(path);
  }
  return out;
}

export async function validateVisualExplanationFiles({ rootDir = process.cwd(), files = [] } = {}) {
  const results = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    results.push({ file, issues: validateVisualExplanationArtifact(source) });
  }
  return {
    pass: results.every((result) => result.issues.length === 0),
    results,
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      file: { type: "string", short: "f", multiple: true },
      "fixture-dir": { type: "string" },
      all: { type: "boolean", default: false },
      "require-claimed": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    console.log(`Usage:
  node scripts/validate-visual-explanation-artifacts.mjs --file .supervibe/artifacts/visual-explanations/<slug>/index.html
  node scripts/validate-visual-explanation-artifacts.mjs --all
  node scripts/validate-visual-explanation-artifacts.mjs --all --require-claimed
  node scripts/validate-visual-explanation-artifacts.mjs --fixture-dir tests/fixtures/artifacts/visual-explanations`);
    return;
  }

  const root = process.cwd();
  const explicitFiles = Array.isArray(values.file)
    ? values.file
    : values.file
      ? [values.file]
      : [];
  const files = explicitFiles.length
    ? explicitFiles
    : values["fixture-dir"]
      ? await walkFiles(join(root, values["fixture-dir"]))
      : await walkFiles(join(root, ".supervibe", "artifacts", "visual-explanations"));

  if (files.length === 0) {
    if (values["require-claimed"]) {
      console.error("[validate-visual-explanation-artifacts] claimed visual explanation artifacts are required but none were found");
      process.exit(1);
    }
    console.log("[validate-visual-explanation-artifacts] no visual explanation artifacts found; skipping");
    return;
  }

  const report = await validateVisualExplanationFiles({ rootDir: root, files });
  for (const result of report.results) {
    const rel = relative(root, result.file).split(sep).join("/");
    if (result.issues.length === 0) {
      console.log(`OK   visual-explanation ${rel}`);
    } else {
      console.error(`FAIL visual-explanation ${rel}`);
      for (const issue of result.issues) console.error(`  - ${issue}`);
    }
  }
  if (!report.pass) {
    console.error(`\n${report.results.filter((item) => item.issues.length > 0).length}/${report.results.length} visual explanation artifact(s) failed`);
    process.exit(1);
  }
  console.log(`\nAll ${report.results.length} visual explanation artifact(s) passed`);
}

const isMain = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`;
if (isMain || process.argv[1]?.endsWith("validate-visual-explanation-artifacts.mjs")) {
  main().catch((error) => {
    console.error(error);
    process.exit(2);
  });
}
