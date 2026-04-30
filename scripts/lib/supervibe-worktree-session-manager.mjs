import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

export const WORKTREE_SESSION_STATUSES = Object.freeze([
  "planned",
  "ready",
  "active",
  "stale",
  "blocked",
  "cleanup_blocked",
  "closed",
  "archived",
]);

export const DEFAULT_WORKTREE_DIRS = Object.freeze([".worktrees", "worktrees"]);

export function createWorktreeSessionRecord(options = {}) {
  const now = options.now ?? new Date().toISOString();
  const epicId = options.epicId || "epic-unassigned";
  const branchName = sanitizeBranchName(options.branchName || `supervibe/${epicId}`);
  const worktreePath = normalizePath(options.worktreePath || join(options.rootDir || ".", ".worktrees", branchName.replace(/[\\/]/g, "-")));
  const sessionId = options.sessionId || `session-${stableHash(`${epicId}:${branchName}:${worktreePath}`).slice(0, 10)}`;

  return {
    sessionId,
    epicId,
    workItemIds: [...new Set(options.workItemIds || [])],
    branchName,
    worktreePath,
    createdAt: options.createdAt || now,
    updatedAt: options.updatedAt || now,
    heartbeatAt: options.heartbeatAt || now,
    baselineCommit: options.baselineCommit || null,
    baselineChecks: options.baselineChecks || [],
    activeAgentIds: [...new Set(options.activeAgentIds || [])],
    assignedWaveId: options.assignedWaveId || null,
    assignedTaskIds: [...new Set(options.assignedTaskIds || options.workItemIds || [])],
    assignedWriteSet: uniqueNormalizedPaths(options.assignedWriteSet || options.writeSet || options.targetFiles || []),
    status: normalizeSessionStatus(options.status || "planned"),
    cleanupPolicy: options.cleanupPolicy || "keep-until-reviewed",
    maxRuntimeMinutes: Number(options.maxRuntimeMinutes || 180),
    owner: options.owner || "supervibe-loop",
    stopCommand: options.stopCommand || `supervibe-loop --stop ${sessionId}`,
    resumeCommand: options.resumeCommand || `supervibe-loop --resume-session ${sessionId}`,
    cleanupCommand: options.cleanupCommand || `git worktree remove ${quotePath(worktreePath)}`,
    commandPlan: options.commandPlan || createWorktreeCommandPlan({ branchName, worktreePath, baselineCommit: options.baselineCommit }),
    safety: options.safety || {
      hiddenAutomation: false,
      providerBypass: false,
      cleanupRequiresCleanTree: true,
    },
  };
}

export function createWorktreeCommandPlan(sessionOrOptions = {}) {
  const branchName = sessionOrOptions.branchName || "supervibe/work";
  const worktreePath = normalizePath(sessionOrOptions.worktreePath || ".worktrees/supervibe-work");
  const baselineCommit = sessionOrOptions.baselineCommit || "HEAD";
  return {
    create: `git worktree add ${quotePath(worktreePath)} -b ${branchName} ${baselineCommit}`,
    status: `git -C ${quotePath(worktreePath)} status --short`,
    stop: sessionOrOptions.stopCommand || "supervibe-loop --stop <run-id>",
    cleanup: `git worktree remove ${quotePath(worktreePath)}`,
  };
}

export async function selectWorktreeDirectory(options = {}) {
  const rootDir = resolve(options.rootDir || process.cwd());
  const exists = options.exists || pathExists;
  const gitignoreContent = options.gitignoreContent ?? await readGitIgnore(rootDir);
  const candidates = [
    ...DEFAULT_WORKTREE_DIRS.map((dir) => ({ source: "project-existing", path: resolve(rootDir, dir), requiresExisting: true })),
    ...(options.configWorktreeRoot ? [{ source: "project-config", path: resolve(rootDir, options.configWorktreeRoot), requiresExisting: false }] : []),
    ...(options.globalCacheRoot ? [{ source: "global-cache", path: resolve(options.globalCacheRoot), requiresExisting: false }] : []),
  ];
  const evaluated = [];

  for (const candidate of candidates) {
    const present = await exists(candidate.path);
    const policy = validateWorktreeDirectoryPolicy({
      rootDir,
      worktreeRoot: candidate.path,
      gitignoreContent,
      mustExist: candidate.requiresExisting,
      exists: present,
    });
    evaluated.push({ ...candidate, exists: present, policy });
    if (policy.valid && (!candidate.requiresExisting || present)) {
      return {
        status: "ready",
        selected: candidate.path,
        source: candidate.source,
        candidates: evaluated,
        issues: [],
      };
    }
  }

  return {
    status: "needs-user-path",
    selected: null,
    source: null,
    candidates: evaluated,
    issues: evaluated.flatMap((candidate) => candidate.policy.issues),
  };
}

export function validateWorktreeDirectoryPolicy(options = {}) {
  const rootDir = resolve(options.rootDir || process.cwd());
  const worktreeRoot = resolve(options.worktreeRoot || "");
  const inside = isPathInside(rootDir, worktreeRoot);
  const relativePath = normalizePath(relative(rootDir, worktreeRoot));
  const basenameSafe = DEFAULT_WORKTREE_DIRS.includes(relativePath.split("/")[0]) || !inside;
  const ignored = !inside || gitignoreCovers(options.gitignoreContent || "", relativePath.split("/")[0]);
  const issues = [];

  if (options.mustExist && !options.exists) issues.push("worktree-root-missing");
  if (inside && !basenameSafe) issues.push("project-local-worktree-root-must-be-dot-worktrees-or-worktrees");
  if (inside && !ignored) issues.push("project-local-worktree-root-must-be-gitignored");
  if (relativePath === "" || relativePath === ".") issues.push("worktree-root-cannot-be-repo-root");

  return {
    valid: issues.length === 0,
    rootDir,
    worktreeRoot,
    insideProject: inside,
    relativePath,
    ignored,
    issues,
  };
}

export function validateExistingWorktree(options = {}) {
  const rootDir = resolve(options.rootDir || process.cwd());
  const worktreePath = resolve(options.worktreePath || "");
  const policy = validateWorktreeDirectoryPolicy({
    rootDir,
    worktreeRoot: dirname(worktreePath),
    gitignoreContent: options.gitignoreContent || "",
    exists: true,
    mustExist: false,
  });
  const issues = [...policy.issues];
  if (normalizePath(worktreePath) === normalizePath(rootDir)) issues.push("existing-worktree-cannot-be-main-root");
  if (options.dirty === true) issues.push("existing-worktree-has-uncommitted-changes");
  if (Array.isArray(options.baselineChecks) && options.baselineChecks.some((check) => check.status === "failed")) {
    issues.push("baseline-check-failed");
  }
  return { valid: issues.length === 0, issues, policy };
}

export function createSessionRegistry(sessions = []) {
  const unique = new Map();
  for (const session of sessions) unique.set(session.sessionId, createWorktreeSessionRecord(session));
  return {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    sessions: [...unique.values()],
  };
}

export async function readWorktreeSessionRegistry(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return createSessionRegistry();
    throw error;
  }
}

export async function writeWorktreeSessionRegistry(filePath, registry) {
  await mkdir(dirname(filePath), { recursive: true });
  const normalized = {
    schemaVersion: registry.schemaVersion || 1,
    updatedAt: new Date().toISOString(),
    sessions: (registry.sessions || []).map((session) => createWorktreeSessionRecord(session)),
  };
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  try {
    await writeFile(tempPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
    await rename(tempPath, filePath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
  return normalized;
}

export async function upsertWorktreeSessionFile(filePath, session, options = {}) {
  return withWorktreeSessionRegistryLock(filePath, async () => {
    const registry = await readWorktreeSessionRegistry(filePath);
    const result = upsertWorktreeSession(registry, session, options);
    if (!result.ok || options.dryRun) return result;
    const written = await writeWorktreeSessionRegistry(filePath, result.registry);
    return { ...result, registry: written };
  }, options);
}

export async function withWorktreeSessionRegistryLock(filePath, callback, options = {}) {
  await mkdir(dirname(filePath), { recursive: true });
  const lockDir = `${filePath}.lock`;
  const retryMs = Number(options.lockRetryMs || 10);
  const attempts = Number(options.lockAttempts || 200);
  const staleMs = Number(options.lockStaleMs || 120_000);
  let lastError = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await mkdir(lockDir);
      await writeFile(join(lockDir, "owner.json"), `${JSON.stringify({
        pid: process.pid,
        acquiredAt: new Date().toISOString(),
        filePath,
      }, null, 2)}\n`, "utf8").catch(() => {});
      try {
        return await callback();
      } finally {
        await rm(lockDir, { recursive: true, force: true });
      }
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      lastError = error;
      await removeStaleLock(lockDir, staleMs);
      await sleep(retryMs);
    }
  }

  throw new Error(`Timed out waiting for worktree session registry lock: ${lockDir}${lastError ? ` (${lastError.code})` : ""}`);
}

export function upsertWorktreeSession(registry = createSessionRegistry(), session, options = {}) {
  const record = createWorktreeSessionRecord(session);
  const conflicts = findSessionConflicts(registry, {
    sessionId: record.sessionId,
    epicId: record.epicId,
    workItemIds: record.workItemIds,
    assignedTaskIds: record.assignedTaskIds,
    assignedWriteSet: record.assignedWriteSet,
  });
  if (conflicts.length > 0 && !options.allowConflict) {
    return {
      ok: false,
      registry,
      conflicts,
      session: { ...record, status: "blocked" },
      reason: "session-conflict",
    };
  }

  const sessions = (registry.sessions || []).filter((candidate) => candidate.sessionId !== record.sessionId);
  sessions.push(record);
  return {
    ok: true,
    registry: { schemaVersion: registry.schemaVersion || 1, updatedAt: new Date().toISOString(), sessions },
    conflicts,
    session: record,
  };
}

export function heartbeatWorktreeSession(registry = createSessionRegistry(), sessionId, options = {}) {
  const now = options.now || new Date().toISOString();
  return {
    ...registry,
    updatedAt: now,
    sessions: (registry.sessions || []).map((session) =>
      session.sessionId === sessionId
        ? { ...session, heartbeatAt: now, updatedAt: now, activeAgentIds: uniqueStrings([...(session.activeAgentIds || []), ...(options.activeAgentIds || [])]), status: options.status || "active" }
        : session
    ),
  };
}

export function markStaleWorktreeSessions(registry = createSessionRegistry(), options = {}) {
  const nowMs = Date.parse(options.now || new Date().toISOString());
  const ttlMinutes = Number(options.ttlMinutes || 30);
  return {
    ...registry,
    sessions: (registry.sessions || []).map((session) => {
      if (!["active", "ready", "planned"].includes(session.status)) return session;
      const heartbeatMs = Date.parse(session.heartbeatAt || session.updatedAt || session.createdAt);
      if (Number.isFinite(heartbeatMs) && nowMs - heartbeatMs > ttlMinutes * 60_000) {
        return { ...session, status: "stale", staleAt: new Date(nowMs).toISOString() };
      }
      return session;
    }),
  };
}

export function findSessionConflicts(registry = createSessionRegistry(), claim = {}) {
  const workItems = new Set([...(claim.workItemIds || []), ...(claim.assignedTaskIds || [])].filter(Boolean));
  const writeSet = new Set(uniqueNormalizedPaths(claim.assignedWriteSet || claim.writeSet || claim.targetFiles || []));
  return (registry.sessions || []).map((session) => {
    if (session.sessionId === claim.sessionId) return false;
    if (!["planned", "ready", "active"].includes(session.status)) return false;
    const sessionWorkItems = new Set([...(session.workItemIds || []), ...(session.assignedTaskIds || [])].filter(Boolean));
    const sessionWriteSet = new Set(uniqueNormalizedPaths(session.assignedWriteSet || []));
    const overlappingWorkItemIds = [...sessionWorkItems].filter((itemId) => workItems.has(itemId));
    const overlappingWriteSet = [...sessionWriteSet].filter((filePath) => writeSet.has(filePath));
    const sameEpic = claim.epicId && session.epicId === claim.epicId;
    const unscopedSameEpic = sameEpic && (workItems.size === 0 || sessionWorkItems.size === 0) && (writeSet.size === 0 || sessionWriteSet.size === 0);
    const reasons = [
      ...(overlappingWorkItemIds.length ? ["overlapping-work-items"] : []),
      ...(overlappingWriteSet.length ? ["overlapping-write-set"] : []),
      ...(unscopedSameEpic ? ["unscoped-epic-session"] : []),
    ];
    if (reasons.length === 0) return false;
    return {
      sessionId: session.sessionId,
      epicId: session.epicId,
      workItemIds: session.workItemIds,
      assignedTaskIds: session.assignedTaskIds || [],
      assignedWriteSet: session.assignedWriteSet || [],
      overlappingWorkItemIds,
      overlappingWriteSet,
      reasons,
      status: session.status,
    };
  }).filter(Boolean);
}

export function assertSessionClaimAllowed(registry, claim = {}) {
  const conflicts = findSessionConflicts(registry, claim);
  return {
    allowed: conflicts.length === 0 || claim.allowConflict === true,
    conflicts,
    reason: conflicts.length === 0 ? "no-conflict" : "work-owned-by-active-session",
  };
}

export function validateWorktreeTrackerVisibility(session = {}, mapping = {}) {
  const issues = [];
  if (!session.sessionId) issues.push("missing-session-id");
  if (mapping.graphId && session.epicId && mapping.graphId !== session.epicId) {
    issues.push("worktree-session-epic-mismatch");
  }
  const mappedWorkItems = new Set(Object.keys(mapping.items || {}));
  const invisible = (session.workItemIds || []).filter((itemId) => !mappedWorkItems.has(itemId));
  if (invisible.length > 0) issues.push("worktree-session-missing-work-item-mapping");
  return {
    ok: issues.length === 0,
    sessionId: session.sessionId || null,
    epicId: session.epicId || null,
    graphId: mapping.graphId || null,
    invisibleWorkItemIds: invisible,
    issues,
  };
}

export function createCleanupPlan(session, options = {}) {
  const hasUncommittedChanges = Boolean(options.hasUncommittedChanges);
  return {
    sessionId: session.sessionId,
    worktreePath: session.worktreePath,
    status: hasUncommittedChanges ? "cleanup_blocked" : "cleanup_ready",
    archiveFirst: true,
    allowedActions: hasUncommittedChanges
      ? ["status", "review-diff", "commit", "keep"]
      : ["archive", "merge", "open-pr", "discard", "remove-worktree"],
    command: hasUncommittedChanges ? null : session.cleanupCommand,
    reason: hasUncommittedChanges
      ? "Never remove a worktree with uncommitted changes."
      : "Worktree can be archived and cleaned up after review.",
  };
}

export function finishWorktreeSession(registry = createSessionRegistry(), sessionId, options = {}) {
  const sessions = (registry.sessions || []).map((session) => {
    if (session.sessionId !== sessionId) return session;
    const cleanup = createCleanupPlan(session, options);
    return {
      ...session,
      status: cleanup.status === "cleanup_blocked" ? "cleanup_blocked" : options.status || "closed",
      finishedAt: options.now || new Date().toISOString(),
      cleanup,
      finishOptions: cleanup.allowedActions,
    };
  });
  return { ...registry, updatedAt: options.now || new Date().toISOString(), sessions };
}

export function summarizeWorktreeSessions(registry = createSessionRegistry()) {
  const counts = { planned: 0, ready: 0, active: 0, stale: 0, blocked: 0, cleanup_blocked: 0, closed: 0, archived: 0 };
  for (const session of registry.sessions || []) {
    counts[session.status] = (counts[session.status] || 0) + 1;
  }
  return {
    total: (registry.sessions || []).length,
    counts,
    activeSessions: (registry.sessions || []).filter((session) => ["planned", "ready", "active", "stale", "cleanup_blocked"].includes(session.status)),
  };
}

export function formatWorktreeSessionStatus(registry = createSessionRegistry()) {
  const summary = summarizeWorktreeSessions(registry);
  const lines = [
    "SUPERVIBE_WORKTREE_SESSIONS",
    `TOTAL: ${summary.total}`,
    `ACTIVE: ${summary.counts.active || 0}`,
    `STALE: ${summary.counts.stale || 0}`,
    `CLEANUP_BLOCKED: ${summary.counts.cleanup_blocked || 0}`,
  ];
  for (const session of summary.activeSessions) {
    lines.push([
      session.sessionId,
      `epic=${session.epicId}`,
      `status=${session.status}`,
      `wave=${session.assignedWaveId || "unassigned"}`,
      `tasks=${formatCompactList(session.assignedTaskIds || session.workItemIds || [])}`,
      `writes=${formatCompactList(session.assignedWriteSet || [])}`,
      `agents=${formatCompactList(session.activeAgentIds || [])}`,
      `path=${session.worktreePath}`,
    ].join(" "));
  }
  return lines.join("\n");
}

export function defaultWorktreeRegistryPath(rootDir = process.cwd()) {
  return join(rootDir, ".claude", "memory", "worktree-sessions", "registry.json");
}

async function readGitIgnore(rootDir) {
  try {
    return await readFile(join(rootDir, ".gitignore"), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
}

async function pathExists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function removeStaleLock(lockDir, staleMs) {
  try {
    const info = await stat(lockDir);
    if (Date.now() - info.mtimeMs > staleMs) {
      await rm(lockDir, { recursive: true, force: true });
    }
  } catch {
    // Another process may have released the lock between attempts.
  }
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function gitignoreCovers(content, topLevelDir) {
  const normalized = normalizePath(topLevelDir).replace(/\/$/, "");
  return String(content || "")
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^\//, "").replace(/\/$/, ""))
    .filter((line) => line && !line.startsWith("#"))
    .includes(normalized);
}

function isPathInside(rootDir, targetPath) {
  const rel = relative(rootDir, targetPath);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function sanitizeBranchName(value) {
  return String(value || "supervibe/work")
    .replace(/[^A-Za-z0-9/_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "supervibe/work";
}

function normalizeSessionStatus(status) {
  return WORKTREE_SESSION_STATUSES.includes(status) ? status : "planned";
}

function quotePath(value) {
  const text = normalizePath(value);
  return text.includes(" ") ? `"${text}"` : text;
}

function normalizePath(value) {
  return String(value ?? "").replace(/\\/g, "/");
}

function uniqueNormalizedPaths(values) {
  return [...new Set((values || []).map(normalizePath).filter(Boolean))].sort();
}

function formatCompactList(values, options = {}) {
  const limit = Number(options.limit || 4);
  const unique = uniqueStrings(values || []);
  if (unique.length === 0) return "-";
  const shown = unique.slice(0, limit).join(",");
  return unique.length > limit ? `${shown},+${unique.length - limit}` : shown;
}

function stableHash(value) {
  return createHash("sha1").update(String(value)).digest("hex");
}

function uniqueStrings(values) {
  return [...new Set(values.map(String).filter(Boolean))];
}
