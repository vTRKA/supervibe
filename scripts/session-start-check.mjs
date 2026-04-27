#!/usr/bin/env node
// Session-start hook: emits system-reminders if artifacts are stale OR override-rate is high.
// Output to stdout becomes a system-reminder visible to the main agent.

import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

const PROJECT_ROOT = process.cwd();
const STALE_DAYS = 30;
const OVERRIDE_RATE_THRESHOLD = 0.05;

async function checkStaleArtifacts() {
  const dirs = ['agents', 'rules', 'skills'].map(d => join(PROJECT_ROOT, '.claude', d));
  const stale = [];
  const cutoff = new Date(Date.now() - STALE_DAYS * 86400000);

  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    let entries;
    try { entries = await readdir(dir, { recursive: true, withFileTypes: true }); }
    catch { continue; }

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const filePath = join(entry.parentPath || dir, entry.name);
      const content = await readFile(filePath, 'utf8');
      const match = content.match(/last-verified:\s*(\S+)/);
      if (!match) continue;
      const verifiedDate = new Date(match[1]);
      if (verifiedDate < cutoff) stale.push({ file: filePath, lastVerified: match[1] });
    }
  }
  return stale;
}

async function checkOverrideRate() {
  const logPath = join(PROJECT_ROOT, '.claude', 'confidence-log.jsonl');
  if (!existsSync(logPath)) return { rate: 0, count: 0 };
  const content = await readFile(logPath, 'utf8');
  const lines = content.split('\n').filter(Boolean);
  if (lines.length === 0) return { rate: 0, count: 0 };
  const recent = lines.slice(-100);
  const overrides = recent.filter(l => {
    try { return JSON.parse(l).override === true; } catch { return false; }
  });
  return { rate: overrides.length / recent.length, count: recent.length };
}

// === Phase D: code RAG + graph index health ===
async function ensureCodeIndexFresh(projectRoot) {
  const { CodeStore } = await import('./lib/code-store.mjs');
  const { statSync } = await import('node:fs');

  const dbPath = join(projectRoot, '.claude', 'memory', 'code.db');
  const indexExists = existsSync(dbPath);

  let action = 'skip';
  if (!indexExists) {
    action = 'full';
  }
  // For incremental refresh we rely on the file watcher (memory:watch).
  // SessionStart hook should be fast — full reindex only if missing.

  if (action === 'skip') {
    // Just open and report stats
    try {
      const store = new CodeStore(projectRoot, { useEmbeddings: false });
      await store.init();
      const stats = store.stats();
      store.close();
      return { action: 'skip', stats };
    } catch (err) {
      return { action: 'skip', error: err.message };
    }
  }

  const store = new CodeStore(projectRoot, { useEmbeddings: true });
  await store.init();
  const counts = await store.indexAll(projectRoot);
  const stats = store.stats();
  store.close();
  return { action, counts, stats };
}

async function reportCodeIndexHealth() {
  try {
    const result = await ensureCodeIndexFresh(PROJECT_ROOT);
    if (result.error) {
      console.log(`[evolve] code RAG: WARN ${result.error}`);
      return;
    }
    const { stats } = result;
    if (!stats) return;
    const resolutionPct = (stats.edgeResolutionRate * 100).toFixed(0);
    if (result.action === 'skip') {
      console.log(`[evolve] code RAG ✓ ${stats.totalFiles} files / ${stats.totalChunks} chunks (fresh)`);
      console.log(`[evolve] code graph ✓ ${stats.totalSymbols} symbols / ${stats.totalEdges} edges (${resolutionPct}% resolved)`);
    } else {
      console.log(`[evolve] code RAG ✓ ${stats.totalFiles} files / ${stats.totalChunks} chunks (rebuilt)`);
      console.log(`[evolve] code graph ✓ ${stats.totalSymbols} symbols / ${stats.totalEdges} edges (${resolutionPct}% resolved)`);
      console.log('[evolve] full index built — subsequent sessions will be near-instant');
    }
  } catch (err) {
    console.log(`[evolve] code index: WARN ${err.message}`);
  }
}

async function main() {
  const stale = await checkStaleArtifacts();
  const overrideStats = await checkOverrideRate();

  const reminders = [];
  if (stale.length > 0) {
    reminders.push(`Discovered: ${stale.length} artifact(s) with last-verified > ${STALE_DAYS} days. Recommend running /evolve-audit + /evolve-strengthen.`);
  }
  if (overrideStats.rate > OVERRIDE_RATE_THRESHOLD && overrideStats.count > 10) {
    reminders.push(`Discovered: override rate ${(overrideStats.rate * 100).toFixed(1)}% over last ${overrideStats.count} entries (threshold ${OVERRIDE_RATE_THRESHOLD * 100}%). Recommend /evolve-audit to investigate.`);
  }

  if (reminders.length > 0) {
    console.log(reminders.join('\n'));
  }

  // Phase D: code index health (last so user sees stale-artifact warnings first)
  await reportCodeIndexHealth();

  // Phase E: prune stale preview-server registry entries
  async function pruneStalePreviewServers() {
    try {
      const { listServers } = await import('./lib/preview-server-manager.mjs');
      await listServers();
    } catch {
      // Non-fatal
    }
  }
  await pruneStalePreviewServers();

  // Phase F: discover MCPs and populate registry
  async function refreshMcpRegistry() {
    try {
      const { discoverMcps } = await import('./lib/mcp-registry.mjs');
      const found = await discoverMcps({});
      if (found.length > 0) {
        console.log(`[evolve] MCPs available ✓ ${found.length} (${found.map(m => m.name).join(', ')})`);
      }
    } catch {
      // Non-fatal — agents fall back to WebFetch/Grep
    }
  }
  await refreshMcpRegistry();

  // Phase G: surface underperforming agents
  async function reportUnderperformers() {
    try {
      const { readInvocations } = await import('./lib/agent-invocation-logger.mjs');
      const { detectUnderperformers } = await import('./lib/underperformer-detector.mjs');
      const all = await readInvocations({ limit: 10000 });
      if (all.length < 10) return;
      const flagged = detectUnderperformers(all);
      if (flagged.length === 0) return;
      console.log(`[evolve] ⚠ ${flagged.length} agent(s) underperforming — recommend /evolve-strengthen:`);
      for (const f of flagged) {
        console.log(`  - ${f.agent_id}: ${f.reason} (${f.value})`);
      }
    } catch {}
  }
  await reportUnderperformers();
}

main().catch(err => { console.error('session-start-check error:', err.message); process.exit(0); });
