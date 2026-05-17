// Cheap mtime-based scan: catches files that changed between sessions
// (external editor, git pull, CI). It stats indexed rows first and only reads
// file content when mtime proves a change. Optional budgets let hooks defer
// expensive repair work instead of slowing agent startup.

import { stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { discoverSourceFiles, normalizeRelPath, pruneCodeIndex } from './supervibe-index-policy.mjs';

function toAbs(projectRoot, relPath) {
  return isAbsolute(relPath) ? relPath : join(projectRoot, relPath);
}

function positiveLimit(value) {
  if (value === undefined || value === null || value === '') return Infinity;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : Infinity;
}

function positiveMilliseconds(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function createBudget(options = {}) {
  const maxMilliseconds = positiveMilliseconds(options.maxMilliseconds);
  return {
    deadline: maxMilliseconds > 0 ? Date.now() + maxMilliseconds : 0,
    maxReindexed: positiveLimit(options.maxReindexed ?? options.maxUpdates),
    maxDiscovered: positiveLimit(options.maxDiscovered ?? options.maxUpdates),
    maxRemoved: positiveLimit(options.maxRemoved ?? options.maxUpdates),
    maxPruned: positiveLimit(options.maxPruned ?? options.maxUpdates),
  };
}

function budgetExpired(budget) {
  return Boolean(budget.deadline && Date.now() >= budget.deadline);
}

function markDeferred(counts, n = 1) {
  counts.deferred += Math.max(1, n);
  counts.truncated = true;
}

function limitReached(current, limit) {
  return Number.isFinite(limit) && current >= limit;
}

function hasBoundedBudget(budget) {
  return Boolean(budget.deadline) ||
    Number.isFinite(budget.maxReindexed) ||
    Number.isFinite(budget.maxDiscovered) ||
    Number.isFinite(budget.maxRemoved) ||
    Number.isFinite(budget.maxPruned);
}

/**
 * Compare every code_files row to disk mtime. Reindex changed, remove deleted,
 * then optionally discover new files and prune no-longer-indexable rows.
 * Returns { reindexed, removed, discovered, pruned, scanned, deferred, truncated, errors }.
 */
export async function scanCodeChanges(codeStore, projectRoot, options = {}) {
  const rows = codeStore.db.prepare('SELECT path, indexed_at FROM code_files').all();
  const indexedPaths = new Set(rows.map((row) => normalizeRelPath(row.path)));
  const budget = createBudget(options);
  const counts = {
    reindexed: 0,
    removed: 0,
    discovered: 0,
    pruned: 0,
    scanned: rows.length,
    deferred: 0,
    truncated: false,
    errors: 0,
  };

  for (let index = 0; index < rows.length; index += 1) {
    if (budgetExpired(budget)) {
      markDeferred(counts, rows.length - index);
      break;
    }

    const row = rows[index];
    const abs = toAbs(projectRoot, row.path);
    if (!existsSync(abs)) {
      if (limitReached(counts.removed, budget.maxRemoved)) {
        markDeferred(counts);
        continue;
      }
      try {
        await codeStore.removeFile(abs);
        counts.removed++;
      } catch {
        counts.errors++;
      }
      continue;
    }

    try {
      const s = await stat(abs);
      const indexedMs = Date.parse(`${row.indexed_at}Z`); // SQLite datetime() is UTC.
      if (s.mtimeMs > indexedMs) {
        if (limitReached(counts.reindexed, budget.maxReindexed)) {
          markDeferred(counts);
          continue;
        }
        const r = await codeStore.indexFile(abs);
        if (r.indexed) counts.reindexed++;
      }
    } catch {
      counts.errors++;
    }
  }

  const shouldDiscover = options.discoverNew !== false;
  const shouldPrune = options.prune !== false;
  const boundedFullInventory = hasBoundedBudget(budget) && options.allowFullDiscovery !== true;
  if (boundedFullInventory && (shouldDiscover || shouldPrune)) {
    markDeferred(counts);
    return counts;
  }
  if (shouldDiscover || shouldPrune) {
    if (budgetExpired(budget)) {
      markDeferred(counts);
      return counts;
    }

    let inventory = null;
    try {
      inventory = await discoverSourceFiles(projectRoot);
    } catch {
      counts.errors++;
    }

    if (inventory && shouldDiscover) {
      for (const file of inventory.files) {
        if (indexedPaths.has(file.relPath)) continue;
        if (budgetExpired(budget)) {
          markDeferred(counts);
          break;
        }
        if (limitReached(counts.discovered, budget.maxDiscovered)) {
          markDeferred(counts);
          continue;
        }
        try {
          const r = await codeStore.indexFile(file.absPath);
          if (r.indexed) counts.discovered++;
        } catch {
          counts.errors++;
        }
      }
    }

    if (inventory && shouldPrune) {
      if (budgetExpired(budget) || limitReached(counts.pruned, budget.maxPruned)) {
        markDeferred(counts);
      } else {
        try {
          const prune = await pruneCodeIndex(codeStore, inventory, projectRoot);
          counts.pruned = prune.removed;
          counts.removed += prune.removed;
        } catch {
          counts.errors++;
        }
      }
    }
  }

  return counts;
}

/**
 * Same for memory entries. Returns { reindexed, removed, scanned, deferred, truncated, errors }.
 */
export async function scanMemoryChanges(memoryStore, projectRoot, options = {}) {
  const rows = memoryStore.db.prepare('SELECT file, indexed_at FROM entries').all();
  const budget = createBudget(options);
  const counts = { reindexed: 0, removed: 0, scanned: rows.length, deferred: 0, truncated: false, errors: 0 };

  for (let index = 0; index < rows.length; index += 1) {
    if (budgetExpired(budget)) {
      markDeferred(counts, rows.length - index);
      break;
    }

    const row = rows[index];
    const abs = toAbs(projectRoot, row.file);
    if (!existsSync(abs)) {
      if (limitReached(counts.removed, budget.maxRemoved)) {
        markDeferred(counts);
        continue;
      }
      try {
        const r = await memoryStore.removeEntryByPath(abs);
        if (r) counts.removed++;
      } catch {
        counts.errors++;
      }
      continue;
    }

    try {
      const s = await stat(abs);
      const indexedMs = row.indexed_at ? Date.parse(`${row.indexed_at}Z`) : 0;
      if (s.mtimeMs > indexedMs) {
        if (limitReached(counts.reindexed, budget.maxReindexed)) {
          markDeferred(counts);
          continue;
        }
        const r = await memoryStore.incrementalUpdate(abs);
        if (r.indexed) counts.reindexed++;
      }
    } catch {
      counts.errors++;
    }
  }

  return counts;
}
