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
