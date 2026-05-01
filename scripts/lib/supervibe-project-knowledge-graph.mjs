import { buildRepoMap } from "./supervibe-repo-map.mjs";
import { curateProjectMemory, readMarkdownMemoryEntries } from "./supervibe-memory-curator.mjs";

export async function buildProjectKnowledgeGraph({ rootDir = process.cwd(), curation = null, now = new Date().toISOString() } = {}) {
  const resolvedCuration = curation || await curateProjectMemory({ rootDir, now, rebuildSqlite: false });
  const entries = await readMarkdownMemoryEntries({ rootDir, now });
  const repoMap = await buildRepoMap({ rootDir, tier: "tiny", maxFiles: 80 });
  const nodes = [];
  const edges = [];
  const addNode = createNodeAdder(nodes);
  const addEdge = createEdgeAdder(edges);

  for (const entry of entries) {
    const lifecycle = resolvedCuration.lifecycle?.byId?.[entry.id] || {};
    addNode({
      id: `memory:${entry.id}`,
      type: entry.type || "memory",
      label: entry.id,
      validFrom: entry.date || null,
      validTo: lifecycle.supersededBy?.length ? now : null,
      sourceCitation: entry.file,
      stale: Boolean(lifecycle.stale),
      confidence: entry.confidence,
    });
    addNode({ id: `agent:${entry.agent}`, type: "agent", label: entry.agent, validFrom: entry.date || null, sourceCitation: entry.file });
    addEdge(`memory:${entry.id}`, `agent:${entry.agent}`, "created-by", { sourceCitation: entry.file, validFrom: entry.date || null });
    for (const tag of entry.tags) {
      addNode({ id: `tag:${tag}`, type: "tag", label: tag, sourceCitation: entry.file });
      addEdge(`memory:${entry.id}`, `tag:${tag}`, "tagged", { sourceCitation: entry.file, validFrom: entry.date || null });
    }
    for (const target of entry.supersedes) addEdge(`memory:${entry.id}`, `memory:${target}`, "supersedes", { sourceCitation: entry.file, validFrom: entry.date || null });
    for (const target of entry.contradicts) addEdge(`memory:${entry.id}`, `memory:${target}`, "contradicts", { sourceCitation: entry.file, validFrom: entry.date || null, reviewRequired: true });
    for (const filePath of extractReferencedFiles(entry.body)) {
      addNode({ id: `file:${filePath}`, type: "file", label: filePath, sourceCitation: entry.file });
      addEdge(`memory:${entry.id}`, `file:${filePath}`, "mentions-file", { sourceCitation: entry.file, validFrom: entry.date || null });
    }
  }

  for (const file of repoMap.files || []) {
    addNode({ id: `file:${file.path}`, type: "file", label: file.path, sourceCitation: file.path });
    for (const symbol of file.symbols || []) {
      const symbolId = `symbol:${file.path}#${symbol.name}`;
      addNode({ id: symbolId, type: "symbol", label: symbol.name, sourceCitation: file.path, exported: symbol.exported, validFrom: null });
      addEdge(`file:${file.path}`, symbolId, "contains-symbol", { sourceCitation: file.path });
    }
  }

  return {
    schemaVersion: 1,
    generatedAt: now,
    rootDir,
    nodes: nodes.sort((a, b) => a.id.localeCompare(b.id)),
    edges: edges.sort((a, b) => `${a.from}:${a.type}:${a.to}`.localeCompare(`${b.from}:${b.type}:${b.to}`)),
    summary: summarize(nodes, edges),
  };
}

export function queryProjectKnowledgeGraph(graph = {}, { query = "", includeHistory = false } = {}) {
  const terms = String(query || "").toLowerCase().split(/[^a-z0-9_-]+/).filter((term) => term.length >= 3);
  const nodes = (graph.nodes || []).filter((node) => {
    if (!includeHistory && node.validTo) return false;
    const haystack = `${node.id} ${node.label} ${node.type} ${node.sourceCitation}`.toLowerCase();
    return terms.length === 0 || terms.some((term) => haystack.includes(term));
  });
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = (graph.edges || []).filter((edge) => nodeIds.has(edge.from) || nodeIds.has(edge.to));
  return { query, includeHistory, nodes, edges };
}

export function formatKnowledgeGraphSearch(graph = {}, { query = "", includeHistory = false } = {}) {
  const result = queryProjectKnowledgeGraph(graph, { query, includeHistory });
  return [
    "SUPERVIBE_PROJECT_KNOWLEDGE_GRAPH",
    `QUERY: ${query || "none"}`,
    `NODES: ${graph.nodes?.length || 0}`,
    `EDGES: ${graph.edges?.length || 0}`,
    `MATCHED_NODES: ${result.nodes.length}`,
    `MATCHED_EDGES: ${result.edges.length}`,
    `INCLUDE_HISTORY: ${Boolean(includeHistory)}`,
    ...result.nodes.slice(0, 8).map((node) => `- ${node.type}:${node.label} citation=${node.sourceCitation || "none"}${node.validTo ? " superseded" : ""}`),
  ].join("\n");
}

function createNodeAdder(nodes) {
  const seen = new Map();
  return (node) => {
    if (!node.id || seen.has(node.id)) return seen.get(node.id);
    const normalized = {
      validFrom: null,
      validTo: null,
      sourceCitation: null,
      ...node,
    };
    seen.set(node.id, normalized);
    nodes.push(normalized);
    return normalized;
  };
}

function createEdgeAdder(edges) {
  const seen = new Set();
  return (from, to, type, data = {}) => {
    const key = `${from}:${type}:${to}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ from, to, type, validFrom: null, validTo: null, sourceCitation: null, ...data });
  };
}

function extractReferencedFiles(body = "") {
  return [...new Set([...String(body).matchAll(/(?:scripts|src|commands|skills|agents|rules|docs)\/[A-Za-z0-9_./-]+\.[A-Za-z0-9]+/g)].map((match) => match[0]))];
}

function summarize(nodes, edges) {
  return {
    totalNodes: nodes.length,
    totalEdges: edges.length,
    byType: nodes.reduce((acc, node) => {
      acc[node.type] = (acc[node.type] || 0) + 1;
      return acc;
    }, {}),
    supersessionEdges: edges.filter((edge) => edge.type === "supersedes").length,
    contradictionEdges: edges.filter((edge) => edge.type === "contradicts").length,
  };
}
