#!/usr/bin/env node
/**
 * Compact bilingual descriptions: drop redundant "RU: <translation of EN>" block
 * while preserving ALL trigger phrases (RU + EN).
 *
 * Scope: agent, command, skill, and rule markdown frontmatter descriptions.
 *
 * Anthropic best practices: descriptions hit Claude every message. RU translation
 * of EN intent is redundant — Claude understands English natively. Trigger phrases
 * (the actual routing layer) are preserved.
 */
import { resolveSupervibePluginRoot } from './lib/supervibe-plugin-root.mjs';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import matter from 'gray-matter';

/**
 * Transform: drop `RU: <text>.` block but preserve trigger phrases.
 * Heuristic: find "RU:" followed by translation, drop until "Trigger phrases:"
 * or "Триггеры:" or end of sentence.
 */
export function compactBilingual(description) {
  if (!description || typeof description !== 'string') return description;

  // Pattern: "RU: <text>" until next sentence boundary OR Trigger label OR EOL
  // We want to remove the RU translation block but keep trigger phrases.
  let compacted = description;

  // Remove "RU: <translation>..." up to but excluding next "Trigger phrases:" / "Триггеры:" / period-then-Trigger
  compacted = compacted.replace(/\.\s*RU:\s*[\s\S]*?(?=\s*(?:Trigger phrases?:|Triggers:|Триггеры?:))/gi, '.');
  compacted = compacted.replace(/\.\s*RU:\s*[^.]*?\.(?=\s|$)/gi, '.');
  compacted = compacted.replace(/\s+RU:\s*[\s\S]*?(?=\s*(?:Trigger phrases?:|Triggers:|Триггеры?:))/gi, ' ');

  // Normalise "Trigger phrases:" / "Триггеры:" labels to single "Triggers:"
  // (\b doesn't work for Cyrillic in JS regex — use simple lookbehind for non-letter)
  compacted = compacted.replace(/(?:^|(?<=[\s.;]))Trigger phrases?:\s*/gi, 'Triggers: ');
  compacted = compacted.replace(/(?:^|(?<=[\s.;]))Триггеры?:\s*/gui, 'Triggers: ');

  // Tighten whitespace
  compacted = compacted.replace(/\s+/g, ' ').trim();

  return compacted;
}

/**
 * Extract every quoted trigger phrase that appears AFTER a Trigger label.
 * Used to verify zero loss after transformation.
 *
 * Restricts to the "Trigger phrases:" / "Triggers:" / "Триггеры:" tail of the description
 * so incidental quotes earlier in the description are not counted.
 */
export function extractTriggers(description) {
  if (!description) return [];
  const match = description.match(/(?:Trigger phrases?:|Triggers:|Триггеры?:)\s*([\s\S]*)$/i);
  if (!match) return [];
  const tail = match[1];
  return [...tail.matchAll(/['"`]([^'"`]+)['"`]/g)].map(m => m[1]);
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

async function main() {
  const root = resolveSupervibePluginRoot();
  const dryRun = process.argv.includes('--dry-run');

  const targets = [
    ...(await walk(join(root, 'agents'))),
    ...(await walk(join(root, 'commands'))),
    ...(await walk(join(root, 'skills'))),
    ...(await walk(join(root, 'rules'))),
  ];

  let modified = 0;
  let totalCharsSaved = 0;
  const triggerLossPerFile = {};

  for (const path of targets) {
    const raw = await readFile(path, 'utf8');
    const parsed = matter(raw);
    const original = parsed.data.description || '';
    if (!/RU:|Триггеры?:/i.test(original)) continue;

    const compacted = compactBilingual(original);
    if (compacted === original) continue;

    // Verify zero trigger loss
    const beforeTriggers = extractTriggers(original);
    const afterTriggers = extractTriggers(compacted);
    const lostTriggers = beforeTriggers.filter(t => !afterTriggers.includes(t));
    if (lostTriggers.length > 0) {
      triggerLossPerFile[path.slice(root.length + 1)] = lostTriggers;
      console.error(`[REJECT] ${path}: would lose triggers ${JSON.stringify(lostTriggers)}`);
      continue;
    }

    if (!dryRun) {
      parsed.data.description = compacted;
      const out = matter.stringify(parsed.content, parsed.data);
      await writeFile(path, out, 'utf8');
    }
    modified++;
    totalCharsSaved += original.length - compacted.length;
    if (dryRun) console.log(`[would-patch] ${path.slice(root.length + 1)}: -${original.length - compacted.length} chars`);
    else console.log(`[patched] ${path.slice(root.length + 1)}: -${original.length - compacted.length} chars`);
  }

  const lossCount = Object.keys(triggerLossPerFile).length;
  console.log(`\n[compact-bilingual] ${dryRun ? 'WOULD modify' : 'modified'} ${modified} files; ~${Math.round(totalCharsSaved / 4)} tokens saved`);
  if (lossCount > 0) {
    console.error(`[X] ${lossCount} files rejected (would lose triggers): ${Object.keys(triggerLossPerFile).join(', ')}`);
    process.exit(1);
  }
}

const isMainEntry = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}` ||
           fileURLToPath(import.meta.url) === process.argv[1];
  } catch { return false; }
})();
if (isMainEntry) await main();
