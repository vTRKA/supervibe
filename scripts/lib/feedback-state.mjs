import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const FEEDBACK_STATUSES = new Set(['pending', 'in_progress', 'resolved', 'rejected']);

export async function readFeedbackStatus(statusPath) {
  try {
    const raw = await readFile(statusPath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && parsed.entries ? parsed : { entries: {} };
  } catch {
    return { entries: {} };
  }
}

async function writeFeedbackStatus(statusPath, state) {
  await mkdir(dirname(statusPath), { recursive: true });
  await writeFile(statusPath, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

export async function ensureFeedbackTracked(statusPath, entries) {
  const state = await readFeedbackStatus(statusPath);
  let changed = false;
  for (const entry of entries) {
    if (!entry?.id) continue;
    if (!state.entries[entry.id]) {
      state.entries[entry.id] = {
        status: 'pending',
        firstSeenAt: new Date().toISOString(),
        prototypeSlug: entry.prototypeSlug || 'unknown',
        feedbackTargetId: entry.feedbackTargetId || entry.target?.feedbackTargetId || null,
        target: entry.target || null,
        viewport: entry.viewport || null,
        region: entry.region || null,
        url: entry.url || null,
      };
      changed = true;
    }
  }
  if (changed) await writeFeedbackStatus(statusPath, state);
  return state;
}

export async function markFeedbackStatus(statusPath, id, status, meta = {}) {
  if (!FEEDBACK_STATUSES.has(status)) {
    throw new Error(`invalid feedback status: ${status}`);
  }
  const state = await readFeedbackStatus(statusPath);
  const current = state.entries[id] || {};
  state.entries[id] = {
    ...current,
    ...meta,
    status,
    updatedAt: new Date().toISOString(),
  };
  if (status === 'resolved' && !state.entries[id].resolvedAt) {
    state.entries[id].resolvedAt = state.entries[id].updatedAt;
  }
  await writeFeedbackStatus(statusPath, state);
  return state.entries[id];
}

function isFeedbackOpen(state, id) {
  const status = state.entries[id]?.status || 'pending';
  return status === 'pending' || status === 'in_progress';
}

export async function readFeedbackQueue(queuePath) {
  try {
    const raw = await readFile(queuePath, 'utf8');
    return raw
      .split('\n')
      .filter(line => line.trim().length > 0)
      .map(line => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function inspectFeedbackLifecycle(queuePath, statusPath, options = {}) {
  const queueExists = existsSync(queuePath);
  const statusExists = existsSync(statusPath);
  const entries = await readFeedbackQueue(queuePath);
  const state = await readFeedbackStatus(statusPath);
  const open = selectOpenFeedback(entries, state, options);
  const resolved = entries.filter((entry) => {
    const status = state.entries[entry.id]?.status;
    return status === 'resolved' || status === 'rejected';
  });
  return {
    schemaVersion: 1,
    queueExists,
    statusExists,
    status: !queueExists && !statusExists
      ? 'not-initialized'
      : open.length > 0
        ? 'open'
        : 'no-open-feedback',
    entries: entries.length,
    open: open.length,
    resolved: resolved.length,
    openEntries: open,
  };
}

export function selectOpenFeedback(entries, state, { limit = 10, slug = '', target = '', unresolvedOnly = true } = {}) {
  return entries
    .filter(entry => entry?.id)
    .filter(entry => !unresolvedOnly || isFeedbackOpen(state, entry.id))
    .filter(entry => !slug || (entry.prototypeSlug || state.entries[entry.id]?.prototypeSlug || '') === slug)
    .filter(entry => {
      if (!target) return true;
      const targetId = entry.feedbackTargetId || entry.target?.feedbackTargetId || state.entries[entry.id]?.feedbackTargetId || '';
      return targetId === target;
    })
    .slice(-limit);
}
