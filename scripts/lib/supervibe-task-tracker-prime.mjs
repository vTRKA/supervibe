import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { calculateReadyFront } from "./autonomous-loop-ready-front.mjs";
import { createTaskGraph } from "./autonomous-loop-task-graph.mjs";
import { defaultTrackerMappingPath, readTrackerMapping, summarizeTrackerMappingForBundle } from "./supervibe-task-tracker-sync.mjs";

const READY_STATUSES = new Set(["open", "ready"]);
const CLAIMED_STATUSES = new Set(["claimed", "in_progress", "running"]);
const BLOCKED_STATUSES = new Set(["blocked", "waiting", "policy_stopped", "budget_stopped", "command_adapter_required"]);
const DONE_STATUSES = new Set(["complete", "completed", "done", "closed", "skipped", "cancelled", "canceled"]);

export async function createTaskTrackerPrimeSummary({ rootDir = process.cwd(), limit = 5 } = {}) {
  const graphPaths = await findWorkItemGraphs(rootDir);
  const graphs = [];
  for (const graphPath of graphPaths) {
    try {
      graphs.push({ path: graphPath, graph: JSON.parse(await readFile(graphPath, "utf8")) });
    } catch {
      // Ignore malformed graph files during hook prime; explicit status commands surface them.
    }
  }

  const mapping = await safeReadMapping(rootDir);
  const epics = graphs.map(({ path, graph }) => summarizeGraph({ graph, path, limit })).filter(Boolean);
  const totals = epics.reduce((acc, epic) => {
    acc.ready += epic.ready.length;
    acc.claimed += epic.claimed.length;
    acc.blocked += epic.blocked.length;
    acc.done += epic.done;
    acc.total += epic.total;
    return acc;
  }, { ready: 0, claimed: 0, blocked: 0, done: 0, total: 0 });

  return {
    active: epics.length > 0 && totals.total > 0,
    graphCount: epics.length,
    totals,
    epics,
    mapping: mapping ? summarizeTrackerMappingForBundle(mapping) : null,
    nextAction: nextActionFor({ epics, totals, mapping }),
  };
}

export function formatTaskTrackerPrimeReminder(summary = {}) {
  if (!summary.active) return null;
  const lines = [
    "<system-reminder>",
    "[supervibe] task tracker prime: active work context is available.",
    `Graphs: ${summary.graphCount}; ready=${summary.totals.ready}; claimed=${summary.totals.claimed}; blocked=${summary.totals.blocked}; done=${summary.totals.done}/${summary.totals.total}.`,
  ];
  if (summary.mapping) {
    lines.push(`Tracker mapping: ${summary.mapping.status || "unknown"} via ${summary.mapping.adapterId || "native-json"}; mapped=${summary.mapping.mapped}; unmapped=${summary.mapping.unmapped}.`);
  }
  for (const epic of summary.epics.slice(0, 3)) {
    lines.push(`Epic ${epic.epicId}: ${epic.title || "untitled"}; next=${epic.next?.title || epic.next?.itemId || "none"}.`);
    for (const item of epic.ready.slice(0, 3)) lines.push(`  ready: ${item.itemId} - ${item.title}`);
    for (const item of epic.claimed.slice(0, 2)) lines.push(`  claimed: ${item.itemId} - ${item.title}${item.owner ? ` (${item.owner})` : ""}`);
    for (const item of epic.blocked.slice(0, 2)) lines.push(`  blocked: ${item.itemId} - ${item.title}`);
  }
  lines.push(`Next action: ${summary.nextAction}`);
  lines.push("</system-reminder>");
  return lines.join("\n");
}

export function formatTaskTrackerPrimeHookOutput(summary = {}) {
  const reminder = formatTaskTrackerPrimeReminder(summary);
  if (!reminder) return {};
  return {
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: reminder,
    },
  };
}

async function findWorkItemGraphs(rootDir) {
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
      else if (entry.name === "graph.json") out.push(full);
    }
  }
  await walk(base);
  return out;
}

async function safeReadMapping(rootDir) {
  try {
    return await readTrackerMapping(defaultTrackerMappingPath(rootDir));
  } catch {
    return null;
  }
}

function summarizeGraph({ graph, path, limit }) {
  const items = graph.items || graph.tasks || [];
  if (items.length === 0) return null;
  const normalized = items.map((item, index) => normalizeItem(item, index));
  const ready = selectReady(graph, normalized).slice(0, limit);
  const claimed = normalized.filter((item) => CLAIMED_STATUSES.has(item.status)).slice(0, limit);
  const blocked = normalized.filter((item) => BLOCKED_STATUSES.has(item.status)).slice(0, limit);
  const done = normalized.filter((item) => DONE_STATUSES.has(item.status)).length;
  const epic = normalized.find((item) => item.type === "epic");
  return {
    epicId: graph.epicId || graph.graph_id || epic?.itemId || path,
    title: epic?.title || graph.title || null,
    path,
    total: normalized.length,
    done,
    ready,
    claimed,
    blocked,
    next: ready[0] || claimed[0] || blocked[0] || null,
  };
}

function normalizeItem(item = {}, index = 0) {
  return {
    itemId: item.itemId || item.id || `item-${index + 1}`,
    type: item.type || "task",
    title: sanitizeTitle(item.title || item.goal || item.id || item.itemId || `item-${index + 1}`),
    status: normalizeStatus(item.effectiveStatus || item.status || "open"),
    dependencies: item.dependencies || [],
    owner: item.owner || item.agentId || null,
    sourceOrder: item.sourceOrder ?? index,
  };
}

function selectReady(graph, items) {
  if (graph.tasks?.length) {
    const front = calculateReadyFront(createTaskGraph({
      graph_id: graph.graph_id || graph.epicId || "graph",
      tasks: graph.tasks,
    }), { maxPolicyRiskLevel: "high", reviewersAvailable: true });
    const readyIds = new Set((front.ready || []).map((task) => task.id));
    return items.filter((item) => readyIds.has(item.itemId));
  }
  return items.filter((item) => item.type !== "epic" && READY_STATUSES.has(item.status));
}

function normalizeStatus(value) {
  return String(value || "open").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function sanitizeTitle(value) {
  return String(value).replace(/token|secret|password|credential/gi, "[redacted]").slice(0, 120);
}

function nextActionFor({ epics = [], totals = {}, mapping = null } = {}) {
  if (!mapping || mapping.status === "new") return "run tracker sync after atomization or continue with native graph fallback";
  if (totals.ready > 0) return "claim the top ready work item before editing";
  if (totals.claimed > 0) return "continue claimed work or release stale claims";
  if (totals.blocked > 0) return "resolve blockers before dispatching more agents";
  if (epics.length > 0) return "all visible work is closed or waiting for review";
  return "no active work graph";
}
