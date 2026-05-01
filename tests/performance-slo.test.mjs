import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPerformanceSloReport,
  formatPerformanceSloReport,
} from "../scripts/lib/supervibe-performance-slo.mjs";

test("performance SLO report gates latency, token, disk and watcher budgets", () => {
  const report = buildPerformanceSloReport({
    measurements: {
      contextPackP50Ms: 300,
      contextPackP95Ms: 900,
      indexRebuildMs: 2000,
      watcherCpuPercent: 1,
      codeDbBytes: 1024,
      memoryGraphNodes: 20,
      tokenBudgetMax: 4000,
      retrievalTopK: 8,
      evalRunMs: 500,
    },
    machineProfile: { os: "test-os", node: "v22.5.0" },
  });

  assert.equal(report.pass, true, formatPerformanceSloReport(report));
});

test("performance SLO report explains missing or oversized budgets", () => {
  const report = buildPerformanceSloReport({
    measurements: {
      contextPackP95Ms: 9000,
      tokenBudgetMax: 20000,
      watcherCpuPercent: 20,
    },
    machineProfile: {},
  });

  assert.equal(report.pass, false, "SLO missing context-pack latency, token budget, disk growth or watcher overhead");
  assert.match(formatPerformanceSloReport(report), /SLO|TOKEN_BUDGET_MAX/);
});
