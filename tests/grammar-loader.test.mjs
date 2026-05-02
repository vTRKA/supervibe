import { test } from 'node:test';
import assert from 'node:assert';
import { Query } from 'web-tree-sitter';
import { getParser, getLanguage, listSupportedLanguages, isLanguageSupported, getBrokenLanguages } from '../scripts/lib/grammar-loader.mjs';
import { compileQueryWithFallback, diagnoseGraphExtractor } from '../scripts/lib/code-graph.mjs';

test('grammar-loader: lists supported languages', () => {
  const langs = listSupportedLanguages();
  assert.ok(langs.length >= 8, `expected ≥8 languages, got ${langs.length}: ${langs.join(',')}`);
  for (const l of ['typescript', 'javascript', 'python', 'go', 'rust', 'java', 'php', 'ruby']) {
    assert.ok(
      langs.includes(l) || getBrokenLanguages().broken.includes(l),
      `${l} should be supported or explicitly broken`
    );
  }
});

test('grammar-loader: isLanguageSupported respects unknown', () => {
  assert.strictEqual(isLanguageSupported('cobol'), false);
  assert.strictEqual(isLanguageSupported('typescript'), true);
});

test('grammar-loader: API surface — Parser/Language/Tree/Query', async () => {
  const langs = listSupportedLanguages();
  if (langs.length === 0) {
    console.log('all grammars broken — skipping API test');
    return;
  }
  const lang = langs[0];
  const parser = await getParser(lang);

  assert.strictEqual(typeof parser.parse, 'function', 'parser.parse must exist');
  assert.strictEqual(typeof parser.setLanguage, 'function', 'parser.setLanguage must exist');

  const tree = parser.parse('// hello\n');
  assert.ok(tree, 'parser.parse returned tree');
  assert.ok(tree.rootNode, 'tree has rootNode');
  assert.strictEqual(typeof tree.rootNode.type, 'string', 'rootNode.type is string');

  // Verify Query class works against the loaded Language
  const language = await getLanguage(lang);
  const q = new Query(language, '(comment) @c');
  assert.ok(typeof q.matches === 'function', 'query.matches must exist');
  const matches = q.matches(tree.rootNode);
  assert.ok(Array.isArray(matches), 'matches returns array');

  if (typeof tree.delete === 'function') tree.delete();
});

test('grammar-loader: caches parsers per language', async () => {
  const langs = listSupportedLanguages();
  if (langs.length === 0) return;
  const lang = langs[0];
  const t0 = Date.now();
  await getParser(lang);
  const t1 = Date.now();
  await getParser(lang);
  const t2 = Date.now();
  // Second call must be at least as fast as first; treat equal as pass
  assert.ok(t2 - t1 <= (t1 - t0) + 5, `cached call should not be slower; first=${t1-t0}ms second=${t2-t1}ms`);
});

test('grammar-loader: getBrokenLanguages reports state', () => {
  const state = getBrokenLanguages();
  assert.ok(Array.isArray(state.broken));
  assert.ok(Array.isArray(state.pointers));
});

test('code graph query compiler falls back when primary Python query is incompatible', async () => {
  const result = await compileQueryWithFallback('python', '(definitely_not_a_python_node) @symbol.function', [
    '(function_definition name: (identifier) @name) @symbol.function',
  ]);

  assert.ok(result.query);
  assert.equal(result.degraded, true);
  assert.match(result.reason, /primary query failed/);
});

test('code graph extractor diagnostics report query compile failures', async () => {
  const result = await diagnoseGraphExtractor('python', {
    queryText: '(definitely_not_a_python_node) @symbol.function',
    fallbackTexts: [],
  });

  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, 'query-compile-failed');
  assert.match(result.reason, /query compile failed/);
});
