#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REQUIRED_FILES = Object.freeze([
  "README.md",
  "README.ru.md",
  "commands/supervibe-brainstorm.md",
  "commands/supervibe-plan.md",
  "commands/supervibe-loop.md",
]);

export function validateDocsTaskFlow(rootDir = process.cwd()) {
  const issues = [];
  const docs = new Map();
  for (const file of REQUIRED_FILES) {
    const path = join(rootDir, file);
    if (!existsSync(path)) {
      issues.push(`missing required doc: ${file}`);
      continue;
    }
    docs.set(file, readFileSync(path, "utf8"));
  }
  const readme = docs.get("README.md") || "";
  const readmeRu = docs.get("README.ru.md") || "";
  const plan = docs.get("commands/supervibe-plan.md") || "";
  const loop = docs.get("commands/supervibe-loop.md") || "";
  const brainstorm = docs.get("commands/supervibe-brainstorm.md") || "";

  for (const [file, text] of [["README.md", readme], ["README.ru.md", readmeRu]]) {
    for (const term of ["/supervibe-plan --loop-ready", "--atomize-plan", "--user-approved-plan", "/supervibe-ui"]) {
      if (!text.includes(term)) issues.push(`${file}: missing canonical task flow term ${term}`);
    }
  }
  if (!/text-first|текстов|summary-first|stage map|схем/i.test(`${brainstorm}\n${plan}\n${loop}`)) {
    issues.push("commands: missing text-first summary policy");
  }
  if (/browser-first visual packet/i.test(`${brainstorm}\n${plan}\n${loop}`)) {
    issues.push("commands: browser-first visual packet must not be required for ordinary summaries");
  }
  if (/\/supervibe-loop --guided`\s*\|/i.test(readmeRu) || /\/supervibe-loop --guided`\s*\|/i.test(readme)) {
    issues.push("README: guided loop shortcut must not appear as the canonical long-task flow without graph file context");
  }
  if (!/direct plan execution is legacy diagnostic-only/i.test(loop)) {
    issues.push("commands/supervibe-loop.md: missing legacy diagnostic-only direct-plan warning");
  }
  return {
    pass: issues.length === 0,
    checked: docs.size,
    issues,
  };
}

export function formatDocsTaskFlowReport(report = {}) {
  const lines = [
    "SUPERVIBE_DOCS_TASK_FLOW",
    `PASS: ${report.pass === true}`,
    `CHECKED: ${report.checked || 0}`,
    `ISSUES: ${(report.issues || []).length}`,
  ];
  for (const issue of report.issues || []) lines.push(`ISSUE: ${issue}`);
  return lines.join("\n");
}

if (process.argv[1]?.endsWith("validate-docs-task-flow.mjs")) {
  const json = process.argv.includes("--json");
  const help = process.argv.includes("--help") || process.argv.includes("-h");
  if (help) {
    console.log("Usage: node scripts/validate-docs-task-flow.mjs [--json]");
    process.exit(0);
  }
  const report = validateDocsTaskFlow(process.cwd());
  console.log(json ? JSON.stringify(report, null, 2) : formatDocsTaskFlowReport(report));
  if (!report.pass) process.exit(1);
}
