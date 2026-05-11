#!/usr/bin/env node
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  artifactRoot,
} from "./lib/supervibe-artifact-roots.mjs";
import {
  readDesignWorkflowStatus,
} from "./lib/design-workflow-status.mjs";

export function validateDesignWorkflowState(rootDir = process.cwd(), { slug = "" } = {}) {
  const slugs = slug ? [slug] : listPrototypeSlugs(rootDir);
  const results = slugs.map((item) => readDesignWorkflowStatus(rootDir, { slug: item }));
  const issues = [];
  for (const status of results) {
    for (const issue of status.stateConsistency?.issues || []) {
      issues.push({
        slug: status.slug,
        code: issue.code,
        severity: issue.severity,
        message: issue.message,
      });
    }
    if (status.prototype?.approved === true && status.qualityGate?.approvalAllowed === false) {
      issues.push({
        slug: status.slug,
        code: "approved-prototype-quality-gate-drift",
        severity: "blocker",
        message: "prototype is approved while quality gate has BLOCKER/high findings",
      });
    }
  }
  return {
    pass: !issues.some((issue) => issue.severity === "blocker" || issue.severity === "high"),
    checked: slugs.length,
    issues,
  };
}

export function formatDesignWorkflowStateValidation(result = {}) {
  const lines = [
    "SUPERVIBE_DESIGN_WORKFLOW_STATE",
    `PASS: ${result.pass === true}`,
    `CHECKED: ${result.checked || 0}`,
    `ISSUES: ${(result.issues || []).length}`,
  ];
  for (const issue of result.issues || []) {
    lines.push(`ISSUE: ${issue.severity} ${issue.slug || "none"} ${issue.code} - ${issue.message}`);
  }
  return lines.join("\n");
}

function listPrototypeSlugs(rootDir) {
  const root = artifactRoot(rootDir, "prototypes");
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_") && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .filter((slug) => existsSync(join(root, slug, "config.json")) || existsSync(join(root, slug, "index.html")))
    .sort();
}

function parseArgs(argv = process.argv) {
  const options = { root: process.cwd(), slug: "", json: false };
  for (let index = 2; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    if (key === "json") {
      options.json = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      options[key] = true;
      continue;
    }
    options[key] = value;
    index += 1;
  }
  return options;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv);
  const result = validateDesignWorkflowState(options.root, {
    slug: options.slug,
  });
  console.log(options.json ? JSON.stringify(result, null, 2) : formatDesignWorkflowStateValidation(result));
  process.exit(result.pass ? 0 : 2);
}
