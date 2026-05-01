import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("code indexer uses progress logging and no fixed total timeout", async () => {
  const source = await readFile("scripts/build-code-index.mjs", "utf8");

  assert.match(source, /no total timeout/);
  assert.match(source, /SUPERVIBE_INDEX_PROGRESS_EVERY/);
  assert.match(source, /progress every/);
  assert.doesNotMatch(source, /DEFAULT_INDEX_TIMEOUT_MS|SUPERVIBE_INDEX_TIMEOUT_MS|setTimeout\(\s*.*build-code-index/s);
});

test("genesis instructions forbid short total timeouts for large project indexing", async () => {
  const command = await readFile("commands/supervibe-genesis.md", "utf8");
  const skill = await readFile("skills/genesis/SKILL.md", "utf8");

  for (const [name, text] of [["command", command], ["skill", skill]]) {
    assert.match(text, /no fixed total timeout/i, `${name} must ban caller-side fixed total timeouts`);
    assert.match(text, /--no-embeddings/i, `${name} must document BM25-only fallback`);
    assert.match(text, /graph.*warning/i, `${name} must separate graph warnings from source RAG readiness`);
  }
});
