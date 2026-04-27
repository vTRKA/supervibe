import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MemoryStore } from '../scripts/lib/memory-store.mjs';

const SANDBOX = join(tmpdir(), `evolve-memory-test-${Date.now()}`);
let store;

before(async () => {
  await mkdir(SANDBOX, { recursive: true });
  store = new MemoryStore(SANDBOX);
  await store.init();

  // Seed memory entries
  const decisions = join(SANDBOX, '.claude', 'memory', 'decisions');
  await mkdir(decisions, { recursive: true });
  await writeFile(
    join(decisions, '2026-03-15-billing-idempotency.md'),
    `---
id: 2026-03-15-billing-idempotency
type: decision
date: 2026-03-15
tags: [billing, idempotency, redis-cache]
agent: laravel-architect
confidence: 10
---

# Billing idempotency via Redis lock

We chose Redis SETNX for idempotency keys (5-min TTL) over DB-row-lock because billing DB write throughput was bottleneck during checkout flow.

Tradeoff: we depend on Redis availability for new payment processing.
`
  );

  const patterns = join(SANDBOX, '.claude', 'memory', 'patterns');
  await mkdir(patterns, { recursive: true });
  await writeFile(
    join(patterns, 'queue-job-with-idempotency.md'),
    `---
id: queue-job-with-idempotency
type: pattern
date: 2026-04-01
tags: [queue, idempotency, jobs]
agent: queue-worker-architect
confidence: 9
---

# Queue job with idempotency

Pattern: every job declares idempotency key via Cache::lock with 5min TTL. Failed jobs retry safely.
`
  );

  const solutions = join(SANDBOX, '.claude', 'memory', 'solutions');
  await mkdir(solutions, { recursive: true });
  await writeFile(
    join(solutions, 'stripe-webhook-replay-protection.md'),
    `---
id: stripe-webhook-replay-protection
type: solution
date: 2026-04-10
tags: [stripe, webhook, billing, idempotency]
agent: laravel-developer
confidence: 10
---

# Stripe webhook replay protection

Stripe's signature verification + storing event_id in Redis with 7-day TTL prevents replay attacks.
`
  );

  await store.rebuildIndex();
});

after(async () => {
  store.close();
  await rm(SANDBOX, { recursive: true, force: true });
});

test('rebuildIndex indexes seeded entries', () => {
  const stats = store.stats();
  assert.strictEqual(stats.totalEntries, 3);
  assert.ok(stats.uniqueTags >= 5, `expected ≥5 unique tags, got ${stats.uniqueTags}`);
});

test('FTS5 search by query returns BM25-ranked results', () => {
  const results = store.search({ query: 'idempotency redis' });
  assert.ok(results.length >= 2, 'should match ≥2 entries on idempotency+redis');
  assert.ok(results[0].score >= 0, 'BM25 score present');
});

test('Tag filter (AND logic) works', () => {
  const results = store.search({ tags: ['billing', 'idempotency'] });
  // Both billing-idempotency and stripe-webhook have BOTH tags
  assert.ok(results.length >= 2, `expected ≥2 with billing+idempotency, got ${results.length}`);
  for (const r of results) {
    assert.ok(r.tags.includes('billing') && r.tags.includes('idempotency'), 'all results must have both tags');
  }
});

test('Type filter restricts to one category', () => {
  const decisions = store.search({ type: 'decision' });
  assert.strictEqual(decisions.length, 1);
  assert.strictEqual(decisions[0].type, 'decision');
});

test('minConfidence filter excludes low-quality entries', () => {
  const high = store.search({ minConfidence: 10 });
  // Only entries with confidence=10 (billing-idempotency, stripe-webhook)
  assert.ok(high.every(r => r.confidence >= 10), 'all results must have confidence ≥10');
  assert.strictEqual(high.length, 2);
});

test('Search returns empty array (not error) when no matches', () => {
  const results = store.search({ query: 'completely-unmatched-string-xyz123' });
  assert.deepStrictEqual(results, []);
});

test('Combined query + tags + type filter', () => {
  const results = store.search({
    query: 'redis',
    tags: ['billing'],
    type: 'decision'
  });
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].id, '2026-03-15-billing-idempotency');
});

test('Limit caps results count', () => {
  const limited = store.search({ query: 'idempotency', limit: 1 });
  assert.strictEqual(limited.length, 1);
});

test('Each result has full structure', () => {
  const results = store.search({ query: 'billing' });
  for (const r of results) {
    assert.ok(r.id);
    assert.ok(r.type);
    assert.ok(Array.isArray(r.tags));
    assert.ok(typeof r.confidence === 'number');
    assert.ok(r.file);
    assert.ok(r.summary);
    assert.ok(typeof r.score === 'number');
  }
});
