#!/usr/bin/env node
// Memory query CLI: invoked by supervibe:project-memory skill.
// Usage:
//   node scripts/search-memory.mjs --query "billing idempotency" --tags billing,redis --type decision --limit 5
//   node scripts/supervibe-context-pack.mjs --query "billing idempotency" --json  # coordinated pack
//
// Output: JSON array of matching entries with bm25 score.

import { searchMemory } from './lib/memory-store.mjs';
import { curateProjectMemory, filterCurrentMemoryResults, readMarkdownMemoryEntries } from './lib/supervibe-memory-curator.mjs';
import { buildProjectKnowledgeGraph, formatKnowledgeGraphSearch, queryProjectKnowledgeGraph } from './lib/supervibe-project-knowledge-graph.mjs';
import { buildMemoryRelationshipGraph, formatMemoryRelationshipGraph } from './lib/supervibe-memory-backfill.mjs';
import { buildSharedEvidencePacket, formatEvidencePacketSummary } from './lib/supervibe-evidence-packet.mjs';
import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';

const PROJECT_ROOT = process.cwd();

const { values } = parseArgs({
  options: {
    query: { type: 'string', short: 'q', default: '' },
    tags: { type: 'string', short: 't', default: '' },
    type: { type: 'string', default: '' },
    limit: { type: 'string', short: 'n', default: '5' },
    'min-confidence': { type: 'string', default: '0' },
    'busy-timeout-ms': { type: 'string', default: '5000' },
    'read-retry-attempts': { type: 'string', default: '3' },
    'read-retry-delay-ms': { type: 'string', default: '25' },
    'validate-entry': { type: 'string', default: '' },
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
  minConfidence: parseInt(values['min-confidence'], 10),
  busyTimeoutMs: parseInt(values['busy-timeout-ms'], 10),
  readRetryAttempts: parseInt(values['read-retry-attempts'], 10),
  readRetryDelayMs: parseInt(values['read-retry-delay-ms'], 10)
};

const MEMORY_ENTRY_REQUIRED_FIELDS = Object.freeze([
  'id',
  'type',
  'date',
  'tags',
  'agent',
  'confidence',
  'sourceArtifact',
  'owner',
  'freshness',
  'relationships',
]);

try {
  if (values['validate-entry']) {
    const report = await validateMemoryEntryFile(values['validate-entry']);
    console.log(formatMemoryEntrySchemaReport(report));
    process.exit(report.pass ? 0 : 1);
  }

  const includeHistory = Boolean(values['include-history'] || values['include-superseded']);
  const curation = await curateProjectMemory({ rootDir: PROJECT_ROOT, rebuildSqlite: false, writeIndex: false });
  const searchLimit = includeHistory ? opts.limit : Math.max(opts.limit * 4, opts.limit);
  const rawResults = await searchMemory(PROJECT_ROOT, { ...opts, limit: searchLimit });
  const filteredResults = filterCurrentMemoryResults(rawResults, curation, {
    includeHistory,
    limit: searchLimit,
  });
  const results = orderMemorySearchResults(filteredResults, curation).slice(0, opts.limit);
  let graphFallbackMatched = false;
  let graphFallbackSummary = null;
  if (values.graph) {
    const graph = await buildProjectKnowledgeGraph({ rootDir: PROJECT_ROOT, curation });
    const graphSearch = queryProjectKnowledgeGraph(graph, {
      query: opts.query,
      includeHistory,
    });
    console.log(formatKnowledgeGraphSearch(graph, {
      query: opts.query,
      includeHistory,
    }));
    if (results.length === 0 && (graphSearch.nodes.length > 0 || graphSearch.edges.length > 0)) {
      graphFallbackMatched = true;
      graphFallbackSummary = { nodes: graphSearch.nodes.length, edges: graphSearch.edges.length };
      console.log('');
      console.log(formatMemoryGraphFallbackWarning(graphSearch));
    }
    console.log("");
    const entries = await readMarkdownMemoryEntries({ rootDir: PROJECT_ROOT });
    const relationshipGraph = buildMemoryRelationshipGraph(entries, {
      rootId: results[0]?.id || null,
    });
    console.log(formatMemoryRelationshipGraph(relationshipGraph));
    console.log("");
    const qualityGate = buildMemorySearchQualityGate(curation);
    console.log(formatMemorySearchQualityGate(qualityGate));
    console.log("");
    console.log(formatEvidencePacketSummary(buildSharedEvidencePacket({
      query: opts.query,
      memory: results.map((entry) => ({
        id: entry.id,
        path: entry.file,
        summary: entry.summary,
        confidence: entry.confidence,
        freshness: entry.freshness || (entry.stale ? "stale" : "current"),
        score: entry.score,
      })),
      freshness: {
        memory: qualityGate.status === "mature" ? "current" : "stale",
        rag: "missing",
        codeGraph: "missing",
      },
      redactionStatus: "not-needed",
      tokenBudget: {
        maxTokens: Math.max(400, opts.limit * 240),
        estimatedTokens: results.reduce((sum, entry) => sum + Math.ceil(String(entry.summary || entry.id || "").length / 4), 0),
        pass: true,
        trimmed: false,
      },
    }), { prefix: "MEMORY_EVIDENCE_PACKET" }));
    if (results.length > 0) console.log("");
  }
  if (!values.graph && results.length === 0 && (opts.query || opts.tags.length)) {
    const graph = await buildProjectKnowledgeGraph({ rootDir: PROJECT_ROOT, curation });
    const graphSearch = queryProjectKnowledgeGraph(graph, {
      query: opts.query,
      includeHistory,
    });
    if (graphSearch.nodes.length > 0 || graphSearch.edges.length > 0) {
      graphFallbackMatched = true;
      graphFallbackSummary = { nodes: graphSearch.nodes.length, edges: graphSearch.edges.length };
    }
  }
  if (results.length === 0) {
    console.log('No memory entries matched.');
    if (opts.query || opts.tags.length) {
      console.log(`(query="${opts.query}", tags=[${opts.tags.join(',')}], type=${opts.type || 'any'})`);
    }
    if (graphFallbackMatched) {
      if (graphFallbackSummary) console.log(`Graph fallback: nodes=${graphFallbackSummary.nodes}, edges=${graphFallbackSummary.edges}. Re-run with --graph for details.`);
      console.log('This is a SIGNAL - direct memory search missed, but graph context exists; inspect graph fallback before treating this as novel.');
    } else {
      console.log('This is a SIGNAL - your task may be novel territory.');
    }
    process.exit(0);
  }

  console.log(`Found ${results.length} memory entries:\n`);
  for (const [i, r] of results.entries()) {
    console.log(`${i + 1}. [${r.type}] ${r.date || ''} — ${r.id}`);
    console.log(`   Tags: ${r.tags.join(', ')}`);
    console.log(`   Confidence: ${r.confidence}/10`);
    console.log(`   Freshness: ${r.freshness || 'unknown'}${r.stale ? ' (stale)' : ''}`);
    if (r.contradictionIds?.length) console.log(`   Contradictions: ${r.contradictionIds.join(', ')}`);
    if (r.reviewNeeded) console.log('   Review: contradiction review needed');
    if (r.supersededBy?.length) console.log(`   Superseded by: ${r.supersededBy.join(', ')}`);
    console.log(`   Score: ${r.score.toFixed(2)} (lower=better in BM25)`);
    console.log(`   File: ${r.file}`);
    console.log(`   Summary: ${r.summary.slice(0, 200)}${r.summary.length > 200 ? '...' : ''}`);
    console.log('');
  }
} catch (err) {
  console.error('search-memory error:', err.message);
  process.exit(1);
}

function formatMemoryGraphFallbackWarning(graphSearch = {}) {
  return [
    'MEMORY_SEARCH_GRAPH_FALLBACK',
    'DIRECT_MATCHES: 0',
    `GRAPH_MATCHED_NODES: ${graphSearch.nodes?.length || 0}`,
    `GRAPH_MATCHED_EDGES: ${graphSearch.edges?.length || 0}`,
    'WARNING: direct memory search missed entries, but the project knowledge graph has related context.',
    'NEXT_ACTION: inspect the --graph output and cite related memory/tag/file nodes before treating the task as novel.',
  ].join('\n');
}

function orderMemorySearchResults(results = [], curation = null) {
  const lifecycle = curation?.lifecycle?.byId || {};
  return results
    .map((entry, index) => {
      const state = lifecycle[entry.id] || {};
      const contradictionIds = state.contradictionIds || entry.contradictionIds || [];
      const supersededBy = state.supersededBy || [];
      return {
        ...entry,
        contradictionIds,
        supersededBy,
        reviewNeeded: contradictionIds.length > 0,
        originalRank: index,
      };
    })
    .sort((left, right) => memoryRank(left) - memoryRank(right)
      || String(right.date || '').localeCompare(String(left.date || ''))
      || left.originalRank - right.originalRank)
    .map(({ originalRank, ...entry }) => entry);
}

function memoryRank(entry) {
  if (entry.reviewNeeded) return 2;
  if (entry.stale || entry.freshness === 'superseded') return 1;
  return 0;
}

function buildMemorySearchQualityGate(curation = {}) {
  const queues = curation.lifecycle?.candidateQueues || {};
  const candidateCount = Object.values(queues).reduce((sum, queue) => sum + (Array.isArray(queue) ? queue.length : 0), 0);
  const entries = Number(curation.markdownEntries || 0);
  const minEntries = 20;
  return {
    status: entries >= minEntries && (curation.lifecycle?.staleCount || 0) === 0 ? 'mature' : 'not-mature',
    entries,
    minEntries,
    freshness: {
      current: curation.hierarchy?.current?.count || 0,
      history: curation.hierarchy?.history?.count || 0,
      stale: curation.lifecycle?.staleCount || 0,
    },
    candidateCount,
    repairCommand: 'node scripts/supervibe-memory-backfill.mjs --source all',
  };
}

function formatMemorySearchQualityGate(gate = {}) {
  return [
    'SUPERVIBE_MEMORY_SEARCH_QUALITY',
    `STATUS: ${gate.status || 'unknown'}`,
    `ENTRIES: ${gate.entries || 0}`,
    `MIN_ENTRIES: ${gate.minEntries || 0}`,
    `FRESHNESS: current=${gate.freshness?.current || 0},history=${gate.freshness?.history || 0},stale=${gate.freshness?.stale || 0}`,
    `CANDIDATE_COUNT: ${gate.candidateCount || 0}`,
    `REPAIR_COMMAND: ${gate.repairCommand || 'none'}`,
  ].join('\n');
}

async function validateMemoryEntryFile(file) {
  const markdown = await readFile(file, 'utf8');
  const frontmatter = parseFrontmatter(markdown);
  const issues = validateMemoryEntryFrontmatter(frontmatter);
  return {
    file,
    pass: issues.length === 0,
    requiredFields: [...MEMORY_ENTRY_REQUIRED_FIELDS],
    frontmatter,
    issues,
  };
}

function validateMemoryEntryFrontmatter(frontmatter = {}) {
  const issues = [];
  for (const field of MEMORY_ENTRY_REQUIRED_FIELDS) {
    if (!hasValue(frontmatter[field])) issues.push(`missing required field: ${field}`);
  }
  if (hasValue(frontmatter.confidence)) {
    const score = Number(frontmatter.confidence);
    if (!Number.isFinite(score) || score < 0 || score > 10) issues.push('confidence must be a number from 0 to 10');
  }
  if (hasValue(frontmatter.freshness) && !['current', 'fresh', 'stale', 'superseded', 'review-needed'].includes(String(frontmatter.freshness))) {
    issues.push('freshness must be current, fresh, stale, superseded, or review-needed');
  }
  if (hasValue(frontmatter.relationships) && !Array.isArray(frontmatter.relationships)) {
    issues.push('relationships must be a list');
  }
  if (hasValue(frontmatter.tags) && !Array.isArray(frontmatter.tags)) {
    issues.push('tags must be a list');
  }
  return issues;
}

function parseFrontmatter(markdown = '') {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/m.exec(markdown);
  if (!match) return {};
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const row = /^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/.exec(line);
    if (!row) continue;
    const key = row[1];
    data[key] = parseFrontmatterValue(row[2]);
  }
  return data;
}

function parseFrontmatterValue(value = '') {
  const text = String(value || '').trim();
  if (/^\[[\s\S]*\]$/.test(text)) {
    const inner = text.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map((item) => item.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  }
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text);
  return text.replace(/^['"]|['"]$/g, '');
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function formatMemoryEntrySchemaReport(report) {
  const lines = [
    'SUPERVIBE_MEMORY_ENTRY_SCHEMA',
    `FILE: ${report.file}`,
    `PASS: ${report.pass}`,
    `REQUIRED_FIELDS: ${report.requiredFields.join(',')}`,
  ];
  for (const issue of report.issues) lines.push(`ISSUE: ${issue}`);
  return lines.join('\n');
}
