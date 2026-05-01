const validateJson = (files) =>
  files.map((file) => `node -e "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'))" ${JSON.stringify(file)}`);

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

  // Host-adapter rule edits trigger reminder via post-edit-stack-watch hook.
  '.{codex,cursor,gemini,opencode}/rules/**/*.md': () => 'echo "Rule edited: rules-curator review recommended"',

  // Host-adapter JSON settings validated without assuming Claude.
  '{.codex/config.json,.cursor/supervibe.json,.gemini/settings.json,opencode.json}': validateJson
};
