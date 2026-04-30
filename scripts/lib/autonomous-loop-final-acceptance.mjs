import { approvalReceiptSummaryForSideEffect } from "./supervibe-approval-receipt-ledger.mjs";

export function evaluateFinalAcceptance({
  state = {},
  preflight = {},
  tasks = [],
  scores = [],
  handoffs = [],
  sideEffects = [],
  dispatches = [],
  mcpPlans = [],
  retentionPolicy = null,
  provenance = null,
  verificationMatrix = [],
  failurePackets = [],
  sideEffectStatus = null,
  pluginPackageAudit = null,
  releaseSecurityAudit = null,
  evalReport = null,
  approvalReceipts = [],
} = {}) {
  const missing = [];
  const scoreByTask = new Map(scores.map((score) => [score.taskId, score]));
  const handoffByTask = new Map(handoffs.map((handoff) => [handoff.taskId, handoff]));
  const completeTasks = tasks.filter((task) => task.status === "complete");
  const blockedTasks = tasks.filter((task) => isBlockedStatus(task.status));
  const openTasks = tasks.filter((task) => ["open", "ready", "claimed", "in_progress", "failed"].includes(task.status));

  requireField(state, "schema_version", missing, "state schema version");
  requireField(state, "command_version", missing, "state command version");
  requireField(state, "rubric_version", missing, "state rubric version");
  requireField(state, "plugin_version", missing, "state plugin version");

  const approvalLease = preflight.approval_lease || {};
  for (const field of ["scope", "environment", "budget", "duration", "expires_after_loops", "expires_at", "renewal_triggers"]) {
    requireField(approvalLease, field, missing, `approval lease ${field}`);
  }
  if (!Array.isArray(approvalLease.tools)) missing.push("approval lease tools must be an array");
  if (!Array.isArray(approvalLease.renewal_triggers) || approvalLease.renewal_triggers.length === 0) {
    missing.push("approval lease renewal triggers");
  }

  if (dispatches.length < tasks.length) missing.push("dispatch coverage for every task");
  for (const dispatch of dispatches) {
    if (!dispatch.routingSignals?.policyRisk) missing.push(`dispatch ${dispatch.taskId} policy routing signal`);
    if (!dispatch.availabilityChecks || !("reviewer" in dispatch.availabilityChecks)) {
      missing.push(`dispatch ${dispatch.taskId} reviewer availability check`);
    }
    if (state.assignment_explanations_required && !dispatch.assignmentExplanation) {
      missing.push(`dispatch ${dispatch.taskId} assignment explanation`);
    }
  }

  if (mcpPlans.length < tasks.length) missing.push("MCP plan or fallback for every task");
  if (openTasks.length > 0) missing.push(`task graph is not closed: ${openTasks.map((task) => task.id).join(", ")}`);
  if (blockedTasks.length > 0 && !state.stop_reason) missing.push("blocked graph requires explicit stop reason");
  if (blockedTasks.length > 0 && !state.next_action) missing.push("blocked graph requires next safe action");

  const matrixTaskIds = new Set(verificationMatrix.map((entry) => entry.taskId));
  if (completeTasks.length > 0 && verificationMatrix.length === 0) {
    missing.push("verification matrix coverage");
  }
  for (const task of completeTasks) {
    if (!matrixTaskIds.has(task.id) && !task.testGapAccepted) {
      missing.push(`task ${task.id} verification matrix evidence`);
    }
  }
  for (const packet of failurePackets) {
    const packetTask = tasks.find((task) => task.id === packet.taskId);
    if (packet.confidenceCap < 9 && packetTask?.status !== "complete") {
      missing.push(`failure packet unresolved for task ${packet.taskId}: ${packet.requeueReason}`);
    }
  }

  for (const task of tasks) {
    const score = scoreByTask.get(task.id);
    if (task.status === "complete" && (!score || score.finalScore < 9)) {
      missing.push(`task ${task.id} completed below 9`);
    }

    const handoff = handoffByTask.get(task.id);
    if (task.status === "complete" && !handoff) {
      missing.push(`task ${task.id} handoff`);
    } else if (handoff) {
      for (const field of ["sourceAgent", "targetAgent", "confidenceScore", "contextPack", "sideEffectId"]) {
        requireField(handoff, field, missing, `handoff ${task.id} ${field}`);
      }
      if (!handoff.contextPack?.rulesLoaded?.length) missing.push(`handoff ${task.id} rule context`);
      if (!handoff.contextPack?.mcpPlan) missing.push(`handoff ${task.id} MCP plan`);
      if (requiresIndependentReview(task) && !handoff.reviewerEvidence?.independent) {
        missing.push(`task ${task.id} independent reviewer evidence`);
      }
    }
  }

  if (sideEffects.length < completeTasks.length) missing.push("side-effect ledger entry for every completed task");
  for (const sideEffect of sideEffects) {
    requireField(sideEffect, "idempotencyKey", missing, `side effect ${sideEffect.actionId} idempotency key`);
    requireField(sideEffect, "approvalLeaseId", missing, `side effect ${sideEffect.actionId} approval lease`);
    if ((sideEffect.requiresApproval || sideEffect.policyRiskLevel === "high") && !sideEffect.approvalReceiptId) {
      missing.push(`side effect ${sideEffect.actionId} approval receipt`);
    }
    if (sideEffect.approvalReceiptId && !approvalReceipts.some((receipt) => receipt.receiptId === sideEffect.approvalReceiptId)) {
      missing.push(`side effect ${sideEffect.actionId} approval receipt not found`);
    }
    if (sideEffect.expectedSideEffect !== "dry-run-no-mutation") {
      requireField(sideEffect, "verificationCommand", missing, `side effect ${sideEffect.actionId} verification`);
      requireField(sideEffect, "rollbackOrCleanupAction", missing, `side effect ${sideEffect.actionId} rollback`);
    }
  }
  if (sideEffectStatus && sideEffectStatus.ok === false) {
    missing.push(`side-effect reconciliation: ${sideEffectStatus.status}`);
  }

  const openGates = state.gate_summary?.open ?? (state.gates || []).filter((gate) => ["open", "waiting", "blocked"].includes(gate.status)).length;
  if (openGates > 0 && !state.gate_summary) missing.push("unresolved gates summary");
  if (!state.progress_summary) missing.push("progress summary artifact");
  if (!state.final_report_provenance && !provenance) missing.push("final report artifact provenance");

  if (!retentionPolicy?.privacyMode || !retentionPolicy?.pruningCommand) missing.push("retention and pruning policy");
  if (!state.memory_write_policy?.redaction || !state.memory_write_policy?.stale_filter) {
    missing.push("durable memory hygiene policy");
  }
  if (!provenance?.taskIds?.length || !provenance?.scoreTaskIds?.length) {
    missing.push("final report provenance");
  }
  if (state.release_gate?.plugin_package_audit_required && !pluginPackageAudit) {
    missing.push("plugin package audit");
  }
  if (pluginPackageAudit?.pass === false) {
    const issue = pluginPackageAudit.issues?.[0]?.code || "failed";
    missing.push(`plugin package audit: ${issue}`);
  }
  if (state.release_gate?.release_security_required && !releaseSecurityAudit) {
    missing.push("release security audit");
  }
  if (releaseSecurityAudit?.pass === false) {
    const issue = releaseSecurityAudit.issues?.[0]?.code || "failed";
    missing.push(`release security audit: ${issue}`);
  }
  if (state.release_gate?.eval_replay_required && !evalReport) {
    missing.push("autonomous loop replay eval report");
  }
  if (evalReport?.pass === false) {
    const regression = evalReport.summary?.topRegressions?.[0] || "failed";
    missing.push(`autonomous loop replay eval: ${regression}`);
  }

  return {
    pass: missing.length === 0,
    score: missing.length === 0 ? 10 : Math.max(0, Number((10 - missing.length * 0.5).toFixed(1))),
    missing,
    assignmentExplanationSummary: summarizeAssignmentExplanations(dispatches),
    approvalReceiptSummary: sideEffects.map((sideEffect) => approvalReceiptSummaryForSideEffect(sideEffect, approvalReceipts)),
  };
}

function requireField(object, field, missing, label) {
  const value = object?.[field];
  if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) {
    missing.push(label);
  }
}

function isBlockedStatus(status) {
  return ["blocked", "policy_stopped", "budget_stopped", "command_adapter_required"].includes(status);
}

function requiresIndependentReview(task = {}) {
  const text = `${task.goal || ""} ${task.category || ""}`.toLowerCase();
  return task.policyRiskLevel === "high"
    || /security|production|shared contract|broad refactor|architecture/.test(text);
}

function summarizeAssignmentExplanations(dispatches = []) {
  const explained = dispatches.filter((dispatch) => dispatch.assignmentExplanation);
  return {
    totalDispatches: dispatches.length,
    explainedDispatches: explained.length,
    manualAssignments: explained.filter((dispatch) => dispatch.assignmentExplanation.workerAgentId === "manual").length,
    serializedOrBlocked: explained.filter((dispatch) => (dispatch.assignmentExplanation.notParallelizedBecause || []).length > 0).length,
  };
}
