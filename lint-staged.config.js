export default {
  '.claude-plugin/plugin.json': () => ['npm run validate:plugin-json'],
  'agents/**/*.md': () => ['npm run validate:frontmatter'],
  'skills/**/SKILL.md': () => ['npm run validate:frontmatter', 'npm run lint:descriptions'],
  'rules/**/*.md': () => ['npm run validate:frontmatter'],
  'confidence-rubrics/*.yaml': () => ['npm test -- tests/rubric-schema.test.mjs'],
  'scripts/**/*.mjs': () => ['node --check']
};
