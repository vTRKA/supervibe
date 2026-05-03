// Append-only JSONL log of agent invocations.

import { appendFile, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createEvidenceRecord } from './supervibe-evidence-ledger.mjs';
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
  const record = {
    schemaVersion: 1,
    ts,
    invocation_id: entry.invocation_id || entry.invocationId || createAgentInvocationId({
      agentId: entry.agent_id,
      taskSummary: entry.task_summary,
      ts,
      sessionId: entry.session_id || entry.sessionId || '',
    }),
    ...entry,
  };
  if (entry.evidence || entry.retrievalPolicy) {
    record.evidence_gate = createEvidenceRecord({
      taskId: entry.task_id || entry.taskId || entry.task_summary,
      agentId: entry.agent_id,
      retrievalPolicy: entry.retrievalPolicy || entry.evidence?.retrievalPolicy,
      memoryIds: entry.evidence?.memoryIds || [],
      ragChunkIds: entry.evidence?.ragChunkIds || [],
      graphSymbols: entry.evidence?.graphSymbols || [],
      citations: entry.evidence?.citations || [],
      verificationCommands: entry.evidence?.verificationCommands || [],
      redactionStatus: entry.evidence?.redactionStatus || 'unknown',
      bypassReasons: entry.evidence?.bypassReasons || [],
    }).gate;
  }
  await mkdir(dirname(_logPath), { recursive: true });
  await appendFile(_logPath, JSON.stringify(record) + '\n');
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
