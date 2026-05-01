import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { CodeStore } from '../scripts/lib/code-store.mjs';
import { vectorToBuffer } from '../scripts/lib/embeddings.mjs';

test('CodeStore.search returns semantic fallback results when FTS has no lexical candidates', async () => {
  const root = join(tmpdir(), `supervibe-semantic-fallback-${Date.now()}`);
  await mkdir(join(root, 'src'), { recursive: true });
  const adapter = join(root, 'src', 'host-adapter.ts');
  const unrelated = join(root, 'src', 'billing.ts');
  await writeFile(adapter, 'export function chooseHostAdapter() { return "codex"; }\n');
  await writeFile(unrelated, 'export function chargeCard() { return "paid"; }\n');

  const store = new CodeStore(root, { useEmbeddings: false });
  await store.init();
  try {
    await store.indexAll(root);
    store.db.prepare('UPDATE code_chunks SET embedding = ? WHERE path = ?')
      .run(vectorToBuffer(new Float32Array([1, 0, 0])), 'src/host-adapter.ts');
    store.db.prepare('UPDATE code_chunks SET embedding = ? WHERE path = ?')
      .run(vectorToBuffer(new Float32Array([0, 1, 0])), 'src/billing.ts');
    store.useEmbeddings = true;

    const results = await store.search({
      query: 'адаптер среды выполнения для агента',
      semantic: true,
      queryVector: new Float32Array([1, 0, 0]),
      limit: 5,
    });

    assert.ok(results.length > 0, 'semantic fallback returned zero results');
    assert.equal(results[0].file, 'src/host-adapter.ts');
    assert.equal(results[0].retrievalMode, 'semantic');
    assert.equal(results[0].generatedSource, false);
    assert.ok(results[0].semantic > results[0].bm25);
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});
