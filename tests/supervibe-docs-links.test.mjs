import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("runtime hardening doc links the UI redesign brief", async () => {
  const hardening = await readFile("docs/supervibe-runtime-ui-memory-rag-codegraph-10-of-10.md", "utf8");

  assert.match(hardening, /\[Supervibe UI Redesign Brief\]\(supervibe-ui-redesign-brief\.md\)/);
});

test("UI redesign brief covers required runtime control-plane design inputs", async () => {
  const brief = await readFile("docs/supervibe-ui-redesign-brief.md", "utf8");

  for (const phrase of [
    "cozy workbench",
    "compact board",
    "Diagnostics Separation",
    "Loop Run States",
    "Work Items And Kanban",
    "RAG",
    "Memory",
    "CodeGraph",
    "Do not require a framework rewrite",
  ]) {
    assert.match(brief, new RegExp(escapeRegExp(phrase), "i"), `${phrase} should be present`);
  }
});

test("runtime hardening doc includes final missed-item audit coverage matrix", async () => {
  const hardening = await readFile("docs/supervibe-runtime-ui-memory-rag-codegraph-10-of-10.md", "utf8");

  for (const phrase of [
    "Final Missed-Item Audit Matrix",
    "doc-only user handoff questions",
    "Loop run tab empty",
    "Memory, RAG, and CodeGraph sparse or misleading",
    "Work Items and Kanban overloaded",
    "blocked by done dependency",
    "provider config power",
    "old plans archived",
    "Codex spawn id receipt recovery",
    "redaction status repair",
    "No open T57 blockers remain",
  ]) {
    assert.match(hardening, new RegExp(escapeRegExp(phrase), "i"), `${phrase} should be present`);
  }
});

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
