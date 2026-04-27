#!/usr/bin/env node
// Post-edit hook fires after Claude's Write/Edit tool calls.
// Two responsibilities:
//   1. Emit reminders for manifest / rule edits (ecosystem signals)
//   2. Pseudo-watcher: incrementally re-index source files into Code RAG + Graph
//      so the index stays fresh during an active session WITHOUT requiring
//      `npm run memory:watch` to be running. Skips embeddings (slow per-process
//      load) — semantic search will lag for that file until full reindex; graph
//      symbols/edges + BM25 stay current.
//
// Env contract (from Claude Code hooks):
//   CLAUDE_FILE_PATHS — comma-separated absolute paths affected by the tool use
//   CLAUDE_PROJECT_DIR — repo root (optional fallback to cwd)
//   EVOLVE_HOOK_EMBED=1 — opt-in to also run embeddings (slower)
//   EVOLVE_HOOK_SILENT=1 — opt-out of any non-error stdout
//   EVOLVE_HOOK_NO_INDEX=1 — opt-out of pseudo-watcher (reminders still fire)

import { existsSync } from 'node:fs';
import { basename, isAbsolute, resolve } from 'node:path';

const PROJECT_ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const editedPaths = (process.env.CLAUDE_FILE_PATHS || '').split(',').filter(Boolean);
if (editedPaths.length === 0) process.exit(0);

const MANIFESTS = new Set(['package.json', 'composer.json', 'Cargo.toml', 'pyproject.toml', 'go.mod', 'Gemfile']);
const SUPPORTED_CODE_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|py|php|rs|go|java|rb|vue|svelte)$/i;
const SILENT = process.env.EVOLVE_HOOK_SILENT === '1';
const NO_INDEX = process.env.EVOLVE_HOOK_NO_INDEX === '1';
const USE_EMBED = process.env.EVOLVE_HOOK_EMBED === '1';

const reminders = [];
const sourceFiles = [];

for (const raw of editedPaths) {
  const path = isAbsolute(raw) ? raw : resolve(PROJECT_ROOT, raw);
  const name = basename(path);

  if (MANIFESTS.has(name)) {
    reminders.push(`Discovered: edit to ${name}. If a major dependency was added/upgraded, recommend /evolve-adapt to update agent context.`);
  }
  if (path.replace(/\\/g, '/').includes('/.claude/rules/') && path.endsWith('.md')) {
    reminders.push(`Discovered: edit to .claude/rules/. Recommend rules-curator review + /evolve-sync-rules if multi-project setup.`);
  }
  if (SUPPORTED_CODE_EXT.test(path) && existsSync(path)) {
    sourceFiles.push(path);
  }
}

if (reminders.length > 0 && !SILENT) {
  console.log(reminders.join('\n'));
}

// Pseudo-watcher: re-index source files touched by this tool call.
// Open store ONCE for the batch (cheap), index sequentially, close.
async function reindex() {
  if (NO_INDEX || sourceFiles.length === 0) return;

  // Only attempt if Code RAG/Graph already initialized — no first-time bootstrap here.
  const dbPath = resolve(PROJECT_ROOT, '.claude', 'memory', 'code.db');
  if (!existsSync(dbPath)) return;

  let store;
  try {
    const { CodeStore } = await import('./lib/code-store.mjs');
    store = new CodeStore(PROJECT_ROOT, { useEmbeddings: USE_EMBED });
    await store.init();

    let updated = 0;
    for (const file of sourceFiles) {
      try {
        const r = await store.indexFile(file);
        if (r.indexed || r.skipped === 'unchanged-graph-healed') updated++;
      } catch {
        // per-file failure is non-fatal
      }
    }
    if (updated > 0 && !SILENT && process.env.EVOLVE_VERBOSE === '1') {
      console.log(`[evolve] auto-reindexed ${updated} file(s)`);
    }
  } catch {
    // store init failure is non-fatal (e.g., DB locked by watcher daemon)
  } finally {
    try { store?.close(); } catch {}
  }
}

reindex().then(() => process.exit(0)).catch(() => process.exit(0));
