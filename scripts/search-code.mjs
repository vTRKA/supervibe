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
//   --symbol-search "<query>"  ranked symbol lookup (locations only)
//   --impact "<symbol>"        inbound impact radius for a symbol
//   --files "."                indexed file tree/list with symbol counts
//   --context "<task>"         graph-aware context pack for agents
//
// Symbol arg accepts bare name OR full ID "path:kind:name:line" for disambiguation.

import { CodeStore } from './lib/code-store.mjs';
import {
  findCallers, findCallees, neighborhood, topSymbolsByDegree, disambiguate,
  impactRadius, listIndexedFiles, searchSymbols
} from './lib/code-graph-queries.mjs';
import { buildCodeGraphContext } from './lib/supervibe-codegraph-context.mjs';
import { buildRepoMap, formatRepoMapContext, selectRepoMapContext } from './lib/supervibe-repo-map.mjs';
import { parseArgs } from 'node:util';

const PROJECT_ROOT = process.cwd();
const { values, positionals } = parseArgs({
  options: {
    query: { type: 'string', short: 'q', default: '' },
    callers: { type: 'string', default: '' },
    callees: { type: 'string', default: '' },
    neighbors: { type: 'string', default: '' },
    'top-symbols': { type: 'string', default: '' },
    'symbol-search': { type: 'string', default: '' },
    impact: { type: 'string', default: '' },
    files: { type: 'string', default: '' },
    context: { type: 'string', default: '' },
    'task-type': { type: 'string', default: '' },
    'repo-map': { type: 'boolean', default: false },
    depth: { type: 'string', default: '1' },
    format: { type: 'string', default: 'flat' },
    lang: { type: 'string', default: '' },
    kind: { type: 'string', default: '' },
    limit: { type: 'string', short: 'n', default: '10' },
    'no-semantic': { type: 'boolean', default: false },
    'debug-ranking': { type: 'boolean', default: false },
    json: { type: 'boolean', default: false }
  },
  strict: false,
  allowPositionals: true,
});

if (!values.query && positionals.length > 0) {
  values.query = positionals.join(' ');
}

if (!values.query && !values.callers && !values.callees && !values.neighbors && !values['top-symbols'] && !values['symbol-search'] && !values.impact && !values.files && !values.context && !values['repo-map']) {
  console.error('Usage:');
  console.error('  search-code.mjs --query "<text>" [--lang ...] [--kind ...] [--limit N]');
  console.error('  search-code.mjs "<text>" [--limit N] [--debug-ranking]');
  console.error('  supervibe-context-pack.mjs --query "<text>" --json   # coordinated memory/RAG/codegraph pack');
  console.error('  search-code.mjs --callers "<symbol-name-or-id>"');
  console.error('  search-code.mjs --callees "<symbol-name-or-id>"');
  console.error('  search-code.mjs --neighbors "<symbol-name-or-id>" --depth 2');
  console.error('  search-code.mjs --top-symbols 20 [--kind class]');
  console.error('  search-code.mjs --symbol-search "<query>" [--kind function]');
  console.error('  search-code.mjs --impact "<symbol-name-or-id>" --depth 2');
  console.error('  search-code.mjs --files "." [--lang typescript] [--format flat]');
  console.error('  search-code.mjs --context "<task or symbol>" [--no-semantic]');
  console.error('  search-code.mjs --repo-map --query "<task>"');
  process.exit(1);
}

const store = new CodeStore(PROJECT_ROOT, { useEmbeddings: !values['no-semantic'] });
await store.init();

const limit = parseInt(values.limit, 10);
let results;
let mode;

if (values['repo-map']) {
  mode = 'repo-map';
  const repoMap = await buildRepoMap({ rootDir: PROJECT_ROOT, tier: 'standard' });
  results = selectRepoMapContext(repoMap, { tier: 'standard', query: values.query || values.context || '' });
} else if (values.callers) {
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
} else if (values['symbol-search']) {
  mode = 'symbol-search';
  results = searchSymbols(store.db, values['symbol-search'], {
    limit,
    kinds: values.kind ? [values.kind] : []
  });
} else if (values.impact) {
  mode = 'impact';
  results = impactRadius(store.db, values.impact, {
    depth: parseInt(values.depth, 10),
    limit
  }).nodes;
} else if (values.files) {
  mode = 'files';
  results = listIndexedFiles(store.db, {
    pathPrefix: values.files,
    language: values.lang || '',
    limit
  });
} else if (values.context) {
  mode = 'context';
  store.close();
  const context = await buildCodeGraphContext({
    rootDir: PROJECT_ROOT,
    query: values.context,
    limit,
    graphDepth: parseInt(values.depth, 10),
    useEmbeddings: !values['no-semantic'],
    taskType: values['task-type'] || undefined,
  });
  if (values.json) console.log(JSON.stringify(context, null, 2));
  else console.log(context.markdown);
  process.exit(0);
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

if (mode === 'repo-map') {
  if (values.json) console.log(JSON.stringify(results, null, 2));
  else console.log(formatRepoMapContext(results));
  store.close();
  process.exit(0);
}

if (values.json) {
  console.log(JSON.stringify({ mode, results }, null, 2));
  process.exit(0);
}

if (results.length === 0) {
  console.log(`No matches (mode: ${mode}).`);
  process.exit(0);
}

console.log(`Found ${results.length} ${mode} matches:\n`);
for (const [i, r] of results.entries()) {
  if (mode === 'semantic') {
    console.log(`${i + 1}. ${r.file}:${r.startLine}-${r.endLine}  [${r.kind}${r.name ? ': ' + r.name : ''}, ${r.language}]`);
    console.log(`   score=${r.score.toFixed(3)} bm25=${r.bm25.toFixed(2)} semantic=${r.semantic.toFixed(3)}`);
    if (values['debug-ranking']) {
      console.log(`   mode=${r.retrievalMode} generated=${r.generatedSource} components=${JSON.stringify(r.scoreComponents)}`);
    }
    console.log(`   ${r.snippet.split('\n').slice(0, 4).join('\n   ')}\n`);
  } else if (mode === 'callers') {
    console.log(`${i + 1}. ${r.path}:${r.startLine}-${r.endLine}  [${r.kind}: ${r.name}]  ←${r.edgeKind}→`);
  } else if (mode === 'callees') {
    console.log(`${i + 1}. ${r.toName}  →${r.kind}→  (target id: ${r.toId || '<unresolved-or-external>'})`);
  } else if (mode === 'neighbors') {
    console.log(`${i + 1}. [d=${r.distance}] ${r.path}:${r.startLine}  [${r.kind}: ${r.name}]`);
  } else if (mode === 'top-symbols') {
    console.log(`${i + 1}. ${r.path}  [${r.kind}: ${r.name}]  in=${r.inDegree} out=${r.outDegree} total=${r.totalDegree}`);
  } else if (mode === 'symbol-search') {
    console.log(`${i + 1}. ${r.path}:${r.startLine}-${r.endLine}  [${r.kind}: ${r.name}]  score=${r.score}`);
  } else if (mode === 'impact') {
    console.log(`${i + 1}. [d=${r.distance}] ${r.path}:${r.startLine}  [${r.kind}: ${r.name}]  via=${r.via || 'graph'}`);
  } else if (mode === 'files') {
    if (values.format === 'grouped') {
      console.log(`${i + 1}. [${r.language}] ${r.path} (${r.symbolCount} symbols, ${r.lineCount} lines)`);
    } else {
      console.log(`${i + 1}. ${r.path}  [${r.language}, symbols=${r.symbolCount}, lines=${r.lineCount}]`);
    }
  }
}
