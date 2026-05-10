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
    sourcePath: ".supervibe/artifacts/plans/example.md",
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

test("JSONL task imports preserve dependency and production evidence fields", () => {
  const result = importWorkItemsFromSource({
    sourcePath: ".supervibe/memory/loops/run/tasks.jsonl",
    epicId: "jsonl-epic",
    content: [
      JSON.stringify({
        id: "legacy-setup",
        title: "Set up graph storage",
        status: "in_progress",
        dependencies: ["legacy-plan"],
        acceptanceCriteria: ["Graph has an epic and ready task"],
        verificationCommands: ["node --test tests/supervibe-plan-to-work-items.test.mjs"],
      }),
      JSON.stringify({
        id: "legacy-close",
        goal: "Close completion gate",
        blockedBy: ["legacy-setup"],
        acceptance_criteria: ["Completion validator reports no blockers"],
        verification_commands: ["npm run validate:epic-completion"],
      }),
    ].join("\n"),
  });

  assert.equal(result.format, "jsonl");
  assert.equal(result.counts.tasks, 2);
  assert.equal(result.graph.tasks[0].source.legacyId, "legacy-setup");
  assert.deepEqual(result.graph.tasks[0].dependencies, ["legacy-plan"]);
  assert.deepEqual(result.graph.tasks[0].acceptanceCriteria, ["Graph has an epic and ready task"]);
  assert.deepEqual(result.graph.tasks[0].verificationCommands, ["node --test tests/supervibe-plan-to-work-items.test.mjs"]);
  assert.deepEqual(result.graph.tasks[1].dependencies, ["legacy-setup"]);
  assert.deepEqual(result.graph.items[2].acceptanceCriteria, ["Completion validator reports no blockers"]);
});

test("legacy loop state JSON imports task graph tasks with owner and evidence", () => {
  const result = importWorkItemsFromSource({
    sourcePath: ".supervibe/memory/loops/run/state.json",
    epicId: "loop-epic",
    content: JSON.stringify({
      run_id: "run-legacy",
      taskGraph: {
        tasks: [{
          id: "loop-task-1",
          goal: "Verify migrated loop task",
          status: "complete",
          owner: "agent-a",
          labels: ["migration"],
          notes: ["closed in old loop"],
          acceptance_criteria: ["Task has acceptance evidence"],
          verification_commands: ["node --test tests/supervibe-work-item-migration-importer.test.mjs"],
        }],
      },
    }),
  });

  assert.equal(result.format, "json");
  assert.equal(result.graph.tasks[0].source.legacyId, "loop-task-1");
  assert.equal(result.graph.tasks[0].owner, "agent-a");
  assert.deepEqual(result.graph.tasks[0].labels, ["migration"]);
  assert.deepEqual(result.graph.tasks[0].notes, ["closed in old loop"]);
  assert.deepEqual(result.graph.tasks[0].acceptanceCriteria, ["Task has acceptance evidence"]);
  assert.deepEqual(result.graph.items[1].verificationCommands, ["node --test tests/supervibe-work-item-migration-importer.test.mjs"]);
});
