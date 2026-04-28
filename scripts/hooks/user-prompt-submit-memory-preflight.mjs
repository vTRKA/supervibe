#!/usr/bin/env node
/**
 * UserPromptSubmit hook — auto-injects memory pre-flight matches as additionalContext.
 *
 * On every user prompt:
 * 1. Heuristic: detect if prompt is non-trivial (has technical keywords / question / file path).
 * 2. Run memory preflight against the prompt.
 * 3. If matches found, inject them as additionalContext so Claude sees prior similar work
 *    BEFORE answering / dispatching agents.
 *
 * Cost guard: only runs when prompt is non-trivial AND length >= 30 chars (skip "yes"/"no"/"ok").
 *
 * Disable per-session: set SUPERVIBE_PREFLIGHT_DISABLED=1
 */
import { join } from 'node:path';
import { preflight, formatMatches } from '../lib/memory-preflight.mjs';

const TRIVIAL_PATTERNS = [
  /^(yes|no|ok|sure|да|нет|ладно|хорошо|давай|вперёд|пиши|next)[\s.!?]*$/i,
  /^\/[a-z-]+(\s|$)/i,  // slash commands handled separately
];

const TECHNICAL_KEYWORDS = [
  /\b(implement|build|create|fix|debug|refactor|design|migrate|optimize|review)\b/i,
  /\b(сделай|создай|реши|добавь|почини|оптимизируй|спроектируй|разработай)\b/i,
  /\b(api|database|component|service|hook|migration|schema|test|deploy)\b/i,
  /\b[A-Z][a-zA-Z]+(?:Controller|Service|Model|Component|Handler|Manager)\b/, // class-like names
  /\.\w+(?:js|ts|jsx|tsx|py|go|rs|rb|php|java|kt|swift|md)\b/, // file extensions
  /\b(error|bug|issue|problem|crash|fail)\b/i,
  /\b(ошибка|баг|проблема|сломалось|упал)\b/i,
];

function isTrivial(prompt) {
  const trimmed = prompt.trim();
  if (trimmed.length < 30) return true;
  return TRIVIAL_PATTERNS.some(p => p.test(trimmed));
}

function isTechnical(prompt) {
  return TECHNICAL_KEYWORDS.some(p => p.test(prompt));
}

function readEvent() {
  return new Promise((resolve) => {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { raw += chunk; });
    process.stdin.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { resolve({}); }
    });
    setTimeout(() => resolve({}), 500); // hard cap
  });
}

async function main() {
  if (process.env.SUPERVIBE_PREFLIGHT_DISABLED === '1') {
    process.stdout.write(JSON.stringify({}));
    return;
  }

  const event = await readEvent();
  const prompt = event.prompt || event.user_prompt || '';

  if (!prompt || isTrivial(prompt) || !isTechnical(prompt)) {
    process.stdout.write(JSON.stringify({}));
    return;
  }

  const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();

  let matches;
  try {
    matches = await preflight({
      query: prompt.slice(0, 500),
      projectRoot,
      limit: 3,
      similarity: 0.4,
    });
  } catch {
    process.stdout.write(JSON.stringify({}));
    return;
  }

  if (matches.length === 0) {
    process.stdout.write(JSON.stringify({}));
    return;
  }

  const reminder = `<system-reminder>
[supervibe] memory pre-flight: found ${matches.length} prior entr${matches.length === 1 ? 'y' : 'ies'} similar to this request.

${formatMatches(matches)}

Consider citing these in your response (or explicitly note why they don't apply) before producing new artifacts. Avoids re-deriving prior decisions.
</system-reminder>`;

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: reminder },
  }));
}

main().catch(() => {
  process.stdout.write(JSON.stringify({}));
});
