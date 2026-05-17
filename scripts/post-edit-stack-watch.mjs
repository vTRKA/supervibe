#!/usr/bin/env node
// Post-edit hook fires after host file-edit tool calls.
// Responsibilities:
//   1. Emit reminders for manifest / rule edits (ecosystem signals)
//   2. Keep Code RAG + CodeGraph and memory indexes fresh from runtime hooks
//      so agents only consume retrieval and never repair RAG themselves.
//
// Env contract:
//   SUPERVIBE_FILE_PATHS or SUPERVIBE_EDITED_PATHS - comma-separated paths touched by the host
//   SUPERVIBE_PROJECT_ROOT or SUPERVIBE_PROJECT_DIR - repo root (optional fallback to host env/cwd)
//   SUPERVIBE_HOOK_EMBED=1 - opt-in to also run embeddings (slower)
//   SUPERVIBE_HOOK_SILENT=1 - opt-out of any non-error stdout
//   SUPERVIBE_HOOK_NO_INDEX=1 - opt-out of pseudo-watcher (reminders still fire)
//   SUPERVIBE_HOOK_NO_BOOTSTRAP=1 - opt-out of creating code.db when missing
//   SUPERVIBE_HOOK_SCAN_ON_EMPTY=0 - disable Bash/shell mtime-scan fallback

import { existsSync, readFileSync } from 'node:fs';
import { basename, isAbsolute, resolve } from 'node:path';
import { resolveSupervibeEditedPaths, resolveSupervibeProjectRoot } from './lib/supervibe-plugin-root.mjs';

const PROJECT_ROOT = resolveSupervibeProjectRoot();
const hookInput = readHookInput();
const editedPaths = uniquePaths([
  ...resolveSupervibeEditedPaths(),
  ...readHookInputEditedPaths(hookInput),
]);
const FALLBACK_MTIME_SCAN = editedPaths.length === 0 && shouldRunFallbackMtimeScan(hookInput);
if (editedPaths.length === 0 && !FALLBACK_MTIME_SCAN) process.exit(0);

const MANIFESTS = new Set(['package.json', 'composer.json', 'Cargo.toml', 'pyproject.toml', 'go.mod', 'Gemfile']);
const SUPPORTED_CODE_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|py|php|rs|go|java|rb|vue|svelte)$/i;
const SILENT = process.env.SUPERVIBE_HOOK_SILENT === '1';
const NO_INDEX = process.env.SUPERVIBE_HOOK_NO_INDEX === '1';
const NO_BOOTSTRAP = process.env.SUPERVIBE_HOOK_NO_BOOTSTRAP === '1';
const USE_EMBED = process.env.SUPERVIBE_HOOK_EMBED === '1';
const HOOK_SCAN_OPTIONS = {
  maxMilliseconds: positiveIntEnv('SUPERVIBE_HOOK_SCAN_MAX_MS', 5000),
  maxUpdates: positiveIntEnv('SUPERVIBE_HOOK_SCAN_MAX_FILES', 50),
  discoverNew: process.env.SUPERVIBE_HOOK_SCAN_DISCOVER_NEW === '1',
  prune: process.env.SUPERVIBE_HOOK_SCAN_PRUNE === '1',
  allowFullDiscovery: process.env.SUPERVIBE_HOOK_SCAN_ALLOW_FULL_DISCOVERY === '1',
};
const CODE_DISCOVERY_REPAIR_COMMAND = 'node scripts/build-code-index.mjs --root . --resume --source-only --max-files 200 --max-seconds 120 --health --json-progress';

const reminders = [];
const sourceFiles = [];
const removedSourceFiles = [];
const memoryFiles = [];
const removedMemoryFiles = [];

for (const raw of editedPaths) {
  const path = isAbsolute(raw) ? raw : resolve(PROJECT_ROOT, raw);
  const name = basename(path);
  const fwdPath = path.replace(/\\/g, '/');
  const exists = existsSync(path);

  if (MANIFESTS.has(name)) {
    reminders.push(`Discovered: edit to ${name}. If a major dependency was added/upgraded, recommend /supervibe-adapt to update agent context.`);
  }
  if (/\/\.(claude|codex|cursor|gemini|opencode)\/rules\//.test(fwdPath) && path.endsWith('.md')) {
    reminders.push(`Discovered: edit to host adapter rules. Recommend rules-curator review + /supervibe-sync-rules if multi-project setup.`);
  }
  if (SUPPORTED_CODE_EXT.test(path)) {
    if (exists) sourceFiles.push(path);
    else removedSourceFiles.push(path);
  }
  if (fwdPath.includes('/.supervibe/memory/') && path.endsWith('.md')) {
    if (exists) memoryFiles.push(path);
    else removedMemoryFiles.push(path);
  }
}

if (reminders.length > 0 && !SILENT) {
  console.log(reminders.join('\n'));
}

// Pseudo-watcher: re-index source files + memory entries touched by this tool call.
// Open each store ONCE for the batch (cheap), update sequentially, close.
async function reindexCode() {
  if (NO_INDEX || (!FALLBACK_MTIME_SCAN && sourceFiles.length === 0 && removedSourceFiles.length === 0)) return 0;
  const dbPath = resolve(PROJECT_ROOT, '.supervibe', 'memory', 'code.db');
  const shouldBootstrap = !existsSync(dbPath) && !NO_BOOTSTRAP;
  if (!existsSync(dbPath) && !shouldBootstrap) return 0;

  let store;
  try {
    const { CodeStore } = await import('./lib/code-store.mjs');
    store = new CodeStore(PROJECT_ROOT, { useEmbeddings: USE_EMBED, useGraph: true });
    await store.init();

    let updated = 0;
    if (shouldBootstrap && sourceFiles.length > 0) {
      for (const file of sourceFiles) {
        try {
          const r = await store.indexFile(file);
          if (r.indexed || r.skipped === 'unchanged-graph-healed') updated++;
        } catch {}
      }
      return updated;
    }

    if (FALLBACK_MTIME_SCAN) {
      const { scanCodeChanges } = await import('./lib/mtime-scan.mjs');
      const counts = await scanCodeChanges(store, PROJECT_ROOT, HOOK_SCAN_OPTIONS);
      reportDeferredCodeDiscovery(counts);
      return counts.reindexed + counts.discovered + counts.removed + counts.pruned;
    }
    for (const file of sourceFiles) {
      try {
        const r = await store.indexFile(file);
        if (r.indexed || r.skipped === 'unchanged-graph-healed') updated++;
      } catch {}
    }
    for (const file of removedSourceFiles) {
      try {
        await store.removeFile(file);
        updated++;
      } catch {}
    }
    return updated;
  } catch {
    return 0;
  } finally {
    try { store?.close(); } catch {}
  }
}

function reportDeferredCodeDiscovery(counts = {}) {
  if (SILENT || !FALLBACK_MTIME_SCAN) return;
  const discoveryDisabled = HOOK_SCAN_OPTIONS.discoverNew !== true;
  const budgetDeferred = counts.truncated === true || Number(counts.deferred || 0) > 0;
  if (!discoveryDisabled && !budgetDeferred) return;
  const reason = discoveryDisabled
    ? 'new-file discovery is deferred in bounded shell fallback'
    : 'scan budget was reached';
  console.log('[supervibe] Code RAG fallback scan deferred discovery/prune: ' + reason + '. NEXT: ' + CODE_DISCOVERY_REPAIR_COMMAND);
}

async function reindexMemory() {
  if (NO_INDEX || (!FALLBACK_MTIME_SCAN && memoryFiles.length === 0 && removedMemoryFiles.length === 0)) return 0;
  const dbPath = resolve(PROJECT_ROOT, '.supervibe', 'memory', 'memory.db');
  if (!existsSync(dbPath) && memoryFiles.length === 0) return 0;

  let store;
  try {
    const { MemoryStore } = await import('./lib/memory-store.mjs');
    store = new MemoryStore(PROJECT_ROOT, { useEmbeddings: USE_EMBED });
    await store.init();

    if (FALLBACK_MTIME_SCAN && memoryFiles.length === 0 && removedMemoryFiles.length === 0) {
      const { scanMemoryChanges } = await import('./lib/mtime-scan.mjs');
      const counts = await scanMemoryChanges(store, PROJECT_ROOT, HOOK_SCAN_OPTIONS);
      return counts.reindexed + counts.removed;
    }

    let updated = 0;
    for (const file of memoryFiles) {
      try {
        const r = await store.incrementalUpdate(file);
        if (r.indexed) updated++;
      } catch {}
    }
    for (const file of removedMemoryFiles) {
      try {
        const r = await store.removeEntryByPath(file);
        if (r) updated++;
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

function positiveIntEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

function readHookInput() {
  if (process.stdin.isTTY) return null;
  let raw = '';
  try {
    raw = readFileSync(0, 'utf8');
  } catch {
    return null;
  }
  if (!raw.trim()) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readHookInputEditedPaths(input) {
  const toolInput = input?.tool_input || input?.toolInput || input?.input || {};
  const candidates = [];
  for (const key of ['file_path', 'filePath', 'path', 'target_file', 'targetFile']) {
    if (typeof toolInput[key] === 'string') candidates.push(toolInput[key]);
  }
  for (const key of ['command', 'patch', 'diff']) {
    if (typeof toolInput[key] === 'string') candidates.push(...parsePatchPaths(toolInput[key]));
  }
  if (Array.isArray(toolInput.files)) {
    for (const file of toolInput.files) if (typeof file === 'string') candidates.push(file);
  }
  return uniquePaths(candidates.map(cleanHookPath).filter(Boolean));
}

function shouldRunFallbackMtimeScan(input) {
  if (process.env.SUPERVIBE_HOOK_SCAN_ON_EMPTY === '0') return false;
  const toolName = String(input?.tool_name || input?.toolName || '').toLowerCase();
  if (!['bash', 'shell', 'powershell'].includes(toolName)) return false;
  if (process.env.SUPERVIBE_HOOK_SCAN_ON_EMPTY === '1') return true;
  const toolInput = input?.tool_input || input?.toolInput || input?.input || {};
  const command = String(toolInput.command || '');
  return commandMayWriteFiles(command);
}

function commandMayWriteFiles(command = '') {
  const text = String(command || '');
  return /[>&]|\b(Set-Content|Out-File|Remove-Item|Move-Item|Copy-Item|New-Item)\b/i.test(text)
    || /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:format|fmt|fix|lint:fix|generate|gen|build|compile|prepare|install|ci)\b/i.test(text)
    || /\b(?:prettier|rustfmt|gofmt)\b|\beslint\b(?=.*\b--fix\b)|\bruff\b(?=.*\b(?:format|--fix)\b)/i.test(text)
    || /\bgit\s+(?:checkout|switch|pull|merge|rebase|reset|restore|apply|am|stash|clean|mv|rm)\b/i.test(text)
    || /\b(?:cargo|go)\s+fmt\b/i.test(text);
}

function parsePatchPaths(text = '') {
  const paths = [];
  const patterns = [
    /^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm,
    /^\*\*\* Move to: (.+)$/gm,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) paths.push(match[1]);
  }
  return paths;
}

function cleanHookPath(value = '') {
  const trimmed = String(value || '').trim().replace(/^['"]|['"]$/g, '');
  if (!trimmed || trimmed === '/dev/null') return '';
  return trimmed;
}

function uniquePaths(paths = []) {
  const seen = new Set();
  const unique = [];
  for (const path of paths) {
    const key = String(path || '').replace(/\\/g, '/');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(path);
  }
  return unique;
}

reindex().then(() => process.exit(0)).catch(() => process.exit(0));
