import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTaskGraphRuntimePlan,
  formatTaskGraphRuntimeReport,
} from "../scripts/validate-task-graph-runtime.mjs";

test("runtime validator plans all task graph runtime suites", () => {
  const report = buildTaskGraphRuntimePlan();

  assert.equal(report.pass, true);
  assert.ok(report.files.includes("tests/task-graph-full-flow.test.mjs"));
  assert.ok(report.files.includes("tests/supervibe-loop-work-items.test.mjs"));
  assert.match(formatTaskGraphRuntimeReport(report), /SUPERVIBE_TASK_GRAPH_RUNTIME/);
});

test("runtime validator rejects unknown cases", () => {
  const report = buildTaskGraphRuntimePlan({ selectedCase: "missing" });

  assert.equal(report.pass, false);
  assert.deepEqual(report.issues, ["unknown case: missing"]);
});
