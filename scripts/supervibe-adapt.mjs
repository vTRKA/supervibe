#!/usr/bin/env node

import { fileURLToPath } from "node:url";

import { applyAdaptPlan, createAdaptPlan, formatAdaptApply, formatAdaptPlan } from "./lib/supervibe-adapt.mjs";
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
  });

  if (args.apply) {
    const result = await applyAdaptPlan(plan, {
      include: args.include ? String(args.include).split(",").filter(Boolean) : [],
      applyAll: Boolean(args.all),
    });
    print(result, (value) => formatAdaptApply(value, { diffSummary: Boolean(args["diff-summary"] || args.all) }));
    if (result.blocked.length > 0) process.exitCode = 2;
  } else {
    print(plan, (value) => formatAdaptPlan(value, { diffSummary: Boolean(args["diff-summary"]) }));
  }
} catch (error) {
  console.error(`supervibe-adapt error: ${error.message}`);
  process.exit(1);
}

function print(value, formatter) {
  if (args.json) console.log(JSON.stringify(value, null, 2));
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
  --all                     Apply all planned artifact updates
  --include <paths>         Comma-separated project-relative artifact paths to update
  --diff-summary            Print per-file addition/deletion summary
  --project <path>          Project root to adapt
  --plugin-root <path>      Supervibe plugin root to compare against
  --host <id>               Force host adapter, e.g. codex, claude, cursor
  --json                    Print machine-readable JSON
  --no-color                Accepted for command-surface compatibility
  --help, -h                Show this help and exit

Examples:
  node scripts/supervibe-adapt.mjs --dry-run
  node scripts/supervibe-adapt.mjs --apply --include ".codex/agents/repo-researcher.md"
  node scripts/supervibe-adapt.mjs --apply
`.trim();
}

function parseArgs(argv) {
  const parsed = { _: [] };
  const booleans = new Set(["apply", "all", "dry-run", "json", "no-color", "diff-summary", "help", "h"]);
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
