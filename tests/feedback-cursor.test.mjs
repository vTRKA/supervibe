import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readCursor, writeCursor, drainNewEntries } from '../scripts/lib/feedback-cursor.mjs';

test('readCursor returns 0 when file missing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cur-'));
  const p = join(dir, 'cursor.json');
  const cur = await readCursor(p);
  assert.equal(cur, 0);
});

test('writeCursor + readCursor roundtrip', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cur-'));
  const p = join(dir, 'cursor.json');
  await writeCursor(p, 42);
  assert.equal(await readCursor(p), 42);
});

test('drainNewEntries returns rows from cursor to EOF, advances cursor', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cur-'));
  const queue = join(dir, 'q.jsonl');
  const cursor = join(dir, 'cur.json');
  await writeFile(queue, JSON.stringify({ id: 'a', comment: 'one' }) + '\n');
  let { entries, newOffset } = await drainNewEntries({ queuePath: queue, cursorPath: cursor });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, 'a');
  await writeCursor(cursor, newOffset);

  await appendFile(queue, JSON.stringify({ id: 'b', comment: 'two' }) + '\n');
  ({ entries, newOffset } = await drainNewEntries({ queuePath: queue, cursorPath: cursor }));
  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, 'b');
});

test('drainNewEntries with no new entries returns empty', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cur-'));
  const queue = join(dir, 'q.jsonl');
  const cursor = join(dir, 'cur.json');
  await writeFile(queue, JSON.stringify({ id: 'a' }) + '\n');
  const r1 = await drainNewEntries({ queuePath: queue, cursorPath: cursor });
  await writeCursor(cursor, r1.newOffset);
  const r2 = await drainNewEntries({ queuePath: queue, cursorPath: cursor });
  assert.equal(r2.entries.length, 0);
});
