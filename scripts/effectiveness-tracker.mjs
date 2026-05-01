#!/usr/bin/env node
// Aggregate agent invocations from JSONL log → update each agent's frontmatter
// `effectiveness` block (iterations, last-task, last-outcome, avg-confidence).

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import matter from 'gray-matter';
import { readInvocations } from './lib/agent-invocation-logger.mjs';

const PROJECT_ROOT = process.cwd();
const AGENT_DIRS = [
  'agents/_core', 'agents/_meta', 'agents/_design',
  'agents/_ops', 'agents/_product',
];

async function findStackAgentFiles() {
  const stacksDir = join(PROJECT_ROOT, 'agents', 'stacks');
  const result = [];
  try {
    const stacks = await readdir(stacksDir);
    for (const s of stacks) {
      try {
        const files = await readdir(join(stacksDir, s));
        for (const f of files.filter(f => f.endsWith('.md'))) {
          result.push(join('agents', 'stacks', s, f));
        }
      } catch {}
    }
  } catch {}
  return result;
}

async function findAllAgentFiles() {
  const result = [];
  for (const dir of AGENT_DIRS) {
    try {
      const files = await readdir(join(PROJECT_ROOT, dir));
      for (const f of files.filter(f => f.endsWith('.md'))) {
        result.push(join(dir, f));
      }
    } catch {}
  }
  result.push(...await findStackAgentFiles());
  return result;
}

export function aggregateForAgent(invocations) {
  if (invocations.length === 0) return null;
  const sorted = invocations.slice().sort((a, b) => new Date(a.ts) - new Date(b.ts));
  const last = sorted[sorted.length - 1];
  const total = sorted.length;
  const avgConf = sorted.reduce((s, e) => s + (e.confidence_score || 0), 0) / total;
  const overrideCount = sorted.filter(e => e.override === true).length;
  const evidenceFailures = sorted.filter(e => e.evidence_gate && e.evidence_gate.pass === false).length;
  const feedbackCorrections = sorted.filter(e => e.user_feedback && /correction|missed|wrong|skip|fix/i.test(e.user_feedback)).length;
  return {
    iterations: total,
    'last-task': last.task_summary?.slice(0, 100) || null,
    'last-outcome': last.user_feedback || (last.confidence_score >= 9 ? 'accept' : 'review'),
    'last-applied': last.ts,
    'avg-confidence': Number(avgConf.toFixed(2)),
    'override-rate': total > 0 ? Number((overrideCount / total).toFixed(3)) : 0,
    'evidence-failure-rate': total > 0 ? Number((evidenceFailures / total).toFixed(3)) : 0,
    'feedback-correction-rate': total > 0 ? Number((feedbackCorrections / total).toFixed(3)) : 0,
  };
}

async function updateAgentFrontmatter(agentFile, effectiveness) {
  const fullPath = join(PROJECT_ROOT, agentFile);
  const content = await readFile(fullPath, 'utf8');
  const parsed = matter(content);
  parsed.data.effectiveness = effectiveness;
  const out = matter.stringify(parsed.content, parsed.data);
  await writeFile(fullPath, out);
}

async function main() {
  const allInvocations = await readInvocations({ limit: 100000 });
  const byAgent = {};
  for (const inv of allInvocations) {
    if (!byAgent[inv.agent_id]) byAgent[inv.agent_id] = [];
    byAgent[inv.agent_id].push(inv);
  }

  const agentFiles = await findAllAgentFiles();
  let updated = 0;
  for (const file of agentFiles) {
    const agentName = file.split(/[\\/]/).pop().replace('.md', '');
    const invocs = byAgent[agentName];
    if (!invocs || invocs.length === 0) continue;
    const eff = aggregateForAgent(invocs);
    if (!eff) continue;
    try {
      await updateAgentFrontmatter(file, eff);
      updated++;
    } catch (err) {
      console.warn(`Failed to update ${file}: ${err.message}`);
    }
  }
  console.log(`[supervibe/effectiveness] updated ${updated} agent files from ${allInvocations.length} invocations`);
}

const isMain = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`;
if (isMain) {
  main().catch(err => { console.error(err); process.exit(1); });
}
