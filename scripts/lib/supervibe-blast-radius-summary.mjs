const DEFAULT_LIMITS = Object.freeze({
  files: 8,
  symbols: 8,
  evidence: 8,
  notes: 6,
});

export function buildBlastRadiusSummary(input = {}, options = {}) {
  const limits = normalizeLimits(options);
  const changedFiles = uniqueStrings(input.changedFiles || input.files || []);
  const changedSymbols = normalizeSymbols(input.changedSymbols || input.symbols || []);
  const ragEvidence = normalizeEvidenceRows(input.ragEvidence || input.rag || [], "rag", "R");
  const graphEvidence = normalizeEvidenceRows(input.graphEvidence || input.graph || input.codeGraphEvidence || [], "graph", "G");
  const unresolved = normalizeTextRows(input.unresolved || input.missingEvidence || input.missing || []);
  const caveats = normalizeTextRows(input.caveats || []);
  const reviewerNotes = normalizeTextRows(input.reviewerNotes || input.notes || []);
  const topAffectedFiles = rankAffectedFiles({
    changedFiles,
    changedSymbols,
    ragEvidence,
    graphEvidence,
    unresolved,
    limit: limits.files,
  });
  const topAffectedSymbols = rankAffectedSymbols({
    changedSymbols,
    ragEvidence,
    graphEvidence,
    limit: limits.symbols,
  });
  const evidenceCitations = [...ragEvidence, ...graphEvidence]
    .sort(compareEvidenceRows)
    .slice(0, limits.evidence);
  const missingEvidence = buildMissingEvidence({
    changedFiles,
    changedSymbols,
    ragEvidence,
    graphEvidence,
    unresolved,
  });
  const confidence = normalizeConfidence(input.confidence, {
    ragEvidence,
    graphEvidence,
    missingEvidence,
    unresolved,
    caveats,
  });
  const summary = {
    schemaVersion: 1,
    kind: "supervibe-blast-radius-summary",
    title: input.title || "Blast Radius Summary",
    taskId: input.taskId || input.itemId || null,
    changedFiles,
    changedSymbols,
    topAffectedFiles,
    topAffectedSymbols,
    evidenceCitations,
    evidenceCounts: {
      rag: ragEvidence.length,
      graph: graphEvidence.length,
      total: ragEvidence.length + graphEvidence.length,
    },
    missingEvidence,
    caveats: uniqueStrings([...caveats, ...unresolved.map((item) => `unresolved: ${item}`)]).slice(0, limits.notes),
    reviewerNotes: reviewerNotes.slice(0, limits.notes),
    confidence,
    reviewPacketText: "",
  };
  summary.reviewPacketText = formatBlastRadiusReviewPacket(summary);
  return summary;
}

export function formatBlastRadiusSummary(summary = {}, options = {}) {
  const includeReviewPacket = options.includeReviewPacket !== false;
  const lines = [
    "SUPERVIBE_BLAST_RADIUS_SUMMARY",
    `TITLE: ${summary.title || "Blast Radius Summary"}`,
    `TASK: ${summary.taskId || "none"}`,
    `CONFIDENCE: ${summary.confidence?.level || "unknown"} (${formatScore(summary.confidence?.score)})`,
    `EVIDENCE: rag=${summary.evidenceCounts?.rag || 0} graph=${summary.evidenceCounts?.graph || 0} total=${summary.evidenceCounts?.total || 0}`,
    "",
    "## Changed Files",
    formatList(summary.changedFiles || []),
    "",
    "## Top Affected Files",
    formatAffectedFiles(summary.topAffectedFiles || []),
    "",
    "## Top Affected Symbols",
    formatAffectedSymbols(summary.topAffectedSymbols || []),
    "",
    "## Evidence Citations",
    formatEvidenceCitations(summary.evidenceCitations || []),
    "",
    "## Missing Evidence",
    formatList(summary.missingEvidence || []),
    "",
    "## Caveats",
    formatList(summary.caveats || []),
    "",
    "## Reviewer Notes",
    formatList(summary.reviewerNotes || []),
  ];
  if (includeReviewPacket) {
    lines.push("", "## Review Packet Text", summary.reviewPacketText || formatBlastRadiusReviewPacket(summary));
  }
  return lines.join("\n");
}

export function formatBlastRadiusReviewPacket(summary = {}) {
  const files = inlineItems((summary.topAffectedFiles || []).map((file) => file.path), "none");
  const symbols = inlineItems((summary.topAffectedSymbols || []).map((symbol) => symbol.name), "none");
  const citations = inlineItems((summary.evidenceCitations || []).map((row) => row.citationId), "none");
  const missing = inlineItems(summary.missingEvidence || [], "none");
  const caveats = inlineItems(summary.caveats || [], "none");
  const confidence = `${summary.confidence?.level || "unknown"} (${formatScore(summary.confidence?.score)})`;
  return `Blast radius: files=${files}; symbols=${symbols}; evidence=${citations}; confidence=${confidence}; missing=${missing}; caveats=${caveats}.`;
}

export function summarizeBlastRadius(input = {}, options = {}) {
  return buildBlastRadiusSummary(input, options);
}

function normalizeLimits(options = {}) {
  return {
    files: positiveInteger(options.maxFiles ?? options.fileLimit, DEFAULT_LIMITS.files),
    symbols: positiveInteger(options.maxSymbols ?? options.symbolLimit, DEFAULT_LIMITS.symbols),
    evidence: positiveInteger(options.maxEvidence ?? options.evidenceLimit, DEFAULT_LIMITS.evidence),
    notes: positiveInteger(options.maxNotes ?? options.noteLimit, DEFAULT_LIMITS.notes),
  };
}

function normalizeSymbols(rows = []) {
  return asArray(rows).map((row) => {
    if (typeof row === "string") return { name: row, path: "", line: null, kind: "symbol" };
    return {
      name: stringOrEmpty(row.name || row.symbol || row.id || row.title),
      path: normalizePath(row.path || row.file || row.fromPath || ""),
      line: finiteNumberOrNull(row.line || row.startLine),
      kind: row.kind || row.type || "symbol",
      changeType: row.changeType || row.action || "",
    };
  }).filter((row) => row.name)
    .sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path) || numberCompare(a.line, b.line));
}

function normalizeEvidenceRows(rows = [], source, prefix) {
  return asArray(rows).map((row, index) => {
    const rowId = row.id == null ? "" : String(row.id);
    const citationId = row.citationId || (/^[A-Z]\d+$/.test(rowId) ? rowId : `${prefix}${index + 1}`);
    return {
      citationId: String(citationId),
      source,
      path: normalizePath(row.path || row.file || row.fromPath || row.toPath || ""),
      line: finiteNumberOrNull(row.line || row.startLine),
      endLine: finiteNumberOrNull(row.endLine),
      kind: row.kind || row.type || (source === "rag" ? "chunk" : "symbol"),
      name: stringOrEmpty(row.name || row.symbol || row.toName || row.title),
      summary: stringOrEmpty(row.summary || row.snippet || row.reason || row.via),
      score: finiteNumber(row.score, source === "graph" ? 0.8 : 0.6),
      distance: finiteNumberOrNull(row.distance),
      freshness: row.freshness || row.metadata?.freshness || "unknown",
    };
  }).filter((row) => row.path || row.name || row.summary)
    .sort(compareEvidenceRows);
}

function rankAffectedFiles({ changedFiles, changedSymbols, ragEvidence, graphEvidence, unresolved, limit }) {
  const files = new Map();
  for (const path of changedFiles) addFileScore(files, path, { changed: 3 });
  for (const symbol of changedSymbols) addFileScore(files, symbol.path, { symbol: symbol.name, changedSymbol: 2 });
  for (const row of ragEvidence) addFileScore(files, row.path, { rag: 1, citation: row.citationId, symbol: row.name });
  for (const row of graphEvidence) addFileScore(files, row.path, {
    graph: row.distance == null ? 1 : Math.max(1, 3 - Number(row.distance)),
    citation: row.citationId,
    symbol: row.name,
  });
  for (const item of unresolved) {
    const path = pathFromText(item);
    if (path) addFileScore(files, path, { unresolved: 1 });
  }
  return [...files.values()]
    .map(finalizeAffectedFile)
    .sort((a, b) => b.score - a.score || b.changed - a.changed || a.path.localeCompare(b.path))
    .slice(0, limit);
}

function rankAffectedSymbols({ changedSymbols, ragEvidence, graphEvidence, limit }) {
  const symbols = new Map();
  for (const symbol of changedSymbols) addSymbolScore(symbols, symbol.name, {
    changed: 3,
    path: symbol.path,
    line: symbol.line,
    kind: symbol.kind,
  });
  for (const row of ragEvidence) addSymbolScore(symbols, row.name, {
    rag: 1,
    path: row.path,
    line: row.line,
    kind: row.kind,
    citation: row.citationId,
  });
  for (const row of graphEvidence) addSymbolScore(symbols, row.name, {
    graph: row.distance == null ? 1 : Math.max(1, 3 - Number(row.distance)),
    path: row.path,
    line: row.line,
    kind: row.kind,
    citation: row.citationId,
  });
  return [...symbols.values()]
    .map(finalizeAffectedSymbol)
    .sort((a, b) => b.score - a.score || b.changed - a.changed || a.name.localeCompare(b.name))
    .slice(0, limit);
}

function addFileScore(files, path, update = {}) {
  const normalizedPath = normalizePath(path);
  if (!normalizedPath) return;
  const current = files.get(normalizedPath) || {
    path: normalizedPath,
    score: 0,
    changed: 0,
    ragHits: 0,
    graphHits: 0,
    unresolvedCount: 0,
    symbols: new Set(),
    citations: new Set(),
  };
  if (update.changed) {
    current.changed += 1;
    current.score += update.changed;
  }
  if (update.changedSymbol) current.score += update.changedSymbol;
  if (update.rag) {
    current.ragHits += 1;
    current.score += update.rag;
  }
  if (update.graph) {
    current.graphHits += 1;
    current.score += update.graph;
  }
  if (update.unresolved) {
    current.unresolvedCount += 1;
    current.score += update.unresolved;
  }
  if (update.symbol) current.symbols.add(update.symbol);
  if (update.citation) current.citations.add(update.citation);
  files.set(normalizedPath, current);
}

function addSymbolScore(symbols, name, update = {}) {
  const normalizedName = stringOrEmpty(name);
  if (!normalizedName) return;
  const current = symbols.get(normalizedName) || {
    name: normalizedName,
    score: 0,
    changed: 0,
    ragHits: 0,
    graphHits: 0,
    paths: new Set(),
    citations: new Set(),
    kind: update.kind || "symbol",
    line: update.line ?? null,
  };
  if (update.changed) {
    current.changed += 1;
    current.score += update.changed;
  }
  if (update.rag) {
    current.ragHits += 1;
    current.score += update.rag;
  }
  if (update.graph) {
    current.graphHits += 1;
    current.score += update.graph;
  }
  if (update.path) current.paths.add(normalizePath(update.path));
  if (update.citation) current.citations.add(update.citation);
  if (update.kind) current.kind = update.kind;
  if (update.line != null && current.line == null) current.line = update.line;
  symbols.set(normalizedName, current);
}

function finalizeAffectedFile(file) {
  return {
    path: file.path,
    score: Number(file.score.toFixed(2)),
    changed: file.changed,
    ragHits: file.ragHits,
    graphHits: file.graphHits,
    unresolvedCount: file.unresolvedCount,
    symbols: [...file.symbols].sort().slice(0, 6),
    citations: [...file.citations].sort(compareCitationIds).slice(0, 8),
  };
}

function finalizeAffectedSymbol(symbol) {
  return {
    name: symbol.name,
    kind: symbol.kind,
    line: symbol.line,
    score: Number(symbol.score.toFixed(2)),
    changed: symbol.changed,
    ragHits: symbol.ragHits,
    graphHits: symbol.graphHits,
    paths: [...symbol.paths].filter(Boolean).sort().slice(0, 4),
    citations: [...symbol.citations].sort(compareCitationIds).slice(0, 8),
  };
}

function buildMissingEvidence({ changedFiles, changedSymbols, ragEvidence, graphEvidence, unresolved }) {
  const missing = [];
  if (!changedFiles.length) missing.push("changed files not provided");
  if (!changedSymbols.length) missing.push("changed symbols not provided");
  if (!ragEvidence.length) missing.push("RAG evidence not provided");
  if (!graphEvidence.length) missing.push("CodeGraph evidence not provided");
  for (const item of unresolved) missing.push(item);
  return uniqueStrings(missing).sort();
}

function normalizeConfidence(confidence, context) {
  if (confidence && typeof confidence === "object") {
    const score = clampScore(confidence.score ?? confidence.value ?? 0);
    return {
      score,
      level: confidence.level || confidenceLabel(score),
      reasons: normalizeTextRows(confidence.reasons || confidence.reason || []),
    };
  }
  let score = 0.2;
  if (context.ragEvidence.length) score += 0.3;
  if (context.graphEvidence.length) score += 0.3;
  if (!context.missingEvidence.length) score += 0.15;
  if (!context.unresolved.length && !context.caveats.length) score += 0.05;
  score = clampScore(score);
  return {
    score,
    level: confidenceLabel(score),
    reasons: [
      context.ragEvidence.length ? "RAG evidence available" : "RAG evidence missing",
      context.graphEvidence.length ? "CodeGraph evidence available" : "CodeGraph evidence missing",
      context.missingEvidence.length ? "missing evidence present" : "no missing evidence recorded",
    ],
  };
}

function formatAffectedFiles(files) {
  if (!files.length) return "- none";
  return files.map((file) => {
    const symbols = inlineItems(file.symbols, "none");
    const citations = inlineItems(file.citations, "none");
    return `- ${file.path} score=${file.score} changed=${file.changed} rag=${file.ragHits} graph=${file.graphHits} unresolved=${file.unresolvedCount} symbols=${symbols} citations=${citations}`;
  }).join("\n");
}

function formatAffectedSymbols(symbols) {
  if (!symbols.length) return "- none";
  return symbols.map((symbol) => {
    const paths = inlineItems(symbol.paths, "none");
    const citations = inlineItems(symbol.citations, "none");
    return `- ${symbol.name} score=${symbol.score} changed=${symbol.changed} rag=${symbol.ragHits} graph=${symbol.graphHits} paths=${paths} citations=${citations}`;
  }).join("\n");
}

function formatEvidenceCitations(rows) {
  if (!rows.length) return "- none";
  return rows.map((row) => {
    const location = row.line == null ? row.path || "unknown" : `${row.path}:${row.line}`;
    const label = row.name ? `${row.kind}:${row.name}` : row.kind;
    return `- [${row.citationId}] ${row.source} ${location} ${label} score=${formatScore(row.score)} freshness=${row.freshness}${row.summary ? ` - ${oneLine(row.summary, 180)}` : ""}`;
  }).join("\n");
}

function formatList(items) {
  const list = normalizeTextRows(items);
  if (!list.length) return "- none";
  return list.map((item) => `- ${item}`).join("\n");
}

function compareEvidenceRows(a, b) {
  return b.score - a.score
    || compareCitationIds(a.citationId, b.citationId)
    || a.source.localeCompare(b.source)
    || a.path.localeCompare(b.path)
    || numberCompare(a.line, b.line)
    || a.name.localeCompare(b.name);
}

function compareCitationIds(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  const leftPrefix = left.replace(/\d+$/, "");
  const rightPrefix = right.replace(/\d+$/, "");
  if (leftPrefix !== rightPrefix) return leftPrefix.localeCompare(rightPrefix);
  return finiteNumber(left.match(/\d+$/)?.[0], 0) - finiteNumber(right.match(/\d+$/)?.[0], 0) || left.localeCompare(right);
}

function normalizeTextRows(value) {
  return asArray(value).map((item) => {
    if (typeof item === "string") return item.trim();
    return stringOrEmpty(item.summary || item.reason || item.message || item.id || item.path || item.name);
  }).filter(Boolean);
}

function uniqueStrings(values = []) {
  return [...new Set(asArray(values).flatMap((value) => {
    if (typeof value === "string") return [value.trim()];
    return [stringOrEmpty(value.path || value.file || value.name || value.id || value.summary)];
  }).filter(Boolean))].sort();
}

function pathFromText(value = "") {
  const match = String(value || "").match(/(?:^|\s)([A-Za-z0-9_.@/-]+\/[A-Za-z0-9_.@/-]+\.[A-Za-z0-9]+)(?::\d+)?/);
  return match ? normalizePath(match[1]) : "";
}

function inlineItems(items = [], fallback = "none") {
  const list = normalizeTextRows(items);
  return list.length ? list.join(", ") : fallback;
}

function normalizePath(value = "") {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function oneLine(value = "", maxLength = 160) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function asArray(value) {
  if (value == null || value === "") return [];
  return Array.isArray(value) ? value : [value];
}

function stringOrEmpty(value) {
  return String(value || "").trim();
}

function positiveInteger(value, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function finiteNumberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function numberCompare(a, b) {
  const left = a == null ? Number.POSITIVE_INFINITY : Number(a);
  const right = b == null ? Number.POSITIVE_INFINITY : Number(b);
  return left - right;
}

function clampScore(value) {
  const number = finiteNumber(value, 0);
  return Math.max(0, Math.min(1, Number(number.toFixed(2))));
}

function confidenceLabel(score) {
  if (score >= 0.8) return "high";
  if (score >= 0.5) return "medium";
  return "low";
}

function formatScore(value) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(2) : "unknown";
}