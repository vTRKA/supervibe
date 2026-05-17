import { closeSync, existsSync, openSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  archiveSupervibeArtifactGcCandidates,
  evaluateArtifactGcSchedule,
  filterArtifactGcAutoCandidates,
  scanSupervibeArtifactGc,
  writeArtifactGcScheduleRun,
} from "./supervibe-artifact-gc.mjs";
import {
  archiveMemoryGcCandidates,
  evaluateMemoryGcSchedule,
  filterMemoryGcAutoCandidates,
  scanMemoryGc,
  writeMemoryGcScheduleRun,
} from "./supervibe-memory-gc.mjs";
import {
  applyArtifactSnapshotRetention,
  scanArtifactSnapshotRetention,
} from "../supervibe-artifact-snapshot.mjs";

export const AUTO_GC_STATE_REL_PATH = ".supervibe/memory/auto-gc-state.json";
export const AUTO_GC_LOCK_REL_PATH = ".supervibe/memory/auto-gc.lock";
const AUTO_GC_OUT_LOG_REL_PATH = ".supervibe/servers/auto-gc.out.log";
const AUTO_GC_ERR_LOG_REL_PATH = ".supervibe/servers/auto-gc.err.log";
const AUTO_GC_MODE = "session-start-background-auto-safe";

const DEFAULT_THROTTLE_MS = 60 * 60 * 1000;
const DEFAULT_LOCK_TTL_MS = 30 * 60 * 1000;
const DEFAULT_ARTIFACT_RETENTION_DAYS = 14;
const DEFAULT_WORKFLOW_ARTIFACT_RETENTION_DAYS = 90;

export async function createAutoGcMaintenancePlan({
  rootDir = process.cwd(),
  now = new Date().toISOString(),
  env = process.env,
  throttleMs = DEFAULT_THROTTLE_MS,
  lockTtlMs = DEFAULT_LOCK_TTL_MS,
  force = false,
  retentionDays = DEFAULT_ARTIFACT_RETENTION_DAYS,
  workflowArtifactRetentionDays = DEFAULT_WORKFLOW_ARTIFACT_RETENTION_DAYS,
} = {}) {
  const enabled = isAutoGcEnabled(env);
  const state = await readAutoGcMaintenanceState({ rootDir });
  const lock = await readAutoGcLockState({ rootDir, now, lockTtlMs });
  if (!enabled) {
    return basePlan({ rootDir, now, enabled, state, lock, status: "disabled", nextAction: "auto GC disabled" });
  }
  if (lock.active) {
    return basePlan({ rootDir, now, enabled, state, lock, status: "locked", nextAction: "auto GC already running" });
  }
  if (!force && isAutoGcThrottled(state, { now, throttleMs })) {
    return basePlan({
      rootDir,
      now,
      enabled,
      state,
      lock,
      status: "throttled",
      throttled: true,
      nextAction: "auto GC recently queued",
    });
  }

  const [artifactScan, memoryScan, snapshotScan] = await Promise.all([
    scanSupervibeArtifactGc({ rootDir, now, retentionDays, workflowArtifactRetentionDays }),
    scanMemoryGc({ rootDir, now }),
    scanArtifactSnapshotRetention({ rootDir, now }),
  ]);
  const [artifactSchedule, memorySchedule] = await Promise.all([
    evaluateArtifactGcSchedule({ rootDir, now, scan: artifactScan }),
    evaluateMemoryGcSchedule({ rootDir, now, scan: memoryScan }),
  ]);
  const artifactAutoScan = filterArtifactGcAutoCandidates(artifactScan);
  const memoryAutoScan = filterMemoryGcAutoCandidates(memoryScan, memorySchedule);
  const artifactAutoCandidates = artifactAutoScan.summary?.autoSafeCandidates || artifactAutoScan.summary?.candidates || 0;
  const memoryAutoCandidates = memoryAutoScan.summary?.candidates || 0;
  const artifactManualCandidates = Math.max(0, (artifactSchedule.candidates || 0) - artifactAutoCandidates);
  const memoryManualCandidates = Math.max(0, (memorySchedule.candidates || 0) - memoryAutoCandidates);
  const snapshotCandidates = snapshotScan.summary?.candidates || 0;
  const artifactNoopScheduleRefresh = artifactSchedule.due === true && (artifactSchedule.candidates || 0) === 0;
  const shouldRun = artifactNoopScheduleRefresh
    || (artifactSchedule.due === true && artifactAutoCandidates > 0)
    || (memorySchedule.due === true && memoryAutoCandidates > 0)
    || snapshotCandidates > 0;
  const manualReviewRequired = (artifactSchedule.due === true && artifactManualCandidates > 0 && artifactAutoCandidates === 0)
    || (memorySchedule.due === true && memoryManualCandidates > 0 && memoryAutoCandidates === 0);

  return {
    ...basePlan({
      rootDir,
      now,
      enabled,
      state,
      lock,
      status: shouldRun ? "due" : manualReviewRequired ? "manual-review-required" : "not-due",
      nextAction: shouldRun
        ? "queue background auto-safe GC"
        : manualReviewRequired
          ? "run manual GC dry-run review"
          : "no auto GC work due",
    }),
    shouldRun,
    manualReviewRequired,
    artifacts: summarizeArtifactPlan(artifactSchedule, artifactAutoCandidates, artifactManualCandidates),
    memory: summarizeMemoryPlan(memorySchedule, memoryAutoCandidates, memoryManualCandidates),
    snapshots: summarizeSnapshotPlan(snapshotScan),
  };
}

export async function spawnDetachedAutoGcMaintenance({
  rootDir = process.cwd(),
  pluginRoot = null,
  now = new Date().toISOString(),
  env = process.env,
  force = false,
  throttleMs = DEFAULT_THROTTLE_MS,
  lockTtlMs = DEFAULT_LOCK_TTL_MS,
  spawnImpl = spawn,
} = {}) {
  const enabled = isAutoGcEnabled(env);
  const state = await readAutoGcMaintenanceState({ rootDir });
  const lock = await readAutoGcLockState({ rootDir, now, lockTtlMs });
  if (!enabled) {
    return basePlan({ rootDir, now, enabled, state, lock, status: "disabled", nextAction: "auto GC disabled" });
  }
  if (lock.active) {
    return basePlan({ rootDir, now, enabled, state, lock, status: "locked", nextAction: "auto GC already running" });
  }
  if (!force && isAutoGcThrottled(state, { now, throttleMs })) {
    return basePlan({
      rootDir,
      now,
      enabled,
      state,
      lock,
      status: "throttled",
      throttled: true,
      nextAction: "auto GC recently queued",
    });
  }

  const scriptPath = fileURLToPath(new URL("../supervibe-auto-gc-maintenance.mjs", import.meta.url));
  const outLog = join(rootDir, ...AUTO_GC_OUT_LOG_REL_PATH.split("/"));
  const errLog = join(rootDir, ...AUTO_GC_ERR_LOG_REL_PATH.split("/"));
  await mkdir(dirname(outLog), { recursive: true });
  const outFd = openSync(outLog, "a");
  const errFd = openSync(errLog, "a");
  let child;
  try {
    child = spawnImpl(process.execPath, [
      scriptPath,
      "--run-once",
      "--root",
      rootDir,
    ], {
      cwd: rootDir,
      detached: true,
      stdio: ["ignore", outFd, errFd],
      env: {
        ...env,
        SUPERVIBE_PROJECT_ROOT: rootDir,
        SUPERVIBE_PLUGIN_ROOT: pluginRoot || env.SUPERVIBE_PLUGIN_ROOT || rootDir,
        SUPERVIBE_AUTO_GC_BACKGROUND: "1",
      },
      windowsHide: true,
    });
    child.unref?.();
  } finally {
    closeSync(outFd);
    closeSync(errFd);
  }
  const queuedState = {
    schemaVersion: 1,
    mode: AUTO_GC_MODE,
    status: "queued",
    queuedAt: now,
    lastStartedAt: now,
    pid: child.pid || null,
    rootDir,
    logs: {
      out: normalizeRel(rootDir, outLog),
      err: normalizeRel(rootDir, errLog),
    },
    plan: {
      status: "queued",
      shouldRun: true,
      foregroundScan: false,
      nextAction: "background planner will scan and apply auto-safe cleanup",
    },
  };
  await writeAutoGcMaintenanceState({ rootDir, state: queuedState });
  return {
    ...basePlan({
      rootDir,
      now,
      enabled,
      state,
      lock,
      status: "queued",
      nextAction: "auto GC planner queued in background",
    }),
    shouldRun: true,
    status: "queued",
    pid: child.pid || null,
    foregroundScan: false,
    outLog: normalizeRel(rootDir, outLog),
    errLog: normalizeRel(rootDir, errLog),
    nextAction: "auto GC planner queued in background",
  };
}

export async function runAutoGcMaintenance({
  rootDir = process.cwd(),
  now = new Date().toISOString(),
  env = process.env,
  dryRun = false,
  force = false,
  lockTtlMs = DEFAULT_LOCK_TTL_MS,
  retentionDays = DEFAULT_ARTIFACT_RETENTION_DAYS,
  workflowArtifactRetentionDays = DEFAULT_WORKFLOW_ARTIFACT_RETENTION_DAYS,
} = {}) {
  if (!isAutoGcEnabled(env) && !force) {
    const result = {
      schemaVersion: 1,
      mode: AUTO_GC_MODE,
      status: "disabled",
      startedAt: now,
      completedAt: now,
      dryRun: Boolean(dryRun),
      nextAction: "auto GC disabled",
    };
    await writeAutoGcMaintenanceState({ rootDir, state: result });
    return result;
  }

  const lock = await acquireAutoGcLock({ rootDir, now, lockTtlMs, force });
  if (!lock.acquired) {
    const result = {
      schemaVersion: 1,
      mode: AUTO_GC_MODE,
      status: "locked",
      startedAt: now,
      completedAt: now,
      dryRun: Boolean(dryRun),
      lock: lock.lock,
      nextAction: "auto GC already running",
    };
    await writeAutoGcMaintenanceState({ rootDir, state: result });
    return result;
  }

  const startedAt = now;
  const state = {
    schemaVersion: 1,
    mode: AUTO_GC_MODE,
    status: "running",
    startedAt,
    lastStartedAt: startedAt,
    pid: process.pid,
    dryRun: Boolean(dryRun),
    rootDir,
  };
  await writeAutoGcMaintenanceState({ rootDir, state });

  const result = {
    ...state,
    artifacts: null,
    memory: null,
    snapshots: null,
    errors: [],
  };
  try {
    result.artifacts = await runArtifactAutoGc({
      rootDir,
      now,
      dryRun,
      retentionDays,
      workflowArtifactRetentionDays,
    });
    for (const item of result.artifacts?.errors || []) {
      result.errors.push(`artifacts: ${item}`);
    }
  } catch (error) {
    result.errors.push(`artifacts: ${error.message}`);
    result.artifacts = { status: "error", error: error.message };
  }
  try {
    result.memory = await runMemoryAutoGc({ rootDir, now, dryRun });
  } catch (error) {
    result.errors.push("memory: " + error.message);
    result.memory = { status: "error", error: error.message };
  }
  try {
    result.snapshots = await runSnapshotAutoGc({ rootDir, now, dryRun });
    for (const item of result.snapshots?.errors || []) {
      result.errors.push("snapshots: " + item);
    }
  } catch (error) {
    result.errors.push("snapshots: " + error.message);
    result.snapshots = { status: "error", error: error.message };
  }

  result.completedAt = new Date().toISOString();
  result.lastCompletedAt = result.completedAt;
  result.status = result.errors.length > 0 ? "failed" : dryRun ? "preview" : "completed";
  result.nextAction = result.status === "completed" ? "none" : result.status === "preview" ? "run auto GC apply" : "inspect auto GC logs";
  await writeAutoGcMaintenanceState({ rootDir, state: result });
  await releaseAutoGcLock({ rootDir });
  return result;
}

export async function readAutoGcMaintenanceState({ rootDir = process.cwd() } = {}) {
  return await readJson(join(rootDir, ...AUTO_GC_STATE_REL_PATH.split("/")));
}

export async function writeAutoGcMaintenanceState({ rootDir = process.cwd(), state = {} } = {}) {
  const path = join(rootDir, ...AUTO_GC_STATE_REL_PATH.split("/"));
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  return path;
}

async function readAutoGcLockState({
  rootDir = process.cwd(),
  now = new Date().toISOString(),
  lockTtlMs = DEFAULT_LOCK_TTL_MS,
} = {}) {
  const path = join(rootDir, ...AUTO_GC_LOCK_REL_PATH.split("/"));
  const lock = await readJson(path);
  if (!lock) return { path: normalizeRel(rootDir, path), exists: false, active: false, stale: false, lock: null };
  const ageMs = Math.max(0, Date.parse(now) - Date.parse(lock.startedAt || lock.createdAt || now));
  const livePid = lock.pid ? isPidLive(lock.pid) : false;
  const stale = !livePid || ageMs > lockTtlMs;
  return {
    path: normalizeRel(rootDir, path),
    exists: true,
    active: !stale,
    stale,
    ageMs,
    lock,
  };
}

export function formatAutoGcMaintenanceStatus(plan = {}) {
  const state = plan.state || {};
  return [
    "SUPERVIBE_AUTO_GC",
    `MODE: ${plan.mode || AUTO_GC_MODE}`,
    `ENABLED: ${plan.enabled !== false}`,
    `STATUS: ${plan.status || state.status || "unknown"}`,
    `SHOULD_RUN: ${Boolean(plan.shouldRun)}`,
    `THROTTLED: ${Boolean(plan.throttled)}`,
    `LOCK_ACTIVE: ${Boolean(plan.lock?.active)}`,
    `ARTIFACTS_DUE: ${Boolean(plan.artifacts?.due)}`,
    `ARTIFACTS_CANDIDATES: ${plan.artifacts?.candidates || 0}`,
    `ARTIFACTS_AUTO_SAFE: ${plan.artifacts?.autoSafeCandidates || 0}`,
    `MEMORY_DUE: ${Boolean(plan.memory?.due)}`,
    `MEMORY_CANDIDATES: ${plan.memory?.candidates || 0}`,
    `MEMORY_AUTO_SAFE: ${plan.memory?.autoSafeCandidates || 0}`,
    "SNAPSHOT_CANDIDATES: " + (plan.snapshots?.candidates ?? state.snapshots?.candidates ?? 0),
    "SNAPSHOT_BYTES: " + (plan.snapshots?.bytes ?? state.snapshots?.bytes ?? 0),
    "SNAPSHOT_PROJECTED_BYTES: " + (plan.snapshots?.projectedBytesAfterCleanup ?? state.snapshots?.projectedBytesAfterCleanup ?? 0),
    `LAST_STARTED_AT: ${state.lastStartedAt || state.startedAt || "never"}`,
    `LAST_COMPLETED_AT: ${state.lastCompletedAt || state.completedAt || "never"}`,
    `LAST_STATUS: ${state.status || "unknown"}`,
    `NEXT_ACTION: ${plan.nextAction || state.nextAction || "inspect auto GC"}`,
  ].join("\n");
}

async function runArtifactAutoGc({
  rootDir,
  now,
  dryRun,
  retentionDays,
  workflowArtifactRetentionDays,
}) {
  const scan = await scanSupervibeArtifactGc({ rootDir, now, retentionDays, workflowArtifactRetentionDays });
  const schedule = await evaluateArtifactGcSchedule({ rootDir, now, scan });
  const autoScan = filterArtifactGcAutoCandidates(scan);
  const autoSafeCandidates = autoScan.summary?.autoSafeCandidates || autoScan.summary?.candidates || 0;
  const result = {
    status: "skipped",
    due: Boolean(schedule.due),
    candidates: schedule.candidates || 0,
    autoSafeCandidates,
    archived: 0,
    compacted: 0,
    archiveRemoved: 0,
    deleted: 0,
    errors: [],
    scheduleUpdated: false,
  };
  if (!schedule.due) {
    result.reason = "schedule-not-due";
    return result;
  }
  if ((schedule.candidates || 0) === 0) {
    result.status = "no-candidates";
    if (!dryRun) {
      await writeArtifactGcScheduleRun({ rootDir, now });
      result.scheduleUpdated = true;
    }
    return result;
  }
  if (autoSafeCandidates <= 0) {
    result.status = "manual-review-required";
    result.reason = "no-auto-safe-candidates";
    return result;
  }
  const archiveResult = await archiveSupervibeArtifactGcCandidates(autoScan, {
    rootDir,
    dryRun,
    runTimestamp: now,
  });
  result.status = dryRun ? "preview" : archiveResult.errors?.length ? "partial" : "applied";
  result.archived = archiveResult.archived?.length || 0;
  result.compacted = archiveResult.compacted?.length || 0;
  result.archiveRemoved = archiveResult.archiveRemoved?.length || 0;
  result.deleted = archiveResult.deleted?.length || 0;
  result.errors = archiveResult.errors || [];
  if (!dryRun && result.errors.length === 0) {
    await writeArtifactGcScheduleRun({ rootDir, now });
    result.scheduleUpdated = true;
  }
  return result;
}

async function runSnapshotAutoGc({ rootDir, now, dryRun }) {
  const scan = await scanArtifactSnapshotRetention({ rootDir, now });
  const candidates = scan.summary?.candidates || 0;
  const result = {
    status: candidates > 0 ? "pending" : "skipped",
    candidates,
    bytes: scan.summary?.bytes || 0,
    candidateBytes: scan.summary?.candidateBytes || 0,
    projectedBytesAfterCleanup: scan.summary?.projectedBytesAfterCleanup || 0,
    removed: 0,
    errors: [],
  };
  if (candidates <= 0) {
    result.reason = "no-retention-candidates";
    return result;
  }
  const applyResult = await applyArtifactSnapshotRetention(scan, { rootDir, dryRun, now });
  result.status = dryRun ? "preview" : applyResult.errors?.length ? "partial" : "applied";
  result.removed = applyResult.removed || 0;
  result.previewed = applyResult.previewed || 0;
  result.errors = applyResult.errors || [];
  return result;
}

async function runMemoryAutoGc({ rootDir, now, dryRun }) {
  const scan = await scanMemoryGc({ rootDir, now });
  const schedule = await evaluateMemoryGcSchedule({ rootDir, now, scan });
  const autoScan = filterMemoryGcAutoCandidates(scan, schedule);
  const autoSafeCandidates = autoScan.summary?.candidates || 0;
  const result = {
    status: "skipped",
    due: Boolean(schedule.due),
    candidates: schedule.candidates || 0,
    autoSafeCandidates,
    archived: 0,
    errors: [],
    scheduleUpdated: false,
  };
  if (!schedule.due) {
    result.reason = "schedule-not-due";
    return result;
  }
  if (autoSafeCandidates <= 0) {
    result.status = "manual-review-required";
    result.reason = "no-auto-safe-candidates";
    return result;
  }
  const archiveResult = await archiveMemoryGcCandidates(autoScan, { dryRun, now });
  result.status = dryRun ? "preview" : "applied";
  result.archived = archiveResult.archived || 0;
  if (!dryRun) {
    await writeMemoryGcScheduleRun({ rootDir, now, schedule });
    result.scheduleUpdated = true;
  }
  return result;
}

async function acquireAutoGcLock({
  rootDir,
  now,
  lockTtlMs,
  force = false,
}) {
  const lockPath = join(rootDir, ...AUTO_GC_LOCK_REL_PATH.split("/"));
  await mkdir(dirname(lockPath), { recursive: true });
  const existing = await readAutoGcLockState({ rootDir, now, lockTtlMs });
  if (existing.active && !force) return { acquired: false, lock: existing };
  if (existing.exists && existing.stale) await rm(lockPath, { force: true });
  const lock = {
    schemaVersion: 1,
    mode: AUTO_GC_MODE,
    pid: process.pid,
    startedAt: now,
  };
  try {
    await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    return { acquired: true, lock };
  } catch {
    const current = await readAutoGcLockState({ rootDir, now, lockTtlMs });
    return { acquired: false, lock: current };
  }
}

async function releaseAutoGcLock({ rootDir }) {
  const lockPath = join(rootDir, ...AUTO_GC_LOCK_REL_PATH.split("/"));
  await rm(lockPath, { force: true });
}

function basePlan({
  rootDir,
  now,
  enabled,
  state,
  lock,
  status,
  throttled = false,
  nextAction,
}) {
  return {
    schemaVersion: 1,
    mode: AUTO_GC_MODE,
    rootDir,
    generatedAt: now,
    enabled,
    status,
    shouldRun: false,
    throttled,
    lock,
    state,
    nextAction,
  };
}

function summarizeArtifactPlan(schedule, autoSafeCandidates, manualCandidates) {
  return {
    due: Boolean(schedule.due),
    candidates: schedule.candidates || 0,
    autoSafeCandidates,
    manualReviewCandidates: manualCandidates,
    nextRunAt: schedule.nextRunAt || null,
    lastRunAt: schedule.lastRunAt || null,
  };
}

function summarizeSnapshotPlan(scan) {
  return {
    snapshots: scan.summary?.snapshots || 0,
    bytes: scan.summary?.bytes || 0,
    candidates: scan.summary?.candidates || 0,
    candidateBytes: scan.summary?.candidateBytes || 0,
    projectedBytesAfterCleanup: scan.summary?.projectedBytesAfterCleanup || 0,
    latestSnapshotId: scan.latestSnapshotId || null,
    maxBytes: scan.policy?.maxBytes || 0,
    keepLast: scan.policy?.keepLast ?? 0,
  };
}

function summarizeMemoryPlan(schedule, autoSafeCandidates, manualCandidates) {
  return {
    due: Boolean(schedule.due),
    candidates: schedule.candidates || 0,
    autoSafeCandidates,
    manualReviewCandidates: manualCandidates,
    nextRunAt: schedule.nextRunAt || null,
    lastRunAt: schedule.lastRunAt || null,
  };
}

function summarizePlanForState(plan) {
  return {
    status: plan.status,
    shouldRun: Boolean(plan.shouldRun),
    artifacts: plan.artifacts || null,
    memory: plan.memory || null,
    snapshots: plan.snapshots || null,
    nextAction: plan.nextAction || null,
  };
}

function isAutoGcEnabled(env = process.env) {
  const value = env.SUPERVIBE_AUTO_GC ?? env.SUPERVIBE_SESSION_START_AUTO_GC ?? "on";
  return !["0", "false", "off", "disabled", "no"].includes(String(value).trim().toLowerCase());
}

function isAutoGcThrottled(state, { now, throttleMs }) {
  if (!state || throttleMs <= 0) return false;
  if (state.dryRun === true || state.status === "preview") return false;
  const lastStartedAt = state.lastStartedAt || state.startedAt || state.queuedAt;
  if (!lastStartedAt) return false;
  const ageMs = Date.parse(now) - Date.parse(lastStartedAt);
  return Number.isFinite(ageMs) && ageMs >= 0 && ageMs < throttleMs;
}

async function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

function isPidLive(pid) {
  const numericPid = Number(pid);
  if (!Number.isInteger(numericPid) || numericPid <= 0) return false;
  try {
    process.kill(numericPid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function normalizeRel(rootDir, path) {
  return relative(rootDir, path).replaceAll("\\", "/");
}
