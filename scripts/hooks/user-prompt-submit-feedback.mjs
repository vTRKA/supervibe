#!/usr/bin/env node
import { join } from 'node:path';
import { drainNewEntries, writeCursor } from '../lib/feedback-cursor.mjs';
import {
  ensureFeedbackTracked,
  readFeedbackQueue,
  selectOpenFeedback,
} from '../lib/feedback-state.mjs';

function readEvent() {
  let raw = '';
  process.stdin.on('data', chunk => raw += chunk);
  return new Promise(r => process.stdin.on('end', () => {
    try { r(raw ? JSON.parse(raw) : {}); } catch { r({}); }
  }));
}

function routeFeedback(entry) {
  const isPresentation = String(entry.url || '').includes('/presentations/') ||
    String(entry.prototypeSlug || '').startsWith('presentation:');
  if (isPresentation) return 'presentation-deck-builder';

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
  const label = String(entry.prototypeSlug || '').startsWith('presentation:') ? 'presentation' : 'artifact';
  return [
    `[supervibe] browser-feedback received:`,
    `- id: ${entry.id}`,
    `- ${label}: ${entry.prototypeSlug}`,
    `- viewport: ${entry.viewport}`,
    `- selector: ${entry.region?.selector || 'unknown'}`,
    `- type: ${entry.type}`,
    `- status: pending`,
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
  const statusPath = join(projectRoot, '.claude', 'memory', 'feedback-status.json');

  const { entries, newOffset } = await drainNewEntries({ queuePath, cursorPath });
  const allEntries = await readFeedbackQueue(queuePath);
  const state = await ensureFeedbackTracked(statusPath, allEntries);
  const openEntries = selectOpenFeedback(allEntries, state, { limit: 5 });

  if (!entries.length && !openEntries.length) {
    process.stdout.write(JSON.stringify({}));
    return;
  }
  if (entries.length) await writeCursor(cursorPath, newOffset);

  const newIds = new Set(entries.map(e => e.id));
  const visibleEntries = [
    ...entries.filter(e => openEntries.some(o => o.id === e.id)),
    ...openEntries.filter(e => !newIds.has(e.id)),
  ];
  const blocks = visibleEntries.map(formatEntry).join('\n\n');
  const newCount = entries.filter(e => openEntries.some(o => o.id === e.id)).length;
  const pendingCount = visibleEntries.length - newCount;
  const additionalContext = `<system-reminder>
${newCount} new browser-feedback entr${newCount === 1 ? 'y' : 'ies'} since last prompt.
${pendingCount} unresolved prior entr${pendingCount === 1 ? 'y' : 'ies'} still open.

${blocks}

INVOKE the \`supervibe:browser-feedback\` skill to triage and respond. After applying or rejecting a fix, run \`node "$CLAUDE_PLUGIN_ROOT/scripts/feedback-status.mjs" --resolve <id> --resolution <path>\` or \`--reject <id>\` so resolved feedback stops resurfacing.
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
