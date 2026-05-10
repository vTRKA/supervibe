#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  cleanupRuntimeTargets,
  defaultRuntimeCleanupRegistryPath,
} from "./lib/runtime-cleanup-registry.mjs";
import {
  killAllServers,
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
    `CHECKED: ${result.checked || 0}`,
    `STOPPED: ${result.stopped || 0}`,
    `STALE: ${result.stale || 0}`,
    `HOST_MANAGED: ${result.hostManaged || 0}`,
    `PREVIEW_STOPPED: ${result.previewStopped || 0}`,
  ];
  for (const item of result.results || []) {
    lines.push(`TARGET: ${item.status} ${item.kind || "target"} ${item.id || "unknown"} - ${item.message || ""}`);
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
      "  node scripts/supervibe-runtime-cleanup.mjs --all --dry-run",
      "",
      "Stops registered runtime processes and preview servers through one command.",
    ].join("\n"));
    process.exit(0);
  }
  if (options.all !== true && options.preview !== true) {
    console.error("ERROR: use --all or --preview");
    process.exit(2);
  }
  const rootDir = resolve(options.root || process.cwd());
  const cleanup = await cleanupRuntimeTargets({
    path: defaultRuntimeCleanupRegistryPath(rootDir),
    dryRun: options["dry-run"] === true || options.dryRun === true,
  });
  let previewStopped = 0;
  if ((options.all === true || options.preview === true) && options["dry-run"] !== true && options.dryRun !== true) {
    const preview = await killAllServers();
    previewStopped = preview.filter((item) => item.killed).length;
  }
  const result = { ...cleanup, previewStopped };
  console.log(formatRuntimeCleanupReport(result));
  process.exit(0);
}
