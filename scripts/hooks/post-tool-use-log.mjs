#!/usr/bin/env node
// PostToolUse hook — invoked by Claude Code after every tool call.
// Reads JSON from stdin, logs Task (subagent dispatch) calls to invocation log.
// MUST be fast (< 100ms) and failure-tolerant — never blocks the main flow.

import { logInvocation } from '../lib/agent-invocation-logger.mjs';

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

  try {
    await logInvocation({
      agent_id,
      task_summary: description.slice(0, 200),
      confidence_score: confidence ?? 0,
      override,
      duration_ms: payload.duration_ms ?? null,
      session_id: payload.session_id ?? null,
    });
  } catch {
    // Silent — hook must never block
  }
}

main().catch(() => {/* silent */});
