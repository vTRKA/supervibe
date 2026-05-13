#!/usr/bin/env node

import { inspectOperatorSafety, formatOperatorSafetyReport } from "./lib/supervibe-operator-safety.mjs";

const args = parseArgs(process.argv.slice(2));

try {
  const report = inspectOperatorSafety({
    cleanupPath: args["check-cleanup-path"] || null,
    safeCleanupRoots: args["safe-root"]?.length ? args["safe-root"] : undefined,
    cwd: process.cwd(),
    env: process.env,
  });
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else console.log(formatOperatorSafetyReport(report));
  if (report.cleanup?.pass === false) process.exitCode = 2;
} catch (error) {
  console.error(`supervibe-operator-safety error: ${error.message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const parsed = {};
  const booleans = new Set(["json", "help"]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-h" || arg === "--help") {
      parsed.help = true;
      continue;
    }
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    if (booleans.has(key)) {
      parsed[key] = true;
      continue;
    }
    const value = argv[index + 1];
    index += 1;
    if (key === "safe-root") {
      parsed[key] = [...(parsed[key] || []), value];
    } else {
      parsed[key] = value;
    }
  }
  if (parsed.help) {
    console.log(formatHelp());
    process.exit(0);
  }
  return parsed;
}

function formatHelp() {
  return [
    "SUPERVIBE_OPERATOR_SAFETY_HELP",
    "Usage:",
    "  node scripts/supervibe-operator-safety.mjs",
    "  node scripts/supervibe-operator-safety.mjs --check-cleanup-path <path>",
    "  node scripts/supervibe-operator-safety.mjs --check-cleanup-path <path> --safe-root <root>",
    "",
    "Purpose:",
    "  Report fast search fallback and reject unsafe recursive cleanup targets before loop smoke commands run.",
  ].join("\n");
}
