#!/usr/bin/env node
// Code search CLI — semantic (FTS5 + e5 cosine) + graph (callers/callees/neighbors/top-symbols).
// Used by supervibe:code-search skill.
//
// Modes:
//   --query "<text>"           semantic search (existing)
//   --callers "<symbol>"       who calls this symbol (graph)
//   --callees "<symbol>"       what does this symbol call (graph)
//   --neighbors "<symbol>"     BFS neighborhood (graph), use --depth N
//   --top-symbols N            most-connected symbols (centrality)
//   --symbol-search "<query>"  ranked symbol lookup (locations only)
//   --impact "<symbol>"        inbound impact radius for a symbol
//   --files "."                indexed file tree/list with symbol counts
//   --context "<task>"         graph-aware context pack for agents
//
// Symbol arg accepts bare name OR full ID "path:kind:name:line" for disambiguation.

import {
  findCallers, findCallees, neighborhood, topSymbolsByDegree, disambiguate,
  impactRadius, listIndexedFiles, searchSymbols
} from './lib/code-graph-queries.mjs';
import { searchMemory } from './lib/memory-store.mjs';
import { formatHybridRetrievalEvidence, runHybridCodeSearch } from './lib/supervibe-code-search.mjs';
import { buildSharedEvidencePacket } from './lib/supervibe-evidence-packet.mjs';
import { buildRepoMap, formatRepoMapContext, selectRepoMapContext } from './lib/supervibe-repo-map.mjs';
import { buildCodeGraphContextFromReadSnapshot, openCodeIndexReadSnapshot } from './lib/code-index-health-status.mjs';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

const PROJECT_ROOT = process.cwd();

export async function buildLiveCompactContextPack({
  rootDir = PROJECT_ROOT,
  query = "",
  limit = 8,
  maxTokens = 1200,
  useEmbeddings = true,
  taskType = undefined,
} = {}) {
  const normalizedQuery = String(query || "").trim();
  const evidenceLimit = Math.max(1, Math.trunc(Number(limit) || 8));
  const omittedEvidence = [];

  let memoryResults = [];
  try {
    memoryResults = normalizedQuery
      ? await searchMemory(rootDir, {
        query: normalizedQuery,
        limit: Math.min(4, evidenceLimit),
        semantic: useEmbeddings,
      })
      : [];
  } catch (err) {
    omittedEvidence.push({
      source: "memory",
      reason: `unavailable: ${err.message}`,
    });
  }

  let ragResults = [];
  let retrieval = null;
  let readSnapshot = null;
  try {
    readSnapshot = await openCodeIndexReadSnapshot({ rootDir, useEmbeddings, purpose: "context-pack-rag" });
    if (normalizedQuery) {
      const search = await runHybridCodeSearch(readSnapshot.store, {
        query: normalizedQuery,
        limit: evidenceLimit,
        semantic: useEmbeddings,
      });
      ragResults = search.results;
      retrieval = search.retrieval;
    }
  } catch (err) {
    omittedEvidence.push({
      source: "rag",
      reason: `unavailable: ${err.message}`,
    });
  } finally {
    readSnapshot?.close?.();
  }

  let codeGraphContext = null;
  try {
    codeGraphContext = normalizedQuery
      ? await buildCodeGraphContextFromReadSnapshot({
        rootDir,
        query: normalizedQuery,
        limit: Math.min(6, evidenceLimit),
        useEmbeddings,
        taskType,
        maxChars: Math.max(1200, Number(maxTokens || 1200) * 2),
      })
      : null;
  } catch (err) {
    omittedEvidence.push({
      source: "codegraph",
      reason: `unavailable: ${err.message}`,
    });
  }

  return buildCompactContextPack({
    query: normalizedQuery,
    memoryResults,
    ragResults,
    codeGraphContext,
    retrieval,
    omittedEvidence,
    maxTokens,
  });
}

export function buildCompactContextPack({
  query = "",
  memoryResults = [],
  ragResults = [],
  codeGraphContext = null,
  retrieval = null,
  omittedEvidence = [],
  maxTokens = 1200,
} = {}) {
  const tokenBudget = normalizeTokenBudget(maxTokens);
  const memoryEvidence = normalizeMemoryEvidence(memoryResults).slice(0, 4);
  const ragEvidence = normalizeRagEvidence(ragResults).slice(0, 8);
  const graphEvidence = normalizeGraphEvidence(codeGraphContext).slice(0, 8);
  const graphWarnings = collectGraphWarnings(codeGraphContext);
  const omissions = normalizeOmittedEvidence({
    omittedEvidence,
    memoryEvidence,
    ragEvidence,
    graphEvidence,
    codeGraphContext,
  });
  const confidence = calculatePackConfidence({
    memoryEvidence,
    ragEvidence,
    graphEvidence,
    graphWarnings,
    retrieval,
    omissions,
  });
  const pack = {
    schemaVersion: 1,
    kind: "supervibe-code-search-context-pack",
    query: String(query || ""),
    citations: [
      ...memoryEvidence.map((entry, index) => ({ id: `M${index + 1}`, source: "memory", path: entry.path, summary: entry.summary })),
      ...ragEvidence.map((entry, index) => ({ id: `R${index + 1}`, source: "rag", path: entry.path, line: entry.startLine, summary: entry.summary })),
      ...graphEvidence.map((entry, index) => ({ id: `G${index + 1}`, source: "codegraph", path: entry.path, line: entry.startLine, summary: entry.summary })),
    ],
    evidence: {
      memory: memoryEvidence,
      rag: ragEvidence,
      codeGraph: graphEvidence,
    },
    retrieval,
    graphWarnings,
    omittedEvidence: omissions,
    confidence,
    tokenBudget: {
      maxTokens: tokenBudget,
      estimatedTokens: 0,
      pass: true,
      trimmed: false,
    },
  };
  let markdown = formatCompactContextPack(pack);
  if (estimateTokens(markdown) > tokenBudget) {
    pack.tokenBudget.trimmed = true;
    pack.evidence.memory = pack.evidence.memory.slice(0, 2);
    pack.evidence.rag = pack.evidence.rag.slice(0, 4).map((entry) => ({ ...entry, snippet: truncate(entry.snippet, 180) }));
    pack.evidence.codeGraph = pack.evidence.codeGraph.slice(0, 4);
    pack.omittedEvidence = [
      ...pack.omittedEvidence,
      { source: "budget", reason: `trimmed to ${tokenBudget} token budget` },
    ].sort((a, b) => a.source.localeCompare(b.source) || a.reason.localeCompare(b.reason));
    pack.citations = [
      ...pack.evidence.memory.map((entry, index) => ({ id: `M${index + 1}`, source: "memory", path: entry.path, summary: entry.summary })),
      ...pack.evidence.rag.map((entry, index) => ({ id: `R${index + 1}`, source: "rag", path: entry.path, line: entry.startLine, summary: entry.summary })),
      ...pack.evidence.codeGraph.map((entry, index) => ({ id: `G${index + 1}`, source: "codegraph", path: entry.path, line: entry.startLine, summary: entry.summary })),
    ];
    markdown = formatCompactContextPack(pack);
  }
  pack.tokenBudget.estimatedTokens = estimateTokens(markdown);
  pack.tokenBudget.pass = pack.tokenBudget.estimatedTokens <= tokenBudget;
  pack.evidencePacket = buildSharedEvidencePacket({
    query: pack.query,
    memory: pack.evidence.memory,
    rag: pack.evidence.rag,
    codeGraph: pack.evidence.codeGraph,
    citations: pack.citations,
    confidence: pack.confidence,
    freshness: {
      memory: pack.evidence.memory.length ? "current" : "missing",
      rag: pack.evidence.rag.length ? "current" : "missing",
      codeGraph: pack.evidence.codeGraph.length ? "current" : "missing",
    },
    redactionStatus: "not-needed",
    tokenBudget: pack.tokenBudget,
    omittedEvidence: pack.omittedEvidence,
  });
  pack.markdown = markdown;
  return pack;
}

export function formatCompactContextPack(pack = {}) {
  const memory = pack.evidence?.memory || [];
  const rag = pack.evidence?.rag || [];
  const graph = pack.evidence?.codeGraph || [];
  return [
    "SUPERVIBE_CODE_SEARCH_CONTEXT_PACK",
    `QUERY: ${pack.query || "none"}`,
    `CONFIDENCE: ${pack.confidence?.level || "unknown"} (${pack.confidence?.score ?? 0})`,
    `CITATIONS: ${(pack.citations || []).map((citation) => citation.id).join(", ") || "none"}`,
    "",
    "## Memory Evidence",
    formatPackRows(memory, "M", (entry) => `${entry.path || entry.id || "memory"} score=${formatNumber(entry.score)} confidence=${entry.confidence ?? "unknown"} ${entry.summary || ""}`),
    "",
    "## RAG Evidence",
    formatPackRows(rag, "R", (entry) => `${entry.path}:${entry.startLine || 1}-${entry.endLine || entry.startLine || 1} score=${formatNumber(entry.score)} ${entry.kind || "chunk"}${entry.name ? `:${entry.name}` : ""}\n  ${entry.snippet || ""}`),
    "",
    "## CodeGraph Evidence",
    formatPackRows(graph, "G", (entry) => `${entry.path}:${entry.startLine || 1} [${entry.kind || "symbol"}:${entry.name || "unknown"}] distance=${entry.distance ?? 0} via=${entry.via || entry.seed || "graph"}`),
    "",
    "## Graph Warnings",
    formatList(pack.graphWarnings || []),
    "",
    "## Omitted Evidence",
    formatList((pack.omittedEvidence || []).map((entry) => `${entry.source}: ${entry.reason}`)),
    "",
    "## Retrieval",
    formatList([
      `policy=${pack.retrieval?.policy || "unknown"}`,
      `modes=${pack.retrieval?.usedModes?.join(",") || "none"}`,
      `fallback=${pack.retrieval?.fallback?.reason || "none"}`,
    ]),
    "",
    "## Token Budget",
    `- Estimated tokens: ${pack.tokenBudget?.estimatedTokens || estimateTokens(JSON.stringify(pack))}/${pack.tokenBudget?.maxTokens || "unknown"}`,
    `- Trimmed: ${Boolean(pack.tokenBudget?.trimmed)}`,
  ].join("\n");
}

async function main() {
const { values, positionals } = parseArgs({
  options: {
    query: { type: 'string', short: 'q', default: '' },
    callers: { type: 'string', default: '' },
    callees: { type: 'string', default: '' },
    neighbors: { type: 'string', default: '' },
    'top-symbols': { type: 'string', default: '' },
    'symbol-search': { type: 'string', default: '' },
    impact: { type: 'string', default: '' },
    files: { type: 'string', default: '' },
    context: { type: 'string', default: '' },
    'task-type': { type: 'string', default: '' },
    'repo-map': { type: 'boolean', default: false },
    depth: { type: 'string', default: '1' },
    format: { type: 'string', default: 'flat' },
    lang: { type: 'string', default: '' },
    kind: { type: 'string', default: '' },
    limit: { type: 'string', short: 'n', default: '10' },
    'no-semantic': { type: 'boolean', default: false },
    'debug-ranking': { type: 'boolean', default: false },
    'context-pack': { type: 'boolean', default: false },
    'max-tokens': { type: 'string', default: '1200' },
    json: { type: 'boolean', default: false }
  },
  strict: false,
  allowPositionals: true,
});

if (!values.query && positionals.length > 0) {
  values.query = positionals.join(' ');
}

if (!values.query && !values.callers && !values.callees && !values.neighbors && !values['top-symbols'] && !values['symbol-search'] && !values.impact && !values.files && !values.context && !values['repo-map'] && !values['context-pack']) {
  console.error('Usage:');
  console.error('  search-code.mjs --query "<text>" [--lang ...] [--kind ...] [--limit N]');
  console.error('  search-code.mjs "<text>" [--limit N] [--debug-ranking]');
  console.error('  search-code.mjs --context-pack --query "<task>" [--max-tokens 1200] [--json]');
  console.error('  supervibe-context-pack.mjs --query "<text>" --json   # coordinated memory/RAG/codegraph pack');
  console.error('  search-code.mjs --callers "<symbol-name-or-id>"');
  console.error('  search-code.mjs --callees "<symbol-name-or-id>"');
  console.error('  search-code.mjs --neighbors "<symbol-name-or-id>" --depth 2');
  console.error('  search-code.mjs --top-symbols 20 [--kind class]');
  console.error('  search-code.mjs --symbol-search "<query>" [--kind function]');
  console.error('  search-code.mjs --impact "<symbol-name-or-id>" --depth 2');
  console.error('  search-code.mjs --files "." [--lang typescript] [--format flat]');
  console.error('  search-code.mjs --context "<task or symbol>" [--no-semantic]');
  console.error('  search-code.mjs --repo-map --query "<task>"');
  process.exit(1);
}

const limit = parseInt(values.limit, 10);

if (values['context-pack'] || values.format === 'context-pack') {
  const pack = await buildLiveCompactContextPack({
    rootDir: PROJECT_ROOT,
    query: values.query || values.context || '',
    limit,
    maxTokens: values['max-tokens'],
    useEmbeddings: !values['no-semantic'],
    taskType: values['task-type'] || undefined,
  });
  if (values.json) console.log(JSON.stringify(pack, null, 2));
  else console.log(pack.markdown);
  process.exit(0);
}

if (values.context) {
  const context = await buildCodeGraphContextFromReadSnapshot({
    rootDir: PROJECT_ROOT,
    query: values.context,
    limit,
    graphDepth: parseInt(values.depth, 10),
    useEmbeddings: !values['no-semantic'],
    taskType: values['task-type'] || undefined,
  });
  if (values.json) console.log(JSON.stringify(context, null, 2));
  else console.log(context.markdown);
  process.exit(0);
}
const readSnapshot = await openCodeIndexReadSnapshot({
  rootDir: PROJECT_ROOT,
  useEmbeddings: !values['no-semantic'],
  purpose: `search-code:${values.context ? 'context' : 'query'}`,
});
const store = readSnapshot.store;

let results;
let mode;
let retrieval;

if (values['repo-map']) {
  mode = 'repo-map';
  const repoMap = await buildRepoMap({ rootDir: PROJECT_ROOT, tier: 'standard' });
  results = selectRepoMapContext(repoMap, { tier: 'standard', query: values.query || values.context || '' });
} else if (values.callers) {
  mode = 'callers';
  results = findCallers(store.db, values.callers).slice(0, limit);
  if (results.length === 0) {
    const candidates = disambiguate(store.db, values.callers);
    if (candidates.length > 1) {
      console.log(`Symbol "${values.callers}" matches ${candidates.length} definitions — narrow with full ID:`);
      for (const c of candidates.slice(0, 10)) {
        console.log(`  ${c.id}`);
      }
      store.close();
      process.exit(0);
    }
  }
} else if (values.callees) {
  mode = 'callees';
  results = findCallees(store.db, values.callees).slice(0, limit);
} else if (values.neighbors) {
  mode = 'neighbors';
  results = neighborhood(store.db, values.neighbors, {
    depth: parseInt(values.depth, 10)
  }).slice(0, limit);
} else if (values['top-symbols']) {
  mode = 'top-symbols';
  results = topSymbolsByDegree(store.db, {
    limit: parseInt(values['top-symbols'], 10),
    kind: values.kind || null
  });
} else if (values['symbol-search']) {
  mode = 'symbol-search';
  results = searchSymbols(store.db, values['symbol-search'], {
    limit,
    kinds: values.kind ? [values.kind] : []
  });
} else if (values.impact) {
  mode = 'impact';
  results = impactRadius(store.db, values.impact, {
    depth: parseInt(values.depth, 10),
    limit
  }).nodes;
} else if (values.files) {
  mode = 'files';
  results = listIndexedFiles(store.db, {
    pathPrefix: values.files,
    language: values.lang || '',
    limit
  });
} else if (values.context) {
  throw new Error('unreachable context branch');
} else {
  mode = 'semantic';
  const search = await runHybridCodeSearch(store, {
    query: values.query,
    language: values.lang || null,
    kind: values.kind || null,
    limit,
    semantic: !values['no-semantic'],
  });
  results = search.results;
  retrieval = search.retrieval;
}

readSnapshot.close();

if (mode === 'repo-map') {
  if (values.json) console.log(JSON.stringify(results, null, 2));
  else console.log(formatRepoMapContext(results));
  process.exit(0);
}

if (values.json) {
  console.log(JSON.stringify({ mode, retrieval, results }, null, 2));
  process.exit(0);
}

if (results.length === 0) {
  console.log(`No matches (mode: ${mode}).`);
  if (retrieval) console.log(formatHybridRetrievalEvidence(retrieval));
  process.exit(0);
}

console.log(`Found ${results.length} ${mode} matches:\n`);
if (retrieval) console.log(`${formatHybridRetrievalEvidence(retrieval)}\n`);
for (const [i, r] of results.entries()) {
  if (mode === 'semantic') {
    console.log(`${i + 1}. ${r.file}:${r.startLine}-${r.endLine}  [${r.kind}${r.name ? ': ' + r.name : ''}, ${r.language}]`);
    console.log(`   score=${r.score.toFixed(3)} bm25=${r.bm25.toFixed(2)} semantic=${r.semantic.toFixed(3)}`);
    if (values['debug-ranking']) {
      console.log(`   mode=${r.retrievalMode} generated=${r.generatedSource} components=${JSON.stringify(r.scoreComponents)}`);
    }
    console.log(`   ${r.snippet.split('\n').slice(0, 4).join('\n   ')}\n`);
  } else if (mode === 'callers') {
    console.log(`${i + 1}. ${r.path}:${r.startLine}-${r.endLine}  [${r.kind}: ${r.name}]  ←${r.edgeKind}→`);
  } else if (mode === 'callees') {
    console.log(`${i + 1}. ${r.toName}  →${r.kind}→  (target id: ${r.toId || '<unresolved-or-external>'})`);
  } else if (mode === 'neighbors') {
    console.log(`${i + 1}. [d=${r.distance}] ${r.path}:${r.startLine}  [${r.kind}: ${r.name}]`);
  } else if (mode === 'top-symbols') {
    console.log(`${i + 1}. ${r.path}  [${r.kind}: ${r.name}]  in=${r.inDegree} out=${r.outDegree} total=${r.totalDegree}`);
  } else if (mode === 'symbol-search') {
    console.log(`${i + 1}. ${r.path}:${r.startLine}-${r.endLine}  [${r.kind}: ${r.name}]  score=${r.score}`);
  } else if (mode === 'impact') {
    console.log(`${i + 1}. [d=${r.distance}] ${r.path}:${r.startLine}  [${r.kind}: ${r.name}]  via=${r.via || 'graph'}`);
  } else if (mode === 'files') {
    if (values.format === 'grouped') {
      console.log(`${i + 1}. [${r.language}] ${r.path} (${r.symbolCount} symbols, ${r.lineCount} lines)`);
    } else {
      console.log(`${i + 1}. ${r.path}  [${r.language}, symbols=${r.symbolCount}, lines=${r.lineCount}]`);
    }
  }
}

}

function normalizeMemoryEvidence(rows = []) {
  return (rows || []).map((row) => ({
    id: row.id || row.file || "memory",
    path: normalizePath(row.file || row.path || row.id || "memory"),
    type: row.type || row.category || "memory",
    score: finiteNumber(row.score, 0),
    confidence: row.confidence ?? null,
    summary: truncate(row.summary || row.content || "", 220),
  })).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path) || a.id.localeCompare(b.id));
}

function normalizeRagEvidence(rows = []) {
  return (rows || []).map((row) => ({
    path: normalizePath(row.file || row.path || ""),
    startLine: finiteNumber(row.startLine, 1),
    endLine: finiteNumber(row.endLine, row.startLine || 1),
    kind: row.kind || "chunk",
    name: row.name || "",
    score: finiteNumber(row.scoreComponents?.adjusted ?? row.score, 0),
    semantic: finiteNumber(row.semantic, 0),
    bm25: finiteNumber(row.bm25, 0),
    sourceBacked: Boolean(row.sourceBacked),
    ownerMatch: Boolean(row.ownerMatch),
    snippet: truncate(String(row.snippet || "").split(/\r?\n/).slice(0, 4).join("\n"), 360),
    summary: `${normalizePath(row.file || row.path || "")}:${row.startLine || 1}`,
  })).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path) || a.startLine - b.startLine);
}

function normalizeGraphEvidence(context = null) {
  const rows = [
    ...(context?.graphEvidence || []),
    ...((context?.impact?.nodes || []).filter((row) => Number(row.distance || 0) > 0)),
    ...(context?.entrySymbols || []).map((row) => ({ ...row, path: row.path, distance: 0, via: "symbol-search" })),
  ];
  const seen = new Set();
  const result = [];
  for (const row of rows) {
    const path = normalizePath(row.path || row.file || "");
    const key = `${path}:${row.startLine || 1}:${row.kind || ""}:${row.name || ""}`;
    if (!path || seen.has(key)) continue;
    seen.add(key);
    result.push({
      path,
      startLine: finiteNumber(row.startLine, 1),
      kind: row.kind || "symbol",
      name: row.name || row.toName || "",
      distance: finiteNumber(row.distance, 0),
      via: row.via || row.seed || "graph",
      score: finiteNumber(row.score, 0),
      summary: `${path}:${row.startLine || 1} ${row.name || row.kind || "symbol"}`,
    });
  }
  return result.sort((a, b) => a.distance - b.distance || a.path.localeCompare(b.path) || a.startLine - b.startLine);
}

function collectGraphWarnings(context = null) {
  return [
    ...(context?.quality?.warnings || []),
    ...(context?.taskTypeGate?.warnings || []),
    ...(context?.taskTypeGate?.failures || []).map((failure) => `failure: ${failure}`),
  ].filter(Boolean).filter((warning, index, all) => all.indexOf(warning) === index).sort();
}

function normalizeOmittedEvidence({
  omittedEvidence = [],
  memoryEvidence = [],
  ragEvidence = [],
  graphEvidence = [],
  codeGraphContext = null,
} = {}) {
  const omitted = [...(omittedEvidence || [])];
  if (!memoryEvidence.length && !omitted.some((entry) => entry.source === "memory")) {
    omitted.push({ source: "memory", reason: "no matching project memory entries found" });
  }
  if (!ragEvidence.length && !omitted.some((entry) => entry.source === "rag")) {
    omitted.push({ source: "rag", reason: "no matching code RAG chunks found" });
  }
  if (!graphEvidence.length && !omitted.some((entry) => entry.source === "codegraph")) {
    omitted.push({
      source: "codegraph",
      reason: codeGraphContext ? "CodeGraph query returned no graph nodes" : "CodeGraph context unavailable",
    });
  }
  return omitted.map((entry) => ({
    source: String(entry.source || "unknown"),
    reason: String(entry.reason || "not provided"),
  })).sort((a, b) => a.source.localeCompare(b.source) || a.reason.localeCompare(b.reason));
}

function calculatePackConfidence({ memoryEvidence, ragEvidence, graphEvidence, graphWarnings, retrieval, omissions }) {
  let score = 0.2;
  if (memoryEvidence.length) score += 0.15;
  if (ragEvidence.length) score += 0.35;
  if (graphEvidence.length) score += 0.2;
  if (retrieval?.fallback?.used) score -= 0.08;
  score -= Math.min(0.2, (graphWarnings.length || 0) * 0.04);
  score -= Math.min(0.18, (omissions.length || 0) * 0.03);
  score = Math.max(0, Math.min(1, Number(score.toFixed(2))));
  return {
    score,
    level: score >= 0.75 ? "high" : score >= 0.45 ? "medium" : "low",
    reasons: [
      memoryEvidence.length ? "memory evidence available" : "memory evidence omitted",
      ragEvidence.length ? "RAG evidence available" : "RAG evidence omitted",
      graphEvidence.length ? "CodeGraph evidence available" : "CodeGraph evidence omitted",
      ...(graphWarnings.length ? ["graph warnings present"] : []),
    ],
  };
}

function formatPackRows(rows, prefix, formatter) {
  if (!rows.length) return "- none";
  return rows.map((row, index) => `- [${prefix}${index + 1}] ${formatter(row)}`).join("\n");
}

function formatList(items) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return "- none";
  return list.map((item) => `- ${item}`).join("\n");
}

function normalizeTokenBudget(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1200;
  return Math.trunc(parsed);
}

function estimateTokens(text = "") {
  return Math.ceil(String(text || "").length / 4);
}

function truncate(text = "", maxLength = 220) {
  const value = String(text || "").replace(/\s+$/g, "");
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 12)).replace(/\s+$/g, "")} [trimmed]`;
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizePath(path = "") {
  return String(path || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function formatNumber(value) {
  return Number(finiteNumber(value, 0)).toFixed(3);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`search-code error: ${err.message}`);
    process.exit(1);
  });
}
