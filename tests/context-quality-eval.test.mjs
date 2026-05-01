import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateContextQualityCases,
  formatContextQualityReport,
} from "../scripts/lib/supervibe-context-quality-eval.mjs";

test("context quality eval gates recall, precision, citations and graph impact", () => {
  const report = evaluateContextQualityCases([
    {
      id: "gold-context-quality",
      quality: {
        gold: {
          memoryIds: ["MEM-1", "MEM-2"],
          sourceChunkIds: ["src:a", "src:b"],
          graphSymbols: ["routeTriggerRequest", "buildCapabilityRegistry"],
          contradiction: true,
        },
        retrieved: {
          memoryIds: ["MEM-1", "MEM-2"],
          sourceChunkIds: ["src:a", "src:b"],
          graphSymbols: ["routeTriggerRequest", "buildCapabilityRegistry"],
          contradictionWarning: true,
          estimatedTokens: 700,
          citations: [
            { id: "c1", source: "memory", path: "memory/decisions/a.md", redacted: true },
            { id: "c2", source: "rag", path: "scripts/lib/supervibe-trigger-router.mjs", redacted: true },
          ],
          evidence: [{ id: "e1", stale: false }],
        },
        tokenBudget: { maxTokens: 1000 },
      },
    },
  ]);

  assert.equal(report.pass, true, formatContextQualityReport(report));
  assert.equal(report.summary.contextRecall, 1);
  assert.equal(report.summary.contextPrecision, 1);
  assert.equal(report.summary.citationValidity, 1);
  assert.equal(report.summary.graphImpactRecall, 1);
});

test("context quality eval explains weak context", () => {
  const report = evaluateContextQualityCases([
    {
      id: "weak-context",
      quality: {
        gold: {
          memoryIds: ["MEM-1", "MEM-2"],
          sourceChunkIds: ["src:a", "src:b"],
          graphSymbols: ["SymbolA", "SymbolB"],
        },
        retrieved: {
          memoryIds: ["MEM-1", "noise"],
          sourceChunkIds: ["src:a"],
          graphSymbols: ["noise"],
          estimatedTokens: 1200,
          citations: [{ id: "bad", source: "rag" }],
          evidence: [{ id: "stale", stale: true }],
        },
        tokenBudget: { maxTokens: 1000 },
      },
    },
  ]);

  assert.equal(report.pass, false);
  assert.match(formatContextQualityReport(report), /context recall below threshold|citation precision below threshold/);
});
