import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateAgentRegressionChecks,
  formatAgentRegressionReport,
} from "../scripts/lib/supervibe-agent-regression-checks.mjs";

test("agent regression checks cover tool choice, retrieval use and safety handoff", () => {
  const report = evaluateAgentRegressionChecks();

  assert.equal(report.pass, true, formatAgentRegressionReport(report));
  assert.ok(report.total >= 12);
  assert.ok(report.results.some((result) => result.id === "codegraph-required-refactor"));
  assert.ok(report.results.some((result) => result.id === "unsafe-context-refusal"));
  assert.ok(report.results.some((result) => result.id === "missing-slash-hard-stop"));
  assert.ok(report.results.some((result) => result.id === "plan-review-explicit-slash"));
  assert.ok(report.results.some((result) => result.id === "mutable-receipt-output-rejected"));
});
