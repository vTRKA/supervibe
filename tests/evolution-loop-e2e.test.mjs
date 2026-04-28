import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  logInvocation, readInvocations, INVOCATION_LOG_PATH_FOR_TEST
} from '../scripts/lib/agent-invocation-logger.mjs';
import { detectUnderperformers } from '../scripts/lib/underperformer-detector.mjs';
import { aggregateForAgent } from '../scripts/effectiveness-tracker.mjs';
import { buildStrengthenSuggestions } from '../scripts/lib/auto-strengthen-trigger.mjs';

const sandbox = join(tmpdir(), `supervibe-e2e-${Date.now()}`);

before(async () => {
  await mkdir(join(sandbox, '.claude', 'memory'), { recursive: true });
  INVOCATION_LOG_PATH_FOR_TEST(join(sandbox, '.claude', 'memory', 'agent-invocations.jsonl'));
});

after(async () => { await rm(sandbox, { recursive: true, force: true }); });

test('E2E: invocations → log → aggregate → detect → suggest', async () => {
  for (let i = 0; i < 12; i++) {
    await logInvocation({
      agent_id: 'failing-stack-agent',
      task_summary: 'Implement feature ' + i,
      confidence_score: 7.5 + (Math.random() * 0.3),
    });
  }

  const invocations = await readInvocations({ agent_id: 'failing-stack-agent' });
  assert.strictEqual(invocations.length, 12);

  const eff = aggregateForAgent(invocations);
  assert.strictEqual(eff.iterations, 12);
  assert.ok(eff['avg-confidence'] < 8, `avg should be < 8; got ${eff['avg-confidence']}`);

  const all = await readInvocations({ limit: 10000 });
  const flagged = detectUnderperformers(all);
  assert.ok(flagged.find(f => f.agent_id === 'failing-stack-agent'),
    'detector should flag failing-stack-agent');

  const suggestions = await buildStrengthenSuggestions();
  const sug = suggestions.find(s => s.agent_id === 'failing-stack-agent');
  assert.ok(sug, 'suggestion should be present');
  assert.match(sug.command, /^\/supervibe-strengthen/);
});
