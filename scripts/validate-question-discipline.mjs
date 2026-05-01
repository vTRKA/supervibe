import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, sep } from 'node:path';
import matter from 'gray-matter';
import { validateDialogueContract } from './lib/supervibe-dialogue-contract.mjs';

const APPLIES_TO_GLOBS = [
  /^agents[\\/]_design[\\/]/,
  /^agents[\\/]_product[\\/]/,
  /^agents[\\/]_meta[\\/]supervibe-orchestrator\.md$/,
  /^agents[\\/]_core[\\/]repo-researcher\.md$/,
  /^agents[\\/]_core[\\/]root-cause-debugger\.md$/,
  /^agents[\\/]_ops[\\/]/,
  /^agents[\\/]stacks[\\/]/,
];

const DISCIPLINE_MARKER_A = '## User dialogue discipline';
const DISCIPLINE_MARKER_B = 'Шаг N/M';
const ANTI_PATTERN_REQUIRED = 'asking-multiple-questions-at-once';
const OUTCOME_LABEL_MARKER = 'outcome-oriented labels';
const STALE_OPTION_PLACEHOLDER_RE = /<option [abc]>|one-line rationale per option/i;
const DELIVERY_COMMAND_SCOPE = new Set([
  'commands/supervibe-design.md',
  'commands/supervibe-genesis.md',
]);
const NO_PROMPT_COMMAND_SCOPE = new Set([
  'commands/supervibe-preview.md',
  'commands/supervibe-ui.md',
  'commands/supervibe-status.md',
]);
const DELIVERY_SKILL_SCOPE = new Set([
  'skills/genesis/SKILL.md',
  'skills/adapt/SKILL.md',
  'skills/strengthen/SKILL.md',
]);
const NO_PROMPT_SKILL_SCOPE = new Set([
  'skills/audit/SKILL.md',
]);

export function isInScope(relPath) {
  const normalized = relPath.split(sep).join('/');
  return APPLIES_TO_GLOBS.some(re => re.test(normalized) || re.test(relPath));
}

export function checkAgentDiscipline(relPath, frontmatter, body) {
  if (!isInScope(relPath)) return [];
  if (frontmatter?.dialogue === 'noninteractive') return [];

  const issues = [];
  const hasMarkerA = body.includes(DISCIPLINE_MARKER_A);
  const hasMarkerB = body.includes(DISCIPLINE_MARKER_B);
  const dialogueSection = extractDialogueSection(body);
  if (!hasMarkerA && !hasMarkerB) {
    issues.push({
      file: relPath,
      code: 'missing-dialogue-discipline',
      message: `Add '## User dialogue discipline' section or use 'Шаг N/M' format. Or set frontmatter 'dialogue: noninteractive' if agent has no user dialogue.`,
    });
  }
  if (!body.includes(ANTI_PATTERN_REQUIRED)) {
    issues.push({
      file: relPath,
      code: 'missing-anti-pattern',
      message: `Add '${ANTI_PATTERN_REQUIRED}' to anti-patterns.`,
    });
  }
  if (!dialogueSection.includes(OUTCOME_LABEL_MARKER)) {
    issues.push({
      file: relPath,
      code: 'missing-outcome-label-guidance',
      message: 'Dialogue discipline must require outcome-oriented labels instead of generic option labels.',
    });
  }
  if (STALE_OPTION_PLACEHOLDER_RE.test(dialogueSection)) {
    issues.push({
      file: relPath,
      code: 'stale-dialogue-placeholder',
      message: 'Replace generic <option a>/<one-line rationale> placeholders with outcome-oriented action examples.',
    });
  }
  return issues;
}

function extractDialogueSection(body) {
  const markerIndex = body.indexOf(DISCIPLINE_MARKER_A);
  if (markerIndex === -1) return body;
  const section = body.slice(markerIndex);
  const nextHeadingIndex = section.indexOf('\n## ', DISCIPLINE_MARKER_A.length);
  return nextHeadingIndex === -1 ? section : section.slice(0, nextHeadingIndex);
}

export function checkCommandOrSkillDiscipline(relPath, frontmatter, body) {
  const normalized = relPath.split(sep).join('/');
  if (frontmatter?.dialogue === 'noninteractive') return [];
  if (DELIVERY_COMMAND_SCOPE.has(normalized) || DELIVERY_SKILL_SCOPE.has(normalized)) {
    return validateDialogueContract({ path: normalized, content: body, delivery: true })
      .map((issue) => ({ file: relPath, ...issue }));
  }
  if (NO_PROMPT_COMMAND_SCOPE.has(normalized) || NO_PROMPT_SKILL_SCOPE.has(normalized)) {
    return checkNoPromptPath(normalized, body).map((issue) => ({ file: relPath, ...issue }));
  }
  return [];
}

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

export async function collectDisciplineFiles(root) {
  const groups = [
    ['agents', join(root, 'agents')],
    ['commands', join(root, 'commands')],
    ['skills', join(root, 'skills')],
    ['rules', join(root, 'rules')],
  ];
  const files = [];
  for (const [kind, dir] of groups) {
    const paths = await walk(dir);
    for (const fullPath of paths) {
      files.push({
        kind,
        fullPath,
        relPath: fullPath.slice(root.length + 1),
      });
    }
  }
  return files;
}

export async function main() {
  const root = process.env.SUPERVIBE_PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
  const files = await collectDisciplineFiles(root);

  let totalIssues = 0;
  for (const file of files) {
    const rel = file.relPath;
    const raw = await readFile(file.fullPath, 'utf8');
    const parsed = safeMatter(raw);
    const issues = file.kind === 'agents'
      ? checkAgentDiscipline(rel, parsed.data, parsed.content)
      : checkCommandOrSkillDiscipline(rel, parsed.data, parsed.content);
    for (const issue of issues) {
      console.error(`[${issue.code}] ${issue.file}: ${issue.message}`);
      totalIssues++;
    }
  }
  if (totalIssues > 0) {
    console.error(`\n${totalIssues} discipline issue(s).`);
    process.exit(1);
  }
  console.log('[validate-question-discipline] all scoped agents, commands, skills, and dialogue rules compliant');
}

function safeMatter(raw) {
  try {
    return matter(raw);
  } catch {
    return { data: {}, content: raw };
  }
}

function checkNoPromptPath(relPath, body) {
  const issues = [];
  if (!/--yes|--dry-run|--json|--daemon|--foreground|--list|--kill|read-only|no-tty|non-interactive|no-prompt/i.test(body)) {
    issues.push({
      code: 'missing-no-prompt-path',
      message: 'Document --yes, --dry-run, --json, daemon/list/kill, read-only, no-tty, or another no-prompt path.',
    });
  }
  if (/wait for (user|approval)|await approval/i.test(body) && !/Step N\/M|Шаг N\/M|one question at a time/i.test(body)) {
    issues.push({
      code: 'missing-single-question-for-prompt',
      message: 'Prompting artifact must use the shared single-question contract.',
    });
  }
  return issues.map((issue) => ({ file: relPath, ...issue }));
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
