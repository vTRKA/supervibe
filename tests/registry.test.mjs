import { test } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const REGISTRY = `${ROOT}registry.yaml`;

test('build-registry produces a registry.yaml with required top-level keys', async () => {
  if (existsSync(REGISTRY)) await rm(REGISTRY);
  execSync('node scripts/build-registry.mjs', { cwd: ROOT, stdio: 'pipe' });
  const content = await readFile(REGISTRY, 'utf8');
  const data = parseYaml(content);

  assert.ok(data.version, 'missing version');
  assert.ok(data['generated-at'], 'missing generated-at');
  assert.ok('agents' in data, 'missing agents key');
  assert.ok('skills' in data, 'missing skills key');
  assert.ok('rules' in data, 'missing rules key');
  assert.ok('stack-packs' in data, 'missing stack-packs key');
  assert.ok('confidence-rubrics' in data, 'missing confidence-rubrics key');
});

test('build-registry includes all 11 rubrics by name (10 main + brandbook)', async () => {
  if (existsSync(REGISTRY)) await rm(REGISTRY);
  execSync('node scripts/build-registry.mjs', { cwd: ROOT, stdio: 'pipe' });
  const content = await readFile(REGISTRY, 'utf8');
  const data = parseYaml(content);

  const expected = [
    'requirements', 'plan', 'agent-delivery', 'scaffold', 'framework',
    'prototype', 'research-output', 'agent-quality', 'skill-quality', 'rule-quality',
    'brandbook'
  ];
  for (const name of expected) {
    assert.ok(name in data['confidence-rubrics'], `rubric ${name} missing from registry`);
  }
});

test('registry uses POSIX-style portable paths (no backslashes, no URL-encoding, no leading slash, no drive prefix)', async () => {
  const content = await readFile(REGISTRY, 'utf8');
  const data = parseYaml(content);

  const allFiles = [
    ...Object.values(data['confidence-rubrics']).map(r => r.file),
    ...Object.values(data.agents).map(a => a.file),
    ...Object.values(data.skills).map(s => s.file),
    ...Object.values(data.rules).map(r => r.file)
  ];

  for (const file of allFiles) {
    assert.ok(!file.includes('\\'), `path contains backslash: ${file}`);
    assert.ok(!file.includes('%20'), `path contains URL-encoding: ${file}`);
    assert.ok(!file.startsWith('/'), `path starts with slash: ${file}`);
    assert.ok(!/^[A-Z]:/.test(file), `path has Windows drive prefix: ${file}`);
  }
});
