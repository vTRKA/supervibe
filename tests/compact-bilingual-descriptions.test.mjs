import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compactBilingual, extractTriggers } from '../scripts/compact-bilingual-descriptions.mjs';

test('removes RU translation but keeps EN sentence', () => {
  const input = "Use WHEN starting new product TO define brand. RU: используется КОГДА запускается новый продукт — определяет бренд. Trigger phrases: 'нужен бренд', 'rebrand'.";
  const out = compactBilingual(input);
  assert.equal(out.includes('используется'), false);
  assert.ok(out.includes('starting new product'));
});

test('preserves all trigger phrases (RU + EN)', () => {
  const input = "Use WHEN designing screens. RU: используется КОГДА проектируем экраны. Trigger phrases: 'спроектируй экран', 'design screen', 'нужны экраны'.";
  const out = compactBilingual(input);
  assert.ok(out.includes("'спроектируй экран'"));
  assert.ok(out.includes("'design screen'"));
  assert.ok(out.includes("'нужны экраны'"));
});

test('extractTriggers returns all quoted phrases', () => {
  const desc = "Use TO foo. Triggers: 'a', 'b', 'c'.";
  const triggers = extractTriggers(desc);
  assert.deepEqual(triggers, ['a', 'b', 'c']);
});

test('handles description with no RU block (no-op)', () => {
  const input = "Use WHEN X TO Y. Triggers: 'a' / 'b'.";
  const out = compactBilingual(input);
  assert.ok(out.includes("'a'"));
  assert.ok(out.includes("'b'"));
});

test('idempotent on already-compact', () => {
  const compacted = "Use WHEN X TO Y. Triggers: 'a' / 'b'.";
  const out1 = compactBilingual(compacted);
  const out2 = compactBilingual(out1);
  assert.equal(out2, out1);
});

test('Триггеры label gets normalised to Triggers', () => {
  const input = "Use WHEN debugging. Триггеры: 'отладь', 'debug'.";
  const out = compactBilingual(input);
  assert.ok(out.includes('Triggers:'));
  assert.ok(out.includes("'отладь'"));
});
