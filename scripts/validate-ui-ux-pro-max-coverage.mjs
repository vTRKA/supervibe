#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const PRO_MAX_DOMAINS = Object.freeze([
  /Accessibility/i,
  /Touch & Interaction/i,
  /Performance/i,
  /Style Selection/i,
  /Layout & Responsive/i,
  /Typography & Color/i,
  /Animation/i,
  /Forms & Feedback/i,
  /Navigation Patterns/i,
  /Charts & Data/i,
]);

const RULES = Object.freeze([
  {
    file: "docs/references/ui-ux-pro-max-coverage.md",
    label: "adapted coverage reference",
    required: [
      /adapted UI\/UX coverage model/i,
      ...PRO_MAX_DOMAINS,
      /product-fit style matrix/i,
      /stack-aware UI guidance/i,
    ],
  },
  {
    file: "commands/supervibe-design.md",
    label: "design command coverage",
    required: [
      /UI\/UX Pro Max Coverage Gate/i,
      ...PRO_MAX_DOMAINS,
      /product-fit style matrix/i,
    ],
  },
  {
    file: "agents/_design/ux-ui-designer.md",
    label: "ux designer coverage",
    required: [
      /UI\/UX Pro Max Coverage/i,
      /product-fit style matrix/i,
      /Navigation Patterns/i,
      /Charts & Data/i,
    ],
  },
  {
    file: "agents/_design/ui-polish-reviewer.md",
    label: "ui polish coverage",
    required: [
      /UI\/UX Pro Max Coverage/i,
      /Accessibility/i,
      /Touch & Interaction/i,
      /Performance/i,
      /Forms & Feedback/i,
    ],
  },
  {
    file: "skills/design-intelligence/SKILL.md",
    label: "design intelligence coverage",
    required: [
      /UI\/UX Pro Max Coverage Matrix/i,
      ...PRO_MAX_DOMAINS,
      /stack-aware UI guidance/i,
    ],
  },
  {
    file: "skills/ui-review-and-polish/SKILL.md",
    label: "ui review skill coverage",
    required: [
      /UI\/UX Pro Max Coverage/i,
      /Accessibility/i,
      /Performance/i,
      /Charts & Data/i,
    ],
  },
]);

export function validateUiUxProMaxCoverage(rootDir = process.cwd()) {
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
          code: "missing-ui-ux-pro-max-coverage",
          message: `${rule.file}: missing ${pattern}`,
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

export function formatUiUxProMaxCoverageReport(result) {
  const lines = [
    "SUPERVIBE_UI_UX_PRO_MAX_COVERAGE",
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
  const result = validateUiUxProMaxCoverage(process.cwd());
  console.log(formatUiUxProMaxCoverageReport(result));
  process.exit(result.pass ? 0 : 1);
}
