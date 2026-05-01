/**
 * One-shot mass patcher: injects single-question discipline + anti-pattern
 * into every interactive agent in scope. Idempotent.
 *
 * Usage: node scripts/apply-question-discipline.mjs
 */
import { resolveSupervibePluginRoot } from './lib/supervibe-plugin-root.mjs';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import matter from 'gray-matter';
import { isInScope } from './validate-question-discipline.mjs';

const DISCIPLINE_BLOCK = `## User dialogue discipline

When this agent must clarify with the user, ask **one question per message**. Match the user's language. Use markdown with a progress indicator, outcome-oriented labels, recommended choice first, and one-line tradeoff per option:

> **Step N/M:** <one focused question>
>
> - <Recommended action> (<recommended marker in the user's language>) - <what happens and what it costs>
> - <Second action> - <what happens and what it costs>
> - <Stop here> - <what is saved and what will not happen>
>
> Free-form answer also accepted.

Use \`Шаг N/M:\` when the conversation is in Russian. Use \`(recommended)\` in English and \`(рекомендуется)\` in Russian. Do not show internal lifecycle ids as visible labels. Wait for explicit user reply before advancing N. Do NOT bundle Step N+1 into the same message. If only one clarification is needed, still use \`Step 1/1:\` or \`Шаг 1/1:\` for consistency.

`;

const ANTIPATTERN_LINE = '- `asking-multiple-questions-at-once` — bundling >1 question into one user message. ALWAYS one question with `Step N/M:` or `Шаг N/M:` progress label.\n';

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

function injectDiscipline(body) {
  if (body.includes('## User dialogue discipline') || body.includes('Шаг N/M')) {
    return { body, changed: false };
  }
  // Insert before Anti-patterns; fallback before Verification; fallback at end
  let inserted = body;
  let changed = false;
  if (body.includes('\n## Anti-patterns')) {
    inserted = body.replace('\n## Anti-patterns', `\n${DISCIPLINE_BLOCK}## Anti-patterns`);
    changed = true;
  } else if (body.includes('\n## Verification')) {
    inserted = body.replace('\n## Verification', `\n${DISCIPLINE_BLOCK}## Verification`);
    changed = true;
  } else {
    inserted = body.trimEnd() + '\n\n' + DISCIPLINE_BLOCK;
    changed = true;
  }
  return { body: inserted, changed };
}

function injectAntiPattern(body) {
  if (body.includes('asking-multiple-questions-at-once')) {
    return { body, changed: false };
  }
  // Add to existing Anti-patterns section
  if (body.includes('\n## Anti-patterns')) {
    const lines = body.split('\n');
    const idx = lines.findIndex(l => l.startsWith('## Anti-patterns'));
    // find first blank line after section header, then insert after it as first bullet
    let insertAt = idx + 1;
    // Skip a blank/text line then place at the first bullet position
    while (insertAt < lines.length && !lines[insertAt].startsWith('- ') && !lines[insertAt].startsWith('## ')) {
      insertAt++;
    }
    lines.splice(insertAt, 0, ANTIPATTERN_LINE.trimEnd());
    return { body: lines.join('\n'), changed: true };
  }
  // No Anti-patterns section — create minimal one before Verification
  const block = `\n## Anti-patterns\n\n${ANTIPATTERN_LINE}\n`;
  if (body.includes('\n## Verification')) {
    return { body: body.replace('\n## Verification', `${block}## Verification`), changed: true };
  }
  return { body: body.trimEnd() + '\n' + block, changed: true };
}

async function main() {
  const root = resolveSupervibePluginRoot();
  const agentsDir = join(root, 'agents');
  const files = await walk(agentsDir);
  let modified = 0;
  let skipped = 0;

  for (const full of files) {
    const rel = full.slice(root.length + 1);
    if (!isInScope(rel)) { skipped++; continue; }
    const raw = await readFile(full, 'utf8');
    const parsed = matter(raw);
    if (parsed.data?.dialogue === 'noninteractive') { skipped++; continue; }

    let { body, changed: c1 } = injectDiscipline(parsed.content);
    const { body: body2, changed: c2 } = injectAntiPattern(body);
    if (!c1 && !c2) { skipped++; continue; }

    const out = matter.stringify(body2, parsed.data);
    await writeFile(full, out, 'utf8');
    modified++;
    console.log(`  patched: ${rel}`);
  }

  console.log(`\n[apply-question-discipline] modified ${modified} agents, skipped ${skipped}`);
}

const isMainEntry = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}` ||
           fileURLToPath(import.meta.url) === process.argv[1];
  } catch {
    return false;
  }
})();
if (isMainEntry) {
  await main();
}
