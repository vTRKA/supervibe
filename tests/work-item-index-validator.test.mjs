import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { validateWorkItemRegistryIntegrity } from "../scripts/lib/supervibe-work-item-registry.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

test("work-item registry validator fails stale active entries", () => {
  const root = mkdtempSync(join(tmpdir(), "supervibe-work-item-index-stale-"));
  writeIndex(root, {
    schemaVersion: 1,
    activeEpicId: "epic-stale",
    activeGraphPath: ".supervibe/memory/work-items/epic-stale/graph.json",
    epics: {
      "epic-stale": {
        epicId: "epic-stale",
        graphPath: ".supervibe/memory/work-items/epic-stale/graph.json",
        sourcePlanPath: ".supervibe/artifacts/plans/stale.md",
        status: "active",
      },
    },
  });

  const report = validateWorkItemRegistryIntegrity({ rootDir: root });

  assert.equal(report.pass, false);
  assert.ok(report.issues.some((issue) => issue.code === "active-graph-missing"));
  assert.ok(report.issues.some((issue) => issue.code === "missing-graph-file"));
});

test("work-item registry validator accepts graph with source snapshot", () => {
  const root = mkdtempSync(join(tmpdir(), "supervibe-work-item-index-valid-"));
  const graphDir = join(root, ".supervibe", "memory", "work-items", "epic-valid");
  mkdirSync(graphDir, { recursive: true });
  writeFileSync(join(graphDir, "source-plan.md"), "# Source Plan\n", "utf8");
  writeFileSync(join(graphDir, "graph.json"), `${JSON.stringify({
    graph_id: "epic-valid",
    source: {
      path: ".supervibe/artifacts/plans/missing.md",
      snapshotPath: "source-plan.md",
    },
    items: [
      { itemId: "epic-valid", type: "epic", status: "done", title: "Valid" },
      { itemId: "task-valid", type: "task", status: "done", title: "Valid task" },
    ],
  }, null, 2)}\n`, "utf8");
  writeIndex(root, {
    schemaVersion: 1,
    activeEpicId: null,
    activeGraphPath: null,
    epics: {
      "epic-valid": {
        epicId: "epic-valid",
        graphPath: ".supervibe/memory/work-items/epic-valid/graph.json",
        sourcePlanPath: ".supervibe/artifacts/plans/missing.md",
        status: "closed",
      },
    },
  });

  const report = validateWorkItemRegistryIntegrity({ rootDir: root });

  assert.equal(report.pass, true);
});

test("validate-work-item-index CLI fails stale registry", () => {
  const root = mkdtempSync(join(tmpdir(), "supervibe-work-item-index-cli-"));
  writeIndex(root, {
    schemaVersion: 1,
    activeEpicId: "epic-stale",
    activeGraphPath: ".supervibe/memory/work-items/epic-stale/graph.json",
    epics: {
      "epic-stale": {
        epicId: "epic-stale",
        graphPath: ".supervibe/memory/work-items/epic-stale/graph.json",
        status: "active",
      },
    },
  });

  let output = "";
  assert.throws(() => {
    try {
      execFileSync(process.execPath, [
        join(ROOT, "scripts/validate-work-item-index.mjs"),
        "--registry",
        join(root, ".supervibe", "memory", "work-items", "index.json"),
      ], {
        cwd: root,
        encoding: "utf8",
        stdio: "pipe",
      });
    } catch (error) {
      output = `${error.stdout || ""}${error.stderr || ""}`;
      throw error;
    }
  });
  assert.match(output, /missing-graph-file/);
});

function writeIndex(root, registry) {
  const file = join(root, ".supervibe", "memory", "work-items", "index.json");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
}
