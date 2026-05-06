import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { gzipSync } from "node:zlib";

import {
  readWorkflowReceipts,
  validateWorkflowReceiptTrust,
} from "./supervibe-workflow-receipt-runtime.mjs";

const RETENTION_TIERS = Object.freeze({
  REQUIRED: "required",
  REGENERABLE_CACHE: "regenerable-cache",
  DIAGNOSTIC_LATEST: "diagnostic-latest",
  ARCHIVE: "archive",
});

const COMPACT_MANIFEST_TYPE = "supervibe-agent-output-compact-manifest";
const DEFAULT_RETENTION_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

const RUNTIME_FILES = Object.freeze([
  { path: ".supervibe/memory/preview-servers.json", tier: RETENTION_TIERS.DIAGNOSTIC_LATEST },
  { path: ".supervibe/preview-servers.json", tier: RETENTION_TIERS.DIAGNOSTIC_LATEST },
  { path: ".supervibe/memory/code-index.lock", tier: RETENTION_TIERS.DIAGNOSTIC_LATEST },
]);

const ACTIVE_CACHE_FILES = Object.freeze([
  { path: ".supervibe/memory/code.db", tier: RETENTION_TIERS.REGENERABLE_CACHE },
  { path: ".supervibe/memory/memory.db", tier: RETENTION_TIERS.REGENERABLE_CACHE },
  { path: ".supervibe/memory/workflow-receipt-runtime.key", tier: RETENTION_TIERS.REQUIRED },
  { path: ".supervibe/memory/workflow-invocation-ledger.jsonl", tier: RETENTION_TIERS.REQUIRED },
  { path: ".supervibe/memory/agent-invocations.jsonl", tier: RETENTION_TIERS.REQUIRED },
  { path: ".supervibe/memory/effectiveness.jsonl", tier: RETENTION_TIERS.DIAGNOSTIC_LATEST },
]);

const DEFAULT_SCHEDULE_INTERVAL_DAYS = 7;

export async function scanSupervibeArtifactGc({
  rootDir = process.cwd(),
  now = new Date().toISOString(),
  retentionDays = DEFAULT_RETENTION_DAYS,
  compactAgentOutputDays = retentionDays,
  archiveRetentionDays = 90,
  maxArchiveBytes = 0,
} = {}) {
  const candidates = [];
  const activeNoise = [];
  const compactable = [];
  const archiveCleanup = [];
  const scanned = new Set();
  const referenced = referencedOutputArtifacts(rootDir);
  const referencedPaths = [...referenced.keys()];
  const cutoffMs = Date.parse(now) - Number(retentionDays) * DAY_MS;
  const compactCutoffMs = Date.parse(now) - Number(compactAgentOutputDays) * DAY_MS;

  for (const file of RUNTIME_FILES) {
    addExistingFile({
      rootDir,
      relPath: file.path,
      scanned,
      activeNoise,
      candidates,
      reason: "runtime-state",
      candidate: true,
      tier: file.tier,
    });
  }

  for (const file of ACTIVE_CACHE_FILES) {
    addExistingFile({
      rootDir,
      relPath: file.path,
      scanned,
      activeNoise,
      candidates,
      reason: "runtime-cache",
      candidate: false,
      tier: file.tier,
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
      tier: RETENTION_TIERS.ARCHIVE,
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
      tier: RETENTION_TIERS.DIAGNOSTIC_LATEST,
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
      tier: RETENTION_TIERS.ARCHIVE,
    });
  }

  for (const item of listChildren(rootDir, ".supervibe/artifacts/_agent-outputs")) {
    const normalized = normalizeRelPath(item.relPath);
    const retainedByReceipt = referencedPaths.some((prefix) => prefix === normalized || prefix.startsWith(`${normalized}/`));
    if (retainedByReceipt) {
      const outputPath = `${normalized}/agent-output.json`;
      const outputRefs = referenced.get(outputPath) || [];
      const trustedReceipt = outputRefs.some((ref) => ref.trusted === true);
      const outputState = readAgentOutputState(rootDir, outputPath);
      const summaryPath = `${normalized}/summary.md`;
      const hasSummary = existsSync(join(rootDir, ...summaryPath.split("/")));
      const itemAgeDays = ageDays(item.stat, now);
      if (
        trustedReceipt
        && outputState.exists
        && outputState.compacted !== true
        && hasSummary
        && Number.isFinite(compactCutoffMs)
        && item.stat.mtimeMs <= compactCutoffMs
      ) {
        compactable.push({
          relPath: normalized,
          outputPath,
          summaryPath,
          reason: "compactable-agent-output",
          tier: RETENTION_TIERS.REQUIRED,
          ageDays: itemAgeDays,
          trustedReceipt: true,
          receiptIds: outputRefs.filter((ref) => ref.trusted === true).map((ref) => ref.receiptId).filter(Boolean),
        });
        scanned.add(normalized);
        continue;
      }
      activeNoise.push({
        relPath: normalized,
        reason: outputState.compacted ? "receipt-linked-agent-output-compact-manifest" : "receipt-linked-agent-output",
        tier: RETENTION_TIERS.REQUIRED,
        ageDays: itemAgeDays,
        trustedReceipt,
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
        tier: RETENTION_TIERS.DIAGNOSTIC_LATEST,
      });
    } else {
      activeNoise.push({
        relPath: normalized,
        reason: "recent-unreferenced-agent-output",
        tier: RETENTION_TIERS.DIAGNOSTIC_LATEST,
        ageDays: itemAgeDays,
      });
      scanned.add(normalized);
    }
  }

  archiveCleanup.push(...collectArchiveCleanupCandidates({
    rootDir,
    now,
    archiveRetentionDays,
    maxArchiveBytes,
  }));

  candidates.sort((left, right) => left.relPath.localeCompare(right.relPath));
  activeNoise.sort((left, right) => left.relPath.localeCompare(right.relPath));
  compactable.sort((left, right) => left.relPath.localeCompare(right.relPath));
  archiveCleanup.sort((left, right) => left.relPath.localeCompare(right.relPath) || left.reason.localeCompare(right.reason));
  return {
    schemaVersion: 1,
    generatedAt: now,
    retentionDays: Number(retentionDays),
    compactAgentOutputDays: Number(compactAgentOutputDays),
    archiveRetentionDays: Number(archiveRetentionDays),
    maxArchiveBytes: Number(maxArchiveBytes || 0),
    candidates,
    activeNoise,
    compactable,
    archiveCleanup,
    summary: {
      scanned: scanned.size,
      candidates: candidates.length,
      activeNoise: activeNoise.length,
      compactable: compactable.length,
      archiveCleanup: archiveCleanup.length,
    },
  };
}

export async function archiveSupervibeArtifactGcCandidates(scan = {}, {
  rootDir = process.cwd(),
  dryRun = true,
  runTimestamp = scan.generatedAt || new Date().toISOString(),
} = {}) {
  const archived = [];
  const compacted = [];
  const archiveRemoved = [];
  const errors = [];
  if (dryRun) return { dryRun: true, archived, compacted, archiveRemoved, errors };

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

  for (const candidate of scan.compactable || []) {
    try {
      compacted.push(await compactAgentOutput(candidate, { rootDir, runTimestamp }));
    } catch (error) {
      errors.push(`${candidate.relPath}: ${error.message}`);
    }
  }

  const removedPaths = new Set();
  for (const candidate of scan.archiveCleanup || []) {
    const relPath = normalizeRelPath(candidate.relPath);
    if (removedPaths.has(relPath)) continue;
    removedPaths.add(relPath);
    const source = join(rootDir, ...relPath.split("/"));
    if (!existsSync(source)) continue;
    try {
      await rm(source, { force: true });
      archiveRemoved.push(candidate);
    } catch (error) {
      errors.push(`${relPath}: ${error.message}`);
    }
  }

  if (archived.length > 0 || compacted.length > 0 || archiveRemoved.length > 0 || errors.length > 0) {
    const logPath = join(archiveRoot, "artifact-gc.jsonl");
    await mkdir(dirname(logPath), { recursive: true });
    const lines = archived.map((entry) => JSON.stringify({
      schemaVersion: 1,
      archivedAt: runTimestamp,
      relPath: entry.relPath,
      archivePath: entry.archivePath,
      reason: entry.reason,
    }));
    for (const entry of compacted) {
      lines.push(JSON.stringify({
        schemaVersion: 1,
        compactedAt: runTimestamp,
        relPath: entry.relPath,
        manifestPath: entry.manifestPath,
        archivePath: entry.archivePath,
        reason: entry.reason,
      }));
    }
    for (const entry of archiveRemoved) {
      lines.push(JSON.stringify({
        schemaVersion: 1,
        removedAt: runTimestamp,
        relPath: entry.relPath,
        reason: entry.reason,
      }));
    }
    for (const error of errors) lines.push(JSON.stringify({ schemaVersion: 1, archivedAt: runTimestamp, error }));
    await writeFile(logPath, `${lines.join("\n")}${lines.length ? "\n" : ""}`, "utf8");
  }

  return { dryRun: false, archived, compacted, archiveRemoved, errors };
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
    .map((candidate) => `  - ${candidate.relPath} (${candidate.reason}, ${candidate.tier || "unknown"}, ${candidate.ageDays}d)`);
  const activeTop = (scan.activeNoise || [])
    .slice(0, 10)
    .map((item) => `  - ${item.relPath} (${item.reason}, ${item.tier || "unknown"}, ${item.ageDays}d)`);
  const compactTop = (scan.compactable || [])
    .slice(0, 10)
    .map((item) => `  - ${item.relPath} (${item.reason}, ${item.tier || "unknown"}, ${item.ageDays}d)`);
  const cleanupTop = (scan.archiveCleanup || [])
    .slice(0, 10)
    .map((item) => `  - ${item.relPath} (${item.reason}, ${item.ageDays}d, ${item.bytes || 0} bytes)`);
  const archived = (archiveResult.archived || [])
    .slice(0, 10)
    .map((item) => `  - ${item.relPath} -> ${item.archivePath}`);
  const compacted = (archiveResult.compacted || [])
    .slice(0, 10)
    .map((item) => `  - ${item.relPath} -> ${item.archivePath}`);
  const removed = (archiveResult.archiveRemoved || [])
    .slice(0, 10)
    .map((item) => `  - ${item.relPath} (${item.reason})`);
  return [
    "SUPERVIBE_ARTIFACT_GC",
    `SCANNED: ${scan.summary?.scanned || 0}`,
    `CANDIDATES: ${scan.summary?.candidates || 0}`,
    `ACTIVE_NOISE: ${scan.summary?.activeNoise || 0}`,
    `COMPACTABLE: ${scan.summary?.compactable || 0}`,
    `ARCHIVE_CLEANUP: ${scan.summary?.archiveCleanup || 0}`,
    `DRY_RUN: ${archiveResult.dryRun !== false}`,
    "TOP_CANDIDATES:",
    ...(top.length ? top : ["  - none"]),
    "ACTIVE_NOISE_TOP:",
    ...(activeTop.length ? activeTop : ["  - none"]),
    "COMPACTABLE_TOP:",
    ...(compactTop.length ? compactTop : ["  - none"]),
    "ARCHIVE_CLEANUP_TOP:",
    ...(cleanupTop.length ? cleanupTop : ["  - none"]),
    "ARCHIVED:",
    ...(archived.length ? archived : ["  - none"]),
    "COMPACTED:",
    ...(compacted.length ? compacted : ["  - none"]),
    "ARCHIVE_REMOVED:",
    ...(removed.length ? removed : ["  - none"]),
    `ERRORS: ${(archiveResult.errors || []).join("; ") || "none"}`,
  ].join("\n");
}

function addExistingFile({ rootDir, relPath, scanned, activeNoise, candidates, reason, candidate, tier }) {
  const normalized = normalizeRelPath(relPath);
  const absPath = join(rootDir, ...normalized.split("/"));
  if (!existsSync(absPath)) return;
  const stat = statSync(absPath);
  scanned.add(normalized);
  const item = {
    relPath: normalized,
    reason,
    tier,
    ageDays: ageDays(stat),
  };
  if (candidate) candidates.push(item);
  else activeNoise.push(item);
}

function addCandidate({ relPath, scanned, candidates, reason, ageDays, tier }) {
  const normalized = normalizeRelPath(relPath);
  scanned.add(normalized);
  candidates.push({
    relPath: normalized,
    reason,
    tier,
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

function listFiles(rootDir, relDir, { includeArchive = false } = {}) {
  const normalizedRelDir = normalizeRelPath(relDir);
  if (!includeArchive && (normalizedRelDir === ".supervibe/.archive" || normalizedRelDir.startsWith(".supervibe/.archive/"))) return [];
  const absDir = join(rootDir, ...normalizeRelPath(relDir).split("/"));
  if (!existsSync(absDir)) return [];
  const files = [];
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    const relPath = normalizeRelPath(`${relDir}/${entry.name}`);
    const absPath = join(absDir, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(rootDir, relPath, { includeArchive }));
    else if (entry.isFile()) files.push({ relPath, absPath, stat: statSync(absPath), dirent: entry });
  }
  return files;
}

function referencedOutputArtifacts(rootDir) {
  try {
    const references = new Map();
    for (const receipt of readWorkflowReceipts(rootDir)) {
      const trusted = !receipt.__invalidJson && validateWorkflowReceiptTrust(rootDir, receipt).pass === true;
      for (const item of receipt.outputArtifacts || []) {
        const path = normalizeRelPath(typeof item === "string" ? item : item?.path);
        if (!path) continue;
        const list = references.get(path) || [];
        list.push({ receiptId: receipt.receiptId, trusted });
        references.set(path, list);
      }
    }
    return references;
  } catch {
    return new Map();
  }
}

function readAgentOutputState(rootDir, relPath) {
  const normalized = normalizeRelPath(relPath);
  const absPath = join(rootDir, ...normalized.split("/"));
  if (!existsSync(absPath)) return { exists: false, compacted: false };
  try {
    const parsed = JSON.parse(readFileSync(absPath, "utf8"));
    return {
      exists: true,
      compacted: parsed?.type === COMPACT_MANIFEST_TYPE,
    };
  } catch {
    return { exists: true, compacted: false };
  }
}

function collectArchiveCleanupCandidates({
  rootDir,
  now,
  archiveRetentionDays,
  maxArchiveBytes,
}) {
  const files = listFiles(rootDir, ".supervibe/.archive", { includeArchive: true });
  const cleanup = [];
  const nowMs = Date.parse(now);
  const ttlDays = Number(archiveRetentionDays);
  if (Number.isFinite(ttlDays) && ttlDays > 0 && Number.isFinite(nowMs)) {
    const cutoffMs = nowMs - ttlDays * DAY_MS;
    for (const item of files) {
      if (item.stat.mtimeMs <= cutoffMs) {
        cleanup.push(archiveCleanupItem(item, "archive-ttl", now));
      }
    }
  }

  const maxBytes = Number(maxArchiveBytes || 0);
  const totalBytes = files.reduce((sum, item) => sum + Number(item.stat.size || 0), 0);
  if (Number.isFinite(maxBytes) && maxBytes > 0 && totalBytes > maxBytes) {
    const newestFirst = [...files].sort((left, right) => right.stat.mtimeMs - left.stat.mtimeMs || right.relPath.localeCompare(left.relPath));
    let retained = 0;
    for (const item of newestFirst) {
      const bytes = Number(item.stat.size || 0);
      if (retained + bytes <= maxBytes) {
        retained += bytes;
        continue;
      }
      cleanup.push(archiveCleanupItem(item, "archive-size-cap", now));
    }
  }
  return cleanup;
}

function archiveCleanupItem(item, reason, now) {
  return {
    relPath: normalizeRelPath(item.relPath),
    reason,
    tier: RETENTION_TIERS.ARCHIVE,
    ageDays: ageDays(item.stat, now),
    bytes: Number(item.stat.size || 0),
  };
}

async function compactAgentOutput(candidate, { rootDir, runTimestamp }) {
  const outputPath = normalizeRelPath(candidate.outputPath || `${candidate.relPath}/agent-output.json`);
  const source = join(rootDir, ...outputPath.split("/"));
  if (!existsSync(source)) throw new Error(`agent output missing: ${outputPath}`);
  const currentState = readAgentOutputState(rootDir, outputPath);
  if (currentState.compacted) {
    return {
      ...candidate,
      manifestPath: outputPath,
      archivePath: null,
      skipped: "already-compacted",
    };
  }
  const original = await readFile(source);
  const compressed = gzipSync(original);
  const runId = normalizeRelPath(candidate.relPath).split("/").filter(Boolean).pop() || "unknown";
  const archivePath = normalizeRelPath(`.supervibe/.archive/agent-outputs/${sanitizeId(runTimestamp)}/${sanitizeId(runId)}/agent-output.json.gz`);
  const archiveAbs = join(rootDir, ...archivePath.split("/"));
  await mkdir(dirname(archiveAbs), { recursive: true });
  await writeFile(archiveAbs, compressed);
  const manifest = {
    schemaVersion: 1,
    type: COMPACT_MANIFEST_TYPE,
    originalPath: outputPath,
    originalSha256: sha256(original),
    originalBytes: original.length,
    archivePath,
    archiveSha256: sha256(compressed),
    archiveBytes: compressed.length,
    compression: "gzip",
    compactedAt: runTimestamp,
    summaryPath: normalizeRelPath(candidate.summaryPath || `${candidate.relPath}/summary.md`),
  };
  await writeFile(source, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return {
    ...candidate,
    manifestPath: outputPath,
    archivePath,
    originalSha256: manifest.originalSha256,
    archiveSha256: manifest.archiveSha256,
  };
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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeRelPath(path) {
  return String(path || "").split(sep).join("/").replace(/\\/g, "/").replace(/^\.\//, "");
}
