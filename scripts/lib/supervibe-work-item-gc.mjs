import { cp, mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { createWorkItemIndex, groupWorkItemsByStatus } from "./supervibe-work-item-query.mjs";
import { isTerminalWorkItemStatus } from "./supervibe-work-item-actions.mjs";

export async function scanWorkItemGc({
  rootDir = process.cwd(),
  retentionDays = 14,
  staleOpenDays = 90,
  includeStaleOpen = false,
  now = new Date().toISOString(),
} = {}) {
  const workItemsDir = join(rootDir, ".claude", "memory", "work-items");
  const graphPaths = await findGraphFiles(workItemsDir);
  const candidates = [];
  const active = [];

  for (const graphPath of graphPaths) {
    if (graphPath.split(/[\\/]/).includes(".archive")) continue;
    const graph = JSON.parse(await readFile(graphPath, "utf8"));
    const fileStat = await stat(graphPath);
    const classification = classifyWorkItemGraphForGc(graph, {
      graphPath,
      retentionDays,
      staleOpenDays,
      includeStaleOpen,
      now,
      fileMtime: fileStat.mtime.toISOString(),
    });
    if (classification.archiveCandidate) candidates.push(classification);
    else active.push(classification);
  }

  return {
    rootDir,
    workItemsDir,
    retentionDays,
    staleOpenDays,
    includeStaleOpen,
    now,
    candidates,
    active,
    summary: {
      scanned: graphPaths.length,
      candidates: candidates.length,
      active: active.length,
    },
  };
}

export function classifyWorkItemGraphForGc(graph = {}, {
  graphPath = "",
  retentionDays = 14,
  staleOpenDays = 90,
  includeStaleOpen = false,
  now = new Date().toISOString(),
  fileMtime = null,
} = {}) {
  const index = createWorkItemIndex({ graph, now });
  const grouped = groupWorkItemsByStatus(index);
  const children = index.filter((item) => item.type !== "epic");
  const terminalChildren = children.filter((item) => isTerminalWorkItemStatus(item.effectiveStatus || item.status));
  const hasOpenChildren = children.some((item) => !isTerminalWorkItemStatus(item.effectiveStatus || item.status));
  const referenceDate = latestActivityDate(graph, fileMtime);
  const ageDays = ageInDays(referenceDate, now);
  const alreadyArchived = Boolean(graph.metadata?.archivedAt || graph.archivedAt);
  let archiveCandidate = false;
  let reason = "active";

  if (alreadyArchived) {
    archiveCandidate = true;
    reason = "already-marked-archived";
  } else if (children.length > 0 && terminalChildren.length === children.length && ageDays >= Number(retentionDays)) {
    archiveCandidate = true;
    reason = "completed-retention";
  } else if (includeStaleOpen && hasOpenChildren && ageDays >= Number(staleOpenDays)) {
    archiveCandidate = true;
    reason = "stale-open-explicit";
  }

  return {
    graphPath,
    graphId: graph.graph_id || graph.graphId || graph.epicId || basename(dirname(graphPath)),
    title: graph.title || "Untitled epic",
    archiveCandidate,
    reason,
    ageDays,
    referenceDate,
    counts: {
      total: index.length,
      children: children.length,
      ready: grouped.ready.length,
      blocked: grouped.blocked.length,
      claimed: grouped.claimed.length,
      review: grouped.review.length,
      done: grouped.done.length,
      open: children.length - terminalChildren.length,
    },
  };
}

export async function archiveWorkItemGcCandidates(scan, {
  rootDir = scan.rootDir || process.cwd(),
  dryRun = true,
  archiveRoot = join(rootDir, ".claude", "memory", "work-items", ".archive"),
  now = scan.now || new Date().toISOString(),
} = {}) {
  const results = [];
  for (const candidate of scan.candidates || []) {
    results.push(await archiveWorkItemGraph(candidate, { archiveRoot, dryRun, now }));
  }
  return {
    dryRun,
    archiveRoot,
    archived: results.filter((result) => result.status === "archived").length,
    previewed: results.filter((result) => result.status === "preview").length,
    results,
  };
}

export async function archiveWorkItemGraph(candidate, { archiveRoot, dryRun = true, now = new Date().toISOString() } = {}) {
  const sourceDir = dirname(candidate.graphPath);
  const archiveDir = join(archiveRoot, `${candidate.graphId}-${safeTimestamp(now)}`);
  const result = {
    graphId: candidate.graphId,
    graphPath: candidate.graphPath,
    sourceDir,
    archiveDir,
    reason: candidate.reason,
    dryRun,
    status: dryRun ? "preview" : "archived",
  };
  if (dryRun) return result;

  await mkdir(archiveRoot, { recursive: true });
  await mkdir(dirname(archiveDir), { recursive: true });
  try {
    await rename(sourceDir, archiveDir);
  } catch (err) {
    if (err.code !== "EXDEV") throw err;
    await cp(sourceDir, archiveDir, { recursive: true, force: true });
    throw new Error("Cross-device work-item archive copy completed but source removal is intentionally manual.");
  }
  await appendArchiveLog(archiveRoot, {
    type: "work-item-graph",
    graphId: candidate.graphId,
    archivedAt: now,
    reason: candidate.reason,
    originalPath: sourceDir,
    archivePath: archiveDir,
  });
  return result;
}

export async function restoreWorkItemGraph({ rootDir = process.cwd(), graphId }) {
  if (!graphId) throw new Error("restore requires graphId");
  const archiveRoot = join(rootDir, ".claude", "memory", "work-items", ".archive");
  const logEntries = await readArchiveLog(archiveRoot);
  const logged = [...logEntries]
    .reverse()
    .find((entry) => entry.type === "work-item-graph" && String(entry.graphId) === String(graphId) && existsSync(entry.archivePath));
  const fallback = logged || await findArchivedGraphByPrefix(archiveRoot, graphId);
  if (!fallback) throw new Error(`archived work-item graph not found: ${graphId}`);

  const archivePath = fallback.archivePath || fallback.archiveDir;
  const restorePath = fallback.originalPath || join(rootDir, ".claude", "memory", "work-items", String(graphId));
  if (existsSync(restorePath)) throw new Error(`restore target already exists: ${restorePath}`);
  await mkdir(dirname(restorePath), { recursive: true });
  await rename(archivePath, restorePath);
  await appendArchiveLog(archiveRoot, {
    type: "work-item-graph-restore",
    graphId,
    restoredAt: new Date().toISOString(),
    archivePath,
    restorePath,
  });
  return { graphId, archivePath, restorePath, restored: true };
}

export function formatWorkItemGcReport(scan, archiveResult = null) {
  const lines = [
    "SUPERVIBE_WORK_ITEM_GC",
    `SCANNED: ${scan.summary?.scanned || 0}`,
    `CANDIDATES: ${scan.summary?.candidates || 0}`,
    `ACTIVE: ${scan.summary?.active || 0}`,
    `RETENTION_DAYS: ${scan.retentionDays}`,
    `STALE_OPEN_DAYS: ${scan.staleOpenDays}`,
  ];
  for (const candidate of scan.candidates || []) {
    lines.push(`- ${candidate.graphId}: ${candidate.reason} age=${candidate.ageDays}d done=${candidate.counts.done}/${candidate.counts.children} path=${candidate.graphPath}`);
  }
  if (archiveResult) {
    lines.push(`APPLY: ${archiveResult.dryRun ? "dry-run" : "written"}`);
    for (const result of archiveResult.results || []) {
      lines.push(`  ${result.status}: ${result.graphId} -> ${result.archiveDir}`);
    }
  } else {
    lines.push("NEXT: re-run with --apply to archive candidates.");
  }
  return lines.join("\n");
}

async function findGraphFiles(workItemsDir) {
  const out = [];
  if (!existsSync(workItemsDir)) return out;
  for (const entry of await readdir(workItemsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === ".archive") continue;
    const graphPath = join(workItemsDir, entry.name, "graph.json");
    if (existsSync(graphPath)) out.push(graphPath);
  }
  return out;
}

function latestActivityDate(graph, fallback) {
  const explicitDates = [
    graph.updatedAt,
    graph.completedAt,
    graph.closedAt,
    graph.metadata?.updatedAt,
    graph.metadata?.createdAt,
    ...(graph.items || []).flatMap((item) => [item.updatedAt, item.closedAt, item.completedAt, item.createdAt]),
    ...(graph.tasks || []).flatMap((task) => [task.updatedAt, task.closedAt, task.completedAt, task.createdAt]),
  ].map((value) => Date.parse(value || "")).filter(Number.isFinite);
  if (explicitDates.length) return new Date(Math.max(...explicitDates)).toISOString();
  const fallbackMs = Date.parse(fallback || "");
  return Number.isFinite(fallbackMs) ? new Date(fallbackMs).toISOString() : new Date().toISOString();
}

function ageInDays(date, now) {
  const start = Date.parse(date || "");
  const end = Date.parse(now || "");
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

async function appendArchiveLog(archiveRoot, entry) {
  await mkdir(archiveRoot, { recursive: true });
  const logPath = join(archiveRoot, "_archive-log.jsonl");
  const previous = existsSync(logPath) ? await readFile(logPath, "utf8") : "";
  await writeFile(logPath, `${previous}${JSON.stringify(entry)}\n`, "utf8");
}

async function readArchiveLog(archiveRoot) {
  const logPath = join(archiveRoot, "_archive-log.jsonl");
  if (!existsSync(logPath)) return [];
  const lines = (await readFile(logPath, "utf8")).split(/\r?\n/).filter(Boolean);
  return lines.flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
}

async function findArchivedGraphByPrefix(archiveRoot, graphId) {
  if (!existsSync(archiveRoot)) return null;
  const matches = [];
  for (const entry of await readdir(archiveRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === ".archive") continue;
    if (entry.name === graphId || entry.name.startsWith(`${graphId}-`)) {
      matches.push({ graphId, archivePath: join(archiveRoot, entry.name), originalPath: null });
    }
  }
  matches.sort((a, b) => String(b.archivePath).localeCompare(String(a.archivePath)));
  return matches[0] || null;
}

function safeTimestamp(value) {
  return new Date(Date.parse(value) || Date.now()).toISOString().replace(/[:.]/g, "-");
}
