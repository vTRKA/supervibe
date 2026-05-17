#!/usr/bin/env node
import { resolve } from "node:path";

import {
  createAutoGcMaintenancePlan,
  formatAutoGcMaintenanceStatus,
  readAutoGcMaintenanceState,
  runAutoGcMaintenance,
  spawnDetachedAutoGcMaintenance,
} from "./lib/supervibe-auto-gc-maintenance.mjs";

function parseArgs(argv) {
  const options = {
    rootDir: process.env.SUPERVIBE_PROJECT_ROOT || process.env.SUPERVIBE_PROJECT_DIR || process.cwd(),
    status: false,
    spawn: false,
    runOnce: false,
    dryRun: false,
    json: false,
    force: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--root") options.rootDir = argv[++i] || options.rootDir;
    else if (arg === "--status") options.status = true;
    else if (arg === "--spawn") options.spawn = true;
    else if (arg === "--run-once") options.runOnce = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--force") options.force = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
  }
  options.rootDir = resolve(options.rootDir);
  return options;
}

function autoGcEnabledForStatus(env = process.env) {
  const value = env.SUPERVIBE_AUTO_GC ?? env.SUPERVIBE_SESSION_START_AUTO_GC ?? "on";
  return !["0", "false", "off", "disabled", "no"].includes(String(value).trim().toLowerCase());
}

async function readCheapAutoGcStatus({ rootDir, env = process.env } = {}) {
  const state = await readAutoGcMaintenanceState({ rootDir });
  return {
    schemaVersion: 1,
    rootDir,
    enabled: autoGcEnabledForStatus(env),
    status: state?.status || "never-run",
    shouldRun: false,
    throttled: false,
    state: state || {},
    nextAction: state?.nextAction || "status read only; use --spawn or --run-once to queue maintenance",
  };
}

function printHelp() {
  console.log([
    "Usage: node scripts/supervibe-auto-gc-maintenance.mjs [--status|--spawn|--run-once] [--dry-run] [--root <dir>]",
    "",
    "Runs or reports the session-start background auto-GC lane.",
    "It only applies auto-safe memory/artifact retention and never archives active work graphs.",
    "Disable automatic session-start queueing with SUPERVIBE_AUTO_GC=off.",
  ].join("\n"));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  if (options.status) {
    const result = await readCheapAutoGcStatus({ rootDir: options.rootDir });
    console.log(options.json ? JSON.stringify(result, null, 2) : formatAutoGcMaintenanceStatus(result));
    return;
  }
  if (options.spawn) {
    const result = await spawnDetachedAutoGcMaintenance({
      rootDir: options.rootDir,
      force: options.force,
    });
    console.log(options.json ? JSON.stringify(result, null, 2) : formatAutoGcMaintenanceStatus(result));
    return;
  }
  if (options.runOnce) {
    const result = await runAutoGcMaintenance({
      rootDir: options.rootDir,
      dryRun: options.dryRun,
      force: options.force,
    });
    console.log(options.json ? JSON.stringify(result, null, 2) : formatAutoGcMaintenanceStatus({ ...result, state: result }));
    if (result.status === "failed") process.exitCode = 1;
    return;
  }
  const plan = await createAutoGcMaintenancePlan({
    rootDir: options.rootDir,
    force: options.force,
    throttleMs: 0,
  });
  console.log(options.json ? JSON.stringify(plan, null, 2) : formatAutoGcMaintenanceStatus(plan));
}

main().catch((error) => {
  console.error(`supervibe-auto-gc-maintenance error: ${error.message}`);
  process.exitCode = 1;
});
