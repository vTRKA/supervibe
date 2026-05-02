#!/usr/bin/env node
// Memory query CLI: invoked by supervibe:project-memory skill.
// Usage:
//   node scripts/search-memory.mjs --query "billing idempotency" --tags billing,redis --type decision --limit 5
//   node scripts/supervibe-context-pack.mjs --query "billing idempotency" --json  # coordinated pack
//
// Output: JSON array of matching entries with bm25 score.

import { searchMemory } from './lib/memory-store.mjs';
import { curateProjectMemory, filterCurrentMemoryResults } from './lib/supervibe-memory-curator.mjs';
import { buildProjectKnowledgeGraph, formatKnowledgeGraphSearch } from './lib/supervibe-project-knowledge-graph.mjs';
import { parseArgs } from 'node:util';

const PROJECT_ROOT = process.cwd();

const { values } = parseArgs({
  options: {
    query: { type: 'string', short: 'q', default: '' },
    tags: { type: 'string', short: 't', default: '' },
    type: { type: 'string', default: '' },
    limit: { type: 'string', short: 'n', default: '5' },
    'min-confidence': { type: 'string', default: '0' },
    graph: { type: 'boolean', default: false },
    'include-history': { type: 'boolean', default: false },
    'include-superseded': { type: 'boolean', default: false }
  },
  allowPositionals: true,
  strict: false
});

const opts = {
  query: values.query,
  tags: values.tags ? values.tags.split(',').filter(Boolean) : [],
  type: values.type || null,
  limit: parseInt(values.limit, 10),
  minConfidence: parseInt(values['min-confidence'], 10)
};

try {
  const includeHistory = Boolean(values['include-history'] || values['include-superseded']);
  const curation = await curateProjectMemory({ rootDir: PROJECT_ROOT, rebuildSqlite: false });
  const searchLimit = includeHistory ? opts.limit : Math.max(opts.limit * 4, opts.limit);
  const rawResults = await searchMemory(PROJECT_ROOT, { ...opts, limit: searchLimit });
  const results = filterCurrentMemoryResults(rawResults, curation, {
    includeHistory,
    limit: opts.limit,
  });
  if (values.graph) {
    const graph = await buildProjectKnowledgeGraph({ rootDir: PROJECT_ROOT, curation });
    console.log(formatKnowledgeGraphSearch(graph, {
      query: opts.query,
      includeHistory,
    }));
    if (results.length > 0) console.log("");
  }
  if (results.length === 0) {
    console.log('No memory entries matched.');
    if (opts.query || opts.tags.length) {
      console.log(`(query="${opts.query}", tags=[${opts.tags.join(',')}], type=${opts.type || 'any'})`);
    }
    console.log('This is a SIGNAL — your task may be novel territory.');
    process.exit(0);
  }

  console.log(`Found ${results.length} memory entries:\n`);
  for (const [i, r] of results.entries()) {
    console.log(`${i + 1}. [${r.type}] ${r.date || ''} — ${r.id}`);
    console.log(`   Tags: ${r.tags.join(', ')}`);
    console.log(`   Confidence: ${r.confidence}/10`);
    console.log(`   Freshness: ${r.freshness || 'unknown'}${r.stale ? ' (stale)' : ''}`);
    if (r.contradictionIds?.length) console.log(`   Contradictions: ${r.contradictionIds.join(', ')}`);
    console.log(`   Score: ${r.score.toFixed(2)} (lower=better in BM25)`);
    console.log(`   File: ${r.file}`);
    console.log(`   Summary: ${r.summary.slice(0, 200)}${r.summary.length > 200 ? '...' : ''}`);
    console.log('');
  }
} catch (err) {
  console.error('search-memory error:', err.message);
  process.exit(1);
}
