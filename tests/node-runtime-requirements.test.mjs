import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SQLITE_NODE_MIN_VERSION,
  getNodeRuntimeCapability,
  nodeMeetsMinimum,
} from '../scripts/lib/node-runtime-requirements.mjs';

const ROOT = process.cwd();

test('node runtime requirements enforce the full SQLite runtime before install', () => {
  assert.strictEqual(SQLITE_NODE_MIN_VERSION, '22.5.0');
  assert.equal(nodeMeetsMinimum('22.4.0', SQLITE_NODE_MIN_VERSION), false);
  assert.equal(nodeMeetsMinimum('22.5.0', SQLITE_NODE_MIN_VERSION), true);
  assert.equal(getNodeRuntimeCapability('20.19.0').installSupported, false);
  assert.equal(getNodeRuntimeCapability('20.19.0').sqliteSupported, false);
  assert.equal(getNodeRuntimeCapability('22.4.0').installSupported, false);
  assert.equal(getNodeRuntimeCapability('22.4.0').sqliteSupported, false);
  assert.equal(getNodeRuntimeCapability('22.5.0').installSupported, true);
  assert.equal(getNodeRuntimeCapability('22.5.0').sqliteSupported, true);
  assert.equal(getNodeRuntimeCapability('25.0.0').devCheckSupported, true);
});

test('package and lockfile require Node 22.5+ full runtime', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8'));
  assert.equal(pkg.engines.node, '>=22.5.0');
  assert.equal(lock.packages[''].engines.node, '>=22.5.0');
  assert.equal(pkg.scripts['supervibe:install-check'], undefined);
});

test('SQLite-backed stores use the runtime SQLite loader for clear failures', () => {
  for (const relPath of [
    'scripts/lib/memory-store.mjs',
    'scripts/lib/code-store.mjs',
    'scripts/lib/agent-task-store.mjs',
  ]) {
    const src = readFileSync(join(ROOT, relPath), 'utf8');
    assert.doesNotMatch(src, /import\s+\{\s*DatabaseSync\s*\}\s+from\s+['"]node:sqlite['"]/, `${relPath} must not hard-import node:sqlite`);
    assert.match(src, /loadNodeSqliteDatabaseSync/, `${relPath} must use the runtime SQLite loader`);
  }
});
