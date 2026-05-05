// Append-only JSONL log of agent invocations.

import { appendFile, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  appendEvidenceRecord,
  createEvidenceRecord,
  defaultEvidenceLedgerPath,
} from './supervibe-evidence-ledger.mjs';
import {
  createAgentInvocationId,
  AGENT_INVOCATION_LOG_RELATIVE_PATH,
} from './agent-producer-contract.mjs';

const PROJECT_ROOT = process.cwd();
let _logPath = process.env.SUPERVIBE_INVOCATION_LOG
  || join(PROJECT_ROOT, ...AGENT_INVOCATION_LOG_RELATIVE_PATH.split('/'));
let _flightRecorderPath = process.env.SUPERVIBE_FLIGHT_RECORDER_LOG
  || join(PROJECT_ROOT, '.supervibe', 'memory', 'telemetry', 'flight-recorder.jsonl');

export function setInvocationLogPath(path) { _logPath = path; }
export function INVOCATION_LOG_PATH_FOR_TEST(path) { setInvocationLogPath(path); }
export function FLIGHT_RECORDER_PATH_FOR_TEST(path) { _flightRecorderPath = path; }

export async function logInvocation(entry) {
  if (!entry.agent_id) throw new Error('agent_id required');
  if (!entry.task_summary) throw new Error('task_summary required');
  if (typeof entry.confidence_score !== 'number') throw new Error('confidence_score required (number)');

  const ts = entry.ts || new Date().toISOString();
  const redactedEntry = redactInvocationEntry(entry);
  const record = {
    schemaVersion: 1,
    ts,
    invocation_id: entry.invocation_id || entry.invocationId || createAgentInvocationId({
      agentId: entry.agent_id,
      taskSummary: entry.task_summary,
      ts,
      sessionId: entry.session_id || entry.sessionId || '',
    }),
    ...redactedEntry,
  };
  record.structured_output = structuredOutputPathsForRecord(record);
  record.retrieval_enforcement = {
    schemaVersion: 1,
    evidenceLedger: hasRetrievalEvidenceInput(entry) ? 'pending' : 'not-provided',
  };
  if (hasRetrievalEvidenceInput(entry)) {
    const evidenceRecord = buildEvidenceLedgerRecord(entry);
    const preview = createEvidenceRecord(evidenceRecord);
    record.evidence_gate = preview.gate;
    const rootDir = rootDirFromInvocationLogPath();
    const ledgerPath = defaultEvidenceLedgerPath(rootDir);
    const appended = await appendEvidenceRecord(evidenceRecord, { rootDir, ledgerPath });
    record.retrieval_enforcement.evidenceLedger = 'written';
    record.retrieval_enforcement.ledgerPath = '.supervibe/memory/evidence-ledger.jsonl';
    record.retrieval_enforcement.evidencePass = appended.gate.pass;
  }
  await mkdir(dirname(_logPath), { recursive: true });
  await appendFile(_logPath, JSON.stringify(record) + '\n');
  await writeStructuredAgentOutput(record);
  await appendEffectivenessRecord(record);
  await appendConfidenceRecord(record);
  return record;
}

export async function readInvocations({ agent_id = null, since = null, limit = 1000 } = {}) {
  if (!existsSync(_logPath)) return [];
  const raw = await readFile(_logPath, 'utf8');
  const lines = raw.split('\n').filter(Boolean);
  let entries = [];
  for (const line of lines) {
    try { entries.push(JSON.parse(line)); }
    catch {}
  }
  if (agent_id) entries = entries.filter(e => e.agent_id === agent_id);
  if (since) entries = entries.filter(e => new Date(e.ts) >= new Date(since));
  return entries.slice(-limit);
}

export async function updateLatestInvocation(patch, { matchAgentId = null } = {}) {
  if (!existsSync(_logPath)) return false;
  const raw = await readFile(_logPath, 'utf8');
  const lines = raw.split('\n').filter(Boolean);
  let updatedLineIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const entry = JSON.parse(lines[i]);
      if (matchAgentId && entry.agent_id !== matchAgentId) continue;
      const merged = { ...entry, ...patch };
      lines[i] = JSON.stringify(merged);
      updatedLineIdx = i;
      break;
    } catch { continue; }
  }
  if (updatedLineIdx < 0) return false;
  await writeFile(_logPath, lines.join('\n') + '\n');
  return true;
}

export async function logFlightRecorderEvent(entry = {}) {
  for (const field of ['traceId', 'spanId', 'agentId', 'taskId', 'toolClass', 'approvalState', 'outcome']) {
    if (!entry[field]) throw new Error(`${field} required`);
  }
  const redacted = redactFlightRecorderEntry(entry);
  const record = {
    schemaVersion: 1,
    ts: new Date().toISOString(),
    traceId: redacted.traceId,
    spanId: redacted.spanId,
    agentId: redacted.agentId,
    taskId: redacted.taskId,
    skillId: redacted.skillId || null,
    modelClass: redacted.modelClass || 'unknown',
    toolClass: redacted.toolClass,
    approvalState: redacted.approvalState,
    retrievalIds: redacted.retrievalIds || [],
    verificationCommands: redacted.verificationCommands || [],
    score: typeof redacted.score === 'number' ? redacted.score : null,
    outcome: redacted.outcome,
    redactionStatus: redacted.redactionStatus,
    otel: {
      name: 'supervibe.agent.task',
      trace_id: redacted.traceId,
      span_id: redacted.spanId,
      attributes: {
        'supervibe.agent.id': redacted.agentId,
        'supervibe.task.id': redacted.taskId,
        'supervibe.tool.class': redacted.toolClass,
        'supervibe.approval.state': redacted.approvalState,
      },
    },
  };
  await mkdir(dirname(_flightRecorderPath), { recursive: true });
  await appendFile(_flightRecorderPath, JSON.stringify(record) + '\n');
  return record;
}

export async function readFlightRecorderEvents({ limit = 1000 } = {}) {
  if (!existsSync(_flightRecorderPath)) return [];
  const raw = await readFile(_flightRecorderPath, 'utf8');
  return raw.split('\n').filter(Boolean).slice(-limit).map((line) => JSON.parse(line));
}

function redactFlightRecorderEntry(entry) {
  let redactionStatus = 'clean';
  const sanitize = (value) => {
    if (typeof value !== 'string') return value;
    const next = value
      .replace(/\bsk-[A-Za-z0-9_-]{6,}\b/g, '[REDACTED_SECRET]')
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[REDACTED_EMAIL]');
    if (next !== value) redactionStatus = 'redacted';
    return next;
  };
  const out = {};
  for (const [key, value] of Object.entries(entry)) {
    if (Array.isArray(value)) out[key] = value.map(sanitize);
    else out[key] = sanitize(value);
  }
  out.redactionStatus = redactionStatus;
  return out;
}

function redactInvocationEntry(entry = {}) {
  let redactionStatus = 'clean';
  const sanitize = (value) => {
    if (typeof value !== 'string') return value;
    const next = value
      .replace(/\bsk-[A-Za-z0-9_-]{6,}\b/g, '[REDACTED_SECRET]')
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[REDACTED_EMAIL]')
      .replace(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, '[REDACTED_AWS_KEY]')
      .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]');
    if (next !== value) redactionStatus = 'redacted';
    return next;
  };
  const visit = (value) => {
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, visit(nested)]));
    }
    return sanitize(value);
  };
  const out = visit(entry);
  out.redaction_status = redactionStatus;
  return out;
}

function structuredOutputPathsForRecord(record = {}) {
  const dir = `.supervibe/artifacts/_agent-outputs/${sanitizePathSegment(record.invocation_id || 'unknown')}`;
  return {
    schemaVersion: 1,
    directory: dir,
    json: `${dir}/agent-output.json`,
    summary: `${dir}/summary.md`,
  };
}

async function writeStructuredAgentOutput(record = {}) {
  const paths = record.structured_output || structuredOutputPathsForRecord(record);
  const rootDir = rootDirFromInvocationLogPath();
  const dir = join(rootDir, ...paths.directory.split('/'));
  await mkdir(dir, { recursive: true });
  const payload = {
    schemaVersion: 1,
    invocationId: record.invocation_id,
    agentId: record.agent_id,
    host: record.host || null,
    hostInvocationSource: record.host_invocation_source || record.source || null,
    taskSummary: record.task_summary,
    status: record.status || 'completed',
    confidenceScore: record.confidence_score,
    changedFiles: normalizeList(record.changedFiles || record.changed_files),
    risks: normalizeList(record.risks),
    recommendations: normalizeList(record.recommendations),
    evidenceGate: record.evidence_gate?.summary || record.evidence_gate || null,
    retrievalEnforcement: record.retrieval_enforcement || null,
    loggedAt: record.ts,
  };
  await writeFile(join(dir, 'agent-output.json'), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await writeFile(join(dir, 'summary.md'), formatAgentOutputSummary(payload), 'utf8');
}

async function appendEffectivenessRecord(record = {}) {
  const rootDir = rootDirFromInvocationLogPath();
  const path = join(rootDir, '.supervibe', 'memory', 'effectiveness.jsonl');
  const confidence = typeof record.confidence_score === 'number' ? record.confidence_score : null;
  const status = String(record.status || 'completed').toLowerCase();
  const outcome = status === 'failed' || status === 'error'
    ? 'failed'
    : confidence !== null && confidence >= 9
      ? 'success'
      : 'partial';
  const blockers = [];
  if (record.evidence_gate?.pass === false) blockers.push('missing-context');
  if (!record.evidence?.verificationCommands?.length) blockers.push('missing-verification');
  const entry = {
    ts: record.ts,
    agent: record.agent_id,
    task: record.task_summary,
    outcome,
    iterations: 1,
    blockers: blockers.length ? blockers : ['none'],
    confidence,
    userCorrections: record.user_corrections || 0,
    verification: record.evidence?.verificationCommands || [],
    notes: outcome === 'success' ? 'auto-logged from completed agent invocation' : 'auto-logged from agent invocation; review recommended before final acceptance',
    invocationId: record.invocation_id,
  };
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, JSON.stringify(entry) + '\n', 'utf8');
}

async function appendConfidenceRecord(record = {}) {
  const rootDir = rootDirFromInvocationLogPath();
  const path = join(rootDir, '.supervibe', 'confidence-log.jsonl');
  const confidence = typeof record.confidence_score === 'number' ? record.confidence_score : null;
  const entry = {
    schemaVersion: 1,
    ts: record.ts,
    source: 'agent-invocation-logger',
    artifact: 'agent-output',
    agent: record.agent_id,
    invocationId: record.invocation_id,
    confidence,
    score: confidence,
    gate: confidence !== null && confidence >= 9 ? 'pass' : 'review',
    evidenceGatePass: record.evidence_gate?.pass ?? null,
    output: record.structured_output?.json || null,
  };
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, JSON.stringify(entry) + '\n', 'utf8');
}

function formatAgentOutputSummary(payload = {}) {
  const lines = [
    `# Agent Output: ${payload.agentId || 'unknown'}`,
    '',
    `Invocation: ${payload.invocationId || 'unknown'}`,
    `Status: ${payload.status || 'unknown'}`,
    `Confidence: ${payload.confidenceScore ?? 'unknown'}`,
    '',
    '## Summary',
    '',
    payload.taskSummary || 'No task summary recorded.',
    '',
    '## Changed Files',
    '',
    ...(payload.changedFiles?.length ? payload.changedFiles.map((file) => `- ${file}`) : ['- none recorded']),
    '',
    '## Risks',
    '',
    ...(payload.risks?.length ? payload.risks.map((risk) => `- ${risk}`) : ['- none recorded']),
    '',
    '## Recommendations',
    '',
    ...(payload.recommendations?.length ? payload.recommendations.map((item) => `- ${item}`) : ['- none recorded']),
    '',
  ];
  return lines.join('\n');
}

function rootDirFromInvocationLogPath() {
  const normalized = String(_logPath || '').replace(/\\/g, '/');
  const marker = '/.supervibe/memory/agent-invocations.jsonl';
  const index = normalized.lastIndexOf(marker);
  if (index >= 0) return normalized.slice(0, index);
  return PROJECT_ROOT;
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (!value) return [];
  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

function hasRetrievalEvidenceInput(entry = {}) {
  return Boolean(entry.evidence || entry.retrievalPolicy || entry.retrieval_policy);
}

function buildEvidenceLedgerRecord(entry = {}) {
  const evidence = entry.evidence || {};
  return {
    taskId: entry.task_id || entry.taskId || entry.task_summary,
    agentId: entry.agent_id,
    invocationId: entry.invocation_id || entry.invocationId || null,
    retrievalPolicy: entry.retrievalPolicy || entry.retrieval_policy || evidence.retrievalPolicy,
    memoryIds: evidence.memoryIds || evidence.memory_ids || [],
    ragChunkIds: evidence.ragChunkIds || evidence.rag_chunk_ids || [],
    graphSymbols: evidence.graphSymbols || evidence.graph_symbols || [],
    citations: evidence.citations || [],
    verificationCommands: evidence.verificationCommands || evidence.verification_commands || [],
    redactionStatus: evidence.redactionStatus || evidence.redaction_status || 'unknown',
    bypassReasons: evidence.bypassReasons || evidence.bypass_reasons || [],
    diagnosticEvents: evidence.diagnosticEvents || evidence.diagnostic_events || [],
    workspaceId: evidence.workspaceId || evidence.workspace_id || null,
  };
}

function sanitizePathSegment(value) {
  return String(value ?? 'unknown').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-|-$/g, '') || 'unknown';
}
