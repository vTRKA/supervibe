#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildRuntimeCommandAgentPlan,
  commandAgentPlanStrictReady,
} from "./command-agent-plan.mjs";
import {
  validateDesignAgentInvocationReceipts,
} from "./lib/design-agent-orchestration.mjs";
import {
  validateDesignVariantSet,
} from "./lib/design-variant-set.mjs";

const PLUGIN_ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));

export function validateActiveWorkflows(rootDir = process.cwd(), options = {}) {
  const workflows = discoverActiveWorkflows(rootDir, options);
  const checks = [];
  const issues = [];
  const warnings = [];
  if (workflows.length === 0) {
    warnings.push({
      code: "active-workflow-not-started",
      file: ".supervibe/memory/active-workflow.json",
      message: "no active workflow state was found; this is diagnostic only and does not prove active workflow completion",
    });
  }
  for (const workflow of workflows) {
    const commandReport = buildRuntimeCommandAgentPlan({
      command: workflow.command,
      projectRoot: rootDir,
      pluginRoot: options.pluginRoot || PLUGIN_ROOT,
      host: workflow.host || options.host || null,
      workflowContext: {
        active: true,
        slug: workflow.slug || "",
        handoffId: workflow.handoffId || "",
        workflowRunId: workflow.workflowRunId || "",
        requestedVariantCount: workflow.requestedVariantCount || 0,
      },
    });
    const commandPass = commandAgentPlanStrictReady(commandReport);
    checks.push({
      id: "command-agent-plan:active",
      command: workflow.command,
      pass: commandPass,
      report: commandReport,
    });
    if (!commandPass) {
      const plan = commandReport.plan || {};
      issues.push({
        code: "active-command-agent-plan-blocked",
        file: ".supervibe/artifacts/_workflow-invocations",
        message: `${workflow.command}: active scoped receipt gate is not clean: durableWritesAllowed=${plan.durableWritesAllowed === true}, receiptGate=${plan.receiptGate || "unknown"}, missingScoped=${(plan.scopedReceiptTrust?.missingSubjects || []).join(",") || "none"}`,
      });
    }

    if (normalizeCommand(workflow.command) === "/supervibe-design") {
      const designReceipts = validateDesignAgentInvocationReceipts(rootDir, {
        active: true,
        slug: workflow.slug || "",
        handoffId: workflow.handoffId || "",
        workflowRunId: workflow.workflowRunId || "",
      });
      checks.push({
        id: "validate:design-agent-receipts:active",
        command: workflow.command,
        pass: designReceipts.pass === true,
        report: designReceipts,
      });
      for (const issue of designReceipts.issues || []) {
        issues.push({
          code: "active-design-agent-receipts-blocked",
          file: issue.file || ".supervibe/artifacts/_workflow-invocations/supervibe-design",
          message: `${issue.code || "design-agent-receipts"}: ${issue.message || "active design receipt validator failed"}`,
        });
      }
      if (Number(workflow.requestedVariantCount || 0) > 0) {
        const variantSet = validateDesignVariantSet(rootDir, {
          slug: workflow.slug || "",
          requestedVariantCount: workflow.requestedVariantCount,
        });
        checks.push({
          id: "validate:design-variant-set:active",
          command: workflow.command,
          pass: variantSet.pass === true && variantSet.status !== "not-started",
          report: variantSet,
        });
        if (variantSet.pass !== true || variantSet.status === "not-started") {
          for (const issue of variantSet.issues || []) {
            issues.push({
              code: "active-design-variant-set-blocked",
              file: issue.file || ".supervibe/artifacts/prototypes",
              message: `${issue.code || "design-variant-set"}: ${issue.message || "active design variant set failed"}`,
            });
          }
          if (!variantSet.issues?.length) {
            issues.push({
              code: "active-design-variant-set-not-started",
              file: variantSet.manifestPath || ".supervibe/artifacts/prototypes",
              message: "active design variant set returned not-started; requested variants require concrete artifacts",
            });
          }
        }
      }
    }
  }
  return {
    pass: issues.length === 0,
    status: workflows.length === 0 ? "not-started" : issues.length === 0 ? "passed" : "blocked",
    activeWorkflows: workflows.length,
    checked: checks.length,
    checks,
    issues,
    warnings,
  };
}

export function discoverActiveWorkflows(rootDir = process.cwd(), options = {}) {
  const explicitCommand = options.command || process.env.SUPERVIBE_ACTIVE_COMMAND || "";
  const explicit = explicitCommand
    ? [{
      command: explicitCommand,
      host: options.host || process.env.SUPERVIBE_ACTIVE_HOST || "",
      slug: options.slug || process.env.SUPERVIBE_ACTIVE_SLUG || "",
      handoffId: options.handoffId || process.env.SUPERVIBE_ACTIVE_HANDOFF_ID || "",
      workflowRunId: options.workflowRunId || process.env.SUPERVIBE_ACTIVE_WORKFLOW_RUN_ID || "",
      requestedVariantCount: options.requestedVariantCount || options.requestedVariants || process.env.SUPERVIBE_ACTIVE_REQUESTED_VARIANTS || "",
      target: options.target || process.env.SUPERVIBE_ACTIVE_TARGET || "",
      mode: options.mode || process.env.SUPERVIBE_ACTIVE_MODE || "",
      requiresCapabilityPlan: options.requiresCapabilityPlan || options.requireCapabilityPlan || process.env.SUPERVIBE_ACTIVE_REQUIRES_CAPABILITY_PLAN || false,
      requireBrowserEvidence: options.requireBrowserEvidence || process.env.SUPERVIBE_ACTIVE_REQUIRES_BROWSER_EVIDENCE || false,
    }]
    : [];
  const files = [
    join(rootDir, ".supervibe", "memory", "active-workflow.json"),
    join(rootDir, ".supervibe", "memory", "active-workflows.json"),
  ];
  const persisted = files.flatMap(readActiveWorkflowFile);
  return uniqueWorkflows([...explicit, ...persisted]
    .filter((item) => item && normalizeCommand(item.command)));
}

export function formatActiveWorkflowValidation(result = {}) {
  const lines = [
    "SUPERVIBE_ACTIVE_WORKFLOWS",
    `PASS: ${result.pass === true}`,
    `ACTIVE_WORKFLOWS: ${result.activeWorkflows || 0}`,
    `STATUS: ${result.status || "unknown"}`,
    `CHECKS: ${result.checked || 0}`,
    `ISSUES: ${(result.issues || []).length}`,
    `WARNINGS: ${(result.warnings || []).length}`,
  ];
  for (const check of result.checks || []) {
    lines.push(`CHECK: ${check.id} ${check.command || "unknown"} pass=${check.pass === true}`);
  }
  for (const issue of result.issues || []) {
    lines.push(`ISSUE: ${issue.code} ${issue.file} - ${issue.message}`);
  }
  for (const warning of result.warnings || []) {
    lines.push(`WARNING: ${warning.code} ${warning.file} - ${warning.message}`);
  }
  return lines.join("\n");
}

function readActiveWorkflowFile(path) {
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    const items = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.activeWorkflows)
        ? parsed.activeWorkflows
        : parsed.command
          ? [parsed]
          : [];
    return items.map((item) => ({
      command: item.command || item.workflow || item.activeCommand,
      host: item.host || item.activeHost || "",
      slug: item.slug || item.prototypeSlug || "",
      handoffId: item.handoffId || item.handoff || "",
      workflowRunId: item.workflowRunId || item.workflow_run_id || "",
      requestedVariantCount: item.requestedVariantCount || item.requestedVariants || item.variantCount || item.requested_variants || "",
      target: item.target || "",
      mode: item.mode || "",
      requiresCapabilityPlan: item.requiresCapabilityPlan || item.requireCapabilityPlan || false,
      requireBrowserEvidence: item.requireBrowserEvidence || item.requiresBrowserEvidence || false,
    }));
  } catch {
    return [];
  }
}

function uniqueWorkflows(items = []) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const normalized = {
      command: normalizeCommand(item.command),
      host: item.host || "",
      slug: item.slug || "",
      handoffId: item.handoffId || "",
      workflowRunId: item.workflowRunId || "",
      requestedVariantCount: normalizeRequestedVariantCount(item.requestedVariantCount),
      target: item.target || "",
      mode: item.mode || "",
      requiresCapabilityPlan: boolish(item.requiresCapabilityPlan),
      requireBrowserEvidence: boolish(item.requireBrowserEvidence),
    };
    const key = JSON.stringify(normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

function normalizeCommand(value = "") {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function parseArgs(argv = []) {
  const options = {};
  for (let index = 2; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      options[key] = true;
      continue;
    }
    options[key] = next;
    index += 1;
  }
  return options;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv);
  const rootDir = resolve(options.root || process.cwd());
  const result = validateActiveWorkflows(rootDir, {
    command: options.command || options.workflow,
    host: options.host,
    slug: options.slug,
    handoffId: options["handoff-id"] || options.handoffId,
    workflowRunId: options["workflow-run-id"] || options.workflowRunId,
    requestedVariantCount: options["requested-variants"] || options.requestedVariantCount || options.requestedVariants,
    target: options.target,
    mode: options.mode,
    requiresCapabilityPlan: options["require-capability-plan"] || options.requiresCapabilityPlan || options.requireCapabilityPlan,
    requireBrowserEvidence: options["require-browser-evidence"] || options.requireBrowserEvidence,
    pluginRoot: options["plugin-root"] || options.pluginRoot,
  });
  console.log(options.json ? JSON.stringify(result, null, 2) : formatActiveWorkflowValidation(result));
  process.exit(result.pass ? 0 : 1);
}

function normalizeRequestedVariantCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count >= 1 ? Math.trunc(count) : 0;
}

function boolish(value) {
  if (value === true) return true;
  if (value === false || value === null || value === undefined) return false;
  return /^(1|true|yes|on|required)$/i.test(String(value));
}
