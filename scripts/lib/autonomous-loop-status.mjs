import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { versionEnvelope } from "./autonomous-loop-constants.mjs";
import { summarizeToolAdapterAvailability } from "./autonomous-loop-tool-adapters.mjs";
import { summarizeWorktreeSessions } from "./supervibe-worktree-session-manager.mjs";
import { summarizePermissionAudit } from "./autonomous-loop-permission-audit.mjs";
import { summarizeRunObservability } from "./supervibe-run-dashboard.mjs";

export function createState(fields = {}) {
  return versionEnvelope({
    plugin_version: fields.pluginVersion,
    run_id: fields.runId,
    status: fields.status || "IN_PROGRESS",
    active_task: fields.activeTask || null,
    active_agent: fields.activeAgent || null,
    loop_count: Number(fields.loopCount || 0),
    scores: fields.scores || [],
    budget_remaining: fields.budgetRemaining || {},
    last_progress_at: fields.lastProgressAt || new Date().toISOString(),
    stop_reason: fields.stopReason || null,
    next_action: fields.nextAction || "dispatch",
    tasks: fields.tasks || [],
    dispatches: fields.dispatches || [],
    runtime_environment: fields.runtimeEnvironment || null,
    mcp_plans: fields.mcpPlans || [],
    memory_write_policy: fields.memoryWritePolicy || null,
    final_acceptance: fields.finalAcceptance || null,
    claims: fields.claims || [],
    progress_summary: fields.progressSummary || null,
    gates: fields.gates || [],
    gate_summary: fields.gateSummary || null,
    tool_adapters: fields.toolAdapters || [],
    execution_mode: fields.executionMode || "dry-run",
    commit_per_task: Boolean(fields.commitPerTask),
    attempts: fields.attempts || [],
    ready_summary: fields.readySummary || null,
    requeue_summary: fields.requeueSummary || null,
    failure_packets: fields.failurePackets || [],
    worktree_sessions: fields.worktreeSessions || [],
    permission_audit: fields.permissionAudit || null,
    permission_audit_summary: fields.permissionAuditSummary || summarizePermissionAudit(fields.permissionAudit || null),
    policy_profile: fields.policyProfile || null,
    observability_summary: fields.observabilitySummary || summarizeRunObservability({ state: fields }),
  });
}

export async function writeState(filePath, state) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  return filePath;
}

export async function readState(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

export function formatStatus(state) {
  const staleClaims = (state.claims || []).filter((claim) => claim.status === "expired").length;
  const activeClaim = (state.claims || []).find((claim) => claim.status === "active");
  const openGates = state.gate_summary?.open ?? (state.gates || []).filter((gate) => ["open", "waiting", "blocked"].includes(gate.status)).length;
  const adapterSummary = summarizeToolAdapterAvailability(state.tool_adapters || []);
  const graphCounts = state.ready_summary || countTaskStatuses(state.tasks || []);
  const repeatedFailures = state.requeue_summary?.repeated_failure_signatures?.length || 0;
  const worktreeSummary = summarizeWorktreeSessions({ sessions: state.worktree_sessions || [] });
  const permissionSummary = state.permission_audit_summary || summarizePermissionAudit(state.permission_audit || null);
  const observability = state.observability_summary || summarizeRunObservability({ state });
  const lines = [
    "SUPERVIBE_LOOP_STATUS",
    `STATUS: ${state.status}`,
    `EXIT_SIGNAL: ${state.status === "COMPLETE"}`,
    `CONFIDENCE: ${state.run_score ?? 0}`,
    `NEXT_AGENT: ${state.active_agent || "none"}`,
    `NEXT_ACTION: ${state.next_action || "none"}`,
    `STOP_REASON: ${state.stop_reason || "none"}`,
    `POLICY_RISK: ${state.policy_risk || "none"}`,
    `ACTIVE_CLAIM: ${activeClaim?.claimId || "none"}`,
    `STALE_CLAIMS: ${staleClaims}`,
    `OPEN_GATES: ${openGates}`,
    `EXECUTION_MODE: ${state.execution_mode || "dry-run"}`,
    `POLICY_PROFILE: ${state.policy_profile?.name || "none"}`,
    `POLICY_ROLE: ${state.policy_profile?.role || "none"}`,
    `ADAPTERS: ${adapterSummary.available.join(",") || "none"}`,
    `PERMISSION_MODE: ${permissionSummary.permissionMode}`,
    `BYPASS_DISABLED: ${permissionSummary.bypassDisabled}`,
    `DENIED_TOOLS: ${permissionSummary.deniedToolClasses.join(",") || "none"}`,
    `PROMPT_REQUIRED_TOOLS: ${permissionSummary.promptRequiredToolClasses.join(",") || "none"}`,
    `RATE_LIMIT: ${permissionSummary.rateLimitStatus || "unknown"}`,
    `TASKS: ready=${graphCounts.ready || 0} blocked=${graphCounts.blocked || 0} claimed=${graphCounts.claimed || 0} complete=${graphCounts.complete || 0} open=${graphCounts.open || 0}`,
    `REPEATED_FAILURE_SIGNATURES: ${repeatedFailures}`,
    `WORKTREE_SESSIONS: active=${worktreeSummary.counts.active || 0} stale=${worktreeSummary.counts.stale || 0} cleanup_blocked=${worktreeSummary.counts.cleanup_blocked || 0} total=${worktreeSummary.total}`,
    `OBSERVABILITY: duration=${observability.durationSeconds}s blocked=${observability.timeBlockedSeconds}s attempts=${Object.values(observability.attemptsPerTask || {}).reduce((sum, count) => sum + count, 0)} verification_pass=${observability.verificationPassCount || 0} verification_fail=${observability.verificationFailCount || 0} requeues=${observability.requeueCount || 0} stale_claims=${observability.staleClaimCount || 0}`,
  ];
  if (state.progress_summary) {
    lines.push(`PROGRESS: completed=${state.progress_summary.completed || 0} in_progress=${state.progress_summary.in_progress || 0} blockers=${state.progress_summary.blockers || 0} evidence=${state.progress_summary.evidence || 0}`);
  }
  return lines.join("\n");
}

function countTaskStatuses(tasks) {
  const counts = { ready: 0, blocked: 0, claimed: 0, complete: 0, open: 0 };
  for (const task of tasks) {
    if (task.status === "ready") counts.ready += 1;
    else if (task.status === "complete") counts.complete += 1;
    else if (task.status === "in_progress" || task.status === "claimed") counts.claimed += 1;
    else if (["blocked", "policy_stopped", "budget_stopped", "command_adapter_required"].includes(task.status)) counts.blocked += 1;
    else if (task.status === "open") counts.open += 1;
  }
  return counts;
}
