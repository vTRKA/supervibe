#!/usr/bin/env node
// Background-friendly auto-update coordinator.
//
// Policy:
// - default: check everywhere, apply only for the managed installer checkout
// - SUPERVIBE_AUTO_UPDATE=apply: apply for any clean git checkout
// - SUPERVIBE_AUTO_UPDATE=check/off: force notify-only or disabled behavior

import { resolveSupervibePluginRoot } from './lib/supervibe-plugin-root.mjs';
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  acquireAutoUpdateLock,
  createAutoUpdatePlan,
  readAutoUpdateState,
  writeAutoUpdateState,
} from "./lib/supervibe-auto-update.mjs";
import {
  performUpstreamCheck,
  readUpgradeCache,
} from "./lib/upgrade-check.mjs";
import {
  createUpgradeDryRun,
  formatInstallerHealthReport,
  formatUpgradeDryRun,
  runInstallerHealthGate,
} from "./lib/supervibe-installer-health.mjs";
import { withSupervibePluginRootEnv } from "./lib/supervibe-plugin-root.mjs";

const args = parseArgs(process.argv.slice(2));
const PLUGIN_ROOT = resolveSupervibePluginRoot();

async function main() {
  if (args.status) {
    const state = await readAutoUpdateState(PLUGIN_ROOT);
    console.log(JSON.stringify(state || { status: "none" }, null, 2));
    return;
  }

  if (args.dryRun) {
    const cache = await readUpgradeCache(PLUGIN_ROOT);
    const health = args.health ? runInstallerHealthGate({ rootDir: PLUGIN_ROOT }) : runInstallerHealthGate({ rootDir: PLUGIN_ROOT });
    const dryRun = createUpgradeDryRun({
      rootDir: PLUGIN_ROOT,
      currentVersion: readPluginVersion(PLUGIN_ROOT),
      targetVersion: cache?.latestTag || null,
      plannedFiles: [],
      health,
    });
    console.log(args.health ? `${formatInstallerHealthReport(health)}\n\n${formatUpgradeDryRun(dryRun)}` : formatUpgradeDryRun(dryRun));
    if (args.health && !health.pass) process.exitCode = 2;
    return;
  }

  if (args.plan) {
    const cache = await readUpgradeCache(PLUGIN_ROOT);
    const plan = createAutoUpdatePlan({
      pluginRoot: PLUGIN_ROOT,
      cache,
      env: process.env,
    });
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  const lock = await acquireAutoUpdateLock(PLUGIN_ROOT);
  if (!lock.acquired) {
    await writeAutoUpdateState(PLUGIN_ROOT, {
      status: "locked",
      at: new Date().toISOString(),
      lockPath: lock.path,
    });
    if (!args.background) console.log("[supervibe:auto-update] another update check is already running");
    return;
  }

  try {
    await runWithLock();
  } finally {
    await lock.release();
  }
}

async function runWithLock() {
  let cache = await readUpgradeCache(PLUGIN_ROOT);
  let plan = createAutoUpdatePlan({
    pluginRoot: PLUGIN_ROOT,
    cache,
    env: process.env,
  });

  await writeAutoUpdateState(PLUGIN_ROOT, {
    status: "checking",
    at: new Date().toISOString(),
    mode: plan.mode,
    managedInstall: plan.managedInstall,
    cacheStale: plan.cacheStale,
    behind: plan.behind,
  });

  if (plan.check || args.refresh) {
    if (!args.background) console.log("[supervibe:auto-update] checking upstream");
    cache = await performUpstreamCheck(PLUGIN_ROOT);
    plan = createAutoUpdatePlan({
      pluginRoot: PLUGIN_ROOT,
      cache,
      env: process.env,
    });
  }

  if (!plan.apply) {
    await writeAutoUpdateState(PLUGIN_ROOT, {
      status: plan.behind > 0 ? "update-available" : "up-to-date",
      at: new Date().toISOString(),
      mode: plan.mode,
      managedInstall: plan.managedInstall,
      behind: plan.behind,
      applyBlocked: plan.applyBlocked,
      latestTag: cache?.latestTag || null,
      error: cache?.error || null,
    });
    if (!args.background) printPlanSummary(plan, cache);
    return;
  }

  const health = runInstallerHealthGate({ rootDir: PLUGIN_ROOT });
  if (!health.pass) {
    await writeAutoUpdateState(PLUGIN_ROOT, {
      status: "blocked-by-install-health",
      at: new Date().toISOString(),
      issues: health.issues,
    });
    if (!args.background) console.error(formatInstallerHealthReport(health));
    process.exitCode = 2;
    return;
  }

  await writeAutoUpdateState(PLUGIN_ROOT, {
    status: "applying",
    at: new Date().toISOString(),
    mode: plan.mode,
    managedInstall: plan.managedInstall,
    behind: plan.behind,
    latestTag: cache?.latestTag || null,
  });

  if (!args.background) {
    console.log(`[supervibe:auto-update] applying ${plan.behind} upstream commit(s)`);
  }

  const result = spawnSync(process.execPath, [
    join(PLUGIN_ROOT, "scripts", "supervibe-upgrade.mjs"),
  ], {
    cwd: PLUGIN_ROOT,
    env: withSupervibePluginRootEnv(PLUGIN_ROOT),
    stdio: args.background ? "ignore" : "inherit",
    windowsHide: true,
  });

  const ok = result.status === 0;
  await writeAutoUpdateState(PLUGIN_ROOT, {
    status: ok ? "updated" : "failed",
    at: new Date().toISOString(),
    mode: plan.mode,
    managedInstall: plan.managedInstall,
    behind: plan.behind,
    latestTag: cache?.latestTag || null,
    exitCode: result.status,
    signal: result.signal || null,
  });

  if (!ok) process.exitCode = result.status || 1;
}

function printPlanSummary(plan, cache) {
  if (cache?.error) {
    console.log(`[supervibe:auto-update] upstream check failed: ${cache.error}`);
    return;
  }
  if (plan.behind <= 0) {
    console.log("[supervibe:auto-update] up to date");
    return;
  }
  const tag = cache?.latestTag ? ` (latest tag: ${cache.latestTag})` : "";
  console.log(`[supervibe:auto-update] ${plan.behind} upstream commit(s) available${tag}`);
  console.log(`[supervibe:auto-update] apply blocked: ${plan.applyBlocked.join(", ") || "none"}`);
}

function parseArgs(argv) {
  const parsed = {};
  for (const arg of argv) {
    if (arg === "--background") parsed.background = true;
    else if (arg === "--refresh") parsed.refresh = true;
    else if (arg === "--plan") parsed.plan = true;
    else if (arg === "--status") parsed.status = true;
    else if (arg === "--dry-run") parsed.dryRun = true;
    else if (arg === "--health") parsed.health = true;
  }
  return parsed;
}

function readPluginVersion(root) {
  try {
    return JSON.parse(readFileSync(join(root, ".claude-plugin", "plugin.json"), "utf8")).version || null;
  } catch {
    return null;
  }
}

main().catch(async (err) => {
  await writeAutoUpdateState(PLUGIN_ROOT, {
    status: "failed",
    at: new Date().toISOString(),
    error: err.message,
  }).catch(() => {});
  if (!args.background) console.error(`[supervibe:auto-update] ${err.message}`);
  process.exitCode = 1;
});
