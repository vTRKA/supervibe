import { test } from 'node:test';
import assert from 'node:assert';
import { readFile } from 'node:fs/promises';

const MANIFEST_PATH = new URL('../.claude-plugin/plugin.json', import.meta.url);

const ALLOWED_FIELDS = new Set([
  'name', 'description', 'version', 'author', 'homepage', 'repository', 'license', 'keywords'
]);

const REQUIRED_FIELDS = ['name', 'description', 'version'];

test('plugin.json exists and is valid JSON', async () => {
  const content = await readFile(MANIFEST_PATH, 'utf8');
  const data = JSON.parse(content);
  assert.ok(data, 'plugin.json must parse as JSON object');
});

test('plugin.json has required fields', async () => {
  const data = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  for (const field of REQUIRED_FIELDS) {
    assert.ok(field in data, `plugin.json missing required field: ${field}`);
  }
});

test('plugin.json contains only allowed fields (no invented keys)', async () => {
  const data = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  for (const key of Object.keys(data)) {
    assert.ok(
      ALLOWED_FIELDS.has(key),
      `plugin.json contains unknown field "${key}". Allowed: ${[...ALLOWED_FIELDS].join(', ')}.`
    );
  }
});

test('plugin.json version follows semver', async () => {
  const data = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  assert.match(data.version, /^\d+\.\d+\.\d+(-[a-z0-9.-]+)?$/, 'version must be semver');
});

test('plugin.json name matches expected plugin name', async () => {
  const data = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  assert.strictEqual(data.name, 'evolve', 'plugin name must be "evolve"');
});
