#!/usr/bin/env node

import {
  archiveMemoryGcCandidates,
  createMemoryGcPolicy,
  formatMemoryGcReport,
  memoryGcStats,
  restoreMemoryEntry,
  scanMemoryGc,
} from "./lib/supervibe-memory-gc.mjs";

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log([
    "SUPERVIBE_MEMORY_GC_HELP",
    "Usage:",
    "  npm run supervibe:memory-gc -- --dry-run",
    "  npm run supervibe:memory-gc -- --category learnings --apply",
    "  npm run supervibe:memory-gc -- --restore <memory-id>",
    "  npm run supervibe:memory-gc -- --stats",
  ].join("\n"));
  process.exit(0);
}

try {
  const rootDir = args.root || process.cwd();
  if (args.stats) {
    const stats = await memoryGcStats({ rootDir });
    console.log(args.json ? JSON.stringify(stats, null, 2) : formatStats(stats));
    process.exit(0);
  }
  if (args.restore) {
    const restored = await restoreMemoryEntry({ rootDir, id: args.restore });
    console.log(args.json ? JSON.stringify(restored, null, 2) : `SUPERVIBE_MEMORY_GC_RESTORE\nRESTORED: ${restored.id}\nPATH: ${restored.restorePath}`);
    process.exit(0);
  }

  const scan = await scanMemoryGc({
    rootDir,
    category: args.category || "all",
    now: args.now || new Date().toISOString(),
    policy: createMemoryGcPolicy({
      incidentsDays: args["incidents-days"],
      learningsDays: args["learnings-days"],
      lowConfidenceBelow: args["low-confidence-below"],
    }),
  });
  const archiveResult = await archiveMemoryGcCandidates(scan, {
    dryRun: !args.apply,
    now: args.now || scan.now,
  });
  if (args.json) console.log(JSON.stringify({ scan, archiveResult }, null, 2));
  else console.log(formatMemoryGcReport(scan, archiveResult));
} catch (err) {
  console.error(`SUPERVIBE_MEMORY_GC_ERROR: ${err.message}`);
  process.exitCode = 1;
}

function formatStats(stats) {
  return [
    "SUPERVIBE_MEMORY_GC_STATS",
    ...Object.entries(stats).map(([key, value]) => `${key}: ${value}`),
  ].join("\n");
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--apply") parsed.apply = true;
    else if (arg === "--dry-run") parsed.apply = false;
    else if (arg === "--json") parsed.json = true;
    else if (arg === "--stats") parsed.stats = true;
    else if (arg === "--restore") parsed.restore = argv[++i];
    else if (arg.startsWith("--restore=")) parsed.restore = arg.slice("--restore=".length);
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
