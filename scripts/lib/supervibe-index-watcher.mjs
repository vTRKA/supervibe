import { existsSync, readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { classifyIndexPath } from "./supervibe-index-policy.mjs";

const HEARTBEAT_REL = ".supervibe/memory/.watcher-heartbeat";
const LOCK_REL = ".supervibe/memory/.code-index.lock";

export function createIndexWatcherLifecycle({ rootDir = process.cwd(), codeStore, now = () => Date.now() } = {}) {
  if (!codeStore) throw new Error("codeStore is required");
  const state = {
    rootDir,
    startedAt: new Date(now()).toISOString(),
    eventsProcessed: 0,
    eventsIgnored: 0,
    lastEvent: null,
    errors: [],
  };

  return {
    state,
    handleSourceEvent: async (event, path) => {
      const policy = classifyIndexPath(path, { rootDir });
      if (!policy.included) {
        state.eventsIgnored += 1;
        state.lastEvent = { event, path: policy.relPath, action: "ignored", reason: policy.reason };
        return state.lastEvent;
      }
      try {
        if (event === "unlink") {
          await codeStore.removeFile(path);
          state.lastEvent = { event, path: policy.relPath, action: "removed" };
        } else {
          await codeStore.indexFile(path);
          state.lastEvent = { event, path: policy.relPath, action: "indexed" };
        }
        state.eventsProcessed += 1;
        return state.lastEvent;
      } catch (error) {
        const failure = { event, path: policy.relPath, error: error.message };
        state.errors.push(failure);
        throw error;
      }
    },
  };
}

function watcherPaths(rootDir = process.cwd()) {
  return {
    heartbeatPath: join(rootDir, HEARTBEAT_REL),
    lockPath: join(rootDir, LOCK_REL),
  };
}

async function writeWatcherHeartbeat({ rootDir = process.cwd(), now = Date.now() } = {}) {
  const { heartbeatPath } = watcherPaths(rootDir);
  await mkdir(dirname(heartbeatPath), { recursive: true });
  await writeFile(heartbeatPath, String(now), "utf8");
  return heartbeatPath;
}

export async function writeIndexLock({ rootDir = process.cwd(), ownerPid = process.pid, operation = "index", now = Date.now() } = {}) {
  const { lockPath } = watcherPaths(rootDir);
  await mkdir(dirname(lockPath), { recursive: true });
  const lock = {
    ownerPid,
    operation,
    heartbeat: now,
    createdAt: new Date(now).toISOString(),
  };
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
  return { path: lockPath, lock };
}

function readIndexLock({ rootDir = process.cwd(), now = Date.now() } = {}) {
  const { lockPath } = watcherPaths(rootDir);
  if (!existsSync(lockPath)) return { status: "absent", path: lockPath };
  try {
    const lock = JSON.parse(readFileSync(lockPath, "utf8"));
    return {
      status: "present",
      path: lockPath,
      lock,
      ageMs: Math.max(0, now - Number(lock.heartbeat || 0)),
    };
  } catch (error) {
    return { status: "corrupt", path: lockPath, error: error.message };
  }
}

export async function recoverStaleIndexLock({ rootDir = process.cwd(), now = Date.now(), staleMs = 60_000 } = {}) {
  const lock = readIndexLock({ rootDir, now });
  if (lock.status !== "present") return { recovered: false, reason: lock.status };
  if (lock.ageMs <= staleMs) return { recovered: false, reason: "fresh", ageMs: lock.ageMs };
  await rm(lock.path, { force: true });
  return { recovered: true, ageMs: lock.ageMs, path: lock.path };
}

export function readWatcherDiagnostics({ rootDir = process.cwd(), now = Date.now(), staleHeartbeatMs = 15_000 } = {}) {
  const { heartbeatPath } = watcherPaths(rootDir);
  let heartbeat = { status: "absent", path: heartbeatPath };
  if (existsSync(heartbeatPath)) {
    try {
      const timestamp = Number(readFileSync(heartbeatPath, "utf8"));
      const ageMs = Math.max(0, now - timestamp);
      heartbeat = {
        status: ageMs <= staleHeartbeatMs ? "running" : "stale",
        path: heartbeatPath,
        timestamp,
        ageMs,
      };
    } catch (error) {
      heartbeat = { status: "corrupt", path: heartbeatPath, error: error.message };
    }
  }
  return {
    rootDir,
    heartbeat,
    lock: readIndexLock({ rootDir, now }),
    repairActions: heartbeat.status === "running"
      ? []
      : ["npm run memory:watch", "node scripts/build-code-index.mjs --root . --force --health"],
  };
}

export function formatWatcherDiagnostics(diagnostics) {
  return [
    "SUPERVIBE_WATCHER_DIAGNOSTICS",
    `HEARTBEAT: ${diagnostics.heartbeat.status}`,
    `LOCK: ${diagnostics.lock.status}`,
    `REPAIR_ACTIONS: ${diagnostics.repairActions.join(" | ") || "none"}`,
  ].join("\n");
}
