import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { preflight, formatMatches } from '../scripts/lib/memory-preflight.mjs';

test('preflight returns empty array on empty memory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'preflight-'));
  const matches = await preflight({ query: 'anything', projectRoot: root });
  assert.deepEqual(matches, []);
});

test('preflight finds matching entry by keyword (fallback grep)', async () => {
  const root = await mkdtemp(join(tmpdir(), 'preflight-'));
  await mkdir(join(root, '.claude', 'memory', 'decisions'), { recursive: true });
  await writeFile(
    join(root, '.claude', 'memory', 'decisions', '2026-04-foo.md'),
    `---
id: foo
type: decisions
date: 2026-04-15
---

We chose payment idempotency via Stripe Idempotency-Key header for all retries.`
  );

  const matches = await preflight({
    query: 'payment idempotency strategy',
    projectRoot: root,
    similarity: 0.3,
  });
  assert.equal(matches.length, 1);
  assert.equal(matches[0].category, 'decisions');
  assert.ok(matches[0].snippet.includes('idempotency'));
});

test('preflight respects limit', async () => {
  const root = await mkdtemp(join(tmpdir(), 'preflight-'));
  await mkdir(join(root, '.claude', 'memory', 'decisions'), { recursive: true });
  for (let i = 0; i < 10; i++) {
    await writeFile(
      join(root, '.claude', 'memory', 'decisions', `entry-${i}.md`),
      `---\nid: entry-${i}\n---\n\npayment thing ${i}`
    );
  }

  const matches = await preflight({
    query: 'payment',
    projectRoot: root,
    limit: 3,
    similarity: 0.1,
  });
  assert.equal(matches.length, 3);
});

test('formatMatches renders empty case', () => {
  const out = formatMatches([]);
  assert.ok(out.includes('No prior similar work'));
});

test('formatMatches renders matches with snippet', () => {
  const out = formatMatches([
    { path: 'decisions/foo.md', snippet: 'we chose X', similarity: 0.9, category: 'decisions' },
  ]);
  assert.ok(out.includes('decisions/foo.md'));
  assert.ok(out.includes('90% match'));
  assert.ok(out.includes('we chose X'));
});
