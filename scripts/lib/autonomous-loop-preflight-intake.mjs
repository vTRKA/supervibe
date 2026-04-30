import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { nowIso, versionEnvelope } from "./autonomous-loop-constants.mjs";
import { EXECUTION_MODES, detectToolAdapters, normalizeExecutionMode, summarizeToolAdapterAvailability } from "./autonomous-loop-tool-adapters.mjs";
import { createPermissionAudit } from "./autonomous-loop-permission-audit.mjs";

export function classifyPreflight({ request = "", tasks = [] } = {}) {
  const text = `${request} ${tasks.map((task) => `${task.goal} ${task.category}`).join(" ")}`.toLowerCase();
  if (!text.trim() || /^(status|help|stop)\b/.test(text.trim())) return "none";
  if (/(server|docker|deploy|production|staging|credential|mcp|integration|design|feature|remote)/.test(text)) return "full";
  return "quick";
}

export function buildPreflight({ request = "", tasks = [], options = {} } = {}) {
  const preflightClass = classifyPreflight({ request, tasks });
  const environmentTarget = options.environmentTarget || inferEnvironmentTarget(request, tasks);
  const autonomyLevel = options.autonomyLevel || (environmentTarget === "production" ? "production-prep" : "implement-and-test");
  const executionMode = normalizeExecutionMode(options.executionMode || (options.dryRun ? "dry-run" : "dry-run"));
  const toolAdapters = detectToolAdapters({
    env: options.env || process.env,
    availableCommands: options.availableCommands || {},
    enabledAdapters: options.enabledAdapters,
  });
  const adapterId = options.adapterId || options.tool || "generic-shell-stub";
  const adapter = toolAdapters.find((candidate) => candidate.id === adapterId) || toolAdapters.find((candidate) => candidate.id === "generic-shell-stub");
  const permissionAudit = createPermissionAudit({
    executionMode,
    adapterId,
    command: options.adapterCommand || adapter?.command || adapterId,
    args: normalizeArgs(options.adapterArgs || options.providerArgs),
    allowSpawn: Boolean(options.allowSpawn),
    hiddenBackgroundAutomation: Boolean(options.hiddenBackgroundAutomation),
    nonInteractive: executionMode === "fresh-context",
    permissionPromptBridge: options.permissionPromptBridge ?? adapterId === "generic-shell-stub",
    approvalLease: options.approvalLease,
    safeSandbox: options.safeSandbox,
    policyProfile: options.policyProfile,
    network: {
      requested: Boolean(options.networkAccess || options.externalWebAccess),
      approved: Boolean(options.networkApproved),
      targets: options.networkTargets || options.networkAllowlist || [],
    },
    mcp: {
      requested: Boolean((options.mcpToolsAllowed || []).length || options.mcpRequested),
      approved: Boolean(options.mcpApproved),
      servers: options.mcpServers || [],
      tools: options.mcpToolsAllowed || [],
      write: Boolean(options.mcpWrite),
    },
    readPaths: options.readPaths || [],
    writePaths: options.writePaths || [],
    sensitivePaths: options.sensitivePaths || [],
    remoteMutation: Boolean(options.remoteMutation),
    rateLimit: options.rateLimit || {},
    budget: {
      maxLoops: Number(options.maxLoops || 20),
      maxRuntimeMinutes: Number(options.maxRuntimeMinutes || 60),
    },
    managedPolicy: options.managedPolicy || {},
    projectPolicy: options.projectPolicy || {},
    toolRules: options.toolRules || {},
  });
  const missingData = [];

  if (environmentTarget === "production" && !options.productionApprovalPolicy) {
    missingData.push("production approval policy");
  }
  if (/(server|deploy|remote|production)/i.test(request) && !options.serverAccessReference) {
    missingData.push("server access reference");
  }

  const blockedActions = [
    ...(missingData.length > 0 ? ["remote mutation", "production deploy"] : []),
    ...permissionAudit.blockers.map((blocker) => blocker.status),
  ];

  return versionEnvelope({
    created_at: nowIso(),
    request,
    preflight_class: preflightClass,
    objective: request || "Execute autonomous loop",
    success_criteria: options.successCriteria || ["All required tasks score at least 9.0"],
    scope_in: options.scopeIn || ["repository-local changes"],
    scope_out: options.scopeOut || ["unapproved production mutations", "raw secret handling"],
    autonomy_level: autonomyLevel,
    max_loops: Number(options.maxLoops || 20),
    max_runtime_minutes: Number(options.maxRuntimeMinutes || 60),
    max_concurrent_agents: Number(options.maxConcurrentAgents || 3),
    allowed_write_scope: options.allowedWriteScope || ["project"],
    required_checks: options.requiredChecks || ["focused tests", "policy guard", "confidence score"],
    async_gates_supported: true,
    gate_policy: {
      human_gates_auto_approve: false,
      ci_pr_requires_adapter: true,
      stop_preserves_open_gates: true,
    },
    contract_policy: {
      require_contracts_for_autonomous_runs: true,
      require_verification_refs: true,
      block_readiness_below: 9,
    },
    execution_policy: {
      mode: executionMode,
      supported_modes: EXECUTION_MODES,
      commit_per_task: Boolean(options.commitPerTask || options["commit-per-task"]),
      default_spawns_external_tools: false,
      external_spawn_requires_allow_spawn: true,
      hidden_background_automation_allowed: false,
      permission_mode: permissionAudit.permissionMode,
      bypass_disabled: permissionAudit.bypassDisabled,
      denied_tool_classes: permissionAudit.deniedToolClasses,
      prompt_required_tool_classes: permissionAudit.promptRequiredToolClasses,
    },
    policy_profile: options.policyProfile ? {
      name: options.policyProfile.name,
      role: options.policyProfile.role,
      source: options.policyProfile.source || "runtime",
      write_policy: options.policyProfile.writePolicy?.mode || null,
      network_policy: options.policyProfile.networkPolicy?.mode || null,
      mcp_policy: options.policyProfile.mcpPolicy?.mode || null,
      no_tty: Boolean(options.policyProfile.noTty),
    } : null,
    tool_adapters: toolAdapters,
    tool_adapter_summary: summarizeToolAdapterAvailability(toolAdapters),
    provider_permission_audit: permissionAudit,
    provider_permission_audit_summary: {
      pass: permissionAudit.pass,
      status: permissionAudit.status,
      permissionMode: permissionAudit.permissionMode,
      deniedToolClasses: permissionAudit.deniedToolClasses,
      promptRequiredToolClasses: permissionAudit.promptRequiredToolClasses,
      nextSafeAction: permissionAudit.nextSafeAction,
    },
    environment_target: environmentTarget,
    mcp_tools_allowed: options.mcpToolsAllowed || [],
    server_access_needed: missingData.includes("server access reference"),
    deployment_approval_policy: options.productionApprovalPolicy || "ask-before-production-action",
    approval_lease: {
      scope: options.approvalScope || "local-read-write",
      environment: environmentTarget,
      tools: options.mcpToolsAllowed || [],
      budget: {
        max_loops: Number(options.maxLoops || 20),
        max_runtime_minutes: Number(options.maxRuntimeMinutes || 60),
        max_concurrent_agents: Number(options.maxConcurrentAgents || 3),
      },
      duration: `${Number(options.approvalExpiresAfterLoops || 20)} loops`,
      expires_after_loops: Number(options.approvalExpiresAfterLoops || 20),
      expires_at: new Date(Date.now() + Number(options.maxRuntimeMinutes || 60) * 60 * 1000).toISOString(),
      renewal_triggers: ["risk_escalation", "environment_change", "budget_change", "credential_scope_change"],
    },
    rollback_expectation: options.rollbackExpectation || "document rollback or cleanup before side effects",
    secret_handling_policy: "references-only-no-raw-secret-logging",
    assumptions: options.assumptions || [],
    missing_data: missingData,
    blocked_actions: blockedActions,
    approval_requirements: ["production deploy", "destructive migration", "remote mutation", "credential rotation"],
    confidence_score: missingData.length > 0 || !permissionAudit.pass ? 6.0 : preflightClass === "none" ? 10.0 : 9.0,
  });
}

export async function writePreflightArtifact(loopDir, preflight) {
  await mkdir(loopDir, { recursive: true });
  const filePath = join(loopDir, "preflight.json");
  await writeFile(filePath, `${JSON.stringify(preflight, null, 2)}\n`, "utf8");
  return filePath;
}

export function createPreflightQuestions(preflight) {
  const questions = [];
  if (!preflight.objective) questions.push("What is the exact objective for this run?");
  if (preflight.missing_data.includes("server access reference")) {
    questions.push("Which SSH host alias, cloud profile, or deployment target name should be used?");
  }
  if (preflight.missing_data.includes("production approval policy")) {
    questions.push("Should the loop stop at production-prep or ask for production approval before deploy?");
  }
  return questions;
}

function inferEnvironmentTarget(request, tasks) {
  const text = `${request} ${tasks.map((task) => task.goal).join(" ")}`.toLowerCase();
  if (text.includes("production")) return "production";
  if (text.includes("staging")) return "staging";
  if (text.includes("docker")) return "docker";
  if (text.includes("server") || text.includes("deploy")) return "remote";
  return "local";
}

function normalizeArgs(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return String(value).split(/\s+/).filter(Boolean);
}
