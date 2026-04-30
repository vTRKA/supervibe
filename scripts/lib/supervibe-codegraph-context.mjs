import { CodeStore } from "./code-store.mjs";
import { impactRadius, neighborhood, searchSymbols } from "./code-graph-queries.mjs";

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
