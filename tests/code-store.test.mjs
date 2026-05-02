import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CodeStore, CODE_GRAPH_EXTRACTOR_VERSION } from '../scripts/lib/code-store.mjs';

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

test('CodeStore.indexFile: force refreshes unchanged file rows', async () => {
  const absPath = join(sandbox, 'src', 'auth.ts');
  await store.indexFile(absPath);
  store.db.prepare("UPDATE code_chunks SET chunk_text = 'stale chunk' WHERE path = ? AND chunk_idx = 0").run('src/auth.ts');

  const result = await store.indexFile(absPath, { force: true });
  const row = store.db.prepare('SELECT chunk_text AS chunkText FROM code_chunks WHERE path = ? AND chunk_idx = 0').get('src/auth.ts');

  assert.equal(result.indexed, true);
  assert.notEqual(row.chunkText, 'stale chunk');
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

test('CodeStore: reindexes graph when extractor version changes even if file hash is unchanged', async () => {
  const absPath = join(sandbox, 'src', 'IdeasPage.tsx');
  await writeFile(absPath, `
import type { FC } from 'react';

const OrgControls = () => null;

export const IdeasPage: FC = () => {
  useUserVPNConfigQuery();
  return <OrgControls />;
};
`);
  const relPath = store.toRel(absPath);
  await store.indexFile(absPath);
  store.db.prepare('UPDATE code_files SET graph_version = 0 WHERE path = ?').run(relPath);
  store.db.prepare('DELETE FROM code_symbols WHERE path = ?').run(relPath);

  const result = await store.indexFile(absPath);
  assert.strictEqual(result.skipped, 'unchanged-graph-reindexed');
  const row = store.db.prepare('SELECT graph_version FROM code_files WHERE path = ?').get(relPath);
  assert.strictEqual(row.graph_version, CODE_GRAPH_EXTRACTOR_VERSION);
  const symbols = store.db.prepare('SELECT name FROM code_symbols WHERE path = ? ORDER BY name').all(relPath).map(r => r.name);
  assert.ok(symbols.includes('IdeasPage'), `expected IdeasPage after graph reindex; got ${symbols.join(',')}`);
  assert.ok(symbols.includes('OrgControls'), `expected OrgControls after graph reindex; got ${symbols.join(',')}`);
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

test('CodeStore.resolveAllEdges: prefers imported symbol over same-name duplicates', async () => {
  await mkdir(join(sandbox, 'src', 'hooks'), { recursive: true });
  await mkdir(join(sandbox, 'src', 'legacy'), { recursive: true });
  await writeFile(join(sandbox, 'src', 'hooks', 'vpn.ts'), `
export const useUserVPNConfigQuery = () => ({ enabled: true });
`);
  await writeFile(join(sandbox, 'src', 'legacy', 'vpn.ts'), `
export const useUserVPNConfigQuery = () => ({ enabled: false });
`);
  await writeFile(join(sandbox, 'src', 'IdeasPage.tsx'), `
import { useUserVPNConfigQuery } from './hooks/vpn';

export const IdeasPage = () => {
  useUserVPNConfigQuery();
  return null;
};
`);

  await store.indexAll(sandbox);
  const caller = store.db.prepare("SELECT id FROM code_symbols WHERE path = ? AND name = ?").get('src/IdeasPage.tsx', 'IdeasPage');
  assert.ok(caller?.id, 'precondition: IdeasPage symbol exists');
  const edge = store.db.prepare("SELECT to_id AS toId FROM code_edges WHERE from_id = ? AND to_name = ?").get(caller.id, 'useUserVPNConfigQuery');
  assert.ok(edge?.toId, 'expected imported hook call to resolve');
  assert.match(edge.toId, /src\/hooks\/vpn\.ts:function:useUserVPNConfigQuery:/);
});

test('CodeStore.resolveAllEdges: leaves ambiguous same-name calls unresolved', async () => {
  await writeFile(join(sandbox, 'src', 'ambiguous-a.ts'), `export function sharedHelper() { return 'a'; }\n`);
  await writeFile(join(sandbox, 'src', 'ambiguous-b.ts'), `export function sharedHelper() { return 'b'; }\n`);
  await writeFile(join(sandbox, 'src', 'ambiguous-caller.ts'), `
export function runAmbiguous() {
  return sharedHelper();
}
`);

  await store.indexAll(sandbox);
  const caller = store.db.prepare("SELECT id FROM code_symbols WHERE path = ? AND name = ?").get('src/ambiguous-caller.ts', 'runAmbiguous');
  assert.ok(caller?.id, 'precondition: runAmbiguous symbol exists');
  const edge = store.db.prepare("SELECT to_id AS toId FROM code_edges WHERE from_id = ? AND to_name = ?").get(caller.id, 'sharedHelper');
  assert.ok(edge, 'precondition: sharedHelper call edge exists');
  assert.equal(edge.toId, null);
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

test('CodeStore.getGrammarHealth: explains zero-symbol language degradation', async () => {
  const root = join(tmpdir(), `supervibe-code-store-grammar-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const degraded = new CodeStore(root, { useEmbeddings: false });
  try {
    await mkdir(join(root, "tools"), { recursive: true });
    await writeFile(join(root, "tools", "evaluate.py"), "def evaluate():\n    return 1\n");
    await degraded.init();
    degraded.db.prepare(`
      INSERT INTO code_files (path, language, content_hash, line_count, indexed_at, graph_version)
      VALUES (?, ?, ?, ?, datetime('now'), ?)
    `).run("tools/evaluate.py", "python", "hash", 2, CODE_GRAPH_EXTRACTOR_VERSION);

    const health = degraded.getGrammarHealth();
    const python = health.find((item) => item.language === "python");
    assert.equal(python.healthy, false);
    assert.match(python.reason, /zero symbols extracted/);
  } finally {
    degraded.close();
    await rm(root, { recursive: true, force: true });
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
