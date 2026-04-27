import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdir, rm, readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

const sandbox = join(tmpdir(), `evolve-hook-${Date.now()}`);
const logPath = join(sandbox, '.claude', 'memory', 'agent-invocations.jsonl');

before(async () => {
  await mkdir(join(sandbox, '.claude', 'memory'), { recursive: true });
});

after(async () => { await rm(sandbox, { recursive: true, force: true }); });

function runHook(input) {
  const cmd = `node scripts/hooks/post-tool-use-log.mjs`;
  return execSync(cmd, {
    cwd: process.cwd(),
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, EVOLVE_INVOCATION_LOG: logPath },
  });
}

function readEntries() {
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
}

test('hook: logs Task tool dispatch with agent_id from subagent_type', () => {
  runHook({
    tool_name: 'Task',
    tool_input: { subagent_type: 'laravel-developer', description: 'Add login endpoint' },
    tool_response: { content: 'Done. Confidence: 9.2/10. Pest tests green.' },
    session_id: 's1',
  });
  const entries = readEntries();
  const last = entries[entries.length - 1];
  assert.strictEqual(last.agent_id, 'laravel-developer');
  assert.strictEqual(last.task_summary, 'Add login endpoint');
  assert.strictEqual(last.confidence_score, 9.2);
});

test('hook: ignores non-Task tools', () => {
  const before = readEntries().length;
  runHook({
    tool_name: 'Read',
    tool_input: { file_path: '/foo' },
    tool_response: { content: 'file content' },
  });
  const after = readEntries().length;
  assert.strictEqual(after, before, 'should not log non-Task tools');
});

test('hook: handles missing fields gracefully (no throw)', () => {
  runHook({});
  runHook({ tool_name: 'Task' });
  runHook({ tool_name: 'Task', tool_input: {} });
  assert.ok(true);
});

test('hook: extracts confidence score from various patterns', () => {
  const before = readEntries().length;
  const cases = [
    { content: 'Confidence: 9.2/10', expected: 9.2 },
    { content: 'Final score: 8.5', expected: 8.5 },
    { content: 'confidence-score=10', expected: 10 },
    { content: 'no score here', expected: 0 },
  ];
  for (const c of cases) {
    runHook({
      tool_name: 'Task',
      tool_input: { subagent_type: 'test-agent', description: 'test' },
      tool_response: { content: c.content },
    });
  }
  const entries = readEntries();
  const lastFour = entries.slice(-4);
  assert.strictEqual(lastFour[0].confidence_score, 9.2);
  assert.strictEqual(lastFour[1].confidence_score, 8.5);
  assert.strictEqual(lastFour[2].confidence_score, 10);
  assert.strictEqual(lastFour[3].confidence_score, 0);
});

test('hook: extracts override marker', () => {
  runHook({
    tool_name: 'Task',
    tool_input: { subagent_type: 'override-agent', description: 'override test' },
    tool_response: { content: 'Done. Confidence: 9/10. override: true' },
  });
  const entries = readEntries();
  const last = entries[entries.length - 1];
  assert.strictEqual(last.override, true);
});
