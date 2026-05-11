#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const EXPLICIT_SURFACE_RULES = Object.freeze([
  {
    file: "commands/supervibe-brainstorm.md",
    label: "brainstorm documentation approval gate",
    required: [
      /Pre-documentation summary/i,
      /Documentation Approval Gate/i,
      /Do not write, save, or claim a spec until/i,
      /Post-documentation summary/i,
      /text-first summary/i,
    ],
  },
  {
    file: "skills/brainstorming/SKILL.md",
    label: "brainstorm skill documentation approval gate",
    required: [
      /Pre-documentation summary/i,
      /Documentation Approval Gate/i,
      /Do not write the spec until/i,
      /Post-documentation summary/i,
      /text-first summary/i,
    ],
  },
  {
    file: "commands/supervibe-plan.md",
    label: "plan command approval gate",
    required: [
      /Plan Scope Approval Gate/i,
      /Ask one `plan_delivery` question/i,
      /Do not save the durable plan, atomize work items, or offer execution until this gate is answered/i,
      /Current explicit user answer/i,
      /Reviewer Coverage/i,
      /baseline reviewers/i,
      /Stop condition: ask-before-plan-review/i,
      /NEXT_USER_ACTIONS\[\]/i,
    ],
  },
  {
    file: "skills/writing-plans/SKILL.md",
    label: "writing-plans skill approval gate",
    required: [
      /Plan Scope Approval Gate/i,
      /Ask one `plan_delivery` question/i,
      /Do not save the durable plan, atomize work items, or offer execution until this gate is answered/i,
      /Current explicit user answer/i,
      /continue from plan to review until the user chooses/i,
      /NEXT_STEP_HANDOFF/i,
    ],
  },
  {
    file: "skills/requesting-code-review/SKILL.md",
    label: "plan review user-decision gate",
    required: [
      /Plan Review User Gate/i,
      /plan-review mode/i,
      /Reviewer Coverage/i,
      /baseline reviewers/i,
      /Next User Decision/i,
      /Do not atomize, create an epic, or execute until the user chooses one action/i,
      /Stop condition: ask-before-work-item-atomization/i,
      /NEXT_USER_ACTIONS\[\]/i,
    ],
  },
  {
    file: "commands/supervibe.md",
    label: "dispatcher plan handoff gate",
    required: [
      /For workflow handoffs, ask the concrete next-step question/i,
      /Every producer result must also expose `NEXT_USER_ACTIONS\[\]` before progressing/i,
      /Plan\/pre-plan continuation is fail-closed/i,
      /current explicit user answer/i,
      /reviewer gate/i,
      /Next User Decision/i,
    ],
  },
  {
    file: "commands/supervibe-execute-plan.md",
    label: "execute-plan preflight user-decision gate",
    required: [
      /Mandatory workflow gates before readiness/i,
      /Current explicit user answer/i,
      /Reviewer Coverage/i,
      /Next User Decision/i,
      /If review has not passed, route to `\/supervibe-plan --review <plan-path>` and stop/i,
      /If atomic work items or an epic do not exist, route to `\/supervibe-loop --atomize-plan <plan-path> --plan-review-passed`/i,
      /Override requires explicit user typed confirmation/i,
    ],
  },
  {
    file: "skills/executing-plans/SKILL.md",
    label: "executing-plans unanswered handoff gate",
    required: [
      /Plan User-Decision Gate/i,
      /unanswered `NEXT_STEP_HANDOFF`/i,
      /STOP and ask/i,
      /Definition Of Ready/i,
    ],
  },
  {
    file: "commands/supervibe-loop.md",
    label: "loop atomization user-decision gate",
    required: [
      /reviewer coverage/i,
      /Next User Decision/i,
      /After atomization or a dry-run preview, print `NEXT_USER_ACTIONS\[\]` and wait for one choice before execution/i,
      /Do not treat `--plan-review-passed` as permission to execute/i,
      /Start guided execution/i,
    ],
  },
  {
    file: "skills/autonomous-agent-loop/SKILL.md",
    label: "autonomous loop plan-review gate",
    required: [
      /Plan Review And User Gate/i,
      /reviewed plan or reviewed work-item graph/i,
      /current explicit user answer/i,
      /unanswered handoff/i,
      /Reviewer coverage is mandatory/i,
      /Next User Decision/i,
    ],
  },
  {
    file: "skills/subagent-driven-development/SKILL.md",
    label: "subagent plan-review gate",
    required: [
      /Plan Review And User Gate/i,
      /reviewed plan or reviewed work-item graph/i,
      /current explicit user answer/i,
      /plan-review reviewer coverage/i,
      /Next User Decision/i,
      /unanswered `NEXT_STEP_HANDOFF`/i,
    ],
  },
  {
    file: "skills/new-feature/SKILL.md",
    label: "new-feature workflow plan gates",
    required: [
      /Workflow Question And Reviewer Gates/i,
      /visible Step N\/M question/i,
      /current explicit user answer/i,
      /mandatory plan-review loop/i,
      /reviewer coverage/i,
      /Next User Decision/i,
    ],
  },
  {
    file: "commands/supervibe-design.md",
    label: "design command feedback gate",
    required: [
      /Preference Coverage Matrix Gate/i,
      /chat-level feedback prompt is canonical/i,
      /browser feedback overlay is supplemental/i,
      /delegated approval markers cannot satisfy/i,
      /Wait for explicit choice/i,
      /Do NOT proceed silently/i,
    ],
  },
  {
    file: "skills/brandbook/SKILL.md",
    label: "brandbook preference gate",
    required: [
      /Preference Coverage Matrix Gate/i,
      /This gate cannot be satisfied by delegated approval markers/i,
      /Only the visual approval\/finalize step is a chat-level gate/i,
    ],
  },
  {
    file: "skills/prototype/SKILL.md",
    label: "prototype delivery gate",
    required: [
      /Preview feedback button is mandatory/i,
      /browser feedback overlay is supplemental/i,
      /Do NOT proceed without explicit choice/i,
    ],
  },
  {
    file: "skills/landing-page/SKILL.md",
    label: "landing delivery gate",
    required: [
      /Preview feedback button is mandatory/i,
      /browser feedback overlay is supplemental/i,
      /Wait for explicit choice/i,
      /Do NOT proceed without explicit choice/i,
    ],
  },
  {
    file: "skills/preview-server/SKILL.md",
    label: "preview overlay boundary",
    required: [
      /feedback overlay is supplemental/i,
      /not an approval gate/i,
      /surrounding command or skill must still ask/i,
    ],
  },
  {
    file: "commands/supervibe-presentation.md",
    label: "presentation command approval gate",
    required: [
      /browser feedback comments are revision inputs, not approval signals/i,
      /delegated decisions cannot satisfy the final deck approval gate/i,
      /Wait for explicit choice/i,
    ],
  },
  {
    file: "skills/presentation-deck/SKILL.md",
    label: "presentation deck feedback gate",
    required: [
      /browser feedback overlay is supplemental/i,
      /browser feedback comments are revision inputs, not approval signals/i,
      /Wait for explicit choice/i,
      /PPTX export stays blocked/i,
    ],
  },
  {
    file: "agents/_design/prototype-builder.md",
    label: "prototype builder feedback gate",
    required: [
      /browser feedback overlay is supplemental/i,
      /Wait for explicit choice/i,
      /Do NOT advance silently to handoff/i,
    ],
  },
  {
    file: "agents/_design/presentation-deck-builder.md",
    label: "presentation builder approval gate",
    required: [
      /browser feedback entries are revision inputs, not approval signals/i,
      /Wait for explicit choice/i,
      /\.approval\.json exists before export/i,
    ],
  },
  {
    file: "skills/browser-feedback/SKILL.md",
    label: "browser feedback lifecycle boundary",
    required: [
      /Browser feedback entries are not lifecycle approval/i,
      /surrounding delivery flow must still ask/i,
      /does not approve the artifact/i,
    ],
  },
]);

const SCAN_DIRS = Object.freeze(["commands", "skills", "agents"]);
const OVERLAY_OR_BROWSER_FEEDBACK_RE = /browser feedback|feedback overlay|Feedback button/i;
const LIFECYCLE_RE = /approval|approved|handoff|export|\.approval\.json|feedback prompt|deck|prototype/i;
const OVERLAY_BOUNDARY_RE = /supplemental|not an approval gate|not approval signals|not lifecycle approval|never replaces|does not approve/i;
const DELEGATED_DECISION_RE = /delegated (?:approval markers|design decisions|decisions|marker)/i;
const DELEGATED_BOUNDARY_RE = /cannot (?:be )?satisf(?:y|ied)|cannot bypass|not chat-level|not approval signals|cannot replace/i;

export function validateMultistageUserGates(rootDir = process.cwd()) {
  const issues = [];

  for (const rule of EXPLICIT_SURFACE_RULES) {
    const relPath = normalizePath(rule.file);
    const absPath = join(rootDir, ...relPath.split("/"));
    if (!existsSync(absPath)) {
      issues.push({
        file: relPath,
        label: rule.label,
        code: "missing-file",
        message: `${relPath}: file not found`,
      });
      continue;
    }

    const text = readFileSync(absPath, "utf8");
    for (const pattern of rule.required) {
      if (!pattern.test(text)) {
        issues.push({
          file: relPath,
          label: rule.label,
          code: "missing-user-gate-contract",
          message: `${relPath}: missing required multistage user-gate phrase ${pattern}`,
        });
      }
    }
  }

  for (const relPath of collectScannableFiles(rootDir)) {
    const absPath = join(rootDir, ...relPath.split("/"));
    const text = readFileSync(absPath, "utf8");

    if (
      OVERLAY_OR_BROWSER_FEEDBACK_RE.test(text) &&
      LIFECYCLE_RE.test(text) &&
      !OVERLAY_BOUNDARY_RE.test(text)
    ) {
      issues.push({
        file: relPath,
        label: "dynamic feedback overlay boundary",
        code: "overlay-substitutes-user-gate",
        message: `${relPath}: browser/preview feedback is mentioned in a lifecycle surface without saying it is supplemental and cannot approve the artifact`,
      });
    }

    if (DELEGATED_DECISION_RE.test(text) && !DELEGATED_BOUNDARY_RE.test(text)) {
      issues.push({
        file: relPath,
        label: "dynamic delegated decision boundary",
        code: "delegated-substitutes-user-gate",
        message: `${relPath}: delegated decisions are mentioned without saying they cannot satisfy the final user gate`,
      });
    }
  }

  const deduped = dedupeIssues(issues);
  return {
    pass: deduped.length === 0,
    checked: EXPLICIT_SURFACE_RULES.length,
    issues: deduped,
  };
}

export function formatMultistageUserGatesReport(result) {
  const lines = [
    "SUPERVIBE_MULTISTAGE_USER_GATES",
    `PASS: ${result.pass}`,
    `CHECKED: ${result.checked}`,
    `ISSUES: ${result.issues.length}`,
  ];
  for (const issue of result.issues) {
    lines.push(`ISSUE: ${issue.code} ${issue.file} - ${issue.message}`);
  }
  return lines.join("\n");
}

function collectScannableFiles(rootDir) {
  const files = [];
  for (const dir of SCAN_DIRS) {
    const absDir = join(rootDir, dir);
    if (!existsSync(absDir)) continue;
    walk(absDir, rootDir, files);
  }
  return files.sort();
}

function walk(dir, rootDir, files) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(absPath, rootDir, files);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(normalizePath(absPath.slice(rootDir.length + 1)));
    }
  }
}

function dedupeIssues(issues) {
  const seen = new Set();
  const out = [];
  for (const issue of issues) {
    const key = `${issue.file}\0${issue.code}\0${issue.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(issue);
  }
  return out;
}

function normalizePath(path) {
  return String(path || "").split(sep).join("/");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = validateMultistageUserGates(process.cwd());
  console.log(formatMultistageUserGatesReport(result));
  process.exit(result.pass ? 0 : 1);
}
