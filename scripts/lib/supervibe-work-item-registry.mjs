import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, parse, relative, resolve, sep } from "node:path";
import { createWorkItemIndex, groupWorkItemsByStatus } from "./supervibe-work-item-query.mjs";

const REGISTRY_SCHEMA_VERSION = 1;
const ACTIVE_STATUSES = new Set(["open", "ready", "claimed", "blocked", "deferred", "review"]);

export function defaultWorkItemRegistryPath(rootDir = process.cwd()) {
  return join(rootDir, ".supervibe", "memory", "work-items", "index.json");
}

export async function readWorkItemRegistry(filePath = defaultWorkItemRegistryPath()) {
  try {
    return normalizeRegistry(JSON.parse(await readFile(filePath, "utf8")));
  } catch (error) {
    if (error.code === "ENOENT") return createEmptyRegistry();
    throw error;
  }
}

async function writeWorkItemRegistry(filePath, registry) {
  await mkdir(dirname(filePath), { recursive: true });
  const normalized = normalizeRegistry(registry);
  await writeFile(filePath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}

export async function updateActiveWorkItemGraph({
  rootDir = null,
  graphPath,
  graph,
  reason = "graph-write",
  registryPath = null,
  now = new Date().toISOString(),
} = {}) {
  if (!graphPath) throw new Error("graphPath is required to update work-item registry");
  const resolvedGraphPath = resolve(graphPath);
  const resolvedRoot = resolve(rootDir || inferRootDirFromGraphPath(resolvedGraphPath));
  if (!isCanonicalWorkItemGraphPath(resolvedRoot, resolvedGraphPath)) {
    return readWorkItemRegistry(registryPath || defaultWorkItemRegistryPath(resolvedRoot));
  }
  const filePath = registryPath || defaultWorkItemRegistryPath(resolvedRoot);
  const registry = await readWorkItemRegistry(filePath);
  const summary = summarizeGraphForRegistry({ graph, graphPath: resolvedGraphPath, rootDir: resolvedRoot });
  const epics = {
    ...registry.epics,
    [summary.epicId]: {
      ...(registry.epics?.[summary.epicId] || {}),
      ...summary,
      lastActivatedAt: now,
      lastActivationReason: reason,
    },
  };
  const next = normalizeRegistry({
    ...registry,
    activeEpicId: summary.epicId,
    activeGraphPath: summary.graphPath,
    updatedAt: now,
    epics,
  });
  return writeWorkItemRegistry(filePath, next);
}

export async function resolveActiveWorkItemGraphPath({
  rootDir = process.cwd(),
  file = null,
  epicId = null,
  registryPath = null,
} = {}) {
  if (file) return resolve(rootDir, file);
  if (epicId) return join(rootDir, ".supervibe", "memory", "work-items", epicId, "graph.json");

  const filePath = registryPath || defaultWorkItemRegistryPath(rootDir);
  const registry = await readWorkItemRegistry(filePath);
  if (registry.activeGraphPath) {
    const candidate = resolve(rootDir, registry.activeGraphPath);
    if (existsSync(candidate)) return candidate;
  }

  const graphPaths = await findWorkItemGraphPaths(rootDir);
  if (graphPaths.length === 1) return graphPaths[0];
  if (graphPaths.length > 1) {
    graphPaths.sort();
    return graphPaths[graphPaths.length - 1];
  }
  return null;
}

export async function findWorkItemGraphPaths(rootDir = process.cwd()) {
  const base = join(rootDir, ".supervibe", "memory", "work-items");
  const out = [];
  if (!existsSync(base)) return out;
  async function walk(dir, depth = 0) {
    if (depth > 4) return;
    let entries = [];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full, depth + 1);
      else if (entry.name === "graph.json" || entry.name.endsWith(".work-item-graph.json")) out.push(full);
    }
  }
  await walk(base);
  return out;
}

function summarizeGraphForRegistry({ graph = {}, graphPath, rootDir = process.cwd() } = {}) {
  const index = createWorkItemIndex({ graph, claims: graph.claims || [], gates: graph.gates || [], evidence: graph.evidence || [] });
  const grouped = groupWorkItemsByStatus(index);
  const epic = (graph.items || []).find((item) => item.type === "epic");
  const epicId = graph.epicId || graph.graph_id || graph.graphId || epic?.itemId || epic?.id || "unknown-epic";
  const taskCount = index.filter((item) => item.type !== "epic").length;
  const activeCount = index.filter((item) => item.type !== "epic" && ACTIVE_STATUSES.has(String(item.effectiveStatus || item.status || "").toLowerCase())).length;
  return {
    epicId,
    graphId: graph.graph_id || graph.graphId || graph.epicId || epicId,
    title: graph.title || epic?.title || epic?.goal || epicId,
    graphPath: toProjectRelativePath(rootDir, graphPath),
    sourcePlanPath: graph.source?.path || graph.planPath || null,
    status: activeCount > 0 ? "active" : "closed",
    totalTasks: taskCount,
    ready: grouped.ready.length,
    blocked: grouped.blocked.length,
    claimed: grouped.claimed.length,
    deferred: grouped.deferred.length,
    review: grouped.review.length,
    done: grouped.done.length,
  };
}

export function inferRootDirFromGraphPath(graphPath) {
  const full = resolve(graphPath);
  const normalized = full.replace(/\\/g, "/");
  const marker = "/.supervibe/memory/work-items/";
  const index = normalized.indexOf(marker);
  if (index >= 0) return normalized.slice(0, index) || parse(full).root;
  return process.cwd();
}

function isCanonicalWorkItemGraphPath(rootDir, graphPath) {
  const root = resolve(rootDir).replace(/\\/g, "/");
  const full = resolve(graphPath).replace(/\\/g, "/");
  const canonical = `${root}/.supervibe/memory/work-items/`;
  return full.startsWith(canonical) && (full.endsWith("/graph.json") || full.endsWith(".work-item-graph.json"));
}

function createEmptyRegistry() {
  return {
    schemaVersion: REGISTRY_SCHEMA_VERSION,
    activeEpicId: null,
    activeGraphPath: null,
    updatedAt: null,
    epics: {},
  };
}

function normalizeRegistry(registry = {}) {
  return {
    schemaVersion: Number(registry.schemaVersion || REGISTRY_SCHEMA_VERSION),
    activeEpicId: registry.activeEpicId || null,
    activeGraphPath: registry.activeGraphPath || null,
    updatedAt: registry.updatedAt || null,
    epics: registry.epics && typeof registry.epics === "object" ? registry.epics : {},
  };
}

function toProjectRelativePath(rootDir, filePath) {
  if (!filePath) return null;
  return relative(resolve(rootDir), resolve(filePath)).split(sep).join("/");
}
