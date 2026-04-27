import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CodeStore } from '../scripts/lib/code-store.mjs';

const sandbox = join(tmpdir(), `evolve-code-store-test-${Date.now()}`);
let store;

before(async () => {
  await mkdir(join(sandbox, 'src'), { recursive: true });

  await writeFile(join(sandbox, 'src', 'auth.ts'), `
export function login(email: string, password: string) {
  validateCredentials(email, password);
  const token = generateToken(email);
  return { token, expiresAt: Date.now() + 3600000 };
}

export function logout(token: string) {
  invalidateToken(token);
}
`);

  await writeFile(join(sandbox, 'src', 'billing.ts'), `
export async function processPayment(amount: number, cardId: string) {
  const idempotencyKey = await acquireRedisLock(cardId, 300);
  try {
    return await stripeCharge(amount, cardId, idempotencyKey);
  } finally {
    await releaseRedisLock(idempotencyKey);
  }
}
`);

  store = new CodeStore(sandbox, { useEmbeddings: false });
  await store.init();
});

after(async () => {
  store.close();
  await rm(sandbox, { recursive: true, force: true });
});

test('CodeStore.indexFile: stores file with chunks', async () => {
  await store.indexFile(join(sandbox, 'src', 'auth.ts'));
  const stats = store.stats();
  assert.strictEqual(stats.totalFiles, 1);
  assert.ok(stats.totalChunks >= 1);
});

test('CodeStore.indexFile: skips unchanged file (hash check)', async () => {
  const before = store.stats();
  await store.indexFile(join(sandbox, 'src', 'auth.ts'));
  const after = store.stats();
  assert.strictEqual(after.totalChunks, before.totalChunks);
});

test('CodeStore.indexAll: walks directory and indexes supported files', async () => {
  await store.indexAll(sandbox);
  const stats = store.stats();
  assert.strictEqual(stats.totalFiles, 2);
});

test('CodeStore.searchKeyword: finds files by FTS5 keyword', async () => {
  const results = await store.search({ query: 'login email password', semantic: false });
  assert.ok(results.length >= 1);
  assert.ok(results[0].file.includes('auth.ts'));
});

test('CodeStore.removeFile: deletes entry + chunks', async () => {
  await store.removeFile(join(sandbox, 'src', 'auth.ts'));
  const stats = store.stats();
  assert.strictEqual(stats.totalFiles, 1);
});

test('CodeStore.search returns file:line metadata for navigation', async () => {
  await store.indexFile(join(sandbox, 'src', 'auth.ts'));
  const results = await store.search({ query: 'login', semantic: false });
  for (const r of results) {
    assert.ok(typeof r.file === 'string');
    assert.ok(typeof r.startLine === 'number');
    assert.ok(typeof r.endLine === 'number');
  }
});
