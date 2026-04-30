#!/usr/bin/env node

import {
  archiveWorkItemGcCandidates,
  formatWorkItemGcReport,
  restoreWorkItemGraph,
  scanWorkItemGc,
} from "./lib/supervibe-work-item-gc.mjs";

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log([
    "SUPERVIBE_WORK_ITEM_GC_HELP",
    "Usage:",
    "  npm run supervibe:work-items-gc -- --dry-run",
    "  npm run supervibe:work-items-gc -- --apply --retention-days 14",
    "  npm run supervibe:work-items-gc -- --include-stale-open --stale-open-days 90",
    "  npm run supervibe:work-items-gc -- --restore <graph-id>",
  ].join("\n"));
  process.exit(0);
}

try {
  if (args.restore) {
    const restored = await restoreWorkItemGraph({ rootDir: args.root || process.cwd(), graphId: args.restore });
    console.log(`SUPERVIBE_WORK_ITEM_GC_RESTORE\nRESTORED: ${restored.graphId}\nPATH: ${restored.restorePath}`);
    process.exit(0);
  }
  const scan = await scanWorkItemGc({
    rootDir: args.root || process.cwd(),
    retentionDays: args["retention-days"] || 14,
    staleOpenDays: args["stale-open-days"] || 90,
    includeStaleOpen: Boolean(args["include-stale-open"]),
    now: args.now || new Date().toISOString(),
  });
  const archiveResult = await archiveWorkItemGcCandidates(scan, {
    dryRun: !args.apply,
    now: args.now || scan.now,
  });
  if (args.json) console.log(JSON.stringify({ scan, archiveResult }, null, 2));
  else console.log(formatWorkItemGcReport(scan, archiveResult));
} catch (err) {
  console.error(`SUPERVIBE_WORK_ITEM_GC_ERROR: ${err.message}`);
  process.exitCode = 1;
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--apply") parsed.apply = true;
    else if (arg === "--dry-run") parsed.apply = false;
    else if (arg === "--json") parsed.json = true;
    else if (arg === "--include-stale-open") parsed["include-stale-open"] = true;
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
