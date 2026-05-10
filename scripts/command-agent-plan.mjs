#!/usr/bin/env node
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildCommandAgentPlan,
  formatCommandAgentPlan,
} from "./lib/command-agent-orchestration-contract.mjs";
import {
  validateAgentProducerReceipts,
  validateScopedAgentProducerReceipts,
} from "./lib/agent-producer-contract.mjs";
import { selectHostAdapter } from "./lib/supervibe-host-detector.mjs";

const PLUGIN_ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));

function parseArgs(argv) {
  const options = {
    projectRoot: process.cwd(),
    pluginRoot: process.env.SUPERVIBE_PLUGIN_ROOT || PLUGIN_ROOT,
    enforceHostProof: true,
    installedOnly: false,
    json: false,
    strictExit: false,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      if (key === "json") options.json = true;
      else if (key === "no-host-proof") options.enforceHostProof = false;
      else if (key === "installed-only") options.installedOnly = true;
      else if (key === "bootstrap-pre-agent") options.bootstrapPreAgent = true;
      else if (key === "active") options.active = true;
      else if (key === "dry-run") options.dryRun = true;
      else if (key === "apply") options.apply = true;
      else if (key === "generate-apps") options.generateApps = true;
      else if (key === "verify-agents") options.verifyAgents = true;
      else if (key === "strict" || key === "strict-exit") options.strictExit = true;
      else options[key] = true;
      continue;
    }
    index += 1;
    if (key === "command" || key === "cmd") options.command = value;
    else if (key === "project" || key === "project-root" || key === "root") options.projectRoot = value;
    else if (key === "plugin-root") options.pluginRoot = value;
    else if (key === "execution-mode") options.executionMode = value;
    else if (key === "host") options.host = value;
    else if (key === "handoff" || key === "handoff-id") options.handoffId = value;
    else if (key === "workflow-run-id") options.workflowRunId = value;
    else if (key === "slug") options.slug = value;
    else if (key === "adds" || key === "updates" || key === "project-only" || key === "conflicts") options[key] = Number(value);
    else if (key === "memory-writes") options[key] = parseBoolean(value);
    else options[key] = value;
  }
  return options;
}

function usage() {
  return [
    "SUPERVIBE_COMMAND_AGENT_PLAN_HELP",
    "USAGE:",
    "  node scripts/command-agent-plan.mjs --command /supervibe-design --host claude",
    "  node scripts/command-agent-plan.mjs --command /supervibe-design --host codex --active --slug agent-chat --handoff-id run-123",
    "  node scripts/command-agent-plan.mjs --command /supervibe-plan --host codex --json",
    "  node scripts/command-agent-plan.mjs --command /supervibe-adapt --adds 0 --updates 1 --project-only 0 --conflicts 0 --memory-writes false",
    "  node scripts/command-agent-plan.mjs --command /supervibe-adapt --low-risk",
    "  node scripts/command-agent-plan.mjs --command /supervibe-genesis --bootstrap-pre-agent --installed-only",
    "",
    "NOTES:",
    "  Default execution mode is real-agents.",
    "  Text output includes AGENT_SELECTION_MODE, REQUIRED_AGENT_SOURCES, CALLABLE_AGENT_SOURCES, CALLABLE_AGENTS_READY, SCOPED_RECEIPT_GATE, and MISSING_CALLABLE_AGENTS.",
    "  Unsupported or unverifiable host dispatch enters agent-required-blocked.",
    "  Workflow counts can select dynamic required roles, including low-risk fast paths.",
    "  Inline mode is diagnostic/dry-run only and never satisfies specialist output.",
    "  /supervibe-genesis may use --bootstrap-pre-agent to install only base scaffold/state before project agents exist.",
    "  /supervibe-genesis --dry-run/--apply/--generate-apps are bootstrap-pre-agent phases; --verify-agents is the separate runtime smoke gate.",
    "  /supervibe-adapt --dry-run is agentless/read-only planning; --apply needs approval and --verify-agents is the separate runtime receipt gate.",
  ].join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv);
  if (options.help || !options.command) {
    console.log(usage());
    process.exit(options.help ? 0 : 2);
  }

  try {
    const report = buildRuntimeCommandAgentPlan({
      command: options.command,
      projectRoot: options.projectRoot,
      pluginRoot: options.pluginRoot,
      host: options.host,
      requestedExecutionMode: options.executionMode,
      enforceHostProof: options.enforceHostProof,
      workflowContext: {
        lowRisk: options["low-risk"] === true,
        bootstrapPreAgent: options.bootstrapPreAgent === true,
        dryRun: options.dryRun === true || options["dry-run"] === true,
        apply: options.apply === true,
        generateApps: options.generateApps === true || options["generate-apps"] === true,
        verifyAgents: options.verifyAgents === true || options["verify-agents"] === true,
        active: options.active === true,
        slug: options.slug || null,
        handoffId: options.handoffId || null,
        workflowRunId: options.workflowRunId || null,
        adds: options.adds,
        updates: options.updates,
        projectOnly: options["project-only"],
        conflicts: options.conflicts,
        memoryWrites: options["memory-writes"] === undefined ? false : options["memory-writes"],
      },
      installedOnly: options.installedOnly,
      env: process.env,
    });
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(formatCommandAgentPlan(report.plan));
      console.log(`STRICT_READY: ${commandAgentPlanStrictReady(report)}`);
      if (!commandAgentPlanStrictReady(report)) {
        console.log(`STRICT_BLOCK_REASON: ${commandAgentPlanStrictBlockReason(report)}`);
      }
      console.log(`HOST_SELECTED: ${report.selectedHost}`);
      console.log(`HOST_CONFIDENCE: ${report.hostConfidence}`);
      console.log(`AVAILABLE_AGENTS: ${report.availableAgentCount}`);
      console.log(`CALLABLE_AGENTS: ${report.callableAgentCount}`);
      console.log(`INSTALLED_ONLY: ${options.installedOnly}`);
    }
    process.exit(options.strictExit && !commandAgentPlanStrictReady(report) ? 3 : 0);
  } catch (error) {
    console.error("SUPERVIBE_COMMAND_AGENT_PLAN_ERROR");
    console.error(`ERROR: ${error.message}`);
    process.exit(2);
  }
}

export function commandAgentPlanStrictReady(report = {}) {
  const plan = report.plan || {};
  return report.pass === true
    && plan.executionMode !== "agent-required-blocked"
    && plan.durableWritesAllowed === true
    && plan.agentOwnedOutputRequiresReceipts !== true
    && plan.agentDispatchRequired !== true
    && (plan.missingAgents || []).length === 0
    && (plan.missingCallableAgents || []).length === 0
    && (plan.scopedReceiptTrust?.missingSubjects || []).length === 0
    && !/^pending-/i.test(String(plan.receiptGate || ""));
}

function commandAgentPlanStrictBlockReason(report = {}) {
  const plan = report.plan || {};
  if (report.pass !== true) return "command-agent-plan failed";
  if (plan.executionMode === "agent-required-blocked") return "required agents are blocked";
  if ((plan.missingAgents || []).length) return `missing agents: ${plan.missingAgents.join(", ")}`;
  if ((plan.missingCallableAgents || []).length) return `missing callable agents: ${plan.missingCallableAgents.join(", ")}`;
  if ((plan.scopedReceiptTrust?.missingSubjects || []).length) return `missing scoped receipts: ${plan.scopedReceiptTrust.missingSubjects.join(", ")}`;
  if (plan.durableWritesAllowed !== true) return "durable writes are blocked";
  if (plan.agentOwnedOutputRequiresReceipts === true || plan.agentDispatchRequired === true) return "runtime agent receipts are still pending";
  if (/^pending-/i.test(String(plan.receiptGate || ""))) return `receipt gate is pending: ${plan.receiptGate}`;
  return "strict gate is not ready";
}

export function buildRuntimeCommandAgentPlan({
  command,
  projectRoot = process.cwd(),
  pluginRoot = process.env.SUPERVIBE_PLUGIN_ROOT || PLUGIN_ROOT,
  host = null,
  requestedExecutionMode = null,
  enforceHostProof = true,
  installedOnly = false,
  workflowContext = {},
  env = process.env,
} = {}) {
  const resolvedProjectRoot = resolve(projectRoot);
  const resolvedPluginRoot = resolve(pluginRoot);
  const nextEnv = { ...env };
  if (host) nextEnv.SUPERVIBE_HOST = host;
  const hostSelection = selectHostAdapter({ rootDir: resolvedProjectRoot, env: nextEnv });
  const normalizedContext = {
    ...workflowContext,
    dryRun: workflowContext.dryRun === true || isBareGenesisBootstrapPlan({
      command,
      ...workflowContext,
    }),
  };
  const availableAgentSources = listAvailableAgentSources({
    pluginRoot: resolvedPluginRoot,
    projectRoot: resolvedProjectRoot,
    hostAgentsFolder: hostSelection.adapter.agentsFolder,
    installedOnly,
  });
  const callableAgentSources = listCallableAgentSources({
    projectRoot: resolvedProjectRoot,
    hostAgentsFolder: hostSelection.adapter.agentsFolder,
    hostAdapterId: hostSelection.adapter.id,
    availableAgentSources,
  });
  const availableAgentIds = [...availableAgentSources.keys()];
  const callableAgentIds = [...callableAgentSources.keys()];
  const baseReceiptTrust = inspectReceiptTrust(resolvedProjectRoot);
  const preliminaryPlan = buildCommandAgentPlan(command, {
    requestedExecutionMode,
    availableAgentIds,
    availableAgentSources,
    callableAgentIds,
    callableAgentSources,
    hostAdapterId: hostSelection.adapter.id,
    enforceHostProof,
    receiptTrust: baseReceiptTrust,
    workflowContext: normalizedContext,
  });
  const scopedReceiptTrust = shouldInspectScopedReceiptTrust(normalizedContext)
    ? inspectScopedReceiptTrust(resolvedProjectRoot, {
      command,
      workflowContext: normalizedContext,
      requiredAgentIds: preliminaryPlan.requiredAgentIds,
    })
    : null;
  const plan = buildCommandAgentPlan(command, {
    requestedExecutionMode,
    availableAgentIds,
    availableAgentSources,
    callableAgentIds,
    callableAgentSources,
    hostAdapterId: hostSelection.adapter.id,
    enforceHostProof,
    receiptTrust: baseReceiptTrust,
    scopedReceiptTrust,
    workflowContext: normalizedContext,
  });
  return {
    pass: plan.executionMode !== "agent-required-blocked",
    projectRoot: resolvedProjectRoot,
    pluginRoot: resolvedPluginRoot,
    selectedHost: hostSelection.selectedHost,
    hostConfidence: hostSelection.confidence,
    availableAgentCount: availableAgentIds.length,
    callableAgentCount: callableAgentIds.length,
    installedOnly,
    plan,
  };
}

function isBareGenesisBootstrapPlan(options = {}) {
  const command = String(options.command || "").trim();
  if (command !== "/supervibe-genesis") return false;
  return options.bootstrapPreAgent !== true
    && options.dryRun !== true
    && options["dry-run"] !== true
    && options.apply !== true
    && options.generateApps !== true
    && options["generate-apps"] !== true
    && options.verifyAgents !== true
    && options["verify-agents"] !== true;
}

function listAvailableAgentSources({
  pluginRoot,
  projectRoot,
  hostAgentsFolder,
  installedOnly = false,
}) {
  const sources = new Map();
  if (!installedOnly) addAgentSources(sources, join(pluginRoot, "agents"), "plugin-only");
  if (hostAgentsFolder) addAgentSources(sources, join(projectRoot, ...hostAgentsFolder.split("/")), "project artifact");
  return sources;
}

function listCallableAgentSources({
  projectRoot,
  hostAgentsFolder,
  hostAdapterId = null,
  availableAgentSources = new Map(),
}) {
  const sources = new Map();
  if (hostAgentsFolder) addAgentSources(sources, join(projectRoot, ...hostAgentsFolder.split("/")), "host callable", { recursive: false });
  if (hostAdapterId === "codex") {
    for (const [agentId] of availableAgentSources.entries()) {
      if (!sources.has(agentId)) sources.set(agentId, "codex-spawn-agent logical role");
    }
  }
  return sources;
}

function addAgentSources(sources, dir, source, { recursive = true } = {}) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (recursive) addAgentSources(sources, path, source, { recursive });
    } else if (entry.endsWith(".md")) {
      const id = entry.replace(/\.md$/, "");
      if (source === "project artifact" || !sources.has(id)) sources.set(id, source);
    }
  }
}

function inspectReceiptTrust(projectRoot) {
  const minHostAgentReceipts = 1;
  const minAgentInvocations = 1;
  try {
    return {
      ...validateAgentProducerReceipts(projectRoot, {
        requireHostAgentReceipts: true,
        minHostAgentReceipts,
        minAgentInvocations,
      }),
      minHostAgentReceipts,
      minAgentInvocations,
    };
  } catch (error) {
    return {
      pass: false,
      trustedHostAgentReceipts: 0,
      agentInvocations: 0,
      loggedAgentInvocations: 0,
      minHostAgentReceipts,
      minAgentInvocations,
      issues: [{ code: "receipt-trust-inspection-failed", message: error.message }],
    };
  }
}

function inspectScopedReceiptTrust(projectRoot, { command, workflowContext = {}, requiredAgentIds = [] } = {}) {
  const minHostAgentReceipts = requiredAgentIds.length || 1;
  const minAgentInvocations = requiredAgentIds.length || 1;
  try {
    return {
      ...validateScopedAgentProducerReceipts(projectRoot, {
        command,
        handoffId: workflowContext.handoffId || workflowContext.handoff || null,
        workflowRunId: workflowContext.workflowRunId || null,
        requiredAgentIds,
        minHostAgentReceipts,
        minAgentInvocations,
      }),
      minHostAgentReceipts,
      minAgentInvocations,
    };
  } catch (error) {
    return {
      pass: false,
      trustedHostAgentReceipts: 0,
      agentInvocations: 0,
      loggedAgentInvocations: 0,
      minHostAgentReceipts,
      minAgentInvocations,
      missingSubjects: requiredAgentIds,
      issues: [{ code: "scoped-receipt-trust-inspection-failed", message: error.message }],
    };
  }
}

function shouldInspectScopedReceiptTrust(workflowContext = {}) {
  return Boolean(
    workflowContext.active === true
    || workflowContext.handoffId
    || workflowContext.workflowRunId
    || workflowContext.slug
  );
}

function parseBoolean(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return Boolean(value);
}
