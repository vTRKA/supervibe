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
}

main().catch(err => { console.error('session-start-check error:', err.message); process.exit(0); });
