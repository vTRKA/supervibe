import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { applyStructuredWorkItemQuery, parseWorkItemQuery } from "./supervibe-work-item-query-language.mjs";

export const BUILT_IN_WORK_ITEM_VIEWS = Object.freeze([
  { name: "ready-now", query: "status:ready sort:priority", displayColumns: ["itemId", "title", "priority", "owner"], scope: "local" },
  { name: "blocked", query: "status:blocked sort:age", displayColumns: ["itemId", "title", "blockedReason", "owner"], scope: "local" },
  { name: "review-needed", query: "verification:review status:not-done sort:priority", displayColumns: ["itemId", "title", "verification"], scope: "local" },
  { name: "stale-claims", query: "stale:30m sort:last-activity", displayColumns: ["itemId", "owner", "lastActivity"], scope: "local" },
  { name: "due-soon", query: "due:soon sort:due", displayColumns: ["itemId", "title", "dueAt"], scope: "local" },
  { name: "overdue", query: "due:overdue sort:due", displayColumns: ["itemId", "title", "dueAt", "owner"], scope: "local" },
  { name: "high-risk", query: "risk:high status:not-done sort:priority", displayColumns: ["itemId", "title", "risk"], scope: "local" },
  { name: "release-gates", query: "verification:gate status:not-done sort:priority", displayColumns: ["itemId", "title", "verification"], scope: "release" },
  { name: "my-work", query: "owner:me status:not-done sort:priority", displayColumns: ["itemId", "title", "status", "dueAt"], scope: "local" },
  { name: "unowned-work", query: "owner:unowned status:not-done sort:priority", displayColumns: ["itemId", "title", "status"], scope: "local" },
  { name: "cross-repo-blockers", query: "status:blocked sort:blocker-count", displayColumns: ["itemId", "title", "repo", "blockedReason"], scope: "cross-repo" },
]);

export function defaultSavedViewsPath(rootDir = process.cwd()) {
  return join(rootDir, ".claude", "memory", "work-item-views.json");
}

export function createSavedViewStore({ customViews = [], updatedAt = "deterministic-local" } = {}) {
  return {
    schemaVersion: 1,
    updatedAt,
    views: customViews.map(normalizeCustomView),
  };
}

export async function readSavedViewStore(path = defaultSavedViewsPath()) {
  try {
    return normalizeStore(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if (error.code === "ENOENT") return createSavedViewStore();
    throw error;
  }
}

export async function writeSavedViewStore(path, store) {
  await mkdir(dirname(path), { recursive: true });
  const normalized = normalizeStore(store);
  await writeFile(path, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return { path, store: normalized };
}

export function listSavedViews(store = createSavedViewStore()) {
  const custom = normalizeStore(store).views;
  const customNames = new Set(custom.map((view) => view.name));
  return [
    ...BUILT_IN_WORK_ITEM_VIEWS.filter((view) => !customNames.has(view.name)).map((view) => ({ ...view, builtIn: true })),
    ...custom.map((view) => ({ ...view, builtIn: false })),
  ];
}

export function saveCustomView(store = createSavedViewStore(), view = {}) {
  const normalized = normalizeCustomView(view);
  const next = normalizeStore(store);
  next.views = next.views.filter((candidate) => candidate.name !== normalized.name);
  next.views.push(normalized);
  next.updatedAt = normalized.updatedAt;
  return next;
}

export function resolveSavedView(name, store = createSavedViewStore()) {
  const view = listSavedViews(store).find((candidate) => candidate.name === name);
  if (!view) throw new Error(`Unknown saved view: ${name}`);
  return {
    ...view,
    parsed: parseWorkItemQuery(view.query),
  };
}

export function applySavedView(index = [], name, store = createSavedViewStore(), options = {}) {
  const view = resolveSavedView(name, store);
  const result = applyStructuredWorkItemQuery(index, view.parsed, options);
  return { view, ...result };
}

export function suggestSavedViews(question = "") {
  const text = String(question || "").toLowerCase();
  if (/broad|status|overview|что.*делать|next|summary/.test(text)) return ["ready-now", "blocked", "review-needed", "due-soon"];
  if (/risk|release/.test(text)) return ["high-risk", "release-gates", "overdue"];
  if (/owner|my|unowned/.test(text)) return ["my-work", "unowned-work"];
  return ["ready-now", "blocked"];
}

export function exportSavedViewsForSyncBundle(store = createSavedViewStore()) {
  return {
    schemaVersion: 1,
    portable: true,
    views: listSavedViews(store).map((view) => ({
      name: view.name,
      query: view.query,
      displayColumns: view.displayColumns || [],
      owner: view.owner || null,
      scope: view.scope || "local",
      builtIn: Boolean(view.builtIn),
    })),
  };
}

export function savedViewsToPaletteActions(store = createSavedViewStore(), { graphPath = ".claude/memory/work-items/<epic-id>/graph.json" } = {}) {
  return listSavedViews(store).map((view) => ({
    id: `view:${view.name}`,
    label: `View ${view.name}`,
    command: `/supervibe-status --view ${view.name} --file ${graphPath}`,
    mutates: false,
    enabled: true,
  }));
}

export function formatSavedViewResult(result = {}) {
  const viewName = result.view?.name || "custom-query";
  const lines = [
    "SUPERVIBE_WORK_ITEM_VIEW",
    `VIEW: ${viewName}`,
    `MATCHED: ${result.summary?.matched ?? result.items?.length ?? 0}/${result.summary?.total ?? 0}`,
  ];
  for (const item of result.items || []) {
    lines.push(`- ${item.itemId || item.id}: ${item.effectiveStatus || item.status || "unknown"} ${item.title || item.goal || ""}`);
  }
  return lines.join("\n");
}

function normalizeStore(store = {}) {
  return {
    schemaVersion: store.schemaVersion || 1,
    updatedAt: store.updatedAt || "deterministic-local",
    views: (store.views || []).map(normalizeCustomView),
  };
}

function normalizeCustomView(view = {}) {
  const name = String(view.name || "").trim();
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(name)) {
    throw new Error("saved view name must be 1-64 safe characters");
  }
  const query = String(view.query || view.filter || "").trim();
  if (!query) throw new Error("saved view requires a query");
  return {
    name,
    query,
    displayColumns: Array.isArray(view.displayColumns) ? view.displayColumns : Array.isArray(view.columns) ? view.columns : ["itemId", "title", "status"],
    owner: view.owner || null,
    scope: view.scope || "local",
    createdAt: view.createdAt || "deterministic-local",
    updatedAt: view.updatedAt || new Date().toISOString(),
  };
}
