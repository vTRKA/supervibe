import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, sep } from 'node:path';
import matter from 'gray-matter';

const APPLIES_TO_GLOBS = [
  /^agents[\\/]_design[\\/]/,
  /^agents[\\/]_product[\\/]/,
  /^agents[\\/]_meta[\\/]evolve-orchestrator\.md$/,
  /^agents[\\/]_core[\\/]repo-researcher\.md$/,
  /^agents[\\/]_core[\\/]root-cause-debugger\.md$/,
  /^agents[\\/]_ops[\\/]/,
  /^agents[\\/]stacks[\\/]/,
];

const DISCIPLINE_MARKER_A = '## User dialogue discipline';
const DISCIPLINE_MARKER_B = 'Шаг N/M';
const ANTI_PATTERN_REQUIRED = 'asking-multiple-questions-at-once';

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
  return issues;
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

export async function main() {
  const root = process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
  const agentsDir = join(root, 'agents');
  const files = await walk(agentsDir);

  let totalIssues = 0;
  for (const full of files) {
    const rel = full.slice(root.length + 1);
    const raw = await readFile(full, 'utf8');
    const parsed = matter(raw);
    const issues = checkAgentDiscipline(rel, parsed.data, parsed.content);
    for (const issue of issues) {
      console.error(`[${issue.code}] ${issue.file}: ${issue.message}`);
      totalIssues++;
    }
  }
  if (totalIssues > 0) {
    console.error(`\n${totalIssues} discipline issue(s).`);
    process.exit(1);
  }
  console.log('[validate-question-discipline] all interactive agents compliant');
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
