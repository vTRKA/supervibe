const validateJson = (files) =>
  files.map((file) => `node -e "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'))" ${JSON.stringify(file)}`);

export default {
  '*.{js,cjs,mjs,ts,tsx,json,md,yml,yaml}': [
    'npx prettier --write'
  ],
  '*.{json}': validateJson,
  '.{codex,cursor,gemini,opencode}/rules/**/*.md': () => 'echo "Rule edited: rules-curator review recommended"'
};
