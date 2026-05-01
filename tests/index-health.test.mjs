import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { buildIndexHealthSnapshot, evaluateIndexHealthGate, formatIndexHealth } from '../scripts/lib/supervibe-index-health.mjs';
import { CodeStore } from '../scripts/lib/code-store.mjs';
import { scanCodeChanges } from '../scripts/lib/mtime-scan.mjs';

async function loadFixture() {
  const raw = await readFile('tests/fixtures/sanitized-index-health/manifest.json', 'utf8');
  return JSON.parse(raw);
}

test('index health detects low source coverage and generated output leakage', async () => {
  const manifest = await loadFixture();
  const health = buildIndexHealthSnapshot({ manifest, coverageThreshold: 0.9 });

  assert.equal(health.eligibleSourceFiles, 829);
  assert.equal(health.indexedSourceFiles, 16);
  assert.equal(health.generatedIndexedFiles.length, 2);
  assert.equal(health.staleRows.length, 1);
  assert.equal(health.crossResolvedEdges.resolved, 7);
  assert.ok(health.languageCoverage.typescript.coverage < 0.1);
  assert.ok(health.symbolQuality.minifiedTopSymbols.length >= 6);
  assert.equal(health.ok, false);
  assert.ok(
    health.issues.some((issue) => issue.message === 'indexed source coverage below threshold'),
    'expected low coverage issue'
  );
  assert.ok(
    health.issues.some((issue) => issue.message === 'generated output indexed as source'),
    'expected generated leakage issue'
  );
});

test('index health formats release-gate evidence with exact issue text', async () => {
  const manifest = await loadFixture();
  const output = formatIndexHealth(buildIndexHealthSnapshot({ manifest, coverageThreshold: 0.9 }));

  assert.match(output, /SUPERVIBE_INDEX_HEALTH/);
  assert.match(output, /eligibleSourceFiles: 829/);
  assert.match(output, /indexedSourceFiles: 16/);
  assert.match(output, /indexed source coverage below threshold/);
  assert.match(output, /generated output indexed as source/);
  assert.match(output, /symbolQuality:/);
  assert.match(output, /crossResolvedEdges:/);
});

test('index health gate does not mark unhealthy index as ready', async () => {
  const manifest = await loadFixture();
  const gate = evaluateIndexHealthGate(buildIndexHealthSnapshot({ manifest, coverageThreshold: 0.9 }));

  assert.equal(gate.ready, false, 'status marked unhealthy index as ready');
  assert.ok(gate.failedGates.some((item) => item.code === 'source-coverage'));
  assert.ok(gate.failedGates.some((item) => item.code === 'generated-leakage'));
  assert.match(gate.repairCommand, /build-code-index\.mjs --root \. --resume --source-only --max-files 200 --max-seconds 120 --health --json-progress/);
  assert.doesNotMatch(gate.repairCommand, /--force/);
  assert.match(gate.graphRepairCommand, /build-code-index\.mjs --root \. --resume --graph --max-files 200 --max-seconds 120 --health --json-progress/);
});

test('graph-only symbol degradation warns by default but fails strict graph gate', () => {
  const health = buildIndexHealthSnapshot({
    manifest: {
      eligibleSourceFiles: 20,
      indexedSourceFiles: 20,
      languageCoverage: {
        python: { eligible: 20, indexed: 20, filesWithSymbols: 0 },
      },
      generatedIndexedFiles: [],
      staleRows: [],
      crossResolvedEdges: { resolved: 0, total: 0 },
    },
  });

  const defaultGate = evaluateIndexHealthGate(health);
  assert.equal(defaultGate.ready, true, 'source RAG should be ready when only graph symbols are degraded');
  assert.ok(defaultGate.warnings.some((item) => item.code === 'symbol-coverage'));

  const strictGate = evaluateIndexHealthGate(health, { strictGraph: true });
  assert.equal(strictGate.ready, false, 'strict graph mode should still fail on symbol degradation');
  assert.ok(strictGate.failedGates.some((item) => item.code === 'symbol-coverage'));
});

test('mtime repair discovers new source files when code.db already exists', async () => {
  const root = join(tmpdir(), `supervibe-index-health-${Date.now()}`);
  await mkdir(join(root, 'src'), { recursive: true });
  const existing = join(root, 'src', 'existing.ts');
  const createdLater = join(root, 'src', 'created-later.ts');
  await writeFile(existing, 'export const existing = 1;\n');

  const store = new CodeStore(root, { useEmbeddings: false });
  await store.init();
  try {
    await store.indexFile(existing);
    await writeFile(createdLater, 'export const createdLater = 2;\n');

    const counts = await scanCodeChanges(store, root);
    assert.equal(counts.discovered, 1, 'new source file was not discovered when database already existed');
    const row = store.db.prepare('SELECT path FROM code_files WHERE path = ?').get('src/created-later.ts');
    assert.ok(row, 'new source file was not indexed');
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});
