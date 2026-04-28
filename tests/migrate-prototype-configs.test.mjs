import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migratePrototypeConfigs } from '../scripts/migrate-prototype-configs.mjs';

test('creates config.json for prototype dir without one', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mig-'));
  await mkdir(join(root, 'prototypes', 'foo'), { recursive: true });
  await writeFile(join(root, 'prototypes', 'foo', 'index.html'), '<html></html>');

  const result = await migratePrototypeConfigs({ projectRoot: root });
  assert.equal(result.created.length, 1);

  const cfg = JSON.parse(await readFile(join(root, 'prototypes', 'foo', 'config.json'), 'utf8'));
  assert.equal(cfg.target, 'web');
  assert.deepEqual(cfg.viewports.map(v => v.width), [375, 1440]);
  assert.equal(cfg.migrated, true);
});

test('skips dirs that already have config.json', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mig-'));
  await mkdir(join(root, 'prototypes', 'bar'), { recursive: true });
  await writeFile(join(root, 'prototypes', 'bar', 'config.json'), '{"target":"web","viewports":[]}');

  const result = await migratePrototypeConfigs({ projectRoot: root });
  assert.equal(result.created.length, 0);
  assert.equal(result.skipped.length, 1);
});

test('skips reserved dirs (_design-system, _brandbook)', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mig-'));
  await mkdir(join(root, 'prototypes', '_design-system'), { recursive: true });
  await mkdir(join(root, 'prototypes', '_brandbook'), { recursive: true });

  const result = await migratePrototypeConfigs({ projectRoot: root });
  assert.equal(result.created.length, 0);
});

test('idempotent — second run does nothing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mig-'));
  await mkdir(join(root, 'prototypes', 'baz'), { recursive: true });

  await migratePrototypeConfigs({ projectRoot: root });
  const stat1 = await stat(join(root, 'prototypes', 'baz', 'config.json'));

  await new Promise(r => setTimeout(r, 10));
  const result2 = await migratePrototypeConfigs({ projectRoot: root });
  assert.equal(result2.created.length, 0);

  const stat2 = await stat(join(root, 'prototypes', 'baz', 'config.json'));
  assert.equal(stat1.mtimeMs, stat2.mtimeMs);
});
