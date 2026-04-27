import { test } from 'node:test';
import assert from 'node:assert';
import { checkTriggerClarity } from '../scripts/lib/trigger-clarity.mjs';

test('description with WHEN + TO passes', () => {
  const result = checkTriggerClarity(
    'Use WHEN encountering any bug or test failure TO enforce hypothesis-evidence-isolation method GATES no fix without verified root cause'
  );
  assert.strictEqual(result.pass, true);
  assert.strictEqual(result.score, 2);
});

test('description with BEFORE + TO passes', () => {
  const result = checkTriggerClarity(
    'Use BEFORE any claim of works/fixed/complete TO run verification command and show output as evidence'
  );
  assert.strictEqual(result.pass, true);
});

test('description without trigger word fails', () => {
  const result = checkTriggerClarity('Helps with requirements gathering and analysis');
  assert.strictEqual(result.pass, false);
  assert.strictEqual(result.score, 0);
});

test('description with trigger word but no purpose fails', () => {
  const result = checkTriggerClarity('Use when needed');
  assert.strictEqual(result.pass, false);
});

test('empty description fails', () => {
  const result = checkTriggerClarity('');
  assert.strictEqual(result.pass, false);
});
