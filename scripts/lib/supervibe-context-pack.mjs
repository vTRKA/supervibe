import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import matter from "gray-matter";
import { createWorkItemIndex } from "./supervibe-work-item-query.mjs";
import { curateProjectMemory } from "./supervibe-memory-curator.mjs";
import { parseSemanticAnchors } from "./supervibe-semantic-anchor-index.mjs";
import { extractFileLocalContracts } from "./supervibe-file-local-contracts.mjs";
import { buildWorkflowSignal } from "./autonomous-loop-context-planner.mjs";
import { createWorkflowFlowModel } from "./supervibe-workflow-flow-model.mjs";
import { buildCleanupReachability } from "./supervibe-cleanup-reachability.mjs";

const MEMORY_CATEGORIES = ["decisions", "patterns", "incidents", "learnings", "solutions"];
const DEFAULT_CONTEXT_PACK_TOKEN_SLO = Object.freeze({
  warningRatio: 0.7,
  hardRatio: 1.0,
});
const DEFAULT_SUBAGENT_HYDRATION_MAX_TOKENS = 1_200;
const DEFAULT_CONTEXT_PACK_SECTION_RATIOS = Object.freeze({
  workflow: 0.45,
  retrieval: 0.25,
  sourcePointers: 0.2,
  metrics: 0.1,
});
const TERMINAL_WORK_ITEM_STATUSES = new Set(["done", "closed", "complete", "completed", "verified", "skipped", "cancelled", "canceled"]);

export async function buildContextPack({
  rootDir = process.cwd(),
  graphPath,
  itemId = null,
  query = "",
  memoryLimit = 6,
  evidenceLimit = 8,
  maxChars = 12_000,
  maxTokens = Math.ceil(maxChars / 4),
  subagentHydrationMaxTokens = Math.min(DEFAULT_SUBAGENT_HYDRATION_MAX_TOKENS, maxTokens),
  tokenWarningRatio = DEFAULT_CONTEXT_PACK_TOKEN_SLO.warningRatio,
  tokenHardRatio = DEFAULT_CONTEXT_PACK_TOKEN_SLO.hardRatio,
  now = new Date().toISOString(),
  includeStaleMemory = false,
  includeHistory = false,
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
  const cleanupReachability = buildCleanupReachability({ rootDir, now });
  const rawEvidence = collectEvidence(graph, activeItem, evidenceLimit);
  const evidence = filterCleanupContextItems(rawEvidence, { includeHistory, reachability: cleanupReachability });
  const semanticAnchors = await collectSemanticAnchors({ rootDir, activeItem, limit: 8 });
  const fileLocalContracts = await collectFileLocalContracts({ rootDir, activeItem, semanticAnchors, limit: 8 });
  const workflowFlow = createWorkflowFlowModel({ graph, index });
  const workflowSignal = buildWorkflowSignal(activeItem || {}, {
    signalSource: "supervibe-context-pack",
    workflowFlow,
    graphId: graph.graph_id || graph.graphId || graph.epicId || null,
    workGraphId: graph.graph_id || graph.graphId || graph.epicId || null,
    epicId: graph.graph_id || graph.graphId || graph.epicId || null,
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
    cleanupLifecycle: {
      includeHistory,
      summary: cleanupReachability.summary,
      hiddenEvidence: rawEvidence.length - evidence.length,
    },
    semanticAnchors,
    fileLocalContracts,
    summary: {
      totalItems: index.length,
      ready: index.filter((item) => item.effectiveStatus === "ready").length,
      blocked: blockers.length,
      done: index.filter((item) => item.effectiveStatus === "done").length,
      omittedItems: Math.max(0, index.length - 1 - dependencies.length - blockers.length),
      semanticAnchors: semanticAnchors.length,
      fileLocalContracts: fileLocalContracts.length,
      cleanupLifecycleHiddenEvidence: rawEvidence.length - evidence.length,
      cleanupLifecycleCold: cleanupReachability.summary?.cold || 0,
      cleanupLifecycleTrash: cleanupReachability.summary?.trash || 0,
      maxChars,
      estimatedTokens: 0,
      tokenBudget: null,
      subagentHydrationTokens: 0,
      subagentHydrationBudget: null,
    },
    omitted: [
      "closed sibling task bodies",
      "raw provider prompts",
      "archived memory entries",
      includeHistory ? null : "cold/trash/unclassified cleanup lifecycle artifacts",
      "full graph JSON when summarized fields are sufficient",
    ],
  };
  let markdown = trimPackMarkdown(formatContextPackMarkdown(pack), maxChars);
  pack.summary.estimatedTokens = estimateTokens(markdown);
  pack.summary.tokenBudget = evaluateContextPackTokenSlo({
    estimatedTokens: pack.summary.estimatedTokens,
    maxTokens,
    warningRatio: tokenWarningRatio,
    hardRatio: tokenHardRatio,
  });
  pack.contextBudget = evaluateContextPackBudget({
    pack,
    maxTokens,
    warningRatio: tokenWarningRatio,
    hardRatio: tokenHardRatio,
  });
  pack.subagentHydration = buildSubagentHydrationPack(pack, {
    maxTokens: subagentHydrationMaxTokens,
    warningRatio: tokenWarningRatio,
    hardRatio: tokenHardRatio,
  });
  pack.summary.subagentHydrationTokens = pack.subagentHydration.tokenBudget.estimatedTokens;
  pack.summary.subagentHydrationBudget = pack.subagentHydration.tokenBudget;
  markdown = trimPackMarkdown(formatContextPackMarkdown(pack), maxChars);
  pack.markdown = markdown;
  pack.summary.estimatedTokens = estimateTokens(markdown);
  pack.summary.tokenBudget = evaluateContextPackTokenSlo({
    estimatedTokens: pack.summary.estimatedTokens,
    maxTokens,
    warningRatio: tokenWarningRatio,
    hardRatio: tokenHardRatio,
  });
  pack.contextBudget = evaluateContextPackBudget({
    pack,
    maxTokens,
    warningRatio: tokenWarningRatio,
    hardRatio: tokenHardRatio,
  });
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
    formatList((pack.blockers || []).map((blocker) => {
      const reason = blocker.blockerReason || blocker.blockReason || blocker.dependencyBlockers?.join(",") || "blocked";
      const nextAction = blocker.blockerNextAction || `inspect ${blocker.itemId || blocker.id}`;
      return `${blocker.itemId}: ${blocker.effectiveStatus} ${blocker.title} reason=${reason} next=${nextAction}`;
    })),
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
    "## File-Local Contracts",
    formatList((pack.fileLocalContracts || []).map((contract) => `${contract.filePath}:${contract.startLine} ${contract.contractId} ${contract.purpose} invariants=${formatInlineList(contract.invariants)} forbidden=${formatInlineList(contract.forbiddenChanges)}`)),
    "",
    "## Omitted Context",
    formatList(pack.omitted || []),
    "",
    "## Subagent Hydration",
    `- Status: ${pack.subagentHydration?.tokenBudget?.status || "unknown"} (${pack.subagentHydration?.tokenBudget?.estimatedTokens ?? 0}/${pack.subagentHydration?.tokenBudget?.maxTokens ?? "unknown"})`,
    `- Workflow only: ${pack.subagentHydration?.scope?.workflowOnly === true}`,
    `- Retrieval omitted: ${formatInlineList(pack.subagentHydration?.scope?.omittedSources || [])}`,
    "",
    "## Pack Metrics",
    `- Estimated tokens: ${pack.summary?.estimatedTokens ?? estimateTokens(JSON.stringify(pack))}`,
    `- Token budget: ${pack.summary?.tokenBudget?.status || "unknown"} (${pack.summary?.tokenBudget?.estimatedTokens ?? pack.summary?.estimatedTokens ?? 0}/${pack.summary?.tokenBudget?.maxTokens ?? "unknown"})`,
    `- Context budget: ${pack.contextBudget?.status || "unknown"}; workflow=${pack.contextBudget?.sections?.workflow?.estimatedTokens ?? 0}, retrieval=${pack.contextBudget?.sections?.retrieval?.estimatedTokens ?? 0}, source-pointers=${pack.contextBudget?.sections?.sourcePointers?.estimatedTokens ?? 0}`,
    `- Total work items: ${pack.summary?.totalItems ?? 0}`,
    `- Omitted items: ${pack.summary?.omittedItems ?? 0}`,
    `- Cleanup-hidden evidence: ${pack.summary?.cleanupLifecycleHiddenEvidence ?? 0}`,
    "",
  ].join("\n");
}


export function buildSubagentHydrationPack(pack = {}, {
  maxTokens = DEFAULT_SUBAGENT_HYDRATION_MAX_TOKENS,
  warningRatio = DEFAULT_CONTEXT_PACK_TOKEN_SLO.warningRatio,
  hardRatio = DEFAULT_CONTEXT_PACK_TOKEN_SLO.hardRatio,
} = {}) {
  const item = pack.activeItem || {};
  const sourcePointers = {
    semanticAnchors: (pack.semanticAnchors || []).map((anchor) => ({
      filePath: anchor.filePath,
      startLine: anchor.startLine,
      anchorId: anchor.anchorId,
      symbolName: anchor.symbolName || "",
      responsibility: anchor.responsibility || "",
    })),
    fileLocalContracts: (pack.fileLocalContracts || []).map((contract) => ({
      filePath: contract.filePath,
      startLine: contract.startLine,
      contractId: contract.contractId,
      purpose: contract.purpose,
      invariants: contract.invariants || [],
      forbiddenChanges: contract.forbiddenChanges || [],
    })),
  };
  const hydration = {
    schemaVersion: 1,
    kind: "subagent-hydration-pack",
    generatedAt: pack.generatedAt || new Date().toISOString(),
    graphId: pack.graphId || null,
    taskId: item.itemId || item.id || null,
    scope: {
      workflowOnly: true,
      retrievalSeparated: true,
      sourcePointersSeparated: true,
      omittedSources: [
        "project memory summaries",
        "raw evidence entries",
        "index diagnostics",
        "closed sibling task bodies",
      ],
    },
    workflowSignal: pack.workflowSignal || null,
    task: {
      id: item.itemId || item.id || null,
      status: item.effectiveStatus || item.status || "unknown",
      title: item.title || item.goal || "none",
      priority: item.priority || item.severity || "normal",
      owner: item.owner || item.claims?.[0]?.agentId || "unowned",
      acceptance: item.acceptanceCriteria || item.acceptance || [],
      verification: item.verificationCommands || item.verification || [],
      writeScope: (item.writeScope || []).map((scope) => scope.path || scope),
    },
    dependencies: (pack.dependencies || []).map((dep) => ({
      id: dep.itemId || dep.id,
      status: dep.effectiveStatus || dep.status || "unknown",
      title: dep.title || dep.goal || "",
    })),
    blockers: (pack.blockers || []).map((blocker) => ({
      id: blocker.itemId || blocker.id,
      status: blocker.effectiveStatus || blocker.status || "unknown",
      title: blocker.title || blocker.goal || "",
      reason: blocker.blockerReason || blocker.blockReason || blocker.dependencyBlockers?.join(",") || "blocked",
      nextAction: blocker.blockerNextAction || `inspect ${blocker.itemId || blocker.id}`,
    })),
    sourcePointers,
    nextAction: pack.workflowSignal?.nextAction || (item.itemId ? `continue ${item.itemId}` : "select an active work item"),
  };
  hydration.markdown = trimPackMarkdown(formatSubagentHydrationMarkdown(hydration), Math.max(0, Number(maxTokens || 0) * 4));
  hydration.tokenBudget = evaluateContextPackTokenSlo({
    estimatedTokens: estimateTokens(hydration.markdown),
    maxTokens,
    warningRatio,
    hardRatio,
  });
  return hydration;
}

export function evaluateContextPackBudget({
  pack = {},
  maxTokens = 3_000,
  warningRatio = DEFAULT_CONTEXT_PACK_TOKEN_SLO.warningRatio,
  hardRatio = DEFAULT_CONTEXT_PACK_TOKEN_SLO.hardRatio,
  sectionRatios = DEFAULT_CONTEXT_PACK_SECTION_RATIOS,
} = {}) {
  const sections = {
    workflow: formatContextBudgetWorkflowSection(pack),
    retrieval: [
      "## Evidence",
      formatList((pack.evidence || []).map((entry) => `${entry.kind || "evidence"} ${entry.path || entry.command || entry.summary || ""}`)),
      "",
      "## Relevant Memory",
      formatList((pack.memory || []).map((entry) => `${entry.id} (${entry.category}, score=${entry.score}, ${entry.freshness}): ${entry.summary}`)),
      "",
    ].join("\n"),
    sourcePointers: [
      "## Semantic Anchors",
      formatList((pack.semanticAnchors || []).map((anchor) => `${anchor.filePath}:${anchor.startLine} ${anchor.anchorId} ${anchor.symbolName || ""} ${anchor.responsibility || ""}`)),
      "",
      "## File-Local Contracts",
      formatList((pack.fileLocalContracts || []).map((contract) => `${contract.filePath}:${contract.startLine} ${contract.contractId} ${contract.purpose} invariants=${formatInlineList(contract.invariants)} forbidden=${formatInlineList(contract.forbiddenChanges)}`)),
      "",
    ].join("\n"),
    metrics: [
      "## Omitted Context",
      formatList(pack.omitted || []),
      "",
      "## Pack Metrics",
      `- Estimated tokens: ${pack.summary?.estimatedTokens ?? 0}`,
      `- Token budget: ${pack.summary?.tokenBudget?.status || "unknown"}`,
      "",
    ].join("\n"),
  };
  const evaluatedSections = Object.fromEntries(Object.entries(sections).map(([name, markdown]) => {
    const estimatedTokens = estimateTokens(markdown);
    const sectionMaxTokens = Math.max(1, Math.floor(Number(maxTokens || 0) * Number(sectionRatios[name] || 0)));
    return [name, {
      estimatedTokens,
      maxTokens: sectionMaxTokens,
      pressure: Number((estimatedTokens / sectionMaxTokens).toFixed(3)),
      pass: estimatedTokens <= sectionMaxTokens,
    }];
  }));
  const totalTokens = Object.values(evaluatedSections).reduce((sum, section) => sum + section.estimatedTokens, 0);
  const tokenBudget = evaluateContextPackTokenSlo({
    estimatedTokens: totalTokens,
    maxTokens,
    warningRatio,
    hardRatio,
  });
  return {
    status: tokenBudget.status,
    pass: tokenBudget.pass && evaluatedSections.workflow.pass,
    maxTokens: Number(maxTokens || 0),
    estimatedTokens: totalTokens,
    pressure: tokenBudget.pressure,
    sections: evaluatedSections,
    separation: {
      workflowExcludesRetrieval: true,
      retrievalExcludesWorkflow: true,
      sourcePointersSeparate: true,
    },
    nextAction: tokenBudget.pass && evaluatedSections.workflow.pass
      ? "execute"
      : "split context or lower retrieval limits before multi-agent handoff",
  };
}

export function filterCleanupContextItems(items = [], { includeHistory = false, reachability = null } = {}) {
  if (includeHistory) return [...items];
  const byPath = reachability?.byPath instanceof Map
    ? reachability.byPath
    : new Map((reachability?.inventory || []).map((item) => [item.relPath, item]));
  return (items || []).filter((item) => {
    const relPath = normalizeContextPath(item?.path || item?.file || item?.relPath || item?.sourcePath || "");
    if (!relPath) return true;
    const lifecycleClass = byPath.get(relPath)?.lifecycleClass || inferContextLifecycleClass(relPath);
    return !["cold", "trash", "unclassified"].includes(lifecycleClass);
  });
}

function inferContextLifecycleClass(relPath) {
  const normalized = normalizeContextPath(relPath);
  if (!normalized.startsWith(".supervibe/")) return "hot";
  if (normalized.includes("/.archive/") || normalized.includes("/_archive/")) return "cold";
  if (/\.(?:bak|tmp|log)$/i.test(normalized)) return "trash";
  if (normalized.includes("workflow-receipts-stale")) return "trash";
  return "hot";
}

function normalizeContextPath(value = "") {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "");
}
export function selectActiveItem(index = [], itemId = null) {
  if (itemId) {
    const exact = index.find((item) => item.itemId === itemId || item.id === itemId);
    if (!exact) throw new Error(`work item not found: ${itemId}`);
    if (isTerminalWorkItem(exact)) throw new Error(`context pack cannot select terminal work item: ${itemId}`);
    return exact;
  }
  const activeCandidates = index.filter((item) => item.type !== "epic" && !isTerminalWorkItem(item));
  return activeCandidates.find((item) => item.effectiveStatus === "claimed")
    || activeCandidates.find((item) => item.effectiveStatus === "ready")
    || activeCandidates.find((item) => !["blocked", "gate", "stale", "delegated"].includes(item.effectiveStatus))
    || activeCandidates[0]
    || null;
}

export function isTerminalWorkItem(item = {}) {
  const statuses = [
    item.effectiveStatus,
    item.status,
    item.task?.status,
    item.lifecycle,
  ].map((status) => String(status || "").toLowerCase());
  return statuses.some((status) => TERMINAL_WORK_ITEM_STATUSES.has(status));
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

async function collectFileLocalContracts({ rootDir, activeItem, semanticAnchors = [], limit }) {
  const paths = [...new Set((activeItem?.writeScope || []).map((scope) => scope.path || scope).filter(Boolean))];
  const contracts = [];
  for (const relPath of paths) {
    const fullPath = join(rootDir, relPath);
    if (!existsSync(fullPath)) continue;
    try {
      contracts.push(...extractFileLocalContracts(await readFile(fullPath, "utf8"), {
        filePath: relPath,
        anchors: semanticAnchors,
      }));
    } catch {
      // Ignore unreadable source files; write scope remains visible.
    }
    if (contracts.length >= limit) break;
  }
  return contracts.slice(0, limit);
}

function formatSubagentHydrationMarkdown(hydration = {}) {
  const sourcePointers = [
    ...(hydration.sourcePointers?.semanticAnchors || []).map((anchor) => `${anchor.filePath}:${anchor.startLine} ${anchor.anchorId} ${anchor.symbolName} ${anchor.responsibility}`),
    ...(hydration.sourcePointers?.fileLocalContracts || []).map((contract) => `${contract.filePath}:${contract.startLine} ${contract.contractId} ${contract.purpose}`),
  ];
  return [
    "# Subagent Hydration Pack",
    "",
    "Generated: " + (hydration.generatedAt || "unknown"),
    "Task: " + (hydration.taskId || "none"),
    "Graph: " + (hydration.graphId || "unknown"),
    "",
    "## Workflow Signal",
    formatWorkflowSignal(hydration.workflowSignal),
    "",
    "## Task Contract",
    "- ID: " + (hydration.task?.id || "none"),
    "- Status: " + (hydration.task?.status || "unknown"),
    "- Title: " + (hydration.task?.title || "none"),
    "- Priority: " + (hydration.task?.priority || "normal"),
    "- Owner: " + (hydration.task?.owner || "unowned"),
    "",
    "## Acceptance",
    formatList(hydration.task?.acceptance || []),
    "",
    "## Verification",
    formatList(hydration.task?.verification || []),
    "",
    "## Write Scope",
    formatList(hydration.task?.writeScope || []),
    "",
    "## Dependencies",
    formatList((hydration.dependencies || []).map((dep) => `${dep.id}: ${dep.status} ${dep.title}`)),
    "",
    "## Current Blockers",
    formatList((hydration.blockers || []).map((blocker) => `${blocker.id}: ${blocker.status} ${blocker.title} reason=${blocker.reason} next=${blocker.nextAction}`)),
    "",
    "## Source Pointers",
    formatList(sourcePointers),
    "",
    "## Omitted Retrieval",
    formatList(hydration.scope?.omittedSources || []),
    "",
    "## Next Action",
    "- " + (hydration.nextAction || "execute"),
    "",
  ].join("\n");
}

function formatContextBudgetWorkflowSection(pack = {}) {
  const item = pack.activeItem || {};
  return [
    "## Workflow Signal",
    formatWorkflowSignal(pack.workflowSignal, pack.flow),
    "",
    "## Active Work",
    "- ID: " + (item.itemId || item.id || "none"),
    "- Status: " + (item.effectiveStatus || item.status || "unknown"),
    "- Title: " + (item.title || item.goal || "none"),
    "- Priority: " + (item.priority || item.severity || "normal"),
    "- Owner: " + (item.owner || item.claims?.[0]?.agentId || "unowned"),
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
    formatList((pack.dependencies || []).map((dep) => `${dep.itemId || dep.id}: ${dep.effectiveStatus || dep.status || "unknown"} ${dep.title || dep.goal || ""}`)),
    "",
    "## Current Blockers",
    formatList((pack.blockers || []).map((blocker) => {
      const reason = blocker.blockerReason || blocker.blockReason || blocker.dependencyBlockers?.join(",") || "blocked";
      const nextAction = blocker.blockerNextAction || `inspect ${blocker.itemId || blocker.id}`;
      return `${blocker.itemId || blocker.id}: ${blocker.effectiveStatus || blocker.status || "unknown"} ${blocker.title || blocker.goal || ""} reason=${reason} next=${nextAction}`;
    })),
    "",
  ].join("\n");
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

function formatInlineList(items) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  return list.length ? list.join(";") : "none";
}

function trimPackMarkdown(markdown, maxChars) {
  if (markdown.length <= maxChars) return markdown;
  return `${markdown.slice(0, Math.max(0, maxChars - 120))}\n\n## Trim Notice\n- Context pack trimmed to ${maxChars} chars. Increase --max-chars if needed.\n`;
}

export function estimateTokens(text = "") {
  return Math.ceil(String(text).length / 4);
}

export function evaluateContextPackTokenSlo({
  estimatedTokens = 0,
  maxTokens = 3_000,
  warningRatio = DEFAULT_CONTEXT_PACK_TOKEN_SLO.warningRatio,
  hardRatio = DEFAULT_CONTEXT_PACK_TOKEN_SLO.hardRatio,
} = {}) {
  const pressure = maxTokens > 0 ? Number(estimatedTokens) / Number(maxTokens) : 1;
  const status = pressure >= hardRatio ? "over_budget" : pressure >= warningRatio ? "warning" : "ok";
  return {
    status,
    pass: status !== "over_budget",
    estimatedTokens: Number(estimatedTokens || 0),
    maxTokens: Number(maxTokens || 0),
    pressure: Number(pressure.toFixed(3)),
    warningRatio,
    hardRatio,
    nextAction: status === "over_budget"
      ? "reduce memory/evidence limits or split context before agent handoff"
      : status === "warning"
        ? "keep memory and evidence limits tight"
        : "execute",
  };
}

function ageInDays(date, now) {
  const start = Date.parse(date || "");
  const end = Date.parse(now || "");
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}
