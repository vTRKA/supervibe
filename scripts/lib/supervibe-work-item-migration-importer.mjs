import { readFile } from "node:fs/promises";
import { basename } from "node:path";

export async function importWorkItemsFromFile(path, options = {}) {
  const content = await readFile(path, "utf8");
  return importWorkItemsFromSource({ content, sourcePath: path, ...options });
}

export function importWorkItemsFromSource({ content = "", sourcePath = "inline", epicId = null, format = "auto" } = {}) {
  const detected = format === "auto" ? detectFormat(content) : format;
  const parsed = detected === "json"
    ? parseJsonTasks(content, sourcePath)
    : parseMarkdownTasks(content, sourcePath);
  const safeEpicId = epicId || slug(`import-${basename(sourcePath).replace(/\.[^.]+$/, "")}`);
  const items = [
    { itemId: safeEpicId, type: "epic", title: `Imported work from ${sourcePath}`, status: "open", source: { path: sourcePath } },
    ...parsed.tasks.map((task, index) => ({
      itemId: `${safeEpicId}-t${index + 1}`,
      type: task.type || "task",
      title: task.title,
      status: task.status || "open",
      labels: task.labels || [],
      notes: task.notes || [],
      source: task.source,
      dependencies: task.dependencies || [],
      blockedBy: task.dependencies || [],
    })),
  ];
  const graph = {
    schema_version: 1,
    epicId: safeEpicId,
    source: { type: "import", path: sourcePath, format: detected },
    items,
    tasks: items.filter((item) => item.type !== "epic").map((item) => ({
      id: item.itemId,
      title: item.title,
      goal: item.title,
      status: item.status,
      dependencies: item.dependencies,
      source: item.source,
    })),
  };
  return {
    status: "preview",
    dryRun: true,
    format: detected,
    graph,
    duplicates: detectImportedDuplicates(items),
    counts: {
      epics: 1,
      tasks: graph.tasks.length,
      blockers: graph.tasks.reduce((count, task) => count + task.dependencies.length, 0),
      notes: parsed.tasks.reduce((count, task) => count + task.notes.length, 0),
    },
  };
}

export function formatImportPreview(result = {}) {
  return [
    "SUPERVIBE_WORK_ITEM_IMPORT_PREVIEW",
    `FORMAT: ${result.format || "unknown"}`,
    `EPIC: ${result.graph?.epicId || "unknown"}`,
    `TASKS: ${result.counts?.tasks || 0}`,
    `DUPLICATES: ${result.duplicates?.length || 0}`,
  ].join("\n");
}

export function detectImportedDuplicates(items = []) {
  const byKey = new Map();
  for (const item of items.filter((entry) => entry.type !== "epic")) {
    const key = normalize(item.title);
    const group = byKey.get(key) || [];
    group.push(item.itemId);
    byKey.set(key, group);
  }
  return [...byKey.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([title, ids]) => ({ title, ids }));
}

function parseMarkdownTasks(content, sourcePath) {
  const tasks = [];
  const lines = String(content || "").split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    const checkbox = /^\s*[-*]\s+\[(?<mark>[ xX])\]\s+(?<title>.+)$/.exec(line);
    const heading = /^#{2,4}\s+(?:Task\s+\d+:\s*)?(?<title>.+)$/i.exec(line);
    const match = checkbox || heading;
    if (!match) continue;
    const title = match.groups.title.trim();
    if (!title || /^acceptance criteria:?$/i.test(title)) continue;
    tasks.push({
      title,
      status: checkbox?.groups.mark?.toLowerCase() === "x" ? "complete" : "open",
      source: { path: sourcePath, line: index + 1 },
      notes: [],
      dependencies: parseDependencies(title),
    });
  }
  return { tasks };
}

function parseJsonTasks(content, sourcePath) {
  const json = JSON.parse(content);
  const rawTasks = Array.isArray(json) ? json : json.tasks || json.items || [];
  return {
    tasks: rawTasks.map((task, index) => ({
      title: task.title || task.goal || task.id || `Imported task ${index + 1}`,
      status: task.status || "open",
      labels: task.labels || [],
      notes: task.notes || [],
      dependencies: task.dependencies || task.blockedBy || [],
      source: task.source || { path: sourcePath, line: null },
    })),
  };
}

function detectFormat(content) {
  const text = String(content || "").trim();
  return text.startsWith("{") || text.startsWith("[") ? "json" : "markdown";
}

function parseDependencies(title) {
  const match = /\bdepends on\s+([A-Za-z0-9_, -]+)/i.exec(title);
  if (!match) return [];
  return match[1].split(/[,\s]+/).map((value) => value.trim()).filter(Boolean);
}

function slug(value) {
  return String(value || "import").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "import";
}

function normalize(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
