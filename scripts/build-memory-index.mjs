#!/usr/bin/env node
// Generates .claude/memory/index.json from all memory entries in .claude/memory/
// Index format: { tags: { tag-name: [entry-ids] }, entries: { id: {meta} } }
// Run via: node scripts/build-memory-index.mjs (or invoked by evolve:add-memory)

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, sep, relative } from 'node:path';
import matter from 'gray-matter';

// Resolve project root from cwd (NOT from plugin install path).
// Memory lives in TARGET project, not in plugin.
const PROJECT_ROOT = process.cwd();
const MEMORY_DIR = join(PROJECT_ROOT, '.claude', 'memory');
const INDEX_PATH = join(MEMORY_DIR, 'index.json');

const CATEGORIES = ['decisions', 'patterns', 'incidents', 'learnings', 'solutions'];

async function* walkCategory(category) {
  const dir = join(MEMORY_DIR, category);
  if (!existsSync(dir)) return;
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); }
  catch { return; }

  for (const entry of entries) {
    if (entry.isDirectory()) continue;
    if (!entry.name.endsWith('.md')) continue;
    if (entry.name.startsWith('_')) continue;
    yield join(dir, entry.name);
  }
}

async function main() {
  if (!existsSync(MEMORY_DIR)) {
    await mkdir(MEMORY_DIR, { recursive: true });
    for (const cat of CATEGORIES) {
      await mkdir(join(MEMORY_DIR, cat), { recursive: true });
    }
  }

  const index = {
    'generated-at': new Date().toISOString(),
    'memory-version': '1.0',
    counts: { decisions: 0, patterns: 0, incidents: 0, learnings: 0, solutions: 0 },
    tags: {},
    entries: {}
  };

  for (const category of CATEGORIES) {
    for await (const filePath of walkCategory(category)) {
      const content = await readFile(filePath, 'utf8');
      const { data } = matter(content);
      if (!data.id) continue;

      const relPath = relative(PROJECT_ROOT, filePath).split(sep).join('/');

      index.entries[data.id] = {
        type: data.type || category.slice(0, -1),
        date: data.date,
        tags: data.tags || [],
        related: data.related || [],
        agent: data.agent || 'unknown',
        confidence: data.confidence || 0,
        file: relPath
      };
      index.counts[category] = (index.counts[category] || 0) + 1;

      for (const tag of (data.tags || [])) {
        if (!index.tags[tag]) index.tags[tag] = [];
        index.tags[tag].push(data.id);
      }
    }
  }

  await writeFile(INDEX_PATH, JSON.stringify(index, null, 2));

  const totalEntries = Object.keys(index.entries).length;
  const tagCount = Object.keys(index.tags).length;
  console.log(`Memory index built: ${totalEntries} entries, ${tagCount} unique tags`);
  console.log(`Counts:`, index.counts);
}

main().catch(err => { console.error('build-memory-index error:', err); process.exit(1); });
