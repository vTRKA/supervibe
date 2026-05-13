import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, parse, relative, resolve, sep } from "node:path";
import { createWorkItemIndex, groupWorkItemsByStatus } from "./supervibe-work-item-query.mjs";

const REGISTRY_SCHEMA_VERSION = 1;
const ACTIVE_STATUSES = new Set(["open", "ready", "claimed", "blocked", "deferred", "review"]);
const TERMINAL_EPIC_STATUSES = new Set(["closed", "complete", "completed", "done", "skipped", "cancelled"]);

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

export function validateWorkItemRegistryIntegrity({
  rootDir = process.cwd(),
  registry = null,
  registryPath = null,
} = {}) {
  const resolvedRoot = resolve(rootDir);
  const filePath = registryPath || defaultWorkItemRegistryPath(resolvedRoot);
  const normalized = normalizeRegistry(registry || readRegistrySync(filePath));
  const issues = [];
  const epics = normalized.epics && typeof normalized.epics === "object" ? normalized.epics : {};
  const activeEpicIds = [];

  if (normalized.activeEpicId && !epics[normalized.activeEpicId]) {
    issues.push(registryIssue("active-epic-missing", normalized.activeEpicId, `activeEpicId is not present in epics: ${normalized.activeEpicId}`));
  }
  if (normalized.activeGraphPath) {
    const activeGraphPath = resolveRegistryPath(resolvedRoot, normalized.activeGraphPath);
    if (!existsSync(activeGraphPath)) {
      issues.push(registryIssue("active-graph-missing", normalized.activeEpicId, `activeGraphPath is missing: ${toProjectRelativePath(resolvedRoot, activeGraphPath)}`));
    }
  }

  for (const [epicId, epic] of Object.entries(epics)) {
    const status = String(epic.status || "").toLowerCase();
    if (status === "active") activeEpicIds.push(epicId);
    if (!epic.graphPath) {
      issues.push(registryIssue("missing-graph-path", epicId, `Epic ${epicId} is missing graphPath.`));
      continue;
    }
    const graphPath = resolveRegistryPath(resolvedRoot, epic.graphPath);
    if (!existsSync(graphPath)) {
      issues.push(registryIssue("missing-graph-file", epicId, `Epic ${epicId} graph file is missing: ${toProjectRelativePath(resolvedRoot, graphPath)}`));
      continue;
    }

    let graph = null;
    try {
      graph = JSON.parse(readFileSync(graphPath, "utf8"));
    } catch (error) {
      issues.push(registryIssue("unreadable-graph-file", epicId, `Epic ${epicId} graph file cannot be read: ${error.message}`));
      continue;
    }
    const summary = summarizeGraphForRegistry({ graph, graphPath, rootDir: resolvedRoot });
    if (status && summary.status !== status) {
      issues.push(registryIssue("stale-epic-status", epicId, `Epic ${epicId} registry status is ${status}, graph summary is ${summary.status}.`));
    }
    const sourcePlanPath = epic.sourcePlanPath || graph.source?.path || graph.planPath || null;
    const snapshotPath = graph.source?.snapshotPath || graph.metadata?.sourcePlanSnapshot?.storedPath || null;
    const sourceExists = sourcePlanPath ? existsSync(resolveRegistryPath(resolvedRoot, sourcePlanPath)) : false;
    const snapshotExists = snapshotPath ? existsSync(resolve(dirname(graphPath), snapshotPath)) : false;
    if (!sourceExists && !snapshotExists) {
      issues.push(registryIssue("missing-source-provenance", epicId, `Epic ${epicId} has no existing source plan or source snapshot.`));
    }
  }

  if (activeEpicIds.length > 1) {
    issues.push(registryIssue("multiple-active-epics", null, `Registry has multiple active epics: ${activeEpicIds.join(", ")}`));
  }
  if (normalized.activeEpicId && epics[normalized.activeEpicId]) {
    const active = epics[normalized.activeEpicId];
    if (active.graphPath && normalized.activeGraphPath) {
      const expected = toProjectRelativePath(resolvedRoot, resolveRegistryPath(resolvedRoot, active.graphPath));
      const actual = toProjectRelativePath(resolvedRoot, resolveRegistryPath(resolvedRoot, normalized.activeGraphPath));
      if (expected !== actual) {
        issues.push(registryIssue("active-graph-mismatch", normalized.activeEpicId, `activeGraphPath ${actual} does not match active epic graphPath ${expected}.`));
      }
    }
    if (String(active.status || "").toLowerCase() === "closed") {
      issues.push(registryIssue("active-epic-closed", normalized.activeEpicId, `activeEpicId points to a closed epic: ${normalized.activeEpicId}`));
    }
  }

  return {
    pass: issues.length === 0,
    registryPath: toProjectRelativePath(resolvedRoot, filePath),
    activeEpicId: normalized.activeEpicId,
    epicCount: Object.keys(epics).length,
    issues,
  };
}

export async function repairWorkItemRegistryIntegrity({
  rootDir = process.cwd(),
  registryPath = null,
  now = new Date().toISOString(),
} = {}) {
  const resolvedRoot = resolve(rootDir);
  const filePath = registryPath || defaultWorkItemRegistryPath(resolvedRoot);
  const before = validateWorkItemRegistryIntegrity({ rootDir: resolvedRoot, registryPath: filePath });
  const registry = await readWorkItemRegistry(filePath);
  const nextEpics = {};
  const activeCandidates = [];

  for (const [epicId, epic] of Object.entries(registry.epics || {})) {
    if (!epic.graphPath) continue;
    const graphPath = resolveRegistryPath(resolvedRoot, epic.graphPath);
    if (!existsSync(graphPath)) continue;
    let graph = null;
    try {
      graph = JSON.parse(readFileSync(graphPath, "utf8"));
    } catch {
      continue;
    }
    const summary = summarizeGraphForRegistry({ graph, graphPath, rootDir: resolvedRoot });
    nextEpics[epicId] = {
      ...epic,
      ...summary,
      repairedAt: now,
    };
    if (summary.status === "active") activeCandidates.push(nextEpics[epicId]);
  }

  const active = activeCandidates.length === 1 ? activeCandidates[0] : null;
  const repaired = await writeWorkItemRegistry(filePath, {
    ...registry,
    activeEpicId: active?.epicId || null,
    activeGraphPath: active?.graphPath || null,
    epics: nextEpics,
    updatedAt: now,
  });
  const after = validateWorkItemRegistryIntegrity({ rootDir: resolvedRoot, registry: repaired, registryPath: filePath });
  return { before, after, registry: repaired };
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

  const resolution = await resolveActiveWorkItemGraph({ rootDir, registryPath });
  return resolution.status === "active" ? resolution.graphPath : null;
}

export async function resolveActiveWorkItemGraph({
  rootDir = process.cwd(),
  registryPath = null,
} = {}) {
  const filePath = registryPath || defaultWorkItemRegistryPath(rootDir);
  const registry = await readWorkItemRegistry(filePath);
  if (registry.activeGraphPath) {
    const candidate = resolve(rootDir, registry.activeGraphPath);
    if (existsSync(candidate)) {
      return {
        status: "active",
        graphPath: candidate,
        epicId: registry.activeEpicId,
        source: "registry",
        candidates: [candidate],
        registry,
      };
    }
  }

  const graphPaths = await findWorkItemGraphPaths(rootDir);
  if (graphPaths.length === 1) {
    return {
      status: "active",
      graphPath: graphPaths[0],
      epicId: null,
      source: "single-discovered-graph",
      candidates: graphPaths,
      registry,
    };
  }
  if (graphPaths.length > 1) {
    graphPaths.sort();
    return {
      status: "ambiguous",
      graphPath: null,
      epicId: null,
      source: "discovered-graphs",
      candidates: graphPaths,
      registry,
      nextAction: "pass --file <graph.json> or --epic <epic-id>",
    };
  }
  return {
    status: "none",
    graphPath: null,
    epicId: null,
    source: "none",
    candidates: [],
    registry,
    nextAction: "atomize a reviewed plan into a work graph",
  };
}

export async function listWorkItemGraphSummaries(rootDir = process.cwd()) {
  const graphPaths = await findWorkItemGraphPaths(rootDir);
  const summaries = [];
  for (const graphPath of graphPaths) {
    try {
      const graph = JSON.parse(await readFile(graphPath, "utf8"));
      summaries.push(summarizeGraphForRegistry({ graph, graphPath, rootDir }));
    } catch (error) {
      summaries.push({
        epicId: "unreadable",
        graphPath: toProjectRelativePath(rootDir, graphPath),
        status: "error",
        error: error.message,
      });
    }
  }
  return summaries.sort((a, b) => String(a.graphPath).localeCompare(String(b.graphPath)));
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
  const epicStatus = String(epic?.status || graph.status || "").toLowerCase();
  const registryStatus = TERMINAL_EPIC_STATUSES.has(epicStatus)
    ? "closed"
    : epicStatus
      ? "active"
      : activeCount > 0 ? "active" : "closed";
  return {
    epicId,
    graphId: graph.graph_id || graph.graphId || graph.epicId || epicId,
    title: graph.title || epic?.title || epic?.goal || epicId,
    graphPath: toProjectRelativePath(rootDir, graphPath),
    sourcePlanPath: graph.source?.path || graph.planPath || null,
    status: registryStatus,
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

function readRegistrySync(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return createEmptyRegistry();
    throw error;
  }
}

function resolveRegistryPath(rootDir, filePath) {
  if (!filePath) return rootDir;
  return resolve(rootDir, filePath);
}

function toProjectRelativePath(rootDir, filePath) {
  if (!filePath) return null;
  return relative(resolve(rootDir), resolve(filePath)).split(sep).join("/");
}

function registryIssue(code, epicId, message, extra = {}) {
  return { code, epicId: epicId || null, message, ...extra };
}
