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
    : detected === "jsonl"
      ? parseJsonlTasks(content, sourcePath)
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
      owner: task.owner || null,
      source: task.source,
      dependencies: task.dependencies || [],
      blockedBy: task.dependencies || [],
      acceptanceCriteria: task.acceptanceCriteria || [],
      verificationCommands: task.verificationCommands || [],
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
      labels: item.labels || [],
      notes: item.notes || [],
      owner: item.owner || null,
      acceptanceCriteria: item.acceptanceCriteria || [],
      verificationCommands: item.verificationCommands || [],
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
  const rawTasks = extractRawTasks(json);
  return {
    tasks: rawTasks.map((task, index) => normalizeImportedTask(task, index, sourcePath)),
  };
}

function detectFormat(content) {
  const text = String(content || "").trim();
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length > 1 && lines.every((line) => line.startsWith("{"))) return "jsonl";
  return text.startsWith("{") || text.startsWith("[") ? "json" : "markdown";
}

function parseJsonlTasks(content, sourcePath) {
  const tasks = [];
  const lines = String(content || "").split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let record;
    try {
      record = JSON.parse(trimmed);
    } catch (error) {
      throw new SyntaxError(`Invalid JSONL record in ${sourcePath}:${index + 1}: ${error.message}`);
    }
    tasks.push(normalizeImportedTask(record, tasks.length, sourcePath, index + 1));
  }
  return { tasks };
}

function extractRawTasks(json) {
  if (Array.isArray(json)) return json;
  if (!json || typeof json !== "object") return [];
  if (Array.isArray(json.tasks)) return json.tasks;
  if (Array.isArray(json.items)) return json.items.filter((item) => item?.type !== "epic");
  if (Array.isArray(json.taskGraph?.tasks)) return json.taskGraph.tasks;
  if (Array.isArray(json.task_graph?.tasks)) return json.task_graph.tasks;
  if (Array.isArray(json.state?.tasks)) return json.state.tasks;
  if (Array.isArray(json.loop?.tasks)) return json.loop.tasks;
  return [];
}

function normalizeImportedTask(task, index, sourcePath, line = null) {
  const record = task && typeof task === "object" ? task : {};
  const legacyId = firstString(record.id, record.itemId, record.taskId, record.task_id);
  const source = normalizeSource(record.source, sourcePath, line, legacyId);
  return {
    type: record.type || "task",
    title: firstString(record.title, record.goal, record.name, legacyId, `Imported task ${index + 1}`),
    status: record.status || "open",
    labels: normalizeArray(record.labels ?? record.tags),
    notes: normalizeArray(record.notes ?? record.note),
    owner: firstString(record.owner, record.assignee, record.agent),
    dependencies: normalizeArray(record.dependencies ?? record.blockedBy ?? record.blocked_by ?? record.dependsOn ?? record.depends_on),
    acceptanceCriteria: normalizeArray(record.acceptanceCriteria ?? record.acceptance_criteria ?? record.acceptance ?? record.criteria),
    verificationCommands: normalizeArray(record.verificationCommands ?? record.verification_commands ?? record.verify ?? record.commands),
    source,
  };
}

function normalizeSource(source, sourcePath, line, legacyId) {
  const normalized = source && typeof source === "object" ? { ...source } : {};
  normalized.path ||= sourcePath;
  normalized.line ??= line;
  if (legacyId) normalized.legacyId = legacyId;
  return normalized;
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value.filter((entry) => entry !== null && entry !== undefined).map((entry) => String(entry));
  if (value === null || value === undefined || value === "") return [];
  return [String(value)];
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
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
