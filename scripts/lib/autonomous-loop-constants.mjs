export const LOOP_SCHEMA_VERSION = 1;
export const LOOP_COMMAND_VERSION = 1;
export const LOOP_RUBRIC_VERSION = 1;

const TASK_STATUSES = [
  "pending",
  "running",
  "blocked",
  "needs_redesign",
  "needs_implementation",
  "needs_review",
  "needs_repair",
  "needs_plan_update",
  "rule_violation",
  "scenario_uncovered",
  "context_stale",
  "memory_required",
  "retrieval_required",
  "agent_unavailable",
  "capability_gap",
  "token_budget_stopped",
  "environment_blocked",
  "platform_unsupported",
  "command_adapter_required",
  "deployment_approval_required",
  "mcp_required",
  "sdlc_gate_failed",
  "confidence_calibration_required",
  "state_migration_required",
  "state_version_unsupported",
  "workspace_conflict",
  "audit_trail_required",
  "rollback_required",
  "side_effect_reconciliation_required",
  "cleanup_required",
  "preflight_required",
  "awaiting_user_input",
  "access_data_required",
  "approval_expired",
  "approval_scope_changed",
  "e2e_fixture_failed",
  "scored_below_gate",
  "complete",
  "partial",
  "cancel_requested",
  "cancel_timeout",
  "cancelled",
  "policy_stopped",
  "budget_stopped",
];

export const HIGH_RISK_ACTIONS = [
  "production_deploy",
  "destructive_migration",
  "remote_mutation",
  "credential_rotation",
  "billing_change",
  "account_change",
  "dns_change",
];

export function nowIso() {
  return new Date().toISOString();
}

function slugify(value) {
  return String(value || "loop")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "loop";
}

export function createRunId(seed = nowIso()) {
  return `loop-${slugify(seed)}`;
}

export function versionEnvelope(extra = {}) {
  return {
    schema_version: LOOP_SCHEMA_VERSION,
    command_version: LOOP_COMMAND_VERSION,
    rubric_version: LOOP_RUBRIC_VERSION,
    ...extra,
  };
}
