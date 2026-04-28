#!/usr/bin/env node
// Comprehensive index health report (code RAG + graph + memory + grammars + watcher).
// User-facing transparency — confirms indexes are working at any moment.

import { CodeStore } from './lib/code-store.mjs';
import { MemoryStore } from './lib/memory-store.mjs';
import { getBrokenLanguages } from './lib/grammar-loader.mjs';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { listServers as listPreviewServers } from './lib/preview-server-manager.mjs';
import { getRegistry as getMcpRegistry } from './lib/mcp-registry.mjs';

const PROJECT_ROOT = process.cwd();
const noColor = process.argv.includes('--no-color') || !process.stdout.isTTY;

function color(s, c) {
  if (noColor) return s;
  const codes = { red: 31, green: 32, yellow: 33, cyan: 36, dim: 90 };
  return `\x1b[${codes[c] || 0}m${s}\x1b[0m`;
}

function ageStr(ms) {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

async function main() {
  console.log(color('Supervibe Index Status', 'cyan'));
  console.log(color('===================', 'dim'));
  console.log(`Project root: ${PROJECT_ROOT}\n`);

  // Code RAG + Graph
  const codeDbPath = join(PROJECT_ROOT, '.claude', 'memory', 'code.db');
  if (!existsSync(codeDbPath)) {
    console.log(color('✗ Code RAG + Graph: NOT INITIALIZED', 'red'));
    console.log(color('  Run: npm run code:index', 'dim'));
  } else {
    const store = new CodeStore(PROJECT_ROOT, { useEmbeddings: false });
    await store.init();
    const s = store.stats();
    const health = store.getGrammarHealth();
    store.close();

    const dbAge = Date.now() - statSync(codeDbPath).mtimeMs;
    console.log(color(`✓ Code RAG: ${s.totalFiles} files, ${s.totalChunks} chunks`, 'green'));
    console.log(color(`✓ Code Graph: ${s.totalSymbols} symbols, ${s.totalEdges} edges (${(s.edgeResolutionRate * 100).toFixed(0)}% cross-resolved)`, 'green'));
    console.log(color(`  Last update: ${ageStr(dbAge)}`, 'dim'));
    if (s.byLang.length > 0) {
      const langs = s.byLang.slice(0, 5).map(l => `${l.language}(${l.n})`).join(' ');
      console.log(color(`  Languages: ${langs}`, 'dim'));
    }

    // Grammar health
    const broken = health.filter(h => !h.healthy);
    if (broken.length > 0) {
      console.log(color(`✗ Grammar queries broken for: ${broken.map(b => b.language).join(', ')}`, 'red'));
      console.log(color('  Files indexed but no symbols extracted — check grammars/queries/<lang>.scm', 'dim'));
    } else if (health.length > 0) {
      console.log(color(`✓ All ${health.length} active language(s) extracting symbols`, 'green'));
    }
    const lowCoverage = health.filter(h => h.coverage < 0.5 && h.files > 5);
    for (const lc of lowCoverage) {
      console.log(color(`  ⚠  ${lc.language}: only ${(lc.coverage*100).toFixed(0)}% files have extracted symbols`, 'yellow'));
    }

    // Grammar runtime status (LFS pointers)
    const brokenState = getBrokenLanguages();
    if (brokenState.pointers.length > 0) {
      console.log(color(`⚠  Grammars are LFS pointers (need 'git lfs pull'): ${brokenState.pointers.join(', ')}`, 'yellow'));
      console.log(color(`   Affected languages will skip graph extraction (semantic RAG still works)`, 'dim'));
    }
  }

  console.log();

  // Memory
  const memDbPath = join(PROJECT_ROOT, '.claude', 'memory', 'memory.db');
  if (!existsSync(memDbPath)) {
    console.log(color('○ Memory: not yet built (no entries indexed)', 'yellow'));
  } else {
    const mem = new MemoryStore(PROJECT_ROOT, { useEmbeddings: false });
    await mem.init();
    const ms = mem.stats();
    mem.close();
    const memAge = Date.now() - statSync(memDbPath).mtimeMs;
    console.log(color(`✓ Memory: ${ms.totalEntries} entries, ${ms.uniqueTags} tags`, 'green'));
    console.log(color(`  Last update: ${ageStr(memAge)}`, 'dim'));
  }

  console.log();

  // Watcher status (heartbeat-based)
  const heartbeatPath = join(PROJECT_ROOT, '.claude', 'memory', '.watcher-heartbeat');
  if (existsSync(heartbeatPath)) {
    let ts;
    try { ts = parseInt(readFileSync(heartbeatPath, 'utf8'), 10); } catch { ts = 0; }
    const age = Date.now() - ts;
    if (age < 15000) {
      console.log(color(`✓ File watcher: running (heartbeat ${ageStr(age)})`, 'green'));
    } else {
      console.log(color(`⚠  File watcher: stale heartbeat (${ageStr(age)}); may have crashed`, 'yellow'));
      console.log(color('   Run `npm run memory:watch` to restart', 'dim'));
    }
  } else {
    console.log(color('○ File watcher: not running. Run `npm run memory:watch` for auto-reindex', 'dim'));
  }

  // Preview servers
  const previews = await listPreviewServers();
  console.log();
  if (previews.length === 0) {
    console.log(color('○ Preview servers: none running', 'dim'));
  } else {
    console.log(color(`✓ Preview servers: ${previews.length} running`, 'green'));
    for (const p of previews) {
      const url = `http://localhost:${p.port}`;
      const ago = ((Date.now() - new Date(p.startedAt).getTime()) / 1000 / 60).toFixed(1);
      console.log(color(`  ${url}  ${p.label}  (pid=${p.pid}, ${ago}m ago)`, 'dim'));
    }
  }

  // MCP registry
  console.log();
  const mcpReg = await getMcpRegistry({ refresh: false });
  if (mcpReg.mcps.length === 0) {
    console.log(color('○ MCPs: none registered (run `node scripts/discover-mcps.mjs` to scan)', 'dim'));
  } else {
    console.log(color(`✓ MCPs: ${mcpReg.mcps.length} available`, 'green'));
    for (const m of mcpReg.mcps) {
      console.log(color(`  ${m.name}  (${m.tools.length} tools)`, 'dim'));
    }
  }

  // Agent telemetry
  console.log();
  const { readInvocations } = await import('./lib/agent-invocation-logger.mjs');
  const { detectUnderperformers } = await import('./lib/underperformer-detector.mjs');
  const allInv = await readInvocations({ limit: 10000 });
  if (allInv.length < 10) {
    console.log(color(`○ Agent telemetry: ${allInv.length} invocations logged (need ≥10 for analysis)`, 'dim'));
  } else {
    const flagged = detectUnderperformers(allInv);
    if (flagged.length === 0) {
      console.log(color(`✓ Agent telemetry: ${allInv.length} invocations, no underperformers`, 'green'));
    } else {
      console.log(color(`⚠ Agent telemetry: ${flagged.length} underperformers detected (run /supervibe-strengthen)`, 'yellow'));
      for (const f of flagged) {
        console.log(color(`  - ${f.agent_id}: ${f.reason} (${f.value})`, 'dim'));
      }
    }
  }
}

main().catch(err => { console.error('supervibe-status error:', err); process.exit(1); });
