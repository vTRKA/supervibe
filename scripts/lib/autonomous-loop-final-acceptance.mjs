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
} = {}) {
  const missing = [];
  const scoreByTask = new Map(scores.map((score) => [score.taskId, score]));
  const handoffByTask = new Map(handoffs.map((handoff) => [handoff.taskId, handoff]));

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
  }

  if (mcpPlans.length < tasks.length) missing.push("MCP plan or fallback for every task");

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
    }
  }

  if (sideEffects.length < tasks.length) missing.push("side-effect ledger entry for every task");
  for (const sideEffect of sideEffects) {
    requireField(sideEffect, "idempotencyKey", missing, `side effect ${sideEffect.actionId} idempotency key`);
    requireField(sideEffect, "approvalLeaseId", missing, `side effect ${sideEffect.actionId} approval lease`);
    if (sideEffect.expectedSideEffect !== "dry-run-no-mutation") {
      requireField(sideEffect, "verificationCommand", missing, `side effect ${sideEffect.actionId} verification`);
      requireField(sideEffect, "rollbackOrCleanupAction", missing, `side effect ${sideEffect.actionId} rollback`);
    }
  }

  if (!retentionPolicy?.privacyMode || !retentionPolicy?.pruningCommand) missing.push("retention and pruning policy");
  if (!state.memory_write_policy?.redaction || !state.memory_write_policy?.stale_filter) {
    missing.push("durable memory hygiene policy");
  }
  if (!provenance?.taskIds?.length || !provenance?.scoreTaskIds?.length) {
    missing.push("final report provenance");
  }

  return {
    pass: missing.length === 0,
    score: missing.length === 0 ? 10 : Math.max(0, Number((10 - missing.length * 0.5).toFixed(1))),
    missing,
  };
}

function requireField(object, field, missing, label) {
  const value = object?.[field];
  if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) {
    missing.push(label);
  }
}
