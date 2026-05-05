#!/usr/bin/env node

import { fileURLToPath } from "node:url";

import {
  applyAdaptPlan,
  applyDokployDeployPlan,
  createAdaptPlan,
  createDokployDeployPlan,
  filterAdaptPlanItems,
  formatAdaptApply,
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
} from "./lib/supervibe-adapt.mjs";
import {
  applyAgentProvisioningPlan,
  createAgentProvisioningPlan,
  formatAgentProvisioningApply,
  formatAgentProvisioningPlan,
} from "./lib/agent-provisioning.mjs";
import {
  buildGenesisAgentRecommendation,
  discoverGenesisStackFingerprint,
} from "./lib/supervibe-agent-recommendation.mjs";
import { resolveSupervibePluginRoot, resolveSupervibeProjectRoot } from "./lib/supervibe-plugin-root.mjs";

const rawArgs = process.argv.slice(2);
const args = parseArgs(rawArgs);
const SCRIPT_PLUGIN_ROOT = fileURLToPath(new URL("../", import.meta.url));
const projectRoot = args.project || resolveSupervibeProjectRoot({ env: process.env, cwd: process.cwd() });
const pluginRoot = args["plugin-root"] || resolveSupervibePluginRoot({ env: process.env, cwd: SCRIPT_PLUGIN_ROOT });

try {
  if (args.help || args.h || rawArgs.includes("-h")) {
    console.log(formatUsage());
    process.exit(0);
  }

  if (args.scope === "deploy" || args.target === "dokploy") {
    if (args.target && args.target !== "dokploy") {
      throw new Error(`unsupported deploy target: ${args.target}`);
    }
    const deployPlan = createDokployDeployPlan({
      projectRoot,
      target: args.target || "dokploy",
    });
    if (args.apply) {
      const result = await applyDokployDeployPlan(deployPlan, {
        include: args.include ? String(args.include).split(",").filter(Boolean) : [],
        applyAll: Boolean(args.all),
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

  const plan = await createAdaptPlan({
    projectRoot,
    pluginRoot,
    env: process.env,
    adapterId: args.host,
    refreshMemoryIndex: args.apply || args.resolve ? false : resolveMemoryRefresh(args),
  });

  if (args.resolve) {
    const result = await resolveAdaptPlanItems(plan, String(args.resolve).split(",").filter(Boolean));
    printAdaptValue(result, {
      summary: summarizeAdaptResolve,
      formatter: formatAdaptResolve,
    });
    if (result.blocked.length > 0) process.exitCode = 2;
  } else if (args.apply) {
    const result = await applyAdaptPlan(plan, {
      include: args.include ? String(args.include).split(",").filter(Boolean) : [],
      applyAll: Boolean(args.all),
      refreshMemoryIndex: resolveMemoryRefresh(args),
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
  --resolve <paths>         Mark manually merged files resolved when they match upstream, ignoring CRLF/LF
  --all                     Apply all planned artifact updates
  --include <paths>         Comma-separated project-relative artifact paths to update
  --diff-summary            Print per-file addition/deletion summary
  --summary-json            Print compact machine-readable counts, changes, and evidence
  --changed-only            Omit identical artifacts from JSON/text item output
  --evidence-summary        Include compact diff/evidence lines in text output
  --quiet-identical         Suppress identical artifact details in machine-readable output
  --refresh-memory-index    Refresh .supervibe/memory/index.json during planning
  --no-refresh-memory-index Do not refresh memory index (dry-run default)
  --scope deploy            Plan or apply a deploy add-on instead of host artifact sync
  --target dokploy          Select the Dokploy deploy add-on
  --add-agents <ids>        Provision comma-separated agents through Adapt
  --agents <ids>            Alias for --add-agents
  --skills <ids>            Provision comma-separated supporting skills
  --profile <id>            Provision agents from a Genesis install profile
  --addons <ids>            Provision split agent add-ons such as creative-brand, web-design, prototype, presentation, mobile, desktop
  --agent-profile <id>      Alias for --profile in agent provisioning mode
  --agent-addons <ids>      Alias for --addons in agent provisioning mode
  --project <path>          Project root to adapt
  --plugin-root <path>      Supervibe plugin root to compare against
  --host <id>               Force host adapter, e.g. codex, claude, cursor
  --json                    Print machine-readable JSON
  --no-color                Accepted for command-surface compatibility
  --help, -h                Show this help and exit

Examples:
  node scripts/supervibe-adapt.mjs --dry-run
  node scripts/supervibe-adapt.mjs --apply --include ".codex/agents/repo-researcher.md"
  node scripts/supervibe-adapt.mjs --resolve ".codex/agents/repo-researcher.md"
  node scripts/supervibe-adapt.mjs --add-agents creative-director,prototype-builder
  node scripts/supervibe-adapt.mjs --profile product-design --addons creative-brand,web-design --apply
  node scripts/supervibe-adapt.mjs --scope deploy --target dokploy --dry-run
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
