import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateAgentRegressionChecks,
  formatAgentRegressionReport,
} from "../scripts/lib/supervibe-agent-regression-checks.mjs";

test("agent regression checks cover tool choice, retrieval use and safety handoff", () => {
  const report = evaluateAgentRegressionChecks();

  assert.equal(report.pass, true, formatAgentRegressionReport(report));
  assert.ok(report.results.some((result) => result.id === "codegraph-required-refactor"));
  assert.ok(report.results.some((result) => result.id === "unsafe-context-refusal"));
});
