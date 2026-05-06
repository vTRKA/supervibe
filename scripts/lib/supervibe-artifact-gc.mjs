import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";

import {
  readWorkflowReceipts,
} from "./supervibe-workflow-receipt-runtime.mjs";

const DEFAULT_RETENTION_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

const RUNTIME_FILES = Object.freeze([
  ".supervibe/memory/preview-servers.json",
  ".supervibe/preview-servers.json",
  ".supervibe/memory/code-index.lock",
]);

const ACTIVE_CACHE_FILES = Object.freeze([
  ".supervibe/memory/code.db",
  ".supervibe/memory/memory.db",
  ".supervibe/memory/workflow-receipt-runtime.key",
  ".supervibe/memory/workflow-invocation-ledger.jsonl",
  ".supervibe/memory/agent-invocations.jsonl",
  ".supervibe/memory/effectiveness.jsonl",
]);

const DEFAULT_SCHEDULE_INTERVAL_DAYS = 7;

export async function scanSupervibeArtifactGc({
  rootDir = process.cwd(),
  now = new Date().toISOString(),
  retentionDays = DEFAULT_RETENTION_DAYS,
} = {}) {
  const candidates = [];
  const activeNoise = [];
  const scanned = new Set();
  const referenced = referencedOutputArtifactPrefixes(rootDir);
  const cutoffMs = Date.parse(now) - Number(retentionDays) * DAY_MS;

  for (const relPath of RUNTIME_FILES) {
    addExistingFile({
      rootDir,
      relPath,
      scanned,
      activeNoise,
      candidates,
      reason: "runtime-state",
      candidate: true,
    });
  }

  for (const relPath of ACTIVE_CACHE_FILES) {
    addExistingFile({
      rootDir,
      relPath,
      scanned,
      activeNoise,
      candidates,
      reason: "runtime-cache",
      candidate: false,
    });
  }

  for (const item of listChildren(rootDir, ".supervibe/memory/workflow-receipts-stale")) {
    addCandidate({
      rootDir,
      relPath: item.relPath,
      scanned,
      candidates,
      reason: "stale-receipt-archive",
      ageDays: ageDays(item.stat, now),
    });
  }

  for (const item of listFiles(rootDir, ".supervibe/servers")) {
    if (!item.relPath.endsWith(".log")) continue;
    addCandidate({
      rootDir,
      relPath: item.relPath,
      scanned,
      candidates,
      reason: "preview-log",
      ageDays: ageDays(item.stat, now),
    });
  }

  for (const item of listFiles(rootDir, ".supervibe")) {
    if (!/\.bak$/i.test(item.relPath)) continue;
    addCandidate({
      rootDir,
      relPath: item.relPath,
      scanned,
      candidates,
      reason: "backup-file",
      ageDays: ageDays(item.stat, now),
    });
  }

  for (const item of listChildren(rootDir, ".supervibe/artifacts/_agent-outputs")) {
    const normalized = normalizeRelPath(item.relPath);
    const retainedByReceipt = referenced.some((prefix) => prefix === normalized || prefix.startsWith(`${normalized}/`));
    if (retainedByReceipt) {
      activeNoise.push({
        relPath: normalized,
        reason: "receipt-linked-agent-output",
        ageDays: ageDays(item.stat, now),
      });
      scanned.add(normalized);
      continue;
    }
    const itemAgeDays = ageDays(item.stat, now);
    if (item.stat.mtimeMs <= cutoffMs) {
      addCandidate({
        rootDir,
        relPath: normalized,
        scanned,
        candidates,
        reason: "unreferenced-agent-output",
        ageDays: itemAgeDays,
      });
    } else {
      activeNoise.push({
        relPath: normalized,
        reason: "recent-unreferenced-agent-output",
        ageDays: itemAgeDays,
      });
      scanned.add(normalized);
    }
  }

  candidates.sort((left, right) => left.relPath.localeCompare(right.relPath));
  activeNoise.sort((left, right) => left.relPath.localeCompare(right.relPath));
  return {
    schemaVersion: 1,
    generatedAt: now,
    retentionDays: Number(retentionDays),
    candidates,
    activeNoise,
    summary: {
      scanned: scanned.size,
      candidates: candidates.length,
      activeNoise: activeNoise.length,
    },
  };
}

export async function archiveSupervibeArtifactGcCandidates(scan = {}, {
  rootDir = process.cwd(),
  dryRun = true,
  runTimestamp = scan.generatedAt || new Date().toISOString(),
} = {}) {
  const archived = [];
  const errors = [];
  if (dryRun) return { dryRun: true, archived, errors };

  const archiveRoot = join(rootDir, ".supervibe", ".archive", "gc", sanitizeId(runTimestamp));
  for (const candidate of scan.candidates || []) {
    const relPath = normalizeRelPath(candidate.relPath);
    const source = join(rootDir, ...relPath.split("/"));
    if (!existsSync(source)) continue;
    const target = join(archiveRoot, ...relPath.split("/"));
    try {
      await mkdir(dirname(target), { recursive: true });
      await rename(source, target);
      archived.push({
        ...candidate,
        archivePath: normalizeRelPath(relative(rootDir, target)),
      });
    } catch (error) {
      errors.push(`${relPath}: ${error.message}`);
    }
  }

  if (archived.length > 0 || errors.length > 0) {
    const logPath = join(archiveRoot, "artifact-gc.jsonl");
    await mkdir(dirname(logPath), { recursive: true });
    const lines = archived.map((entry) => JSON.stringify({
      schemaVersion: 1,
      archivedAt: runTimestamp,
      relPath: entry.relPath,
      archivePath: entry.archivePath,
      reason: entry.reason,
    }));
    for (const error of errors) lines.push(JSON.stringify({ schemaVersion: 1, archivedAt: runTimestamp, error }));
    await writeFile(logPath, `${lines.join("\n")}${lines.length ? "\n" : ""}`, "utf8");
  }

  return { dryRun: false, archived, errors };
}

export async function evaluateArtifactGcSchedule({
  rootDir = process.cwd(),
  now = new Date().toISOString(),
  scan = null,
  intervalDays = DEFAULT_SCHEDULE_INTERVAL_DAYS,
} = {}) {
  const schedulePath = join(rootDir, ".supervibe", "memory", "artifact-gc-policy.json");
  const policy = readJson(schedulePath) || {};
  const resolvedIntervalDays = Number(policy.intervalDays || intervalDays || DEFAULT_SCHEDULE_INTERVAL_DAYS);
  const lastRunAt = policy.lastRunAt || null;
  const nextRunAt = lastRunAt
    ? new Date(Date.parse(lastRunAt) + resolvedIntervalDays * DAY_MS).toISOString()
    : now;
  const due = !lastRunAt || Date.parse(now) >= Date.parse(nextRunAt);
  const resolvedScan = scan || await scanSupervibeArtifactGc({ rootDir, now });
  return {
    schemaVersion: 1,
    due,
    source: existsSync(schedulePath) ? "file" : "default",
    intervalDays: resolvedIntervalDays,
    lastRunAt,
    nextRunAt,
    candidates: resolvedScan.summary?.candidates || 0,
    nextAction: due && (resolvedScan.summary?.candidates || 0) > 0
      ? "run npm run supervibe:gc -- --artifacts --scheduled --apply"
      : due
        ? "run npm run supervibe:gc -- --artifacts --scheduled --dry-run"
        : "artifact GC schedule not due",
  };
}

export async function writeArtifactGcScheduleRun({
  rootDir = process.cwd(),
  now = new Date().toISOString(),
} = {}) {
  const path = join(rootDir, ".supervibe", "memory", "artifact-gc-policy.json");
  const policy = readJson(path) || {};
  policy.schemaVersion = 1;
  policy.intervalDays = Number(policy.intervalDays || DEFAULT_SCHEDULE_INTERVAL_DAYS);
  policy.lastRunAt = now;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(policy, null, 2)}\n`, "utf8");
  return { path: normalizeRelPath(relative(rootDir, path)), lastRunAt: now };
}

export function formatArtifactGcSchedule(schedule = {}) {
  return [
    "SUPERVIBE_ARTIFACT_GC_POLICY",
    `DUE: ${schedule.due === true}`,
    `SOURCE: ${schedule.source || "unknown"}`,
    `INTERVAL_DAYS: ${schedule.intervalDays || DEFAULT_SCHEDULE_INTERVAL_DAYS}`,
    `LAST_RUN_AT: ${schedule.lastRunAt || "never"}`,
    `NEXT_RUN_AT: ${schedule.nextRunAt || "unknown"}`,
    `CANDIDATES: ${schedule.candidates || 0}`,
    `NEXT_ACTION: ${schedule.nextAction || "inspect artifact GC"}`,
  ].join("\n");
}

export function formatSupervibeArtifactGcReport(scan = {}, archiveResult = {}) {
  const top = (scan.candidates || [])
    .slice(0, 10)
    .map((candidate) => `  - ${candidate.relPath} (${candidate.reason}, ${candidate.ageDays}d)`);
  const activeTop = (scan.activeNoise || [])
    .slice(0, 10)
    .map((item) => `  - ${item.relPath} (${item.reason}, ${item.ageDays}d)`);
  const archived = (archiveResult.archived || [])
    .slice(0, 10)
    .map((item) => `  - ${item.relPath} -> ${item.archivePath}`);
  return [
    "SUPERVIBE_ARTIFACT_GC",
    `SCANNED: ${scan.summary?.scanned || 0}`,
    `CANDIDATES: ${scan.summary?.candidates || 0}`,
    `ACTIVE_NOISE: ${scan.summary?.activeNoise || 0}`,
    `DRY_RUN: ${archiveResult.dryRun !== false}`,
    "TOP_CANDIDATES:",
    ...(top.length ? top : ["  - none"]),
    "ACTIVE_NOISE_TOP:",
    ...(activeTop.length ? activeTop : ["  - none"]),
    "ARCHIVED:",
    ...(archived.length ? archived : ["  - none"]),
    `ERRORS: ${(archiveResult.errors || []).join("; ") || "none"}`,
  ].join("\n");
}

function addExistingFile({ rootDir, relPath, scanned, activeNoise, candidates, reason, candidate }) {
  const normalized = normalizeRelPath(relPath);
  const absPath = join(rootDir, ...normalized.split("/"));
  if (!existsSync(absPath)) return;
  const stat = statSync(absPath);
  scanned.add(normalized);
  const item = {
    relPath: normalized,
    reason,
    ageDays: ageDays(stat),
  };
  if (candidate) candidates.push(item);
  else activeNoise.push(item);
}

function addCandidate({ relPath, scanned, candidates, reason, ageDays }) {
  const normalized = normalizeRelPath(relPath);
  scanned.add(normalized);
  candidates.push({
    relPath: normalized,
    reason,
    ageDays: Number.isFinite(ageDays) ? ageDays : 0,
  });
}

function listChildren(rootDir, relDir) {
  const absDir = join(rootDir, ...normalizeRelPath(relDir).split("/"));
  if (!existsSync(absDir)) return [];
  return readdirSync(absDir, { withFileTypes: true })
    .map((entry) => {
      const relPath = normalizeRelPath(`${relDir}/${entry.name}`);
      const absPath = join(absDir, entry.name);
      return { relPath, absPath, stat: statSync(absPath), dirent: entry };
    });
}

function listFiles(rootDir, relDir) {
  const normalizedRelDir = normalizeRelPath(relDir);
  if (normalizedRelDir === ".supervibe/.archive" || normalizedRelDir.startsWith(".supervibe/.archive/")) return [];
  const absDir = join(rootDir, ...normalizeRelPath(relDir).split("/"));
  if (!existsSync(absDir)) return [];
  const files = [];
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    const relPath = normalizeRelPath(`${relDir}/${entry.name}`);
    const absPath = join(absDir, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(rootDir, relPath));
    else if (entry.isFile()) files.push({ relPath, absPath, stat: statSync(absPath), dirent: entry });
  }
  return files;
}

function referencedOutputArtifactPrefixes(rootDir) {
  try {
    return readWorkflowReceipts(rootDir)
      .flatMap((receipt) => receipt.outputArtifacts || [])
      .map((item) => typeof item === "string" ? item : item?.path)
      .filter(Boolean)
      .map(normalizeRelPath);
  } catch {
    return [];
  }
}

function readJson(path) {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function ageDays(stat, now = new Date().toISOString()) {
  const nowMs = Date.parse(now);
  const mtimeMs = Number(stat?.mtimeMs || nowMs);
  if (!Number.isFinite(nowMs) || !Number.isFinite(mtimeMs)) return 0;
  return Math.max(0, Math.floor((nowMs - mtimeMs) / DAY_MS));
}

function sanitizeId(value) {
  return String(value || "run").replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function normalizeRelPath(path) {
  return String(path || "").split(sep).join("/").replace(/\\/g, "/").replace(/^\.\//, "");
}
