import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AgentTaskStore } from '../scripts/lib/agent-task-store.mjs';

const sandbox = join(tmpdir(), `supervibe-task-store-${Date.now()}`);
const dbPath  = join(sandbox, 'agent-tasks.db');
let store;

before(async () => {
  await mkdir(sandbox, { recursive: true });
  store = new AgentTaskStore(sandbox, { dbPath });
  await store.init();
});

after(async () => {
  store?.close();
  await rm(sandbox, { recursive: true, force: true });
});

test('addTask + stats: round-trip a single entry', () => {
  store.addTask({
    agent_id: 'laravel-developer',
    task_summary: 'Add login endpoint with idempotency',
    confidence_score: 9.2,
  });
  assert.strictEqual(store.stats().totalTasks, 1);
});

test('addTask: rejects missing required fields', () => {
  assert.throws(() => store.addTask({ agent_id: 'x', task_summary: 'y' }), /confidence_score/);
  assert.throws(() => store.addTask({ task_summary: 'y', confidence_score: 9 }), /agent_id/);
  assert.throws(() => store.addTask({ agent_id: 'x', confidence_score: 9 }), /task_summary/);
});

test('findSimilar: empty pattern returns []', () => {
  // Punctuation-only / whitespace yields no usable tokens
  assert.deepStrictEqual(store.findSimilar('     '), []);
  assert.deepStrictEqual(store.findSimilar('!!!'), []);
});

test('findSimilar: matches on shared tokens, ranks by BM25', () => {
  store.addTask({ agent_id: 'a', task_summary: 'Build login OAuth Google', confidence_score: 9.0 });
  store.addTask({ agent_id: 'b', task_summary: 'Add login endpoint with JWT',          confidence_score: 9.5 });
  store.addTask({ agent_id: 'c', task_summary: 'Refactor invoice rendering pipeline',  confidence_score: 9.3 });
  const hits = store.findSimilar('login endpoint OAuth', { minConfidence: 8.0 });
  const ids  = hits.map(h => h.agent_id);
  assert.ok(ids.includes('a'), 'agent a should match (login OAuth)');
  assert.ok(ids.includes('b'), 'agent b should match (login endpoint)');
  assert.ok(!ids.includes('c'), 'agent c should NOT match (no shared tokens)');
});

test('findSimilar: respects minConfidence floor', () => {
  store.addTask({ agent_id: 'low-1', task_summary: 'flaky payment retry handling', confidence_score: 6.5 });
  store.addTask({ agent_id: 'hi-1',  task_summary: 'flaky payment retry handling', confidence_score: 9.4 });
  const hits = store.findSimilar('payment retry', { minConfidence: 8.5 });
  const ids  = hits.map(h => h.agent_id);
  assert.ok(ids.includes('hi-1'));
  assert.ok(!ids.includes('low-1'));
});

test('findSimilar: excludeAgent filters out the named agent', () => {
  store.addTask({ agent_id: 'me',    task_summary: 'cypress smoke test for checkout', confidence_score: 9.0 });
  store.addTask({ agent_id: 'other', task_summary: 'cypress smoke test for checkout', confidence_score: 9.5 });
  const hits = store.findSimilar('cypress smoke checkout', {
    minConfidence: 8.0, excludeAgent: 'me',
  });
  const ids  = hits.map(h => h.agent_id);
  assert.ok(!ids.includes('me'));
  assert.ok(ids.includes('other'));
});

test('findSimilar: handles Cyrillic input without exceptions', () => {
  store.addTask({ agent_id: 'ru-1', task_summary: 'Реализовать платежный endpoint с идемпотентностью', confidence_score: 9.2 });
  store.addTask({ agent_id: 'ru-2', task_summary: 'Дизайн брендбука для landing страницы',              confidence_score: 9.4 });
  const hits = store.findSimilar('платежный idempotency', { minConfidence: 8.0 });
  // Just assert no throw + result is a valid array
  assert.ok(Array.isArray(hits));
});

test('findSimilar: skips override=true rows by default', () => {
  store.addTask({ agent_id: 'with-override', task_summary: 'unique-token-zebra context override case', confidence_score: 8.7, override: true });
  store.addTask({ agent_id: 'no-override',   task_summary: 'unique-token-zebra context normal case',   confidence_score: 8.7, override: false });
  const hits = store.findSimilar('zebra context', { minConfidence: 8.0 });
  const ids  = hits.map(h => h.agent_id);
  assert.ok(ids.includes('no-override'));
  assert.ok(!ids.includes('with-override'));
  // includeOverride=true brings them back
  const all = store.findSimilar('zebra context', { minConfidence: 8.0, includeOverride: true });
  assert.ok(all.map(h => h.agent_id).includes('with-override'));
});
