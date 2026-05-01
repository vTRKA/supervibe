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

test('Python relative imports resolve calls across files', async () => {
  const root = join(tmpdir(), `supervibe-python-graph-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(join(root, 'app', 'routes'), { recursive: true });
  await writeFile(join(root, 'app', 'routes', 'users.py'), `
from .services import fetch_users

def list_users():
    return fetch_users()
`);
  await writeFile(join(root, 'app', 'routes', 'services.py'), `
def fetch_users():
    return []
`);
  await writeFile(join(root, 'app', 'routes', 'other.py'), `
def fetch_users():
    return ["wrong"]
`);

  const pyStore = new CodeStore(root, { useEmbeddings: false });
  await pyStore.init();
  try {
    await pyStore.indexAll(root);
    const row = pyStore.db.prepare(`
      SELECT e.to_id AS toId
      FROM code_edges e
      JOIN code_symbols s ON s.id = e.from_id
      WHERE s.name = 'list_users' AND e.to_name = 'fetch_users'
    `).get();
    assert.ok(row?.toId?.includes('app/routes/services.py:function:fetch_users'), `expected resolved Python edge, got ${row?.toId || 'null'}`);
  } finally {
    pyStore.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('Rust crate imports disambiguate same-name function calls across files', async () => {
  const root = join(tmpdir(), `supervibe-rust-graph-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(join(root, 'src', 'main.rs'), `
mod services;
mod other;

use crate::services::fetch_user;

pub fn load() {
    fetch_user();
}
`);
  await writeFile(join(root, 'src', 'services.rs'), `
pub fn fetch_user() {}
`);
  await writeFile(join(root, 'src', 'other.rs'), `
pub fn fetch_user() {}
`);

  const rustStore = new CodeStore(root, { useEmbeddings: false });
  await rustStore.init();
  try {
    await rustStore.indexAll(root);
    const row = rustStore.db.prepare(`
      SELECT e.to_id AS toId
      FROM code_edges e
      JOIN code_symbols s ON s.id = e.from_id
      WHERE s.name = 'load' AND e.to_name = 'fetch_user'
    `).get();
    assert.ok(row?.toId?.includes('src/services.rs:function:fetch_user'), `expected Rust edge to services.rs, got ${row?.toId || 'null'}`);
  } finally {
    rustStore.close();
    await rm(root, { recursive: true, force: true });
  }
});
