#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RULES = Object.freeze([
  {
    file: "commands/supervibe-design.md",
    label: "design pipeline",
    required: [
      /## Continuation Contract/i,
      /Continue through all applicable stages/i,
      /Only pause when/i,
    ],
    forbidden: [
      /Each stage is gated on user explicit approval before the next starts/i,
      /Each sub-section gets explicit approval before next/i,
    ],
  },
  {
    file: "skills/brandbook/SKILL.md",
    label: "brandbook full pass",
    required: [
      /## Continuation Contract/i,
      /Full-pass mode continues through all eight sections/i,
      /delegated approval markers/i,
    ],
    forbidden: [
      /Each section is its OWN dialogue\. User approves before next starts/i,
      /DO NOT proceed to next section without explicit approval/i,
    ],
  },
  {
    file: "commands/supervibe-brainstorm.md",
    label: "brainstorm command",
    required: [
      /Do not stop after individual brainstorm sections/i,
      /complete the requirements package before handoff/i,
    ],
    forbidden: [],
  },
  {
    file: "skills/brainstorming/SKILL.md",
    label: "brainstorm skill",
    required: [
      /Do not stop after individual brainstorm sections/i,
      /complete the full requirements package/i,
    ],
    forbidden: [
      /Get approval per section/i,
    ],
  },
  {
    file: "commands/supervibe-plan.md",
    label: "plan command",
    required: [
      /Do not stop after individual plan phases/i,
      /write the full plan before the review handoff/i,
    ],
    forbidden: [],
  },
  {
    file: "skills/writing-plans/SKILL.md",
    label: "writing-plans skill",
    required: [
      /Do not stop after individual plan phases/i,
      /write the full plan before handoff/i,
    ],
    forbidden: [],
  },
  {
    file: "commands/supervibe-loop.md",
    label: "autonomous loop",
    required: [
      /Do not stop after the first task or wave/i,
      /continue ready work until/i,
    ],
    forbidden: [],
  },
  {
    file: "skills/autonomous-agent-loop/SKILL.md",
    label: "autonomous loop skill",
    required: [
      /## Continuation Contract/i,
      /Do not stop after the first task or wave/i,
      /Definition Of Ready/i,
      /Definition Of Done/i,
      /Execution Packet/i,
    ],
    forbidden: [],
  },
  {
    file: "commands/supervibe-execute-plan.md",
    label: "execute plan command",
    required: [
      /## Continuation Contract/i,
      /Do not stop after the first phase, task, or green check/i,
      /Resume mode must continue/i,
    ],
    forbidden: [],
  },
  {
    file: "skills/executing-plans/SKILL.md",
    label: "executing plans skill",
    required: [
      /## Continuation Contract/i,
      /Do not stop after the first task, phase, or green check/i,
      /resume-safe checkpoint/i,
    ],
    forbidden: [],
  },
  {
    file: "skills/subagent-driven-development/SKILL.md",
    label: "subagent-driven development skill",
    required: [
      /## Continuation Contract/i,
      /Continue through every ready wave/i,
      /Worker Execution Packet/i,
    ],
    forbidden: [],
  },
  {
    file: "skills/dispatching-parallel-agents/SKILL.md",
    label: "parallel dispatch skill",
    required: [
      /## Continuation Contract/i,
      /Do not stop after the first subagent returns/i,
      /self-contained worker packet/i,
    ],
    forbidden: [],
  },
  {
    file: "skills/new-feature/SKILL.md",
    label: "new feature skill",
    required: [
      /## Continuation Contract/i,
      /Do not stop after PRD, brainstorm, prototype, plan, first task, or review/i,
      /Feature Definition Of Done/i,
    ],
    forbidden: [],
  },
  {
    file: "commands/supervibe-presentation.md",
    label: "presentation command",
    required: [
      /Do not stop after storyboard or first slide/i,
      /continue through the deck pipeline/i,
    ],
    forbidden: [],
  },
]);

export function validateWorkflowContinuation(rootDir = process.cwd()) {
  const issues = [];

  for (const rule of RULES) {
    const absPath = join(rootDir, ...rule.file.split("/"));
    if (!existsSync(absPath)) {
      issues.push({
        file: rule.file,
        label: rule.label,
        code: "missing-file",
        message: `${rule.file}: file not found`,
      });
      continue;
    }

    const text = readFileSync(absPath, "utf8");
    for (const pattern of rule.required) {
      if (!pattern.test(text)) {
        issues.push({
          file: rule.file,
          label: rule.label,
          code: "missing-continuation-contract",
          message: `${rule.file}: missing required continuation contract ${pattern}`,
        });
      }
    }
    for (const pattern of rule.forbidden) {
      if (pattern.test(text)) {
        issues.push({
          file: rule.file,
          label: rule.label,
          code: "hard-stop-language",
          message: `${rule.file}: forbidden hard-stop language matched ${pattern}`,
        });
      }
    }
  }

  return {
    pass: issues.length === 0,
    checked: RULES.length,
    issues,
  };
}

export function formatWorkflowContinuationReport(result) {
  const lines = [
    "SUPERVIBE_WORKFLOW_CONTINUATION",
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
  const result = validateWorkflowContinuation(process.cwd());
  console.log(formatWorkflowContinuationReport(result));
  process.exit(result.pass ? 0 : 1);
}
