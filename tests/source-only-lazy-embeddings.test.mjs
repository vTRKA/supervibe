import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("CodeStore lazy-loads embeddings so source-only mode never imports ML stack", async () => {
  const source = await readFile("scripts/lib/code-store.mjs", "utf8");

  assert.doesNotMatch(source, /import\s+\{[^}]*embed[^}]*\}\s+from\s+['"]\.\/embeddings\.mjs['"]/);
  assert.match(source, /await\s+import\(['"]\.\/embeddings\.mjs['"]\)/);
  assert.match(source, /this\.useEmbeddings/);
});
