import { CodeStore } from "./code-store.mjs";
import { impactRadius, neighborhood, searchSymbols } from "./code-graph-queries.mjs";
import { runRetrievalPipeline } from "./supervibe-retrieval-pipeline.mjs";

export async function buildCodeGraphContext({
  rootDir = process.cwd(),
  query = "",
  symbol = "",
  limit = 8,
  graphDepth = 1,
  impactDepth = 2,
  includeImpact = true,
  useEmbeddings = true,
  maxChars = 14_000,
  taskType = inferCodeGraphTaskType(query || symbol || ""),
} = {}) {
  const store = new CodeStore(rootDir, { useEmbeddings });
  await store.init();
  try {
    const searchQuery = String(query || symbol || "").trim();
    const ragChunks = searchQuery
      ? await store.search({ query: searchQuery, limit, semantic: useEmbeddings })
      : [];
    const entrySymbols = searchQuery
      ? searchSymbols(store.db, searchQuery, { limit })
      : [];
    const seedNames = selectSeedNames({ symbol, ragChunks, entrySymbols, query: searchQuery }).slice(0, 6);
    const graphEvidence = [];
    for (const seed of seedNames) {
      for (const row of neighborhood(store.db, seed, { depth: graphDepth }).slice(0, limit)) {
        graphEvidence.push({ seed, ...row });
      }
    }
    const dedupedGraph = dedupeBy(graphEvidence, (row) => row.id).slice(0, limit * 3);
    const impact = includeImpact && seedNames[0]
      ? impactRadius(store.db, seedNames[0], { depth: impactDepth, limit: limit * 4 })
      : { roots: [], nodes: [], edges: [] };
    const relatedFiles = collectRelatedFiles({ ragChunks, entrySymbols, graphEvidence: dedupedGraph, impact });
    const semanticAnchors = collectSemanticAnchors(store.db, relatedFiles, searchQuery).slice(0, limit);
    const retrievalPipeline = runRetrievalPipeline({
      query: searchQuery,
      ftsCandidates: ragChunks.map((row) => ({ id: `${row.file}:${row.startLine}`, path: row.file, score: row.score })),
      embeddingCandidates: useEmbeddings ? ragChunks.map((row) => ({ id: `${row.file}:${row.startLine}:semantic`, path: row.file, score: row.semantic || row.score })) : [],
      exactSymbolCandidates: entrySymbols.map((row) => ({ id: row.id, symbol: row.name, path: row.path, score: row.score / 100 || 0.9 })),
      repoMapCandidates: relatedFiles.map((path, index) => ({ path, rank: relatedFiles.length - index })),
      graphCandidates: dedupedGraph.map((row) => ({ symbol: row.name, path: row.path, score: 0.8 })),
    });
    const graphHealth = store.getGraphHealthMetrics();
    const quality = buildContextQuality({ retrievalPipeline, graphHealth, semanticAnchors, relatedFiles });
    const taskTypeGate = evaluateCodeGraphTaskTypeGate({
      taskType,
      quality,
      graphHealth,
      stats: {
        ragChunks: ragChunks.length,
        entrySymbols: entrySymbols.length,
        graphNodes: dedupedGraph.length,
        impactNodes: impact.nodes.length,
      },
    });
    const context = {
      schemaVersion: 1,
      query: searchQuery,
      seedNames,
      ragChunks,
      entrySymbols,
      graphEvidence: dedupedGraph,
      impact,
      relatedFiles,
      semanticAnchors,
      retrievalPipeline,
      graphHealth,
      quality,
      taskTypeGate,
      stats: {
        ragChunks: ragChunks.length,
        entrySymbols: entrySymbols.length,
        graphNodes: dedupedGraph.length,
        impactNodes: impact.nodes.length,
        relatedFiles: relatedFiles.length,
        semanticAnchors: semanticAnchors.length,
      },
    };
    context.markdown = trimMarkdown(formatCodeGraphContextMarkdown(context), maxChars);
    return context;
  } finally {
    store.close();
  }
}

function formatCodeGraphContextMarkdown(context = {}) {
  return [
    "# Supervibe CodeGraph Context",
    "",
    `Query: ${context.query || "none"}`,
    `Seeds: ${(context.seedNames || []).join(", ") || "none"}`,
    "",
    "## RAG Entry Chunks",
    formatRagChunks(context.ragChunks || []),
    "",
    "## Entry Symbols",
    formatSymbols(context.entrySymbols || []),
    "",
    "## Graph Neighborhood",
    formatGraphRows(context.graphEvidence || []),
    "",
    "## Impact Radius",
    formatGraphRows((context.impact?.nodes || []).filter((row) => row.distance > 0)),
    "",
    "## Related Files",
    formatList(context.relatedFiles || []),
    "",
    "## Semantic Anchors",
    formatList((context.semanticAnchors || []).map((anchor) => `${anchor.path}:${anchor.startLine} ${anchor.anchorId} ${anchor.symbolName || ""} ${anchor.responsibility || ""}`)),
    "",
    "## Retrieval Quality",
    formatRetrievalQuality(context.retrievalPipeline),
    "",
    "## Graph Quality Gates",
    formatGraphQuality(context.quality),
    "",
    "## Task-Type Graph Gate",
    formatTaskTypeGate(context.taskTypeGate),
    "",
    "## Metrics",
    formatList([
      `ragChunks=${context.stats?.ragChunks || 0}`,
      `entrySymbols=${context.stats?.entrySymbols || 0}`,
      `graphNodes=${context.stats?.graphNodes || 0}`,
      `impactNodes=${context.stats?.impactNodes || 0}`,
      `relatedFiles=${context.stats?.relatedFiles || 0}`,
    ]),
    "",
  ].join("\n");
}

function selectSeedNames({ symbol, ragChunks, entrySymbols, query }) {
  const seeds = [];
  if (symbol) seeds.push(symbol);
  for (const sym of entrySymbols || []) seeds.push(sym.name);
  for (const chunk of ragChunks || []) {
    if (chunk.name) seeds.push(chunk.name);
  }
  for (const token of String(query || "").match(/\b[A-Za-z_$][A-Za-z0-9_$]{2,}\b/g) || []) {
    if (/[A-Z_]/.test(token) || /^use[A-Z0-9_]/.test(token)) seeds.push(token);
  }
  return [...new Set(seeds)].filter(Boolean);
}

function buildContextQuality({ retrievalPipeline, graphHealth, semanticAnchors, relatedFiles }) {
  const failures = [];
  const warnings = [];
  const requiredStages = ["rewrite", "exact-symbol", "fts", "embedding", "repo-map", "graph-neighbor", "dedupe", "rerank"];
  const stages = new Set((retrievalPipeline?.stages || []).map((stageItem) => stageItem.name));
  for (const stageName of requiredStages) {
    if (!stages.has(stageName)) failures.push(`missing retrieval stage: ${stageName}`);
  }
  if (!retrievalPipeline?.fallback?.reason) failures.push("missing fallback reason");
  if ((graphHealth?.sourceFileSymbolCoverage?.generatedIndexedFiles || 0) > 0) {
    failures.push("generated files indexed in graph context");
  }
  if ((graphHealth?.symbolNameQuality?.minifiedTopSymbols || []).length > 0) {
    failures.push("minified symbols appear in top graph symbols");
  }
  if ((graphHealth?.sourceFileSymbolCoverage?.files || 0) >= 5 && (graphHealth?.sourceFileSymbolCoverage?.coverage || 0) < 0.2) {
    warnings.push("low symbol coverage for indexed files");
  }
  if ((graphHealth?.crossResolvedEdges?.total || 0) >= 20 && (graphHealth?.crossResolvedEdges?.rate || 0) < 0.05) {
    warnings.push("low cross-file edge resolution");
  }
  if ((semanticAnchors || []).length === 0 && (relatedFiles || []).length > 0) {
    warnings.push("no semantic anchors found for related files");
  }
  return {
    pass: failures.length === 0,
    failures,
    warnings,
    stageCount: retrievalPipeline?.stages?.length || 0,
    selectedCount: retrievalPipeline?.selected?.length || 0,
    fallbackReason: retrievalPipeline?.fallback?.reason || "",
    symbolCoverage: graphHealth?.sourceFileSymbolCoverage?.coverage ?? null,
    edgeResolutionRate: graphHealth?.crossResolvedEdges?.rate ?? null,
  };
}

export function evaluateCodeGraphTaskTypeGate({
  taskType = "feature",
  quality = {},
  graphHealth = {},
  stats = {},
} = {}) {
  const normalized = normalizeTaskType(taskType);
  const failures = [];
  const warnings = [...(quality.warnings || [])];
  const symbolCoverage = Number(quality.symbolCoverage ?? graphHealth?.sourceFileSymbolCoverage?.coverage ?? 0);
  const edgeResolution = Number(quality.edgeResolutionRate ?? graphHealth?.crossResolvedEdges?.rate ?? 0);
  const hasGraphEvidence = Number(stats.graphNodes || 0) > 0 || Number(stats.impactNodes || 0) > 0;
  const hasSourceEvidence = Number(stats.ragChunks || 0) > 0 || Number(stats.entrySymbols || 0) > 0;

  if (["refactor", "rename", "move", "delete", "extract", "public-api"].includes(normalized)) {
    if (!quality.pass) failures.push("base graph context quality failed");
    if (!hasGraphEvidence) failures.push("structural task requires graph neighborhood or impact evidence");
    if (symbolCoverage < 0.2) failures.push("structural task requires >=20% symbol coverage");
    if ((graphHealth?.crossResolvedEdges?.total || 0) >= 20 && edgeResolution < 0.05) failures.push("structural task requires >=5% cross-file edge resolution");
  } else if (["debug", "feature"].includes(normalized)) {
    if (!hasSourceEvidence) failures.push("task requires source RAG or symbol evidence");
    if (!hasGraphEvidence) warnings.push("graph evidence missing; keep changes localized until graph context is available");
  } else if (normalized === "docs") {
    if (!hasSourceEvidence && !hasGraphEvidence) warnings.push("docs task has no code evidence; acceptable only for text-only docs");
  }

  return {
    taskType: normalized,
    pass: failures.length === 0,
    failures,
    warnings,
    requirements: requirementsForTaskType(normalized),
    metrics: {
      symbolCoverage,
      edgeResolution,
      graphNodes: Number(stats.graphNodes || 0),
      impactNodes: Number(stats.impactNodes || 0),
      ragChunks: Number(stats.ragChunks || 0),
      entrySymbols: Number(stats.entrySymbols || 0),
    },
  };
}

function collectRelatedFiles({ ragChunks, entrySymbols, graphEvidence, impact }) {
  const files = new Set();
  for (const row of ragChunks || []) files.add(row.file);
  for (const row of entrySymbols || []) files.add(row.path);
  for (const row of graphEvidence || []) files.add(row.path);
  for (const row of impact?.nodes || []) files.add(row.path);
  return [...files].filter(Boolean).sort();
}

function collectSemanticAnchors(db, files, query) {
  const rows = [];
  const byFile = db.prepare(`
    SELECT anchor_id AS anchorId, path, symbol_name AS symbolName, responsibility,
           start_line AS startLine, end_line AS endLine
    FROM code_semantic_anchors
    WHERE path = ?
    ORDER BY start_line
  `);
  const terms = new Set(String(query || "").toLowerCase().split(/[^a-z0-9_$-]+/).filter((term) => term.length >= 3));
  for (const file of files || []) rows.push(...byFile.all(file));
  return rows
    .map((row) => ({ ...row, score: scoreAnchor(row, terms) }))
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path) || a.startLine - b.startLine);
}

function scoreAnchor(anchor, terms) {
  const text = `${anchor.anchorId} ${anchor.symbolName || ""} ${anchor.responsibility || ""}`.toLowerCase();
  let score = 0;
  for (const term of terms) if (text.includes(term)) score++;
  return score;
}

function formatRagChunks(rows) {
  if (!rows.length) return "- none";
  return rows.map((row) => [
    `- ${row.file}:${row.startLine}-${row.endLine} [${row.kind}${row.name ? `: ${row.name}` : ""}] score=${Number(row.score || 0).toFixed(3)}`,
    `  ${String(row.snippet || "").split("\n").slice(0, 3).join("\n  ")}`,
  ].join("\n")).join("\n");
}

function formatSymbols(rows) {
  if (!rows.length) return "- none";
  return rows.map((row) => `- ${row.path}:${row.startLine} [${row.kind}: ${row.name}] score=${Number(row.score || 0).toFixed(0)}`).join("\n");
}

function formatGraphRows(rows) {
  if (!rows.length) return "- none";
  return rows.map((row) => `- d=${row.distance ?? 0} ${row.path}:${row.startLine} [${row.kind}: ${row.name}] via=${row.via || row.seed || "graph"}`).join("\n");
}

function formatList(items) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return "- none";
  return list.map((item) => `- ${item}`).join("\n");
}

function formatRetrievalQuality(pipeline = {}) {
  const stages = (pipeline.stages || [])
    .map((stageItem) => `${stageItem.name}:${stageItem.candidateCount}`)
    .join(", ") || "none";
  return formatList([
    `pass=${Boolean(pipeline.pass)}`,
    `rewrittenQuery=${pipeline.rewrittenQuery || pipeline.query || "none"}`,
    `stages=${stages}`,
    `selected=${pipeline.selected?.length || 0}`,
    `fallback=${pipeline.fallback?.used ? "used" : "not-used"} (${pipeline.fallback?.reason || "none"})`,
  ]);
}

function formatGraphQuality(quality = {}) {
  return formatList([
    `pass=${Boolean(quality.pass)}`,
    `failures=${quality.failures?.join("; ") || "none"}`,
    `warnings=${quality.warnings?.join("; ") || "none"}`,
    `symbolCoverage=${formatPercent(quality.symbolCoverage)}`,
    `edgeResolution=${formatPercent(quality.edgeResolutionRate)}`,
  ]);
}

function formatTaskTypeGate(gate = {}) {
  return formatList([
    `taskType=${gate.taskType || "unknown"}`,
    `pass=${Boolean(gate.pass)}`,
    `requirements=${(gate.requirements || []).join("; ") || "none"}`,
    `failures=${gate.failures?.join("; ") || "none"}`,
    `warnings=${gate.warnings?.join("; ") || "none"}`,
  ]);
}

function formatPercent(value) {
  return Number.isFinite(Number(value)) ? `${(Number(value) * 100).toFixed(1)}%` : "unknown";
}

function dedupeBy(items, keyFn) {
  const seen = new Set();
  const result = [];
  for (const item of items || []) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function trimMarkdown(markdown, maxChars) {
  if (!maxChars || markdown.length <= maxChars) return markdown;
  return `${markdown.slice(0, Math.max(0, maxChars - 90))}\n\n## Trim Notice\n- Context trimmed to ${maxChars} chars.\n`;
}

function inferCodeGraphTaskType(text = "") {
  const value = String(text || "").toLowerCase();
  if (/(rename|move|delete|extract|public api|refactor)/.test(value)) return "refactor";
  if (/(debug|bug|fix|root cause)/.test(value)) return "debug";
  if (/(docs|readme|documentation)/.test(value)) return "docs";
  return "feature";
}

function normalizeTaskType(taskType = "feature") {
  const value = String(taskType || "feature").toLowerCase();
  if (/(rename|move|delete|extract|public-api|public api)/.test(value)) return value.replace(/\s+/g, "-");
  if (/refactor/.test(value)) return "refactor";
  if (/debug|bug|fix/.test(value)) return "debug";
  if (/doc/.test(value)) return "docs";
  return "feature";
}

function requirementsForTaskType(taskType) {
  if (["refactor", "rename", "move", "delete", "extract", "public-api"].includes(taskType)) {
    return ["source RAG", "symbol evidence", "graph neighborhood or impact", "symbol coverage >=20%", "edge resolution >=5% when applicable"];
  }
  if (["debug", "feature"].includes(taskType)) return ["source RAG or symbol evidence", "graph warning surfaced when missing"];
  if (taskType === "docs") return ["code evidence optional when task is text-only"];
  return ["source evidence"];
}
