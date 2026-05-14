import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { splitAndChain } from '../scripts/run-release-check.mjs';

test('release check runner splits npm check gates without executing them in dry run', () => {
  const out = execFileSync(process.execPath, ['scripts/run-release-check.mjs', '--dry-run', '--from-start'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  assert.match(out, /SUPERVIBE_RELEASE_CHECK/);
  assert.match(out, /MODE: dry-run/);
  assert.match(out, /GATE 1\/\d+: npm run validate:plugin-json/);
  assert.match(out, /npm test/);
  assert.match(out, /PASS: true/);
});

test('package check uses resumable runner while preserving the full one-shot chain', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.equal(pkg.scripts.check, 'node scripts/run-release-check.mjs');
  assert.match(pkg.scripts['check:full'], /npm run validate:plugin-json/);
  assert.match(pkg.scripts['check:full'], /npm test/);
  assert.equal(pkg.scripts['check:release'], 'npm run check:release-strict');
  assert.match(pkg.scripts['check:release-strict'], /npm run check/);
});

test('release check command splitter preserves ordered gates', () => {
  assert.deepEqual(splitAndChain('npm run a && npm run b && npm test'), [
    'npm run a',
    'npm run b',
    'npm test',
  ]);
});
