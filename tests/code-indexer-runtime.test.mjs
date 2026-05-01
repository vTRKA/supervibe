import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("code indexer uses progress logging plus opt-in bounded mode", async () => {
  const source = await readFile("scripts/build-code-index.mjs", "utf8");

  assert.match(source, /max-seconds/);
  assert.match(source, /SUPERVIBE_INDEX_BOUNDED_TIMEOUT/);
  assert.match(source, /source-only/);
  assert.match(source, /json-progress/);
  assert.match(source, /code-index-checkpoint\.json/);
  assert.match(source, /SUPERVIBE_INDEX_PROGRESS_EVERY/);
  assert.match(source, /SUPERVIBE_INDEX_HEARTBEAT_SECONDS/);
  assert.match(source, /code-index\.lock/);
  assert.match(source, /--list-missing/);
  assert.match(source, /--resume/);
  assert.match(source, /progress every/);
  assert.match(source, /Usage:/);
  assert.doesNotMatch(source, /DEFAULT_INDEX_TIMEOUT_MS|SUPERVIBE_INDEX_TIMEOUT_MS|setTimeout\(\s*.*build-code-index/s);
});

test("genesis instructions document bounded source-readiness indexing", async () => {
  const command = await readFile("commands/supervibe-genesis.md", "utf8");
  const skill = await readFile("skills/genesis/SKILL.md", "utf8");

  for (const [name, text] of [["command", command], ["skill", skill]]) {
    assert.match(text, /--source-only/i, `${name} must document source-only fallback`);
    assert.match(text, /--max-seconds/i, `${name} must document bounded indexing`);
    assert.match(text, /--max-files/i, `${name} must document atomic batches`);
    assert.match(text, /graph.*warning/i, `${name} must separate graph warnings from source RAG readiness`);
  }
});
