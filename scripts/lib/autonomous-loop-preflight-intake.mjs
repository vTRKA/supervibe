import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { nowIso, versionEnvelope } from "./autonomous-loop-constants.mjs";
import {
  EXECUTION_MODES,
  detectToolAdapters,
  getLoopProviderCapabilityMatrix,
  normalizeExecutionMode,
  resolveDefaultLoopExecutionMode,
  resolveToolLoopCapabilities,
  summarizeLoopProviderCapabilities,
  summarizeToolAdapterAvailability,
} from "./autonomous-loop-tool-adapters.mjs";
import { createPermissionAudit } from "./autonomous-loop-permission-audit.mjs";
import { loadProviderCapabilities } from "./supervibe-provider-config-doctor.mjs";
import { readProviderRuntimeConfigLimits } from "./supervibe-provider-runtime-limits.mjs";
import {
  defaultRuntimeCleanupRegistryPath,
  summarizeHostManagedSubagentDebtSync,
} from "./runtime-cleanup-registry.mjs";

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
  const runBudget = normalizeGoalUntilCompleteBudget(options);
  const toolAdapters = detectToolAdapters({
    env: options.env || process.env,
    availableCommands: options.availableCommands ?? null,
    enabledAdapters: options.enabledAdapters,
  });
  const adapterId = options.adapterId || options.tool || "generic-shell-stub";
  const adapter = toolAdapters.find((candidate) => candidate.id === adapterId) || toolAdapters.find((candidate) => candidate.id === "generic-shell-stub");
  const providerCapabilities = resolveProviderCapabilities(adapterId, adapter?.id || "generic-shell-stub");
  const executionMode = normalizeExecutionMode(options.executionMode || resolveDefaultLoopExecutionMode({
    dryRun: Boolean(options.dryRun),
    adapterId,
    providerCapabilities,
  }));
  const providerLimitPolicy = resolveProviderLimitPolicy({ adapterId, options });
  const maxConcurrentAgents = providerLimitPolicy.effectiveMaxConcurrentAgents;
  const providerCapabilityMatrix = getLoopProviderCapabilityMatrix();
  const providerCapabilitySummary = summarizeLoopProviderCapabilities(providerCapabilityMatrix);
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
      maxLoops: runBudget.maxLoops,
      maxRuntimeMinutes: runBudget.maxRuntimeMinutes,
    },
    managedPolicy: options.managedPolicy || {},
    projectPolicy: options.projectPolicy || {},
    toolRules: options.toolRules || {},
  });
  const missingData = [];

  if (environmentTarget === "production" && !options.productionApprovalPolicy) {
    missingData.push("production approval policy");
  }
  if (requiresServerAccessReference(request) && !options.serverAccessReference) {
    missingData.push("server access reference");
  }
  if (executionMode === "fresh-context" && !providerCapabilities.freshContextAdapter) {
    missingData.push(`${adapterId} fresh-context adapter`);
  }
  if (executionMode === "fresh-context" && adapterId !== "generic-shell-stub" && adapter?.available !== true) {
    missingData.push(`${adapterId} provider adapter unavailable`);
  }

  const remoteApprovalMissing = missingData.some((item) => ["production approval policy", "server access reference"].includes(item));
  const blockedActions = [
    ...(remoteApprovalMissing ? ["remote mutation", "production deploy"] : []),
    ...(missingData.some((item) => item.includes("fresh-context adapter")) ? ["fresh-context execution"] : []),
    ...(missingData.some((item) => item.includes("provider adapter unavailable")) ? ["provider adapter unavailable"] : []),
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
    max_loops: runBudget.maxLoops,
    max_runtime_minutes: runBudget.maxRuntimeMinutes,
    run_until: runBudget.runUntil,
    budget_policy: runBudget.policy,
    max_concurrent_agents: maxConcurrentAgents,
    provider_limit_policy: providerLimitPolicy,
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
      provider: {
        selected_adapter: adapter?.id || "generic-shell-stub",
        selected_tool: adapterId,
        provider_limits: providerLimitPolicy,
        continuation_mode: providerCapabilities.nativeContinuation,
        recommended_mode: providerCapabilities.recommendedMode,
        fallback_mode: providerCapabilities.fallbackMode,
        native_goal_workflows: providerCapabilities.nativeGoalWorkflows,
        stop_hooks: providerCapabilities.stopHooks,
        teammate_idle_hooks: providerCapabilities.teammateIdleHooks,
        fresh_context_adapter: providerCapabilities.freshContextAdapter,
        headless_mode: providerCapabilities.headlessMode,
        context_forking: providerCapabilities.contextForking,
        permission_prompt_bridge_required: providerCapabilities.permissionPromptBridgeRequired,
        spawn_receipt_required: providerCapabilities.spawnReceiptRequired,
        external_spawn_requires_allow_spawn: providerCapabilities.externalSpawnRequiresAllowSpawn,
        controller_stop_supported: providerCapabilities.controllerStopSupported,
        quality_gate_strategy: providerCapabilities.qualityGateStrategy,
        stability_score: providerCapabilities.stabilityScore,
      },
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
    provider_capabilities: providerCapabilities,
    provider_capability_summary: providerCapabilitySummary,
    provider_capability_matrix: providerCapabilityMatrix,
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
        max_loops: runBudget.maxLoops,
        max_runtime_minutes: runBudget.maxRuntimeMinutes,
        run_until: runBudget.runUntil,
        max_concurrent_agents: maxConcurrentAgents,
      },
      duration: runBudget.duration,
      expires_after_loops: runBudget.expiresAfterLoops,
      expires_at: runBudget.expiresAt,
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
  return createPreflightQuestionCards(preflight).map((question) => question.prompt);
}

export function createPreflightQuestionCards(preflight, { locale = "en" } = {}) {
  const questions = [];
  const target = preflight.environment_target || "local";
  const runSubject = preflight.objective || preflight.request || `${target} autonomous run`;
  if (!preflight.objective) {
    questions.push({
      id: "objective",
      prompt: locale === "ru"
        ? `Шаг 1/1: какой точный результат должен получить ${runSubject}?`
        : `Step 1/1: what exact outcome should ${runSubject} produce?`,
      specialist: "ai-agent-orchestrator",
      evidence: [`environment=${target}`, `preflight=${preflight.preflightClass || "unknown"}`],
      artifactImpact: "Sets the loop objective before any autonomous execution policy is approved.",
      choices: locale === "ru"
        ? [
          { id: "single-objective", label: "Сузить до одного результата", tradeoff: "Меньше параллелизма, зато яснее stop condition.", recommended: true },
          { id: "epic-objective", label: "Оставить как epic с несколькими задачами", tradeoff: "Шире покрытие, но нужен явный budget и review gates." },
          { id: "stop", label: "Остановить preflight", tradeoff: "Не запускает loop без цели." },
        ]
        : [
          { id: "single-objective", label: "Narrow to one outcome", tradeoff: "Less parallelism, clearer stop condition.", recommended: true },
          { id: "epic-objective", label: "Keep as a multi-task epic", tradeoff: "Broader coverage, but needs explicit budget and review gates." },
          { id: "stop", label: "Stop preflight", tradeoff: "Does not start a loop without an objective." },
        ],
    });
  }
  if (preflight.missing_data.includes("server access reference")) {
    questions.push({
      id: "server-access-reference",
      prompt: locale === "ru"
        ? `Шаг 1/1: какой SSH alias, cloud profile или deployment target использовать для ${target} run?`
        : `Step 1/1: which SSH host alias, cloud profile, or deployment target should ${target} run use?`,
      specialist: "devops-incident-commander",
      evidence: [`environment=${target}`, "missing=server access reference"],
      artifactImpact: "Binds the approval lease to a named access reference without exposing raw secrets.",
      choices: locale === "ru"
        ? [
          { id: "ssh-alias", label: "Передать SSH alias", tradeoff: "Быстро для known-host deploy; секреты остаются вне лога.", recommended: true },
          { id: "cloud-profile", label: "Передать cloud profile", tradeoff: "Лучше для managed deploy, но требует понятный account/scope." },
          { id: "deployment-target", label: "Передать deployment target", tradeoff: "Удобно для CI/CD, если target уже описан в проекте." },
          { id: "stop", label: "Остановить deploy preflight", tradeoff: "Не продолжает remote loop без безопасной ссылки доступа." },
        ]
        : [
          { id: "ssh-alias", label: "Use an SSH host alias", tradeoff: "Fast for known-host deploys; secrets stay out of logs.", recommended: true },
          { id: "cloud-profile", label: "Use a cloud profile", tradeoff: "Better for managed deploys, but needs clear account and scope." },
          { id: "deployment-target", label: "Use a deployment target name", tradeoff: "Works well for CI/CD when the target is already defined in the project." },
          { id: "stop", label: "Stop deploy preflight", tradeoff: "Does not continue a remote loop without a safe access reference." },
        ],
    });
  }
  if (preflight.missing_data.includes("production approval policy")) {
    questions.push({
      id: "production-approval-policy",
      prompt: locale === "ru"
        ? `Шаг 1/1: где должен остановиться ${target} loop перед production изменениями?`
        : `Step 1/1: where should the ${target} loop stop before production changes?`,
      specialist: "release-manager",
      evidence: [`environment=${target}`, "missing=production approval policy"],
      artifactImpact: "Defines whether production deploy remains blocked, asks for approval, or stops at prep artifacts.",
      choices: locale === "ru"
        ? [
          { id: "stop-at-prod-prep", label: "Остановиться на production-prep", tradeoff: "Самый безопасный путь; deploy остается ручным.", recommended: true },
          { id: "ask-before-deploy", label: "Спросить перед deploy", tradeoff: "Позволяет продолжить после явного approval lease." },
          { id: "no-production", label: "Исключить production changes", tradeoff: "Loop может закончить staging/local работу без deploy риска." },
        ]
        : [
          { id: "stop-at-prod-prep", label: "Stop at production prep", tradeoff: "Safest path; deployment remains manual.", recommended: true },
          { id: "ask-before-deploy", label: "Ask before deploy", tradeoff: "Allows continuation only after an explicit approval lease." },
          { id: "no-production", label: "Exclude production changes", tradeoff: "The loop can finish staging/local work without deploy risk." },
        ],
    });
  }
  return questions;
}

function inferEnvironmentTarget(request, tasks) {
  const text = `${request} ${tasks.map((task) => task.goal).join(" ")}`.toLowerCase();
  if (isProductionMutationText(text)
    || /\bprod\s+(deploy|deployment|release)\b/.test(text)) return "production";
  if (text.includes("staging")) return "staging";
  if (text.includes("docker")) return "docker";
  if (text.includes("server") || text.includes("deploy")) return "remote";
  return "local";
}

function requiresServerAccessReference(request) {
  const text = String(request || "").toLowerCase();
  return /\b(server|deploy|remote)\b/.test(text) || isProductionMutationText(text);
}

function isProductionMutationText(text) {
  const value = String(text || "").toLowerCase();
  return /(deploy|deployment|release|migrate|migration|mutate|mutation|write|promote)\s+(to\s+)?production\b/.test(value)
    || /\bproduction\s+(deploy|deployment|release|migration|mutation|write|promotion)\b/.test(value);
}

function normalizeArgs(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return String(value).split(/\s+/).filter(Boolean);
}

function resolveProviderCapabilities(requestedId, fallbackId) {
  try {
    return resolveToolLoopCapabilities(requestedId);
  } catch {
    return resolveToolLoopCapabilities(fallbackId);
  }
}

function resolveProviderLimitPolicy({ adapterId = "generic-shell-stub", options = {} } = {}) {
  const providerId = String(options.provider || adapterId || "generic-shell-stub").trim().toLowerCase();
  const requested = positiveInt(
    options.maxConcurrentAgents
      ?? options["max-concurrent-agents"]
      ?? options.maxConcurrency
      ?? options["max-concurrency"],
    null,
  );
  const fallbackDefault = 12;
  const provider = findProviderLimitEntry(providerId, options);
  const limits = provider?.providerLimits || {};
  const rootDir = options.projectRoot || options.rootDir || process.cwd();
  const runtimeLimits = readProviderRuntimeConfigLimits({
    provider,
    providerId,
    projectRoot: rootDir,
    userHome: options.userHome,
    providerHome: options.providerHome,
    env: options.env || process.env,
  });
  const manifestMaxThreads = positiveInt(limits.defaultMaxThreads, null);
  const providerMaxThreads = positiveInt(
    options.providerMaxThreads ?? options["provider-max-threads"],
    positiveInt(runtimeLimits.maxThreads, manifestMaxThreads),
  );
  const cleanupDebt = providerId === "codex"
    ? summarizeHostManagedSubagentDebtSync({
        rootDir,
        path: defaultRuntimeCleanupRegistryPath(rootDir),
      })
    : { count: 0, closeRequired: [] };
  const providerThreadLimit = providerMaxThreads || requested || fallbackDefault;
  const availableThreads = Math.max(0, providerThreadLimit - cleanupDebt.count);
  const effective = providerMaxThreads
    ? Math.min(requested || providerMaxThreads, availableThreads)
    : Math.min(requested || fallbackDefault, availableThreads);
  return {
    schemaVersion: 1,
    providerId: provider?.id || providerId,
    source: runtimeLimits.maxThreads ? "provider-runtime-config" : provider ? "provider-capabilities-manifest" : "preflight-default",
    maxThreadsKey: limits.maxThreadsKey || null,
    providerMaxThreads,
    providerMaxThreadsSource: runtimeLimits.maxThreads ? "provider-runtime-config" : manifestMaxThreads ? "provider-capabilities-manifest" : "preflight-default",
    runtimeMaxThreads: runtimeLimits.maxThreads,
    runtimeConfigPath: runtimeLimits.configPath,
    runtimeConfigIssue: runtimeLimits.issue,
    manifestDefaultMaxThreads: manifestMaxThreads,
    hostManagedCleanupRequired: cleanupDebt.count,
    hostManagedCleanupIds: cleanupDebt.closeRequired.map((item) => item.hostInvocationId).filter(Boolean),
    hostManagedCleanupDiagnostic: cleanupDebt.diagnosticCount || 0,
    hostManagedCleanupDiagnosticIds: (cleanupDebt.diagnostics || []).map((item) => item.hostInvocationId).filter(Boolean),
    availableProviderThreads: availableThreads,
    requestedMaxConcurrentAgents: requested,
    effectiveMaxConcurrentAgents: Math.max(0, effective),
    defaultMaxConcurrentAgents: providerMaxThreads || fallbackDefault,
    capped: Boolean(providerMaxThreads && requested && requested > providerMaxThreads),
    reason: cleanupDebt.count >= providerThreadLimit
      ? `completed Codex subagent cleanup requires closing ${cleanupDebt.count} host-managed thread(s) before new spawns`
      : cleanupDebt.count > 0
        ? `provider threads reduced by ${cleanupDebt.count} completed Codex subagent(s) awaiting close/reset`
        : providerMaxThreads
      ? requested && requested > providerMaxThreads
        ? `provider max threads ${providerMaxThreads} caps requested concurrency ${requested}`
        : `provider max threads ${providerMaxThreads} sets loop concurrency`
      : "provider has no shared max_threads cap; using requested or local fallback",
  };
}

function findProviderLimitEntry(providerId, options = {}) {
  const aliases = new Set([providerId]);
  if (providerId === "claude") aliases.add("claude-code");
  if (providerId === "gemini") aliases.add("gemini-cli");
  try {
    const manifest = options.providerManifest || loadProviderCapabilities({
      rootDir: options.pluginRoot || options.providerManifestRoot,
      manifestPath: options.providerManifestPath,
    });
    return (manifest.providers || []).find((entry) => aliases.has(String(entry.id || "").toLowerCase())) || null;
  } catch {
    return null;
  }
}

function normalizeGoalUntilCompleteBudget(options = {}) {
  const maxLoops = optionalPositiveNumber(options.maxLoops);
  const maxRuntimeMinutes = optionalPositiveNumber(options.maxRuntimeMinutes);
  const approvalLoops = optionalPositiveNumber(options.approvalExpiresAfterLoops);
  const explicit = maxLoops != null || maxRuntimeMinutes != null || approvalLoops != null;
  return {
    maxLoops,
    maxRuntimeMinutes,
    runUntil: explicit ? "goal-complete-or-explicit-budget" : "goal-complete",
    duration: explicit ? "until-goal-complete-or-explicit-budget" : "until-goal-complete",
    expiresAfterLoops: approvalLoops ?? maxLoops ?? "until-goal-complete",
    expiresAt: maxRuntimeMinutes == null
      ? "until-goal-complete"
      : new Date(Date.now() + maxRuntimeMinutes * 60 * 1000).toISOString(),
    policy: {
      defaultTimebox: false,
      defaultLoopLimit: false,
      stopWhen: [
        "all-goals-complete",
        "policy-stop",
        "verification-failure",
        "missing-access",
        "approval-required",
        "side-effect-reconciliation-failure",
        "no-progress",
        "user-stop",
        "explicit-budget-exhausted",
      ],
    },
  };
}

function optionalPositiveNumber(value) {
  if (value === undefined || value === null || value === "" || value === false) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function positiveInt(value, fallback = null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}
