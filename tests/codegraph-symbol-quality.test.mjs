import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { extractGraph } from '../scripts/lib/code-graph.mjs';
import { CodeStore } from '../scripts/lib/code-store.mjs';

test('code graph suppresses generated minified bundle symbols', async () => {
  const graph = await extractGraph(`
function Ie(){return Os()}
const B=()=>at()
function IdeasPage(){return useUserVPNConfigQuery()}
`, 'dist-check/assets/index-Ie.js');

  assert.deepEqual(graph.symbols.map((symbol) => symbol.name), [], 'top symbols contain generated minified names');
  assert.deepEqual(graph.edges, []);
});

test('CodeStore reports graph health metrics for source symbol quality', async () => {
  const root = join(tmpdir(), `supervibe-codegraph-quality-${Date.now()}`);
  await mkdir(join(root, 'src'), { recursive: true });
  await mkdir(join(root, 'dist-check', 'assets'), { recursive: true });
  await writeFile(join(root, 'src', 'ideas.tsx'), `
export const IdeasPage = () => {
  useUserVPNConfigQuery()
  return null
}
`);
  await writeFile(join(root, 'dist-check', 'assets', 'index-Ie.js'), 'function Ie(){return Os()} const B=()=>at()\n');

  const store = new CodeStore(root, { useEmbeddings: false });
  await store.init();
  try {
    await store.indexAll(root);
    const metrics = store.getGraphHealthMetrics();
    assert.equal(metrics.symbolNameQuality.minifiedTopSymbols.length, 0, 'top symbols contain generated minified names');
    assert.equal(metrics.sourceFileSymbolCoverage.generatedIndexedFiles, 0);
    assert.ok(metrics.sourceFileSymbolCoverage.coverage > 0);
    assert.ok(metrics.crossResolvedEdges.rate >= 0 && metrics.crossResolvedEdges.rate <= 1);
    assert.ok(metrics.unresolvedImportRate.rate >= 0 && metrics.unresolvedImportRate.rate <= 1);
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});
