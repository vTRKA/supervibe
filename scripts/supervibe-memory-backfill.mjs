#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  applyReviewedMemoryBackfill,
  backfillMemoryEntrySchema,
  formatMemoryBackfillApplyReport,
  formatMemoryBackfillReport,
  formatMemorySchemaBackfillReport,
  scanMemoryBackfill,
} from "./lib/supervibe-memory-backfill.mjs";

const DEFAULT_SCHEDULE_DELAY_MINUTES = 60;
const SCHEDULE_REPORT_DIR = ".supervibe/memory/backfill-reports";

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log([
    "SUPERVIBE_MEMORY_BACKFILL_HELP",
    "Usage:",
    "  node scripts/supervibe-memory-backfill.mjs",
    "  node scripts/supervibe-memory-backfill.mjs --json",
    "  node scripts/supervibe-memory-backfill.mjs --source plans,reviews",
    "  node scripts/supervibe-memory-backfill.mjs --schedule --delay-minutes 120",
    "  node scripts/supervibe-memory-backfill.mjs --schedule --due-at 2026-05-16T12:00:00.000Z --write-schedule",
    "  node scripts/supervibe-memory-backfill.mjs --schema-backfill",
    "  node scripts/supervibe-memory-backfill.mjs --schema-backfill --write",
    "  node scripts/supervibe-memory-backfill.mjs --apply --reviewed reviewed-candidates.json --receipt workflow-...",
    "",
    "Default mode is dry-run. Schedule mode creates deferred review checks and writes only with --write-schedule.",
    "Schema-backfill mode adds missing required frontmatter and writes only with --write.",
    "Apply mode imports only reviewed candidates and requires a receipt id.",
  ].join("\n"));
  process.exit(0);
}

try {
  if (args["schema-backfill"]) {
    const report = await backfillMemoryEntrySchema({
      rootDir: args.root || process.cwd(),
      now: args.now || new Date().toISOString(),
      dryRun: args.write !== true,
    });
    console.log(args.json ? JSON.stringify(report, null, 2) : formatMemorySchemaBackfillReport(report));
  } else if (args.schedule) {
    if (args.apply) throw new Error("schedule mode cannot be combined with apply");
    const scan = await scanMemoryBackfill({
      rootDir: args.root || process.cwd(),
      sourceKinds: args.source || "all",
      limit: args.limit,
      now: args.now || new Date().toISOString(),
    });
    const report = await scheduleMemoryBackfill({
      rootDir: args.root || process.cwd(),
      scan,
      now: args.now || scan.generatedAt || new Date().toISOString(),
      dueAt: args["due-at"],
      delayMinutes: args["delay-minutes"],
      writeSchedule: args["write-schedule"] === true,
    });
    console.log(args.json ? JSON.stringify(report, null, 2) : formatMemoryBackfillScheduleReport(report));
  } else if (args.apply) {
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
      } else if (argv[i + 1] === undefined || argv[i + 1].startsWith("--")) {
        parsed[key] = true;
      } else {
        parsed[key] = argv[++i];
      }
    }
  }
  return parsed;
}

async function scheduleMemoryBackfill({
  rootDir,
  scan,
  now,
  dueAt,
  delayMinutes,
  writeSchedule = false,
} = {}) {
  const generatedAt = parseIsoTimestamp(now, "now");
  const scheduleAt = dueAt
    ? parseIsoTimestamp(dueAt, "due-at")
    : addMinutes(generatedAt, positiveInt(delayMinutes, DEFAULT_SCHEDULE_DELAY_MINUTES));
  if (scheduleAt.getTime() < generatedAt.getTime()) throw new Error("schedule due-at must not be earlier than now");

  const checks = (scan.candidates || []).map((candidate) => ({
    candidateId: candidate.id,
    source: `${candidate.sourcePath}:${candidate.line}`,
    sourceKind: candidate.sourceKind,
    candidateKind: candidate.candidateKind,
    proposedMemoryType: candidate.proposedMemoryType,
    at: scheduleAt.toISOString(),
    action: "review-memory-backfill-candidate",
    status: "scheduled",
    intrusiveWrites: false,
  }));

  const report = {
    schemaVersion: 1,
    mode: "schedule",
    dryRun: true,
    generatedAt: generatedAt.toISOString(),
    dueAt: scheduleAt.toISOString(),
    rootDir,
    sourceCounts: scan.sourceCounts || {},
    candidateCounts: scan.candidateCounts || {},
    scannedFiles: scan.scannedFiles || 0,
    candidates: (scan.candidates || []).length,
    checks,
    applyEnabled: false,
    writeEnabled: Boolean(writeSchedule),
    reportPath: "",
  };

  if (writeSchedule) {
    report.dryRun = false;
    report.reportPath = await writeMemoryBackfillScheduleReport({ rootDir, report });
  }

  return report;
}

async function writeMemoryBackfillScheduleReport({ rootDir, report }) {
  const reportPath = `${SCHEDULE_REPORT_DIR}/${timestampForPath(report.generatedAt)}-schedule.json`;
  const absPath = join(rootDir, reportPath);
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, `${JSON.stringify({ ...report, reportPath }, null, 2)}\n`, "utf8");
  return reportPath;
}

function formatMemoryBackfillScheduleReport(report = {}) {
  return [
    "SUPERVIBE_MEMORY_BACKFILL_SCHEDULER",
    `MODE: ${report.mode || "schedule"}`,
    `DRY_RUN: ${report.dryRun !== false}`,
    `DUE_AT: ${report.dueAt || "missing"}`,
    `APPLY_ENABLED: ${report.applyEnabled === true}`,
    `WRITE_ENABLED: ${report.writeEnabled === true}`,
    `REPORT: ${report.reportPath || "none"}`,
    `SCANNED_FILES: ${report.scannedFiles || 0}`,
    `CANDIDATES: ${report.candidates || 0}`,
    `CHECKS: ${(report.checks || []).length}`,
  ].join("\n");
}

function parseIsoTimestamp(value, label) {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) throw new Error(`${label} must be an ISO-like timestamp`);
  return date;
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function timestampForPath(value) {
  return new Date(value).toISOString().replace(/[:.]/g, "-");
}

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
