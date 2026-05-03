#!/usr/bin/env node
import { fileURLToPath } from "node:url";

import {
  validateAgentProducerReceipts,
} from "./lib/agent-producer-contract.mjs";
import {
  validateDesignAgentInvocationReceipts,
} from "./lib/design-agent-orchestration.mjs";
import {
  buildSkillSourceReport,
} from "./lib/skill-source-resolver.mjs";
import {
  validateTextEncoding,
} from "./lib/text-encoding-quality.mjs";
import {
  validateWorkflowReceipts,
} from "./lib/supervibe-workflow-receipt-runtime.mjs";
import {
  validateDesignWizard,
} from "./validate-design-wizard.mjs";

function parseArgs(argv) {
  const options = {
    workflow: "/supervibe-design",
    root: process.cwd(),
    slug: "",
    json: false,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--json") {
      options.json = true;
      continue;
    }
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
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

export function validateWorkflow(rootDir = process.cwd(), {
  workflow = "/supervibe-design",
  slug = "",
} = {}) {
  const checks = [
    check("workflow-receipts", validateWorkflowReceipts(rootDir)),
    check("agent-producer-receipts", validateAgentProducerReceipts(rootDir)),
    check("text-encoding", validateTextEncoding(rootDir)),
    check("skill-source-report", buildSkillSourceReport({ projectRoot: rootDir })),
  ];
  if (workflow === "/supervibe-design" || workflow === "supervibe-design") {
    checks.push(check("design-wizard", validateDesignWizard(rootDir)));
    checks.push(check("design-agent-receipts", validateDesignAgentInvocationReceipts(rootDir)));
  }
  const issues = checks.flatMap((item) => (item.result.issues || item.result.encodingIssues || []).map((issue) => ({
    check: item.id,
    code: issue.code || "issue",
    file: issue.file || issue.path || "",
    message: issue.message || JSON.stringify(issue),
  })));
  return {
    schemaVersion: 1,
    workflow,
    slug: slug || null,
    pass: checks.every((item) => item.pass),
    checks,
    issues,
  };
}

export function formatWorkflowValidationReport(result = {}) {
  const lines = [
    "SUPERVIBE_WORKFLOW_VALIDATE",
    `WORKFLOW: ${result.workflow || "unknown"}`,
    `SLUG: ${result.slug || "none"}`,
    `PASS: ${result.pass === true}`,
    `CHECKS: ${result.checks?.length || 0}`,
  ];
  for (const item of result.checks || []) {
    lines.push(`CHECK: ${item.id} pass=${item.pass} issues=${item.issueCount}`);
  }
  lines.push(`ISSUES: ${result.issues?.length || 0}`);
  for (const issue of result.issues || []) {
    lines.push(`ISSUE: ${issue.check} ${issue.code} ${issue.file} - ${issue.message}`);
  }
  return lines.join("\n");
}

function check(id, result = {}) {
  const issueCount = Array.isArray(result.issues)
    ? result.issues.length
    : Array.isArray(result.encodingIssues)
      ? result.encodingIssues.length
      : 0;
  return {
    id,
    pass: result.pass === true,
    issueCount,
    result,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv);
  const result = validateWorkflow(options.root, {
    workflow: options.workflow,
    slug: options.slug,
  });
  console.log(options.json ? JSON.stringify(result, null, 2) : formatWorkflowValidationReport(result));
  process.exit(result.pass ? 0 : 1);
}
