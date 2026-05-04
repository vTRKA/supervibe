#!/usr/bin/env node

import { fileURLToPath } from "node:url";

import {
  applyAdaptPlan,
  createAdaptPlan,
  filterAdaptPlanItems,
  formatAdaptApply,
  formatAdaptPlan,
  formatAdaptResolve,
  resolveAdaptPlanItems,
  summarizeAdaptApply,
  summarizeAdaptPlan,
  summarizeAdaptResolve,
} from "./lib/supervibe-adapt.mjs";
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
