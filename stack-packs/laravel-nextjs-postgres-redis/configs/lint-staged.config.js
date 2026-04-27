export default {
  // Backend (Laravel / PHP)
  'backend/**/*.php': [
    'cd backend && ./vendor/bin/pint --dirty',
    'cd backend && ./vendor/bin/phpstan analyse --no-progress'
  ],

  // Frontend (Next.js / TypeScript)
  'frontend/**/*.{ts,tsx}': [
    'cd frontend && tsc --noEmit',
    'cd frontend && npx eslint --fix'
  ],
  'frontend/**/*.{js,jsx,json,md,yml,yaml}': [
    'cd frontend && npx prettier --write'
  ],

  // .claude/rules edits trigger reminder via post-edit-stack-watch hook
  '.claude/rules/**/*.md': () => 'echo "→ Rule edited: rules-curator review recommended"',

  // .claude/settings.json validated
  '.claude/settings.json': () => 'node -e "JSON.parse(require(\'fs\').readFileSync(\'.claude/settings.json\', \'utf8\'))"'
};
