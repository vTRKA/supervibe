#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  cleanupRuntimeTargets,
  defaultRuntimeCleanupRegistryPath,
} from "./lib/runtime-cleanup-registry.mjs";
import {
  killAllServers,
  killStaleServers,
} from "./lib/preview-server-manager.mjs";

function parseArgs(argv = []) {
  const options = {};
  for (let index = 2; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      options[key] = true;
      continue;
    }
    options[key] = next;
    index += 1;
  }
  return options;
}

export function formatRuntimeCleanupReport(result = {}) {
  const lines = [
    "SUPERVIBE_RUNTIME_CLEANUP",
    `DRY_RUN: ${result.dryRun === true}`,
    `UNUSED_ONLY: ${result.unusedOnly === true}`,
    `OLDER_THAN_MINUTES: ${result.olderThanMinutes ?? 0}`,
    `CHECKED: ${result.checked || 0}`,
    `REGISTRY_CHECKED: ${result.registryChecked || 0}`,
    `SERVER_PID_FILES_CHECKED: ${result.serverPidFilesChecked || 0}`,
    `STOPPED: ${result.stopped || 0}`,
    `WOULD_STOP: ${result.wouldStop || 0}`,
    `STALE: ${result.stale || 0}`,
    `ACTIVE: ${result.active || 0}`,
    `OWNERSHIP_UNVERIFIED: ${result.ownershipUnverified || 0}`,
    `HOST_MANAGED: ${result.hostManaged || 0}`,
    `HOST_MANAGED_COMPLETED: ${result.hostManagedCompleted || 0}`,
    `HOST_MANAGED_PRUNED: ${result.hostManagedPruned || 0}`,
    `WOULD_PRUNE_HOST_MANAGED_COMPLETED: ${result.wouldPruneHostManagedCompleted || 0}`,
    `COMPLETED_HOST_INVOCATIONS_DISCOVERED: ${result.completedHostInvocationsDiscovered || 0}`,
    `PREVIEW_STOPPED: ${result.previewStopped || 0}`,
    `PREVIEW_WOULD_STOP: ${result.previewWouldStop || 0}`,
  ];
  for (const item of result.results || []) {
    lines.push(`TARGET: ${item.status} ${item.kind || "target"} ${item.id || "unknown"} - ${item.message || ""}`);
    if (item.status === "host-managed-close-required" && item.hostInvocationId) {
      lines.push(`CODEX_CLOSE_COMPLETED_SUBAGENT: ${item.hostInvocationId}`);
    }
  }
  return lines.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv);
  if (options.help || options.h) {
    console.log([
      "SUPERVIBE_RUNTIME_CLEANUP_HELP",
      "USAGE:",
      "  node scripts/supervibe-runtime-cleanup.mjs --all",
      "  node scripts/supervibe-runtime-cleanup.mjs --unused",
      "  node scripts/supervibe-runtime-cleanup.mjs --all --dry-run",
      "  node scripts/supervibe-runtime-cleanup.mjs --unused --older-than-minutes 60 --dry-run",
      "  node scripts/supervibe-runtime-cleanup.mjs --all --confirm-host-closed",
      "",
      "Stops registered runtime processes, preview servers, and managed .supervibe/servers/*.pid orphans.",
      "--unused limits live process stops to entries older than the threshold.",
      "--confirm-host-closed prunes completed Codex subagent registry debt after host close_agent/reset was actually run.",
    ].join("\n"));
    process.exit(0);
  }
  if (options.all !== true && options.preview !== true && options.unused !== true) {
    console.error("ERROR: use --all, --preview, or --unused");
    process.exit(2);
  }
  const rootDir = resolve(options.root || process.cwd());
  const dryRun = options["dry-run"] === true || options.dryRun === true;
  const unusedOnly = options.unused === true;
  const olderThanMinutes = normalizeNonNegativeNumber(
    options["older-than-minutes"] ?? options.olderThanMinutes,
    unusedOnly ? 60 : 0,
  );
  const cleanup = await cleanupRuntimeTargets({
    path: defaultRuntimeCleanupRegistryPath(rootDir),
    rootDir,
    dryRun,
    resetCompletedSubagents: options["reset-completed-subagents"] === true,
    confirmHostClosed: options["confirm-host-closed"] === true,
    includeServerPidFiles: options.all === true || options.unused === true || options["pid-files"] === true,
    unusedOnly,
    olderThanMinutes,
  });
  let previewStopped = 0;
  let previewWouldStop = 0;
  if ((options.all === true || options.preview === true) && !dryRun) {
    const preview = await killAllServers();
    previewStopped = preview.filter((item) => item.killed).length;
  }
  if (options.unused === true) {
    const preview = await killStaleServers({ dryRun, olderThanMinutes });
    previewStopped += preview.filter((item) => item.killed).length;
    previewWouldStop += preview.filter((item) => item.wouldKill).length;
  }
  const result = { ...cleanup, previewStopped, previewWouldStop };
  console.log(formatRuntimeCleanupReport(result));
  process.exit(0);
}

function normalizeNonNegativeNumber(value, fallback) {
  if (value == null || value === true || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    console.error(`ERROR: expected a non-negative number, got ${value}`);
    process.exit(2);
  }
  return parsed;
}
