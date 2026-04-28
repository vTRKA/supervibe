import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdir, rm, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { appendOverrideEntry } from '../scripts/lib/append-override-log.mjs';

const SANDBOX = join(tmpdir(), `evolve-override-test-${Date.now()}`);

before(async () => {
  await mkdir(SANDBOX, { recursive: true });
});

after(async () => {
  await rm(SANDBOX, { recursive: true, force: true });
});

test('appendOverrideEntry creates .claude/ if missing', async () => {
  const entry = {
    'artifact-type': 'plan',
    'artifact-ref': 'docs/plans/test.md',
    score: 7,
    'max-score': 10,
    'status-overridden': 'BLOCK',
    override: true,
    reason: 'shipping prototype phase',
    gaps: ['no error handling'],
    agent: 'supervibe:test-agent',
    'user-confirmed': true
  };
  await appendOverrideEntry(SANDBOX, entry);
  const claudeStat = await stat(join(SANDBOX, '.claude'));
  assert.ok(claudeStat.isDirectory(), '.claude/ must be created');
});

test('appendOverrideEntry creates log file with correct first entry', async () => {
  const logPath = join(SANDBOX, '.claude', 'confidence-log.jsonl');
  assert.ok(existsSync(logPath), 'log file must exist after first append');
  const content = await readFile(logPath, 'utf8');
  const lines = content.split('\n').filter(Boolean);
  assert.strictEqual(lines.length, 1, 'must have exactly 1 entry');
  const parsed = JSON.parse(lines[0]);
  assert.strictEqual(parsed.score, 7);
  assert.strictEqual(parsed.override, true);
  assert.ok(parsed.timestamp, 'must include timestamp');
});

test('appendOverrideEntry appends without overwriting existing entries', async () => {
  await appendOverrideEntry(SANDBOX, {
    'artifact-type': 'agent-output',
    'artifact-ref': 'second.md',
    score: 8,
    'max-score': 10,
    'status-overridden': 'BLOCK',
    override: true,
    reason: 'follow-up override scenario',
    gaps: [],
    agent: 'supervibe:test-agent-2',
    'user-confirmed': true
  });
  const logPath = join(SANDBOX, '.claude', 'confidence-log.jsonl');
  const content = await readFile(logPath, 'utf8');
  const lines = content.split('\n').filter(Boolean);
  assert.strictEqual(lines.length, 2, 'must have 2 entries after second append');
  const first = JSON.parse(lines[0]);
  const second = JSON.parse(lines[1]);
  assert.strictEqual(first.score, 7, 'first entry preserved');
  assert.strictEqual(second.score, 8, 'second entry added');
});

test('appendOverrideEntry rejects entries with reason shorter than 10 chars', async () => {
  await assert.rejects(
    () => appendOverrideEntry(SANDBOX, {
      'artifact-type': 'plan',
      'artifact-ref': 'x',
      score: 5,
      'max-score': 10,
      'status-overridden': 'BLOCK',
      override: true,
      reason: 'short',
      gaps: [],
      agent: 'x',
      'user-confirmed': true
    }),
    /reason must be at least 10 characters/
  );
});

test('appendOverrideEntry rejects entries missing required fields', async () => {
  await assert.rejects(
    () => appendOverrideEntry(SANDBOX, { override: true }),
    /missing required field/
  );
});

test('readOverrideLog returns parsed entries in order', async () => {
  const { readOverrideLog } = await import('../scripts/lib/append-override-log.mjs');
  const entries = await readOverrideLog(SANDBOX);
  assert.strictEqual(entries.length, 2);
  assert.strictEqual(entries[0].score, 7);
  assert.strictEqual(entries[1].score, 8);
});

test('computeOverrideRate calculates correct rate from log', async () => {
  const { computeOverrideRate } = await import('../scripts/lib/append-override-log.mjs');
  const rate = await computeOverrideRate(SANDBOX, { window: 100 });
  assert.strictEqual(rate.totalEntries, 2);
  assert.strictEqual(rate.overrideEntries, 2);
  assert.strictEqual(rate.rate, 1.0);
});
