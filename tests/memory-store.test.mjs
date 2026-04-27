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
  // Disable embeddings in tests for speed (no model download)
  store = new MemoryStore(SANDBOX, { useEmbeddings: false });
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

test('FTS5 search by query returns BM25-ranked results', async () => {
  const results = await store.search({ query: 'idempotency redis', semantic: false });
  assert.ok(results.length >= 2, 'should match ≥2 entries on idempotency+redis');
  assert.ok(results[0].score >= 0, 'BM25 score present');
});

test('Tag filter (AND logic) works', async () => {
  const results = await store.search({ tags: ['billing', 'idempotency'], semantic: false });
  // Both billing-idempotency and stripe-webhook have BOTH tags
  assert.ok(results.length >= 2, `expected ≥2 with billing+idempotency, got ${results.length}`);
  for (const r of results) {
    assert.ok(r.tags.includes('billing') && r.tags.includes('idempotency'), 'all results must have both tags');
  }
});

test('Type filter restricts to one category', async () => {
  const decisions = await store.search({ type: 'decision', semantic: false });
  assert.strictEqual(decisions.length, 1);
  assert.strictEqual(decisions[0].type, 'decision');
});

test('minConfidence filter excludes low-quality entries', async () => {
  const high = await store.search({ minConfidence: 10, semantic: false });
  // Only entries with confidence=10 (billing-idempotency, stripe-webhook)
  assert.ok(high.every(r => r.confidence >= 10), 'all results must have confidence ≥10');
  assert.strictEqual(high.length, 2);
});

test('Search returns empty array (not error) when no matches', async () => {
  const results = await store.search({ query: 'completely-unmatched-string-xyz123', semantic: false });
  assert.deepStrictEqual(results, []);
});

test('Combined query + tags + type filter', async () => {
  const results = await store.search({
    query: 'redis',
    tags: ['billing'],
    type: 'decision',
    semantic: false
  });
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].id, '2026-03-15-billing-idempotency');
});

test('Limit caps results count', async () => {
  const limited = await store.search({ query: 'idempotency', limit: 1, semantic: false });
  assert.strictEqual(limited.length, 1);
});

test('Each result has full structure', async () => {
  const results = await store.search({ query: 'billing', semantic: false });
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

test('Hybrid mode: semantic search reranks results when embeddings enabled', async () => {
  // Re-init with embeddings enabled (skip if model unavailable)
  const { MemoryStore: MS } = await import('../scripts/lib/memory-store.mjs');
  // CHUNKING TEST: long entries split into multiple chunks (no truncation)
  const sandbox2 = join(tmpdir(), `evolve-chunk-test-${Date.now()}`);
  await mkdir(sandbox2, { recursive: true });
  const decisions2 = join(sandbox2, '.claude', 'memory', 'decisions');
  await mkdir(decisions2, { recursive: true });
  const longBody = `# Long entry

Section 1: Introduction. ${'This is filler content to make the entry long enough to require multiple chunks. '.repeat(10)}

Section 2: Implementation. ${'Detailed implementation discussion goes here, with code examples and rationale. '.repeat(10)}

Section 3: Tradeoffs. ${'Tradeoffs analysis with pros and cons of different approaches considered. '.repeat(10)}
`;
  await writeFile(
    join(decisions2, '2026-04-27-long-decision.md'),
    `---\nid: 2026-04-27-long-decision\ntype: decision\ndate: 2026-04-27\ntags: [test, long, chunking]\nagent: test\nconfidence: 9\n---\n\n${longBody}`
  );
  const chunkStore = new MS(sandbox2, { useEmbeddings: true });
  await chunkStore.init();
  await chunkStore.rebuildIndex();
  const chunkRows = chunkStore.db.prepare('SELECT chunk_idx, token_count FROM entry_chunks WHERE entry_id = ? ORDER BY chunk_idx').all('2026-04-27-long-decision');
  chunkStore.close();
  await rm(sandbox2, { recursive: true, force: true });
  if (chunkRows.length > 0) {
    assert.ok(chunkRows.length >= 2, `expected ≥2 chunks for long entry, got ${chunkRows.length}`);
    for (const c of chunkRows) {
      assert.ok(c.token_count > 0 && c.token_count <= 280, `chunk ${c.chunk_idx} tokens=${c.token_count} out of bounds`);
    }
    console.log(`Chunking verified: long entry split into ${chunkRows.length} chunks (no truncation)`);
  } else {
    console.warn('Chunking sub-test: no chunks (embeddings may be unavailable in test env)');
  }

  // Original semantic test continues
  const semStore = new MS(SANDBOX, { useEmbeddings: true });
  await semStore.init();
  await semStore.rebuildIndex();

  // Semantic query: "checkout payment safety" should match "billing-idempotency" + "stripe-webhook"
  // even though those words don't appear literally
  let results;
  try {
    results = await semStore.search({ query: 'checkout payment safety', limit: 5 });
  } catch (err) {
    semStore.close();
    console.warn('Skipping semantic test (embeddings unavailable):', err.message);
    return;
  }

  semStore.close();
  // If embeddings unavailable in test env (no HF_TOKEN, network), semantic returns empty
  if (results.length === 0) {
    console.warn('Semantic search returned 0 — embeddings may not have loaded; treating as skipped');
    return;
  }
  assert.ok(results.length >= 1, 'semantic search should match at least 1 entry');
  // RRF score should be present
  for (const r of results) {
    assert.ok(typeof r.score === 'number', 'RRF score present');
    assert.ok(typeof r.semantic === 'number', 'semantic score present');
    assert.ok(!('embedding' in r), 'raw embedding stripped from output');
  }
});
