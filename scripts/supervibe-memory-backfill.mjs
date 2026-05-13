#!/usr/bin/env node

import {
  applyReviewedMemoryBackfill,
  formatMemoryBackfillApplyReport,
  formatMemoryBackfillReport,
  scanMemoryBackfill,
} from "./lib/supervibe-memory-backfill.mjs";

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log([
    "SUPERVIBE_MEMORY_BACKFILL_HELP",
    "Usage:",
    "  node scripts/supervibe-memory-backfill.mjs",
    "  node scripts/supervibe-memory-backfill.mjs --json",
    "  node scripts/supervibe-memory-backfill.mjs --source plans,reviews",
    "  node scripts/supervibe-memory-backfill.mjs --apply --reviewed reviewed-candidates.json --receipt workflow-...",
    "",
    "Default mode is dry-run. Apply mode imports only reviewed candidates and requires a receipt id.",
  ].join("\n"));
  process.exit(0);
}

try {
  if (args.apply) {
    const report = await applyReviewedMemoryBackfill({
      rootDir: args.root || process.cwd(),
      reviewedFile: args.reviewed || args.review || args.input,
      receiptId: args.receipt || args["receipt-id"],
      now: args.now || new Date().toISOString(),
      dryRun: args["dry-run"] === true,
    });
    console.log(args.json ? JSON.stringify(report, null, 2) : formatMemoryBackfillApplyReport(report));
  } else {
    const report = await scanMemoryBackfill({
      rootDir: args.root || process.cwd(),
      sourceKinds: args.source || "all",
      limit: args.limit,
      now: args.now || new Date().toISOString(),
    });
    console.log(args.json ? JSON.stringify(report, null, 2) : formatMemoryBackfillReport(report));
  }
} catch (error) {
  console.error(`SUPERVIBE_MEMORY_BACKFILL_ERROR: ${error.message}`);
  process.exitCode = 1;
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--json") parsed.json = true;
    else if (arg === "--apply") parsed.apply = true;
    else if (arg === "--dry-run") parsed["dry-run"] = true;
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
