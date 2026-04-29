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

export function selectOpenFeedback(entries, state, { limit = 10 } = {}) {
  return entries
    .filter(entry => entry?.id && isFeedbackOpen(state, entry.id))
    .slice(-limit);
}
