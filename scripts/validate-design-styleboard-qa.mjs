#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildDesignReviewCheckPlan,
} from "./lib/design-wizard-catalog.mjs";

const STYLEBOARD_REL = ".supervibe/artifacts/prototypes/_design-system/styleboard.html";
const QA_REL = ".supervibe/artifacts/prototypes/_design-system/_reviews/styleboard-qa.json";

export function validateDesignStyleboardQa(rootDir = process.cwd(), options = {}) {
  const target = options.target || "web";
  const styleboardPath = join(rootDir, ...STYLEBOARD_REL.split("/"));
  const qaPath = join(rootDir, ...QA_REL.split("/"));
  const checkPlan = buildDesignReviewCheckPlan({ target });
  if (!existsSync(styleboardPath)) {
    return {
      pass: true,
      status: "not-started-no-styleboard",
      styleboard: STYLEBOARD_REL,
      qaEvidence: QA_REL,
      checkPlan,
      issues: [],
    };
  }

  const issues = [];
  const html = readFileSync(styleboardPath, "utf8");
  const requiredSignals = [
    ["palette", /palette|swatch|color/i],
    ["typography", /typography|font|type sample/i],
    ["density", /density|spacing|compact|comfortable/i],
    ["controls", /button|input|select|toggle|checkbox/i],
    ["table", /table|grid|row|column/i],
    ["dialog", /dialog|modal|popover/i],
    ["motion", /motion|duration|easing|reduced-motion/i],
    ["component-feel", /component|variant|state/i],
  ];
  for (const [label, pattern] of requiredSignals) {
    if (!pattern.test(html)) issues.push(`styleboard missing ${label} signal`);
  }
  if (!existsSync(qaPath)) {
    issues.push(`${QA_REL} missing; save screenshot/overflow/contrast/focus/reduced-motion evidence before section approval`);
  } else {
    try {
      const evidence = JSON.parse(readFileSync(qaPath, "utf8"));
      const checks = new Set(Array.isArray(evidence.checks) ? evidence.checks : []);
      for (const check of checkPlan.checks) {
        if (!checks.has(check)) issues.push(`${QA_REL} missing check result: ${check}`);
      }
    } catch {
      issues.push(`${QA_REL} is not valid JSON`);
    }
  }
  return {
    pass: issues.length === 0,
    status: issues.length === 0 ? "styleboard-qa-ready" : "styleboard-qa-blocked",
    styleboard: STYLEBOARD_REL,
    qaEvidence: QA_REL,
    checkPlan,
    issues,
  };
}

export function formatDesignStyleboardQaReport(result = {}) {
  const lines = [
    "SUPERVIBE_DESIGN_STYLEBOARD_QA",
    `PASS: ${result.pass === true}`,
    `STATUS: ${result.status || "unknown"}`,
    `STYLEBOARD: ${result.styleboard || STYLEBOARD_REL}`,
    `QA_EVIDENCE: ${result.qaEvidence || QA_REL}`,
    `CHECKS: ${(result.checkPlan?.checks || []).join(",") || "none"}`,
    `ISSUES: ${(result.issues || []).length}`,
  ];
  for (const issue of result.issues || []) lines.push(`ISSUE: ${issue}`);
  return lines.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const targetIndex = process.argv.indexOf("--target");
  const target = targetIndex >= 0 ? process.argv[targetIndex + 1] : "web";
  const result = validateDesignStyleboardQa(process.cwd(), { target });
  console.log(formatDesignStyleboardQaReport(result));
  process.exit(result.pass ? 0 : 1);
}
