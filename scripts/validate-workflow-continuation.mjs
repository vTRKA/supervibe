#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  resolveCliRoots,
  resolvePluginContentRoot,
} from "./lib/supervibe-cli-roots.mjs";

const SCRIPT_PLUGIN_ROOT = fileURLToPath(new URL("../", import.meta.url));

const TOPIC_DRIFT_REQUIRED = Object.freeze([
  /## Topic Drift \/ Resume Contract/i,
  /skip\/delegate safe non-final decisions/i,
  /pause .*switch topic/i,
  /stop\/archive/i,
]);

const RULES = Object.freeze([
  {
    file: "commands/supervibe-design.md",
    label: "design pipeline",
    required: [
      /## Continuation Contract/i,
      /Continue through all applicable non-blocking stages/i,
      /Only pause when/i,
      /stageTriage/i,
      /required.*reuse.*delegated.*skipped.*N\/A/i,
      /NEXT_USER_ACTIONS\[\]/i,
      /approve \/ revise \/ compare \/ stop/i,
      /PROTOTYPE_UNLOCKED: false/i,
      ...TOPIC_DRIFT_REQUIRED,
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
      /Full-pass mode can draft all required sections/i,
      /reuse\/extension mode must not force/i,
      /review packet/i,
      /Candidate markers are not user approval/i,
    ],
    forbidden: [
      /Each section is its OWN dialogue\. User approves before next starts/i,
      /DO NOT proceed to next section without explicit approval/i,
    ],
  },
  {
    file: "scripts/lib/supervibe-stage-state.mjs",
    label: "shared post-stage continuation state",
    required: [
      /WORKFLOW_STAGE_STATES/i,
      /needs_questions/i,
      /review_required/i,
      /failed_recoverable/i,
      /buildPostStageContinuation/i,
      /nextUserActions/i,
      /approve_design_system/i,
      /revise_styleboard/i,
      /compare_alternatives/i,
      /repair_ledger/i,
      /resume_last_trusted/i,
    ],
    forbidden: [],
  },
  {
    file: "commands/supervibe-brainstorm.md",
    label: "brainstorm command",
    required: [
      /Do not stop after individual brainstorm sections/i,
      /complete the requirements package before handoff/i,
      /Pre-documentation summary/i,
      /Documentation Approval Gate/i,
      /Post-documentation summary/i,
      /text-first summary/i,
      /NEXT_USER_ACTIONS\[\]/i,
      /Approve spec and write plan/i,
      /Revise idea\/spec/i,
      /NEXT_STEP_HANDOFF/i,
      ...TOPIC_DRIFT_REQUIRED,
    ],
    forbidden: [],
  },
  {
    file: "skills/brainstorming/SKILL.md",
    label: "brainstorm skill",
    required: [
      /Do not stop after individual brainstorm sections/i,
      /complete the full requirements package/i,
      /Pre-documentation summary/i,
      /Documentation Approval Gate/i,
      /Post-documentation summary/i,
      /text-first summary/i,
      /NEXT_USER_ACTIONS\[\]/i,
      /approve spec and write plan/i,
      /revise idea\/spec/i,
      /NEXT_STEP_HANDOFF/i,
      ...TOPIC_DRIFT_REQUIRED,
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
      /compact plan-scope preview/i,
      /approve\/revise\/exclude-or-defer\/stop choice/i,
      /plan_delivery/i,
      /Post-plan summary/i,
      /text-first visual summary|text-first summary/i,
      /Exclude or defer items/i,
      /write the full plan before the review handoff/i,
      /NEXT_USER_ACTIONS\[\]/i,
      /Run plan review/i,
      /Revise plan first/i,
      /NEXT_STEP_HANDOFF/i,
      ...TOPIC_DRIFT_REQUIRED,
    ],
    forbidden: [],
  },
  {
    file: "skills/writing-plans/SKILL.md",
    label: "writing-plans skill",
    required: [
      /Do not stop after individual plan phases/i,
      /compact plan-scope preview/i,
      /approve\/revise\/exclude-or-defer\/stop choice/i,
      /plan_delivery/i,
      /Post-plan summary/i,
      /text-first visual summary|text-first summary/i,
      /exclude or defer items/i,
      /write the full plan before handoff/i,
      /NEXT_USER_ACTIONS\[\]/i,
      /run plan review/i,
      /revise plan first/i,
      /NEXT_STEP_HANDOFF/i,
      ...TOPIC_DRIFT_REQUIRED,
    ],
    forbidden: [],
  },
  {
    file: "commands/supervibe-loop.md",
    label: "autonomous loop",
    required: [
      /Do not stop after the first task or wave/i,
      /continue ready work until/i,
      /workflowSignal/i,
      /NEXT_USER_ACTIONS\[\]/i,
      /Revise atomization/i,
      ...TOPIC_DRIFT_REQUIRED,
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
      /workflowSignal/i,
      ...TOPIC_DRIFT_REQUIRED,
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
    file: "commands/supervibe-audit.md",
    label: "audit command receipt mode",
    required: [
      /## Audit Receipt Mode/i,
      /read-only\/no-write diagnostic/i,
      /receipt-writing mode/i,
      /MUTATED: \.supervibe\/memory\/agent-invocations\.jsonl/i,
      /supervibe-agent-maturity\.mjs/i,
      /strict host-agent telemetry/i,
    ],
    forbidden: [],
  },
]);

export function validateWorkflowContinuation(rootDir = process.cwd(), options = {}) {
  const resolvedRoot = resolvePluginContentRoot({
    rootDir,
    pluginRoot: options.pluginRoot,
    requiredDir: "commands",
  });
  const issues = [];

  for (const rule of RULES) {
    const absPath = join(resolvedRoot, ...rule.file.split("/"));
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
  const roots = resolveCliRoots({
    argv: process.argv.slice(2),
    scriptPluginRoot: SCRIPT_PLUGIN_ROOT,
  });
  const result = validateWorkflowContinuation(roots.root, { pluginRoot: roots.pluginRoot });
  console.log(formatWorkflowContinuationReport(result));
  process.exit(result.pass ? 0 : 1);
}
