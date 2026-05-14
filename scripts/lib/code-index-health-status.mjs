import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

import { impactRadius, neighborhood, searchSymbols } from "./code-graph-queries.mjs";
import { CodeStore } from "./code-store.mjs";
import { loadNodeSqliteDatabaseSync } from "./node-sqlite-runtime.mjs";
import { CODEGRAPH_INDEX_COMMAND, SOURCE_RAG_INDEX_COMMAND } from "./supervibe-command-catalog.mjs";
import { runRetrievalPipeline } from "./supervibe-retrieval-pipeline.mjs";

export const DEFAULT_REPAIRABLE_CONTENT_CHANGED_ROWS = 2;
const READ_SNAPSHOT_MODE = "read-only-transaction";

export function repairableContentChangedRowsLimit(value = process.env.SUPERVIBE_INDEX_REPAIRABLE_CONTENT_ROWS) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_REPAIRABLE_CONTENT_CHANGED_ROWS;
  return Math.trunc(parsed);
}

export function buildCodeIndexFreshnessStatus({
  health = {},
  gate = {},
  strict = false,
  repairAvailable = true,
  repairableContentChangedRows = repairableContentChangedRowsLimit(),
  snapshot = null,
} = {}) {
  const staleRows = (health.staleRows || []).length;
  const contentChangedRows = (health.contentChangedRows || []).length;
  const partialRows = (health.partialIndexedFiles || []).length;
  const rawFailedGates = gate.failedGates || [];
  const nonFreshFailures = rawFailedGates.filter((item) => !["content-stale", "stale-rows"].includes(item.code));
  const contentRepairable = staleRows === 0
    && contentChangedRows > 0
    && contentChangedRows <= repairableContentChangedRows
    && nonFreshFailures.length === 0;
  const noFreshnessFailures = staleRows === 0 && contentChangedRows === 0;

  let status = "ready";
  let readyForMode = rawFailedGates.length === 0;
  let strictReady = rawFailedGates.length === 0;
  let effectiveFailedGates = rawFailedGates;
  let reason = "index health gate is ready";
  let nextAction = "none";

  if (strict && rawFailedGates.length > 0) {
    status = "failed";
    readyForMode = false;
    reason = "strict index health rejects unresolved stale or failed gates";
    nextAction = SOURCE_RAG_INDEX_COMMAND;
  } else if (contentRepairable && repairAvailable) {
    status = "repairable-stale";
    readyForMode = true;
    strictReady = false;
    effectiveFailedGates = rawFailedGates.filter((item) => item.code !== "content-stale");
    reason = `contentChangedRows=${contentChangedRows} is within dev repair threshold ${repairableContentChangedRows}`;
    nextAction = SOURCE_RAG_INDEX_COMMAND;
  } else if (contentRepairable && !repairAvailable) {
    status = "degraded-context";
    readyForMode = true;
    strictReady = false;
    effectiveFailedGates = rawFailedGates.filter((item) => item.code !== "content-stale");
    reason = "read path can use a stable snapshot, but repair requires an explicit index command";
    nextAction = SOURCE_RAG_INDEX_COMMAND;
  } else if (!noFreshnessFailures) {
    status = "failed";
    readyForMode = false;
    strictReady = false;
    reason = staleRows > 0
      ? "stale index rows require an explicit rebuild"
      : `contentChangedRows=${contentChangedRows} exceeds dev repair threshold ${repairableContentChangedRows}`;
    nextAction = SOURCE_RAG_INDEX_COMMAND;
  } else if (nonFreshFailures.length > 0 || rawFailedGates.length > 0) {
    status = "failed";
    readyForMode = false;
    strictReady = false;
    reason = "non-freshness index health gate failed";
    nextAction = SOURCE_RAG_INDEX_COMMAND;
  }

  return {
    status,
    readyForMode,
    strictReady,
    devReady: status === "ready" || status === "repairable-stale" || status === "degraded-context",
    repairAvailable,
    repairable: status === "repairable-stale",
    degraded: status === "degraded-context",
    strict,
    reason,
    nextAction,
    repairCommand: SOURCE_RAG_INDEX_COMMAND,
    graphRepairCommand: CODEGRAPH_INDEX_COMMAND,
    repairableContentChangedRows,
    staleRows,
    contentChangedRows,
    partialRows,
    failedGates: rawFailedGates,
    effectiveFailedGates,
    warnings: gate.warnings || [],
    snapshot,
  };
}

export function buildMissingCodeIndexFreshnessStatus({ dbPath = null } = {}) {
  return {
    status: "not-built",
    readyForMode: false,
    strictReady: false,
    devReady: false,
    repairAvailable: true,
    repairable: false,
    degraded: false,
    strict: false,
    reason: dbPath
      ? `code index database is missing: ${dbPath}`
      : "code index database is missing",
    nextAction: SOURCE_RAG_INDEX_COMMAND,
    repairCommand: SOURCE_RAG_INDEX_COMMAND,
    graphRepairCommand: CODEGRAPH_INDEX_COMMAND,
    repairableContentChangedRows: DEFAULT_REPAIRABLE_CONTENT_CHANGED_ROWS,
    staleRows: 0,
    contentChangedRows: 0,
    partialRows: 0,
    failedGates: [{
      code: "code-index-not-built",
      message: "Code RAG and CodeGraph database has not been built",
    }],
    effectiveFailedGates: [{
      code: "code-index-not-built",
      message: "Code RAG and CodeGraph database has not been built",
    }],
    warnings: [],
    snapshot: {
      status: "not-built",
      mode: "none",
      path: dbPath,
      dbAgeMs: null,
      retryCount: 0,
    },
  };
}

export function isMissingCodeIndexError(error = {}) {
  return error?.code === "SUPERVIBE_CODE_INDEX_MISSING";
}

export function applyCodeIndexFreshnessPolicyToGate(gate = {}, freshness = {}) {
  const status = freshness.status || "ready";
  const warnings = [...(gate.warnings || [])];
  if (status === "repairable-stale" || status === "degraded-context") {
    warnings.push({
      code: status,
      message: freshness.reason || status,
      actual: freshness.contentChangedRows || 0,
    });
  }
  return {
    ...gate,
    ready: freshness.readyForMode === true,
    failedGates: freshness.effectiveFailedGates || gate.failedGates || [],
    warnings: dedupeGateItems(warnings),
  };
}

export function formatCodeIndexFreshnessStatus(freshness = {}) {
  const snapshot = freshness.snapshot || {};
  const strictFailure = freshness.strictReady === false ? "true" : "false";
  return [
    "SUPERVIBE_CODE_INDEX_FRESHNESS",
    `STATUS: ${freshness.status || "unknown"}`,
    `MODE_READY: ${freshness.readyForMode === true}`,
    `DEV_READY: ${freshness.devReady === true}`,
    `STRICT_READY: ${freshness.strictReady === true}`,
    `STRICT_FAILURE: ${strictFailure}`,
    `CONTENT_CHANGED_ROWS: ${freshness.contentChangedRows || 0}`,
    `STALE_ROWS: ${freshness.staleRows || 0}`,
    `PARTIAL_ROWS: ${freshness.partialRows || 0}`,
    `REPAIR_THRESHOLD: ${freshness.repairableContentChangedRows ?? DEFAULT_REPAIRABLE_CONTENT_CHANGED_ROWS}`,
    `REPAIR_COMMAND: ${freshness.repairCommand || SOURCE_RAG_INDEX_COMMAND}`,
    `GRAPH_REPAIR_COMMAND: ${freshness.graphRepairCommand || CODEGRAPH_INDEX_COMMAND}`,
    `READ_SNAPSHOT_MODE: ${snapshot.mode || "none"}`,
    `READ_SNAPSHOT_DB_AGE_MS: ${snapshot.dbAgeMs ?? "unknown"}`,
    `READ_SNAPSHOT_RETRIES: ${snapshot.retryCount ?? 0}`,
    `REASON: ${freshness.reason || "unknown"}`,
    `NEXT_ACTION: ${freshness.nextAction || "none"}`,
  ].join("\n");
}

export async function openCodeIndexReadSnapshot({
  rootDir = process.cwd(),
  useEmbeddings = false,
  useGraph = true,
  purpose = "read",
  maxAttempts = 3,
  retryDelayMs = 75,
  busyTimeoutMs = 1500,
} = {}) {
  const dbPath = join(rootDir, ".supervibe", "memory", "code.db");
  if (!existsSync(dbPath)) {
    const error = new Error(`code index database is missing: ${dbPath}`);
    error.code = "SUPERVIBE_CODE_INDEX_MISSING";
    throw error;
  }

  const DatabaseSync = await loadNodeSqliteDatabaseSync("Code RAG and code graph read snapshot");
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let db = null;
    try {
      db = new DatabaseSync(dbPath, { readOnly: true });
      db.exec(`PRAGMA busy_timeout=${positiveInt(busyTimeoutMs, 1500)}; PRAGMA query_only=ON; BEGIN;`);
      assertCodeIndexReadSchema(db);
      const store = new CodeStore(rootDir, { useEmbeddings, useGraph });
      store.db = db;
      const snapshot = buildReadSnapshotMetadata({ db, dbPath, attempt, maxAttempts, purpose });
      const close = createReadSnapshotClose(store);
      store.close = close;
      return { store, snapshot, close };
    } catch (error) {
      lastError = error;
      try { db?.close(); } catch {}
      if (!isSqliteLockError(error) || attempt >= maxAttempts) break;
      await delay(retryDelayMs * attempt);
    }
  }

  const error = new Error(`could not open code index read snapshot after ${maxAttempts} attempt(s): ${lastError?.message || "unknown error"}`);
  error.code = isSqliteLockError(lastError) ? "SUPERVIBE_CODE_INDEX_READ_LOCKED" : "SUPERVIBE_CODE_INDEX_READ_FAILED";
  error.cause = lastError;
  error.repairCommand = SOURCE_RAG_INDEX_COMMAND;
  throw error;
}

export async function buildCodeGraphContextFromReadSnapshot({
  rootDir = process.cwd(),
  query = "",
  symbol = "",
  limit = 8,
  graphDepth = 1,
  impactDepth = 2,
  includeImpact = true,
  useEmbeddings = true,
  maxChars = 14_000,
  taskType = "feature",
} = {}) {
  const read = await openCodeIndexReadSnapshot({
    rootDir,
    useEmbeddings,
    useGraph: true,
    purpose: "codegraph-context",
  });
  try {
    const context = await buildCodeGraphContextFromStore(read.store, {
      query,
      symbol,
      limit,
      graphDepth,
      impactDepth,
      includeImpact,
      useEmbeddings,
      maxChars,
      taskType,
    });
    context.readSnapshot = read.snapshot;
    context.markdown = trimMarkdown(formatCodeGraphContextMarkdown(context), maxChars);
    return context;
  } finally {
    read.close();
  }
}

async function buildCodeGraphContextFromStore(store, {
  query = "",
  symbol = "",
  limit = 8,
  graphDepth = 1,
  impactDepth = 2,
  includeImpact = true,
  useEmbeddings = true,
  taskType = "feature",
} = {}) {
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
  return {
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
}

function createReadSnapshotClose(store) {
  let closed = false;
  const originalClose = CodeStore.prototype.close.bind(store);
  return () => {
    if (closed) return;
    closed = true;
    try { store.db?.exec("ROLLBACK;"); } catch {}
    originalClose();
  };
}

function buildReadSnapshotMetadata({ db, dbPath, attempt, maxAttempts, purpose }) {
  const stats = statSync(dbPath);
  const schema = readCodeIndexSchemaMetadata(db);
  return {
    status: "ready",
    mode: READ_SNAPSHOT_MODE,
    purpose,
    path: dbPath,
    createdAt: new Date().toISOString(),
    dbMtime: stats.mtime.toISOString(),
    dbAgeMs: Math.max(0, Date.now() - stats.mtimeMs),
    schemaVersion: schema.schemaVersion,
    tableCount: schema.tableCount,
    retryCount: attempt - 1,
    maxAttempts,
  };
}

function readCodeIndexSchemaMetadata(db) {
  const userVersion = db.prepare("PRAGMA user_version").get();
  const schemaVersion = userVersion?.user_version ?? Object.values(userVersion || {})[0] ?? 0;
  const tableCount = db.prepare("SELECT COUNT(*) AS n FROM sqlite_schema WHERE type IN ('table', 'virtual')").get().n;
  return { schemaVersion, tableCount };
}

function assertCodeIndexReadSchema(db) {
  const required = ["code_files", "code_chunks", "code_chunks_fts", "code_symbols", "code_edges"];
  const rows = db.prepare("SELECT name FROM sqlite_schema WHERE type IN ('table', 'virtual')").all();
  const names = new Set(rows.map((row) => row.name));
  const missing = required.filter((name) => !names.has(name));
  if (missing.length > 0) {
    const error = new Error(`code index schema missing required table(s): ${missing.join(", ")}`);
    error.code = "SUPERVIBE_CODE_INDEX_SCHEMA_MISSING";
    throw error;
  }
}

function isSqliteLockError(error = {}) {
  const code = String(error.code || error.errcode || "").toUpperCase();
  const message = String(error.message || "");
  return code.includes("SQLITE_BUSY")
    || code.includes("SQLITE_LOCKED")
    || /database is locked|database table is locked|SQLITE_BUSY|SQLITE_LOCKED/i.test(message);
}

function dedupeGateItems(items = []) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = `${item.code || "unknown"}:${item.message || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
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

function evaluateCodeGraphTaskTypeGate({ taskType = "feature", quality = {}, graphHealth = {}, stats = {} } = {}) {
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

function evaluateCodeGraphUsefulness({ taskType = "feature", quality = {}, graphHealth = {}, stats = {} } = {}) {
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
    nextAction: pass ? "use CodeGraph context in agent packet" : "refresh index or narrow query before agent handoff",
  };
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
    "## Read Snapshot",
    formatList([
      `mode=${context.readSnapshot?.mode || READ_SNAPSHOT_MODE}`,
      `dbAgeMs=${context.readSnapshot?.dbAgeMs ?? "unknown"}`,
      `retryCount=${context.readSnapshot?.retryCount ?? 0}`,
    ]),
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
  return rows.map((row) => `- d=${row.distance ?? 0} ${row.path}:${row.startLine || 1} [${row.kind || "symbol"}:${row.name || row.toName || "unknown"}] via=${row.via || row.seed || "graph"}`).join("\n");
}

function formatRetrievalQuality(pipeline = {}) {
  return formatList([
    `pass=${pipeline.pass === true}`,
    `rewrittenQuery=${pipeline.rewrittenQuery || "none"}`,
    `stages=${(pipeline.stages || []).map((stage) => `${stage.name}:${stage.count ?? 0}`).join(", ") || "none"}`,
    `selected=${pipeline.selected?.length || 0}`,
    `fallback=${pipeline.fallback?.reason || "none"}`,
  ]);
}

function formatGraphQuality(quality = {}) {
  return formatList([
    `pass=${quality.pass === true}`,
    `failures=${(quality.failures || []).join("; ") || "none"}`,
    `warnings=${(quality.warnings || []).join("; ") || "none"}`,
    `symbolCoverage=${quality.symbolCoverage ?? "unknown"}`,
    `edgeResolution=${quality.edgeResolutionRate ?? "unknown"}`,
  ]);
}

function formatTaskTypeGate(gate = {}) {
  return formatList([
    `taskType=${gate.taskType || "feature"}`,
    `pass=${gate.pass === true}`,
    `usefulness=${gate.usefulness?.score ?? "unknown"} pass=${gate.usefulness?.pass === true}`,
    `requirements=${gate.requirements || "unknown"}`,
    `failures=${(gate.failures || []).join("; ") || "none"}`,
    `warnings=${(gate.warnings || []).join("; ") || "none"}`,
  ]);
}

function requirementsForTaskType(taskType) {
  if (["refactor", "rename", "move", "delete", "extract", "public-api"].includes(taskType)) {
    return "graph neighborhood or impact evidence; >=20% symbol coverage; low unresolved-risk warning surfaced";
  }
  if (["feature", "debug"].includes(taskType)) {
    return "source RAG or symbol evidence; graph warning surfaced when missing";
  }
  return "source references when relevant; graph optional";
}

function normalizeTaskType(taskType = "") {
  const value = String(taskType || "").trim().toLowerCase();
  if (["refactor", "rename", "move", "delete", "extract", "public-api", "debug", "feature", "docs"].includes(value)) return value;
  if (/rename|move|delete|extract|api|contract|public/.test(value)) return "public-api";
  if (/refactor|restructure/.test(value)) return "refactor";
  if (/bug|debug|fix|incident/.test(value)) return "debug";
  if (/doc|readme|copy/.test(value)) return "docs";
  return "feature";
}

function scoreAnchor(anchor, terms) {
  const text = `${anchor.anchorId} ${anchor.symbolName || ""} ${anchor.responsibility || ""}`.toLowerCase();
  let score = 0;
  for (const term of terms) if (text.includes(term)) score += 1;
  return score;
}

function dedupeBy(rows, keyFn) {
  const seen = new Set();
  const result = [];
  for (const row of rows || []) {
    const key = keyFn(row);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(row);
  }
  return result;
}

function formatList(items) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return "- none";
  return list.map((item) => `- ${item}`).join("\n");
}

function trimMarkdown(markdown, maxChars) {
  const limit = positiveInt(maxChars, 14_000);
  const text = String(markdown || "");
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 80)).replace(/\s+$/g, "")}\n\n[trimmed to ${limit} chars]`;
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.trunc(parsed);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}
