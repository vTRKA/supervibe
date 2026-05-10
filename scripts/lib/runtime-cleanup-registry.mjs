import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export function defaultRuntimeCleanupRegistryPath(rootDir = process.cwd()) {
  return join(rootDir, ".supervibe", "memory", "runtime-cleanup-registry.json");
}

export async function readRuntimeCleanupRegistry(path = defaultRuntimeCleanupRegistryPath()) {
  if (!existsSync(path)) {
    return { schemaVersion: 1, targets: [] };
  }
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    return {
      schemaVersion: 1,
      targets: Array.isArray(parsed.targets) ? parsed.targets : [],
    };
  } catch {
    return { schemaVersion: 1, targets: [] };
  }
}

async function writeRuntimeCleanupRegistry(path, registry) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify({
    schemaVersion: 1,
    targets: Array.isArray(registry.targets) ? registry.targets : [],
  }, null, 2)}\n`, "utf8");
}

export async function registerRuntimeCleanupTarget(target = {}, {
  path = defaultRuntimeCleanupRegistryPath(),
} = {}) {
  const registry = await readRuntimeCleanupRegistry(path);
  const id = target.id || `${target.kind || "process"}:${target.pid || target.port || Date.now()}`;
  const nextTarget = {
    id,
    kind: target.kind || "process",
    pid: Number(target.pid || 0) || null,
    port: Number(target.port || 0) || null,
    label: target.label || "",
    stopMode: target.stopMode || (target.kind === "subagent" ? "host-managed" : "sigterm"),
    registeredAt: target.registeredAt || new Date().toISOString(),
  };
  registry.targets = registry.targets.filter((item) => item.id !== id);
  registry.targets.push(nextTarget);
  await writeRuntimeCleanupRegistry(path, registry);
  return nextTarget;
}

export async function cleanupRuntimeTargets({
  path = defaultRuntimeCleanupRegistryPath(),
  dryRun = false,
} = {}) {
  const registry = await readRuntimeCleanupRegistry(path);
  const results = [];
  const kept = [];

  for (const target of registry.targets) {
    const result = cleanupTarget(target, { dryRun });
    results.push(result);
    if (!result.removedFromRegistry) kept.push(target);
  }

  if (!dryRun) {
    await writeRuntimeCleanupRegistry(path, { schemaVersion: 1, targets: kept });
  }

  return {
    schemaVersion: 1,
    dryRun,
    checked: registry.targets.length,
    stopped: results.filter((item) => item.status === "stopped").length,
    hostManaged: results.filter((item) => item.status === "host-managed-stop-required").length,
    stale: results.filter((item) => item.status === "stale").length,
    results,
  };
}

function cleanupTarget(target = {}, { dryRun = false } = {}) {
  if (target.stopMode === "host-managed" || target.kind === "subagent") {
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
    return {
      id: target.id,
      kind: target.kind,
      pid: pid || null,
      status: "stale",
      removedFromRegistry: true,
      message: "pid is not alive",
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

  try {
    process.kill(pid, "SIGTERM");
    return {
      id: target.id,
      kind: target.kind,
      pid,
      status: "stopped",
      removedFromRegistry: true,
      message: "SIGTERM sent",
    };
  } catch (error) {
    return {
      id: target.id,
      kind: target.kind,
      pid,
      status: "stop-failed",
      removedFromRegistry: false,
      message: error.message,
    };
  }
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}
