#!/usr/bin/env node
// Code RAG search CLI. Used by evolve:code-search skill.
// Usage: node scripts/search-code.mjs --query "where is auth handled" [--lang typescript] [--kind function-or-class] [--limit 10]

import { CodeStore } from './lib/code-store.mjs';
import { parseArgs } from 'node:util';

const PROJECT_ROOT = process.cwd();
const { values } = parseArgs({
  options: {
    query: { type: 'string', short: 'q', default: '' },
    lang: { type: 'string', default: '' },
    kind: { type: 'string', default: '' },
    limit: { type: 'string', short: 'n', default: '10' },
    'no-semantic': { type: 'boolean', default: false }
  },
  strict: false
});

if (!values.query) {
  console.error('Usage: search-code.mjs --query "<text>" [--lang <name>] [--kind <kind>] [--limit N]');
  process.exit(1);
}

const store = new CodeStore(PROJECT_ROOT, { useEmbeddings: !values['no-semantic'] });
await store.init();

const results = await store.search({
  query: values.query,
  language: values.lang || null,
  kind: values.kind || null,
  limit: parseInt(values.limit, 10),
  semantic: !values['no-semantic']
});

store.close();

if (results.length === 0) {
  console.log('No code matches.');
  console.log('(query was: "' + values.query + '")');
  process.exit(0);
}

console.log(`Found ${results.length} code matches:\n`);
for (const [i, r] of results.entries()) {
  console.log(`${i + 1}. ${r.file}:${r.startLine}-${r.endLine}  [${r.kind}${r.name ? ': ' + r.name : ''}, ${r.language}]`);
  console.log(`   score=${r.score.toFixed(3)} bm25=${r.bm25.toFixed(2)} semantic=${r.semantic.toFixed(3)}`);
  console.log(`   ${r.snippet.split('\n').slice(0, 4).join('\n   ')}`);
  console.log('');
}
