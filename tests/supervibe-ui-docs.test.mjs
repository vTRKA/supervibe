import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const ROOT = process.cwd();

test("UI docs list task graph panels, completion status, and preview-first action names", async () => {
  const ui = await readFile(join(ROOT, "commands", "supervibe-ui.md"), "utf8");

  for (const word of [
    "graph tree",
    "ready queue",
    "blockers",
    "stale claims",
    "completion blockers",
    "claim",
    "edit",
    "delete",
    "split",
    "reparent",
    "dep-add",
    "dep-remove",
    "confirm=apply-local",
  ]) {
    assert.match(ui, new RegExp(escapeRegExp(word), "i"), `${word} should be documented`);
  }

  assert.match(ui, /GET \/api\/graph/);
  assert.match(ui, /POST \/api\/action/);
  assert.match(ui, /preview first/i);
  assert.doesNotMatch(ui, /kanban\.project|project tracker/i);
});

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
