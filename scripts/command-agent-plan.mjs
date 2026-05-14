#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildCommandAgentPlan,
  formatCommandAgentPlan,
} from "./lib/command-agent-orchestration-contract.mjs";
import {
  agentOnlyStrictBlockReason,
  agentOnlyStrictReady,
} from "./lib/supervibe-agent-only-policy.mjs";
import {
  validateAgentProducerReceipts,
  validateScopedAgentProducerReceipts,
} from "./lib/agent-producer-contract.mjs";
import { selectHostAdapter } from "./lib/supervibe-host-detector.mjs";
import { buildEvidencePacket, evidencePacketSummary } from "./lib/supervibe-evidence-packet.mjs";
import {
  defaultRuntimeCleanupRegistryPath,
  summarizeHostManagedSubagentDebtSync,
} from "./lib/runtime-cleanup-registry.mjs";

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
    else if (key === "intent") options.intent = value;
    else if (key === "stack" || key === "stack-tags") options.stackTags = value;
    else if (key === "risk-domain" || key === "risk-domains" || key === "domain") options.riskDomains = value;
    else if (key === "artifact-type" || key === "artifact") options.artifactType = value;
    else if (key === "stage" || key === "phase") options.stage = value;
    else if (key === "decision-artifact" || key === "orchestrator-decision-artifact") options.decisionArtifact = value;
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
    "  node scripts/command-agent-plan.mjs --command /supervibe-plan --host codex --intent plan --stack nextjs,postgres --risk-domain finance --artifact-type plan --stage review --decision-artifact .supervibe/artifacts/_workflow-invocations/agent-selection.json",
    "  node scripts/command-agent-plan.mjs --command /supervibe-adapt --adds 0 --updates 1 --project-only 0 --conflicts 0 --memory-writes false",
    "  node scripts/command-agent-plan.mjs --command /supervibe-adapt --low-risk",
    "  node scripts/command-agent-plan.mjs --command /supervibe-genesis --bootstrap-pre-agent --installed-only",
    "",
    "NOTES:",
    "  Default execution mode is real-agents.",
    "  Text output includes AGENT_SELECTION_MODE, REQUIRED_AGENT_SOURCES, CALLABLE_AGENT_SOURCES, CALLABLE_AGENTS_READY, SCOPED_RECEIPT_GATE, and MISSING_CALLABLE_AGENTS.",
    "  Unsupported or unverifiable host dispatch enters agent-required-blocked.",
    "  Workflow counts and selector context can select dynamic required roles, including low-risk fast paths, stack specialists, risk reviewers, and regulated-domain gates.",
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
        commandScopedReceiptGate: options.strictExit === true,
        active: options.active === true,
        slug: options.slug || null,
        handoffId: options.handoffId || null,
        workflowRunId: options.workflowRunId || null,
        adds: options.adds,
        updates: options.updates,
        projectOnly: options["project-only"],
        conflicts: options.conflicts,
        memoryWrites: options["memory-writes"] === undefined ? false : options["memory-writes"],
        intent: options.intent || null,
        stackTags: options.stackTags || null,
        riskDomains: options.riskDomains || null,
        artifactType: options.artifactType || null,
        stage: options.stage || null,
      },
      installedOnly: options.installedOnly,
      env: process.env,
    });
    if (options.decisionArtifact) {
      const artifactPath = resolve(options.decisionArtifact);
      mkdirSync(dirname(artifactPath), { recursive: true });
      writeFileSync(artifactPath, `${JSON.stringify(report.plan.orchestratorDecisionArtifact, null, 2)}\n`, "utf8");
      if (!options.json) console.log(`DECISION_ARTIFACT_WRITTEN: ${artifactPath}`);
    }
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(formatCommandAgentPlan(report.plan));
      console.log(formatCommandAgentVerificationPolicy(report.plan.verificationPolicy));
      const packet = evidencePacketSummary(report.plan.evidencePacket);
      console.log(`EVIDENCE_PACKET_ID: ${packet.packetId}`);
      console.log(`EVIDENCE_PACKET_SOURCES: ${packet.sourceCount}`);
      console.log(`EVIDENCE_PACKET_TOKENS: ${packet.tokenEstimate}`);
      console.log(`EVIDENCE_PACKET_OMITTED: ${packet.omittedEvidenceReason}`);
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
  return agentOnlyStrictReady(report);
}

function commandAgentPlanStrictBlockReason(report = {}) {
  return agentOnlyStrictBlockReason(report);
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
  receiptTrust = undefined,
  scopedReceiptTrust = undefined,
  skipScopedReceiptTrustInspection = false,
  evidencePacket = undefined,
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
  const baseReceiptTrust = receiptTrust === undefined
    ? inspectReceiptTrust(resolvedProjectRoot)
    : receiptTrust;
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
  const effectiveCommand = preliminaryPlan.commandId || command;
  const scopedContext = withDefaultCommandScopedHandoff(normalizedContext, effectiveCommand);
  const effectiveScopedReceiptTrust = shouldInspectScopedReceiptTrust(scopedContext)
    ? scopedReceiptTrust === undefined && skipScopedReceiptTrustInspection !== true
      ? inspectScopedReceiptTrust(resolvedProjectRoot, {
        command: effectiveCommand,
        workflowContext: scopedContext,
        requiredAgentIds: preliminaryPlan.requiredAgentIds,
      })
      : (scopedReceiptTrust ?? null)
    : null;
  const plan = buildCommandAgentPlan(effectiveCommand, {
    requestedExecutionMode,
    availableAgentIds,
    availableAgentSources,
    callableAgentIds,
    callableAgentSources,
    hostAdapterId: hostSelection.adapter.id,
    enforceHostProof,
    receiptTrust: baseReceiptTrust,
    scopedReceiptTrust: effectiveScopedReceiptTrust,
    workflowContext: scopedContext,
  });
  const packet = evidencePacket === undefined
    ? buildEvidencePacket({
      rootDir: resolvedProjectRoot,
      commandId: effectiveCommand,
      task: {
        id: effectiveCommand,
        goal: [
          effectiveCommand,
          scopedContext.intent,
          scopedContext.artifactType,
          scopedContext.stage,
          scopedContext.stackTags,
          scopedContext.riskDomains,
        ].filter(Boolean).join(" "),
      },
    })
    : evidencePacket;
  const verificationPolicy = buildCommandAgentVerificationPolicy({
    command: effectiveCommand,
    workflowContext: scopedContext,
  });
  const codexCleanupDebt = hostSelection.adapter.id === "codex"
    ? summarizeHostManagedSubagentDebtSync({
        rootDir: resolvedProjectRoot,
        path: defaultRuntimeCleanupRegistryPath(resolvedProjectRoot),
      })
    : { count: 0, closeRequired: [] };
  const codexSpawnBlockedByCleanup = codexCleanupDebt.count > 0 && Array.isArray(plan.codexSpawnPayloads) && plan.codexSpawnPayloads.length > 0;
  const enrichedPlan = {
    ...plan,
    ...(codexCleanupDebt.count > 0 ? {
      hostManagedCleanupDebt: codexCleanupDebt,
    } : {}),
    ...(codexSpawnBlockedByCleanup ? {
      executionMode: "agent-required-blocked",
      codexSpawnBlockedByCleanup: true,
      codexSpawnPayloads: [],
      codexSpawnPayloadRules: [],
      qualityImpact: [
        plan.qualityImpact,
        `completed Codex subagents must be closed/reset before new spawn payloads: ${codexCleanupDebt.closeRequired.map((item) => item.hostInvocationId).filter(Boolean).join(", ")}`,
      ].filter(Boolean).join("; "),
    } : {}),
    evidencePacket: packet,
    verificationPolicy,
    ...(!codexSpawnBlockedByCleanup && plan.codexSpawnPayloads
      ? {
        codexSpawnPayloads: plan.codexSpawnPayloads.map((payload) => ({
          ...payload,
          payload: {
            ...payload.payload,
            evidence_packet: packet,
            verification_policy: verificationPolicy,
          },
        })),
      }
      : {}),
  };
  return {
    pass: enrichedPlan.executionMode !== "agent-required-blocked",
    projectRoot: resolvedProjectRoot,
    pluginRoot: resolvedPluginRoot,
    selectedHost: hostSelection.selectedHost,
    hostConfidence: hostSelection.confidence,
    availableAgentCount: availableAgentIds.length,
    callableAgentCount: callableAgentIds.length,
    installedOnly,
    plan: enrichedPlan,
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

function buildCommandAgentVerificationPolicy({
  command,
  workflowContext = {},
} = {}) {
  const stage = String(workflowContext.stage || workflowContext.phase || "").toLowerCase();
  const artifactType = String(workflowContext.artifactType || "").toLowerCase();
  const intent = String(workflowContext.intent || "").toLowerCase();
  const commandId = String(command || "").toLowerCase();
  const releaseGate = /\b(release|final|completion|phase-gate|phase)\b/.test(stage)
    || /\b(release|final)\b/.test(artifactType)
    || /\b(release|final)\b/.test(intent)
    || commandId.includes("validate-completion");
  return {
    schemaVersion: 1,
    scope: releaseGate ? "phase-or-release-gate" : "task-local",
    targetedOnly: !releaseGate,
    fullSuiteAllowed: releaseGate,
    fullSuitePolicy: "Full verification commands such as npm run check are reserved for phase or release gates; normal task agents run targeted commands only.",
    workerInstruction: releaseGate
      ? "This is a phase/release verification gate; full checks may run here after child work is complete."
      : "This is task-local execution; run only targeted checks from the assigned work item and defer npm run check to the final gate.",
  };
}

function formatCommandAgentVerificationPolicy(policy = {}) {
  return [
    "SUPERVIBE_COMMAND_VERIFICATION_POLICY",
    `VERIFICATION_SCOPE: ${policy.scope || "task-local"}`,
    `TARGETED_ONLY: ${policy.targetedOnly !== false}`,
    `FULL_SUITE_ALLOWED: ${policy.fullSuiteAllowed === true}`,
    `FULL_VERIFICATION_POLICY: ${policy.fullSuitePolicy || "full checks reserved for phase or release gates"}`,
  ].join("\n");
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
  if (hostAgentsFolder) addAgentSources(sources, join(projectRoot, ...hostAgentsFolder.split("/")), "host callable", { recursive: true });
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
  const handoffId = workflowContext.handoffId || workflowContext.handoff || null;
  try {
    return {
      ...validateScopedAgentProducerReceipts(projectRoot, {
        command,
        handoffId,
        workflowRunId: handoffId ? null : workflowContext.workflowRunId || null,
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
    workflowContext.commandScopedReceiptGate === true
    || workflowContext.active === true
    || workflowContext.handoffId
    || workflowContext.workflowRunId
    || workflowContext.slug
  );
}

function withDefaultCommandScopedHandoff(workflowContext = {}, command = "") {
  if (
    workflowContext.commandScopedReceiptGate !== true
    || workflowContext.active === true
    || workflowContext.handoffId
    || workflowContext.handoff
    || workflowContext.workflowRunId
    || workflowContext.slug
  ) {
    return workflowContext;
  }
  return {
    ...workflowContext,
    handoffId: defaultCommandScopedHandoffId(command),
  };
}

function defaultCommandScopedHandoffId(command = "") {
  const segment = String(command || "command")
    .trim()
    .replace(/^\//, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-|-$/g, "") || "command";
  return `command-agent-plan-${segment}`;
}

function parseBoolean(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return Boolean(value);
}
