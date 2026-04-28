import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AgentTaskStore } from '../scripts/lib/agent-task-store.mjs';
import { suggestAlternatives } from '../scripts/lib/dispatch-suggester.mjs';

const sandbox = join(tmpdir(), `evolve-suggester-${Date.now()}`);
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

test('suggestAlternatives: empty store → []', async () => {
  const out = await suggestAlternatives({
    store, taskSummary: 'add login endpoint', currentAgent: 'someone',
  });
  assert.deepStrictEqual(out, []);
});

test('suggestAlternatives: thin data (<3 samples) → []', async () => {
  store.addTask({ agent_id: 'rare-agent', task_summary: 'unique-marker-alpha login flow', confidence_score: 9.5 });
  const out = await suggestAlternatives({
    store, taskSummary: 'unique-marker-alpha login', currentAgent: 'me',
  });
  assert.deepStrictEqual(out, []);
});

test('suggestAlternatives: groups by agent and ranks by avg × log(count)', async () => {
  // Three high-confidence runs for two different agents on similar tasks
  for (let i = 0; i < 4; i++) {
    store.addTask({
      agent_id: 'strong-agent',
      task_summary: `payment idempotency unique-marker-beta task ${i}`,
      confidence_score: 9.4,
    });
  }
  for (let i = 0; i < 3; i++) {
    store.addTask({
      agent_id: 'weaker-agent',
      task_summary: `payment idempotency unique-marker-beta task ${i}`,
      confidence_score: 8.6,
    });
  }
  const out = await suggestAlternatives({
    store,
    taskSummary: 'payment idempotency unique-marker-beta',
    currentAgent: 'failing-current-agent',
  });
  assert.ok(out.length >= 2, `expected ≥2 alternatives; got ${out.length}`);
  // Strong agent should rank first (higher avg AND more samples)
  assert.strictEqual(out[0].agent_id, 'strong-agent');
  assert.ok(out[0].avg_score > out[1].avg_score
    || (out[0].avg_score === out[1].avg_score && out[0].sample_count >= out[1].sample_count));
});

test('suggestAlternatives: excludes the current agent from suggestions', async () => {
  for (let i = 0; i < 3; i++) {
    store.addTask({
      agent_id: 'self-agent',
      task_summary: `unique-marker-gamma kafka consumer rebalance ${i}`,
      confidence_score: 9.7,
    });
  }
  for (let i = 0; i < 3; i++) {
    store.addTask({
      agent_id: 'other-agent',
      task_summary: `unique-marker-gamma kafka consumer rebalance ${i}`,
      confidence_score: 9.0,
    });
  }
  const out = await suggestAlternatives({
    store,
    taskSummary: 'unique-marker-gamma kafka rebalance',
    currentAgent: 'self-agent',
  });
  const ids = out.map(x => x.agent_id);
  assert.ok(!ids.includes('self-agent'), 'must not propose the current agent');
  assert.ok(ids.includes('other-agent'));
});

test('suggestAlternatives: returns at most TOP_K_ALTERNATIVES (3)', async () => {
  // Five different agents each with 3 high-conf samples on the same topic
  for (const id of ['a1','a2','a3','a4','a5']) {
    for (let i = 0; i < 3; i++) {
      store.addTask({
        agent_id: id,
        task_summary: `unique-marker-delta auth JWT refresh-token rotation ${i}`,
        confidence_score: 9.0 + Math.random() * 0.5,
      });
    }
  }
  const out = await suggestAlternatives({
    store,
    taskSummary: 'unique-marker-delta auth JWT refresh rotation',
    currentAgent: 'never-mentioned-agent',
  });
  assert.ok(out.length <= 3, `must cap at 3 suggestions; got ${out.length}`);
});
