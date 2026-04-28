#!/usr/bin/env node
import { join } from 'node:path';
import { drainNewEntries, writeCursor } from '../lib/feedback-cursor.mjs';

function readEvent() {
  let raw = '';
  process.stdin.on('data', chunk => raw += chunk);
  return new Promise(r => process.stdin.on('end', () => {
    try { r(raw ? JSON.parse(raw) : {}); } catch { r({}); }
  }));
}

function routeFeedback(entry) {
  switch (entry.type) {
    case 'visual':
    case 'motion':
      return 'creative-director';
    case 'layout':
    case 'a11y':
      return 'prototype-builder';
    case 'copy':
      return 'copywriter';
    default:
      return 'prototype-builder';
  }
}

function formatEntry(entry) {
  const agent = routeFeedback(entry);
  return [
    `[supervibe] browser-feedback received:`,
    `- id: ${entry.id}`,
    `- prototype: ${entry.prototypeSlug}`,
    `- viewport: ${entry.viewport}`,
    `- selector: ${entry.region?.selector || 'unknown'}`,
    `- type: ${entry.type}`,
    `- comment: ${JSON.stringify(entry.comment)}`,
    `- suggested-agent: ${agent}`,
    `- url: ${entry.url || ''}`,
  ].join('\n');
}

async function main() {
  await readEvent();
  const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const queuePath = join(projectRoot, '.claude', 'memory', 'feedback-queue.jsonl');
  const cursorPath = join(projectRoot, '.claude', 'memory', 'feedback-cursor.json');

  const { entries, newOffset } = await drainNewEntries({ queuePath, cursorPath });
  if (!entries.length) {
    process.stdout.write(JSON.stringify({}));
    return;
  }
  await writeCursor(cursorPath, newOffset);

  const blocks = entries.map(formatEntry).join('\n\n');
  const additionalContext = `<system-reminder>
${entries.length} new browser-feedback entr${entries.length === 1 ? 'y' : 'ies'} since last prompt.

${blocks}

INVOKE the \`supervibe:browser-feedback\` skill to triage and respond. Do NOT skip; the user is waiting for action on these.
</system-reminder>`;

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext },
  }));
}

main().catch(err => {
  console.error(`[feedback-hook] ${err.message}`);
  process.stdout.write(JSON.stringify({}));
  process.exit(0);
});
