import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  buildTaskGraphMaturityReport,
  formatTaskGraphMaturityReport,
} from "../scripts/lib/supervibe-task-graph-maturity.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

test("task graph maturity reports 10 of 10 for the repository capability surface", () => {
  const report = buildTaskGraphMaturityReport(ROOT);

  assert.equal(report.pass, true);
  assert.equal(report.score, 10);
  assert.equal(report.status, "10-of-10-ready");
  assert.ok(report.dimensions.some((dimension) => dimension.id === "routing" && dimension.pass));
  assert.match(formatTaskGraphMaturityReport(report), /SUPERVIBE_TASK_GRAPH_MATURITY/);
});

test("task graph maturity strict active graph mode blocks missing current graph coverage", () => {
  const root = mkdtempSync(join(tmpdir(), "supervibe-task-graph-maturity-empty-"));
  writeMinimalSurface(root);
  const report = buildTaskGraphMaturityReport(root, { requireActiveGraph: true });

  assert.equal(report.pass, false);
  assert.ok(report.dimensions.some((dimension) => dimension.id === "current-active-graph" && !dimension.pass));
  assert.match(formatTaskGraphMaturityReport(report), /no current work-item graph files found/);
});

test("task graph runtime maturity blocks stale work-item registry", () => {
  const root = mkdtempSync(join(tmpdir(), "supervibe-task-graph-maturity-stale-index-"));
  writeMinimalSurface(root);
  writeRuntimeGraph(root, { source: "## Acceptance Criteria\n- Runtime requirement.\n" });
  writeFileSync(join(root, ".supervibe", "memory", "work-items", "index.json"), `${JSON.stringify({
    schemaVersion: 1,
    activeEpicId: "epic-runtime",
    activeGraphPath: ".supervibe/memory/work-items/epic-runtime/missing.json",
    epics: {
      "epic-runtime": {
        epicId: "epic-runtime",
        graphPath: ".supervibe/memory/work-items/epic-runtime/missing.json",
        status: "active",
      },
    },
  }, null, 2)}\n`, "utf8");

  const report = buildTaskGraphMaturityReport(root, { requireActiveGraph: true });

  assert.equal(report.pass, false);
  assert.ok(report.dimensions.some((dimension) => dimension.id === "work-item-registry" && !dimension.pass));
});

test("task graph runtime maturity blocks neutral traceability", () => {
  const root = mkdtempSync(join(tmpdir(), "supervibe-task-graph-maturity-neutral-trace-"));
  writeMinimalSurface(root);
  writeRuntimeGraph(root, { source: "# Source Without Requirements\n" });

  const report = buildTaskGraphMaturityReport(root, { requireActiveGraph: true });

  assert.equal(report.pass, false);
  assert.ok(report.dimensions.some((dimension) => dimension.id === "active-traceability" && !dimension.pass));
});

test("task graph maturity CLI prints a machine-readable report", () => {
  const stdout = execFileSync(process.execPath, [
    join(ROOT, "scripts/supervibe-task-graph-maturity.mjs"),
  ], {
    cwd: ROOT,
    encoding: "utf8",
  });

  assert.match(stdout, /SUPERVIBE_TASK_GRAPH_MATURITY/);
  assert.match(stdout, /SCORE: 10\/10/);
  assert.match(stdout, /STATUS: 10-of-10-ready/);
});

function writeMinimalSurface(root) {
  const files = {
    "scripts/supervibe-loop.mjs": "--atomize-plan --claim-ready --validate-completion --split --reparent --skip --block --delete --edit",
    "scripts/lib/supervibe-ui-server.mjs": "no-active-graph atomizeReviewedPlan tracker actionImpact claim defer close reopen skip cancel create edit split reparent dep-add dep-remove delete",
    "scripts/lib/supervibe-durable-task-tracker-adapter.mjs": "createEpic createTask addDependency ready claim update close syncPush syncPull",
    "scripts/lib/supervibe-task-tracker-sync.mjs": "validateTrackerMapping diagnoseTrackerSyncConflicts partial-sync redactTrackerSyncDiagnostics",
    "scripts/validate-work-item-graphs.mjs": "validator",
    "scripts/validate-epic-completion.mjs": "strict-coverage",
    "scripts/lib/supervibe-epic-completion-validator.mjs": "validator",
    "scripts/lib/supervibe-plan-to-work-items.mjs": "atomize",
    "tests/supervibe-commands-routing.test.mjs": "test",
    "tests/supervibe-plan-to-work-items.test.mjs": "test",
    "tests/supervibe-loop-work-items.test.mjs": "test",
    "tests/supervibe-work-item-actions.test.mjs": "test",
    "tests/supervibe-ui-server.test.mjs": "test",
    "tests/supervibe-epic-completion-validator.test.mjs": "test",
    "tests/fixtures/artifacts/work-item-graphs/sample.work-item-graph.json": "{}",
  };
  for (const [file, content] of Object.entries(files)) {
    const path = join(root, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${content}\n`, "utf8");
  }
}

function writeRuntimeGraph(root, { source }) {
  const graphDir = join(root, ".supervibe", "memory", "work-items", "epic-runtime");
  mkdirSync(graphDir, { recursive: true });
  writeFileSync(join(graphDir, "source-plan.md"), source, "utf8");
  writeFileSync(join(graphDir, "graph.json"), `${JSON.stringify({
    graph_id: "epic-runtime",
    source: { snapshotPath: "source-plan.md" },
    items: [
      { itemId: "epic-runtime", type: "epic", status: "open", title: "Runtime" },
      {
        itemId: "task-runtime",
        type: "task",
        status: "complete",
        title: "Runtime requirement",
        evidence: [{ status: "pass", command: "node --test tests/runtime.test.mjs" }],
      },
    ],
  }, null, 2)}\n`, "utf8");
  writeFileSync(join(root, ".supervibe", "memory", "work-items", "index.json"), `${JSON.stringify({
    schemaVersion: 1,
    activeEpicId: null,
    activeGraphPath: null,
    epics: {
      "epic-runtime": {
        epicId: "epic-runtime",
        graphPath: ".supervibe/memory/work-items/epic-runtime/graph.json",
        sourcePlanPath: ".supervibe/artifacts/plans/missing.md",
        status: "active",
      },
    },
  }, null, 2)}\n`, "utf8");
}
