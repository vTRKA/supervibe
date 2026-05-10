#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyAdaptPlan,
  applyAdaptPlanFixedPoint,
  applyDokployDeployPlan,
  createAdaptPlan,
  createDokployDeployPlan,
  filterAdaptPlanItems,
  formatAdaptApply,
  formatAdaptAgentRuntimeVerification,
  formatDokployDeployApply,
  formatDokployDeployPlan,
  formatAdaptPlan,
  formatAdaptResolve,
  resolveAdaptPlanItems,
  summarizeAdaptApply,
  summarizeDokployDeployApply,
  summarizeDokployDeployPlan,
  summarizeAdaptPlan,
  summarizeAdaptResolve,
  verifyAdaptAgentRuntime,
} from "./lib/supervibe-adapt.mjs";
import {
  applyAgentProvisioningPlan,
  createAgentProvisioningPlan,
  formatAgentProvisioningApply,
  formatAgentProvisioningPlan,
} from "./lib/agent-provisioning.mjs";
import {
  buildRuntimeCommandAgentPlan,
} from "./command-agent-plan.mjs";
import {
  listCommandAgentProfiles,
} from "./lib/command-agent-orchestration-contract.mjs";
import {
  writeWorkflowTransactionAndReceipt,
} from "./lib/supervibe-workflow-transaction.mjs";
import {
  readWorkflowReceipts,
  validateWorkflowReceiptTrust,
} from "./lib/supervibe-workflow-receipt-runtime.mjs";
import {
  buildGenesisAgentRecommendation,
  discoverGenesisStackFingerprint,
} from "./lib/supervibe-agent-recommendation.mjs";
import { resolveSupervibePluginRoot, resolveSupervibeProjectRoot } from "./lib/supervibe-plugin-root.mjs";

const rawArgs = process.argv.slice(2);
const args = parseArgs(rawArgs);
const SCRIPT_PLUGIN_ROOT = fileURLToPath(new URL("../", import.meta.url));
const projectRoot = args["project-root"] || args.project || args.root || resolveSupervibeProjectRoot({ env: process.env, cwd: process.cwd() });
const pluginRoot = args["plugin-root"] || resolveSupervibePluginRoot({ env: process.env, cwd: SCRIPT_PLUGIN_ROOT });

try {
  if (args.help || args.h || rawArgs.includes("-h")) {
    console.log(formatUsage());
    process.exit(0);
  }

  if (args["recovery-status"]) {
    const result = buildAdaptRecoveryStatus({ projectRoot, secret: args.secret || null });
    if (args.json || args["summary-json"]) console.log(JSON.stringify(result, null, 2));
    else console.log(formatAdaptRecoveryStatus(result));
    process.exit(0);
  }

  if (args["verify-agents"]) {
    const result = await attachAdaptWorkflowTransaction(await verifyAdaptAgentRuntime(projectRoot, {
      pluginRoot,
      host: args.host || process.env.SUPERVIBE_HOST || "codex",
      options: args,
    }), {
      stage: "adapt-agent-runtime-verification",
      kind: "adapt-agent-runtime-verification",
      reason: "Adapt agent runtime verification wrote stable transaction evidence.",
    });
    if (args.json || args["summary-json"]) console.log(JSON.stringify(result, null, 2));
    else console.log(formatAdaptAgentRuntimeVerification(result));
    process.exit(result.agentRuntime.verified ? 0 : 2);
  }

  if (args.scope === "deploy" || args.target === "dokploy" || args.target === "docker") {
    if (args.target && !["dokploy", "docker"].includes(args.target)) {
      throw new Error(`unsupported deploy target: ${args.target}`);
    }
    const deployPlan = withEmbeddedAdaptAgentPlan(createDokployDeployPlan({
      projectRoot,
      target: args.target || "dokploy",
    }), {
      args,
      counts: {
        add: 0,
        update: 0,
        projectOnly: 0,
        conflicts: 0,
      },
      deployCounts: true,
    });
    if (args.apply) {
      const result = await attachAdaptWorkflowTransaction(await applyDokployDeployPlan(deployPlan, {
        include: args.include ? String(args.include).split(",").filter(Boolean) : [],
        applyAll: Boolean(args.all),
      }), {
        stage: "adapt-deploy-apply",
        kind: "adapt-deploy-apply",
        reason: "Adapt deploy apply generated deploy artifacts and verification evidence.",
      });
      printAdaptValue(result, {
        summary: summarizeDokployDeployApply,
        formatter: formatDokployDeployApply,
      });
    } else {
      printAdaptValue(deployPlan, {
        summary: summarizeDokployDeployPlan,
        formatter: formatDokployDeployPlan,
      });
    }
    process.exit(0);
  }

  if (isAgentProvisioningMode(args)) {
    const selection = resolveAgentProvisioningSelection({
      args,
      projectRoot,
      pluginRoot,
    });
    const provisioningPlan = createAgentProvisioningPlan({
      projectRoot,
      pluginRoot,
      env: process.env,
      adapterId: args.host,
      agentIds: selection.agentIds,
      skillIds: selection.skillIds,
    });
    provisioningPlan.applyCommand = buildAdaptAgentProvisioningApplyCommand(selection, args);
    if (args.apply) {
      const result = await applyAgentProvisioningPlan(provisioningPlan, { refreshContext: args["no-context"] !== true });
      printAgentProvisioningValue({ selection, plan: provisioningPlan, result });
    } else {
      printAgentProvisioningValue({ selection, plan: provisioningPlan });
    }
    process.exit(0);
  }

  const plan = withEmbeddedAdaptAgentPlan(await createAdaptPlan({
    projectRoot,
    pluginRoot,
    env: process.env,
    adapterId: args.host,
    refreshMemoryIndex: args.apply || args.resolve ? false : resolveMemoryRefresh(args),
  }), { args });

  if (args.resolve) {
    const result = await resolveAdaptPlanItems(plan, String(args.resolve).split(",").filter(Boolean));
    printAdaptValue(result, {
      summary: summarizeAdaptResolve,
      formatter: formatAdaptResolve,
    });
    if (result.blocked.length > 0) process.exitCode = 2;
  } else if (args.apply) {
    const applyFn = args["fixed-point"] || args.all ? applyAdaptPlanFixedPoint : applyAdaptPlan;
    const result = await attachAdaptWorkflowTransaction(await applyFn(plan, {
      include: args.include ? String(args.include).split(",").filter(Boolean) : [],
      applyAll: Boolean(args.all),
      refreshMemoryIndex: resolveMemoryRefresh(args),
      maxRounds: Number(args["max-rounds"] || 5),
    }), {
      stage: "adapt-apply",
      kind: "adapt-apply",
      reason: "Adapt apply wrote approved artifact and lifecycle evidence.",
    });
    printAdaptValue(result, {
      summary: summarizeAdaptApply,
      formatter: (value) => formatAdaptApply(value, { diffSummary: Boolean(args["diff-summary"] || args.all || args["evidence-summary"]) }),
    });
    if (result.blocked.length > 0) process.exitCode = 2;
  } else {
    const visiblePlan = filterAdaptPlanItems(plan, {
      changedOnly: Boolean(args["changed-only"]),
      quietIdentical: Boolean(args["quiet-identical"]),
    });
    printAdaptValue(visiblePlan, {
      summary: summarizeAdaptPlan,
      formatter: (value) => formatAdaptPlan(value, { diffSummary: Boolean(args["diff-summary"] || args["evidence-summary"]) }),
    });
  }
} catch (error) {
  console.error(`supervibe-adapt error: ${error.message}`);
  process.exit(1);
}

function printAdaptValue(value, { summary, formatter }) {
  if (args["summary-json"]) console.log(JSON.stringify(summary(value), null, 2));
  else if (args.json) console.log(JSON.stringify(value, null, 2));
  else console.log(formatter(value));
}

async function attachAdaptWorkflowTransaction(result, { stage, kind, reason } = {}) {
  if (Array.isArray(result.blocked) && result.blocked.length > 0) return result;
  const summary = buildAdaptTransactionSummary(result);
  const transaction = await writeWorkflowTransactionAndReceipt({
    rootDir: projectRoot,
    command: "/supervibe-adapt",
    stage,
    subjectId: "supervibe-adapt-runner",
    kind,
    reason,
    summary,
  });
  return {
    ...result,
    workflowTransaction: transaction,
    mutatedPaths: [
      ...(result.mutatedPaths || []),
      transaction.path,
      transaction.receiptPath,
      transaction.artifactLinksPath,
      ".supervibe/memory/workflow-invocation-ledger.jsonl",
    ].filter(Boolean),
  };
}

function buildAdaptTransactionSummary(result = {}) {
  return {
    kind: result.kind || "adapt-result",
    scope: result.scope || "artifacts",
    target: result.target || null,
    host: result.host?.adapterId || null,
    deployProfile: result.deployProfile?.id || null,
    counts: {
      applied: result.applied?.length || 0,
      created: result.created?.length || 0,
      updated: result.updated?.length || 0,
      skipped: result.skipped?.length || 0,
      blocked: result.blocked?.length || 0,
    },
    verification: result.lifecycleState?.verification || {
      agentRuntimeVerified: result.agentRuntime?.verified === true,
    },
    mutatedPaths: result.mutatedPaths || [],
    nextAction: nextActionForAdaptResult(result),
  };
}

function nextActionForAdaptResult(result = {}) {
  if (result.kind === "adapt-deploy-apply") {
    return result.lifecycleState?.verification?.deployVerified === true
      ? null
      : "Run deployment runtime health checks before claiming deploy verified.";
  }
  if (result.kind === "adapt-agent-runtime-verification") {
    return result.agentRuntime?.verified === true
      ? null
      : "Run real host-agent smoke, log invocation id, and rerun --verify-agents.";
  }
  if (result.postApply?.clean === false) {
    return "Rerun supervibe-adapt --dry-run and apply remaining approved artifacts.";
  }
  return null;
}

function buildAdaptRecoveryStatus({ projectRoot: rootDir, secret = null } = {}) {
  const receipts = readWorkflowReceipts(rootDir);
  const checks = receipts.map((receipt) => ({
    receipt,
    trust: receipt.__invalidJson
      ? { pass: false, issues: ["invalid receipt JSON"] }
      : validateWorkflowReceiptTrust(rootDir, receipt, { secret }),
  }));
  const trusted = checks
    .filter((item) => item.trust.pass)
    .sort((left, right) => String(left.receipt.completedAt || "").localeCompare(String(right.receipt.completedAt || "")));
  const adaptTrusted = trusted.filter((item) => String(item.receipt.command || "") === "/supervibe-adapt");
  const dirty = checks.filter((item) => !item.trust.pass);
  const lastTrusted = trusted[trusted.length - 1]?.receipt || null;
  const lastTrustedAdapt = adaptTrusted[adaptTrusted.length - 1]?.receipt || null;
  const state = readAdaptStateSnapshot(rootDir);
  return {
    kind: "adapt-recovery-status",
    projectRoot: rootDir,
    pluginRoot,
    receipts: receipts.length,
    trustedReceipts: trusted.length,
    dirtyReceipts: dirty.map((item) => ({
      path: item.receipt.__file || "unknown",
      issues: item.trust.issues || [],
    })),
    lastTrustedStage: formatReceiptStage(lastTrusted),
    lastTrustedCompletedAt: lastTrusted?.completedAt || null,
    lastTrustedAdaptStage: formatReceiptStage(lastTrustedAdapt),
    lastTrustedAdaptCompletedAt: lastTrustedAdapt?.completedAt || null,
    adaptState: state,
    nextSafeCommand: nextSafeRecoveryCommand({ dirtyReceipts: dirty, state, lastTrustedAdapt }),
  };
}

function readAdaptStateSnapshot(rootDir) {
  const relPath = ".supervibe/memory/adapt/state.json";
  const path = join(rootDir, ...relPath.split("/"));
  if (!existsSync(path)) {
    return {
      present: false,
      path: relPath,
      lifecycle: null,
      currentStage: null,
      verification: null,
    };
  }
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return {
      present: true,
      path: relPath,
      lifecycle: parsed.lifecycle || null,
      currentStage: parsed.currentStage || null,
      verification: parsed.verification || null,
      updatedAt: parsed.updatedAt || null,
    };
  } catch (error) {
    return {
      present: true,
      path: relPath,
      lifecycle: null,
      currentStage: "unreadable",
      verification: null,
      readError: error.message,
    };
  }
}

function nextSafeRecoveryCommand({ dirtyReceipts = [], state = {}, lastTrustedAdapt = null } = {}) {
  if (dirtyReceipts.length) {
    return "node <resolved-supervibe-plugin-root>/scripts/workflow-receipt.mjs rebuild-ledger --prune-stale --root <project-root>";
  }
  if (!state.present || !lastTrustedAdapt) {
    return "node <resolved-supervibe-plugin-root>/scripts/supervibe-adapt.mjs --dry-run";
  }
  if (state.verification?.agentRuntimeVerified !== true) {
    return "node <resolved-supervibe-plugin-root>/scripts/supervibe-adapt.mjs --verify-agents";
  }
  return "node <resolved-supervibe-plugin-root>/scripts/supervibe-adapt.mjs --dry-run";
}

function formatReceiptStage(receipt = null) {
  if (!receipt) return "none";
  return `${receipt.command}:${receipt.subjectType}:${receipt.subjectId}@${receipt.stage}`;
}

function formatAdaptRecoveryStatus(result = {}) {
  const lines = [
    "SUPERVIBE_ADAPT_RECOVERY_STATUS",
    `RECEIPTS: ${result.receipts}`,
    `TRUSTED_RECEIPTS: ${result.trustedReceipts}`,
    `DIRTY_RECEIPTS: ${result.dirtyReceipts.length}`,
    `LAST_TRUSTED_STAGE: ${result.lastTrustedStage || "none"}`,
    `LAST_TRUSTED_ADAPT_STAGE: ${result.lastTrustedAdaptStage || "none"}`,
    `ADAPT_STATE: ${result.adaptState?.present ? result.adaptState.path : "missing"}`,
    `ADAPT_LIFECYCLE: ${result.adaptState?.lifecycle || "none"}`,
    `ADAPT_CURRENT_STAGE: ${result.adaptState?.currentStage || "none"}`,
    `NEXT_SAFE_COMMAND: ${result.nextSafeCommand}`,
  ];
  for (const item of result.dirtyReceipts || []) {
    lines.push(`DIRTY_RECEIPT: ${item.path}`);
    for (const issue of item.issues || []) lines.push(`DIRTY_REASON: ${issue}`);
  }
  return lines.join("\n");
}

function withEmbeddedAdaptAgentPlan(value, { args: values = {}, counts = null, deployCounts = false } = {}) {
  const sourceCounts = counts || value.counts || {};
  const workflowCounts = deployCounts
    ? {
        add: Number(value.counts?.create || 0),
        update: Number(value.counts?.update || 0),
        projectOnly: 0,
        conflicts: 0,
      }
    : {
        add: Number(sourceCounts.add || 0),
        update: Number(sourceCounts.update || 0),
        projectOnly: Number(sourceCounts.projectOnly || 0),
        conflicts: Number(sourceCounts.conflicts || 0),
      };
  const report = buildRuntimeCommandAgentPlan({
    command: "/supervibe-adapt",
    projectRoot,
    pluginRoot,
    host: values.host || process.env.SUPERVIBE_HOST || value.host?.adapterId || "codex",
    workflowContext: {
      dryRun: values.apply !== true,
      apply: values.apply === true,
      verifyAgents: values["verify-agents"] === true,
      adds: workflowCounts.add,
      updates: workflowCounts.update,
      projectOnly: workflowCounts.projectOnly,
      conflicts: workflowCounts.conflicts,
      memoryWrites: value.memoryWrites === true,
    },
    env: process.env,
  });
  const hostAdapterId = values.host || process.env.SUPERVIBE_HOST || value.host?.adapterId || "codex";
  return {
    ...value,
    commandAgentPlan: report.plan,
    commandAgentPlanReport: {
      pass: report.pass,
      selectedHost: report.selectedHost,
      hostConfidence: report.hostConfidence,
      availableAgentCount: report.availableAgentCount,
    },
    commandAgentReadiness: buildCommandAgentReadiness({
      hostAdapterId,
      projectRoot,
      pluginRoot,
      env: process.env,
    }),
  };
}

function buildCommandAgentReadiness({
  hostAdapterId = "codex",
  projectRoot: targetProjectRoot,
  pluginRoot: targetPluginRoot,
  env = process.env,
} = {}) {
  const commandReports = listCommandAgentProfiles().map((profile) => {
    const report = buildRuntimeCommandAgentPlan({
      command: profile.commandId,
      projectRoot: targetProjectRoot,
      pluginRoot: targetPluginRoot,
      host: hostAdapterId,
      workflowContext: {
        dryRun: true,
        active: false,
        memoryWrites: false,
      },
      env,
    });
    const plan = report.plan || {};
    return {
      command: profile.commandId,
      executionMode: plan.executionMode || "unknown",
      callableAgentsReady: plan.callableAgentsReady === true,
      missingCallableAgents: plan.missingCallableAgents || [],
      missingAgents: plan.missingAgents || [],
    };
  });
  const blockedCommands = commandReports
    .filter((entry) => entry.missingCallableAgents.length > 0 || entry.missingAgents.length > 0);
  const missingCallableAgents = unique(blockedCommands.flatMap((entry) => entry.missingCallableAgents));
  const missingAgents = unique(blockedCommands.flatMap((entry) => entry.missingAgents));
  return {
    ready: blockedCommands.length === 0,
    host: hostAdapterId,
    totalCommands: commandReports.length,
    readyCommands: commandReports.length - blockedCommands.length,
    blockedCommands,
    missingCallableAgents,
    missingAgents,
    repairCommand: missingCallableAgents.length > 0
      ? `node <resolved-supervibe-plugin-root>/scripts/supervibe-adapt.mjs --add-agents ${missingCallableAgents.join(",")} --host ${hostAdapterId} --apply`
      : null,
  };
}

function printAgentProvisioningValue({ selection, plan, result = null }) {
  if (args.json) {
    console.log(JSON.stringify({ mode: "adapt-agent-provisioning", selection, plan, result }, null, 2));
    return;
  }
  if (result) {
    const lines = [
      "SUPERVIBE_ADAPT_AGENT_PROVISIONING_APPLY",
      `PROFILE: ${selection.profile || "none"}`,
      `ADDONS: ${selection.addOns.join(",") || "none"}`,
      formatAgentProvisioningApply(result),
    ];
    console.log(lines.join("\n"));
    return;
  }
  const lines = [
    "SUPERVIBE_ADAPT_AGENT_PROVISIONING_PLAN",
    `PROFILE: ${selection.profile || "none"}`,
    `ADDONS: ${selection.addOns.join(",") || "none"}`,
    `SELECTED_AGENTS: ${selection.agentIds.join(",") || "none"}`,
    `SELECTED_SKILLS: ${selection.skillIds.join(",") || "none"}`,
    formatAgentProvisioningPlan(plan),
  ];
  console.log(lines.join("\n"));
}

function isAgentProvisioningMode(values = {}) {
  return Boolean(
    values["add-agents"]
    || values.agents
    || values.skills
    || values.profile
    || values["agent-profile"]
    || values.addons
    || values["agent-addons"]
  );
}

function resolveAgentProvisioningSelection({ args: values, projectRoot, pluginRoot }) {
  const explicitAgents = splitList(values["add-agents"] || values.agents);
  const skillIds = splitList(values.skills);
  const profile = values["agent-profile"] || values.profile || "";
  const addOns = splitList(values["agent-addons"] || values.addons);
  if (!profile && addOns.length === 0) {
    return {
      profile: "",
      addOns,
      agentIds: unique(explicitAgents),
      skillIds: unique(skillIds),
    };
  }
  const fingerprint = discoverGenesisStackFingerprint({
    rootDir: projectRoot,
    explicitStackTags: values["stack-tags"] ? String(values["stack-tags"]).split(/[,\s]+/).filter(Boolean) : [],
    stackText: values.request || "",
  });
  const recommendation = buildGenesisAgentRecommendation({
    rootDir: pluginRoot,
    fingerprint,
    selectedProfile: profile || "minimal",
    addOns,
  });
  return {
    profile: profile || "minimal",
    addOns,
    agentIds: unique([...explicitAgents, ...recommendation.selectedAgents]),
    skillIds: unique(skillIds),
    stackTags: recommendation.stackTags,
  };
}

function buildAdaptAgentProvisioningApplyCommand(selection, values = {}) {
  return [
    "node <resolved-supervibe-plugin-root>/scripts/supervibe-adapt.mjs",
    values.host ? `--host ${values.host}` : null,
    selection.agentIds.length ? `--add-agents ${selection.agentIds.join(",")}` : null,
    selection.skillIds.length ? `--skills ${selection.skillIds.join(",")}` : null,
    "--apply",
  ].filter(Boolean).join(" ");
}

function formatUsage() {
  return `
Supervibe adapt

Usage:
  node scripts/supervibe-adapt.mjs [options]

Options:
  --dry-run                 Inspect artifact and metadata drift (default)
  --apply                   Apply approved artifact updates or metadata-only drift
  --verify-agents           Verify receipt-bound real host-agent telemetry and update Adapt state
  --record-smoke            With --verify-agents, record a real host-agent smoke receipt using --host-invocation-id
  --recovery-status         Report last trusted stage, dirty receipts, Adapt state, and one next safe command
  --resolve <paths>         Mark manually merged files resolved when they match upstream, ignoring CRLF/LF
  --all                     Apply all planned artifact updates
  --include <paths>         Comma-separated project-relative artifact paths to update
  --diff-summary            Print per-file addition/deletion summary
  --fixed-point             After apply, repeat dry-run/apply until no add/update remains or a hard stop appears
  --max-rounds <n>          Fixed-point apply safety cap (default 5)
  --summary-json            Print compact machine-readable counts, changes, and evidence
  --changed-only            Omit identical artifacts from JSON/text item output
  --evidence-summary        Include compact diff/evidence lines in text output
  --quiet-identical         Suppress identical artifact details in machine-readable output
  --refresh-memory-index    Refresh .supervibe/memory/index.json during planning
  --no-refresh-memory-index Do not refresh memory index (dry-run default)
  --scope deploy            Plan or apply a deploy add-on instead of host artifact sync
  --target <dokploy|docker> Select the deploy add-on target
  --add-agents <ids>        Provision comma-separated agents through Adapt
  --agents <ids>            Alias for --add-agents
  --skills <ids>            Provision comma-separated supporting skills
  --profile <id>            Provision agents from a Genesis install profile
  --addons <ids>            Provision split agent add-ons such as creative-brand, web-design, prototype, presentation, mobile, desktop
  --agent-profile <id>      Alias for --profile in agent provisioning mode
  --agent-addons <ids>      Alias for --addons in agent provisioning mode
  --project <path>          Project root to adapt
  --project-root <path>     Alias for --project
  --plugin-root <path>      Supervibe plugin root to compare against
  --host <id>               Force host adapter, e.g. codex, claude, cursor
  --json                    Print machine-readable JSON
  --no-color                Accepted for command-surface compatibility
  --help, -h                Show this help and exit

Examples:
  node scripts/supervibe-adapt.mjs --dry-run
  node scripts/supervibe-adapt.mjs --apply --include ".codex/agents/repo-researcher.md"
  node scripts/supervibe-adapt.mjs --resolve ".codex/agents/repo-researcher.md"
  node scripts/supervibe-adapt.mjs --verify-agents
  node scripts/supervibe-adapt.mjs --recovery-status
  node scripts/supervibe-adapt.mjs --add-agents creative-director,prototype-builder
  node scripts/supervibe-adapt.mjs --profile product-design --addons creative-brand,web-design --apply
  node scripts/supervibe-adapt.mjs --scope deploy --target dokploy --dry-run
  node scripts/supervibe-adapt.mjs --scope deploy --target docker --dry-run
  node scripts/supervibe-adapt.mjs --apply
`.trim();
}

function resolveMemoryRefresh(args) {
  if (args["refresh-memory-index"]) return true;
  if (args["no-refresh-memory-index"]) return false;
  return Boolean(args.apply);
}

function parseArgs(argv) {
  const parsed = { _: [] };
  const booleans = new Set([
    "apply",
    "all",
    "dry-run",
    "json",
    "summary-json",
    "changed-only",
    "evidence-summary",
    "quiet-identical",
    "no-color",
    "diff-summary",
    "no-context",
    "refresh-memory-index",
    "no-refresh-memory-index",
    "verify-agents",
    "recovery-status",
    "fixed-point",
    "record-smoke",
    "help",
    "h",
  ]);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h") {
      parsed.h = true;
      continue;
    }
    if (!arg.startsWith("--")) {
      parsed._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    if (booleans.has(key)) parsed[key] = true;
    else {
      parsed[key] = argv[i + 1];
      i += 1;
    }
  }
  return parsed;
}

function splitList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}
