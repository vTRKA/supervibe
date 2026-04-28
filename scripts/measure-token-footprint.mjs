#!/usr/bin/env node
/**
 * Measure plugin token footprint vs Anthropic + community budgets.
 *
 * Approximation:
 * - 1 token ≈ 4 chars for English/code
 * - 1 token ≈ 2.5 chars for Cyrillic
 *
 * Budgets:
 * - CLAUDE.md: <5,000 chars / <1,250 tokens (Anthropic concise-is-key)
 * - Skill SKILL.md body: <500 lines / <5,000 tokens (Anthropic hard limit)
 * - Skill description: <1,024 chars (Anthropic hard limit)
 * - Agent file: <500 lines / <8,000 tokens (softer — agents have richer persona)
 */
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import matter from 'gray-matter';

const BUDGETS = {
  claudeMd: { maxChars: 5_000, maxTokens: 1_250 },
  skillBody: { maxLines: 500, maxTokens: 5_000 },
  skillDescription: { maxChars: 1_024 },
  agentBody: { maxLines: 500, maxTokens: 8_000 },
};

export function approxTokens(text) {
  const cyrillicChars = (text.match(/[Ѐ-ӿ]/g) || []).length;
  const otherChars = text.length - cyrillicChars;
  return Math.round(cyrillicChars / 2.5 + otherChars / 4);
}

async function walk(dir) {
  const out = [];
  try {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...await walk(full));
      else if (entry.name.endsWith('.md')) out.push(full);
    }
  } catch {}
  return out;
}

export async function measureFootprint(root) {
  const violations = [];
  const stats = { claudeMd: {}, skills: { count: 0, totalTokens: 0, oversized: [] }, agents: { count: 0, totalTokens: 0, oversized: [] } };

  // CLAUDE.md
  try {
    const claude = await readFile(join(root, 'CLAUDE.md'), 'utf8');
    stats.claudeMd = { chars: claude.length, tokens: approxTokens(claude), lines: claude.split('\n').length };
    if (claude.length > BUDGETS.claudeMd.maxChars) {
      violations.push({ kind: 'claudeMd-oversized', actual: claude.length, budget: BUDGETS.claudeMd.maxChars });
    }
  } catch {}

  // Skills
  const skillFiles = (await walk(join(root, 'skills'))).filter(f => f.endsWith('SKILL.md'));
  stats.skills.count = skillFiles.length;
  for (const path of skillFiles) {
    const raw = await readFile(path, 'utf8');
    const lines = raw.split('\n').length;
    const tokens = approxTokens(raw);
    stats.skills.totalTokens += tokens;
    if (lines > BUDGETS.skillBody.maxLines || tokens > BUDGETS.skillBody.maxTokens) {
      stats.skills.oversized.push({ path: path.slice(root.length + 1), lines, tokens });
      violations.push({ kind: 'skill-oversized', path: path.slice(root.length + 1), lines, tokens });
    }
    const fm = matter(raw).data;
    if (fm.description && fm.description.length > BUDGETS.skillDescription.maxChars) {
      violations.push({ kind: 'skill-description-oversized', path: path.slice(root.length + 1), chars: fm.description.length });
    }
  }

  // Agents
  const agentFiles = await walk(join(root, 'agents'));
  stats.agents.count = agentFiles.length;
  for (const path of agentFiles) {
    const raw = await readFile(path, 'utf8');
    const lines = raw.split('\n').length;
    const tokens = approxTokens(raw);
    stats.agents.totalTokens += tokens;
    if (lines > BUDGETS.agentBody.maxLines || tokens > BUDGETS.agentBody.maxTokens) {
      stats.agents.oversized.push({ path: path.slice(root.length + 1), lines, tokens });
      violations.push({ kind: 'agent-oversized', path: path.slice(root.length + 1), lines, tokens });
    }
  }

  return { stats, violations };
}

async function main() {
  const root = process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
  const { stats, violations } = await measureFootprint(root);

  console.log('=== Token footprint ===');
  console.log(`CLAUDE.md:        ${stats.claudeMd.chars} chars / ~${stats.claudeMd.tokens} tokens / ${stats.claudeMd.lines} lines  (budget ${BUDGETS.claudeMd.maxChars} chars)`);
  console.log(`Skills:           ${stats.skills.count} files / ~${stats.skills.totalTokens} tokens total`);
  if (stats.skills.oversized.length) {
    console.log(`  Oversized (>500 lines OR >5K tokens):`);
    for (const o of stats.skills.oversized) console.log(`    • ${o.path}: ${o.lines} lines / ~${o.tokens} tokens`);
  }
  console.log(`Agents:           ${stats.agents.count} files / ~${stats.agents.totalTokens} tokens total`);
  if (stats.agents.oversized.length) {
    console.log(`  Oversized (>500 lines OR >8K tokens):`);
    for (const o of stats.agents.oversized) console.log(`    • ${o.path}: ${o.lines} lines / ~${o.tokens} tokens`);
  }

  if (violations.length > 0) {
    console.error(`\n[!] ${violations.length} budget violation(s) — advisory only, not blocking`);
    if (process.argv.includes('--strict')) process.exit(1);
  } else {
    console.log('\n[OK] All within budget');
  }
}

const isMainEntry = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}` ||
           fileURLToPath(import.meta.url) === process.argv[1];
  } catch { return false; }
})();
if (isMainEntry) await main();
