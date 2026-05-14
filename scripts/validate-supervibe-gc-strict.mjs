#!/usr/bin/env node

import {
  formatSupervibeGcStrictReport,
  validateSupervibeGcStrict,
} from "./lib/supervibe-artifact-gc.mjs";

const args = parseArgs(process.argv.slice(2));

try {
  if (args.help) {
    console.log([
      "SUPERVIBE_GC_STRICT_HELP",
      "Usage:",
      "  node scripts/validate-supervibe-gc-strict.mjs",
      "  node scripts/validate-supervibe-gc-strict.mjs --root <project-root>",
      "  node scripts/validate-supervibe-gc-strict.mjs --json",
      "",
      "Validates that `.supervibe` garbage collection scans nested runtime folders,",
      "classifies telemetry/backups/workflow artifacts, and never marks receipt-linked outputs as deletable.",
    ].join("\n"));
    process.exit(0);
  }

  const result = await validateSupervibeGcStrict({
    rootDir: args.root || process.cwd(),
    retentionDays: args["retention-days"] || 14,
    compactAgentOutputDays: args["compact-agent-output-days"] || args["retention-days"] || 14,
    archiveRetentionDays: args["archive-retention-days"] || 90,
    maxArchiveBytes: args["max-archive-bytes"] || 0,
    archiveKeepLast: args["archive-keep-last"] || 0,
  });
  if (args.json) console.log(JSON.stringify(result, null, 2));
  else console.log(formatSupervibeGcStrictReport(result));
  if (result.pass !== true) process.exitCode = 1;
} catch (error) {
  console.error(`SUPERVIBE_GC_STRICT_ERROR: ${error.message}`);
  process.exitCode = 1;
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--json") parsed.json = true;
    else if (arg.startsWith("--")) {
      const key = arg.replace(/^--/, "");
      if (key.includes("=")) {
        const [name, value] = key.split(/=(.*)/s);
        parsed[name] = value;
      } else {
        parsed[key] = argv[i + 1]?.startsWith("--") ? true : argv[++i];
      }
    }
  }
  return parsed;
}
