#!/usr/bin/env node
// Memory query CLI: invoked by supervibe:project-memory skill.
// Usage:
//   node scripts/search-memory.mjs --query "billing idempotency" --tags billing,redis --type decision --limit 5
//
// Output: JSON array of matching entries with bm25 score.

import { searchMemory } from './lib/memory-store.mjs';
import { parseArgs } from 'node:util';

const PROJECT_ROOT = process.cwd();

const { values } = parseArgs({
  options: {
    query: { type: 'string', short: 'q', default: '' },
    tags: { type: 'string', short: 't', default: '' },
    type: { type: 'string', default: '' },
    limit: { type: 'string', short: 'n', default: '5' },
    'min-confidence': { type: 'string', default: '0' }
  },
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
  const results = await searchMemory(PROJECT_ROOT, opts);
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
    console.log(`   Score: ${r.score.toFixed(2)} (lower=better in BM25)`);
    console.log(`   File: ${r.file}`);
    console.log(`   Summary: ${r.summary.slice(0, 200)}${r.summary.length > 200 ? '...' : ''}`);
    console.log('');
  }
} catch (err) {
  console.error('search-memory error:', err.message);
  process.exit(1);
}
