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
// Env contract:
//   SUPERVIBE_FILE_PATHS or SUPERVIBE_EDITED_PATHS — comma-separated paths touched by the host
//   SUPERVIBE_PROJECT_ROOT or SUPERVIBE_PROJECT_DIR — repo root (optional fallback to host env/cwd)
//   SUPERVIBE_HOOK_EMBED=1 — opt-in to also run embeddings (slower)
//   SUPERVIBE_HOOK_SILENT=1 — opt-out of any non-error stdout
//   SUPERVIBE_HOOK_NO_INDEX=1 — opt-out of pseudo-watcher (reminders still fire)

import { existsSync } from 'node:fs';
import { basename, isAbsolute, resolve } from 'node:path';
import { resolveSupervibeEditedPaths, resolveSupervibeProjectRoot } from './lib/supervibe-plugin-root.mjs';

const PROJECT_ROOT = resolveSupervibeProjectRoot();
const editedPaths = resolveSupervibeEditedPaths();
if (editedPaths.length === 0) process.exit(0);

const MANIFESTS = new Set(['package.json', 'composer.json', 'Cargo.toml', 'pyproject.toml', 'go.mod', 'Gemfile']);
const SUPPORTED_CODE_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|py|php|rs|go|java|rb|vue|svelte)$/i;
const SILENT = process.env.SUPERVIBE_HOOK_SILENT === '1';
const NO_INDEX = process.env.SUPERVIBE_HOOK_NO_INDEX === '1';
const USE_EMBED = process.env.SUPERVIBE_HOOK_EMBED === '1';

const reminders = [];
const sourceFiles = [];
const memoryFiles = [];

for (const raw of editedPaths) {
  const path = isAbsolute(raw) ? raw : resolve(PROJECT_ROOT, raw);
  const name = basename(path);
  const fwdPath = path.replace(/\\/g, '/');

  if (MANIFESTS.has(name)) {
    reminders.push(`Discovered: edit to ${name}. If a major dependency was added/upgraded, recommend /supervibe-adapt to update agent context.`);
  }
  if (/\/\.(claude|codex|cursor|gemini|opencode)\/rules\//.test(fwdPath) && path.endsWith('.md')) {
    reminders.push(`Discovered: edit to host adapter rules. Recommend rules-curator review + /supervibe-sync-rules if multi-project setup.`);
  }
  if (SUPPORTED_CODE_EXT.test(path) && existsSync(path)) {
    sourceFiles.push(path);
  }
  if (fwdPath.includes('/.supervibe/memory/') && path.endsWith('.md')) {
    memoryFiles.push(path);
  }
}

if (reminders.length > 0 && !SILENT) {
  console.log(reminders.join('\n'));
}

// Pseudo-watcher: re-index source files + memory entries touched by this tool call.
// Open each store ONCE for the batch (cheap), update sequentially, close.
async function reindexCode() {
  if (NO_INDEX || sourceFiles.length === 0) return 0;
  const dbPath = resolve(PROJECT_ROOT, '.supervibe', 'memory', 'code.db');
  if (!existsSync(dbPath)) return 0;

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
      } catch {}
    }
    return updated;
  } catch {
    return 0;
  } finally {
    try { store?.close(); } catch {}
  }
}

async function reindexMemory() {
  if (NO_INDEX || memoryFiles.length === 0) return 0;
  const dbPath = resolve(PROJECT_ROOT, '.supervibe', 'memory', 'memory.db');
  if (!existsSync(dbPath)) return 0;

  let store;
  try {
    const { MemoryStore } = await import('./lib/memory-store.mjs');
    store = new MemoryStore(PROJECT_ROOT, { useEmbeddings: USE_EMBED });
    await store.init();

    let updated = 0;
    for (const file of memoryFiles) {
      try {
        const r = await store.incrementalUpdate(file);
        if (r.indexed) updated++;
      } catch {}
    }
    return updated;
  } catch {
    return 0;
  } finally {
    try { store?.close(); } catch {}
  }
}

async function reindex() {
  const [code, mem] = await Promise.all([reindexCode(), reindexMemory()]);
  const total = code + mem;
  if (total > 0 && !SILENT && process.env.SUPERVIBE_VERBOSE === '1') {
    console.log(`[supervibe] auto-reindexed ${code} code file(s), ${mem} memory entr(ies)`);
  }
}

reindex().then(() => process.exit(0)).catch(() => process.exit(0));
