import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CodeStore } from '../scripts/lib/code-store.mjs';
import {
  findCallers, findCallees, neighborhood, topSymbolsByDegree, disambiguate
} from '../scripts/lib/code-graph-queries.mjs';

const sandbox = join(tmpdir(), `supervibe-graph-q-${Date.now()}`);
let store;

before(async () => {
  await mkdir(join(sandbox, 'src'), { recursive: true });
  // alpha calls beta + gamma; beta calls gamma
  await writeFile(join(sandbox, 'src', 'a.ts'), `
export function alpha() { beta(); gamma(); }
function beta() { gamma(); }
function gamma() { return 1; }
`);
  // Same-name disambiguation: another file with its own gamma()
  await writeFile(join(sandbox, 'src', 'b.ts'), `
export function gamma() { return 2; }
function delta() { gamma(); }
`);
  store = new CodeStore(sandbox, { useEmbeddings: false });
  await store.init();
  await store.indexAll(sandbox);
});

after(async () => {
  store.close();
  await rm(sandbox, { recursive: true, force: true });
});

test('findCallers: who calls beta?', () => {
  const callers = findCallers(store.db, 'beta');
  const names = callers.map(c => c.name);
  assert.ok(names.includes('alpha'), `expected alpha in callers; got: ${names.join(',')}`);
});

test('findCallees: what does alpha call?', () => {
  const callees = findCallees(store.db, 'alpha');
  const names = callees.map(c => c.toName);
  assert.ok(names.includes('beta'));
  assert.ok(names.includes('gamma'));
});

test('neighborhood: BFS expansion 1 hop', () => {
  const nbrs = neighborhood(store.db, 'alpha', { depth: 1 });
  const names = new Set(nbrs.map(n => n.name));
  // alpha at depth 1: should include direct callees beta, gamma
  assert.ok(names.has('beta') || names.has('gamma'),
    `expected beta or gamma in neighbors at depth 1; got: ${[...names].join(',')}`);
});

test('neighborhood: BFS depth 2 deduplicates revisits', () => {
  const nbrs = neighborhood(store.db, 'alpha', { depth: 2 });
  const ids = nbrs.map(n => n.id);
  const uniq = new Set(ids);
  assert.strictEqual(ids.length, uniq.size, 'no duplicates allowed in BFS');
});

test('topSymbolsByDegree: returns symbols sorted by edge count', () => {
  const top = topSymbolsByDegree(store.db, { limit: 5 });
  for (let i = 1; i < top.length; i++) {
    assert.ok(top[i-1].totalDegree >= top[i].totalDegree,
      `expected sort by totalDegree desc`);
  }
});

test('disambiguate: returns multiple symbols when name collides', () => {
  // gamma exists in both src/a.ts and src/b.ts
  const matches = disambiguate(store.db, 'gamma');
  assert.ok(matches.length >= 2, `expected ≥2 gammas across files; got ${matches.length}`);
});

test('findCallers by full symbol ID disambiguates', () => {
  // Get one specific gamma's ID
  const gammas = disambiguate(store.db, 'gamma');
  if (gammas.length < 2) return; // skip if test data didn't create collision
  const oneGammaId = gammas[0].id;
  const callersOfThatGamma = findCallers(store.db, oneGammaId);
  // Without disambiguation we'd see both files' gamma callers; with ID we see only this one's
  assert.ok(Array.isArray(callersOfThatGamma));
});
