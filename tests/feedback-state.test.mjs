import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ensureFeedbackTracked,
  markFeedbackStatus,
  readFeedbackQueue,
  readFeedbackStatus,
  selectOpenFeedback,
} from '../scripts/lib/feedback-state.mjs';

test('ensureFeedbackTracked initializes new entries as pending', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'fb-state-'));
  const status = join(dir, 'status.json');
  const state = await ensureFeedbackTracked(status, [{ id: 'a', prototypeSlug: 'checkout' }]);
  assert.equal(state.entries.a.status, 'pending');
  assert.equal(state.entries.a.prototypeSlug, 'checkout');
});

test('markFeedbackStatus resolves an entry and selectOpenFeedback filters it out', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'fb-state-'));
  const status = join(dir, 'status.json');
  await ensureFeedbackTracked(status, [{ id: 'a' }, { id: 'b' }]);
  await markFeedbackStatus(status, 'a', 'resolved', { resolution: 'prototypes/x/feedback-resolutions/a.md' });
  const state = await readFeedbackStatus(status);
  const open = selectOpenFeedback([{ id: 'a' }, { id: 'b' }], state);
  assert.deepEqual(open.map(e => e.id), ['b']);
  assert.match(state.entries.a.resolution, /feedback-resolutions/);
});

test('readFeedbackQueue ignores malformed JSONL rows', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'fb-state-'));
  const queue = join(dir, 'queue.jsonl');
  await writeFile(queue, '{"id":"a"}\nnot-json\n{"id":"b"}\n');
  const entries = await readFeedbackQueue(queue);
  assert.deepEqual(entries.map(e => e.id), ['a', 'b']);
});
