import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { evaluateIntentGoldenCorpus, formatIntentGoldenEvaluation, routeTriggerRequest } from '../scripts/lib/supervibe-trigger-router.mjs';

async function loadGoldenCorpus() {
  return JSON.parse(await readFile('tests/fixtures/intent-router/golden-corpus.json', 'utf8'));
}

test('intent router passes golden corpus with evidence and alternatives', async () => {
  const corpus = await loadGoldenCorpus();
  const evaluation = evaluateIntentGoldenCorpus(corpus);

  assert.equal(evaluation.pass, true, formatIntentGoldenEvaluation(evaluation));
  assert.equal(evaluation.total, corpus.length);
  for (const item of evaluation.results) {
    assert.ok(item.route.routingEvidence?.length > 0, `${item.id} missing routing evidence`);
    assert.ok(Array.isArray(item.route.rejectedAlternatives), `${item.id} missing rejected alternatives`);
  }
});

test('Russian genesis setup request routes to supervibe-genesis', () => {
  const route = routeTriggerRequest('генезис должен развернуть supervibe для codex cursor gemini и не перетирать CLAUDE.md');

  assert.equal(route.intent, 'genesis_setup', 'expected supervibe-genesis but routed to generic planning');
  assert.equal(route.command, '/supervibe-genesis');
  assert.ok(route.confidence >= 0.86);
  assert.ok(route.routingEvidence.some((entry) => /genesis|Keyword|Semantic/i.test(entry.reason)));
});

test('router user-facing text has no mojibake', async () => {
  const routerSource = await readFile('scripts/lib/supervibe-trigger-router.mjs', 'utf8');
  const semanticSource = await readFile('scripts/lib/supervibe-semantic-intent-router.mjs', 'utf8');
  const corpus = await readFile('tests/fixtures/intent-router/golden-corpus.json', 'utf8');
  const mojibakeMarkers = [
    "\u0420\u040e",
    "\u0420\u040f",
    "\u0420\u00a0",
    "\u0420\u0456\u0420",
    "\u0420\u00b5\u0420",
    "\u0420\u0491",
    "\u0421\u0403\u0420",
    "\u0421\u040a",
    "\u0432\u0402",
    "\u0432\u2020",
    "\u0432\u2030",
  ];

  for (const marker of mojibakeMarkers) {
    assert.equal(routerSource.includes(marker), false, `router contains mojibake marker ${JSON.stringify(marker)}`);
    assert.equal(semanticSource.includes(marker), false, `semantic router contains mojibake marker ${JSON.stringify(marker)}`);
    assert.equal(corpus.includes(marker), false, `corpus contains mojibake marker ${JSON.stringify(marker)}`);
  }
});
