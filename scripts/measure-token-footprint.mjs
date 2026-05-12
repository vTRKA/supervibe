#!/usr/bin/env node
/**
 * Measure plugin token footprint vs Anthropic + community budgets.
 *
 * Approximation:
 * - 1 token ≈ 4 chars for English/code
 * - 1 token ≈ 2.5 chars for Cyrillic
 *
 * Budgets:
 * - Host instruction files: <5,000 chars / <1,250 tokens each
 * - Skill SKILL.md body: <500 lines / <5,000 tokens (Anthropic hard limit)
 * - Skill description: <1,024 chars (Anthropic hard limit)
 * - Agent file: <500 lines / <8,000 tokens (softer — agents have richer persona)
 */
import { resolveSupervibePluginRoot } from './lib/supervibe-plugin-root.mjs';
import { getHostAdapterMatrix } from './lib/supervibe-host-adapters.mjs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, isAbsolute, join, relative } from 'node:path';
import matter from 'gray-matter';

const BUDGETS = {
  hostInstruction: { maxChars: 5_000, maxTokens: 1_250 },
  skillBody: { maxLines: 500, maxTokens: 5_000 },
  skillDescription: { maxChars: 1_024 },
  agentBody: { maxLines: 500, maxTokens: 8_000 },
  perAgentContext: { maxTokens: 8_000 },
};
const PROMPT_SLICING_POLICY = Object.freeze([
  'task-contract',
  'current-work-item',
  'direct-dependencies',
  'retrieval-evidence',
  'write-scope-contracts',
  'recent-blockers',
  'omitted-context-summary',
]);

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

export async function measureFootprint(root, options = {}) {
  const violations = [];
  const stats = {
    hostInstructions: [],
    skills: { count: 0, totalTokens: 0, oversized: [] },
    agents: { count: 0, totalTokens: 0, oversized: [] },
  };

  // Host instruction files
  const hostInstructionFiles = [...new Set(getHostAdapterMatrix().flatMap((adapter) => adapter.instructionFiles))];
  for (const file of hostInstructionFiles) {
    try {
      const content = await readFile(join(root, file), 'utf8');
      const entry = {
        path: file,
        chars: content.length,
        tokens: approxTokens(content),
        lines: content.split('\n').length,
      };
      stats.hostInstructions.push(entry);
      if (content.length > BUDGETS.hostInstruction.maxChars) {
        violations.push({
          kind: 'host-instruction-oversized',
          path: file,
          actual: content.length,
          budget: BUDGETS.hostInstruction.maxChars,
        });
      }
    } catch {
      // host file may not exist in this checkout
    }
  }

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

  const repairs = violations.map((violation) => tokenRepairForViolation(violation)).filter(Boolean);
  const blockingViolations = options.strict
    ? violations.filter((violation) => !tokenRepairForViolation(violation))
    : [];
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    strict: Boolean(options.strict),
    pass: blockingViolations.length === 0,
    budgets: BUDGETS,
    promptSlicingPolicy: PROMPT_SLICING_POLICY,
    perAgentContextBudget: BUDGETS.perAgentContext.maxTokens,
    stats,
    violations,
    repairs,
    blockingViolations,
    workflowRunId: options.workflowRunId || null,
  };
}

async function main() {
  const root = resolveSupervibePluginRoot();
  const { stats, violations } = await measureFootprint(root);

  console.log('=== Token footprint ===');
  if (stats.hostInstructions.length) {
    for (const item of stats.hostInstructions) {
      console.log(`${item.path.padEnd(17)} ${item.chars} chars / ~${item.tokens} tokens / ${item.lines} lines  (budget ${BUDGETS.hostInstruction.maxChars} chars)`);
    }
  } else {
    console.log(`Host instructions: none found`);
  }
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

async function mainStrictAware() {
  const root = resolveSupervibePluginRoot();
  const args = parseArgs(process.argv.slice(2));
  const report = await measureFootprint(root, {
    strict: args.strict,
    workflowRunId: args['workflow-run'] || args.run || null,
  });
  const { stats, violations, repairs, blockingViolations } = report;

  console.log('SUPERVIBE_TOKEN_FOOTPRINT');
  console.log(`STRICT: ${Boolean(args.strict)}`);
  console.log(`PASS: ${report.pass}`);
  console.log(`PER_AGENT_CONTEXT_BUDGET: ${report.perAgentContextBudget}`);
  console.log(`PROMPT_SLICING_POLICY: ${report.promptSlicingPolicy.join(' > ')}`);
  console.log('=== Token footprint ===');
  if (stats.hostInstructions.length) {
    for (const item of stats.hostInstructions) {
      console.log(`${item.path.padEnd(17)} ${item.chars} chars / ~${item.tokens} tokens / ${item.lines} lines  (budget ${BUDGETS.hostInstruction.maxChars} chars)`);
    }
  } else {
    console.log('Host instructions: none found');
  }
  console.log(`Skills:           ${stats.skills.count} files / ~${stats.skills.totalTokens} tokens total`);
  if (stats.skills.oversized.length) {
    console.log('  Oversized (>500 lines OR >5K tokens):');
    for (const o of stats.skills.oversized) console.log(`    * ${o.path}: ${o.lines} lines / ~${o.tokens} tokens`);
  }
  console.log(`Agents:           ${stats.agents.count} files / ~${stats.agents.totalTokens} tokens total`);
  if (stats.agents.oversized.length) {
    console.log('  Oversized (>500 lines OR >8K tokens):');
    for (const o of stats.agents.oversized) console.log(`    * ${o.path}: ${o.lines} lines / ~${o.tokens} tokens`);
  }

  console.log(`TOKEN_VIOLATIONS: ${violations.length}`);
  console.log(`PLANNED_REPAIRS: ${repairs.length}`);
  console.log(`BLOCKING_VIOLATIONS: ${blockingViolations.length}`);
  if (repairs.length > 0) {
    console.log('TOKEN_REPAIR_PLAN:');
    for (const repair of repairs.slice(0, 20)) {
      console.log(`  - ${repair.path}: ${repair.strategy}`);
    }
  }
  if (args.out) {
    const outPath = isAbsolute(args.out) ? args.out : join(root, args.out);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify({
      ...report,
      reportPath: relative(root, outPath).replace(/\\/g, '/'),
    }, null, 2)}\n`, 'utf8');
    console.log(`REPORT: ${relative(root, outPath).replace(/\\/g, '/')}`);
  }

  if (violations.length > 0) {
    console.log(`\n[!] ${violations.length} budget violation(s); ${blockingViolations.length} blocking, ${repairs.length} planned repair(s)`);
    if (args.strict && blockingViolations.length > 0) process.exit(1);
  } else {
    console.log('\n[OK] All within budget');
  }
}

function tokenRepairForViolation(violation = {}) {
  const path = violation.path || 'unknown';
  if (violation.kind === 'host-instruction-oversized') {
    return {
      kind: violation.kind,
      path,
      strategy: 'keep host root concise and move detailed workflow guidance to docs/supervibe-workflow-hardening.md',
    };
  }
  if (violation.kind === 'skill-oversized') {
    return {
      kind: violation.kind,
      path,
      strategy: 'split long skill references into referenced docs/assets and keep SKILL.md as workflow contract',
    };
  }
  if (violation.kind === 'skill-description-oversized') {
    return {
      kind: violation.kind,
      path,
      strategy: 'shorten frontmatter description below provider limit',
    };
  }
  if (violation.kind === 'agent-oversized') {
    return {
      kind: violation.kind,
      path,
      strategy: `apply per-agent context budget ${BUDGETS.perAgentContext.maxTokens} and slice prompts by relevance before handoff`,
    };
  }
  return null;
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--strict') parsed.strict = true;
    else if (arg.startsWith('--')) {
      const key = arg.replace(/^--/, '');
      if (key.includes('=')) {
        const [name, value] = key.split(/=(.*)/s);
        parsed[name] = value;
      } else {
        parsed[key] = argv[i + 1]?.startsWith('--') ? true : argv[++i];
      }
    }
  }
  return parsed;
}

const isMainEntry = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}` ||
           fileURLToPath(import.meta.url) === process.argv[1];
  } catch { return false; }
})();
if (isMainEntry) await mainStrictAware();
