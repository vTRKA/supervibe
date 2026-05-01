// Append-only JSONL log of agent invocations.

import { appendFile, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createEvidenceRecord } from './supervibe-evidence-ledger.mjs';

const PROJECT_ROOT = process.cwd();
let _logPath = process.env.SUPERVIBE_INVOCATION_LOG
  || join(PROJECT_ROOT, '.supervibe', 'memory', 'agent-invocations.jsonl');

export function INVOCATION_LOG_PATH_FOR_TEST(path) { _logPath = path; }

export async function logInvocation(entry) {
  if (!entry.agent_id) throw new Error('agent_id required');
  if (!entry.task_summary) throw new Error('task_summary required');
  if (typeof entry.confidence_score !== 'number') throw new Error('confidence_score required (number)');

  const record = {
    ts: new Date().toISOString(),
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
