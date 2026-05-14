import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

const AGENT_INVOCATIONS_RELATIVE_PATH = ".supervibe/memory/agent-invocations.jsonl";
const HOST_MANAGED_COMPLETED_STATUSES = new Set(["completed", "complete", "done", "closed"]);

export function defaultRuntimeCleanupRegistryPath(rootDir = process.cwd()) {
  return join(rootDir, ".supervibe", "memory", "runtime-cleanup-registry.json");
}

function defaultServerPidDirectory(rootDir = process.cwd()) {
  return join(rootDir, ".supervibe", "servers");
}

export async function readRuntimeCleanupRegistry(path = defaultRuntimeCleanupRegistryPath()) {
  if (!existsSync(path)) {
    return { schemaVersion: 1, targets: [], hostManagedClosedInvocations: [] };
  }
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    return {
      schemaVersion: parsed.schemaVersion || 1,
      targets: Array.isArray(parsed.targets) ? parsed.targets.map(normalizeRuntimeCleanupTarget) : [],
      hostManagedClosedInvocations: normalizeHostManagedClosedInvocations(parsed.hostManagedClosedInvocations),
    };
  } catch {
    return { schemaVersion: 1, targets: [], hostManagedClosedInvocations: [] };
  }
}

function readRuntimeCleanupRegistrySync(path = defaultRuntimeCleanupRegistryPath()) {
  if (!existsSync(path)) {
    return { schemaVersion: 1, targets: [], hostManagedClosedInvocations: [] };
  }
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return {
      schemaVersion: parsed.schemaVersion || 1,
      targets: Array.isArray(parsed.targets) ? parsed.targets.map(normalizeRuntimeCleanupTarget) : [],
      hostManagedClosedInvocations: normalizeHostManagedClosedInvocations(parsed.hostManagedClosedInvocations),
    };
  } catch {
    return { schemaVersion: 1, targets: [], hostManagedClosedInvocations: [] };
  }
}

async function writeRuntimeCleanupRegistry(path, registry) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify({
    schemaVersion: registry.schemaVersion || 1,
    targets: Array.isArray(registry.targets) ? registry.targets : [],
    hostManagedClosedInvocations: normalizeHostManagedClosedInvocations(registry.hostManagedClosedInvocations),
  }, null, 2)}\n`, "utf8");
}

function writeRuntimeCleanupRegistrySync(path, registry) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify({
    schemaVersion: registry.schemaVersion || 1,
    targets: Array.isArray(registry.targets) ? registry.targets : [],
    hostManagedClosedInvocations: normalizeHostManagedClosedInvocations(registry.hostManagedClosedInvocations),
  }, null, 2)}\n`, "utf8");
}

export async function registerRuntimeCleanupTarget(target = {}, {
  path = defaultRuntimeCleanupRegistryPath(),
} = {}) {
  const registry = await readRuntimeCleanupRegistry(path);
  const nextTarget = normalizeRuntimeCleanupTarget(target);
  registry.targets = registry.targets.filter((item) => item.id !== nextTarget.id);
  registry.targets.push(nextTarget);
  await writeRuntimeCleanupRegistry(path, registry);
  return nextTarget;
}

export function registerRuntimeCleanupTargetSync(target = {}, {
  path = defaultRuntimeCleanupRegistryPath(),
} = {}) {
  const registry = readRuntimeCleanupRegistrySync(path);
  const nextTarget = normalizeRuntimeCleanupTarget(target);
  registry.targets = registry.targets.filter((item) => item.id !== nextTarget.id);
  registry.targets.push(nextTarget);
  writeRuntimeCleanupRegistrySync(path, registry);
  return nextTarget;
}

export async function cleanupRuntimeTargets({
  path = defaultRuntimeCleanupRegistryPath(),
  rootDir = process.cwd(),
  dryRun = false,
  includeServerPidFiles = false,
  resetCompletedSubagents = false,
  confirmHostClosed = false,
  unusedOnly = false,
  olderThanMinutes = unusedOnly ? 60 : 0,
  now = new Date(),
  platform = process.platform,
} = {}) {
  const registry = await readRuntimeCleanupRegistry(path);
  const registryTargets = registry.targets.map(normalizeRuntimeCleanupTarget);
  const hostManagedClosedInvocations = normalizeHostManagedClosedInvocations(registry.hostManagedClosedInvocations);
  const completedHostTargets = normalizePathForCompare(path) === normalizePathForCompare(defaultRuntimeCleanupRegistryPath(rootDir))
    ? await discoverHostManagedSubagentTargets({
        rootDir,
        knownTargets: registryTargets,
        closedInvocationKeys: hostManagedClosedInvocationKeys(hostManagedClosedInvocations),
      })
    : [];
  const orphanTargets = includeServerPidFiles
    ? await discoverServerPidFileTargets({
        rootDir,
        knownTargets: registryTargets,
        now,
      })
    : [];
  const targets = [...registryTargets, ...completedHostTargets, ...orphanTargets];
  const results = [];
  const kept = [];

  for (const target of targets) {
    const result = await cleanupTarget(target, {
      dryRun,
      resetCompletedSubagents,
      confirmHostClosed,
      unusedOnly,
      olderThanMinutes,
      now,
      platform,
    });
    results.push(result);
    if (target.source !== "server-pid-file" && !result.removedFromRegistry) kept.push(target);
  }

  if (!dryRun) {
    for (let index = 0; index < results.length; index += 1) {
      if (results[index].status !== "host-managed-completed-pruned") continue;
      const target = targets[index];
      if (!target?.hostInvocationId) continue;
      addHostManagedClosedInvocation(hostManagedClosedInvocations, {
        hostInvocationSource: target.hostInvocationSource,
        hostInvocationId: target.hostInvocationId,
        agentId: target.agentId || null,
        closedAt: target.closedAt || now.toISOString(),
      });
    }
    await writeRuntimeCleanupRegistry(path, {
      schemaVersion: registry.schemaVersion || 1,
      targets: kept,
      hostManagedClosedInvocations,
    });
  }

  return {
    schemaVersion: 1,
    dryRun,
    unusedOnly,
    olderThanMinutes,
    checked: targets.length,
    registryChecked: registryTargets.length,
    serverPidFilesChecked: orphanTargets.length,
    stopped: results.filter((item) => item.status === "stopped").length,
    wouldStop: results.filter((item) => item.status === "would-stop").length,
    hostManaged: results.filter((item) => item.status === "host-managed-stop-required" || item.status === "host-managed-close-required").length,
    hostManagedCompleted: results.filter((item) => item.status === "host-managed-close-required").length,
    hostManagedPruned: results.filter((item) => item.status === "host-managed-completed-pruned").length,
    wouldPruneHostManagedCompleted: results.filter((item) => item.status === "would-prune-host-managed-completed").length,
    completedHostInvocationsDiscovered: completedHostTargets.length,
    stale: results.filter((item) => item.status === "stale").length,
    active: results.filter((item) => item.status === "kept-active").length,
    ownershipUnverified: results.filter((item) => item.status === "ownership-unverified").length,
    results,
  };
}

function normalizeRuntimeCleanupTarget(target = {}) {
  const id = target.id || `${target.kind || "process"}:${target.pid || target.port || Date.now()}`;
  const registeredAt = target.registeredAt || new Date().toISOString();
  return {
    id,
    kind: target.kind || "process",
    pid: Number(target.pid || 0) || null,
    port: Number(target.port || 0) || null,
    label: target.label || "",
    stopMode: target.stopMode || (target.kind === "subagent" ? "host-managed" : "sigterm"),
    registeredAt,
    lastSeenAt: target.lastSeenAt || registeredAt,
    rootDir: target.rootDir || null,
    scriptPath: target.scriptPath || null,
    args: Array.isArray(target.args) ? target.args : [],
    logs: target.logs || null,
    pidFile: target.pidFile || null,
    source: target.source || "runtime-registry",
    host: target.host || null,
    hostInvocationSource: target.hostInvocationSource || target.host_invocation_source || null,
    hostInvocationId: target.hostInvocationId || target.host_invocation_id || target.invocationId || target.invocation_id || null,
    agentId: target.agentId || target.agent_id || null,
    status: target.status || null,
    completedAt: target.completedAt || target.completed_at || null,
    closedAt: target.closedAt || target.closed_at || null,
  };
}

function normalizeHostManagedClosedInvocations(items = []) {
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  const normalized = [];
  for (const item of items) {
    const hostInvocationSource = item?.hostInvocationSource || item?.host_invocation_source || item?.source;
    const hostInvocationId = item?.hostInvocationId || item?.host_invocation_id || item?.invocationId || item?.invocation_id;
    if (!hostInvocationId) continue;
    const entry = {
      hostInvocationSource: hostInvocationSource || "codex-spawn-agent",
      hostInvocationId,
      agentId: item?.agentId || item?.agent_id || null,
      closedAt: item?.closedAt || item?.closed_at || null,
    };
    const key = hostManagedClosedInvocationKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(entry);
  }
  return normalized;
}

function addHostManagedClosedInvocation(items, entry = {}) {
  const next = normalizeHostManagedClosedInvocations([entry])[0];
  if (!next) return items;
  const key = hostManagedClosedInvocationKey(next);
  const existingIndex = items.findIndex((item) => hostManagedClosedInvocationKey(item) === key);
  if (existingIndex >= 0) {
    items[existingIndex] = { ...items[existingIndex], ...next };
    return items;
  }
  items.push(next);
  return items;
}

function hostManagedClosedInvocationKeys(items = []) {
  return new Set(normalizeHostManagedClosedInvocations(items).map(hostManagedClosedInvocationKey));
}

function normalizeHostManagedClosedInvocationKeySet(keys = new Set()) {
  if (keys instanceof Set) return keys;
  if (Array.isArray(keys)) return new Set(keys);
  return new Set();
}

function hostManagedClosedInvocationKey({ hostInvocationSource = "codex-spawn-agent", hostInvocationId } = {}) {
  return `${hostInvocationSource || "codex-spawn-agent"}\u0000${hostInvocationId || ""}`;
}

export async function discoverHostManagedSubagentTargets({
  rootDir = process.cwd(),
  knownTargets = [],
  closedInvocationKeys = new Set(),
  invocationLogPath = join(rootDir, ...AGENT_INVOCATIONS_RELATIVE_PATH.split("/")),
} = {}) {
  if (!existsSync(invocationLogPath)) return [];
  const knownIds = new Set(knownTargets.map((target) => target.id));
  const knownInvocationIds = new Set(knownTargets.map((target) => target.hostInvocationId).filter(Boolean));
  const closedKeys = normalizeHostManagedClosedInvocationKeySet(closedInvocationKeys);
  const raw = await readFile(invocationLogPath, "utf8").catch(() => "");
  const targets = [];
  for (const line of raw.split(/\r?\n/).filter(Boolean)) {
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    const hostInvocationSource = record.host_invocation_source || record.hostInvocationSource || record.source;
    const hostInvocationId = record.host_invocation_id || record.hostInvocationId || record.invocation_id || record.invocationId;
    const status = String(record.status || "completed").toLowerCase();
    if (hostInvocationSource !== "codex-spawn-agent") continue;
    if (!hostInvocationId) continue;
    if (!HOST_MANAGED_COMPLETED_STATUSES.has(status)) continue;
    if (closedKeys.has(hostManagedClosedInvocationKey({ hostInvocationSource, hostInvocationId }))) continue;
    const id = hostManagedSubagentCleanupTargetId(hostInvocationSource, hostInvocationId);
    if (knownIds.has(id) || knownInvocationIds.has(hostInvocationId)) continue;
    knownIds.add(id);
    knownInvocationIds.add(hostInvocationId);
    targets.push(normalizeRuntimeCleanupTarget({
      id,
      kind: "subagent",
      label: record.agent_id || "codex subagent",
      stopMode: "host-managed",
      rootDir,
      source: "agent-invocations-jsonl",
      host: record.host || "codex",
      hostInvocationSource,
      hostInvocationId,
      agentId: record.agent_id || null,
      status,
      registeredAt: record.ts || new Date().toISOString(),
      lastSeenAt: record.ts || new Date().toISOString(),
      completedAt: record.ts || null,
    }));
  }
  return targets;
}

export function createHostManagedSubagentCleanupTarget({
  host = "codex",
  hostInvocationSource = "codex-spawn-agent",
  hostInvocationId,
  agentId = null,
  status = "completed",
  completedAt = null,
  rootDir = null,
} = {}) {
  if (!hostInvocationId) throw new Error("hostInvocationId required");
  return normalizeRuntimeCleanupTarget({
    id: hostManagedSubagentCleanupTargetId(hostInvocationSource, hostInvocationId),
    kind: "subagent",
    label: agentId || `${host} subagent`,
    stopMode: "host-managed",
    rootDir,
    source: "agent-invocation-log",
    host,
    hostInvocationSource,
    hostInvocationId,
    agentId,
    status,
    registeredAt: completedAt || new Date().toISOString(),
    lastSeenAt: completedAt || new Date().toISOString(),
    completedAt,
  });
}

export function summarizeHostManagedSubagentDebtSync({
  rootDir = process.cwd(),
  path = defaultRuntimeCleanupRegistryPath(rootDir),
  invocationLogPath = join(rootDir, ...AGENT_INVOCATIONS_RELATIVE_PATH.split("/")),
  includeInvocationLog = true,
} = {}) {
  const registry = readRuntimeCleanupRegistrySync(path);
  const registryTargets = registry.targets;
  const hostManagedClosedInvocations = registry.hostManagedClosedInvocations;
  const knownIds = new Set(registryTargets.map((target) => target.id));
  const knownInvocationIds = new Set(registryTargets.map((target) => target.hostInvocationId).filter(Boolean));
  const closedKeys = hostManagedClosedInvocationKeys(hostManagedClosedInvocations);
  const discoveredTargets = [];
  if (includeInvocationLog && existsSync(invocationLogPath)) {
    const raw = readFileSync(invocationLogPath, "utf8");
    for (const line of raw.split(/\r?\n/).filter(Boolean)) {
      let record;
      try {
        record = JSON.parse(line);
      } catch {
        continue;
      }
      const hostInvocationSource = record.host_invocation_source || record.hostInvocationSource || record.source;
      const hostInvocationId = record.host_invocation_id || record.hostInvocationId || record.invocation_id || record.invocationId;
      const status = String(record.status || "completed").toLowerCase();
      if (hostInvocationSource !== "codex-spawn-agent") continue;
      if (!hostInvocationId || !HOST_MANAGED_COMPLETED_STATUSES.has(status)) continue;
      if (closedKeys.has(hostManagedClosedInvocationKey({ hostInvocationSource, hostInvocationId }))) continue;
      const id = hostManagedSubagentCleanupTargetId(hostInvocationSource, hostInvocationId);
      if (knownIds.has(id) || knownInvocationIds.has(hostInvocationId)) continue;
      knownIds.add(id);
      knownInvocationIds.add(hostInvocationId);
      discoveredTargets.push(normalizeRuntimeCleanupTarget({
        id,
        kind: "subagent",
        stopMode: "host-managed",
        source: "agent-invocations-jsonl",
        host: record.host || "codex",
        hostInvocationSource,
        hostInvocationId,
        agentId: record.agent_id || null,
        status,
        registeredAt: record.ts || new Date().toISOString(),
        lastSeenAt: record.ts || new Date().toISOString(),
        completedAt: record.ts || null,
      }));
    }
  }
  const targets = [...registryTargets, ...discoveredTargets].filter(isCompletedHostManagedSubagent);
  const closeRequired = targets.filter((target) => !target.closedAt).map((target) => ({
    id: target.id,
    hostInvocationId: target.hostInvocationId,
    agentId: target.agentId,
  }));
  return {
    schemaVersion: 1,
    count: closeRequired.length,
    closeRequired,
    discovered: discoveredTargets.length,
  };
}

function hostManagedSubagentCleanupTargetId(source, invocationId) {
  return `subagent:${String(source || "host-managed").replace(/[^A-Za-z0-9_-]+/g, "-")}:${String(invocationId || "unknown").replace(/[^A-Za-z0-9_-]+/g, "-")}`;
}

async function discoverServerPidFileTargets({
  rootDir = process.cwd(),
  knownTargets = [],
  now = new Date(),
  pidDir = defaultServerPidDirectory(rootDir),
} = {}) {
  if (!existsSync(pidDir)) return [];
  const knownPids = new Set(knownTargets.map((target) => Number(target.pid || 0)).filter(Boolean));
  const targets = [];
  for (const entry of await readdir(pidDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".pid")) continue;
    const path = join(pidDir, entry.name);
    const raw = await readFile(path, "utf8").catch(() => "");
    const pid = Number(String(raw || "").trim());
    if (!pid || knownPids.has(pid)) continue;
    const details = await stat(path).catch(() => null);
    const lastSeenAt = details?.mtime ? details.mtime.toISOString() : now.toISOString();
    targets.push(normalizeRuntimeCleanupTarget({
      id: `pid-file:${basename(entry.name, ".pid")}`,
      kind: "server-pid-file",
      pid,
      label: basename(entry.name, ".pid"),
      stopMode: "process-tree",
      registeredAt: lastSeenAt,
      lastSeenAt,
      rootDir,
      pidFile: path,
      source: "server-pid-file",
    }));
  }
  return targets;
}

function discoverServerPidFileTargetsSync({
  rootDir = process.cwd(),
  knownTargets = [],
  now = new Date(),
  pidDir = defaultServerPidDirectory(rootDir),
} = {}) {
  if (!existsSync(pidDir)) return [];
  const knownPids = new Set(knownTargets.map((target) => Number(target.pid || 0)).filter(Boolean));
  const targets = [];
  for (const entry of readdirSync(pidDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".pid")) continue;
    const path = join(pidDir, entry.name);
    let pid = 0;
    let details = null;
    try {
      pid = Number(String(readFileSync(path, "utf8") || "").trim());
      details = statSync(path);
    } catch {
      continue;
    }
    if (!pid || knownPids.has(pid)) continue;
    const lastSeenAt = details?.mtime ? details.mtime.toISOString() : now.toISOString();
    targets.push(normalizeRuntimeCleanupTarget({
      id: `pid-file:${basename(entry.name, ".pid")}`,
      kind: "server-pid-file",
      pid,
      label: basename(entry.name, ".pid"),
      stopMode: "process-tree",
      registeredAt: lastSeenAt,
      lastSeenAt,
      rootDir,
      pidFile: path,
      source: "server-pid-file",
    }));
  }
  return targets;
}

async function cleanupTarget(target = {}, {
  dryRun = false,
  resetCompletedSubagents = false,
  confirmHostClosed = false,
  unusedOnly = false,
  olderThanMinutes = 0,
  now = new Date(),
  platform = process.platform,
} = {}) {
  if (target.stopMode === "host-managed" || target.kind === "subagent") {
    if (isCompletedHostManagedSubagent(target)) {
      if (resetCompletedSubagents || confirmHostClosed || target.closedAt) {
        return {
          id: target.id,
          kind: target.kind,
          status: dryRun ? "would-prune-host-managed-completed" : "host-managed-completed-pruned",
          removedFromRegistry: !dryRun,
          hostInvocationId: target.hostInvocationId || null,
          agentId: target.agentId || null,
          message: dryRun
            ? "completed host-managed subagent would be pruned after confirmed host close/reset"
            : "completed host-managed subagent pruned after confirmed host close/reset",
        };
      }
      return {
        id: target.id,
        kind: target.kind,
        status: "host-managed-close-required",
        removedFromRegistry: false,
        hostInvocationId: target.hostInvocationId || null,
        agentId: target.agentId || null,
        message: "completed host-managed subagent must be closed/reset through the host runtime before new spawn waves",
      };
    }
    return {
      id: target.id,
      kind: target.kind,
      status: "host-managed-stop-required",
      removedFromRegistry: false,
      message: "host-managed target must be stopped through the host runtime",
    };
  }

  const pid = Number(target.pid || 0);
  if (!pid || !isPidAlive(pid)) {
    if (!dryRun) await removePidFile(target.pidFile);
    return {
      id: target.id,
      kind: target.kind,
      pid: pid || null,
      status: "stale",
      removedFromRegistry: true,
      message: "pid is not alive",
    };
  }

  if (unusedOnly && !isTargetUnused(target, { olderThanMinutes, now })) {
    return {
      id: target.id,
      kind: target.kind,
      pid,
      status: "kept-active",
      removedFromRegistry: false,
      message: `last seen newer than ${olderThanMinutes} minute threshold`,
    };
  }

  const liveStop = canStopLiveTarget(target, { platform });
  if (!liveStop.allowed) {
    return {
      id: target.id,
      kind: target.kind,
      pid,
      status: "ownership-unverified",
      removedFromRegistry: false,
      message: liveStop.message,
    };
  }

  if (dryRun) {
    return {
      id: target.id,
      kind: target.kind,
      pid,
      status: "would-stop",
      removedFromRegistry: false,
      message: "dry run",
    };
  }

  const stopped = stopProcess(pid, {
    platform,
    processTree: target.stopMode === "process-tree",
  });
  if (stopped.ok) {
    await removePidFile(target.pidFile);
    return {
      id: target.id,
      kind: target.kind,
      pid,
      status: "stopped",
      removedFromRegistry: true,
      message: stopped.message,
    };
  }

  return {
    id: target.id,
    kind: target.kind,
    pid,
    status: "stop-failed",
    removedFromRegistry: false,
    message: stopped.message,
  };
}

function isCompletedHostManagedSubagent(target = {}) {
  const status = String(target.status || "").toLowerCase();
  return target.kind === "subagent"
    && target.hostInvocationSource === "codex-spawn-agent"
    && Boolean(target.hostInvocationId)
    && HOST_MANAGED_COMPLETED_STATUSES.has(status);
}

function normalizePathForCompare(path = "") {
  return String(path || "").replace(/\\/g, "/").toLowerCase();
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

function isTargetUnused(target = {}, { olderThanMinutes = 60, now = new Date() } = {}) {
  if (!Number.isFinite(Number(olderThanMinutes)) || Number(olderThanMinutes) <= 0) return true;
  const stamp = target.lastSeenAt || target.registeredAt;
  if (!stamp) return false;
  const then = new Date(stamp).getTime();
  if (!Number.isFinite(then)) return false;
  return now.getTime() - then >= Number(olderThanMinutes) * 60_000;
}

function stopProcess(pid, { platform = process.platform, processTree = false } = {}) {
  if (platform === "win32" && processTree) {
    const result = spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
      encoding: "utf8",
      windowsHide: true,
    });
    if (result.status === 0 || !isPidAlive(pid)) {
      return { ok: true, message: "taskkill /T /F sent" };
    }
    return {
      ok: false,
      message: (result.stderr || result.stdout || `taskkill failed with status ${result.status}`).trim(),
    };
  }

  try {
    process.kill(pid, "SIGTERM");
    return { ok: true, message: "SIGTERM sent" };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}

function canStopLiveTarget(target = {}, { platform = process.platform } = {}) {
  if (target.source === "server-pid-file") {
    return {
      allowed: false,
      message: "live orphan pid file is not ownership-verified; refusing to stop",
    };
  }
  if (platform === "win32" && target.stopMode === "process-tree") {
    const ownership = verifyWindowsProcessTreeOwnership(target);
    if (!ownership.verified) {
      return {
        allowed: false,
        message: `process-tree ownership not verified: ${ownership.reason}`,
      };
    }
  }
  return { allowed: true, message: "ownership accepted" };
}

function verifyWindowsProcessTreeOwnership(target = {}) {
  if (!target.scriptPath) return { verified: false, reason: "missing scriptPath" };
  const pid = Number(target.pid || 0);
  if (!pid) return { verified: false, reason: "missing pid" };
  const command = [
    "$ErrorActionPreference = 'Stop';",
    `$p = Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}";`,
    "if ($null -eq $p) { exit 3 }",
    "$p.CommandLine",
  ].join(" ");
  const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", command], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    return {
      verified: false,
      reason: (result.stderr || result.stdout || `process lookup failed with status ${result.status}`).trim(),
    };
  }
  const commandLine = String(result.stdout || "").replace(/\s+/g, " ").trim().toLowerCase();
  const scriptPath = String(target.scriptPath || "").replace(/\\/g, "/").toLowerCase();
  const normalizedCommand = commandLine.replace(/\\/g, "/");
  if (!normalizedCommand.includes(scriptPath)) {
    return { verified: false, reason: "command line does not match registered script" };
  }
  if (!normalizedCommand.includes("--foreground")) {
    return { verified: false, reason: "registered daemon foreground marker missing" };
  }
  return { verified: true, reason: "command line matches registered daemon" };
}

async function removePidFile(path) {
  if (!path) return;
  try {
    await unlink(path);
  } catch {}
}

function removePidFileSync(path) {
  if (!path) return;
  try {
    unlinkSync(path);
  } catch {}
}
