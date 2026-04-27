import { test } from 'node:test';
import assert from 'node:assert';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { hashFile, hashContent } from '../scripts/lib/file-hash.mjs';

const sandbox = join(tmpdir(), `evolve-hash-test-${Date.now()}`);

test('hashContent: deterministic for same input', () => {
  const a = hashContent('hello world');
  const b = hashContent('hello world');
  assert.strictEqual(a, b);
  assert.strictEqual(a.length, 64);
});

test('hashContent: different for different input', () => {
  const a = hashContent('hello');
  const b = hashContent('world');
  assert.notStrictEqual(a, b);
});

test('hashFile: reads + hashes file content', async () => {
  await mkdir(sandbox, { recursive: true });
  const f = join(sandbox, 'test.txt');
  await writeFile(f, 'sample content');
  const hash = await hashFile(f);
  assert.strictEqual(hash, hashContent('sample content'));
  await rm(sandbox, { recursive: true, force: true });
});
