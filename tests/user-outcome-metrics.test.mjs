import assert from "node:assert/strict";
import test from "node:test";

import {
  buildUserOutcomeReport,
  formatUserOutcomeReport,
} from "../scripts/lib/supervibe-user-outcome-metrics.mjs";

test("user outcome report surfaces provenance, repair action and confidence delta", () => {
  const report = buildUserOutcomeReport({
    contextPack: {
      confidence: 1,
      citations: [
        { source: "memory", path: ".supervibe/memory/decisions/a.md" },
        { source: "rag", path: "scripts/lib/supervibe-context-orchestrator.mjs" },
        { source: "codegraph", path: "scripts/lib/supervibe-trigger-router.mjs" },
      ],
      sources: {
        memory: { reason: "prior decision" },
        rag: { reason: "source chunks" },
        codegraph: { reason: "symbol impact" },
      },
      diagnostics: {
        memory: { status: "included", reason: "prior decision", count: 1 },
        docs: { status: "skipped", reason: "no matching docs", count: 0 },
      },
      tokenBudget: { overflow: false },
    },
    startedAt: 100,
    firstUsefulContextAt: 350,
    confidenceBefore: 0.5,
    confidenceAfter: 1,
    avoidedQuestions: 2,
  });

  assert.equal(report.pass, true, formatUserOutcomeReport(report));
  assert.equal(report.metrics.contextProvenanceVisible, true, "user outcome report missing context provenance, repair action or confidence delta");
  assert.equal(report.metrics.confidenceDelta, 0.5, "user outcome report missing context provenance, repair action or confidence delta");
  assert.ok(report.repairActions.some((action) => action.source === "docs"), "user outcome report missing context provenance, repair action or confidence delta");
});
