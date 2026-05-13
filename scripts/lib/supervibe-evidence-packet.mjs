import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_MAX_SOURCES = 6;
const DEFAULT_MAX_TOKENS = 1200;
const SHARED_EVIDENCE_PACKET_KIND = "supervibe-shared-evidence-packet";

export function buildEvidencePacket({
  rootDir = process.cwd(),
  task = {},
  commandId = null,
  maxSources = DEFAULT_MAX_SOURCES,
  maxTokens = DEFAULT_MAX_TOKENS,
} = {}) {
  const candidates = [
    ...memorySources(rootDir, task),
    ...codeIndexSources(rootDir),
  ];
  const bounded = boundSources(candidates, { maxSources, maxTokens });
  const omittedCount = Math.max(0, candidates.length - bounded.sources.length);
  const omittedEvidenceReason = candidates.length === 0
    ? "no-memory-rag-codegraph-sources"
    : omittedCount > 0
      ? `bounded:${omittedCount}-sources-omitted`
      : "none";
  const tokenEstimate = bounded.sources.reduce((sum, source) => sum + (source.tokenEstimate || 0), 0);
  const grouped = groupLegacySources(bounded.sources);
  const packet = buildSharedEvidencePacket({
    rootDir,
    task,
    commandId,
    memory: grouped.memory,
    rag: grouped.rag,
    codeGraph: grouped.codeGraph,
    maxTokens,
    redactionStatus: "not-needed",
    omittedEvidenceReason,
    confidence: {
      score: bounded.sources.length > 0 ? 0.72 : 0,
      level: bounded.sources.length > 0 ? "medium" : "low",
      reasons: bounded.sources.length > 0 ? ["scheduler assignment evidence available"] : ["no evidence sources"],
    },
  });

  return {
    ...packet,
    sourceCount: bounded.sources.length,
    tokenEstimate,
    omittedEvidenceReason,
    sources: bounded.sources,
    ready: bounded.sources.length > 0 && packet.validation.pass,
  };
}

export function buildSharedEvidencePacket({
  rootDir = process.cwd(),
  task = {},
  commandId = null,
  query = "",
  memory = [],
  rag = [],
  codeGraph = [],
  citations = [],
  confidence = null,
  freshness = null,
  redactionStatus = null,
  tokenBudget = null,
  omittedEvidence = [],
  omittedEvidenceReason = "none",
  maxTokens = DEFAULT_MAX_TOKENS,
} = {}) {
  const redaction = { status: redactionStatus || "not-needed" };
  const evidence = {
    memory: normalizeEvidenceRows("memory", memory, redaction),
    rag: normalizeEvidenceRows("rag", rag, redaction),
    codeGraph: normalizeEvidenceRows("codegraph", codeGraph, redaction),
  };
  const normalizedCitations = normalizeCitations(citations, evidence);
  const evidenceCount = evidence.memory.length + evidence.rag.length + evidence.codeGraph.length;
  const normalizedTokenBudget = normalizeTokenBudget(tokenBudget, {
    maxTokens,
    evidence,
    citations: normalizedCitations,
  });
  const normalizedConfidence = normalizeConfidence(confidence, evidence, omittedEvidence);
  const packet = {
    schemaVersion: 1,
    kind: SHARED_EVIDENCE_PACKET_KIND,
    packetId: createPacketId({
      taskId: task.id || task.itemId || commandId || query || "evidence-packet",
      sources: normalizedCitations.map((citation) => ({
        kind: citation.source,
        id: citation.id,
        path: citation.path,
      })),
      omittedEvidenceReason,
    }),
    query: String(query || ""),
    taskId: task.id || task.itemId || null,
    commandId,
    rootDir,
    sourceCount: evidenceCount,
    tokenEstimate: normalizedTokenBudget.estimatedTokens,
    omittedEvidenceReason,
    omittedEvidence,
    evidence,
    citations: normalizedCitations,
    confidence: normalizedConfidence,
    freshness: normalizeFreshness(freshness, evidence),
    redactionStatus: redaction.status,
    tokenBudget: normalizedTokenBudget,
    ready: false,
  };
  packet.validation = validateEvidencePacket(packet);
  packet.ready = evidenceCount > 0 && packet.validation.pass;
  return packet;
}

export function validateEvidencePacket(packet = null) {
  const issues = [];
  if (!packet || typeof packet !== "object") {
    return { pass: false, issues: ["missing evidence packet"] };
  }
  if (packet.kind !== SHARED_EVIDENCE_PACKET_KIND) issues.push(`kind must be ${SHARED_EVIDENCE_PACKET_KIND}`);
  if (!packet.redactionStatus) {
    issues.push("missing redactionStatus");
  } else if (!["not-needed", "redacted", "clean"].includes(packet.redactionStatus)) {
    issues.push("redactionStatus must be not-needed, redacted, or clean");
  }
  if (!packet.tokenBudget || typeof packet.tokenBudget !== "object") {
    issues.push("missing tokenBudget");
  } else {
    if (!Number.isFinite(Number(packet.tokenBudget.maxTokens))) issues.push("tokenBudget.maxTokens must be numeric");
    if (!Number.isFinite(Number(packet.tokenBudget.estimatedTokens))) issues.push("tokenBudget.estimatedTokens must be numeric");
    if (typeof packet.tokenBudget.pass !== "boolean") issues.push("tokenBudget.pass must be boolean");
  }
  if (!packet.confidence || typeof packet.confidence !== "object") {
    issues.push("missing confidence");
  } else if (!Number.isFinite(Number(packet.confidence.score))) {
    issues.push("confidence.score must be numeric");
  }

  const citations = Array.isArray(packet.citations) ? packet.citations : [];
  for (const source of ["memory", "rag", "codeGraph"]) {
    const rows = Array.isArray(packet.evidence?.[source]) ? packet.evidence[source] : [];
    for (const row of rows) {
      const citation = citations.find((item) => item.id === row.citationId && item.source === citationSource(source) && item.path);
      if (!citation) issues.push(`${evidenceLabel(source)} evidence missing source citation: ${describeEvidenceRow(source, row)}`);
    }
  }

  return { pass: issues.length === 0, issues };
}

export function evidencePacketSummary(packet = null) {
  if (!packet) {
    return {
      packetId: "missing",
      sourceCount: 0,
      tokenEstimate: 0,
      omittedEvidenceReason: "missing-packet",
      ready: false,
    };
  }
  return {
    packetId: packet.packetId || "missing",
    sourceCount: Number(packet.sourceCount || packet.sources?.length || 0),
    tokenEstimate: Number(packet.tokenEstimate || 0),
    omittedEvidenceReason: packet.omittedEvidenceReason || "none",
    ready: packet.ready !== false && Number(packet.sourceCount || packet.sources?.length || 0) > 0,
  };
}

export function formatEvidencePacketSummary(packet = null, { prefix = "EVIDENCE_PACKET" } = {}) {
  const summary = evidencePacketSummary(packet);
  return [
    `${prefix}_ID: ${summary.packetId}`,
    `${prefix}_SOURCES: ${summary.sourceCount}`,
    `${prefix}_TOKENS: ${summary.tokenEstimate}`,
    `${prefix}_OMITTED: ${summary.omittedEvidenceReason}`,
  ].join("\n");
}

export function hasEvidencePacket(packet = null) {
  return evidencePacketSummary(packet).ready === true;
}

function groupLegacySources(sources = []) {
  return {
    memory: sources.filter((source) => source.kind === "memory"),
    rag: sources.filter((source) => source.kind === "rag"),
    codeGraph: sources.filter((source) => source.kind === "codegraph"),
  };
}

function normalizeEvidenceRows(source, rows = [], redaction = { status: "not-needed" }) {
  return (rows || []).map((row, index) => {
    const citationId = row.citationId || `${sourcePrefix(source)}${index + 1}`;
    if (source === "memory") {
      return {
        citationId,
        id: row.id || row.title || row.path || `memory-${index + 1}`,
        path: normalizePath(row.path || row.file || ""),
        summary: redactString(row.summary || row.title || row.id || "", redaction),
        score: finiteNumber(row.score, 0),
        confidence: row.confidence ?? null,
        freshness: row.freshness || "unknown",
      };
    }
    if (source === "rag") {
      return {
        citationId,
        path: normalizePath(row.path || row.file || ""),
        startLine: finiteNumber(row.startLine || row.line, 1),
        endLine: finiteNumber(row.endLine || row.startLine || row.line, 1),
        kind: row.kind || "chunk",
        name: row.name || "",
        snippet: redactString(row.snippet || row.summary || row.title || "", redaction),
        score: finiteNumber(row.score, 0),
        freshness: row.freshness || row.metadata?.freshness || "unknown",
        metadata: row.metadata || {},
      };
    }
    return {
      citationId,
      path: normalizePath(row.path || row.file || ""),
      startLine: finiteNumber(row.startLine || row.line, 1),
      kind: row.kind || "symbol",
      name: row.name || row.toName || row.title || "",
      distance: finiteNumber(row.distance, 0),
      via: row.via || row.seed || "graph",
      freshness: row.freshness || "unknown",
    };
  });
}

function normalizeCitations(citations = [], evidence = {}) {
  if (Array.isArray(citations) && citations.length > 0) {
    return citations.map((citation) => ({
      id: citation.id,
      source: citation.source,
      path: normalizePath(citation.path || ""),
      line: citation.line == null ? null : finiteNumber(citation.line, 1),
      summary: citation.summary || "",
    })).filter((citation) => citation.id && citation.source && citation.path);
  }
  const result = [];
  for (const row of evidence.memory || []) {
    result.push({ id: row.citationId, source: "memory", path: row.path, line: null, summary: row.summary || row.id || "" });
  }
  for (const row of evidence.rag || []) {
    result.push({ id: row.citationId, source: "rag", path: row.path, line: row.startLine, summary: row.name || row.kind || "" });
  }
  for (const row of evidence.codeGraph || []) {
    result.push({ id: row.citationId, source: "codegraph", path: row.path, line: row.startLine, summary: row.name || row.kind || "" });
  }
  return result.filter((citation) => citation.id && citation.source && citation.path);
}

function normalizeFreshness(freshness = null, evidence = {}) {
  if (freshness && typeof freshness === "object") {
    return {
      memory: freshness.memory || freshness.memories || "unknown",
      rag: freshness.rag || "unknown",
      codeGraph: freshness.codeGraph || freshness.codegraph || "unknown",
      generatedAt: freshness.generatedAt || new Date().toISOString(),
    };
  }
  return {
    memory: deriveFreshness(evidence.memory),
    rag: deriveFreshness(evidence.rag),
    codeGraph: deriveFreshness(evidence.codeGraph),
    generatedAt: new Date().toISOString(),
  };
}

function normalizeTokenBudget(tokenBudget = null, { maxTokens, evidence, citations } = {}) {
  if (tokenBudget && typeof tokenBudget === "object") {
    const estimatedTokens = finiteNumber(tokenBudget.estimatedTokens, estimateTokens(JSON.stringify({ evidence, citations })));
    const normalizedMax = finiteNumber(tokenBudget.maxTokens, maxTokens || DEFAULT_MAX_TOKENS);
    return {
      maxTokens: normalizedMax,
      estimatedTokens,
      pass: typeof tokenBudget.pass === "boolean" ? tokenBudget.pass : estimatedTokens <= normalizedMax,
      trimmed: Boolean(tokenBudget.trimmed),
    };
  }
  const estimatedTokens = estimateTokens(JSON.stringify({ evidence, citations }));
  const normalizedMax = finiteNumber(maxTokens, DEFAULT_MAX_TOKENS);
  return {
    maxTokens: normalizedMax,
    estimatedTokens,
    pass: estimatedTokens <= normalizedMax,
    trimmed: false,
  };
}

function normalizeConfidence(confidence = null, evidence = {}, omittedEvidence = []) {
  if (confidence && typeof confidence === "object") {
    const score = finiteNumber(confidence.score, 0);
    return {
      score,
      level: confidence.level || confidenceLevel(score),
      reasons: Array.isArray(confidence.reasons) ? confidence.reasons : [],
    };
  }
  let score = 0.1;
  if ((evidence.memory || []).length) score += 0.2;
  if ((evidence.rag || []).length) score += 0.35;
  if ((evidence.codeGraph || []).length) score += 0.25;
  score -= Math.min(0.2, (omittedEvidence || []).length * 0.04);
  score = Math.max(0, Math.min(1, Number(score.toFixed(2))));
  return {
    score,
    level: confidenceLevel(score),
    reasons: [
      (evidence.memory || []).length ? "memory evidence available" : "memory evidence omitted",
      (evidence.rag || []).length ? "RAG evidence available" : "RAG evidence omitted",
      (evidence.codeGraph || []).length ? "CodeGraph evidence available" : "CodeGraph evidence omitted",
    ],
  };
}

function memorySources(rootDir, task = {}) {
  const indexPath = join(rootDir, ".supervibe", "memory", "index.json");
  if (!existsSync(indexPath)) return [];
  try {
    const index = JSON.parse(readFileSync(indexPath, "utf8"));
    const entries = Array.isArray(index.entries) ? index.entries : [];
    const terms = searchTerms(task);
    const scored = entries.map((entry) => ({
      entry,
      score: scoreEntry(entry, terms),
    })).sort((a, b) => b.score - a.score);
    const selected = scored.filter((item) => item.score > 0).slice(0, 3);
    const fallback = selected.length ? selected : scored.slice(0, 2);
    return fallback.map(({ entry }) => ({
      kind: "memory",
      id: entry.id || entry.file || "memory-entry",
      path: entry.file || indexPath,
      title: entry.id || entry.file || "memory-entry",
      tokenEstimate: estimateTokens(`${entry.id || ""} ${(entry.tags || []).join(" ")} ${entry.file || ""}`),
    }));
  } catch {
    return [];
  }
}

function codeIndexSources(rootDir) {
  const dbPath = join(rootDir, ".supervibe", "memory", "code.db");
  if (!existsSync(dbPath)) return [];
  let size = 0;
  try {
    size = statSync(dbPath).size;
  } catch {
    size = 0;
  }
  return [
    {
      kind: "rag",
      id: "code-rag-index",
      path: dbPath,
      title: "Code RAG index",
      tokenEstimate: estimateTokens(`code rag index ${size}`),
    },
    {
      kind: "codegraph",
      id: "codegraph-index",
      path: dbPath,
      title: "CodeGraph index",
      tokenEstimate: estimateTokens(`codegraph index ${size}`),
    },
  ];
}

function boundSources(sources = [], { maxSources, maxTokens } = {}) {
  const bounded = [];
  let tokenEstimate = 0;
  for (const source of sources.slice(0, Math.max(0, maxSources))) {
    const nextTokens = Number(source.tokenEstimate || 0);
    if (bounded.length > 0 && tokenEstimate + nextTokens > maxTokens) break;
    bounded.push(source);
    tokenEstimate += nextTokens;
  }
  return { sources: bounded };
}

function createPacketId({ taskId, sources, omittedEvidenceReason }) {
  const hash = createHash("sha256")
    .update(JSON.stringify({
      taskId,
      sources: sources.map((source) => `${source.kind}:${source.id}:${source.path}`),
      omittedEvidenceReason,
    }))
    .digest("hex")
    .slice(0, 12);
  return `evp-${hash}`;
}

function searchTerms(task = {}) {
  return `${task.id || ""} ${task.itemId || ""} ${task.title || ""} ${task.goal || ""} ${task.category || ""} ${(task.targetFiles || []).join(" ")} ${(task.filesTouched || []).join(" ")}`
    .toLowerCase()
    .split(/[^a-z0-9._/-]+/)
    .filter((term) => term.length >= 3);
}

function scoreEntry(entry = {}, terms = []) {
  const haystack = `${entry.id || ""} ${entry.file || ""} ${(entry.tags || []).join(" ")}`.toLowerCase();
  return terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
}

function sourcePrefix(source = "") {
  if (source === "memory") return "M";
  if (source === "rag") return "R";
  return "G";
}

function citationSource(source = "") {
  return source === "codeGraph" ? "codegraph" : source;
}

function evidenceLabel(source = "") {
  if (source === "rag") return "RAG";
  if (source === "codeGraph") return "CodeGraph";
  return "memory";
}

function describeEvidenceRow(source = "", row = {}) {
  if (source === "memory") return row.id || row.path || "memory";
  return `${row.path || "unknown"}:${row.startLine || 1}`;
}

function deriveFreshness(rows = []) {
  if (!rows.length) return "missing";
  if (rows.some((row) => row.freshness === "stale" || row.freshness === "superseded")) return "stale";
  if (rows.every((row) => row.freshness === "current" || row.freshness === "fresh")) return "current";
  return "unknown";
}

function confidenceLevel(score = 0) {
  return score >= 0.75 ? "high" : score >= 0.45 ? "medium" : "low";
}

function normalizePath(path = "") {
  return String(path || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function redactString(value = "", redaction = { status: "not-needed" }) {
  const text = String(value || "");
  const next = text
    .replace(/\bsk-[A-Za-z0-9_-]{6,}\b/g, "[REDACTED_SECRET]")
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[REDACTED_EMAIL]")
    .replace(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, "[REDACTED_AWS_KEY]")
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]");
  if (next !== text) redaction.status = "redacted";
  return next;
}

function estimateTokens(value = "") {
  return Math.max(1, Math.ceil(String(value).length / 4));
}
