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
    "",
    "NOTES:",
    "  Default execution mode is real-agents.",
    "  Unsupported or unverifiable host dispatch enters agent-required-blocked.",
    "  Inline mode is diagnostic/dry-run only and never satisfies specialist output.",
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
    const availableAgentIds = listAvailableAgentIds({
      pluginRoot,
      projectRoot,
      hostAgentsFolder: hostSelection.adapter.agentsFolder,
      installedOnly: options.installedOnly,
    });
    const plan = buildCommandAgentPlan(options.command, {
      requestedExecutionMode: options.executionMode,
      availableAgentIds,
      hostAdapterId: hostSelection.adapter.id,
      enforceHostProof: options.enforceHostProof,
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

function listAvailableAgentIds({
  pluginRoot,
  projectRoot,
  hostAgentsFolder,
  installedOnly = false,
}) {
  const ids = new Set();
  if (!installedOnly) addAgentIds(ids, join(pluginRoot, "agents"));
  if (hostAgentsFolder) addAgentIds(ids, join(projectRoot, ...hostAgentsFolder.split("/")));
  return [...ids].sort();
}

function addAgentIds(ids, dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      addAgentIds(ids, path);
    } else if (entry.endsWith(".md")) {
      ids.add(entry.replace(/\.md$/, ""));
    }
  }
}
