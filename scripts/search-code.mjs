#!/usr/bin/env node
// Code search CLI — semantic (FTS5 + e5 cosine) + graph (callers/callees/neighbors/top-symbols).
// Used by supervibe:code-search skill.
//
// Modes:
//   --query "<text>"           semantic search (existing)
//   --callers "<symbol>"       who calls this symbol (graph)
//   --callees "<symbol>"       what does this symbol call (graph)
//   --neighbors "<symbol>"     BFS neighborhood (graph), use --depth N
//   --top-symbols N            most-connected symbols (centrality)
//
// Symbol arg accepts bare name OR full ID "path:kind:name:line" for disambiguation.

import { CodeStore } from './lib/code-store.mjs';
import {
  findCallers, findCallees, neighborhood, topSymbolsByDegree, disambiguate
} from './lib/code-graph-queries.mjs';
import { parseArgs } from 'node:util';

const PROJECT_ROOT = process.cwd();
const { values } = parseArgs({
  options: {
    query: { type: 'string', short: 'q', default: '' },
    callers: { type: 'string', default: '' },
    callees: { type: 'string', default: '' },
    neighbors: { type: 'string', default: '' },
    'top-symbols': { type: 'string', default: '' },
    depth: { type: 'string', default: '1' },
    lang: { type: 'string', default: '' },
    kind: { type: 'string', default: '' },
    limit: { type: 'string', short: 'n', default: '10' },
    'no-semantic': { type: 'boolean', default: false }
  },
  strict: false
});

if (!values.query && !values.callers && !values.callees && !values.neighbors && !values['top-symbols']) {
  console.error('Usage:');
  console.error('  search-code.mjs --query "<text>" [--lang ...] [--kind ...] [--limit N]');
  console.error('  search-code.mjs --callers "<symbol-name-or-id>"');
  console.error('  search-code.mjs --callees "<symbol-name-or-id>"');
  console.error('  search-code.mjs --neighbors "<symbol-name-or-id>" --depth 2');
  console.error('  search-code.mjs --top-symbols 20 [--kind class]');
  process.exit(1);
}

const store = new CodeStore(PROJECT_ROOT, { useEmbeddings: !values['no-semantic'] });
await store.init();

const limit = parseInt(values.limit, 10);
let results;
let mode;

if (values.callers) {
  mode = 'callers';
  results = findCallers(store.db, values.callers).slice(0, limit);
  if (results.length === 0) {
    const candidates = disambiguate(store.db, values.callers);
    if (candidates.length > 1) {
      console.log(`Symbol "${values.callers}" matches ${candidates.length} definitions — narrow with full ID:`);
      for (const c of candidates.slice(0, 10)) {
        console.log(`  ${c.id}`);
      }
      store.close();
      process.exit(0);
    }
  }
} else if (values.callees) {
  mode = 'callees';
  results = findCallees(store.db, values.callees).slice(0, limit);
} else if (values.neighbors) {
  mode = 'neighbors';
  results = neighborhood(store.db, values.neighbors, {
    depth: parseInt(values.depth, 10)
  }).slice(0, limit);
} else if (values['top-symbols']) {
  mode = 'top-symbols';
  results = topSymbolsByDegree(store.db, {
    limit: parseInt(values['top-symbols'], 10),
    kind: values.kind || null
  });
} else {
  mode = 'semantic';
  results = await store.search({
    query: values.query,
    language: values.lang || null,
    kind: values.kind || null,
    limit,
    semantic: !values['no-semantic']
  });
}

store.close();

if (results.length === 0) {
  console.log(`No matches (mode: ${mode}).`);
  process.exit(0);
}

console.log(`Found ${results.length} ${mode} matches:\n`);
for (const [i, r] of results.entries()) {
  if (mode === 'semantic') {
    console.log(`${i + 1}. ${r.file}:${r.startLine}-${r.endLine}  [${r.kind}${r.name ? ': ' + r.name : ''}, ${r.language}]`);
    console.log(`   score=${r.score.toFixed(3)} bm25=${r.bm25.toFixed(2)} semantic=${r.semantic.toFixed(3)}`);
    console.log(`   ${r.snippet.split('\n').slice(0, 4).join('\n   ')}\n`);
  } else if (mode === 'callers') {
    console.log(`${i + 1}. ${r.path}:${r.startLine}-${r.endLine}  [${r.kind}: ${r.name}]  ←${r.edgeKind}→`);
  } else if (mode === 'callees') {
    console.log(`${i + 1}. ${r.toName}  →${r.kind}→  (target id: ${r.toId || '<unresolved-or-external>'})`);
  } else if (mode === 'neighbors') {
    console.log(`${i + 1}. [d=${r.distance}] ${r.path}:${r.startLine}  [${r.kind}: ${r.name}]`);
  } else if (mode === 'top-symbols') {
    console.log(`${i + 1}. ${r.path}  [${r.kind}: ${r.name}]  in=${r.inDegree} out=${r.outDegree} total=${r.totalDegree}`);
  }
}
