#!/usr/bin/env node
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { markFeedbackStatus, readFeedbackQueue, readFeedbackStatus, selectOpenFeedback } from './lib/feedback-state.mjs';

const { values } = parseArgs({
  options: {
    project: { type: 'string', default: process.cwd() },
    list: { type: 'boolean', default: false },
    resolve: { type: 'string', default: '' },
    reject: { type: 'string', default: '' },
    progress: { type: 'string', default: '' },
    resolution: { type: 'string', default: '' },
    slug: { type: 'string', default: '' },
    target: { type: 'string', default: '' },
    all: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help) {
  console.log(`Supervibe feedback status

Usage:
  feedback-status.mjs --list
  feedback-status.mjs --list --slug <prototype-slug>
  feedback-status.mjs --list --target <feedback-target-id>
  feedback-status.mjs --list --all
  feedback-status.mjs --progress <id>
  feedback-status.mjs --resolve <id> --resolution .supervibe/artifacts/<prototypes|mockups|presentations>/<slug>/feedback-resolutions/<id>.md
  feedback-status.mjs --reject <id>`);
  process.exit(0);
}

const projectRoot = values.project;
const queuePath = join(projectRoot, '.supervibe', 'memory', 'feedback-queue.jsonl');
const statusPath = join(projectRoot, '.supervibe', 'memory', 'feedback-status.json');

if (values.resolve) {
  const row = await markFeedbackStatus(statusPath, values.resolve, 'resolved', { resolution: values.resolution || null });
  console.log(`resolved ${values.resolve}${row.resolution ? ` -> ${row.resolution}` : ''}`);
  process.exit(0);
}

if (values.reject) {
  await markFeedbackStatus(statusPath, values.reject, 'rejected');
  console.log(`rejected ${values.reject}`);
  process.exit(0);
}

if (values.progress) {
  await markFeedbackStatus(statusPath, values.progress, 'in_progress');
  console.log(`in_progress ${values.progress}`);
  process.exit(0);
}

const entries = await readFeedbackQueue(queuePath);
const state = await readFeedbackStatus(statusPath);
const open = selectOpenFeedback(entries, state, {
  limit: 20,
  slug: values.slug,
  target: values.target,
  unresolvedOnly: values.all !== true,
});

if (open.length === 0) {
  console.log('No open feedback.');
} else {
  for (const entry of open) {
    const status = state.entries[entry.id]?.status || 'pending';
    const targetId = entry.feedbackTargetId || entry.target?.feedbackTargetId || state.entries[entry.id]?.feedbackTargetId || 'unknown';
    console.log(`${entry.id}\t${status}\t${entry.prototypeSlug || 'unknown'}\t${targetId}\t${entry.type || 'unknown'}\t${entry.region?.selector || 'unknown'}\t${entry.comment || ''}`);
  }
}
