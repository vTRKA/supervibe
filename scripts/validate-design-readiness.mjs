#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RULES = Object.freeze([
  {
    file: "commands/supervibe-design.md",
    label: "design command readiness",
    required: [
      /## Design Readiness Contract/i,
      /Taste Alignment Gate/i,
      /approved prototype \+ final tokens/i,
      /Critique Gate/i,
      /one source of truth/i,
      /product model/i,
      /Preference Coverage Matrix Gate/i,
      /Do not create candidate tokens/i,
      /## Design Flow State Machine/i,
      /design-flow-state\.json/i,
      /creative_direction\.status = selected/i,
      /design_system\.status = approved/i,
      /prototype\.requested = BLOCKED/i,
      /prototype\.requested = ALLOWED/i,
      /spacing-density/i,
      /accessibility-platform/i,
      /chat-level feedback prompt is canonical/i,
    ],
    forbidden: [
      /candidate tokens keep draft prototypes disciplined/i,
      /status:\s*candidate`?\s+as source for prototype proof/i,
    ],
  },
  {
    file: "skills/brandbook/SKILL.md",
    label: "brandbook candidate-to-final tokens",
    required: [
      /candidate tokens/i,
      /final handoff metadata/i,
      /visual approval/i,
      /prototype approval/i,
      /Preference Coverage Matrix Gate/i,
      /Preference Coverage Matrix/i,
      /design-flow-state\.json/i,
      /approved_sections/i,
      /feedback_hash/i,
      /Candidate markers are not user approval/i,
    ],
    forbidden: [
      new RegExp("candidate tokens are the source for draft " + "prototypes", "i"),
    ],
  },
  {
    file: "agents/_design/prototype-builder.md",
    label: "prototype builder draft boundary",
    required: [
      /Candidate design-system artifacts are review packets/i,
      /design-flow-state\.json/i,
      /design_system\.status = approved/i,
      /Critique Gate/i,
      /Do not hand off draft visuals/i,
    ],
    forbidden: [],
  },
  {
    file: "skills/prototype-handoff/SKILL.md",
    label: "prototype handoff final readiness",
    required: [
      /approved prototype \+ final tokens/i,
      /single source of truth/i,
      new RegExp("competing prototypes", "i"),
    ],
    forbidden: [],
  },
  {
    file: "rules/prototype-to-production.md",
    label: "prototype to production draft boundary",
    required: [
      /Draft prototypes are not production visual contracts/i,
      /approved prototype \+ final tokens/i,
    ],
    forbidden: [
      new RegExp("Front-end developer reads `proto" + "types/<feature>/`", "i"),
    ],
  },
  {
    file: "rules/design-system-governance.md",
    label: "design system governance lifecycle",
    required: [
      /candidate tokens/i,
      /design-flow-state\.json/i,
      new RegExp("Candidate tokens do not unlock " + "prototypes", "i"),
      /prototype\.requested/i,
      /final tokens/i,
      /visual approval/i,
    ],
    forbidden: [],
  },
]);

export function validateDesignReadiness(rootDir = process.cwd()) {
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
          code: "missing-design-readiness-contract",
          message: `${rule.file}: missing required design readiness phrase ${pattern}`,
        });
      }
    }
    for (const pattern of rule.forbidden) {
      if (pattern.test(text)) {
        issues.push({
          file: rule.file,
          label: rule.label,
          code: "unsafe-design-readiness-language",
          message: `${rule.file}: forbidden design readiness language matched ${pattern}`,
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

export function formatDesignReadinessReport(result) {
  const lines = [
    "SUPERVIBE_DESIGN_READINESS",
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
  const result = validateDesignReadiness(process.cwd());
  console.log(formatDesignReadinessReport(result));
  process.exit(result.pass ? 0 : 1);
}
