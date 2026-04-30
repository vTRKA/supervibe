import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export function defaultWorkItemDaemonPath(rootDir = process.cwd()) {
  return join(rootDir, ".claude", "memory", "work-items", "watch-daemon.json");
}

export function createWorkItemWatchRecord({
  runId = null,
  epicId = null,
  worktree = null,
  pid = process.pid,
  status = "active",
  startedAt = new Date().toISOString(),
  heartbeatAt = startedAt,
  stopCommand = null,
  snapshot = {},
} = {}) {
  const id = `watch-${runId || epicId || pid}`;
  return {
    id,
    runId,
    epicId,
    worktree,
    pid,
    status,
    startedAt,
    heartbeatAt,
    stopCommand: stopCommand || `node scripts/supervibe-loop.mjs --stop-watch ${id}`,
    mutationMode: "read-only",
    snapshot: {
      ready: snapshot.ready || 0,
      blocked: snapshot.blocked || 0,
      claimed: snapshot.claimed || 0,
      stale: snapshot.stale || 0,
      delegated: snapshot.delegated || 0,
      review: snapshot.review || 0,
      done: snapshot.done || 0,
    },
  };
}

export async function readWorkItemDaemonState(path = defaultWorkItemDaemonPath()) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return { schema_version: 1, watches: [] };
    throw err;
  }
}

export async function writeWorkItemDaemonState(path, state) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify({ schema_version: 1, watches: state.watches || [] }, null, 2)}\n`, "utf8");
  return path;
}

export function upsertWorkItemWatch(state = { watches: [] }, record) {
  const watches = (state.watches || []).filter((watch) => watch.id !== record.id);
  return { schema_version: 1, watches: [...watches, record] };
}

export function heartbeatWorkItemWatch(state = { watches: [] }, id, { now = new Date().toISOString() } = {}) {
  return {
    schema_version: 1,
    watches: (state.watches || []).map((watch) =>
      watch.id === id ? { ...watch, status: "active", heartbeatAt: now } : watch
    ),
  };
}

export function stopWorkItemWatch(state = { watches: [] }, id, { now = new Date().toISOString() } = {}) {
  return {
    schema_version: 1,
    watches: (state.watches || []).map((watch) =>
      watch.id === id ? { ...watch, status: "stopped", stoppedAt: now } : watch
    ),
  };
}

export function diagnoseWorkItemDaemonState(state = { watches: [] }, { now = new Date(), pidAlive = defaultPidAlive, staleMinutes = 5 } = {}) {
  const issues = [];
  const nowMs = Date.parse(now instanceof Date ? now.toISOString() : now);
  for (const watch of state.watches || []) {
    if (watch.status !== "active") continue;
    if (!pidAlive(watch.pid)) {
      issues.push(issue("orphan-watch-daemon", watch.id, `Watch ${watch.id} points to non-running pid ${watch.pid}`));
    }
    const heartbeatMs = Date.parse(watch.heartbeatAt || watch.startedAt);
    if (Number.isFinite(heartbeatMs) && nowMs - heartbeatMs > staleMinutes * 60_000) {
      issues.push(issue("stale-watch-daemon", watch.id, `Watch ${watch.id} heartbeat is stale`));
    }
    if (watch.mutationMode !== "read-only") {
      issues.push(issue("watch-daemon-mutation-risk", watch.id, `Watch ${watch.id} is not read-only`));
    }
  }
  return { ok: issues.length === 0, issues };
}

export function formatWorkItemWatchStatus(state = { watches: [] }) {
  const active = (state.watches || []).filter((watch) => watch.status === "active");
  const lines = ["SUPERVIBE_WORK_ITEM_WATCH", `ACTIVE: ${active.length}`];
  for (const watch of active) {
    lines.push(`${watch.id}: ready=${watch.snapshot.ready} blocked=${watch.snapshot.blocked} claimed=${watch.snapshot.claimed} delegated=${watch.snapshot.delegated} review=${watch.snapshot.review}`);
    lines.push(`STOP: ${watch.stopCommand}`);
  }
  return lines.join("\n");
}

function defaultPidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function issue(code, id, message) {
  return { code, id, message };
}
