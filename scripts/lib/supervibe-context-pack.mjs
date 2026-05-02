import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import matter from "gray-matter";
import { createWorkItemIndex } from "./supervibe-work-item-query.mjs";
import { curateProjectMemory } from "./supervibe-memory-curator.mjs";
import { parseSemanticAnchors } from "./supervibe-semantic-anchor-index.mjs";
import { buildWorkflowSignal } from "./autonomous-loop-context-planner.mjs";
import { createWorkflowFlowModel } from "./supervibe-workflow-flow-model.mjs";

const MEMORY_CATEGORIES = ["decisions", "patterns", "incidents", "learnings", "solutions"];

export async function buildContextPack({
  rootDir = process.cwd(),
  graphPath,
  itemId = null,
  query = "",
  memoryLimit = 6,
  evidenceLimit = 8,
  maxChars = 12_000,
  now = new Date().toISOString(),
  includeStaleMemory = false,
} = {}) {
  if (!graphPath) throw new Error("context pack requires graphPath");
  const graph = JSON.parse(await readFile(graphPath, "utf8"));
  const index = createWorkItemIndex({
    graph,
    claims: graph.claims || [],
    gates: graph.gates || [],
    evidence: graph.evidence || [],
    delegatedMessages: graph.delegatedMessages || [],
    now,
  });
  const activeItem = selectActiveItem(index, itemId);
  const dependencyIds = new Set([...(activeItem?.task?.dependencies || []), ...(activeItem?.blockedBy || [])]);
  const dependencies = index.filter((item) => dependencyIds.has(item.itemId));
  const blockers = index.filter((item) => ["blocked", "gate", "stale", "delegated"].includes(item.effectiveStatus));
  const terms = extractPackTerms(activeItem, query);
  const memoryCuration = await curateProjectMemory({ rootDir, now, rebuildSqlite: false });
  const memory = (await findRelevantMemory({
    rootDir,
    terms,
    limit: memoryLimit,
    now,
    curation: memoryCuration,
    includeHistory: includeStaleMemory,
  })).slice(0, memoryLimit);
  const evidence = collectEvidence(graph, activeItem, evidenceLimit);
  const semanticAnchors = await collectSemanticAnchors({ rootDir, activeItem, limit: 8 });
  const workflowFlow = createWorkflowFlowModel({ graph, index });
  const workflowSignal = buildWorkflowSignal(activeItem || {}, {
    signalSource: "supervibe-context-pack",
    workflowFlow,
    graphId: graph.graph_id || graph.graphId || graph.epicId || null,
    epicId: graph.graph_id || graph.graphId || graph.epicId || null,
    projectId: graph.graph_id || graph.graphId || graph.epicId || null,
    claims: graph.claims || [],
    gates: graph.gates || [],
    blockers,
    nextAction: activeItem ? `continue ${activeItem.itemId || activeItem.id}` : "select an active work item",
    triggerSignal: {
      source: "work-item-graph",
      intent: "context-pack",
    },
  });

  const pack = {
    schemaVersion: 1,
    generatedAt: now,
    graphPath,
    graphId: graph.graph_id || graph.graphId || graph.epicId || null,
    epicTitle: graph.title || null,
    activeItem,
    workflowSignal,
    flow: workflowFlow,
    dependencies,
    blockers,
    evidence,
    memory,
    semanticAnchors,
    summary: {
      totalItems: index.length,
      ready: index.filter((item) => item.effectiveStatus === "ready").length,
      blocked: blockers.length,
      done: index.filter((item) => item.effectiveStatus === "done").length,
      omittedItems: Math.max(0, index.length - 1 - dependencies.length - blockers.length),
      semanticAnchors: semanticAnchors.length,
      maxChars,
      estimatedTokens: 0,
    },
    omitted: [
      "closed sibling task bodies",
      "raw provider prompts",
      "archived memory entries",
      "full graph JSON when summarized fields are sufficient",
    ],
  };
  const markdown = trimPackMarkdown(formatContextPackMarkdown(pack), maxChars);
  pack.markdown = markdown;
  pack.summary.estimatedTokens = estimateTokens(markdown);
  return pack;
}

export function formatContextPackMarkdown(pack = {}) {
  const item = pack.activeItem || {};
  return [
    "# Supervibe Context Pack",
    "",
    `Generated: ${pack.generatedAt}`,
    `Graph: ${pack.graphId || "unknown"} (${pack.graphPath || "unknown"})`,
    `Epic: ${pack.epicTitle || "unknown"}`,
    "",
    "## Workflow Signal",
    formatWorkflowSignal(pack.workflowSignal, pack.flow),
    "",
    "## Active Work",
    `- ID: ${item.itemId || item.id || "none"}`,
    `- Status: ${item.effectiveStatus || item.status || "unknown"}`,
    `- Title: ${item.title || item.goal || "none"}`,
    `- Priority: ${item.priority || item.severity || "normal"}`,
    `- Owner: ${item.owner || item.claims?.[0]?.agentId || "unowned"}`,
    "",
    "## Acceptance",
    formatList(item.acceptanceCriteria || item.acceptance || []),
    "",
    "## Verification",
    formatList(item.verificationCommands || item.verification || []),
    "",
    "## Write Scope",
    formatList((item.writeScope || []).map((scope) => scope.path || scope)),
    "",
    "## Dependencies",
    formatList((pack.dependencies || []).map((dep) => `${dep.itemId}: ${dep.effectiveStatus} ${dep.title}`)),
    "",
    "## Current Blockers",
    formatList((pack.blockers || []).map((blocker) => `${blocker.itemId}: ${blocker.effectiveStatus} ${blocker.title}`)),
    "",
    "## Evidence",
    formatList((pack.evidence || []).map((entry) => `${entry.kind || "evidence"} ${entry.path || entry.command || entry.summary || ""}`)),
    "",
    "## Relevant Memory",
    formatList((pack.memory || []).map((entry) => `${entry.id} (${entry.category}, score=${entry.score}, ${entry.freshness}): ${entry.summary}`)),
    "",
    "## Semantic Anchors",
    formatList((pack.semanticAnchors || []).map((anchor) => `${anchor.filePath}:${anchor.startLine} ${anchor.anchorId} ${anchor.symbolName || ""} ${anchor.responsibility || ""}`)),
    "",
    "## Omitted Context",
    formatList(pack.omitted || []),
    "",
    "## Pack Metrics",
    `- Estimated tokens: ${pack.summary?.estimatedTokens ?? estimateTokens(JSON.stringify(pack))}`,
    `- Total work items: ${pack.summary?.totalItems ?? 0}`,
    `- Omitted items: ${pack.summary?.omittedItems ?? 0}`,
    "",
  ].join("\n");
}

export function selectActiveItem(index = [], itemId = null) {
  if (itemId) {
    const exact = index.find((item) => item.itemId === itemId || item.id === itemId);
    if (!exact) throw new Error(`work item not found: ${itemId}`);
    return exact;
  }
  return index.find((item) => item.type !== "epic" && item.effectiveStatus === "claimed")
    || index.find((item) => item.type !== "epic" && item.effectiveStatus === "ready")
    || index.find((item) => item.type !== "epic" && !["done", "closed", "complete"].includes(item.effectiveStatus))
    || index.find((item) => item.type !== "epic")
    || null;
}

async function findRelevantMemory({
  rootDir,
  terms,
  limit,
  now = new Date().toISOString(),
  curation = null,
  includeHistory = false,
}) {
  const memoryDir = join(rootDir, ".supervibe", "memory");
  const lifecycleById = curation?.lifecycle?.byId || {};
  const entries = [];
  for (const category of MEMORY_CATEGORIES) {
    const dir = join(memoryDir, category);
    if (!existsSync(dir)) continue;
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".md") || entry.name.startsWith("_")) continue;
      const filePath = join(dir, entry.name);
      const parsed = matter(await readFile(filePath, "utf8"));
      if (parsed.data.archivedAt) continue;
      const id = String(parsed.data.id || basename(entry.name, ".md"));
      const lifecycle = lifecycleById[id] || {};
      if (!includeHistory && (lifecycle.stale || lifecycle.contradictionIds?.length)) continue;
      const text = `${parsed.data.id || ""} ${parsed.data.tags || ""} ${parsed.content}`.toLowerCase();
      const score = scoreTerms(text, terms);
      if (score <= 0) continue;
      const fileStat = await stat(filePath);
      const ageDays = lifecycle.ageDays ?? ageInDays(fileStat.mtime.toISOString(), now);
      const freshness = lifecycle.freshness || (ageDays > 365 ? "stale" : ageDays > 90 ? "aging" : "fresh");
      const freshnessPenalty = freshness === "stale" ? 1 : 0;
      entries.push({
        id,
        category,
        file: filePath,
        score,
        effectiveScore: Math.max(0, score - freshnessPenalty),
        ageDays,
        freshness,
        stale: Boolean(lifecycle.stale),
        contradictionIds: lifecycle.contradictionIds || [],
        confidence: Number(parsed.data.confidence || 0),
        updatedAt: fileStat.mtime.toISOString(),
        summary: parsed.content.split(/\r?\n/).filter(Boolean).slice(0, 2).join(" ").slice(0, 220),
      });
    }
  }
  return entries
    .sort((a, b) => b.effectiveScore - a.effectiveScore || b.score - a.score || b.confidence - a.confidence || String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, limit);
}

function extractPackTerms(item = {}, query = "") {
  const text = [
    query,
    item?.title,
    item?.itemId,
    item?.labels?.join?.(" "),
    ...(item?.writeScope || []).map((scope) => scope.path || scope),
    ...(item?.acceptanceCriteria || []),
  ].filter(Boolean).join(" ").toLowerCase();
  return [...new Set(text.split(/[^a-z0-9а-яё_-]+/i).filter((term) => term.length >= 3))].slice(0, 40);
}

function scoreTerms(text, terms) {
  return terms.reduce((score, term) => score + (text.includes(term.toLowerCase()) ? 1 : 0), 0);
}

function collectEvidence(graph, item, limit) {
  const id = item?.itemId || item?.id;
  return (graph.evidence || [])
    .filter((entry) => !id || entry.workItemId === id || entry.taskId === id || !entry.workItemId)
    .slice(0, limit);
}

async function collectSemanticAnchors({ rootDir, activeItem, limit }) {
  const paths = [...new Set((activeItem?.writeScope || []).map((scope) => scope.path || scope).filter(Boolean))];
  const anchors = [];
  for (const relPath of paths) {
    const fullPath = join(rootDir, relPath);
    if (!existsSync(fullPath)) continue;
    try {
      anchors.push(...parseSemanticAnchors(await readFile(fullPath, "utf8"), { filePath: relPath }));
    } catch {
      // Ignore unreadable source files; write scope still remains in the pack.
    }
    if (anchors.length >= limit) break;
  }
  return anchors.slice(0, limit);
}

function formatWorkflowSignal(signal = null, flow = null) {
  if (!signal) return "- none";
  const steps = (flow?.steps || signal.flowSteps || [])
    .map((step) => `${step.label || step.id}:${step.state}${step.active ? "*" : ""}`)
    .join(" -> ");
  return [
    `- Phase: ${signal.phase || "unknown"} (${signal.phaseStatus || "unknown"})`,
    `- Hint: ${signal.phaseHint || "none"}`,
    `- Task: ${signal.taskId || "none"} / ${signal.taskStatus || "unknown"}`,
    `- Epic: ${signal.epicId || "unknown"}`,
    `- Next action: ${signal.nextAction || "none"}`,
    `- Open gates: ${signal.metrics?.openGates ?? signal.gates?.length ?? 0}`,
    `- Flow: ${steps || "none"}`,
  ].join("\n");
}

function formatList(items) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!list.length) return "- none";
  return list.map((item) => `- ${String(item)}`).join("\n");
}

function trimPackMarkdown(markdown, maxChars) {
  if (markdown.length <= maxChars) return markdown;
  return `${markdown.slice(0, Math.max(0, maxChars - 120))}\n\n## Trim Notice\n- Context pack trimmed to ${maxChars} chars. Increase --max-chars if needed.\n`;
}

export function estimateTokens(text = "") {
  return Math.ceil(String(text).length / 4);
}

function ageInDays(date, now) {
  const start = Date.parse(date || "");
  const end = Date.parse(now || "");
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}
