import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdir, writeFile, rm, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MemoryStore } from '../scripts/lib/memory-store.mjs';

const sandbox = join(tmpdir(), `evolve-memory-incr-${Date.now()}`);
let store;

before(async () => {
  await mkdir(join(sandbox, '.supervibe', 'memory', 'decisions'), { recursive: true });
  store = new MemoryStore(sandbox, { useEmbeddings: false });
  await store.init();
});

after(async () => {
  store.close();
  await rm(sandbox, { recursive: true, force: true });
});

test('incrementalUpdate: indexes new file', async () => {
  const f = join(sandbox, '.supervibe', 'memory', 'decisions', '2026-01-01-foo.md');
  await writeFile(f, `---\nid: foo\ntype: decision\ndate: 2026-01-01\ntags: [test]\nagent: test\nconfidence: 9\n---\n\nBody about foo.`);
  const result = await store.incrementalUpdate(f);
  assert.strictEqual(result.indexed, true);
  const entry = store.db.prepare('SELECT * FROM entries WHERE id = ?').get('foo');
  assert.ok(entry, 'entry should exist');
  assert.ok(entry.content_hash, 'hash should be stored');
});

test('incrementalUpdate: skips unchanged file', async () => {
  const f = join(sandbox, '.supervibe', 'memory', 'decisions', '2026-01-01-foo.md');
  const before = store.db.prepare('SELECT indexed_at FROM entries WHERE id = ?').get('foo');
  await new Promise(r => setTimeout(r, 1100));
  const result = await store.incrementalUpdate(f);
  assert.strictEqual(result.skipped, 'unchanged');
  const after = store.db.prepare('SELECT indexed_at FROM entries WHERE id = ?').get('foo');
  assert.strictEqual(before.indexed_at, after.indexed_at);
});

test('incrementalUpdate: re-indexes changed file', async () => {
  const f = join(sandbox, '.supervibe', 'memory', 'decisions', '2026-01-01-foo.md');
  await writeFile(f, `---\nid: foo\ntype: decision\ndate: 2026-01-01\ntags: [test, updated]\nagent: test\nconfidence: 10\n---\n\nUpdated body.`);
  const result = await store.incrementalUpdate(f);
  assert.strictEqual(result.indexed, true);
  const entry = store.db.prepare('SELECT * FROM entries WHERE id = ?').get('foo');
  assert.strictEqual(entry.confidence, 10);
});

test('removeEntryByPath: deletes entry on file delete', async () => {
  const f = join(sandbox, '.supervibe', 'memory', 'decisions', '2026-01-01-foo.md');
  await unlink(f);
  await store.removeEntryByPath(f);
  const entry = store.db.prepare('SELECT * FROM entries WHERE id = ?').get('foo');
  assert.strictEqual(entry, undefined, 'entry should be removed');
});
