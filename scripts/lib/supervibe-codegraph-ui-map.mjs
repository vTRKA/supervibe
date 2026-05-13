import { CODEGRAPH_INDEX_COMMAND, SOURCE_RAG_INDEX_COMMAND } from "./supervibe-command-catalog.mjs";

const DYNAMIC_NAME_PATTERN = /^(?:this|module|exports|default|constructor|prototype|require|import|then|catch|map|filter|reduce|forEach|push|set|get|has|emit|on|off)$/i;
const EXTERNAL_NAME_PATTERN = /^(?:node:|@?[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9._-]+)*)$/i;
const DEFAULT_LINKED_PACKET_LIMIT = 6;
const DEFAULT_CODEGRAPH_MAP_MAX_NODES = 32;
const DEFAULT_CODEGRAPH_MAP_MAX_EDGES = 48;

export function buildUnresolvedEdgeDiagnosticsFromStore(store, { limit = 8 } = {}) {
  const rows = store.db.prepare(`
    SELECT s.path AS fromPath,
           e.to_name AS toName,
           e.kind AS edgeKind,
           COUNT(candidate.id) AS candidateCount,
           COUNT(*) AS count
    FROM code_edges e
    JOIN code_symbols s ON s.id = e.from_id
    LEFT JOIN code_symbols candidate ON candidate.name = e.to_name
    WHERE e.to_id IS NULL
    GROUP BY s.path, e.to_name, e.kind
    ORDER BY count DESC, s.path ASC, e.to_name ASC
    LIMIT ?
  `).all(limit * 12);
  return buildUnresolvedEdgeDiagnostics(rows, { limit });
}

export function buildUnresolvedEdgeDiagnostics(rows = [], { limit = 8 } = {}) {
  const classes = new Map();
  const files = new Map();
  let total = 0;
  for (const row of rows || []) {
    const count = numberOrZero(row.count || row.n || 1);
    total += count;
    const classification = classifyUnresolvedEdge(row);
    classes.set(classification, (classes.get(classification) || 0) + count);
    const file = row.fromPath || row.path || "unknown";
    const current = files.get(file) || { path: file, count: 0, classes: new Map(), examples: [] };
    current.count += count;
    current.classes.set(classification, (current.classes.get(classification) || 0) + count);
    if (current.examples.length < 3) current.examples.push(`${row.edgeKind || "edge"}:${row.toName || "unknown"} (${classification})`);
    files.set(file, current);
  }

  const classBreakdown = [...classes.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const topAffectedFiles = [...files.values()]
    .map((file) => ({
      path: file.path,
      count: file.count,
      classes: [...file.classes.entries()]
        .map(([name, count]) => `${name}:${count}`)
        .sort()
        .join(", "),
      examples: file.examples,
    }))
    .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path))
    .slice(0, limit);

  return {
    total,
    classBreakdown,
    topAffectedFiles,
    limitations: [
      "Cross-file resolution intentionally leaves ambiguous same-name symbols unresolved instead of guessing.",
      "JavaScript dynamic dispatch, re-exports, computed properties, and package imports can create useful but unresolved edges.",
    ],
  };
}

export function classifyUnresolvedEdge(row = {}) {
  const toName = String(row.toName || row.to_name || "").trim();
  const edgeKind = String(row.edgeKind || row.kind || "").toLowerCase();
  const candidateCount = numberOrZero(row.candidateCount || row.candidates);
  if (candidateCount > 1) return "ambiguous-local-symbol";
  if (candidateCount === 1) return "import-or-scope-limitation";
  if (edgeKind.includes("import") || /^\.{1,2}\//.test(toName) || EXTERNAL_NAME_PATTERN.test(toName) && toName.includes("/")) {
    return "external-or-reexport";
  }
  if (DYNAMIC_NAME_PATTERN.test(toName) || /[.[\]?$]/.test(toName)) return "dynamic-language-pattern";
  return "missing-symbol";
}

export function formatUnresolvedEdgeDiagnostics(diagnostics = {}) {
  const lines = [
    "SUPERVIBE_CODEGRAPH_UNRESOLVED_EDGES",
    `TOTAL_SAMPLE: ${diagnostics.total || 0}`,
    `CLASSES: ${(diagnostics.classBreakdown || []).map((item) => `${item.name}:${item.count}`).join(", ") || "none"}`,
    "TOP_AFFECTED_FILES:",
  ];
  const files = diagnostics.topAffectedFiles || [];
  if (!files.length) lines.push("  - none");
  for (const file of files) {
    lines.push(`  - ${file.path}: unresolved=${file.count} classes=${file.classes || "unknown"}`);
    if (file.examples?.length) lines.push(`    examples=${file.examples.join(" | ")}`);
  }
  lines.push("LIMITATIONS:");
  for (const limitation of diagnostics.limitations || []) lines.push(`  - ${limitation}`);
  return lines.join("\n");
}

export function buildCodeGraphReadinessUi({
  indexGate = {},
  unresolvedDiagnostics = {},
  watcherDiagnostics = {},
  graphStats = {},
} = {}) {
  const failedCodes = (indexGate.failedGates || []).map((item) => item.code);
  const warningCodes = (indexGate.warnings || []).map((item) => item.code);
  const stale = failedCodes.includes("content-stale") || failedCodes.includes("stale-rows") || watcherDiagnostics.heartbeat?.status === "stale";
  const sourceReady = indexGate.ready === true && !failedCodes.includes("source-coverage");
  const actionableHotspots = (unresolvedDiagnostics.topAffectedFiles || []).filter((file) => file.count >= 10).slice(0, 5);
  const ready = indexGate.ready === true && !stale;
  return {
    ready,
    sourceReady,
    stale,
    failedCodes,
    warningCodes,
    actionableHotspots,
    edgeResolutionRate: numberOrZero(graphStats.edgeResolutionRate),
    repairCommand: stale ? SOURCE_RAG_INDEX_COMMAND : CODEGRAPH_INDEX_COMMAND,
    summary: ready
      ? "ready with actionable graph diagnostics"
      : stale
        ? "not ready because indexed content is stale"
        : sourceReady
          ? "source RAG ready; inspect graph hotspots before structural work"
          : "not ready; rebuild source and graph indexes",
  };
}

export function formatCodeGraphReadinessUi(ui = {}) {
  return [
    "SUPERVIBE_CODEGRAPH_READINESS",
    `READY: ${ui.ready === true}`,
    `SOURCE_READY: ${ui.sourceReady === true}`,
    `STALE: ${ui.stale === true}`,
    `EDGE_RESOLUTION: ${(numberOrZero(ui.edgeResolutionRate) * 100).toFixed(1)}%`,
    `FAILED: ${(ui.failedCodes || []).join(",") || "none"}`,
    `WARNINGS: ${(ui.warningCodes || []).join(",") || "none"}`,
    `SUMMARY: ${ui.summary || "unknown"}`,
    `REBUILD_COMMAND: ${ui.repairCommand || SOURCE_RAG_INDEX_COMMAND}`,
    "ACTIONABLE_HOTSPOTS:",
    ...formatHotspotLines(ui.actionableHotspots || []),
  ].join("\n");
}

export function buildQueryCenteredCodeGraphMapFromStore(store, {
  query = "",
  maxNodes = DEFAULT_CODEGRAPH_MAP_MAX_NODES,
  maxEdges = DEFAULT_CODEGRAPH_MAP_MAX_EDGES,
} = {}) {
  const symbols = store.db.prepare(`
    SELECT s.id AS id,
           s.name AS name,
           s.kind AS kind,
           s.path AS path,
           s.start_line AS startLine,
           (SELECT COUNT(*) FROM code_edges WHERE to_id = s.id) AS inDegree,
           (SELECT COUNT(*) FROM code_edges WHERE from_id = s.id) AS outDegree
    FROM code_symbols s
    ORDER BY s.path, s.start_line
    LIMIT 1000
  `).all();
  const edges = store.db.prepare(`
    SELECT from_id AS fromId, to_id AS toId, kind
    FROM code_edges
    WHERE to_id IS NOT NULL
    ORDER BY kind, from_id, to_id
    LIMIT 4000
  `).all();
  const baseStats = store.stats ? store.stats() : {};
  const filesWithSymbols = store.db.prepare("SELECT COUNT(DISTINCT path) AS n FROM code_symbols").get().n;
  const unresolvedDiagnostics = buildUnresolvedEdgeDiagnosticsFromStore(store);
  return buildQueryCenteredCodeGraphMap({
    query,
    symbols,
    edges,
    stats: {
      ...baseStats,
      filesWithSymbols,
    },
    unresolvedDiagnostics,
    maxNodes,
    maxEdges,
  });
}

export function buildQueryCenteredCodeGraphMap({
  query = "",
  symbols = [],
  edges = [],
  stats = {},
  unresolvedDiagnostics = {},
  maxNodes = DEFAULT_CODEGRAPH_MAP_MAX_NODES,
  maxEdges = DEFAULT_CODEGRAPH_MAP_MAX_EDGES,
} = {}) {
  const normalizedMaxNodes = positiveInt(maxNodes, DEFAULT_CODEGRAPH_MAP_MAX_NODES);
  const normalizedMaxEdges = positiveInt(maxEdges, DEFAULT_CODEGRAPH_MAP_MAX_EDGES);
  const terms = tokenizeGraphQuery(query);
  const scoredSymbols = (symbols || [])
    .map((symbol) => ({
      ...symbol,
      id: String(symbol.id || `${symbol.path}:${symbol.kind}:${symbol.name}:${symbol.startLine || 1}`),
      score: scoreGraphSymbol(symbol, terms),
      degree: numberOrZero(symbol.inDegree) + numberOrZero(symbol.outDegree),
    }))
    .sort((left, right) => right.score - left.score || right.degree - left.degree || String(left.path || "").localeCompare(String(right.path || "")) || numberOrZero(left.startLine) - numberOrZero(right.startLine));
  const relevant = scoredSymbols.filter((symbol) => terms.length === 0 || symbol.score > 0);
  const seeds = (relevant.length ? relevant : scoredSymbols).slice(0, Math.max(1, Math.min(normalizedMaxNodes, 6)));
  const byId = new Map(scoredSymbols.map((symbol) => [symbol.id, symbol]));
  const selected = new Map();
  for (const seed of seeds) selected.set(seed.id, { ...seed, seed: true });

  const connectedEdges = (edges || [])
    .map((edge) => ({
      fromId: String(edge.fromId || edge.from_id || edge.from || ""),
      toId: String(edge.toId || edge.to_id || edge.to || ""),
      kind: edge.kind || "references",
    }))
    .filter((edge) => edge.fromId && edge.toId);
  for (const edge of connectedEdges) {
    if (selected.size >= normalizedMaxNodes) break;
    const fromSelected = selected.has(edge.fromId);
    const toSelected = selected.has(edge.toId);
    if (fromSelected && !toSelected && byId.has(edge.toId)) selected.set(edge.toId, byId.get(edge.toId));
    if (toSelected && !fromSelected && byId.has(edge.fromId)) selected.set(edge.fromId, byId.get(edge.fromId));
  }

  const selectedIds = new Set([...selected.keys()].slice(0, normalizedMaxNodes));
  const nodes = [...selected.values()]
    .filter((symbol) => selectedIds.has(symbol.id))
    .sort((left, right) => Number(right.seed === true) - Number(left.seed === true)
      || right.score - left.score
      || right.degree - left.degree
      || String(left.path || "").localeCompare(String(right.path || ""))
      || numberOrZero(left.startLine || left.start_line) - numberOrZero(right.startLine || right.start_line)
      || String(left.name || "").localeCompare(String(right.name || "")))
    .slice(0, normalizedMaxNodes)
    .map((symbol) => ({
      id: symbol.id,
      label: symbol.name || symbol.id,
      name: symbol.name || "",
      type: "symbol",
      kind: symbol.kind || "symbol",
      path: symbol.path || "",
      startLine: numberOrZero(symbol.startLine || symbol.start_line || 1),
      value: symbol.degree,
      queryScore: symbol.score,
      selectedSeed: symbol.seed === true,
      detail: `${symbol.kind || "symbol"} ${symbol.name || symbol.id} in ${symbol.path || "unknown"}`,
    }));
  const finalIds = new Set(nodes.map((node) => node.id));
  const mapEdges = connectedEdges
    .filter((edge) => finalIds.has(edge.fromId) && finalIds.has(edge.toId))
    .slice(0, normalizedMaxEdges)
    .map((edge) => ({ from: edge.fromId, to: edge.toId, label: edge.kind, kind: edge.kind, weight: 2 }));
  const candidateCount = relevant.length || scoredSymbols.length;
  return {
    schemaVersion: 1,
    kind: "supervibe-query-centered-codegraph-map",
    label: "CodeGraph query-centered map",
    query: String(query || ""),
    selection: {
      mode: "query-centered",
      terms,
      seedCount: seeds.length,
      candidateCount,
      selected: nodes.map((node) => node.name || node.id),
      fallback: relevant.length === 0,
    },
    health: {
      sourceCoverage: {
        files: numberOrZero(stats.totalFiles || stats.files),
        filesWithSymbols: numberOrZero(stats.filesWithSymbols),
        coverage: numberOrZero(stats.totalFiles || stats.files) === 0 ? 0 : Number((numberOrZero(stats.filesWithSymbols) / numberOrZero(stats.totalFiles || stats.files)).toFixed(3)),
      },
      symbolCoverage: {
        totalSymbols: numberOrZero(stats.totalSymbols),
        selectedSymbols: nodes.length,
      },
      resolvedEdges: {
        resolved: numberOrZero(stats.resolvedEdges),
        total: numberOrZero(stats.totalEdges),
        rate: numberOrZero(stats.edgeResolutionRate),
      },
      unresolvedHotspots: (unresolvedDiagnostics.topAffectedFiles || []).slice(0, 5),
    },
    nodes,
    edges: mapEdges,
    projectionLimit: {
      maxNodes: normalizedMaxNodes,
      maxEdges: normalizedMaxEdges,
      nodeCount: nodes.length,
      edgeCount: mapEdges.length,
      truncated: candidateCount > normalizedMaxNodes || connectedEdges.filter((edge) => finalIds.has(edge.fromId) && finalIds.has(edge.toId)).length > normalizedMaxEdges,
    },
    limitations: [
      "This is a query-selected neighborhood, not total project coverage.",
      "Use source coverage, symbol coverage, resolved edges, and unresolved hotspots before trusting sparse relationships.",
    ],
  };
}

export function buildLinkedEvidencePacket({
  query = "",
  files = [],
  symbols = [],
  workItems = [],
  receipts = [],
  memory = [],
  now = new Date().toISOString(),
  limit = DEFAULT_LINKED_PACKET_LIMIT,
} = {}) {
  const nodes = new Map();
  const links = new Map();
  const staleLinks = [];
  const normalizedLimit = positiveInt(limit, DEFAULT_LINKED_PACKET_LIMIT);

  for (const file of files || []) addNode(nodes, fileNode(file));
  for (const symbol of symbols || []) addNode(nodes, symbolNode(symbol));
  for (const item of workItems || []) addNode(nodes, workItemNode(item));
  for (const receipt of receipts || []) addNode(nodes, receiptNode(receipt));
  for (const entry of memory || []) addNode(nodes, memoryNode(entry));

  const nodeList = [...nodes.values()];
  const filesByPath = new Map(nodeList.filter((node) => node.type === "file").map((node) => [node.path, node]));
  const symbolsByKey = new Map(nodeList.filter((node) => node.type === "symbol").flatMap((node) => [
    [node.id, node],
    [node.name, node],
    [`${node.path}:${node.name}`, node],
  ].filter(([key]) => key)));
  const workItemsById = new Map(nodeList.filter((node) => node.type === "work-item").map((node) => [node.workItemId, node]));
  const receiptsById = new Map(nodeList.filter((node) => node.type === "receipt").map((node) => [node.receiptId, node]));
  const memoryById = new Map(nodeList.filter((node) => node.type === "memory").map((node) => [node.memoryId, node]));

  for (const symbol of nodeList.filter((node) => node.type === "symbol")) {
    linkKnown({ links, from: symbol.id, to: fileNodeId(symbol.path), type: "defined-in", nodes, staleLinks, evidence: symbol.path });
  }

  for (const item of workItems || []) {
    const from = workItemNodeId(item);
    for (const ref of normalizeRefs(item.files || item.fileRefs || item.paths || item.evidence?.files)) {
      linkByPath({ links, from, ref, type: "touches-file", filesByPath, nodes, staleLinks });
    }
    for (const ref of normalizeRefs(item.symbols || item.graphSymbols || item.evidence?.symbols)) {
      linkByKey({ links, from, ref, type: "touches-symbol", byKey: symbolsByKey, nodes, staleLinks });
    }
    for (const ref of normalizeRefs(item.receiptIds || item.receipts || item.evidence?.receiptIds)) {
      linkByKey({ links, from, ref, type: "backed-by-receipt", byKey: receiptsById, nodes, staleLinks });
    }
    for (const ref of normalizeRefs(item.memoryIds || item.memory || item.evidence?.memoryIds)) {
      linkByKey({ links, from, ref, type: "uses-memory", byKey: memoryById, nodes, staleLinks });
    }
  }

  for (const receipt of receipts || []) {
    const from = receiptNodeId(receipt);
    for (const ref of normalizeRefs(receipt.inputEvidence || receipt.outputArtifacts || receipt.artifactLinks || receipt.evidence)) {
      if (isMemoryRef(ref)) linkByKey({ links, from, ref: memoryRefId(ref), type: "cites-memory", byKey: memoryById, nodes, staleLinks });
      else linkByPath({ links, from, ref, type: "cites-file", filesByPath, nodes, staleLinks });
    }
    for (const ref of normalizeRefs(receipt.graphSymbols || receipt.symbols)) {
      linkByKey({ links, from, ref, type: "cites-symbol", byKey: symbolsByKey, nodes, staleLinks });
    }
    for (const ref of normalizeRefs(receipt.workItemId || receipt.workItemIds || receipt.taskId || receipt.stage)) {
      linkByKey({ links, from, ref, type: "proves-work-item", byKey: workItemsById, nodes, staleLinks, required: false });
    }
  }

  for (const entry of memory || []) {
    const from = memoryNodeId(entry);
    for (const ref of normalizeRefs(entry.files || entry.fileRefs || entry.sourcePath || entry.path)) {
      linkByPath({ links, from, ref, type: "mentions-file", filesByPath, nodes, staleLinks, required: false });
    }
    for (const ref of normalizeRefs(entry.symbols || entry.graphSymbols)) {
      linkByKey({ links, from, ref, type: "mentions-symbol", byKey: symbolsByKey, nodes, staleLinks });
    }
    for (const ref of normalizeRefs(entry.workItemIds || entry.workItems || entry.relatedWorkItems)) {
      linkByKey({ links, from, ref, type: "mentions-work-item", byKey: workItemsById, nodes, staleLinks });
    }
    for (const ref of normalizeRefs(entry.receiptIds || entry.receipts)) {
      linkByKey({ links, from, ref, type: "mentions-receipt", byKey: receiptsById, nodes, staleLinks });
    }
  }

  for (const node of nodeList) {
    const stale = staleReason(node, now);
    if (stale) staleLinks.push({ type: "stale-node", from: node.id, to: null, evidence: node.path || node.id, reason: stale });
  }

  const sortedNodes = nodeList.sort(compareEvidenceNodes);
  const sortedLinks = [...links.values()].sort(compareEvidenceLinks);
  return {
    schemaVersion: 1,
    kind: "supervibe-linked-evidence-packet",
    query: String(query || ""),
    summary: {
      files: sortedNodes.filter((node) => node.type === "file").length,
      symbols: sortedNodes.filter((node) => node.type === "symbol").length,
      workItems: sortedNodes.filter((node) => node.type === "work-item").length,
      receipts: sortedNodes.filter((node) => node.type === "receipt").length,
      memory: sortedNodes.filter((node) => node.type === "memory").length,
      links: sortedLinks.length,
      staleLinks: staleLinks.length,
    },
    nodes: sortedNodes.slice(0, normalizedLimit * 5),
    links: sortedLinks.slice(0, normalizedLimit * 8),
    staleLinks: staleLinks.sort(compareStaleLinks).slice(0, normalizedLimit * 4),
    compact: {
      files: sortedNodes.filter((node) => node.type === "file").slice(0, normalizedLimit),
      symbols: sortedNodes.filter((node) => node.type === "symbol").slice(0, normalizedLimit),
      workItems: sortedNodes.filter((node) => node.type === "work-item").slice(0, normalizedLimit),
      receipts: sortedNodes.filter((node) => node.type === "receipt").slice(0, normalizedLimit),
      memory: sortedNodes.filter((node) => node.type === "memory").slice(0, normalizedLimit),
      links: sortedLinks.slice(0, normalizedLimit),
      staleLinks: staleLinks.sort(compareStaleLinks).slice(0, normalizedLimit),
    },
  };
}

export function buildCompactLinkedEvidencePacket(input = {}) {
  const packet = buildLinkedEvidencePacket(input);
  return {
    schemaVersion: packet.schemaVersion,
    kind: "supervibe-compact-linked-evidence-packet",
    query: packet.query,
    summary: packet.summary,
    evidence: packet.compact,
  };
}

export function formatLinkedEvidencePacket(packet = {}) {
  const evidence = packet.evidence || packet.compact || packet;
  return [
    "SUPERVIBE_LINKED_EVIDENCE_PACKET",
    `QUERY: ${packet.query || "none"}`,
    `FILES: ${packet.summary?.files || 0}`,
    `SYMBOLS: ${packet.summary?.symbols || 0}`,
    `WORK_ITEMS: ${packet.summary?.workItems || 0}`,
    `RECEIPTS: ${packet.summary?.receipts || 0}`,
    `MEMORY: ${packet.summary?.memory || 0}`,
    `LINKS: ${packet.summary?.links || 0}`,
    `STALE_LINKS: ${packet.summary?.staleLinks || 0}`,
    "LINKED_EVIDENCE:",
    ...formatEvidenceLinkLines(evidence.links || []),
    "STALE:",
    ...formatStaleLinkLines(evidence.staleLinks || []),
  ].join("\n");
}

export function applyGoldenRetrievalMaturityGate(report = {}, golden = {}) {
  const pass = golden.pass === true && numberOrZero(golden.summary?.total) > 0;
  if (pass) {
    const dimensions = (report.dimensions || []).map((item) => {
      if (item.id !== "code-graph-readiness") return item;
      return {
        ...item,
        evidence: `${item.evidence || "index evidence unavailable"}, ragGolden=pass total=${numberOrZero(golden.summary?.total)}`,
      };
    });
    return {
      ...report,
      ragGolden: {
        pass: true,
        summary: golden.summary || {},
      },
      dimensions,
      blockers: dimensions.filter((item) => !item.pass).map((item) => ({
        id: item.id,
        evidence: item.evidence,
        nextAction: item.nextAction,
      })),
    };
  }
  const reason = golden.summary?.total === 0
    ? "golden retrieval eval has no cases"
    : `golden retrieval eval pass=${golden.pass === true}`;
  const dimensions = (report.dimensions || []).map((item) => {
    if (item.id !== "code-graph-readiness") return item;
    return {
      ...item,
      score: Math.min(Number(item.score || 0), 0.5),
      pass: false,
      evidence: `${item.evidence || "index evidence unavailable"}, ragGolden=${reason}`,
      nextAction: "Run node scripts/supervibe-retrieval-eval.mjs --json and fix failing golden queries before claiming 10/10 maturity.",
    };
  });
  const score = Number(dimensions.reduce((sum, item) => sum + Number(item.score || 0), 0).toFixed(2));
  return {
    ...report,
    score,
    pass: false,
    status: score >= 9 ? "near-10-operational-gaps" : "hardening-required",
    globalMaturity: {
      ...(report.globalMaturity || {}),
      score: Math.min(Number(report.globalMaturity?.score ?? score), score),
      pass: false,
      status: "global-hardening-required",
    },
    dimensions,
    blockers: dimensions.filter((item) => !item.pass).map((item) => ({
      id: item.id,
      evidence: item.evidence,
      nextAction: item.nextAction,
    })),
    ragGolden: {
      pass: false,
      reason,
      summary: golden.summary || {},
    },
  };
}

function formatHotspotLines(hotspots = []) {
  if (!hotspots.length) return ["  - none"];
  return hotspots.map((item) => `  - ${item.path}: unresolved=${item.count} classes=${item.classes || "unknown"}`);
}

function addNode(nodes, node) {
  if (!node?.id) return;
  if (nodes.has(node.id)) {
    nodes.set(node.id, { ...nodes.get(node.id), ...node });
  } else {
    nodes.set(node.id, node);
  }
}

function fileNode(file = {}) {
  const path = normalizeEvidencePath(file.path || file.sourcePath || file.file || file.id);
  return {
    id: fileNodeId(path),
    type: "file",
    path,
    label: path,
    updatedAt: file.updatedAt || file.mtime || file.generatedAt || "",
    stale: file.stale === true,
  };
}

function symbolNode(symbol = {}) {
  const path = normalizeEvidencePath(symbol.path || symbol.file || symbol.sourcePath);
  const name = String(symbol.name || symbol.symbol || symbol.id || "unknown");
  const line = positiveInt(symbol.startLine || symbol.line, 0);
  return {
    id: symbol.id ? `symbol:${symbol.id}` : `symbol:${path}:${name}:${line || 1}`,
    type: "symbol",
    path,
    name,
    label: `${name} (${path}:${line || 1})`,
    kind: symbol.kind || "symbol",
    startLine: line || 1,
    updatedAt: symbol.updatedAt || "",
    stale: symbol.stale === true,
  };
}

function workItemNode(item = {}) {
  const workItemId = String(item.id || item.workItemId || item.taskId || item.stage || "unknown");
  return {
    id: workItemNodeId(item),
    type: "work-item",
    workItemId,
    label: item.title || item.summary || workItemId,
    status: item.status || "unknown",
    updatedAt: item.updatedAt || item.claimedAt || item.completedAt || "",
    stale: item.stale === true || item.staleClaim === true,
  };
}

function receiptNode(receipt = {}) {
  const receiptId = String(receipt.receiptId || receipt.id || receipt.path || receipt.__file || "unknown");
  return {
    id: receiptNodeId(receipt),
    type: "receipt",
    receiptId,
    path: normalizeEvidencePath(receipt.__file || receipt.path || receipt.receiptPath),
    label: receiptId,
    status: receipt.status || "unknown",
    updatedAt: receipt.completedAt || receipt.issuedAt || receipt.createdAt || "",
    stale: receipt.stale === true || receipt.status === "stale",
  };
}

function memoryNode(entry = {}) {
  const memoryId = String(entry.id || entry.memoryId || entry.sourcePath || entry.file || "unknown");
  return {
    id: memoryNodeId(entry),
    type: "memory",
    memoryId,
    path: normalizeEvidencePath(entry.file || entry.sourcePath || entry.path),
    label: entry.summary || entry.title || memoryId,
    confidence: entry.confidence ?? "unknown",
    updatedAt: entry.updatedAt || entry.date || "",
    stale: entry.stale === true || entry.freshness === "stale",
  };
}

function fileNodeId(value) {
  return `file:${normalizeEvidencePath(value)}`;
}

function workItemNodeId(item = {}) {
  return `work-item:${String(item.id || item.workItemId || item.taskId || item.stage || "unknown")}`;
}

function receiptNodeId(receipt = {}) {
  return `receipt:${String(receipt.receiptId || receipt.id || receipt.path || receipt.__file || "unknown")}`;
}

function memoryNodeId(entry = {}) {
  return `memory:${String(entry.id || entry.memoryId || entry.sourcePath || entry.file || "unknown")}`;
}

function linkKnown({ links, from, to, type, nodes, staleLinks, evidence }) {
  if (!nodes.has(from) || !nodes.has(to)) {
    staleLinks.push({ type, from, to, evidence: evidence || to, reason: "missing-linked-node" });
    return;
  }
  const key = `${from}->${to}:${type}`;
  links.set(key, { from, to, type, evidence: evidence || "" });
}

function linkByPath({ links, from, ref, type, filesByPath, nodes, staleLinks, required = true }) {
  const path = normalizeEvidencePath(ref);
  const file = filesByPath.get(path) || filesByPath.get(stripLineSuffix(path));
  if (!file) {
    if (required) staleLinks.push({ type, from, to: fileNodeId(path), evidence: ref, reason: "missing-file-link-target" });
    return;
  }
  linkKnown({ links, from, to: file.id, type, nodes, staleLinks, evidence: ref });
}

function linkByKey({ links, from, ref, type, byKey, nodes, staleLinks, required = true }) {
  const key = String(ref || "").trim();
  const target = byKey.get(key) || byKey.get(stripTypedRefPrefix(key));
  if (!target) {
    if (required) staleLinks.push({ type, from, to: null, evidence: ref, reason: "missing-link-target" });
    return;
  }
  linkKnown({ links, from, to: target.id, type, nodes, staleLinks, evidence: ref });
}

function normalizeRefs(value) {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.flatMap((item) => normalizeRefs(item));
  if (typeof value === "object") {
    return Object.values(value).flatMap((item) => normalizeRefs(item));
  }
  return String(value || "")
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeEvidencePath(value = "") {
  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .trim();
}

function stripLineSuffix(value = "") {
  return normalizeEvidencePath(value).replace(/:\d+(?:-\d+)?$/, "");
}

function stripTypedRefPrefix(value = "") {
  return String(value || "").replace(/^(?:memory|receipt|work-item|symbol|file):/, "");
}

function isMemoryRef(value = "") {
  return /^\.supervibe\/memory\//.test(normalizeEvidencePath(value)) || /^memory:/.test(String(value || ""));
}

function memoryRefId(value = "") {
  const ref = stripTypedRefPrefix(normalizeEvidencePath(value));
  const slug = ref.split("/").pop()?.replace(/\.(?:md|json|jsonl)$/i, "") || ref;
  return slug;
}

function staleReason(node = {}, now = new Date().toISOString()) {
  if (node.stale === true) return "node-marked-stale";
  const updated = Date.parse(node.updatedAt || "");
  const current = Date.parse(now || "");
  if (!Number.isFinite(updated) || !Number.isFinite(current)) return "";
  const ageDays = Math.floor((current - updated) / 86400000);
  if (ageDays > 30 && (node.type === "receipt" || node.type === "work-item")) return `${node.type}-older-than-30-days`;
  if (ageDays > 180 && node.type === "memory") return "memory-older-than-180-days";
  return "";
}

function compareEvidenceNodes(left, right) {
  return typeRank(left.type) - typeRank(right.type)
    || String(left.path || left.id).localeCompare(String(right.path || right.id))
    || String(left.label || "").localeCompare(String(right.label || ""));
}

function compareEvidenceLinks(left, right) {
  return left.from.localeCompare(right.from) || left.to.localeCompare(right.to) || left.type.localeCompare(right.type);
}

function compareStaleLinks(left, right) {
  return String(left.from || "").localeCompare(String(right.from || ""))
    || String(left.evidence || "").localeCompare(String(right.evidence || ""))
    || String(left.reason || "").localeCompare(String(right.reason || ""));
}

function typeRank(type) {
  return { file: 1, symbol: 2, "work-item": 3, receipt: 4, memory: 5 }[type] || 9;
}

function tokenizeGraphQuery(query = "") {
  return [...new Set(String(query || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length >= 3))];
}

function scoreGraphSymbol(symbol = {}, terms = []) {
  const name = String(symbol.name || "");
  const haystack = `${name.replace(/([a-z])([A-Z])/g, "$1 $2")} ${symbol.kind || ""} ${symbol.path || ""}`.toLowerCase();
  const degreeBoost = Math.min(5, numberOrZero(symbol.inDegree) + numberOrZero(symbol.outDegree)) / 100;
  if (!terms.length) return degreeBoost;
  let score = 0;
  for (const term of terms) {
    if (haystack.includes(term)) score += name.toLowerCase().includes(term) ? 3 : 1;
  }
  if (score > 0) score += degreeBoost;
  return Number(score.toFixed(3));
}

function formatEvidenceLinkLines(links = []) {
  if (!links.length) return ["  - none"];
  return links.map((link) => `  - ${link.from} -> ${link.to} (${link.type})`);
}

function formatStaleLinkLines(staleLinks = []) {
  if (!staleLinks.length) return ["  - none"];
  return staleLinks.map((link) => `  - ${link.from || "unknown"} -> ${link.to || "missing"} reason=${link.reason} evidence=${link.evidence || "unknown"}`);
}

function numberOrZero(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
