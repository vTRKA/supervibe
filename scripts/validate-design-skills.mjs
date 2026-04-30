import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const FEEDBACK_MARKERS = ['✅', '✎', '🔀', '📊', '🛑'];

const REQUIRED_ANTIPATTERNS_ALL = [
  'asking-multiple-questions-at-once',
  'advancing-without-feedback-prompt',
  'random-regen-instead-of-tradeoff-alternatives',
];

const REQUIRED_ANTIPATTERNS_PROTOTYPE = [
  ...REQUIRED_ANTIPATTERNS_ALL,
  'framework-coupling',
  'silent-viewport-expansion',
  'silent-existing-artifact-reuse',
  'missing-preview-feedback-button',
];

const SKILLS = {
  prototype: { needsFeedback: true, antipatterns: REQUIRED_ANTIPATTERNS_PROTOTYPE },
  'landing-page': { needsFeedback: true, antipatterns: REQUIRED_ANTIPATTERNS_PROTOTYPE },
  brandbook: { needsFeedback: true, antipatterns: REQUIRED_ANTIPATTERNS_ALL },
  'interaction-design-patterns': { needsFeedback: false, antipatterns: REQUIRED_ANTIPATTERNS_ALL },
  'design-intelligence': {
    needsFeedback: false,
    antipatterns: [
      ...REQUIRED_ANTIPATTERNS_ALL,
      'lookup-as-authority',
      'memory-bypass',
      'approved-system-overwrite',
      'uncited-design-claim',
    ],
  },
};

export function validateDesignSkill(skillName, body) {
  const spec = SKILLS[skillName];
  if (!spec) return [];

  const issues = [];

  if (spec.needsFeedback) {
    const allMarkersPresent = FEEDBACK_MARKERS.every(m => body.includes(m));
    if (!allMarkersPresent) {
      issues.push({
        code: 'missing-feedback-prompt',
        message: `${skillName}: feedback prompt missing one or more of ${FEEDBACK_MARKERS.join(' ')}`,
      });
    }
  }

  for (const ap of spec.antipatterns) {
    if (!body.includes(ap)) {
      const code = ap === 'asking-multiple-questions-at-once'
        ? 'missing-single-question-anti-pattern'
        : `missing-${ap}-anti-pattern`;
      issues.push({
        code,
        message: `${skillName}: missing anti-pattern '${ap}'`,
      });
    }
  }

  return issues;
}

export async function main() {
  const root = process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
  let totalIssues = 0;

  for (const skillName of Object.keys(SKILLS)) {
    const path = join(root, 'skills', skillName, 'SKILL.md');
    let body;
    try {
      body = await readFile(path, 'utf8');
    } catch {
      console.error(`[validate-design-skills] cannot read ${path}`);
      totalIssues++;
      continue;
    }
    const issues = validateDesignSkill(skillName, body);
    for (const issue of issues) {
      console.error(`[${issue.code}] ${issue.message}`);
      totalIssues++;
    }
  }

  if (totalIssues > 0) {
    console.error(`\n${totalIssues} issue(s) — fix before commit.`);
    process.exit(1);
  }
  console.log('[validate-design-skills] all design skills compliant');
}

const isMain = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}` ||
           fileURLToPath(import.meta.url) === process.argv[1];
  } catch {
    return false;
  }
})();
if (isMain) {
  await main();
}
