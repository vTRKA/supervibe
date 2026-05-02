#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_SECTIONS = Object.freeze([
  { code: "when-to-invoke", pattern: /^##\s+When to invoke\b/im },
  { code: "procedure", pattern: /^##\s+Procedure\b/im },
  { code: "output-contract", pattern: /^##\s+Output contract\b/im },
  { code: "guard-rails", pattern: /^##\s+Guard rails\b/im },
  { code: "verification", pattern: /^##\s+Verification\b/im },
]);

const HIGH_RISK_SKILL_RULES = Object.freeze([
  {
    file: "skills/autonomous-agent-loop/SKILL.md",
    label: "autonomous loop controller",
    required: [
      /## Continuation Contract/i,
      /Definition Of Ready/i,
      /Definition Of Done/i,
      /Execution Packet/i,
      /Wave Planning And Dispatch/i,
      /Recovery And Resume/i,
      /Do not stop after the first task or wave/i,
      /\.supervibe\/memory\/loops\/<run-id>\//i,
    ],
  },
  {
    file: "skills/subagent-driven-development/SKILL.md",
    label: "subagent execution",
    required: [
      /## Continuation Contract/i,
      /Definition Of Ready/i,
      /Definition Of Done/i,
      /Worker Execution Packet/i,
      /not alone in the codebase/i,
      /Continue through every ready wave/i,
    ],
  },
  {
    file: "skills/executing-plans/SKILL.md",
    label: "plan execution",
    required: [
      /## Continuation Contract/i,
      /Definition Of Ready/i,
      /Definition Of Done/i,
      /resume-safe checkpoint/i,
      /Do not stop after the first task, phase, or green check/i,
    ],
  },
  {
    file: "skills/new-feature/SKILL.md",
    label: "feature workflow",
    required: [
      /## Continuation Contract/i,
      /Feature Definition Of Ready/i,
      /Feature Definition Of Done/i,
      /Do not stop after PRD, brainstorm, prototype, plan, first task, or review/i,
    ],
  },
  {
    file: "skills/dispatching-parallel-agents/SKILL.md",
    label: "parallel dispatch",
    required: [
      /Dispatch Quality Contract/i,
      /## Continuation Contract/i,
      /self-contained worker packet/i,
      /Do not stop after the first subagent returns/i,
      /write-set conflicts/i,
    ],
  },
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

  const byRelPath = new Map(
    files.map((absPath) => [relative(rootDir, absPath).split("\\").join("/"), absPath]),
  );
  for (const rule of HIGH_RISK_SKILL_RULES) {
    const absPath = byRelPath.get(rule.file);
    if (!absPath) {
      issues.push({
        file: rule.file,
        code: "missing-high-risk-skill",
        message: `${rule.file}: required high-risk skill file is missing`,
      });
      continue;
    }
    const text = readFileSync(absPath, "utf8");
    for (const pattern of rule.required) {
      if (!pattern.test(text)) {
        issues.push({
          file: rule.file,
          code: "missing-high-risk-contract",
          message: `${rule.file}: ${rule.label} missing required operational contract ${pattern}`,
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
