import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("provider instruction surfaces forbid inline producer emulation", async () => {
  const surfaces = [
    "AGENTS.md",
    "CLAUDE.md",
    "GEMINI.md",
    "templates/agent.md.tpl",
    "rules/workflow-invocation-receipts.md",
  ];
  for (const file of surfaces) {
    const text = await readFile(file, "utf8");
    assert.match(text, /Inline\/manual drafts are diagnostics? only|controller emulate|Real producers over controller emulation|Manual ledger reconstruction is forbidden/i, file);
    assert.match(text, /runtime receipts|workflow receipt|host invocation proof|executable skill producer/i, file);
  }
});

test("Gemini mapping must not downgrade subagent dispatch to inline skill instructions", async () => {
  const text = await readFile("GEMINI.md", "utf8");
  assert.doesNotMatch(text, /treat skill content as inline instructions/i);
  assert.match(text, /agent-required-blocked/);
});
