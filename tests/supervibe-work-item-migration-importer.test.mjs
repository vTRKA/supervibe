import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  detectImportedDuplicates,
  formatImportPreview,
  importWorkItemsFromFile,
  importWorkItemsFromSource,
} from "../scripts/lib/supervibe-work-item-migration-importer.mjs";

test("markdown checklist and plan sections import into dry-run work-item graph with source lines", () => {
  const result = importWorkItemsFromSource({
    sourcePath: "docs/plans/example.md",
    content: [
      "## Task 1: Build API",
      "- [ ] Wire UI",
      "- [ ] Wire UI",
      "- [x] Done docs",
    ].join("\n"),
    epicId: "epic-import",
  });

  assert.equal(result.dryRun, true);
  assert.equal(result.graph.epicId, "epic-import");
  assert.equal(result.counts.tasks, 4);
  assert.ok(result.duplicates.length >= 1);
  assert.equal(result.graph.items[1].source.line, 1);
  assert.match(formatImportPreview(result), /TASKS: 4/);
  assert.ok(detectImportedDuplicates(result.graph.items).length >= 1);
});

test("JSON task lists import from file and preserve dependencies", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-import-"));
  const path = join(root, "tasks.json");
  await writeFile(path, JSON.stringify({ tasks: [{ id: "t1", title: "Build", dependencies: ["setup"] }] }), "utf8");
  const result = await importWorkItemsFromFile(path, { epicId: "json-epic" });

  assert.equal(result.format, "json");
  assert.deepEqual(result.graph.tasks[0].dependencies, ["setup"]);
});
