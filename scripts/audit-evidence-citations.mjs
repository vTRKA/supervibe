#!/usr/bin/env node
/**
 * Advisory audit of recent agent invocations: are agents actually using memory,
 * code-search, and code-graph? Per .supervibe/memory/agent-invocations.jsonl.
 *
 * Reports per-agent metrics:
 * - memory-usage rate (% of invocations that referenced memory)
 * - code-search rate
 * - code-graph rate
 * - flags agents below thresholds
 *
 * Defaults (advisory; tunable via flags):
 * - memory-usage rate: warn if < 30% over last 10 invocations
 * - code-search rate: warn if < 50% (most non-trivial work needs it)
 * - code-graph rate: warn for refactoring-type agents only
 *
 * Run:
 *   node scripts/audit-evidence-citations.mjs
 *   node scripts/audit-evidence-citations.mjs --window 20 --memory-min 0.4
 */
import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { auditEvidenceLedger, formatEvidenceLedgerStatus } from './lib/supervibe-evidence-ledger.mjs';

const REFACTOR_AGENTS = new Set([
  'refactoring-specialist',
  'architect-reviewer',
  'code-reviewer',
]);

const NON_INTERACTIVE_OR_DESIGN_AGENTS = new Set([
  // Read-only research / design agents — RAG less critical
  'creative-director',
  'ux-ui-designer',
  'prototype-builder',
  'ui-polish-reviewer',
  'accessibility-reviewer',
  'copywriter',
  'extension-ui-designer',
  'electron-ui-designer',
  'tauri-ui-designer',
  'mobile-ui-designer',
]);

export function aggregateUsage(entries, windowSize) {
  const byAgent = new Map();
  for (const entry of entries) {
    const id = entry.agent_id;
    if (!id) continue;
    if (!byAgent.has(id)) byAgent.set(id, []);
    byAgent.get(id).push(entry);
  }

  const result = [];
  for (const [agent_id, items] of byAgent) {
    const recent = items.slice(-windowSize);
    if (recent.length === 0) continue;
    const usage = { memory: 0, 'code-search': 0, 'code-graph': 0 };
    let withTelemetry = 0;
    for (const e of recent) {
      if (!e.subtool_usage) continue;
      withTelemetry++;
      if (e.subtool_usage.memory > 0) usage.memory++;
      if (e.subtool_usage['code-search'] > 0) usage['code-search']++;
      if (e.subtool_usage['code-graph'] > 0) usage['code-graph']++;
    }
    if (withTelemetry === 0) continue;
    result.push({
      agent_id,
      sample: withTelemetry,
      memoryRate: usage.memory / withTelemetry,
      codeSearchRate: usage['code-search'] / withTelemetry,
      codeGraphRate: usage['code-graph'] / withTelemetry,
    });
  }
  return result;
}

export function detectViolations(usage, opts = {}) {
  const memoryMin = opts.memoryMin ?? 0.30;
  const codeSearchMin = opts.codeSearchMin ?? 0.50;
  const codeGraphMin = opts.codeGraphMin ?? 0.70;
  const minSample = opts.minSample ?? 5;

  const violations = [];
  for (const u of usage) {
    if (u.sample < minSample) continue;
    const isDesign = NON_INTERACTIVE_OR_DESIGN_AGENTS.has(u.agent_id);
    const isRefactor = REFACTOR_AGENTS.has(u.agent_id);

    if (!isDesign && u.memoryRate < memoryMin) {
      violations.push({
        agent_id: u.agent_id,
        kind: 'low-memory-usage',
        rate: u.memoryRate,
        threshold: memoryMin,
        sample: u.sample,
      });
    }
    if (!isDesign && u.codeSearchRate < codeSearchMin) {
      violations.push({
        agent_id: u.agent_id,
        kind: 'low-code-search-usage',
        rate: u.codeSearchRate,
        threshold: codeSearchMin,
        sample: u.sample,
      });
    }
    if (isRefactor && u.codeGraphRate < codeGraphMin) {
      violations.push({
        agent_id: u.agent_id,
        kind: 'refactor-without-graph',
        rate: u.codeGraphRate,
        threshold: codeGraphMin,
        sample: u.sample,
      });
    }
  }
  return violations;
}

async function main() {
  const args = process.argv.slice(2);
  const windowIdx = args.indexOf('--window');
  const window = windowIdx >= 0 ? parseInt(args[windowIdx + 1], 10) : 10;
  const strict = args.includes('--strict');
  const maxAgeIdx = args.indexOf('--max-age-hours');
  const maxAgeHours = maxAgeIdx >= 0 ? parseInt(args[maxAgeIdx + 1], 10) : (strict ? 48 : 0);

  const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const logPath = join(projectRoot, '.supervibe', 'memory', 'agent-invocations.jsonl');
  const ledgerReport = await auditEvidenceLedger({ rootDir: projectRoot });

  try {
    await access(logPath);
  } catch {
    console.log(`[audit-evidence-citations] No invocation log at ${logPath} — telemetry not yet running.`);
    console.log(formatEvidenceLedgerStatus(ledgerReport));
    if (strict && !ledgerReport.pass) process.exit(1);
    return;
  }

  const raw = await readFile(logPath, 'utf8');
  const entries = raw.split('\n').filter(Boolean).map(l => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);

  const freshEntries = maxAgeHours > 0
    ? entries.filter((entry) => {
      const ts = Date.parse(entry.ts || entry.timestamp || "");
      return Number.isFinite(ts) && Date.now() - ts <= maxAgeHours * 60 * 60 * 1000;
    })
    : entries;

  const usage = aggregateUsage(freshEntries, window);
  const violations = detectViolations(usage);

  console.log(`=== Evidence-citation audit (last ${window} invocations per agent) ===\n`);
  console.log(formatEvidenceLedgerStatus(ledgerReport));
  console.log("");
  if (usage.length === 0) {
    console.log(maxAgeHours > 0
      ? `No fresh agents with sub-tool telemetry in the last ${maxAgeHours}h. (Older fixture telemetry ignored for strict release gate.)`
      : 'No agents with sub-tool telemetry yet. (Telemetry ships with PostToolUse hook updates.)');
    if (strict && !ledgerReport.pass) process.exit(1);
    return;
  }

  for (const u of usage.sort((a, b) => a.memoryRate - b.memoryRate)) {
    const flag = violations.some(v => v.agent_id === u.agent_id) ? '⚠' : '✓';
    console.log(`${flag} ${u.agent_id.padEnd(35)}  mem ${(u.memoryRate * 100).toFixed(0).padStart(3)}%  search ${(u.codeSearchRate * 100).toFixed(0).padStart(3)}%  graph ${(u.codeGraphRate * 100).toFixed(0).padStart(3)}%  (${u.sample} samples)`);
  }

  if (violations.length > 0 || !ledgerReport.pass) {
    console.log(`\n${violations.length} advisory warning(s):`);
    for (const v of violations) {
      console.log(`  • ${v.agent_id}: ${v.kind} — ${(v.rate * 100).toFixed(0)}% (threshold ${(v.threshold * 100).toFixed(0)}%, ${v.sample} samples)`);
    }
    console.log('\nFix: run /supervibe-strengthen <agent_id> to add explicit "Step 1: supervibe:project-memory" / "Step 2: supervibe:code-search" entries to the agent\'s Procedure.');
    if (strict) process.exit(1);
  } else {
    console.log('\n[OK] All agents within evidence-citation thresholds.');
  }
}

const isMainEntry = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}` ||
           fileURLToPath(import.meta.url) === process.argv[1];
  } catch { return false; }
})();
if (isMainEntry) await main();
