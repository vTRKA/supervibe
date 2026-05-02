#!/usr/bin/env node

import {
  archiveWorkItemGcCandidates,
  formatWorkItemGcReport,
  restoreWorkItemGraph,
  scanWorkItemGc,
} from "./lib/supervibe-work-item-gc.mjs";
import {
  archiveMemoryGcCandidates,
  createMemoryGcPolicy,
  evaluateMemoryGcSchedule,
  filterMemoryGcAutoCandidates,
  formatMemoryGcReport,
  formatMemoryGcSchedule,
  restoreMemoryEntry,
  scanMemoryGc,
  writeMemoryGcScheduleRun,
} from "./lib/supervibe-memory-gc.mjs";

const args = parseArgs(process.argv.slice(2));

try {
  if (args.help) {
    console.log([
      "SUPERVIBE_GC_HELP",
      "Usage:",
      "  npm run supervibe:gc -- --work-items --dry-run",
      "  npm run supervibe:gc -- --memory --category learnings --dry-run",
      "  npm run supervibe:gc -- --memory --scheduled --auto --apply",
      "  npm run supervibe:gc -- --all --apply",
      "  npm run supervibe:gc -- --memory --restore <memory-id>",
      "  npm run supervibe:gc -- --work-items --restore <graph-id>",
      "",
      "Default mode is dry-run. Use --apply for reversible archival writes.",
    ].join("\n"));
    process.exit(0);
  }
  const rootDir = args.root || process.cwd();
  if (args.restore) {
    if (args["work-items"] && !args.memory) {
      const restored = await restoreWorkItemGraph({ rootDir, graphId: args.restore });
      console.log(`SUPERVIBE_WORK_ITEM_GC_RESTORE\nRESTORED: ${restored.graphId}\nPATH: ${restored.restorePath}`);
    } else {
      const restored = await restoreMemoryEntry({ rootDir, id: args.restore });
      console.log(`SUPERVIBE_MEMORY_GC_RESTORE\nRESTORED: ${restored.id}\nPATH: ${restored.restorePath}`);
    }
    process.exit(0);
  }
  const runWorkItems = args.all || args["work-items"] || (!args.memory && !args["work-items"]);
  const runMemory = args.all || args.memory || (!args.memory && !args["work-items"]);
  const blocks = [];
  if (runWorkItems) {
    const scan = await scanWorkItemGc({
      rootDir,
      retentionDays: args["retention-days"] || 14,
      staleOpenDays: args["stale-open-days"] || 90,
      includeStaleOpen: Boolean(args["include-stale-open"]),
    });
    const archiveResult = await archiveWorkItemGcCandidates(scan, { dryRun: !args.apply });
    blocks.push(formatWorkItemGcReport(scan, archiveResult));
  }
  if (runMemory) {
    let scan = await scanMemoryGc({
      rootDir,
      category: args.category || "all",
      policy: createMemoryGcPolicy({
        incidentsDays: args["incidents-days"],
        learningsDays: args["learnings-days"],
        lowConfidenceBelow: args["low-confidence-below"],
      }),
    });
    const schedule = await evaluateMemoryGcSchedule({ rootDir, scan });
    blocks.push(formatMemoryGcSchedule(schedule));
    if (args.scheduled && !schedule.due && !args.force) {
      blocks.push("SUPERVIBE_MEMORY_GC\nSKIPPED: scheduled policy not due");
      console.log(blocks.join("\n\n"));
      process.exit(0);
    }
    if (args.auto) scan = filterMemoryGcAutoCandidates(scan, schedule);
    const archiveResult = await archiveMemoryGcCandidates(scan, { dryRun: !args.apply });
    if (args.apply && args.scheduled) await writeMemoryGcScheduleRun({ rootDir });
    blocks.push(formatMemoryGcReport(scan, archiveResult));
  }
  console.log(blocks.join("\n\n"));
} catch (err) {
  console.error(`SUPERVIBE_GC_ERROR: ${err.message}`);
  process.exitCode = 1;
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (arg === "--apply") parsed.apply = true;
    else if (arg === "--dry-run") parsed.apply = false;
    else if (arg === "--all") parsed.all = true;
    else if (arg === "--memory") parsed.memory = true;
    else if (arg === "--work-items") parsed["work-items"] = true;
    else if (arg === "--include-stale-open") parsed["include-stale-open"] = true;
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
