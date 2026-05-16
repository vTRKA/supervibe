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
    const queryQuality = evaluateCodeGraphQueryQualityGuard({ query: searchQuery, symbol, taskType });
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
    const unresolvedEdges = collectUnresolvedEdgeRows(store.db, { files: relatedFiles, limit: limit * 4 });
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
    const impactSummary = summarizeCodeGraphQueryOutput({
      queryType: "impact",
      query: searchQuery,
      seedNames,
      impact,
      graphEvidence: dedupedGraph,
      relatedFiles,
      graphHealth,
      quality,
      taskTypeGate,
      unresolvedEdges,
      limit,
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
      queryQuality,
      taskTypeGate,
      impactSummary,
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
    "## Query Quality Guard",
    formatQueryQualityGuard(context.queryQuality),
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
    "## Impact Summary",
    formatCodeGraphImpactSummary(context.impactSummary),
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


export function evaluateCodeGraphQueryQualityGuard({
  query = "",
  symbol = "",
  taskType = "feature",
} = {}) {
  const normalizedQuery = String(query || "").trim().replace(/\s+/g, " ");
  const normalizedSymbol = String(symbol || "").trim();
  const normalizedTaskType = normalizeTaskType(taskType);
  const rawTokens = normalizedQuery.match(/[A-Za-z_$][A-Za-z0-9_$-]*/g) || [];
  const tokens = rawTokens.map((token) => token.toLowerCase());
  const meaningfulTokens = tokens.filter((token) => token.length >= 3 && !QUERY_QUALITY_STOP_WORDS.has(token));
  const issues = [];
  const repairHints = [];
  const expansionHints = [];
  const hasPathAnchor = /(?:^|\s)(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\.[A-Za-z0-9]+(?::\d+)?(?:\s|$)/.test(normalizedQuery);
  const hasFunctionCallAnchor = /\b[A-Za-z_$][A-Za-z0-9_$]*\s*\(/.test(normalizedQuery);
  const hasSymbolAnchor = Boolean(normalizedSymbol) || hasFunctionCallAnchor || rawTokens.some((token) => (
    token.includes("_")
    || token.includes("$")
    || /[a-z][A-Z]/.test(token)
    || /^[A-Z][A-Za-z0-9_$]{2,}$/.test(token)
  ));
  const hasQuotedAnchor = /["'`][^"'`]{3,}["'`]/.test(normalizedQuery);
  const genericOnly = meaningfulTokens.length > 0 && meaningfulTokens.every((token) => QUERY_QUALITY_GENERIC_TERMS.has(token));

  if (!normalizedQuery) {
    issues.push("missing-query");
    repairHints.push("add an exact symbol, file path, command name, or behavior phrase");
  }
  if (normalizedQuery && meaningfulTokens.length < 2 && !hasSymbolAnchor && !hasPathAnchor) {
    issues.push("too-short");
    repairHints.push("add one code anchor plus the behavior or failure mode you need");
  }
  if (genericOnly) {
    issues.push("generic-query");
    repairHints.push("replace generic words with a function, class, script, command, or file path");
  }
  if (normalizedQuery && !hasSymbolAnchor && !hasPathAnchor && !hasQuotedAnchor && meaningfulTokens.length < 4) {
    issues.push("missing-code-anchor");
    repairHints.push("include a concrete symbol, file path, CLI command, config key, or exact error text");
  }
  if (meaningfulTokens.length > 18) {
    issues.push("overloaded-query");
    repairHints.push("split into one query for the primary symbol and one query for the expected behavior");
  }

  if (!hasPathAnchor) expansionHints.push("add a file path when the change area is known");
  if (!hasSymbolAnchor) expansionHints.push("add the exported function, class, command, or config key when available");
  if (!hasQuotedAnchor && ["debug", "feature"].includes(normalizedTaskType)) {
    expansionHints.push("add exact UI text, error text, or a behavior phrase in quotes");
  }
  if (["refactor", "rename", "move", "delete", "extract", "public-api"].includes(normalizedTaskType)) {
    expansionHints.push("use a full symbol id or file-qualified symbol before structural work");
  }
  if (issues.length === 0) expansionHints.push("query has enough shape for retrieval; inspect selected sources before changing code");

  return {
    schemaVersion: 1,
    pass: issues.length === 0,
    advisory: true,
    interrupt: false,
    issues,
    repairHints: [...new Set(repairHints)].slice(0, 5),
    expansionHints: [...new Set(expansionHints)].slice(0, 5),
    metrics: {
      tokenCount: rawTokens.length,
      meaningfulTokenCount: meaningfulTokens.length,
      hasSymbolAnchor,
      hasPathAnchor,
      hasQuotedAnchor,
    },
  };
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
  const usefulness = evaluateCodeGraphUsefulness({
    taskType: normalized,
    quality,
    graphHealth,
    stats: { ...stats, hasGraphEvidence, hasSourceEvidence },
  });

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
  for (const warning of usefulness.warnings) if (!warnings.includes(warning)) warnings.push(warning);

  return {
    taskType: normalized,
    pass: failures.length === 0,
    failures,
    warnings,
    usefulness,
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

export function evaluateCodeGraphUsefulness({
  taskType = "feature",
  quality = {},
  graphHealth = {},
  stats = {},
} = {}) {
  const normalized = normalizeTaskType(taskType);
  const hasSourceEvidence = Boolean(stats.hasSourceEvidence) || Number(stats.ragChunks || 0) > 0 || Number(stats.entrySymbols || 0) > 0;
  const hasGraphEvidence = Boolean(stats.hasGraphEvidence) || Number(stats.graphNodes || 0) > 0 || Number(stats.impactNodes || 0) > 0;
  const symbolCoverage = Number(quality.symbolCoverage ?? graphHealth?.sourceFileSymbolCoverage?.coverage ?? 0);
  const edgeResolution = Number(quality.edgeResolutionRate ?? graphHealth?.crossResolvedEdges?.rate ?? 0);
  const warnings = [];
  let score = 0;
  if (hasSourceEvidence) score += 0.35;
  if (hasGraphEvidence) score += 0.35;
  if (symbolCoverage >= 0.2) score += 0.15;
  if ((graphHealth?.crossResolvedEdges?.total || 0) < 20 || edgeResolution >= 0.05) score += 0.15;
  if (!hasSourceEvidence) warnings.push("CodeGraph context has no source RAG or symbol evidence for agent handoff");
  if (!hasGraphEvidence && ["refactor", "rename", "move", "delete", "extract", "public-api"].includes(normalized)) {
    warnings.push("structural agent handoff lacks graph neighborhood or impact evidence");
  } else if (!hasGraphEvidence && ["feature", "debug"].includes(normalized)) {
    warnings.push("agent handoff has source evidence but no graph neighborhood; keep implementation localized");
  }
  const pass = score >= (["refactor", "rename", "move", "delete", "extract", "public-api"].includes(normalized) ? 0.85 : 0.5)
    && hasSourceEvidence;
  return {
    pass,
    score: Number(score.toFixed(2)),
    hasSourceEvidence,
    hasGraphEvidence,
    symbolCoverage,
    edgeResolution,
    warnings,
    nextAction: pass
      ? "use CodeGraph context in agent packet"
      : "refresh index or narrow query before agent handoff",
  };
}

export function summarizeCodeGraphQueryOutput({
  queryType = "impact",
  query = "",
  seedNames = [],
  callers = [],
  callees = [],
  impact = {},
  graphEvidence = [],
  relatedFiles = [],
  graphHealth = {},
  quality = {},
  taskTypeGate = {},
  unresolvedEdges = [],
  limit = 8,
} = {}) {
  const normalizedType = normalizeQueryType(queryType);
  const impactNodes = impact?.nodes || [];
  const impactEdges = impact?.edges || [];
  const roots = impact?.roots || [];
  const focusedRows = rowsForQueryType({ normalizedType, callers, callees, impactNodes, graphEvidence });
  const unresolvedDiagnostics = summarizeUnresolvedEdges(unresolvedEdges, graphHealth, { limit });
  const topAffectedFiles = summarizeAffectedFiles({
    rows: focusedRows,
    relatedFiles,
    unresolvedFiles: unresolvedDiagnostics.topAffectedFiles,
    limit,
  });
  const resolvedEdgeRate = graphHealth?.crossResolvedEdges
    ? {
        resolved: numberOrZero(graphHealth.crossResolvedEdges.resolved),
        total: numberOrZero(graphHealth.crossResolvedEdges.total),
        rate: normalizeRate(graphHealth.crossResolvedEdges.rate, graphHealth.crossResolvedEdges.total === 0 ? 1 : 0),
      }
    : inferResolvedEdgeRate({ impactEdges, callers, callees });
  const caveats = buildImpactCaveats({
    normalizedType,
    roots,
    focusedRows,
    resolvedEdgeRate,
    unresolvedDiagnostics,
    quality,
    taskTypeGate,
  });
  const nextInvestigationHints = buildNextInvestigationHints({
    normalizedType,
    query,
    seedNames,
    roots,
    focusedRows,
    topAffectedFiles,
    resolvedEdgeRate,
    unresolvedDiagnostics,
  });
  const unresolvedHotspotActions = buildUnresolvedHotspotActions({
    unresolvedDiagnostics,
    taskTypeGate,
    limit,
  });

  return {
    schemaVersion: 1,
    queryType: normalizedType,
    query,
    seeds: [...new Set(seedNames || [])].filter(Boolean),
    counts: {
      callers: callers.length,
      callees: callees.length,
      impactNodes: impactNodes.length,
      impactEdges: impactEdges.length,
      graphRows: graphEvidence.length,
      relatedFiles: relatedFiles.length,
    },
    resolvedEdgeRate,
    unresolvedClasses: unresolvedDiagnostics.classBreakdown,
    unresolvedSampleTotal: unresolvedDiagnostics.total,
    caveats,
    topAffectedFiles,
    unresolvedHotspotActions,
    nextInvestigationHints,
  };
}

export function formatCodeGraphImpactSummary(summary = {}) {
  return formatList([
    `queryType=${summary.queryType || "unknown"}`,
    `resolvedEdgeRate=${formatResolvedEdgeRate(summary.resolvedEdgeRate)}`,
    `unresolvedClasses=${formatUnresolvedClasses(summary.unresolvedClasses)}`,
    `caveats=${(summary.caveats || []).join("; ") || "none"}`,
    `topAffectedFiles=${formatAffectedFilesInline(summary.topAffectedFiles)}`,
    `unresolvedHotspotActions=${formatUnresolvedHotspotActions(summary.unresolvedHotspotActions)}`,
    `next=${(summary.nextInvestigationHints || []).join("; ") || "none"}`,
  ]);
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

function collectUnresolvedEdgeRows(db, { files = [], limit = 32 } = {}) {
  const cleanFiles = [...new Set(files || [])].filter(Boolean);
  if (!cleanFiles.length) return [];
  const placeholders = cleanFiles.map(() => "?").join(",");
  return db.prepare(`
    SELECT s.path AS fromPath,
           e.to_name AS toName,
           e.kind AS edgeKind,
           COUNT(candidate.id) AS candidateCount,
           COUNT(*) AS count
    FROM code_edges e
    JOIN code_symbols s ON s.id = e.from_id
    LEFT JOIN code_symbols candidate ON candidate.name = e.to_name
    WHERE e.to_id IS NULL
      AND s.path IN (${placeholders})
    GROUP BY s.path, e.to_name, e.kind
    ORDER BY count DESC, s.path ASC, e.to_name ASC
    LIMIT ?
  `).all(...cleanFiles, Number(limit) || 32);
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

function formatQueryQualityGuard(guard = {}) {
  return formatList([
    `pass=${Boolean(guard.pass)}`,
    `advisory=${guard.advisory !== false}`,
    `interrupt=${guard.interrupt === true}`,
    `issues=${guard.issues?.join("; ") || "none"}`,
    `repairHints=${guard.repairHints?.join("; ") || "none"}`,
    `expansionHints=${guard.expansionHints?.join("; ") || "none"}`,
    `tokens=${guard.metrics?.tokenCount ?? 0}`,
    `anchors=symbol:${guard.metrics?.hasSymbolAnchor === true} path:${guard.metrics?.hasPathAnchor === true} quoted:${guard.metrics?.hasQuotedAnchor === true}`,
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
    `usefulness=${gate.usefulness?.score ?? "unknown"} pass=${gate.usefulness?.pass ?? "unknown"}`,
    `requirements=${(gate.requirements || []).join("; ") || "none"}`,
    `failures=${gate.failures?.join("; ") || "none"}`,
    `warnings=${gate.warnings?.join("; ") || "none"}`,
  ]);
}

function rowsForQueryType({ normalizedType, callers, callees, impactNodes, graphEvidence }) {
  if (normalizedType === "callers") return callers || [];
  if (normalizedType === "callees") return callees || [];
  return (impactNodes || []).filter((row) => Number(row.distance || 0) > 0).length
    ? (impactNodes || []).filter((row) => Number(row.distance || 0) > 0)
    : graphEvidence || [];
}

function summarizeUnresolvedEdges(rows = [], graphHealth = {}, { limit = 8 } = {}) {
  const classes = new Map();
  const files = new Map();
  let total = 0;
  for (const row of rows || []) {
    const count = numberOrZero(row.count || row.n || 1);
    total += count;
    const name = classifyUnresolvedEdge(row);
    classes.set(name, (classes.get(name) || 0) + count);
    const path = normalizeAffectedPath(row.fromPath || row.path || "unknown");
    const current = files.get(path) || { path, count: 0, classes: new Map(), examples: [] };
    current.count += count;
    current.classes.set(name, (current.classes.get(name) || 0) + count);
    if (current.examples.length < 3) current.examples.push(`${row.edgeKind || "edge"}:${row.toName || "unknown"}`);
    files.set(path, current);
  }
  if (total === 0 && numberOrZero(graphHealth?.unresolvedImportRate?.unresolved) > 0) {
    classes.set("unresolved-outside-sample", numberOrZero(graphHealth.unresolvedImportRate.unresolved));
  }
  return {
    total,
    classBreakdown: [...classes.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    topAffectedFiles: [...files.values()]
      .map((file) => ({
        path: file.path,
        unresolvedCount: file.count,
        classes: [...file.classes.entries()].map(([name, count]) => ({ name, count })),
        examples: file.examples,
      }))
      .sort((a, b) => b.unresolvedCount - a.unresolvedCount || String(a.path).localeCompare(String(b.path)))
      .slice(0, limit),
  };
}

function summarizeAffectedFiles({ rows = [], relatedFiles = [], unresolvedFiles = [], limit = 8 } = {}) {
  const files = new Map();
  for (const row of rows || []) {
    const path = normalizeAffectedPath(row.path || row.fromPath || row.file);
    if (!path) continue;
    const current = files.get(path) || { path, graphHits: 0, nearestDistance: null, unresolvedCount: 0, symbols: [] };
    current.graphHits++;
    if (Number.isFinite(Number(row.distance))) {
      const distance = Number(row.distance);
      current.nearestDistance = current.nearestDistance === null ? distance : Math.min(current.nearestDistance, distance);
    }
    if (row.name && current.symbols.length < 4 && !current.symbols.includes(row.name)) current.symbols.push(row.name);
    files.set(path, current);
  }
  for (const item of relatedFiles || []) {
    const path = normalizeAffectedPath(item);
    if (!path || files.has(path)) continue;
    files.set(path, { path, graphHits: 0, nearestDistance: null, unresolvedCount: 0, symbols: [] });
  }
  for (const item of unresolvedFiles || []) {
    const path = normalizeAffectedPath(item);
    if (!path) continue;
    const current = files.get(path) || { path, graphHits: 0, nearestDistance: null, unresolvedCount: 0, symbols: [] };
    current.unresolvedCount += numberOrZero(item.unresolvedCount || item.count);
    files.set(path, current);
  }
  return [...files.values()]
    .sort((a, b) => b.graphHits - a.graphHits || b.unresolvedCount - a.unresolvedCount || String(a.path).localeCompare(String(b.path)))
    .slice(0, limit);
}

function normalizeAffectedPath(value) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "object") {
    return normalizeAffectedPath(value.path || value.file || value.fromPath || value.toPath || value.id || "");
  }
  return String(value);
}

function buildImpactCaveats({ normalizedType, roots, focusedRows, resolvedEdgeRate, unresolvedDiagnostics, quality, taskTypeGate }) {
  const caveats = [];
  if (!focusedRows.length) caveats.push(`${normalizedType} query returned no structural rows`);
  if ((roots || []).length > 1) caveats.push("bare symbol matched multiple roots; disambiguate by full symbol id for exact impact");
  if (numberOrZero(resolvedEdgeRate.total) > 0 && normalizeRate(resolvedEdgeRate.rate) < 0.5) {
    caveats.push("resolved edge rate is low; impact may miss cross-file callers or callees");
  }
  if ((unresolvedDiagnostics.classBreakdown || []).length) {
    caveats.push("unresolved edge classes are present; treat affected files as partial evidence");
  }
  for (const warning of quality?.warnings || []) caveats.push(warning);
  for (const failure of quality?.failures || []) caveats.push(`quality failure: ${failure}`);
  for (const warning of taskTypeGate?.warnings || []) if (!caveats.includes(warning)) caveats.push(warning);
  return [...new Set(caveats)].slice(0, 8);
}

function buildNextInvestigationHints({
  normalizedType,
  query,
  seedNames,
  roots,
  focusedRows,
  topAffectedFiles,
  resolvedEdgeRate,
  unresolvedDiagnostics,
}) {
  const hints = [];
  if ((roots || []).length > 1) hints.push("rerun with a full symbol id from the matching root path");
  if (!focusedRows.length && query) hints.push("narrow the query to an exact exported function, class, or command name");
  if (topAffectedFiles.length) hints.push(`inspect ${topAffectedFiles[0].path} first`);
  if (normalizedType === "impact" && (seedNames || []).length) hints.push(`check callers and callees for ${seedNames[0]}`);
  if (numberOrZero(resolvedEdgeRate.total) > 0 && normalizeRate(resolvedEdgeRate.rate) < 0.5) {
    hints.push("refresh CodeGraph before using this as refactor blast-radius evidence");
  }
  if ((unresolvedDiagnostics.classBreakdown || []).length) {
    hints.push(`sample unresolved ${unresolvedDiagnostics.classBreakdown[0].name} edges in affected files`);
  }
  return [...new Set(hints)].slice(0, 6);
}

function buildUnresolvedHotspotActions({
  unresolvedDiagnostics = {},
  taskTypeGate = {},
  limit = 8,
} = {}) {
  const structuralHardStop = taskTypeGate?.pass === false
    && (taskTypeGate.failures || []).some((failure) => /^structural task requires /.test(String(failure || "")));
  return (unresolvedDiagnostics.topAffectedFiles || [])
    .slice(0, limit)
    .map((file) => {
      const primaryClass = selectPrimaryUnresolvedClass(file.classes);
      return {
        path: file.path,
        unresolvedCount: numberOrZero(file.unresolvedCount || file.count),
        primaryClass,
        examples: file.examples || [],
        severity: structuralHardStop ? "hard-stop" : "advisory",
        nextAction: nextActionForUnresolvedClass(primaryClass, file),
        rationale: structuralHardStop
          ? "structural task lacks required graph proof; resolve or refresh before treating impact as complete"
          : "unresolved edges make this affected file partial evidence, but do not block localized source work",
      };
    });
}

function selectPrimaryUnresolvedClass(classes = []) {
  if (typeof classes === "string") {
    const first = classes.split(",").map((item) => item.trim()).filter(Boolean)[0] || "";
    return first.split(":")[0] || "unknown";
  }
  const sorted = (classes || [])
    .map((item) => ({
      name: item.name || item.class || "unknown",
      count: numberOrZero(item.count),
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return sorted[0]?.name || "unknown";
}

function nextActionForUnresolvedClass(primaryClass, file = {}) {
  const target = file.path ? ` in ${file.path}` : "";
  if (primaryClass === "ambiguous-local-symbol") {
    return `pin the ambiguous symbol by full path-qualified symbol id before relying on impact${target}`;
  }
  if (primaryClass === "import-or-scope-limitation") {
    return `inspect imports and local scope around unresolved examples${target}`;
  }
  if (primaryClass === "external-or-reexport") {
    return `confirm whether unresolved examples are package imports or re-export boundaries${target}`;
  }
  if (primaryClass === "dynamic-language-pattern") {
    return `treat dynamic calls as manual-review points and inspect runtime dispatch${target}`;
  }
  if (primaryClass === "missing-symbol") {
    return `search for the missing target symbol and refresh the index if it exists${target}`;
  }
  return `sample unresolved examples and decide whether to refresh graph data${target}`;
}

function formatUnresolvedHotspotActions(actions = []) {
  return (actions || []).map((action) => (
    `${action.path} ${action.severity} ${action.primaryClass}: ${action.nextAction}`
  )).join("; ") || "none";
}

function inferResolvedEdgeRate({ impactEdges = [], callers = [], callees = [] } = {}) {
  const rows = [...(impactEdges || []), ...(callers || []), ...(callees || [])];
  const total = rows.length;
  const resolved = rows.filter((row) => row.toId || row.id || row.fromId).length;
  return {
    resolved,
    total,
    rate: total === 0 ? 1 : resolved / total,
  };
}

function classifyUnresolvedEdge(row = {}) {
  const toName = String(row.toName || row.to_name || "").trim();
  const edgeKind = String(row.edgeKind || row.kind || "").toLowerCase();
  const candidateCount = numberOrZero(row.candidateCount || row.candidates);
  if (candidateCount > 1) return "ambiguous-local-symbol";
  if (candidateCount === 1) return "import-or-scope-limitation";
  if (edgeKind.includes("import") || /^\.{1,2}\//.test(toName) || isExternalOrReexportName(toName)) return "external-or-reexport";
  if (/^(?:this|module|exports|default|constructor|prototype|require|import|then|catch|map|filter|reduce|forEach|push|set|get|has|emit|on|off)$/i.test(toName) || /[.[\]?$]/.test(toName)) {
    return "dynamic-language-pattern";
  }
  return "missing-symbol";
}

function isExternalOrReexportName(value) {
  return /^@?[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9._-]+)+$/i.test(value);
}

function formatResolvedEdgeRate(rate = {}) {
  const resolved = numberOrZero(rate.resolved);
  const total = numberOrZero(rate.total);
  return `${formatPercent(rate.rate)} (${resolved}/${total})`;
}

function formatUnresolvedClasses(classes = []) {
  return (classes || []).map((item) => `${item.name}:${item.count}`).join(", ") || "none";
}

function formatAffectedFilesInline(files = []) {
  return (files || []).map((file) => {
    const distance = file.nearestDistance === null || file.nearestDistance === undefined ? "n/a" : file.nearestDistance;
    return `${file.path} hits=${file.graphHits || 0} unresolved=${file.unresolvedCount || 0} d=${distance}`;
  }).join("; ") || "none";
}
function formatPercent(value) {
  return Number.isFinite(Number(value)) ? `${(Number(value) * 100).toFixed(1)}%` : "unknown";
}

function normalizeQueryType(queryType) {
  const value = String(queryType || "impact").toLowerCase();
  if (/callers?/.test(value)) return "callers";
  if (/callees?/.test(value)) return "callees";
  return "impact";
}

function normalizeRate(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function numberOrZero(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
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

const QUERY_QUALITY_STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "this", "that", "into", "when", "where", "what", "why", "how",
  "please", "need", "needs", "make", "add", "change", "update", "fix", "use", "using", "about", "around",
]);

const QUERY_QUALITY_GENERIC_TERMS = new Set([
  "bug", "bugs", "fix", "issue", "issues", "problem", "problems", "error", "errors", "feature", "change",
  "update", "refactor", "code", "context", "thing", "stuff", "logic", "flow", "work", "works", "broken",
]);

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
