import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdir, writeFile, rm, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CodeStore } from '../scripts/lib/code-store.mjs';
import { MemoryStore } from '../scripts/lib/memory-store.mjs';
import { scanCodeChanges, scanMemoryChanges } from '../scripts/lib/mtime-scan.mjs';

const sandbox = join(tmpdir(), `supervibe-mtime-${Date.now()}`);
const fileA = join(sandbox, 'src', 'a.ts');
const fileB = join(sandbox, 'src', 'b.ts');
const memEntry = join(sandbox, '.supervibe', 'memory', 'decisions', 'auth.md');

before(async () => {
  await mkdir(join(sandbox, 'src'), { recursive: true });
  await mkdir(join(sandbox, '.supervibe', 'memory', 'decisions'), { recursive: true });

  await writeFile(fileA, `export function hello() { return 'hi'; }\n`);
  await writeFile(fileB, `export function world() { return 42; }\n`);
  await writeFile(memEntry, `---\nid: auth\ntype: decision\ndate: 2026-04-28\ntags: [auth]\n---\n\n# Initial body\n`);
});

after(async () => { await rm(sandbox, { recursive: true, force: true }); });

test('scanCodeChanges: reindexes file when mtime > indexed_at', async () => {
  const store = new CodeStore(sandbox, { useEmbeddings: false });
  await store.init();
  await store.indexFile(fileA);
  await store.indexFile(fileB);

  // Bump fileA mtime to the future and change its content
  await writeFile(fileA, `export function hello() { return 'CHANGED'; }\n`);
  const future = new Date(Date.now() + 5000);
  await utimes(fileA, future, future);

  const counts = await scanCodeChanges(store, sandbox);
  assert.strictEqual(counts.reindexed, 1, `expected 1 reindexed; got ${JSON.stringify(counts)}`);
  assert.strictEqual(counts.removed, 0);

  // Verify chunk text reflects change
  const chunks = store.db.prepare('SELECT chunk_text FROM code_chunks WHERE path = ?').all(store.toRel(fileA));
  store.close();
  const text = chunks.map(c => c.chunk_text).join('\n');
  assert.match(text, /CHANGED/);
});

test('scanCodeChanges: removes deleted files from index', async () => {
  const store = new CodeStore(sandbox, { useEmbeddings: false });
  await store.init();

  // Confirm fileB is in DB
  const before = store.db.prepare('SELECT COUNT(*) AS n FROM code_files WHERE path = ?').get(store.toRel(fileB)).n;
  assert.strictEqual(before, 1);

  // Delete fileB on disk
  await rm(fileB);

  const counts = await scanCodeChanges(store, sandbox);
  assert.strictEqual(counts.removed, 1, `expected 1 removed; got ${JSON.stringify(counts)}`);

  const after = store.db.prepare('SELECT COUNT(*) AS n FROM code_files WHERE path = ?').get(store.toRel(fileB)).n;
  store.close();
  assert.strictEqual(after, 0);
});

test('scanMemoryChanges: reindexes memory entry when mtime > indexed_at', async () => {
  const mem = new MemoryStore(sandbox, { useEmbeddings: false });
  await mem.init();
  await mem.incrementalUpdate(memEntry);

  // Modify entry content + bump mtime
  await writeFile(memEntry, `---\nid: auth\ntype: decision\ndate: 2026-04-28\ntags: [auth]\n---\n\n# Updated body with new info\n`);
  const future = new Date(Date.now() + 5000);
  await utimes(memEntry, future, future);

  const counts = await scanMemoryChanges(mem, sandbox);
  assert.strictEqual(counts.reindexed, 1, `expected 1 reindexed; got ${JSON.stringify(counts)}`);

  const row = mem.db.prepare('SELECT content FROM entries WHERE id = ?').get('auth');
  mem.close();
  assert.match(row.content, /Updated body/);
});

test('scanMemoryChanges: removes deleted memory entries', async () => {
  const mem = new MemoryStore(sandbox, { useEmbeddings: false });
  await mem.init();

  await rm(memEntry);

  const counts = await scanMemoryChanges(mem, sandbox);
  assert.strictEqual(counts.removed, 1, `expected 1 removed; got ${JSON.stringify(counts)}`);

  const row = mem.db.prepare('SELECT id FROM entries WHERE id = ?').get('auth');
  mem.close();
  assert.strictEqual(row, undefined);
});

test('scanCodeChanges: skip when nothing changed (idempotent, fast)', async () => {
  // Fresh store with one file
  const fresh = join(tmpdir(), `supervibe-mtime-fresh-${Date.now()}`);
  await mkdir(join(fresh, 'src'), { recursive: true });
  const f = join(fresh, 'src', 'x.ts');
  await writeFile(f, `export const x = 1;\n`);

  const store = new CodeStore(fresh, { useEmbeddings: false });
  await store.init();
  await store.indexFile(f);

  // No changes — scan should be a no-op
  const counts = await scanCodeChanges(store, fresh);
  store.close();
  assert.strictEqual(counts.reindexed, 0);
  assert.strictEqual(counts.removed, 0);
  assert.strictEqual(counts.scanned, 1);

  await rm(fresh, { recursive: true, force: true });
});
