import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  readUpgradeCache,
  writeUpgradeCache,
  isCacheStale,
} from '../scripts/lib/upgrade-check.mjs';

const sandbox = join(tmpdir(), `evolve-ucheck-${Date.now()}`);

before(async () => {
  await mkdir(join(sandbox, '.claude-plugin'), { recursive: true });
});

after(async () => { await rm(sandbox, { recursive: true, force: true }); });

test('readUpgradeCache: returns null when file missing', async () => {
  const c = await readUpgradeCache(sandbox);
  assert.strictEqual(c, null);
});

test('writeUpgradeCache + readUpgradeCache: round-trip', async () => {
  const data = { checkedAt: 1700000000000, behind: 3, latestTag: 'v1.8.0' };
  await writeUpgradeCache(sandbox, data);
  const r = await readUpgradeCache(sandbox);
  assert.deepStrictEqual(r, data);
});

test('isCacheStale: null cache is stale', () => {
  assert.strictEqual(isCacheStale(null), true);
});

test('isCacheStale: cache missing checkedAt is stale', () => {
  assert.strictEqual(isCacheStale({ behind: 0 }), true);
});

test('isCacheStale: 1h-old cache is fresh', () => {
  const now = Date.now();
  const cache = { checkedAt: now - 3600 * 1000 };
  assert.strictEqual(isCacheStale(cache, now), false);
});

test('isCacheStale: 25h-old cache is stale', () => {
  const now = Date.now();
  const cache = { checkedAt: now - 25 * 3600 * 1000 };
  assert.strictEqual(isCacheStale(cache, now), true);
});
