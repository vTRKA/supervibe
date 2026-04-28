import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CodeStore } from '../scripts/lib/code-store.mjs';

const sandbox = join(tmpdir(), `supervibe-code-store-test-${Date.now()}`);
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

test('CodeStore: indexFile populates code_symbols + code_edges', async () => {
  // auth.ts has login, logout (functions) + validateCredentials, generateToken etc. (calls)
  await store.indexFile(join(sandbox, 'src', 'auth.ts'));
  const symCount = store.db.prepare(`SELECT COUNT(*) AS n FROM code_symbols WHERE path LIKE '%auth.ts%'`).get().n;
  assert.ok(symCount >= 2, `expected ≥2 symbols (login, logout), got ${symCount}`);
  const edgeCount = store.db.prepare(`
    SELECT COUNT(*) AS n FROM code_edges e
    JOIN code_symbols s ON s.id = e.from_id
    WHERE s.path LIKE '%auth.ts%'
  `).get().n;
  assert.ok(edgeCount >= 1, `expected ≥1 edge from auth.ts symbols, got ${edgeCount}`);
});

test('CodeStore.resolveAllEdges: links cross-file calls to known symbols', async () => {
  await store.indexAll(sandbox);
  const before = store.db.prepare('SELECT COUNT(*) AS n FROM code_edges WHERE to_id IS NOT NULL').get().n;
  const resolved = store.resolveAllEdges();
  const after = store.db.prepare('SELECT COUNT(*) AS n FROM code_edges WHERE to_id IS NOT NULL').get().n;
  assert.ok(typeof resolved === 'number');
  // After indexAll, resolveAllEdges runs internally — calling again is idempotent
  assert.ok(after >= before);
});

test('CodeStore.stats: returns symbol + edge counts', () => {
  const s = store.stats();
  assert.ok(typeof s.totalSymbols === 'number');
  assert.ok(typeof s.totalEdges === 'number');
  assert.ok(typeof s.edgeResolutionRate === 'number');
  assert.ok(s.edgeResolutionRate >= 0 && s.edgeResolutionRate <= 1);
});

test('CodeStore.getGrammarHealth: reports per-language coverage', () => {
  const health = store.getGrammarHealth();
  assert.ok(Array.isArray(health));
  for (const h of health) {
    assert.ok(typeof h.language === 'string');
    assert.ok(typeof h.coverage === 'number');
    assert.ok(typeof h.healthy === 'boolean');
  }
});

test('CodeStore.removeFile: cascades symbols + edges', async () => {
  // Re-index to ensure symbols exist, then remove
  await store.indexFile(join(sandbox, 'src', 'billing.ts'));
  const beforeSyms = store.db.prepare(`SELECT COUNT(*) AS n FROM code_symbols WHERE path LIKE '%billing.ts%'`).get().n;
  assert.ok(beforeSyms > 0, 'precondition: billing.ts has symbols');
  await store.removeFile(join(sandbox, 'src', 'billing.ts'));
  const afterSyms = store.db.prepare(`SELECT COUNT(*) AS n FROM code_symbols WHERE path LIKE '%billing.ts%'`).get().n;
  assert.strictEqual(afterSyms, 0, 'symbols should cascade-delete with file');
});

test('CodeStore.indexFiles (lazy mode): indexes a specific list', async () => {
  // Re-add billing first (was removed above)
  const r = await store.indexFiles([join(sandbox, 'src', 'billing.ts')]);
  assert.ok(typeof r.indexed === 'number');
  assert.ok(typeof r.edgesResolved === 'number');
});

test('CodeStore: WAL mode allows concurrent reader instances', async () => {
  // Open a second store against the SAME on-disk DB while the first is still open.
  // Without WAL this would either deadlock or error; WAL allows concurrent reads.
  const second = new CodeStore(sandbox, { useEmbeddings: false });
  await second.init();
  try {
    const stats1 = store.stats();
    const stats2 = second.stats();
    assert.strictEqual(stats1.totalFiles, stats2.totalFiles, 'both stores see same data');
    assert.ok(typeof stats2.totalSymbols === 'number');
  } finally {
    second.close();
  }
});

test('--since lazy mode: build-code-index --since=HEAD returns cleanly with empty set', async () => {
  // We can't easily fake git history in a sandbox, but we can verify the CLI
  // accepts --since flag without error when the range is empty (HEAD..HEAD).
  // This guards against parseArgs / git invocation regressions.
  const { execSync } = await import('node:child_process');
  let out;
  try {
    out = execSync('node scripts/build-code-index.mjs --since=HEAD --no-embeddings', {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60000
    });
  } catch (err) {
    // If git history doesn't have HEAD (e.g. CI shallow clone) — accept "Falling back to full index"
    out = err.stdout?.toString() || '';
    if (!out.includes('Falling back to full index')) throw err;
  }
  // Must mention either Lazy mode count OR a clean fallback message
  assert.ok(
    /Lazy mode: \d+ files/.test(out) || /Falling back to full index/.test(out),
    `expected lazy-mode acknowledgement or fallback; got: ${out.slice(0,200)}`
  );
});
