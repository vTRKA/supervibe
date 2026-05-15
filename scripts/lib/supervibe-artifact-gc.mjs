import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { mkdir, readFile, rename, rmdir, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";

import {
  readWorkflowReceipts,
  validateWorkflowReceiptTrust,
} from "./supervibe-workflow-receipt-runtime.mjs";
import {
  validateWorkflowReceiptEvidenceSnapshot,
} from "./supervibe-receipt-snapshot-store.mjs";
import { buildCleanupReachability } from "./supervibe-cleanup-reachability.mjs";

const RETENTION_TIERS = Object.freeze({
  REQUIRED: "required",
  REGENERABLE_CACHE: "regenerable-cache",
  DIAGNOSTIC_LATEST: "diagnostic-latest",
  ARCHIVE: "archive",
});

const COMPACT_MANIFEST_TYPE = "supervibe-agent-output-compact-manifest";
const DEFAULT_RETENTION_DAYS = 14;
const DEFAULT_WORKFLOW_ARTIFACT_RETENTION_DAYS = 90;
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
  archiveKeepLast = 0,
  purgeArchives = false,
} = {}) {
  const candidates = [];
  const activeNoise = [];
  const compactable = [];
  const archiveCleanup = [];
  const scanned = new Set();
  const referenced = referencedOutputArtifacts(rootDir);
  const workflowReceipts = workflowReceiptsWithTrust(rootDir);
  const referencedPaths = [...referenced.keys()];
  const reachability = buildCleanupReachability({ rootDir, now });
  const protectedArchivePaths = buildArchiveCleanupProtectedPathSet({ referenced, reachability });
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

  for (const receipt of workflowReceipts) {
    const normalized = normalizeRelPath(receipt.receipt.__file);
    if (!normalized || scanned.has(normalized)) continue;
    const absPath = join(rootDir, ...normalized.split("/"));
    if (!existsSync(absPath)) continue;
    const itemStat = statSync(absPath);
    activeNoise.push({
      relPath: normalized,
      reason: receipt.trusted ? "trusted-workflow-receipt" : "untrusted-workflow-receipt",
      tier: receipt.trusted ? RETENTION_TIERS.REQUIRED : RETENTION_TIERS.DIAGNOSTIC_LATEST,
      ageDays: ageDays(itemStat, now),
      trustedReceipt: receipt.trusted,
      issueCount: receipt.issues.length,
      retentionDays: DEFAULT_WORKFLOW_ARTIFACT_RETENTION_DAYS,
    });
    scanned.add(normalized);
  }

  for (const item of listFiles(rootDir, ".supervibe")) {
    const normalized = normalizeRelPath(item.relPath);
    if (scanned.has(normalized)) continue;
    if (/\.log$/i.test(normalized)) {
      const itemAgeDays = ageDays(item.stat, now);
      if (Number.isFinite(cutoffMs) && item.stat.mtimeMs <= cutoffMs) {
        addCandidate({
          rootDir,
          relPath: normalized,
          scanned,
          candidates,
          reason: "stale-telemetry-log",
          ageDays: itemAgeDays,
          tier: RETENTION_TIERS.DIAGNOSTIC_LATEST,
        });
      } else {
        activeNoise.push({
          relPath: normalized,
          reason: "recent-telemetry-log",
          tier: RETENTION_TIERS.DIAGNOSTIC_LATEST,
          ageDays: itemAgeDays,
        });
        scanned.add(normalized);
      }
    } else if (/\.jsonl$/i.test(normalized)) {
      activeNoise.push({
        relPath: normalized,
        reason: "telemetry-jsonl",
        tier: normalized.includes("workflow-invocation-ledger") || normalized.includes("agent-invocations")
          ? RETENTION_TIERS.REQUIRED
          : RETENTION_TIERS.DIAGNOSTIC_LATEST,
        ageDays: ageDays(item.stat, now),
      });
      scanned.add(normalized);
    }
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
    keepLast: archiveKeepLast,
    protectedPaths: protectedArchivePaths,
    purgeArchives,
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
    archiveKeepLast: Number(archiveKeepLast || 0),
    purgeArchives: Boolean(purgeArchives),
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
    reachability: {
      summary: reachability.summary,
    },
  };
}

export async function archiveSupervibeArtifactGcCandidates(scan = {}, {
  rootDir = process.cwd(),
  dryRun = true,
  runTimestamp = scan.generatedAt || new Date().toISOString(),
  purge = false,
} = {}) {
  const archived = [];
  const compacted = [];
  const archiveRemoved = [];
  const deleted = [];
  const errors = [];
  if (dryRun) return { dryRun: true, purge: Boolean(purge), archived, compacted, archiveRemoved, deleted, errors };

  const guardErrors = await validateApplyDeletionGuards({ rootDir, scan, now: runTimestamp });
  if (guardErrors.length) return { dryRun: false, purge: Boolean(purge), archived, compacted, archiveRemoved, deleted, errors: guardErrors };

  const archiveRoot = join(rootDir, ".supervibe", ".archive", "gc", sanitizeId(runTimestamp));
  const auditRoot = purge || scan.purgeArchives === true
    ? join(rootDir, ".supervibe", "artifacts", "_gc-runs", sanitizeId(runTimestamp))
    : archiveRoot;
  const auditLogPath = await writeArtifactGcApplyAudit({ rootDir, archiveRoot: auditRoot, scan, runTimestamp, purge });
  for (const candidate of scan.candidates || []) {
    const relPath = normalizeRelPath(candidate.relPath);
    const source = join(rootDir, ...relPath.split("/"));
    if (!existsSync(source)) continue;
    const target = join(archiveRoot, ...relPath.split("/"));
    try {
      if (purge) {
        await rm(source, { recursive: true, force: true });
        await pruneEmptySupervibeParentDirs({ rootDir, relPath });
        deleted.push({ ...candidate, purge: true });
      } else {
        await mkdir(dirname(target), { recursive: true });
        await rename(source, target);
        archived.push({
          ...candidate,
          archivePath: normalizeRelPath(relative(rootDir, target)),
        });
      }
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
      await pruneEmptyArchiveParentDirs({ rootDir, relPath });
      archiveRemoved.push(candidate);
    } catch (error) {
      errors.push(`${relPath}: ${error.message}`);
    }
  }

  if (scan.purgeArchives === true) await removeEmptyDir({ rootDir, relPath: ".supervibe/.archive" });

  if (archived.length > 0 || compacted.length > 0 || archiveRemoved.length > 0 || deleted.length > 0 || errors.length > 0) {
    const logPath = join(auditRoot, "artifact-gc.jsonl");
    await mkdir(dirname(logPath), { recursive: true });
    const lines = archived.map((entry) => JSON.stringify({
      schemaVersion: 1,
      archivedAt: runTimestamp,
      relPath: entry.relPath,
      archivePath: entry.archivePath,
      reason: entry.reason,
    }));
    for (const entry of deleted) {
      lines.push(JSON.stringify({
        schemaVersion: 1,
        deletedAt: runTimestamp,
        relPath: entry.relPath,
        reason: entry.reason,
        purge: true,
      }));
    }
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

  return { dryRun: false, purge: Boolean(purge), archived, compacted, archiveRemoved, deleted, errors, auditLogPath: auditLogPath ? normalizeRelPath(relative(rootDir, auditLogPath)) : null };
}

async function validateApplyDeletionGuards({ rootDir, scan, now }) {
  const errors = [];
  const strict = await validateSupervibeGcStrict({ rootDir, now, scan });
  for (const failure of strict.failures || []) errors.push(failure);
  const reachability = buildCleanupReachability({ rootDir, now });
  const protectedClasses = new Set(["protected", "hot", "blocked"]);
  const protectedTargets = new Map((reachability.inventory || []).map((item) => [item.relPath, item]));
  for (const candidate of [
    ...(scan.candidates || []).map((item) => ({ ...item, cleanupMode: "candidate" })),
    ...(scan.archiveCleanup || []).map((item) => ({ ...item, cleanupMode: "archive-cleanup" })),
  ]) {
    const relPath = normalizeRelPath(candidate.relPath);
    const classification = protectedTargets.get(relPath);
    if (classification && protectedClasses.has(classification.lifecycleClass)) {
      errors.push(`${candidate.cleanupMode} would mutate ${classification.lifecycleClass} cleanup root: ${relPath}`);
    }
  }
  return [...new Set(errors)];
}

async function pruneEmptyArchiveParentDirs({ rootDir, relPath }) {
  await pruneEmptyParentDirs({ rootDir, relPath, stopRelPath: ".supervibe" });
}

async function pruneEmptySupervibeParentDirs({ rootDir, relPath }) {
  await pruneEmptyParentDirs({ rootDir, relPath, stopRelPath: ".supervibe" });
}

async function pruneEmptyParentDirs({ rootDir, relPath, stopRelPath }) {
  const stopRoot = join(rootDir, ...normalizeRelPath(stopRelPath).split("/"));
  let current = dirname(join(rootDir, ...normalizeRelPath(relPath).split("/")));
  while (isPathInsideDirectory(current, stopRoot)) {
    try {
      await rmdir(current);
    } catch (error) {
      if (["ENOENT", "ENOTDIR", "ENOTEMPTY"].includes(error?.code)) return;
      throw error;
    }
    current = dirname(current);
  }
}

async function removeEmptyDir({ rootDir, relPath }) {
  try {
    await rmdir(join(rootDir, ...normalizeRelPath(relPath).split("/")));
  } catch (error) {
    if (["ENOENT", "ENOTDIR", "ENOTEMPTY"].includes(error?.code)) return;
    throw error;
  }
}

function isPathInsideDirectory(candidate, root) {
  const relativePath = relative(root, candidate);
  return Boolean(relativePath) && !relativePath.startsWith("..") && !isAbsolute(relativePath);
}

async function writeArtifactGcApplyAudit({ rootDir, archiveRoot, scan, runTimestamp, purge = false }) {
  const auditLogPath = join(archiveRoot, "artifact-gc-plan.jsonl");
  await mkdir(dirname(auditLogPath), { recursive: true });
  const actions = [
    ...(scan.candidates || []).map((entry) => ({ action: purge ? "delete" : "archive", entry })),
    ...(scan.compactable || []).map((entry) => ({ action: "compact", entry })),
    ...(scan.archiveCleanup || []).map((entry) => ({ action: "remove-archive", entry })),
  ];
  const lines = actions.map(({ action, entry }) => JSON.stringify({
    schemaVersion: 1,
    plannedAt: runTimestamp,
    action,
    relPath: entry.relPath,
    reason: entry.reason || null,
    restoreCommand: entry.restoreCommand || null,
  }));
  await writeFile(auditLogPath, `${lines.join("\n")}${lines.length ? "\n" : ""}`, "utf8");
  return auditLogPath;
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

export async function validateSupervibeGcStrict({
  rootDir = process.cwd(),
  now = new Date().toISOString(),
  scan = null,
  retentionDays = DEFAULT_RETENTION_DAYS,
  compactAgentOutputDays = retentionDays,
  archiveRetentionDays = 90,
  maxArchiveBytes = 0,
  archiveKeepLast = 0,
  purgeArchives = false,
} = {}) {
  const resolvedScan = scan || await scanSupervibeArtifactGc({
    rootDir,
    now,
    retentionDays,
    compactAgentOutputDays,
    archiveRetentionDays,
    maxArchiveBytes,
    archiveKeepLast,
    purgeArchives,
  });
  const inventory = collectSupervibeInventory(rootDir, now);
  const referenced = referencedOutputArtifacts(rootDir);
  const receiptTrustByPath = workflowReceiptTrustMap(rootDir);
  const protectedPaths = buildReceiptProtectedPathSet(referenced);
  const reachability = buildCleanupReachability({ rootDir, now });
  for (const item of reachability.roots?.compactArchiveBlobs || []) protectedPaths.add(normalizeRelPath(item.relPath));
  const deletablePaths = [
    ...(resolvedScan.candidates || []).map((item) => ({ ...item, cleanupMode: "candidate" })),
    ...(resolvedScan.archiveCleanup || []).map((item) => ({ ...item, cleanupMode: "archive-cleanup" })),
  ];
  const unsafeProtectedCandidates = [];
  for (const candidate of deletablePaths) {
    const relPath = normalizeRelPath(candidate.relPath);
    for (const protectedPath of protectedPaths) {
      if (relPath === protectedPath || protectedPath.startsWith(`${relPath}/`)) {
        unsafeProtectedCandidates.push({
          relPath,
          cleanupMode: candidate.cleanupMode,
          reason: candidate.reason,
          protectedPath,
        });
      }
    }
  }

  const classified = inventory.map((item) => classifyStrictInventoryItem(item, {
    archiveRetentionDays,
    protectedPaths,
    referenced,
    receiptTrustByPath,
    retentionDays,
  }));
  const coverage = summarizeStrictCoverage(classified);
  const unclassified = classified.filter((item) => item.category === "unclassified");
  const untrustedReceipts = classified.filter((item) => item.category === "workflow-artifact" && item.trustedReceipt === false);
  const failures = [];
  for (const item of unsafeProtectedCandidates) {
    failures.push(`receipt-linked output would be deleted by ${item.cleanupMode}: ${item.relPath} protects ${item.protectedPath}`);
  }
  const pass = failures.length === 0;
  const staleTelemetry = classified.filter((item) => item.reason === "stale-telemetry-log");
  const backups = classified.filter((item) => item.category === "backup");
  const workflowArtifacts = classified.filter((item) => item.category === "workflow-artifact" || item.category === "workflow-artifact-link" || item.category === "workflow-archive");
  const protectedReceiptOutputs = classified.filter((item) => item.protectedByReceipt === true);
  return {
    schemaVersion: 1,
    generatedAt: now,
    pass,
    failures,
    summary: {
      scanned: inventory.length,
      candidates: resolvedScan.summary?.candidates || 0,
      activeNoise: resolvedScan.summary?.activeNoise || 0,
      compactable: resolvedScan.summary?.compactable || 0,
      archiveCleanup: resolvedScan.summary?.archiveCleanup || 0,
      unsafeProtectedCandidates: unsafeProtectedCandidates.length,
      unclassified: unclassified.length,
      untrustedReceipts: untrustedReceipts.length,
    },
    coverage,
    classifications: {
      protectedReceiptOutputs,
      staleTelemetry,
      backups,
      workflowArtifacts,
      unclassified,
      untrustedReceipts,
    },
    unsafeProtectedCandidates,
    retentionPolicy: {
      artifactRetentionDays: Number(retentionDays),
      compactAgentOutputDays: Number(compactAgentOutputDays),
      workflowArtifactRetentionDays: DEFAULT_WORKFLOW_ARTIFACT_RETENTION_DAYS,
      archiveRetentionDays: Number(archiveRetentionDays),
      archiveKeepLast: Number(archiveKeepLast || 0),
      trustedWorkflowReceipts: "retain",
      staleWorkflowReceipts: "prune with node scripts/workflow-receipt.mjs prune-stale --apply, then run npm run supervibe:gc -- --artifacts --dry-run",
    },
    nextActions: buildStrictGcNextActions({
      pass,
      staleTelemetry,
      backups,
      unsafeProtectedCandidates,
      untrustedReceipts,
    }),
  };
}

export function formatSupervibeGcStrictReport(result = {}) {
  const coverage = result.coverage || {};
  return [
    "SUPERVIBE_GC_STRICT",
    `PASS: ${result.pass === true}`,
    `SCANNED: ${result.summary?.scanned || 0}`,
    `CANDIDATES: ${result.summary?.candidates || 0}`,
    `ACTIVE_NOISE: ${result.summary?.activeNoise || 0}`,
    `COMPACTABLE: ${result.summary?.compactable || 0}`,
    `ARCHIVE_CLEANUP: ${result.summary?.archiveCleanup || 0}`,
    `UNSAFE_PROTECTED_CANDIDATES: ${result.summary?.unsafeProtectedCandidates || 0}`,
    `UNCLASSIFIED: ${result.summary?.unclassified || 0}`,
    `UNTRUSTED_RECEIPTS: ${result.summary?.untrustedReceipts || 0}`,
    `COVERAGE_ARTIFACTS: ${coverage.artifacts || 0}`,
    `COVERAGE_MEMORY: ${coverage.memory || 0}`,
    `COVERAGE_LOOPS: ${coverage.loops || 0}`,
    `COVERAGE_WORK_ITEMS: ${coverage.workItems || 0}`,
    `COVERAGE_RECEIPTS: ${coverage.receipts || 0}`,
    `COVERAGE_BACKUPS: ${coverage.backups || 0}`,
    `COVERAGE_TELEMETRY: ${coverage.telemetry || 0}`,
    `COVERAGE_ARCHIVES: ${coverage.archives || 0}`,
    `PROTECTED_RECEIPT_OUTPUTS: ${result.classifications?.protectedReceiptOutputs?.length || 0}`,
    `STALE_TELEMETRY: ${result.classifications?.staleTelemetry?.length || 0}`,
    `BACKUPS: ${result.classifications?.backups?.length || 0}`,
    `WORKFLOW_ARTIFACTS: ${result.classifications?.workflowArtifacts?.length || 0}`,
    `RETENTION_WORKFLOW_ARTIFACT_DAYS: ${result.retentionPolicy?.workflowArtifactRetentionDays || DEFAULT_WORKFLOW_ARTIFACT_RETENTION_DAYS}`,
    "FAILURES:",
    ...((result.failures || []).slice(0, 10).map((failure) => `  - ${failure}`) || []),
    ...(result.failures?.length ? [] : ["  - none"]),
    "NEXT_ACTIONS:",
    ...((result.nextActions || []).map((action) => `  - ${action}`)),
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
  const deleted = (archiveResult.deleted || [])
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
    "DELETED:",
    ...(deleted.length ? deleted : ["  - none"]),
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
    for (const { receipt, trusted } of workflowReceiptsWithTrust(rootDir)) {
      const snapshot = validateWorkflowReceiptEvidenceSnapshot(rootDir, receipt);
      const liveRequired = snapshot.legacy === true || snapshot.pass !== true;
      for (const item of receipt.outputArtifacts || []) {
        const path = normalizeRelPath(typeof item === "string" ? item : item?.path);
        if (!path) continue;
        const list = references.get(path) || [];
        list.push({ receiptId: receipt.receiptId, trusted, liveRequired });
        references.set(path, list);
      }
    }
    return references;
  } catch {
    return new Map();
  }
}

function workflowReceiptsWithTrust(rootDir) {
  try {
    return readWorkflowReceipts(rootDir).map((receipt) => {
      const trust = receipt.__invalidJson
        ? { pass: false, issues: ["invalid receipt json"] }
        : validateWorkflowReceiptTrust(rootDir, receipt);
      return {
        receipt,
        trusted: trust.pass === true,
        issues: trust.issues || [],
      };
    });
  } catch {
    return [];
  }
}

function workflowReceiptTrustMap(rootDir) {
  const map = new Map();
  for (const item of workflowReceiptsWithTrust(rootDir)) {
    const relPath = normalizeRelPath(item.receipt.__file);
    if (!relPath) continue;
    map.set(relPath, {
      trusted: item.trusted,
      issues: item.issues,
      receiptId: item.receipt.receiptId,
    });
  }
  return map;
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
  keepLast = 0,
  protectedPaths = new Set(),
  purgeArchives = false,
}) {
  const sortedFiles = listFiles(rootDir, ".supervibe/.archive", { includeArchive: true })
    .filter((item) => !isProtectedArchivePath(item.relPath, protectedPaths))
    .sort((left, right) => right.stat.mtimeMs - left.stat.mtimeMs || left.relPath.localeCompare(right.relPath));
  const keepCount = Math.max(0, Number(keepLast || 0));
  const keepLastPaths = new Set(sortedFiles.slice(0, keepCount).map((item) => normalizeRelPath(item.relPath)));
  const files = sortedFiles.filter((item) => !keepLastPaths.has(normalizeRelPath(item.relPath)));
  const cleanup = [];
  if (purgeArchives) {
    return files.map((item) => archiveCleanupItem(item, "archive-purge", now));
  }
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

function isProtectedArchivePath(relPath, protectedPaths = new Set()) {
  const normalized = normalizeRelPath(relPath);
  for (const protectedPath of protectedPaths) {
    if (normalized === protectedPath || normalized.startsWith(protectedPath + "/") || protectedPath.startsWith(normalized + "/")) {
      return true;
    }
  }
  return false;
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
    receiptIds: candidate.receiptIds || [],
    sourceCommand: "npm run supervibe:gc -- --artifacts --apply",
    restoreCommand: "node scripts/supervibe-gc.mjs --artifacts --restore " + sanitizeId(runId),
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

export async function verifyCompactManifestDigest({ rootDir = process.cwd(), manifestPath } = {}) {
  const normalizedManifestPath = normalizeRelPath(manifestPath);
  if (!normalizedManifestPath) throw new Error("manifestPath is required");
  const manifest = JSON.parse(await readFile(join(rootDir, ...normalizedManifestPath.split("/")), "utf8"));
  if (manifest.type !== COMPACT_MANIFEST_TYPE) throw new Error("not a compact manifest");
  const archivePath = normalizeRelPath(manifest.archivePath || "");
  if (!archivePath) throw new Error("compact manifest missing archivePath");
  const archived = await readFile(join(rootDir, ...archivePath.split("/")));
  const archiveSha256 = sha256(archived);
  const restored = gunzipSync(archived);
  const originalSha256 = sha256(restored);
  return {
    manifestPath: normalizedManifestPath,
    archivePath,
    archiveSha256,
    originalSha256,
    archiveMatches: archiveSha256 === manifest.archiveSha256,
    originalMatches: originalSha256 === manifest.originalSha256,
    pass: archiveSha256 === manifest.archiveSha256 && originalSha256 === manifest.originalSha256,
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

function collectSupervibeInventory(rootDir, now) {
  return listFiles(rootDir, ".supervibe", { includeArchive: true }).map((item) => ({
    relPath: normalizeRelPath(item.relPath),
    ageDays: ageDays(item.stat, now),
    bytes: Number(item.stat.size || 0),
    mtimeMs: item.stat.mtimeMs,
  }));
}

function buildReceiptProtectedPathSet(referenced) {
  const paths = new Set();
  for (const [path, refs] of referenced.entries()) {
    const normalized = normalizeRelPath(path);
    if (!normalized) continue;
    if (!normalized.startsWith(".supervibe/.archive/") || refs.some((ref) => ref.liveRequired === true)) {
      paths.add(normalized);
    }
  }
  return paths;
}

function buildArchiveCleanupProtectedPathSet({ referenced = new Map(), reachability = {} } = {}) {
  const paths = new Set();
  for (const [path, refs] of referenced.entries()) {
    const normalized = normalizeRelPath(path);
    if (normalized.startsWith(".supervibe/.archive/") && refs.some((ref) => ref.liveRequired === true)) {
      paths.add(normalized);
    }
  }
  for (const item of reachability.roots?.compactArchiveBlobs || []) {
    const normalized = normalizeRelPath(item.relPath);
    if (normalized) paths.add(normalized);
  }
  return paths;
}

function classifyStrictInventoryItem(item, {
  archiveRetentionDays,
  protectedPaths,
  receiptTrustByPath,
  referenced,
  retentionDays,
}) {
  const relPath = normalizeRelPath(item.relPath);
  const receiptRefs = referenced.get(relPath) || [];
  const protectedByReceipt = protectedPaths.has(relPath);
  const base = {
    relPath,
    ageDays: item.ageDays,
    bytes: item.bytes,
    protectedByReceipt,
    trustedReceipt: receiptRefs.some((ref) => ref.trusted === true),
    receiptIds: receiptRefs.map((ref) => ref.receiptId).filter(Boolean),
  };
  if (protectedByReceipt) {
    return {
      ...base,
      category: "receipt-linked-output",
      reason: "protected-by-workflow-receipt",
      tier: RETENTION_TIERS.REQUIRED,
      nextAction: "retain; compact only through Supervibe GC compact manifest path",
    };
  }
  if (relPath.includes("/_workflow-invocations/") || relPath.includes("/workflow-receipts-stale/")) {
    const receipt = relPath.includes("/_workflow-invocations/") && relPath.endsWith(".json") && !relPath.endsWith("/artifact-links.json");
    const staleArchive = relPath.includes("/workflow-receipts-stale/");
    const artifactLink = relPath.endsWith("/artifact-links.json");
    const receiptTrust = receiptTrustByPath?.get(relPath) || null;
    return {
      ...base,
      category: staleArchive
        ? "workflow-archive"
        : artifactLink
          ? "workflow-artifact-link"
          : "workflow-artifact",
      reason: staleArchive
        ? "stale-workflow-receipt-archive"
        : artifactLink
          ? "workflow-artifact-link"
          : "workflow-receipt-retention",
      tier: staleArchive ? RETENTION_TIERS.ARCHIVE : RETENTION_TIERS.REQUIRED,
      retentionDays: staleArchive ? Number(archiveRetentionDays) : DEFAULT_WORKFLOW_ARTIFACT_RETENTION_DAYS,
      trustedReceipt: receipt ? receiptTrust?.trusted === true : base.trustedReceipt,
      trustIssues: receipt ? receiptTrust?.issues || [] : [],
      nextAction: staleArchive
        ? "run npm run supervibe:gc -- --artifacts --dry-run, then --apply after review"
        : "retain trusted receipts; repair or prune stale receipts with workflow-receipt.mjs",
    };
  }
  if (/\.bak$/i.test(relPath)) {
    return {
      ...base,
      category: "backup",
      reason: item.ageDays >= Number(retentionDays) ? "stale-backup" : "recent-backup",
      tier: RETENTION_TIERS.ARCHIVE,
      retentionDays: Number(retentionDays),
      nextAction: "run npm run supervibe:gc -- --artifacts --dry-run",
    };
  }
  if (/\.log$/i.test(relPath)) {
    return {
      ...base,
      category: "telemetry",
      reason: item.ageDays >= Number(retentionDays) ? "stale-telemetry-log" : "recent-telemetry-log",
      tier: RETENTION_TIERS.DIAGNOSTIC_LATEST,
      retentionDays: Number(retentionDays),
      nextAction: "run npm run supervibe:gc -- --artifacts --dry-run",
    };
  }
  if (/\.jsonl$/i.test(relPath)) {
    return {
      ...base,
      category: "telemetry",
      reason: "telemetry-jsonl",
      tier: relPath.includes("workflow-invocation-ledger") || relPath.includes("agent-invocations")
        ? RETENTION_TIERS.REQUIRED
        : RETENTION_TIERS.DIAGNOSTIC_LATEST,
      nextAction: "retain append-only telemetry unless a domain validator marks it stale",
    };
  }
  if (relPath.startsWith(".supervibe/.archive/")) {
    return {
      ...base,
      category: "archive",
      reason: "archive-retention",
      tier: RETENTION_TIERS.ARCHIVE,
      retentionDays: Number(archiveRetentionDays),
      nextAction: "run npm run supervibe:gc -- --artifacts --dry-run --archive-retention-days <days>",
    };
  }
  if (relPath.startsWith(".supervibe/memory/work-items/")) {
    return {
      ...base,
      category: "work-item",
      reason: "work-item-state",
      tier: RETENTION_TIERS.REQUIRED,
      nextAction: "retain active work graph; archive only through work-item GC",
    };
  }
  if (relPath.startsWith(".supervibe/memory/loops/")) {
    return {
      ...base,
      category: "loop",
      reason: "loop-state",
      tier: RETENTION_TIERS.REQUIRED,
      nextAction: "retain until loop terminal state is archived",
    };
  }
  if (relPath.startsWith(".supervibe/memory/")) {
    return {
      ...base,
      category: "memory",
      reason: relPath.endsWith(".db") ? "regenerable-memory-cache" : "project-memory-state",
      tier: relPath.endsWith(".db") ? RETENTION_TIERS.REGENERABLE_CACHE : RETENTION_TIERS.REQUIRED,
      nextAction: "use memory-specific GC for project memory entries",
    };
  }
  if (relPath.startsWith(".supervibe/artifacts/")) {
    return {
      ...base,
      category: "artifact",
      reason: "project-artifact",
      tier: RETENTION_TIERS.DIAGNOSTIC_LATEST,
      nextAction: "retain unless a typed artifact GC candidate classifies it",
    };
  }
  if (relPath.startsWith(".supervibe/audits/")) {
    return {
      ...base,
      category: "audit",
      reason: "audit-report",
      tier: RETENTION_TIERS.DIAGNOSTIC_LATEST,
      nextAction: "retain latest audit reports; archive old reports only through typed GC",
    };
  }
  return {
    ...base,
    category: "unclassified",
    reason: "unclassified-supervibe-file",
    tier: RETENTION_TIERS.DIAGNOSTIC_LATEST,
    nextAction: "inspect and add an explicit GC classification before cleanup",
  };
}

function summarizeStrictCoverage(classified) {
  return {
    artifacts: classified.filter((item) => item.relPath.startsWith(".supervibe/artifacts/")).length,
    memory: classified.filter((item) => item.relPath.startsWith(".supervibe/memory/")).length,
    loops: classified.filter((item) => item.category === "loop").length,
    workItems: classified.filter((item) => item.category === "work-item").length,
    receipts: classified.filter((item) => item.category === "workflow-artifact" || item.category === "workflow-artifact-link" || item.category === "workflow-archive").length,
    backups: classified.filter((item) => item.category === "backup").length,
    telemetry: classified.filter((item) => item.category === "telemetry").length,
    archives: classified.filter((item) => item.relPath.startsWith(".supervibe/.archive/")).length,
  };
}

function buildStrictGcNextActions({
  pass,
  staleTelemetry,
  backups,
  unsafeProtectedCandidates,
  untrustedReceipts,
}) {
  const actions = [];
  if (!pass || unsafeProtectedCandidates.length > 0) {
    actions.push("STOP: repair GC classification before running apply; receipt-linked outputs must not be deletable");
  }
  if (untrustedReceipts.length > 0) {
    actions.push("node scripts/workflow-receipt.mjs recovery-status");
    actions.push("node scripts/workflow-receipt.mjs prune-stale --apply");
  }
  if (staleTelemetry.length > 0 || backups.length > 0) {
    actions.push("npm run supervibe:gc -- --artifacts --dry-run");
  }
  if (actions.length === 0) actions.push("no strict GC action required");
  return [...new Set(actions)];
}

function normalizeRelPath(path) {
  return String(path || "").split(sep).join("/").replace(/\\/g, "/").replace(/^\.\//, "");
}
