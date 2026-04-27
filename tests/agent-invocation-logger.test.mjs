import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { logInvocation, readInvocations, updateLatestInvocation, INVOCATION_LOG_PATH_FOR_TEST } from '../scripts/lib/agent-invocation-logger.mjs';

const sandbox = join(tmpdir(), `evolve-inv-log-${Date.now()}`);

before(async () => {
  await mkdir(join(sandbox, '.claude', 'memory'), { recursive: true });
  INVOCATION_LOG_PATH_FOR_TEST(join(sandbox, '.claude', 'memory', 'agent-invocations.jsonl'));
});

after(async () => { await rm(sandbox, { recursive: true, force: true }); });

test('logInvocation: appends entry to JSONL', async () => {
  await logInvocation({
    agent_id: 'laravel-developer',
    task_summary: 'Add login endpoint',
    confidence_score: 9.2,
    rubric: 'agent-delivery',
    override: false,
    duration_ms: 12000,
  });
  const entries = await readInvocations();
  assert.strictEqual(entries.length, 1);
  assert.strictEqual(entries[0].agent_id, 'laravel-developer');
});

test('readInvocations: filters by agent_id', async () => {
  await logInvocation({ agent_id: 'a', task_summary: 't1', confidence_score: 8 });
  await logInvocation({ agent_id: 'b', task_summary: 't2', confidence_score: 9 });
  await logInvocation({ agent_id: 'a', task_summary: 't3', confidence_score: 10 });
  const aOnly = await readInvocations({ agent_id: 'a' });
  assert.ok(aOnly.length >= 2);
  assert.ok(aOnly.every(e => e.agent_id === 'a'));
});

test('readInvocations: limit/offset works', async () => {
  const all = await readInvocations({ limit: 2 });
  assert.ok(all.length <= 2);
});

test('updateLatestInvocation: patches latest entry', async () => {
  await logInvocation({ agent_id: 'patch-test', task_summary: 'will be patched', confidence_score: 5 });
  const result = await updateLatestInvocation({ confidence_score: 9, user_feedback: 'accept' }, { matchAgentId: 'patch-test' });
  assert.strictEqual(result, true);
  const entries = await readInvocations({ agent_id: 'patch-test' });
  const last = entries[entries.length - 1];
  assert.strictEqual(last.confidence_score, 9);
  assert.strictEqual(last.user_feedback, 'accept');
});
