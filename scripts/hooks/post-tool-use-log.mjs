#!/usr/bin/env node
// PostToolUse hook — invoked by Claude Code after every tool call.
// Reads JSON from stdin, logs Task (subagent dispatch) calls to:
//   1. invocation log (JSONL, fast, append-only)
//   2. agent-tasks.db (SQLite + FTS5, searchable mirror)
// On low-confidence outcomes (score < 8.0, no override) emits a system-reminder
// with alternative agents that scored higher on similar past tasks.
// MUST be fast (< 100ms) and failure-tolerant — never blocks the main flow.

import { logInvocation } from '../lib/agent-invocation-logger.mjs';

const LOW_CONFIDENCE_THRESHOLD = 8.0;

const CONFIDENCE_PATTERNS = [
  /confidence[:\s]*(\d{1,2}(?:\.\d+)?)\s*\/\s*10/i,
  /confidence[-_\s]*score[:=\s]*(\d{1,2}(?:\.\d+)?)/i,
  /final[-_\s]*score[:=\s]*(\d{1,2}(?:\.\d+)?)/i,
  /score[:=\s]+(\d{1,2}(?:\.\d+)?)\s*\/\s*10/i,
];

const OVERRIDE_PATTERNS = [
  /override[:\s]+true/i,
  /\boverride\b.*\baccepted\b/i,
];

function extractConfidence(text) {
  if (!text) return null;
  for (const pattern of CONFIDENCE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const value = parseFloat(match[1]);
      if (!isNaN(value) && value >= 0 && value <= 10) return value;
    }
  }
  return null;
}

function extractOverride(text) {
  if (!text) return false;
  for (const pattern of OVERRIDE_PATTERNS) {
    if (pattern.test(text)) return true;
  }
  return false;
}

async function readStdin() {
  return await new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    setTimeout(() => resolve(data), 1000);
  });
}

async function main() {
  const raw = await readStdin();
  if (!raw.trim()) return;

  let payload;
  try { payload = JSON.parse(raw); }
  catch { return; }

  if (payload.tool_name !== 'Task') return;

  const input = payload.tool_input || {};
  const response = payload.tool_response || {};
  const agent_id = input.subagent_type || input.agentType;
  if (!agent_id) return;

  const description = input.description || '';
  const responseText = typeof response.content === 'string' ? response.content
    : Array.isArray(response.content) ? response.content.map(c => c?.text || '').join('\n')
    : '';

  const confidence = extractConfidence(responseText);
  const override = extractOverride(responseText);

  const taskSummary = description.slice(0, 200);
  const score = confidence ?? 0;

  // 1. JSONL append-only log (always)
  try {
    await logInvocation({
      agent_id,
      task_summary: taskSummary,
      confidence_score: score,
      override,
      duration_ms: payload.duration_ms ?? null,
      session_id: payload.session_id ?? null,
    });
  } catch { /* silent */ }

  // 2. SQLite mirror + low-confidence dispatch hint.
  // Single store open for both writes + read, then close.
  let store;
  try {
    const { AgentTaskStore } = await import('../lib/agent-task-store.mjs');
    store = new AgentTaskStore(process.cwd());
    await store.init();

    store.addTask({
      agent_id,
      task_summary: taskSummary,
      confidence_score: score,
      override,
      session_id: payload.session_id ?? null,
    });

    if (
      confidence !== null &&
      confidence < LOW_CONFIDENCE_THRESHOLD &&
      !override
    ) {
      const { suggestAlternatives } = await import('../lib/dispatch-suggester.mjs');
      const suggestions = await suggestAlternatives({
        store,
        taskSummary,
        currentAgent: agent_id,
        currentScore: score,
      });
      if (suggestions.length > 0) {
        const head = taskSummary.length > 80 ? taskSummary.slice(0, 80) + '…' : taskSummary;
        const lines = [
          `[evolve] dispatch-hint: ${agent_id} finished "${head}" at confidence ${score.toFixed(1)}`,
          `[evolve] similar tasks scored higher with:`,
        ];
        for (const s of suggestions) {
          const sample = s.sample_task.length > 60 ? s.sample_task.slice(0, 60) + '…' : s.sample_task;
          lines.push(`  - ${s.agent_id} avg ${s.avg_score.toFixed(1)} from ${s.sample_count} sample(s) (e.g. "${sample}")`);
        }
        lines.push(`[evolve] consider re-running via Task subagent_type=${suggestions[0].agent_id}`);
        console.log(lines.join('\n'));
      }
    }
  } catch { /* silent — non-critical mirror */ }
  finally { try { store?.close(); } catch {} }
}

main().catch(() => {/* silent */});
