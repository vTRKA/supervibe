#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DESIGN_WIZARD_AXES,
  DESIGN_WIZARD_MODES,
  DESIGN_VIEWPORT_CHOICES,
  buildDesignWizardState,
  resolveDesignViewportPolicy,
} from "./lib/design-wizard-catalog.mjs";

const DOC_RULES = Object.freeze([
  {
    file: "commands/supervibe-design.md",
    label: "design command wizard contract",
    required: [
      /## Design Wizard Contract/i,
      /mode question/i,
      /Stage Question Catalog/i,
      /questionQueue/i,
      /writeGate/i,
      /guidedDefaultsChecklist/i,
      /styleboard\.html/i,
      /diagnostic scratch/i,
      /executionMode/i,
      /inline.*real-agents.*hybrid|real-agents.*hybrid.*inline/i,
      /anti-generic|generic admin/i,
      /visual regression|1920x1080/i,
      /promote-design-approval\.mjs/i,
      /validate-agent-producer-receipts\.mjs/i,
      /validate-design-agent-receipts\.mjs/i,
      /Continuation question after approved design system/i,
      /actual window size/i,
      /deviceScaleFactor/i,
      /hostInvocation\.invocationId/i,
    ],
  },
  {
    file: "skills/brandbook/SKILL.md",
    label: "brandbook guided wizard contract",
    required: [
      /guided defaults checklist/i,
      /Accept default \/ Compare alternatives \/ Customize/i,
      /styleboard\.html/i,
      /diagnostic scratch/i,
      /writeGate\.durableWritesAllowed/i,
      /questionQueue/i,
    ],
  },
]);

export function validateDesignWizard(rootDir = process.cwd()) {
  const issues = [];

  if (DESIGN_WIZARD_MODES.length < 4) {
    issues.push(issue("scripts/lib/design-wizard-catalog.mjs", "missing-mode-choice", "design wizard must expose at least four workflow modes"));
  }
  if (DESIGN_WIZARD_AXES.length < 8) {
    issues.push(issue("scripts/lib/design-wizard-catalog.mjs", "missing-axis-catalog", "design wizard must expose at least eight design axes"));
  }
  if (!DESIGN_WIZARD_AXES.some((axis) => axis.id === "creative_alternatives")) {
    issues.push(issue("scripts/lib/design-wizard-catalog.mjs", "missing-creative-alternatives-axis", "design wizard must require creative alternatives before tokens"));
  }
  if (!DESIGN_WIZARD_AXES.some((axis) => axis.id === "anti_generic_guardrail")) {
    issues.push(issue("scripts/lib/design-wizard-catalog.mjs", "missing-anti-generic-axis", "design wizard must include an anti-generic guardrail"));
  }
  for (const axis of DESIGN_WIZARD_AXES) {
    if ((axis.choices || []).length < 3) {
      issues.push(issue("scripts/lib/design-wizard-catalog.mjs", "thin-axis-choice-set", `${axis.id}: expected at least 3 choices`));
    }
    if (!axis.defaultChoiceId || !(axis.choices || []).some((choice) => choice.id === axis.defaultChoiceId)) {
      issues.push(issue("scripts/lib/design-wizard-catalog.mjs", "missing-axis-default", `${axis.id}: defaultChoiceId must point to a real choice`));
    }
  }
  if (!DESIGN_VIEWPORT_CHOICES.some((choice) => choice.id === "actual-window")) {
    issues.push(issue("scripts/lib/design-wizard-catalog.mjs", "missing-actual-window-viewport", "desktop viewport catalog must include actual-window"));
  }

  const defaultState = buildDesignWizardState({
    brief: "Use defaults for a Tauri desktop app",
    target: "tauri",
    mode: "design-system-only",
    timestamp: "2026-05-03T00:00:00.000Z",
  });
  if (!Array.isArray(defaultState.guidedDefaultsChecklist) || defaultState.guidedDefaultsChecklist.length < DESIGN_WIZARD_AXES.length) {
    issues.push(issue("scripts/lib/design-wizard-catalog.mjs", "missing-guided-defaults-checklist", "explicit defaults must produce an editable checklist for every axis"));
  }
  if (!defaultState.guidedDefaultsChecklist.every((item) => item.actions?.length === 3)) {
    issues.push(issue("scripts/lib/design-wizard-catalog.mjs", "invalid-guided-default-actions", "each guided default must offer accept, compare, and customize actions"));
  }
  const desktopPolicy = resolveDesignViewportPolicy({ target: "tauri" });
  if (!desktopPolicy.requiresActualWindowQuestion || !desktopPolicy.requiredMetadata.includes("deviceScaleFactor")) {
    issues.push(issue("scripts/lib/design-wizard-catalog.mjs", "weak-desktop-viewport-policy", "desktop viewport policy must require actual window and deviceScaleFactor metadata"));
  }

  for (const rule of DOC_RULES) {
    const absPath = join(rootDir, ...rule.file.split("/"));
    if (!existsSync(absPath)) {
      issues.push(issue(rule.file, "missing-file", `${rule.file}: file not found`));
      continue;
    }
    const text = readFileSync(absPath, "utf8");
    for (const pattern of rule.required) {
      if (!pattern.test(text)) {
        issues.push(issue(rule.file, "missing-design-wizard-contract", `${rule.file}: missing ${pattern}`));
      }
    }
  }

  return {
    pass: issues.length === 0,
    checked: DOC_RULES.length + DESIGN_WIZARD_AXES.length,
    issues,
  };
}

export function formatDesignWizardReport(result) {
  const lines = [
    "SUPERVIBE_DESIGN_WIZARD",
    `PASS: ${result.pass}`,
    `CHECKED: ${result.checked}`,
    `ISSUES: ${result.issues.length}`,
  ];
  for (const item of result.issues) {
    lines.push(`ISSUE: ${item.code} ${item.file} - ${item.message}`);
  }
  return lines.join("\n");
}

function issue(file, code, message) {
  return { file, code, message };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = validateDesignWizard(process.cwd());
  console.log(formatDesignWizardReport(result));
  process.exit(result.pass ? 0 : 1);
}
