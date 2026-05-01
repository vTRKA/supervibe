import { appendFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const DEFAULT_LEDGER = ".supervibe/memory/evidence-ledger.jsonl";
const REQUIRED_FIELDS = Object.freeze(["taskId", "agentId", "retrievalPolicy", "verificationCommands", "redactionStatus"]);

function defaultEvidenceLedgerPath(rootDir = process.cwd()) {
  return join(rootDir, DEFAULT_LEDGER);
}

export function createEvidenceRecord(record = {}) {
  const normalized = {
    schemaVersion: 1,
    ts: record.ts || new Date().toISOString(),
    taskId: record.taskId || record.task_id || null,
    agentId: record.agentId || record.agent_id || null,
    retrievalPolicy: normalizePolicy(record.retrievalPolicy || record.retrieval_policy),
    memoryIds: unique(record.memoryIds || record.memory_ids),
    ragChunkIds: unique(record.ragChunkIds || record.rag_chunk_ids),
    graphSymbols: unique(record.graphSymbols || record.graph_symbols),
    citations: (record.citations || []).map(normalizeCitation),
    bypassReasons: unique(record.bypassReasons || record.bypass_reasons),
    verificationCommands: unique(record.verificationCommands || record.verification_commands),
    redactionStatus: record.redactionStatus || record.redaction_status || "unknown",
    diagnosticEvents: (record.diagnosticEvents || record.diagnostic_events || []).map(normalizeDiagnosticEvent),
    workspaceId: record.workspaceId || record.workspace_id || null,
  };
  const gate = evaluateEvidenceGate(normalized);
  return { ...normalized, gate };
}

export function evaluateEvidenceGate(record = {}) {
  const failures = [];
  const citations = (record.citations || []).map(normalizeCitation);
  for (const field of REQUIRED_FIELDS) {
    if (field === "verificationCommands") {
      if (!record.verificationCommands?.length) failures.push("verification command evidence missing");
    } else if (!record[field]) failures.push(`${field} missing`);
  }
  const policy = normalizePolicy(record.retrievalPolicy);
  if (policy.memory === "mandatory" && !record.memoryIds?.length && !hasBypass(record, "memory")) failures.push("required memory evidence missing");
  if (policy.rag === "mandatory" && !record.ragChunkIds?.length && !hasBypass(record, "rag")) failures.push("required RAG chunk evidence missing");
  if (policy.codegraph === "mandatory" && !record.graphSymbols?.length && !hasBypass(record, "codegraph")) failures.push("required graph evidence missing");
  if (citations.some((citation) => !citation.valid)) failures.push("invalid citation evidence present");
  if (record.redactionStatus !== "redacted" && record.redactionStatus !== "not-needed") failures.push("redaction status must be redacted or not-needed");
  return {
    pass: failures.length === 0,
    failures,
    score: failures.length === 0 ? 10 : Math.max(0, 10 - failures.length * 2),
    creates: failures.length === 0 ? [] : ["eval-candidate", "memory-candidate", "strengthen-task", "capability-warning"],
  };
}

export async function appendEvidenceRecord(record, { rootDir = process.cwd(), ledgerPath = defaultEvidenceLedgerPath(rootDir) } = {}) {
  const normalized = createEvidenceRecord(record);
  await mkdir(dirname(ledgerPath), { recursive: true });
  await appendFile(ledgerPath, `${JSON.stringify(normalized)}\n`, "utf8");
  return normalized;
}

async function readEvidenceLedger({ rootDir = process.cwd(), ledgerPath = defaultEvidenceLedgerPath(rootDir), limit = 1000 } = {}) {
  if (!existsSync(ledgerPath)) return [];
  const raw = await readFile(ledgerPath, "utf8");
  return raw.split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean)
    .slice(-limit);
}

export async function auditEvidenceLedger({ rootDir = process.cwd(), ledgerPath = defaultEvidenceLedgerPath(rootDir) } = {}) {
  const entries = await readEvidenceLedger({ rootDir, ledgerPath });
  const evaluated = entries.map((entry) => ({ ...entry, gate: entry.gate || evaluateEvidenceGate(entry) }));
  const failed = evaluated.filter((entry) => !entry.gate.pass);
  return {
    pass: failed.length === 0,
    total: evaluated.length,
    failed,
    entries: evaluated,
  };
}

export function formatEvidenceLedgerStatus(report = {}) {
  const lines = [
    "SUPERVIBE_EVIDENCE_LEDGER",
    `PASS: ${Boolean(report.pass)}`,
    `ENTRIES: ${report.total || report.entries?.length || 0}`,
    `FAILED: ${report.failed?.length || 0}`,
  ];
  for (const entry of report.failed || []) {
    lines.push(`- ${entry.taskId || "unknown"} / ${entry.agentId || "unknown"}: ${entry.gate.failures.join("; ")}`);
  }
  return lines.join("\n");
}

function normalizePolicy(policy = {}) {
  return {
    memory: policy.memory || policy.sources?.memory || "optional",
    rag: policy.rag || policy.sources?.rag || "optional",
    codegraph: policy.codegraph || policy.sources?.codegraph || "optional",
    docs: policy.docs || policy.sources?.docs || "optional",
    reason: policy.reason || "not specified",
  };
}

function normalizeCitation(citation = {}) {
  return {
    id: String(citation.id || citation.path || citation.source || "citation"),
    source: citation.source || "unknown",
    path: citation.path || "",
    valid: citation.valid !== false && Boolean(citation.source && citation.path),
    redacted: citation.redacted !== false,
  };
}

function normalizeDiagnosticEvent(event = {}) {
  return {
    type: event.type || "diagnostic",
    message: String(event.message || "").slice(0, 240),
    ts: event.ts || null,
  };
}

function hasBypass(record, source) {
  return (record.bypassReasons || []).some((reason) => String(reason).toLowerCase().includes(source));
}

function unique(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(String).filter(Boolean))];
}
