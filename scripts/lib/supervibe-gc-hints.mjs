import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { evaluateMemoryGcSchedule, scanMemoryGc } from "./supervibe-memory-gc.mjs";
import { evaluateArtifactGcSchedule, scanSupervibeArtifactGc } from "./supervibe-artifact-gc.mjs";
import { scanWorkItemGc } from "./supervibe-work-item-gc.mjs";
import { buildCleanupReachability } from "./supervibe-cleanup-reachability.mjs";
import { readAutoGcMaintenanceState } from "./supervibe-auto-gc-maintenance.mjs";
import { scanArtifactSnapshotRetention } from "../supervibe-artifact-snapshot.mjs";

export async function buildGcHints({
  rootDir = process.cwd(),
  now = new Date().toISOString(),
  retentionDays = 14,
  staleOpenDays = 90,
  includeStaleOpen = false,
} = {}) {
  const [workItems, memory, artifacts] = await Promise.all([
    scanWorkItemGc({ rootDir, now, retentionDays, staleOpenDays, includeStaleOpen }),
    scanMemoryGc({ rootDir, now }),
    scanSupervibeArtifactGc({ rootDir, now, retentionDays }),
  ]);
  const memorySchedule = await evaluateMemoryGcSchedule({ rootDir, now, scan: memory });
  const artifactSchedule = await evaluateArtifactGcSchedule({ rootDir, now, scan: artifacts });
  const lifecycle = buildCleanupReachability({ rootDir, now });
  const autoGc = await readAutoGcMaintenanceState({ rootDir });
  const artifactSnapshots = await summarizeArtifactSnapshots({ rootDir, now });
  const codeDbSnapshots = summarizeCodeDbSnapshots({ rootDir });
  const needsAttention = workItems.summary.candidates > 0 || memory.summary.candidates > 0 || artifacts.summary.candidates > 0 || lifecycle.summary.archivable > 0 || lifecycle.summary.trash > 0 || lifecycle.summary.unclassified > 0;
  return {
    schemaVersion: 1,
    generatedAt: now,
    needsAttention,
    workItems: summarizeWorkItems(workItems),
    memory: { ...summarizeMemory(memory), schedule: memorySchedule },
    artifacts: { ...summarizeArtifacts(artifacts), schedule: artifactSchedule },
    artifactSnapshots,
    codeDbSnapshots,
    autoGc: summarizeAutoGc(autoGc),
    lifecycle: summarizeLifecycle(lifecycle),
    nextAction: memorySchedule.due
      ? memorySchedule.nextAction
      : artifactSchedule.due && artifacts.summary.candidates > 0
        ? artifactSchedule.nextAction
      : needsAttention
        ? "run npm run supervibe:gc -- --all --dry-run"
      : "no cleanup needed",
  };
}

export function formatGcHints(hints = {}) {
  return [
    "SUPERVIBE_GC_HINTS",
    `NEEDS_ATTENTION: ${Boolean(hints.needsAttention)}`,
    `WORK_ITEM_CANDIDATES: ${hints.workItems?.candidates || 0}`,
    `WORK_ITEM_TOP: ${(hints.workItems?.top || []).map((item) => `${item.graphId}:${item.reason}`).join(",") || "none"}`,
    `MEMORY_CANDIDATES: ${hints.memory?.candidates || 0}`,
    `MEMORY_TOP: ${(hints.memory?.top || []).map((item) => `${item.id}:${item.reason}`).join(",") || "none"}`,
    `ARTIFACT_CANDIDATES: ${hints.artifacts?.candidates || 0}`,
    `ARTIFACT_ACTIVE_NOISE: ${hints.artifacts?.activeNoise || 0}`,
    `ARTIFACT_TOP: ${(hints.artifacts?.top || []).map((item) => `${item.relPath}:${item.reason}`).join(",") || "none"}`,
    `ARTIFACT_GC_DUE: ${Boolean(hints.artifacts?.schedule?.due)}`,
    `AUTO_GC_MODE: session-start-background-auto-safe`,
    `AUTO_GC_STATUS: ${hints.autoGc?.status || "never-run"}`,
    `AUTO_GC_LAST_COMPLETED_AT: ${hints.autoGc?.lastCompletedAt || "never"}`,
    `AUTO_GC_DISABLE: SUPERVIBE_AUTO_GC=off`,
    `LIFECYCLE_HOT: ${hints.lifecycle?.hot || 0}`,
    `LIFECYCLE_WARM: ${hints.lifecycle?.warm || 0}`,
    `LIFECYCLE_ARCHIVABLE: ${hints.lifecycle?.archivable || 0}`,
    `LIFECYCLE_COLD: ${hints.lifecycle?.cold || 0}`,
    `LIFECYCLE_TRASH: ${hints.lifecycle?.trash || 0}`,
    `LIFECYCLE_PROTECTED: ${hints.lifecycle?.protected || 0}`,
    `LIFECYCLE_UNCLASSIFIED: ${hints.lifecycle?.unclassified || 0}`,
    `CONTEXT_FILTER_DEFAULT: include=hot,warm exclude=archivable,cold,trash,unclassified`,
    `CONTEXT_NOISE_TOP: ${(hints.lifecycle?.topNoise || []).map((item) => `${item.relPath}:${item.lifecycleClass}:${item.reason}`).join(",") || "none"}`,
    `ARTIFACT_GC_NEXT: ${hints.artifacts?.schedule?.nextRunAt || "unknown"}`,
    `CLEANUP_MODE: dry-run-first`,
    `CLEANUP_ALLOWLIST: work-item-archives,stale-runtime-logs,stale-preview-logs,stale-untrusted-workflow-receipts,stale-workflow-temp-artifacts,compactable-agent-outputs,artifact-snapshot-retention`,
    `CLEANUP_PROTECTED: workflow-ledger,workflow-receipt-runtime-key,code.db,memory.db,receipt-linked-outputs,latest-artifact-snapshot`,
    `CODE_DB_SNAPSHOT_RETENTION: keep=${hints.codeDbSnapshots?.keepLast || 2} activeProtected=${hints.codeDbSnapshots?.activeProtected !== false} snapshots=${hints.codeDbSnapshots?.count || 0}`,
    `ARTIFACT_SNAPSHOT_BUDGET: bytes=${hints.artifactSnapshots?.bytes || 0}/${hints.artifactSnapshots?.maxBytes || 0} status=${hints.artifactSnapshots?.status || "unknown"} candidates=${hints.artifactSnapshots?.candidates || 0} projected=${hints.artifactSnapshots?.projectedBytesAfterCleanup || 0}`,
    `RESTORE_PATH: .supervibe/memory/work-items/.archive plus archive-log.jsonl for closed graph restore`,
    `RETENTION_WINDOW_DAYS: artifacts=${hints.artifacts?.retentionDays || hints.artifacts?.schedule?.retentionDays || "unknown"} memoryReview=${hints.memory?.schedule?.intervalDays || "unknown"}`,
    `MEMORY_GC_DUE: ${Boolean(hints.memory?.schedule?.due)}`,
    `MEMORY_GC_NEXT: ${hints.memory?.schedule?.nextRunAt || "unknown"}`,
    `NEXT_ACTION: ${hints.nextAction || "inspect status"}`,
  ].join("\n");
}

async function summarizeArtifactSnapshots({ rootDir = process.cwd(), now = new Date().toISOString(), maxBytes = 50 * 1024 * 1024 } = {}) {
  try {
    const scan = await scanArtifactSnapshotRetention({ rootDir, now, maxBytes });
    return {
      path: scan.snapshotRoot || ".supervibe/memory/artifact-snapshots",
      files: scan.entries?.reduce((sum, entry) => sum + (entry.entryCount || 0), 0) || 0,
      snapshots: scan.summary?.snapshots || 0,
      bytes: scan.summary?.bytes || 0,
      maxBytes: scan.policy?.maxBytes || maxBytes,
      candidates: scan.summary?.candidates || 0,
      candidateBytes: scan.summary?.candidateBytes || 0,
      projectedBytesAfterCleanup: scan.summary?.projectedBytesAfterCleanup || 0,
      latestSnapshotId: scan.latestSnapshotId || null,
      status: scan.summary?.overBudget ? "over-budget" : "ok",
      cleanupMode: "auto-safe-retention",
    };
  } catch {
    const dir = join(rootDir, ".supervibe", "memory", "artifact-snapshots");
    const summary = summarizeDirectory(dir);
    return {
      path: ".supervibe/memory/artifact-snapshots",
      files: summary.files,
      bytes: summary.bytes,
      maxBytes,
      candidates: 0,
      candidateBytes: 0,
      projectedBytesAfterCleanup: summary.bytes,
      status: summary.bytes > maxBytes ? "over-budget" : "ok",
      cleanupMode: "dry-run-first",
    };
  }
}

function summarizeCodeDbSnapshots({ rootDir = process.cwd(), keepLast = 2 } = {}) {
  const dir = join(rootDir, ".supervibe", "memory");
  if (!existsSync(dir)) return { count: 0, bytes: 0, keepLast, activeProtected: true };
  const entries = readdirSync(dir)
    .filter((name) => /^code.db[.-].+/i.test(name) && !isLiveCodeDbSidecar(name))
    .map((name) => {
      const abs = join(dir, name);
      try {
        const stats = statSync(abs);
        return { name, bytes: stats.size, mtimeMs: stats.mtimeMs };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return {
    count: entries.length,
    bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
    keepLast,
    activeProtected: true,
    cleanupMode: "dry-run-first",
    candidates: entries.slice(keepLast).map((entry) => entry.name),
  };
}

function isLiveCodeDbSidecar(name = "") {
  return /^code\.db-(?:wal|shm|journal)$/i.test(String(name));
}

function summarizeDirectory(dir) {
  if (!existsSync(dir)) return { files: 0, bytes: 0 };
  let files = 0;
  let bytes = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      const child = summarizeDirectory(abs);
      files += child.files;
      bytes += child.bytes;
    } else {
      files += 1;
      try { bytes += statSync(abs).size; } catch {}
    }
  }
  return { files, bytes };
}

function summarizeAutoGc(state) {
  if (!state) return { status: "never-run", lastCompletedAt: null, lastStartedAt: null };
  return {
    status: state.status || "unknown",
    lastCompletedAt: state.lastCompletedAt || state.completedAt || null,
    lastStartedAt: state.lastStartedAt || state.startedAt || state.queuedAt || null,
    artifactsStatus: state.artifacts?.status || null,
    memoryStatus: state.memory?.status || null,
  };
}

function summarizeLifecycle(scan) {
  return {
    ...(scan.summary || {}),
    topNoise: (scan.inventory || [])
      .filter((item) => ["archivable", "cold", "trash", "unclassified"].includes(item.lifecycleClass))
      .slice(0, 5)
      .map((item) => ({ relPath: item.relPath, lifecycleClass: item.lifecycleClass, reason: item.reason })),
  };
}

function summarizeArtifacts(scan) {
  return {
    scanned: scan.summary?.scanned || 0,
    candidates: scan.summary?.candidates || 0,
    activeNoise: scan.summary?.activeNoise || 0,
    retentionDays: scan.retentionDays || null,
    workflowArtifactRetentionDays: scan.workflowArtifactRetentionDays || null,
    autoSafeCandidates: scan.summary?.autoSafeCandidates || 0,
    compactable: scan.summary?.compactable || 0,
    archiveCleanup: scan.summary?.archiveCleanup || 0,
    top: (scan.candidates || []).slice(0, 5).map((candidate) => ({
      relPath: candidate.relPath,
      reason: candidate.reason,
      ageDays: candidate.ageDays,
    })),
  };
}

function summarizeWorkItems(scan) {
  return {
    scanned: scan.summary?.scanned || 0,
    candidates: scan.summary?.candidates || 0,
    active: scan.summary?.active || 0,
    top: (scan.candidates || []).slice(0, 5).map((candidate) => ({
      graphId: candidate.graphId,
      reason: candidate.reason,
      ageDays: candidate.ageDays,
      open: candidate.counts?.open || 0,
      done: candidate.counts?.done || 0,
    })),
  };
}

function summarizeMemory(scan) {
  return {
    scanned: scan.summary?.scanned || 0,
    candidates: scan.summary?.candidates || 0,
    active: scan.summary?.active || 0,
    top: (scan.candidates || []).slice(0, 5).map((candidate) => ({
      id: candidate.id,
      category: candidate.category,
      reason: candidate.reason,
      ageDays: candidate.ageDays,
      confidence: candidate.confidence,
    })),
  };
}
