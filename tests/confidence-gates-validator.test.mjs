import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { validateConfidenceGates } from '../scripts/validate-confidence-gates.mjs';

test('validateConfidenceGates passes current repo contract', async () => {
  const result = await validateConfidenceGates({ rootDir: process.cwd() });
  assert.equal(result.pass, true, result.issues.join('\n'));
});

test('validate-confidence-gates CLI passes current repo', () => {
  const out = execFileSync(process.execPath, ['scripts/validate-confidence-gates.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  assert.match(out, /Confidence gate validation passed/);
});
