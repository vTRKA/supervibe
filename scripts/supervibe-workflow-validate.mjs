#!/usr/bin/env node
import { fileURLToPath } from "node:url";

import {
  validateAgentProducerReceipts,
} from "./lib/agent-producer-contract.mjs";
import {
  evaluateDesignQualityGate,
} from "./lib/design-quality-gate-aggregator.mjs";
import {
  validateDesignAgentInvocationReceipts,
} from "./lib/design-agent-orchestration.mjs";
import {
  validatePrototypeProductionRegression,
} from "./lib/prototype-production-regression.mjs";
import {
  validateAllDesignVariantSets,
  validateDesignVariantSet,
} from "./lib/design-variant-set.mjs";
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
  validateDesignPreviewDaemon,
} from "./validate-design-preview-daemon.mjs";
import {
  validateDesignWizard,
} from "./validate-design-wizard.mjs";
import {
  buildRuntimeCommandAgentPlan,
} from "./command-agent-plan.mjs";

function parseArgs(argv) {
  const options = {
    workflow: "/supervibe-design",
    root: process.cwd(),
    pluginRoot: null,
    slug: "",
    json: false,
    active: false,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--json") {
      options.json = true;
      continue;
    }
    if (item === "--active") {
      options.active = true;
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
  pluginRoot = null,
  active = false,
  host = null,
  handoffId = "",
  workflowRunId = "",
  prototypePath = "",
  productionPath = "",
  requireProductionPair = false,
} = {}) {
  const designWorkflow = workflow === "/supervibe-design" || workflow === "supervibe-design";
  const resolvedPluginRoot = pluginRoot || fileURLToPath(new URL("../", import.meta.url));
  const checks = [
    check("workflow-receipts", validateWorkflowReceipts(rootDir)),
    check("agent-producer-receipts", validateAgentProducerReceipts(rootDir)),
    check("text-encoding", validateTextEncoding(rootDir), { blocking: !designWorkflow }),
    check("skill-source-report", buildSkillSourceReport({ projectRoot: rootDir })),
  ];
  if (active) {
    checks.unshift(check("command-agent-plan", commandAgentPlanResult({
      workflow,
      rootDir,
      pluginRoot: resolvedPluginRoot,
      host,
      active,
      slug,
      handoffId,
      workflowRunId,
    })));
  }
  if (designWorkflow) {
    checks.push(check("design-wizard", validateDesignWizard(resolvedPluginRoot)));
    checks.push(check("design-preview-daemon", validateDesignPreviewDaemon(resolvedPluginRoot)));
    checks.push(check("design-variant-set", slug
      ? validateDesignVariantSet(rootDir, { slug })
      : validateAllDesignVariantSets(rootDir)));
    checks.push(check("design-agent-receipts", validateDesignAgentInvocationReceipts(rootDir, {
      active,
      slug,
      handoffId,
      workflowRunId,
    })));
    if (active && slug) {
      checks.push(check("design-quality-gate", evaluateDesignQualityGate(rootDir, {
        slug,
        requireReviews: true,
      })));
    }
    if (requireProductionPair || prototypePath || productionPath) {
      checks.push(check("prototype-production-regression", validatePrototypeProductionRegression(rootDir, {
        slug,
        prototypePath,
        productionPath,
        requirePair: active || requireProductionPair,
      }), { critical: true }));
    }
  }
  const skippedCritical = checks.filter((item) => item.critical && isSkippedCritical(item.result)).length;
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
    active: active === true,
    skippedCritical,
    pass: skippedCritical === 0 && checks.every((item) => item.blocking === false || item.pass),
    checks,
    issues,
  };
}

export function formatWorkflowValidationReport(result = {}) {
  const lines = [
    "SUPERVIBE_WORKFLOW_VALIDATE",
    `WORKFLOW: ${result.workflow || "unknown"}`,
    `SLUG: ${result.slug || "none"}`,
    `ACTIVE: ${result.active === true}`,
    `PASS: ${result.pass === true}`,
    `CHECKS: ${result.checks?.length || 0}`,
    `SKIPPED_CRITICAL: ${result.skippedCritical || 0}`,
  ];
  for (const item of result.checks || []) {
    lines.push(`CHECK: ${item.id} pass=${item.pass} issues=${item.issueCount}${item.blocking === false ? " blocking=false" : ""}`);
  }
  lines.push(`ISSUES: ${result.issues?.length || 0}`);
  for (const issue of result.issues || []) {
    lines.push(`ISSUE: ${issue.check} ${issue.code} ${issue.file} - ${issue.message}`);
  }
  return lines.join("\n");
}

function check(id, result = {}, { blocking = true, critical = false } = {}) {
  const issueCount = Array.isArray(result.issues)
    ? result.issues.length
    : Array.isArray(result.encodingIssues)
      ? result.encodingIssues.length
      : 0;
  return {
    id,
    pass: result.pass === true,
    blocking,
    critical,
    issueCount,
    result,
  };
}

function commandAgentPlanResult({
  workflow,
  rootDir,
  pluginRoot,
  host,
  active,
  slug,
  handoffId,
  workflowRunId,
}) {
  const report = buildRuntimeCommandAgentPlan({
    command: workflow,
    projectRoot: rootDir,
    pluginRoot,
    host,
    workflowContext: {
      active,
      slug,
      handoffId,
      workflowRunId,
    },
  });
  const plan = report.plan || {};
  const commandReady = report.pass === true && plan.durableWritesAllowed === true;
  const issues = commandReady ? [] : [{
    code: plan.receiptGate || plan.executionMode || "command-agent-plan-blocked",
    file: ".supervibe/artifacts/_workflow-invocations",
    message: plan.qualityImpact || `command agent plan blocked for ${workflow}`,
  }];
  return {
    pass: commandReady,
    executionMode: plan.executionMode,
    callableAgentsReady: plan.callableAgentsReady === true,
    durableWritesAllowed: plan.durableWritesAllowed === true,
    receiptGate: plan.receiptGate || null,
    scopedReceiptGateActive: plan.scopedReceiptGateActive === true,
    missingScopedReceipts: plan.scopedReceiptTrust?.missingSubjects || [],
    missingCallableAgents: plan.missingCallableAgents || [],
    issues,
  };
}

function isSkippedCritical(result = {}) {
  return ["missing-pair-path", "pair-not-found"].includes(result.status);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv);
  const result = validateWorkflow(options.root, {
    workflow: options.workflow,
    slug: options.slug,
    pluginRoot: options.pluginRoot || options["plugin-root"],
    active: options.active === true,
    host: options.host || null,
    handoffId: options.handoffId || options["handoff-id"] || "",
    workflowRunId: options.workflowRunId || options["workflow-run-id"] || "",
    prototypePath: options.prototype || options.prototypePath || "",
    productionPath: options.production || options.productionPath || "",
    requireProductionPair: options["require-production-pair"] === true || options.requireProductionPair === true,
  });
  console.log(options.json ? JSON.stringify(result, null, 2) : formatWorkflowValidationReport(result));
  process.exit(result.pass ? 0 : 1);
}
