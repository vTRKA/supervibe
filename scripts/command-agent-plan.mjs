#!/usr/bin/env node
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildCommandAgentPlan,
  formatCommandAgentPlan,
} from "./lib/command-agent-orchestration-contract.mjs";
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
    else if (key === "project" || key === "root") options.projectRoot = value;
    else if (key === "plugin-root") options.pluginRoot = value;
    else if (key === "execution-mode") options.executionMode = value;
    else if (key === "host") options.host = value;
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
    "  node scripts/command-agent-plan.mjs --command /supervibe-plan --host codex --json",
    "  node scripts/command-agent-plan.mjs --command /supervibe-adapt --adds 0 --updates 1 --project-only 0 --conflicts 0 --memory-writes false",
    "  node scripts/command-agent-plan.mjs --command /supervibe-adapt --low-risk",
    "  node scripts/command-agent-plan.mjs --command /supervibe-genesis --bootstrap-pre-agent --installed-only",
    "",
    "NOTES:",
    "  Default execution mode is real-agents.",
    "  Text output includes AGENT_SELECTION_MODE and REQUIRED_AGENT_SOURCES.",
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
    const projectRoot = resolve(options.projectRoot);
    const pluginRoot = resolve(options.pluginRoot);
    const env = { ...process.env };
    if (options.host) env.SUPERVIBE_HOST = options.host;
    const hostSelection = selectHostAdapter({ rootDir: projectRoot, env });
    const genesisDefaultDryRun = isBareGenesisBootstrapPlan(options);
    const availableAgentSources = listAvailableAgentSources({
      pluginRoot,
      projectRoot,
      hostAgentsFolder: hostSelection.adapter.agentsFolder,
      installedOnly: options.installedOnly,
    });
    const availableAgentIds = [...availableAgentSources.keys()];
    const plan = buildCommandAgentPlan(options.command, {
      requestedExecutionMode: options.executionMode,
      availableAgentIds,
      availableAgentSources,
      hostAdapterId: hostSelection.adapter.id,
      enforceHostProof: options.enforceHostProof,
      workflowContext: {
        lowRisk: options["low-risk"] === true,
        bootstrapPreAgent: options.bootstrapPreAgent === true,
        dryRun: options.dryRun === true || options["dry-run"] === true || genesisDefaultDryRun,
        apply: options.apply === true,
        generateApps: options.generateApps === true || options["generate-apps"] === true,
        verifyAgents: options.verifyAgents === true || options["verify-agents"] === true,
        adds: options.adds,
        updates: options.updates,
        projectOnly: options["project-only"],
        conflicts: options.conflicts,
        memoryWrites: options["memory-writes"] === undefined ? false : options["memory-writes"],
      },
    });
    const report = {
      pass: plan.executionMode !== "agent-required-blocked",
      projectRoot,
      pluginRoot,
      selectedHost: hostSelection.selectedHost,
      hostConfidence: hostSelection.confidence,
      availableAgentCount: availableAgentIds.length,
      installedOnly: options.installedOnly,
      plan,
    };
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(formatCommandAgentPlan(plan));
      console.log(`HOST_SELECTED: ${hostSelection.selectedHost}`);
      console.log(`HOST_CONFIDENCE: ${hostSelection.confidence}`);
      console.log(`AVAILABLE_AGENTS: ${availableAgentIds.length}`);
      console.log(`INSTALLED_ONLY: ${options.installedOnly}`);
    }
    process.exit(options.strictExit && !report.pass ? 3 : 0);
  } catch (error) {
    console.error("SUPERVIBE_COMMAND_AGENT_PLAN_ERROR");
    console.error(`ERROR: ${error.message}`);
    process.exit(2);
  }
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

function addAgentSources(sources, dir, source) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      addAgentSources(sources, path, source);
    } else if (entry.endsWith(".md")) {
      const id = entry.replace(/\.md$/, "");
      if (source === "project artifact" || !sources.has(id)) sources.set(id, source);
    }
  }
}

function parseBoolean(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return Boolean(value);
}
