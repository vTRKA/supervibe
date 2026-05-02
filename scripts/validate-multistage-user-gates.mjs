#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const EXPLICIT_SURFACE_RULES = Object.freeze([
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
