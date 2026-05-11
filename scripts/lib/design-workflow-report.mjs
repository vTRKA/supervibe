import {
  validateActiveWorkflows,
} from "../validate-active-workflows.mjs";
import {
  validateDesignWorkflowState,
} from "../validate-design-workflow-state.mjs";
import {
  validateDesignActiveCompletion,
} from "./design-active-completion.mjs";

export function buildDesignWorkflowReport(rootDir = process.cwd(), options = {}) {
  const activeCompletion = options.activeCompletionResult || validateDesignActiveCompletion(rootDir, options);
  const activeWorkflows = options.activeWorkflowsResult || validateActiveWorkflows(rootDir, options);
  const workflowState = options.workflowStateResult || validateDesignWorkflowState(rootDir, {
    slug: options.slug || "",
  });
  const commandPlan = findCheckResult(activeCompletion, "command-agent-plan:active")?.plan || {};
  const receiptValidation = findCheckResult(activeCompletion, "design-agent-receipts:active") || {};
  const variantSet = findCheckResult(activeCompletion, "design-variant-set:active") || {};
  const screenshot = findCheckResult(activeCompletion, "screenshot-similarity:active") || {};
  const browser = findCheckResult(activeCompletion, "browser-evidence:active") || {};
  const requiredAgents = commandPlan.requiredAgentIds || [];
  const invokedAgents = receiptValidation.receiptsBySubject
    ? Object.keys(receiptValidation.receiptsBySubject)
    : [];
  const missingReceipts = unique([
    ...(commandPlan.scopedReceiptTrust?.missingSubjects || []),
    ...(receiptValidation.missingSubjects || []),
    ...(receiptValidation.issues || [])
      .map((issue) => issue.expectedAgentId || issue.subjectId)
      .filter(Boolean),
  ]);
  const evidencePaths = unique([
    variantSet.manifestPath,
    screenshot.evidencePath,
    browser.evidencePath,
    ...(activeCompletion.checks || [])
      .flatMap((check) => evidencePathsFromValue(check.result)),
  ]);
  const issues = [
    ...(activeCompletion.issues || []),
    ...(activeWorkflows.issues || []),
    ...(workflowState.issues || []),
  ];
  const warnings = [
    ...(activeCompletion.warnings || []),
    ...(activeWorkflows.warnings || []),
  ];
  const activeCompletionStatus = String(activeCompletion.status || "");
  const activeWorkflowsStatus = String(activeWorkflows.status || "");
  const activeWorkflowReadiness = activeCompletionStatus === "not-started" || activeWorkflowsStatus === "not-started"
    ? "not-started"
    : activeCompletion.pass === true && activeCompletionStatus === "passed"
      ? "ready"
      : "blocked";
  const declaredMaturity = options.declaredMaturity || "diagnostic-only";
  const pass = activeWorkflowReadiness === "ready"
    && activeWorkflows.pass === true
    && workflowState.pass === true;

  return {
    schemaVersion: 1,
    command: options.command || activeCompletion.command || null,
    slug: options.slug || activeCompletion.slug || null,
    handoffId: options.handoffId || activeCompletion.handoffId || null,
    pass,
    status: pass ? "passed" : activeWorkflowReadiness,
    declaredMaturity,
    activeWorkflowReadiness,
    requiredAgents,
    invokedAgents,
    missingReceipts,
    evidencePaths,
    checked: {
      activeCompletion: activeCompletion.checks?.length || 0,
      activeWorkflows: activeWorkflows.checked || 0,
      workflowState: workflowState.checked || 0,
    },
    reports: {
      activeCompletion,
      activeWorkflows,
      workflowState,
    },
    issues,
    warnings,
    nextRepairAction: nextRepairAction({ activeCompletion, activeWorkflows, workflowState, issues }),
  };
}

export function formatDesignWorkflowReport(report = {}) {
  const lines = [
    "SUPERVIBE_DESIGN_WORKFLOW_REPORT",
    `PASS: ${report.pass === true}`,
    `STATUS: ${report.status || "unknown"}`,
    `DECLARED_MATURITY: ${report.declaredMaturity || "unknown"}`,
    `ACTIVE_WORKFLOW_READINESS: ${report.activeWorkflowReadiness || "unknown"}`,
    `COMMAND: ${report.command || "none"}`,
    `SLUG: ${report.slug || "none"}`,
    `HANDOFF_ID: ${report.handoffId || "none"}`,
    `REQUIRED_AGENTS: ${(report.requiredAgents || []).join(", ") || "none"}`,
    `INVOKED_AGENTS: ${(report.invokedAgents || []).join(", ") || "none"}`,
    `MISSING_RECEIPTS: ${(report.missingReceipts || []).join(", ") || "none"}`,
    `EVIDENCE_PATHS: ${(report.evidencePaths || []).join(", ") || "none"}`,
    `ISSUES: ${(report.issues || []).length}`,
    `WARNINGS: ${(report.warnings || []).length}`,
  ];
  for (const issue of report.issues || []) {
    lines.push(`ISSUE: ${issue.code || "issue"} ${issue.file || ""} - ${issue.message || ""}`.trim());
  }
  for (const warning of report.warnings || []) {
    lines.push(`WARNING: ${warning.code || "warning"} ${warning.file || ""} - ${warning.message || ""}`.trim());
  }
  lines.push(`NEXT_REPAIR_ACTION: ${report.nextRepairAction || "none"}`);
  return lines.join("\n");
}

function findCheckResult(activeCompletion = {}, id = "") {
  return (activeCompletion.checks || []).find((check) => check.id === id)?.result || null;
}

function evidencePathsFromValue(value) {
  if (!value || typeof value !== "object") return [];
  const out = [];
  for (const key of ["manifestPath", "evidencePath", "launcherPath", "planPath"]) {
    if (typeof value[key] === "string" && value[key]) out.push(value[key]);
  }
  return out;
}

function nextRepairAction({ activeCompletion, activeWorkflows, workflowState, issues }) {
  if (activeCompletion?.nextAction && activeCompletion.nextAction !== "none") return activeCompletion.nextAction;
  if (activeWorkflows?.issues?.length) return "repair active workflow scoped receipts and rerun validate-active-workflows";
  if (workflowState?.issues?.length) return "sync design workflow state and rerun validate-design-workflow-state";
  if (issues?.length) return "repair listed design workflow blockers";
  return "design workflow report is ready";
}

function unique(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}
