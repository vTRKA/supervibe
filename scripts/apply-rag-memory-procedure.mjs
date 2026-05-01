#!/usr/bin/env node
/**
 * One-shot mass patcher: ensures every interactive agent has explicit
 * Step 1 (memory pre-flight) + Step 2 (code search) at the top of its
 * Procedure section.
 *
 * Idempotent: skips agents that already declare these steps.
 *
 * Targets: all interactive agents (per single-question-discipline rule's
 * applies-to globs). Excludes pure-output / read-only agents that don't
 * dispatch downstream work.
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import matter from 'gray-matter';

const APPLIES_TO_GLOBS = [
  /^agents[\\/]_design[\\/]/,
  /^agents[\\/]_product[\\/]/,
  /^agents[\\/]_meta[\\/]supervibe-orchestrator\.md$/,
  /^agents[\\/]_core[\\/]repo-researcher\.md$/,
  /^agents[\\/]_core[\\/]root-cause-debugger\.md$/,
  /^agents[\\/]_core[\\/]refactoring-specialist\.md$/,
  /^agents[\\/]_core[\\/]architect-reviewer\.md$/,
  /^agents[\\/]_core[\\/]code-reviewer\.md$/,
  /^agents[\\/]_core[\\/]auth-architect\.md$/,
  /^agents[\\/]_ops[\\/]/,
  /^agents[\\/]stacks[\\/]/,
];

const STEP_BLOCK = `## RAG + Memory pre-flight (MANDATORY before any non-trivial work)

Before producing any artifact or making any structural recommendation:

**Step 1: Memory pre-flight.** Run \`supervibe:project-memory --query "<topic>"\` (or via \`node $CLAUDE_PLUGIN_ROOT/scripts/lib/memory-preflight.mjs --query "<topic>"\`). If matches found, cite them in your output ("prior work: <path>") OR explicitly state why they don't apply. Avoids re-deriving prior decisions.

**Step 2: Code search.** Run \`supervibe:code-search\` (or \`node $CLAUDE_PLUGIN_ROOT/scripts/search-code.mjs --query "<concept>"\`) to find existing patterns/implementations in the codebase. Read top-3 results before writing new code. Mention what was found.

**Step 3 (refactor only): Code graph.** BEFORE rename / extract / move / inline / delete on a public symbol, ALWAYS run \`node $CLAUDE_PLUGIN_ROOT/scripts/search-code.mjs --callers "<symbol>"\` first. Cite Case A (callers found, listed) / Case B (zero callers verified) / Case C (N/A with reason) in your output. Skipping this on structural changes FAILS the agent-delivery rubric.

**Step 4: Evidence ledger.** For tasks where the retrieval policy marks memory, RAG or codegraph as mandatory, record cited memory IDs, RAG chunk IDs, graph symbols, verification commands and redaction status in the evidence ledger. Missing mandatory evidence fails the agent-delivery gate.

`;

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

function isInScope(rel) {
  return APPLIES_TO_GLOBS.some(re => re.test(rel) || re.test(rel.replace(/\\/g, '/')) || re.test(rel.replace(/\//g, '\\')));
}

function injectRagBlock(body) {
  if (body.includes('## RAG + Memory pre-flight')) {
    return { body, changed: false };
  }
  if (/Step 1:.*Memory pre-flight/i.test(body) && /Step 2:.*Code search/i.test(body)) {
    return { body, changed: false };
  }

  // Insert before ## Procedure (the agent's actual procedure)
  if (body.includes('\n## Procedure')) {
    const replaced = body.replace('\n## Procedure', `\n${STEP_BLOCK}## Procedure`);
    return { body: replaced, changed: true };
  }
  // Fallback: before Output contract
  if (body.includes('\n## Output contract')) {
    const replaced = body.replace('\n## Output contract', `\n${STEP_BLOCK}## Output contract`);
    return { body: replaced, changed: true };
  }
  // Last resort: before Anti-patterns
  if (body.includes('\n## Anti-patterns')) {
    const replaced = body.replace('\n## Anti-patterns', `\n${STEP_BLOCK}## Anti-patterns`);
    return { body: replaced, changed: true };
  }
  return { body, changed: false };
}

async function main() {
  const root = process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
  const dryRun = process.argv.includes('--dry-run');
  const agentsDir = join(root, 'agents');
  const files = await walk(agentsDir);
  let modified = 0;
  let skipped = 0;
  let outOfScope = 0;

  for (const full of files) {
    const rel = full.slice(root.length + 1);
    if (!isInScope(rel)) { outOfScope++; continue; }
    const raw = await readFile(full, 'utf8');
    const parsed = matter(raw);
    if (parsed.data?.dialogue === 'noninteractive') { skipped++; continue; }

    const { body, changed } = injectRagBlock(parsed.content);
    if (!changed) { skipped++; continue; }

    if (!dryRun) {
      const out = matter.stringify(body, parsed.data);
      await writeFile(full, out, 'utf8');
    }
    modified++;
    console.log(`[${dryRun ? 'would-patch' : 'patched'}] ${rel}`);
  }

  console.log(`\n[apply-rag-memory-procedure] ${dryRun ? 'WOULD modify' : 'modified'} ${modified} agents; skipped ${skipped} (already compliant); ${outOfScope} out-of-scope`);
}

const isMainEntry = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}` ||
           fileURLToPath(import.meta.url) === process.argv[1];
  } catch { return false; }
})();
if (isMainEntry) await main();
