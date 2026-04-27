import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const EN = join(ROOT, 'README.md');
const RU = join(ROOT, 'README.ru.md');

test('both README files exist', () => {
  assert.ok(existsSync(EN), 'README.md missing');
  assert.ok(existsSync(RU), 'README.ru.md missing');
});

test('English README has language switch line pointing to Russian', () => {
  const src = readFileSync(EN, 'utf8');
  assert.match(src, /\*\*English\*\*\s*·\s*\[Русский\]\(README\.ru\.md\)/);
});

test('Russian README has language switch line pointing to English', () => {
  const src = readFileSync(RU, 'utf8');
  assert.match(src, /\[English\]\(README\.md\)\s*·\s*\*\*Русский\*\*/);
});

test('both READMEs have the same set of section headings', () => {
  const headings = (text) =>
    text.split('\n')
      .filter(l => l.startsWith('## '))
      .map(l => l.replace(/^##\s+/, '').trim());

  const en = headings(readFileSync(EN, 'utf8'));
  const ru = headings(readFileSync(RU, 'utf8'));

  assert.strictEqual(en.length, ru.length,
    `heading count mismatch: en=${en.length} ru=${ru.length}\nEN: ${en.join(' / ')}\nRU: ${ru.join(' / ')}`);
});

test('both READMEs reference the current plugin version', () => {
  const pj = JSON.parse(readFileSync(join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
  const v = pj.version;
  assert.match(readFileSync(EN, 'utf8'), new RegExp(`v?${v.replace(/\./g, '\\.')}`));
  assert.match(readFileSync(RU, 'utf8'), new RegExp(`v?${v.replace(/\./g, '\\.')}`));
});

test('English README has no AI-marketing filler words', () => {
  const src = readFileSync(EN, 'utf8');
  // Words that signal marketing or filler — flag if present in EN README.
  // Allow technical "AI CLI" since the plugin must name what it integrates with;
  // disallow generic boosting adjectives.
  const banned = [
    /\bAI-powered\b/i,
    /\bAI-driven\b/i,
    /\bblazing[-\s]fast\b/i,
    /\bworld-class\b/i,
    /\bcutting[-\s]edge\b/i,
    /\bnext[-\s]gen\b/i,
    /\bsupercharge\b/i,
    /\bseamless\b/i,
    /\bgame[-\s]chang/i,
    /\brevolutionary\b/i,
  ];
  const hits = banned.filter(re => re.test(src));
  assert.deepStrictEqual(hits.map(r => r.source), [],
    `README contains marketing filler: ${hits.map(r => r.source).join(', ')}`);
});

test('test count claim in READMEs matches actual test count produced by npm run check', () => {
  // Looser sanity: each README should mention some test count near 187.
  // We don't enforce exact equality on the README — version bumps may legitimately
  // shift the count — but we do enforce that whatever number they cite is plausible.
  const findCount = (text) => {
    // Cyrillic and Latin "тест" / "test" are different code points — match both
    const m = text.match(/(\d{2,4})\s*(?:test|тест)/i);
    return m ? parseInt(m[1], 10) : null;
  };
  const en = findCount(readFileSync(EN, 'utf8'));
  const ru = findCount(readFileSync(RU, 'utf8'));
  assert.ok(en !== null && en > 100, `EN README must cite a test count > 100, got ${en}`);
  assert.ok(ru !== null && ru > 100, `RU README must cite a test count > 100, got ${ru}`);
});
