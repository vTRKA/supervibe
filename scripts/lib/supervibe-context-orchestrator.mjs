import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { discoverSourceFiles } from "./supervibe-index-policy.mjs";
import { getHostAdapterMatrix } from "./supervibe-host-adapters.mjs";
import { buildRepoMap, selectRepoMapContext } from "./supervibe-repo-map.mjs";
import { runRetrievalPipeline } from "./supervibe-retrieval-pipeline.mjs";
import { buildProjectKnowledgeGraph, queryProjectKnowledgeGraph } from "./supervibe-project-knowledge-graph.mjs";
import { attachWorkspaceNamespace, createWorkspaceNamespace, validateWorkspaceIsolation } from "./supervibe-workspace-isolation.mjs";

export function buildOrchestratedContextPack({
  rootDir = process.cwd(),
  query = "",
  memoryResults = [],
  ragResults = [],
  graphNeighborhood = [],
  hostFiles = null,
  repoMapSelection = null,
  maxTokens = 4000,
} = {}) {
  const resolvedHostFiles = hostFiles || collectHostInstructions(rootDir);
  const workspace = createWorkspaceNamespace({ projectRoot: rootDir });
  memoryResults = attachWorkspaceNamespace(memoryResults, workspace);
  ragResults = attachWorkspaceNamespace(ragResults, workspace);
  graphNeighborhood = attachWorkspaceNamespace(graphNeighborhood, workspace);
  resolvedHostFiles.forEach((item) => {
    item.workspaceId = item.workspaceId || workspace.workspaceId;
    item.projectRoot = item.projectRoot || workspace.projectRoot;
    item.sourceKind = item.sourceKind || "host-instructions";
    item.visibility = item.visibility || "private";
  });
  const workspaceIsolation = validateWorkspaceIsolation({
    targetNamespace: workspace,
    contextItems: [...memoryResults, ...ragResults, ...graphNeighborhood, ...resolvedHostFiles],
  });
  const sources = {
    memory: source("memory", memoryResults, "project memory matching task history and decisions"),
    rag: source("rag", ragResults, "source chunks from code index"),
    codegraph: source("codegraph", graphNeighborhood, "symbol neighborhood and impact radius"),
    repoMap: source("repoMap", repoMapSelection?.selected || [], "deterministic whole-repo symbol map under token budget"),
    host: source("host", resolvedHostFiles, "host instruction files"),
  };
  const citations = [
    ...memoryResults.map((item) => citation("memory", item.file || item.path || item.id, item.summary)),
    ...ragResults.map((item) => citation("rag", `${item.path}${item.startLine ? `:${item.startLine}` : ""}`, item.text || item.summary)),
    ...graphNeighborhood.map((item) => citation("codegraph", item.path || item.symbol, item.symbol)),
    ...((repoMapSelection?.selected || []).map((item) => citation("repoMap", item.path, item.symbols?.map((symbol) => symbol.name).join(", ")))),
    ...resolvedHostFiles.map((item) => citation("host", item.path, item.summary)),
  ];
  const serialized = JSON.stringify({ query, sources, citations });
  const retrievalPipeline = runRetrievalPipeline({
    query,
    memoryCandidates: memoryResults,
    ftsCandidates: ragResults,
    embeddingCandidates: ragResults,
    repoMapCandidates: repoMapSelection?.selected || [],
    graphCandidates: graphNeighborhood,
  });
  const estimatedTokens = estimateTokens(serialized);
  return {
    schemaVersion: 1,
    query,
    generatedAt: "deterministic-local",
    sourceInventory: {
      rootDir,
      workspaceId: workspace.workspaceId,
      availableSources: Object.keys(sources),
    },
    sources,
    citations,
    freshness: Object.fromEntries(Object.entries(sources).map(([key, value]) => [key, value.status === "included" ? "fresh" : "missing"])),
    tokenBudget: {
      maxTokens,
      estimatedTokens: Math.min(estimatedTokens, maxTokens),
      overflow: estimatedTokens > maxTokens,
    },
    repoMapBudget: repoMapSelection ? {
      tier: repoMapSelection.tier,
      selected: repoMapSelection.selected.length,
      omitted: repoMapSelection.omitted.length,
      usedTokens: repoMapSelection.usedTokens,
      maxTokens: repoMapSelection.budget.repoMapTokens,
    } : null,
    retrievalPipeline,
    workspaceIsolation,
    confidence: scoreContextConfidence(sources),
    diagnostics: Object.fromEntries(Object.entries(sources).map(([key, value]) => [key, {
      status: value.status,
      reason: value.reason,
      count: value.items.length,
    }])),
  };
}

export async function buildOrchestratedContextPackFromProject({
  rootDir = process.cwd(),
  query = "",
  maxTokens = 4000,
} = {}) {
  const inventory = await discoverSourceFiles(rootDir, { explain: false });
  const repoMap = await buildRepoMap({ rootDir, tier: "standard" });
  const repoMapSelection = selectRepoMapContext(repoMap, { tier: "standard", query });
  const knowledgeGraph = await buildProjectKnowledgeGraph({ rootDir });
  const knowledgeGraphMatches = queryProjectKnowledgeGraph(knowledgeGraph, { query, includeHistory: false });
  const ragResults = inventory.files.slice(0, 5).map((file) => ({
    path: file.relPath,
    startLine: 1,
    text: `source file ${file.relPath}`,
    score: 0.5,
  }));
  const pack = buildOrchestratedContextPack({
    rootDir,
    query,
    ragResults,
    graphNeighborhood: ragResults.slice(0, 3).map((item) => ({ symbol: item.path.split("/").pop(), path: item.path, relationships: [] })),
    hostFiles: collectHostInstructions(rootDir),
    repoMapSelection,
    maxTokens,
  });
  pack.knowledgeGraph = {
    nodes: knowledgeGraph.summary.totalNodes,
    edges: knowledgeGraph.summary.totalEdges,
    matchedNodes: knowledgeGraphMatches.nodes.length,
    matchedEdges: knowledgeGraphMatches.edges.length,
  };
  return pack;
}

export function formatContextSourceDiagnostics(pack) {
  return [
    "SUPERVIBE_CONTEXT_SOURCE_DIAGNOSTICS",
    ...Object.entries(pack.diagnostics || {}).map(([sourceName, diagnostic]) => `${sourceName}: ${diagnostic.status} (${diagnostic.count}) - ${diagnostic.reason}`),
    ...(pack.repoMapBudget ? [`repoMapBudget: ${pack.repoMapBudget.usedTokens}/${pack.repoMapBudget.maxTokens} tokens selected=${pack.repoMapBudget.selected} omitted=${pack.repoMapBudget.omitted}`] : []),
    ...(pack.retrievalPipeline ? [`retrievalPipeline: ${pack.retrievalPipeline.stages.map((stage) => `${stage.name}:${stage.candidateCount}`).join(", ")}`] : []),
    ...(pack.knowledgeGraph ? [`knowledgeGraph: nodes=${pack.knowledgeGraph.nodes} edges=${pack.knowledgeGraph.edges} matched=${pack.knowledgeGraph.matchedNodes}`] : []),
    ...(pack.workspaceIsolation ? [`workspaceIsolation: pass=${pack.workspaceIsolation.pass} violations=${pack.workspaceIsolation.violations.length}`] : []),
  ].join("\n");
}

function source(name, items, includedReason) {
  return {
    name,
    status: items.length > 0 ? "included" : "skipped",
    reason: items.length > 0 ? includedReason : "no matching items",
    score: items.length > 0 ? 1 : 0,
    items,
  };
}

function citation(sourceName, path, summary = "") {
  return { source: sourceName, path, summary: String(summary || "").slice(0, 180) };
}

function collectHostInstructions(rootDir) {
  const files = [...new Set(getHostAdapterMatrix().flatMap((adapter) => adapter.instructionFiles))];
  return files
    .filter((file) => existsSync(join(rootDir, file)))
    .map((file) => {
      const content = readFileSync(join(rootDir, file), "utf8");
      return { path: file, summary: content.split(/\r?\n/).filter(Boolean).slice(0, 3).join(" ").slice(0, 240) };
    });
}

function scoreContextConfidence(sources) {
  const required = ["rag", "codegraph", "repoMap"];
  const included = required.filter((name) => sources[name]?.status === "included").length;
  return Number((included / required.length).toFixed(2));
}

function estimateTokens(text) {
  return Math.ceil(String(text || "").length / 4);
}
