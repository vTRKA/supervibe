#!/usr/bin/env node

import { fileURLToPath } from "node:url";

import { applyAdaptPlan, createAdaptPlan, formatAdaptApply, formatAdaptPlan } from "./lib/supervibe-adapt.mjs";
import { resolveSupervibePluginRoot, resolveSupervibeProjectRoot } from "./lib/supervibe-plugin-root.mjs";

const args = parseArgs(process.argv.slice(2));
const SCRIPT_PLUGIN_ROOT = fileURLToPath(new URL("../", import.meta.url));
const projectRoot = args.project || resolveSupervibeProjectRoot({ env: process.env, cwd: process.cwd() });
const pluginRoot = args["plugin-root"] || resolveSupervibePluginRoot({ env: process.env, cwd: SCRIPT_PLUGIN_ROOT });

try {
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

function parseArgs(argv) {
  const parsed = { _: [] };
  const booleans = new Set(["apply", "all", "dry-run", "json", "no-color", "diff-summary"]);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
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
