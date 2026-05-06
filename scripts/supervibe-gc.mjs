#!/usr/bin/env node

import { CodeStore } from "./lib/code-store.mjs";
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
import {
  archiveSupervibeArtifactGcCandidates,
  evaluateArtifactGcSchedule,
  formatArtifactGcSchedule,
  formatSupervibeArtifactGcReport,
  scanSupervibeArtifactGc,
  writeArtifactGcScheduleRun,
} from "./lib/supervibe-artifact-gc.mjs";

const args = parseArgs(process.argv.slice(2));

try {
  if (args.help) {
    console.log([
      "SUPERVIBE_GC_HELP",
      "Usage:",
      "  npm run supervibe:gc -- --work-items --dry-run",
      "  npm run supervibe:gc -- --memory --category learnings --dry-run",
      "  npm run supervibe:gc -- --artifacts --dry-run",
      "  npm run supervibe:gc -- --artifacts --dry-run --compact-agent-output-days 14",
      "  npm run supervibe:gc -- --artifacts --dry-run --archive-retention-days 90 --max-archive-bytes 104857600",
      "  npm run supervibe:gc -- --code-db-maintenance --vacuum",
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
  const explicitMode = args.memory || args["work-items"] || args.artifacts || args["code-db-maintenance"];
  const runWorkItems = args.all || args["work-items"] || !explicitMode;
  const runMemory = args.all || args.memory || !explicitMode;
  const runArtifacts = args.all || args.artifacts || !explicitMode;
  const runCodeDbMaintenance = args.all || args["code-db-maintenance"];
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
  if (runArtifacts) {
    const scan = await scanSupervibeArtifactGc({
      rootDir,
      retentionDays: args["retention-days"] || 14,
      compactAgentOutputDays: args["compact-agent-output-days"] || args["retention-days"] || 14,
      archiveRetentionDays: args["archive-retention-days"] || 90,
      maxArchiveBytes: args["max-archive-bytes"] || 0,
    });
    const schedule = await evaluateArtifactGcSchedule({ rootDir, scan });
    blocks.push(formatArtifactGcSchedule(schedule));
    if (args.scheduled && !schedule.due && !args.force) {
      blocks.push("SUPERVIBE_ARTIFACT_GC\nSKIPPED: scheduled policy not due");
      console.log(blocks.join("\n\n"));
      process.exit(0);
    }
    const archiveResult = await archiveSupervibeArtifactGcCandidates(scan, {
      rootDir,
      dryRun: !args.apply,
    });
    if (args.apply && args.scheduled) await writeArtifactGcScheduleRun({ rootDir });
    blocks.push(formatSupervibeArtifactGcReport(scan, archiveResult));
  }
  if (runCodeDbMaintenance) {
    const store = new CodeStore(rootDir, { useEmbeddings: false });
    await store.init();
    try {
      const maintenance = store.maintain({ vacuum: Boolean(args.vacuum) });
      blocks.push([
        "SUPERVIBE_CODE_DB_MAINTENANCE",
        `OPTIMIZED: ${maintenance.optimized === true}`,
        `VACUUMED: ${maintenance.vacuumed === true}`,
        `DURATION_MS: ${maintenance.durationMs}`,
      ].join("\n"));
    } finally {
      store.close();
    }
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
    else if (arg === "--artifacts") parsed.artifacts = true;
    else if (arg === "--code-db-maintenance") parsed["code-db-maintenance"] = true;
    else if (arg === "--vacuum") parsed.vacuum = true;
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
