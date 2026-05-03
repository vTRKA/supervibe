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

When this agent must clarify with the user, ask **one question per message**. Match the user's language. Use markdown with an adaptive progress indicator, outcome-oriented labels, recommended choice first, and one-line tradeoff per option.

Every question must show the user why it matters and what will happen with the answer:

> **Step N/M:** Should we run the specialist agent now, revise scope first, or stop?
>
> Why: The answer decides whether durable work can claim specialist-agent provenance.
> Decision unlocked: agent invocation plan, artifact write gate, or scope boundary.
> If skipped: stop and keep the current state as a draft unless the user explicitly delegated the decision.
>
> - Run the relevant specialist agent now (recommended) - best provenance and quality; needs host invocation proof before durable claims.
> - Narrow the task scope first - reduces agent work and ambiguity; delays implementation or artifact writes.
> - Stop here - saves the current state and prevents hidden progress or inline agent emulation.
>
> Free-form answer also accepted.

Use \`Step N/M:\` in English. In Russian conversations, localize the visible word "Step" and the recommended marker instead of showing English labels. Recompute \`M\` from the current triage, saved workflow state, skipped stages, and delegated safe decisions; never force the maximum stage count just because the workflow can have that many stages. Do not show bilingual option labels; pick one visible language for the whole question from the user conversation. Do not show internal lifecycle ids as visible labels. Labels must be domain actions grounded in the current task, not generic Option A/B labels or copied template placeholders. Wait for explicit user reply before advancing N. Do NOT bundle Step N+1 into the same message. If a saved \`NEXT_STEP_HANDOFF\` or \`workflowSignal\` exists and the user changes topic, ask whether to continue, skip/delegate safe decisions, pause and switch topic, or stop/archive the current state.

`;

const ANTIPATTERN_LINE = '- `asking-multiple-questions-at-once` - bundling >1 question into one user message. ALWAYS one question with `Step N/M:` or the localized Step marker for the user language.\n';
const ASCII_LOCALIZED_STEP_GUIDANCE = 'Use `Step N/M:` in English. In Russian conversations, localize the visible word "Step" and the recommended marker instead of showing English labels. Recompute `M` from the current triage, saved workflow state, skipped stages, and delegated safe decisions; never force the maximum stage count just because the workflow can have that many stages. Do not show bilingual option labels; pick one visible language for the whole question from the user conversation. Do not show internal lifecycle ids as visible labels. Labels must be domain actions grounded in the current task, not generic Option A/B labels or copied template placeholders. Wait for explicit user reply before advancing N. Do NOT bundle Step N+1 into the same message. If a saved `NEXT_STEP_HANDOFF` or `workflowSignal` exists and the user changes topic, ask whether to continue, skip/delegate safe decisions, pause and switch topic, or stop/archive the current state.';

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
  const refreshed = refreshStaleDisciplineExamples(body);
  if (refreshed.includes('## User dialogue discipline') || refreshed.includes('Шаг N/M')) {
    return { body: refreshed, changed: refreshed !== body };
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

function refreshStaleDisciplineExamples(body) {
  let next = body;
  next = next.replace(
    '> **Step N/M:** <one focused question>',
    '> **Step N/M:** Should we run the specialist agent now, revise scope first, or stop?',
  );
  next = next.replace(
    '> Why: <one sentence explaining the user-visible impact>',
    '> Why: The answer decides whether durable work can claim specialist-agent provenance.',
  );
  next = next.replace(
    '> Decision unlocked: <what artifact, route, scope, or implementation choice this decides>',
    '> Decision unlocked: agent invocation plan, artifact write gate, or scope boundary.',
  );
  next = next.replace(
    '> If skipped: <safe default or stop condition>',
    '> If skipped: stop and keep the current state as a draft unless the user explicitly delegated the decision.',
  );
  next = next.replace(
    '> - <Recommended action> (<recommended marker in the user\'s language>) - <what happens and what tradeoff it carries>',
    '> - Run the relevant specialist agent now (recommended) - best provenance and quality; needs host invocation proof before durable claims.',
  );
  next = next.replace(
    '> - <Second action> - <what happens and what tradeoff it carries>',
    '> - Narrow the task scope first - reduces agent work and ambiguity; delays implementation or artifact writes.',
  );
  next = next.replace(
    '> - <Stop here> - <what is saved and what will not happen>',
    '> - Stop here - saves the current state and prevents hidden progress or inline agent emulation.',
  );
  next = next.replace(
    'Labels must be domain actions, not generic Option A/B labels.',
    'Labels must be domain actions grounded in the current task, not generic Option A/B labels or copied template placeholders.',
  );
  next = next.replace(
    'Use `Step N/M:` when the conversation is in Russian.',
    'Use `Step N/M:` in English. In Russian conversations, localize the visible word "Step" and the recommended marker instead of showing English labels.',
  );
  next = next.replace(/Use `Шаг N\/M:` when the conversation is in Russian\.[^\n]*/g, ASCII_LOCALIZED_STEP_GUIDANCE);
  next = next.replace(
    'ALWAYS one question with `Step N/M:` or `Шаг N/M:` progress label.',
    'ALWAYS one question with `Step N/M:` or the localized Step marker for the user language.',
  );
  return next;
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
