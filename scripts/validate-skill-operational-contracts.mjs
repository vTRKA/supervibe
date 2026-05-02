#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_SECTIONS = Object.freeze([
  { code: "output-contract", pattern: /^##\s+Output contract\b/im },
  { code: "guard-rails", pattern: /^##\s+Guard rails\b/im },
  { code: "verification", pattern: /^##\s+Verification\b/im },
]);

function walkSkillFiles(dir, result = []) {
  if (!existsSync(dir)) return result;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absPath = join(dir, entry.name);
    if (entry.isDirectory()) walkSkillFiles(absPath, result);
    else if (entry.isFile() && entry.name === "SKILL.md") result.push(absPath);
  }
  return result;
}

export function validateSkillOperationalContracts(rootDir = process.cwd()) {
  const skillRoot = join(rootDir, "skills");
  const files = walkSkillFiles(skillRoot);
  const issues = [];

  for (const absPath of files) {
    const text = readFileSync(absPath, "utf8");
    const relPath = relative(rootDir, absPath).split("\\").join("/");
    for (const section of REQUIRED_SECTIONS) {
      if (!section.pattern.test(text)) {
        issues.push({
          file: relPath,
          code: `missing-${section.code}`,
          message: `${relPath}: missing required section ${section.pattern}`,
        });
      }
    }
  }

  return {
    pass: issues.length === 0,
    checked: files.length,
    issues,
  };
}

export function formatSkillOperationalContractsReport(result) {
  const lines = [
    "SUPERVIBE_SKILL_OPERATIONAL_CONTRACTS",
    `PASS: ${result.pass}`,
    `CHECKED: ${result.checked}`,
    `ISSUES: ${result.issues.length}`,
  ];
  for (const issue of result.issues) {
    lines.push(`ISSUE: ${issue.code} ${issue.file} - ${issue.message}`);
  }
  return lines.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = validateSkillOperationalContracts(process.cwd());
  console.log(formatSkillOperationalContractsReport(result));
  process.exit(result.pass ? 0 : 1);
}
