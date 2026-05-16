#!/usr/bin/env node

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  archiveMemoryGcCandidates,
  createMemoryGcPolicy,
  evaluateMemoryGcSchedule,
  filterMemoryGcAutoCandidates,
  formatMemoryGcReport,
  formatMemoryGcSchedule,
  memoryGcStats,
  restoreMemoryEntry,
  scanMemoryGc,
  writeMemoryGcScheduleRun,
} from "./lib/supervibe-memory-gc.mjs";

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log([
    "SUPERVIBE_MEMORY_GC_HELP",
    "Usage:",
    "  npm run supervibe:memory-gc -- --dry-run",
    "  npm run supervibe:memory-gc -- --policy",
    "  npm run supervibe:memory-gc -- --queues",
    "  npm run supervibe:memory-gc -- --dedupe-queue",
    "  npm run supervibe:memory-gc -- --compact-queue",
    "  npm run supervibe:memory-gc -- --scheduled --dry-run",
    "  npm run supervibe:memory-gc -- --scheduled --auto --apply",
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

  let scan = await scanMemoryGc({
    rootDir,
    category: args.category || "all",
    now: args.now || new Date().toISOString(),
    policy: createMemoryGcPolicy({
      incidentsDays: args["incidents-days"],
      learningsDays: args["learnings-days"],
      lowConfidenceBelow: args["low-confidence-below"],
    }),
  });
  const schedule = await evaluateMemoryGcSchedule({
    rootDir,
    now: args.now || scan.now,
    scan,
  });
  if (args.queues || args["dedupe-queue"] || args["compact-queue"]) {
    const includeDedupe = args.queues || args["dedupe-queue"];
    const includeCompact = args.queues || args["compact-queue"];
    const queueLimit = Number(args["queue-limit"] || 20);
    const queues = {
      ...(includeDedupe ? { dedupe: await buildDedupeQueue({ rootDir, limit: queueLimit }) } : {}),
      ...(includeCompact ? { compact: buildCompactQueue({ scan, schedule, limit: queueLimit }) } : {}),
    };
    console.log(args.json ? JSON.stringify({ schedule, queues }, null, 2) : formatQueueReport(queues));
    process.exit(0);
  }
  if (args.policy) {
    console.log(args.json ? JSON.stringify(schedule, null, 2) : formatMemoryGcSchedule(schedule));
    process.exit(0);
  }
  if (args.scheduled && !schedule.due && !args.force) {
    console.log(args.json ? JSON.stringify({ scan, schedule, skipped: true }, null, 2) : formatMemoryGcSchedule(schedule));
    process.exit(0);
  }
  if (args.auto) {
    scan = filterMemoryGcAutoCandidates(scan, schedule);
  }
  const archiveResult = await archiveMemoryGcCandidates(scan, {
    dryRun: !args.apply,
    now: args.now || scan.now,
  });
  if (args.apply && args.scheduled) {
    await writeMemoryGcScheduleRun({ rootDir, now: args.now || scan.now });
  }
  if (args.json) console.log(JSON.stringify({ scan, schedule, archiveResult }, null, 2));
  else console.log([formatMemoryGcSchedule(schedule), formatMemoryGcReport(scan, archiveResult)].join("\n\n"));
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
    else if (arg === "--queues") parsed.queues = true;
    else if (arg === "--dedupe-queue") parsed["dedupe-queue"] = true;
    else if (arg === "--compact-queue") parsed["compact-queue"] = true;
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

async function buildDedupeQueue({ rootDir, limit = 20 } = {}) {
  const indexPath = join(rootDir, ".supervibe", "memory", "index.json");
  if (!existsSync(indexPath)) {
    return {
      status: "missing-index",
      indexPath,
      candidates: [],
      total: 0,
      limit,
      nextAction: "build memory index before duplicate review",
    };
  }
  const index = JSON.parse(await readFile(indexPath, "utf8"));
  const candidates = [];
  const seen = new Set();
  const append = (candidate, source) => {
    const id = String(candidate.id || candidate.entryId || candidate.file || candidate.path || "");
    if (!id || seen.has(id)) return;
    seen.add(id);
    candidates.push({
      id,
      entryId: candidate.entryId || candidate.id || null,
      reason: candidate.reason || "possible-duplicate",
      state: candidate.state || "new",
      source,
      action: "review-before-write",
    });
  };
  for (const candidate of index.lifecycle?.candidateQueues?.duplicateReview || []) append(candidate, "lifecycle");
  for (const candidate of index.quality?.duplicateCandidates || []) append(candidate, "quality");
  return {
    status: candidates.length ? "candidates" : "empty",
    indexPath,
    candidates: candidates.slice(0, limit),
    total: candidates.length,
    limit,
    nextAction: candidates.length ? "review duplicates before changing memory entries" : "none",
  };
}

function buildCompactQueue({ scan, schedule, limit = 20 } = {}) {
  const candidates = (scan.candidates || []).map((candidate) => ({
    id: candidate.id,
    category: candidate.category,
    file: basename(candidate.filePath),
    reason: candidate.reason,
    ageDays: candidate.ageDays,
    confidence: candidate.confidence,
    autoEligible: (schedule.autoArchiveReasons || []).includes(candidate.reason),
    action: "review-before-write",
  }));
  return {
    status: candidates.length ? "candidates" : "empty",
    candidates: candidates.slice(0, limit),
    total: candidates.length,
    limit,
    scheduledDue: Boolean(schedule.due),
    autoEligible: schedule.autoEligible || 0,
    nextAction: candidates.length ? "review compaction candidates before archival apply" : "none",
  };
}

function formatQueueReport(queues = {}) {
  const blocks = [];
  if (queues.dedupe) blocks.push(formatSingleQueue("SUPERVIBE_MEMORY_DEDUPE_QUEUE", queues.dedupe));
  if (queues.compact) blocks.push(formatSingleQueue("SUPERVIBE_MEMORY_COMPACT_QUEUE", queues.compact));
  return blocks.join("\n\n");
}

function formatSingleQueue(title, queue) {
  const lines = [
    title,
    `STATUS: ${queue.status}`,
    `CANDIDATES: ${queue.total}`,
    `SHOWING: ${queue.candidates.length}`,
    `NEXT_ACTION: ${queue.nextAction}`,
  ];
  for (const candidate of queue.candidates) {
    const suffix = [
      candidate.category ? `category=${candidate.category}` : null,
      candidate.file ? `file=${candidate.file}` : null,
      candidate.reason ? `reason=${candidate.reason}` : null,
      candidate.state ? `state=${candidate.state}` : null,
      candidate.autoEligible === true ? "autoEligible=true" : null,
    ].filter(Boolean).join(" ");
    lines.push(`- ${candidate.id}${suffix ? ` ${suffix}` : ""}`);
  }
  return lines.join("\n");
}
