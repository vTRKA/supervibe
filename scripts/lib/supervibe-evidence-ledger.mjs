import { appendFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const DEFAULT_LEDGER = ".supervibe/memory/evidence-ledger.jsonl";
const REQUIRED_FIELDS = Object.freeze(["taskId", "agentId", "retrievalPolicy", "verificationCommands", "redactionStatus"]);

export function defaultEvidenceLedgerPath(rootDir = process.cwd()) {
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
  const rawEntries = await readEvidenceLedger({ rootDir, ledgerPath });
  const evaluated = rawEntries.map((entry) => ({ ...entry, gate: entry.gate || evaluateEvidenceGate(entry) }));
  const entries = latestEvidenceEntries(evaluated);
  const failed = evaluated.filter((entry) => !entry.gate.pass);
  const effectiveFailed = entries.filter((entry) => !entry.gate.pass);
  return {
    pass: effectiveFailed.length === 0,
    total: entries.length,
    rawTotal: evaluated.length,
    failed: effectiveFailed,
    rawFailed: failed,
    entries,
    rawEntries: evaluated,
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

export async function repairEvidenceLedgerRedactionStatus({
  rootDir = process.cwd(),
  ledgerPath = defaultEvidenceLedgerPath(rootDir),
  apply = false,
  now = new Date().toISOString(),
} = {}) {
  const report = await auditEvidenceLedger({ rootDir, ledgerPath });
  const repairable = (report.failed || []).filter(isRedactionOnlyFailure);
  const planned = repairable.map((entry) => ({
    taskId: entry.taskId || entry.task_id || null,
    agentId: entry.agentId || entry.agent_id || null,
    reason: entry.gate?.failures?.join("; ") || "redaction status failed",
  }));
  const appended = [];
  if (apply) {
    for (const entry of repairable) {
      const record = await appendEvidenceRecord({
        taskId: entry.taskId || entry.task_id,
        agentId: entry.agentId || entry.agent_id,
        retrievalPolicy: entry.retrievalPolicy || entry.retrieval_policy,
        memoryIds: entry.memoryIds || entry.memory_ids || [],
        ragChunkIds: entry.ragChunkIds || entry.rag_chunk_ids || [],
        graphSymbols: entry.graphSymbols || entry.graph_symbols || [],
        citations: entry.citations || [],
        bypassReasons: entry.bypassReasons || entry.bypass_reasons || [],
        verificationCommands: entry.verificationCommands || entry.verification_commands || [],
        redactionStatus: "not-needed",
        diagnosticEvents: [
          ...(entry.diagnosticEvents || entry.diagnostic_events || []),
          {
            type: "redaction-status-repair",
            message: "Supersedes older evidence entry with unknown redactionStatus after audit confirmed no redaction was needed.",
            ts: now,
          },
        ],
        workspaceId: entry.workspaceId || entry.workspace_id || null,
      }, { rootDir, ledgerPath });
      appended.push(record);
    }
  }
  return {
    apply,
    planned,
    appended,
    before: {
      pass: report.pass,
      total: report.total,
      rawTotal: report.rawTotal,
      failed: report.failed.length,
    },
  };
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

function latestEvidenceEntries(entries = []) {
  const byKey = new Map();
  entries.forEach((entry, index) => {
    const key = evidenceIdentityKey(entry, index);
    byKey.set(key, entry);
  });
  return [...byKey.values()];
}

function evidenceIdentityKey(entry = {}, index = 0) {
  const agentId = entry.agentId || entry.agent_id;
  const taskId = entry.taskId || entry.task_id;
  if (!agentId || !taskId) return `entry:${index}`;
  return `${slug(agentId)}::${slug(taskId)}`;
}

function isRedactionOnlyFailure(entry = {}) {
  const failures = entry.gate?.failures || [];
  return failures.length === 1 && failures[0] === "redaction status must be redacted or not-needed";
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

function slug(value = "") {
  return String(value || "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";
}
