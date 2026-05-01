import { readFile, readdir } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSupervibePluginRoot } from './lib/supervibe-plugin-root.mjs';

const SCAN_DIRS = Object.freeze([
  'agents',
  'commands',
  'rules',
  'scripts/lib',
  'skills',
  'templates',
]);

const SCAN_FILES = Object.freeze([
  'README.md',
  'CLAUDE.md',
  'AGENTS.md',
  'GEMINI.md',
]);

const STALE_DIALOGUE_PATTERNS = Object.freeze([
  {
    code: 'stale-next-step-handoff',
    pattern: /\bNext step[ \t]+-/i,
    message: 'Replace dry "Next step - ..." handoff copy with a concrete Step 1/1 question.',
  },
  {
    code: 'stale-next-step-proceed',
    pattern: /\bNext step is[^\r\n.]*\.\s*Proceed\?/i,
    message: 'Replace dry "Next step is ... Proceed?" handoff copy with a concrete Step 1/1 question.',
  },
  {
    code: 'stale-ru-next-step-handoff',
    pattern: /Следующий шаг[ \t]+-/i,
    message: 'Replace dry "Следующий шаг - ..." handoff copy with a concrete "Шаг 1/1:" question.',
  },
  {
    code: 'stale-ru-proceed-handoff',
    pattern: /(Question:\s*[^\n]*Переходим\?|nextQuestion\w*:\s*"[^"\n]*Переходим\?)/i,
    message: 'Replace bare "Переходим?" with a concrete "Шаг 1/1:" question.',
  },
  {
    code: 'stale-generic-genesis-prompt',
    pattern: /Шаг 1\/1:\s*что делаем дальше/i,
    message: 'Genesis must use scaffold-specific wording, not a generic next-step prompt.',
  },
  {
    code: 'hardcoded-english-recommended-marker',
    pattern: /<Recommended action>\s+\(recommended\)/,
    message: 'Use a localized recommended marker placeholder or localized marker text.',
  },
]);

const ALLOWED_STALE_DIALOGUE_FILES = new Set([
  normalizePath('scripts/validate-dialogue-ux.mjs'),
]);

export async function validateDialogueUx(root = resolveSupervibePluginRoot()) {
  const files = await collectDialogueUxFiles(root);
  const issues = [];

  for (const file of files) {
    const relPath = normalizePath(file.slice(root.length + 1));
    if (ALLOWED_STALE_DIALOGUE_FILES.has(relPath)) continue;
    const content = await readFile(file, 'utf8');
    for (const rule of STALE_DIALOGUE_PATTERNS) {
      if (rule.pattern.test(content)) {
        issues.push({ file: relPath, code: rule.code, message: rule.message });
      }
    }
  }

  return { pass: issues.length === 0, issues };
}

export async function collectDialogueUxFiles(root = resolveSupervibePluginRoot()) {
  const out = [];
  for (const dir of SCAN_DIRS) {
    out.push(...await walk(join(root, dir)));
  }
  for (const rel of SCAN_FILES) {
    const full = join(root, rel);
    try {
      await readFile(full, 'utf8');
      out.push(full);
    } catch {
      // Optional host files may not exist in every package shape.
    }
  }
  return out.filter((file) => /\.(md|mjs|tpl)$/.test(file));
}

async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else out.push(full);
  }
  return out;
}

function normalizePath(path) {
  return String(path || '').split(sep).join('/');
}

export async function main() {
  const result = await validateDialogueUx();
  if (!result.pass) {
    for (const issue of result.issues) {
      console.error(`[${issue.code}] ${issue.file}: ${issue.message}`);
    }
    console.error(`\n${result.issues.length} dialogue UX issue(s).`);
    process.exit(1);
  }
  console.log('[validate-dialogue-ux] all scanned dialogue surfaces avoid stale generic prompt patterns');
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
