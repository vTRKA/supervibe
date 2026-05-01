import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  evaluateRetrievalPipelineCalibration,
  formatRetrievalPipelineReport,
  runRetrievalPipeline,
} from "../scripts/lib/supervibe-retrieval-pipeline.mjs";

test("retrieval pipeline records staged candidates, rerank scores and fallback reason", () => {
  const pipeline = runRetrievalPipeline({
    query: "интент router context",
    exactSymbolCandidates: [{ symbol: "routeTriggerRequest", score: 0.95 }],
    ftsCandidates: [{ id: "chunk-1", path: "scripts/lib/router.mjs", score: 0.7 }],
    embeddingCandidates: [{ id: "chunk-2", path: "scripts/lib/router.mjs", score: 0.75 }],
    repoMapCandidates: [{ path: "scripts/lib/router.mjs", rank: 10 }],
    graphCandidates: [{ symbol: "routeTriggerRequest", score: 0.8 }],
  });

  assert.equal(pipeline.pass, true);
  assert.notEqual(pipeline.rewrittenQuery, "интент router context");
  assert.ok(pipeline.stages.some((stage) => stage.name === "rewrite"), "retrieval pipeline missing rewrite, hybrid candidate set, rerank score or fallback reason");
  assert.ok(pipeline.stages.some((stage) => stage.name === "rerank"), "retrieval pipeline missing rewrite, hybrid candidate set, rerank score or fallback reason");
  assert.ok(pipeline.selected.every((item) => Number.isFinite(item.rerankScore)), "retrieval pipeline missing rewrite, hybrid candidate set, rerank score or fallback reason");
  assert.ok(pipeline.fallback.reason, "retrieval pipeline missing rewrite, hybrid candidate set, rerank score or fallback reason");
});

test("retrieval pipeline calibrates scenario eval fixtures", async () => {
  const cases = JSON.parse(await readFile("tests/fixtures/scenario-evals/supervibe-user-flows.json", "utf8"));
  const report = evaluateRetrievalPipelineCalibration(cases);

  assert.equal(report.pass, true, formatRetrievalPipelineReport(report));
});
