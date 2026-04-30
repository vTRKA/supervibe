import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  logInvocation, INVOCATION_LOG_PATH_FOR_TEST
} from '../scripts/lib/agent-invocation-logger.mjs';
import { buildStrengthenSuggestions } from '../scripts/lib/auto-strengthen-trigger.mjs';

const sandbox = join(tmpdir(), `supervibe-strengthen-trig-${Date.now()}`);

before(async () => {
  await mkdir(join(sandbox, '.claude', 'memory'), { recursive: true });
  INVOCATION_LOG_PATH_FOR_TEST(join(sandbox, '.claude', 'memory', 'agent-invocations.jsonl'));
});

after(async () => { await rm(sandbox, { recursive: true, force: true }); });

test('buildStrengthenSuggestions: returns commands for flagged agents', async () => {
  for (let i = 0; i < 12; i++) {
    await logInvocation({
      agent_id: 'weak-agent',
      task_summary: 'task ' + i,
      confidence_score: 7 + (i % 3) * 0.1,
    });
  }
  const suggestions = await buildStrengthenSuggestions({ knownAgentIds: new Set(['weak-agent']) });
  const found = suggestions.find(s => s.agent_id === 'weak-agent');
  assert.ok(found, 'should suggest strengthen for weak-agent');
  assert.strictEqual(found.command, '/supervibe-strengthen weak-agent');
});

test('buildStrengthenSuggestions: returns array (empty or filled)', async () => {
  const sug = await buildStrengthenSuggestions();
  assert.ok(Array.isArray(sug));
});
