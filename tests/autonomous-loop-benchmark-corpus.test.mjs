import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_BENCHMARK_CORPUS_PATH,
  DEFAULT_GOLDEN_OUTCOMES_PATH,
  filterBenchmarkCases,
  loadBenchmarkCorpus,
  loadGoldenOutcomes,
  redactBenchmarkArtifact,
  REQUIRED_BENCHMARK_CASES,
  validateBenchmarkCorpus,
  validateGoldenOutcomes,
} from "../scripts/lib/autonomous-loop-benchmark-corpus.mjs";

test("benchmark corpus covers required autonomous-loop scenarios safely", async () => {
  const corpus = await loadBenchmarkCorpus(DEFAULT_BENCHMARK_CORPUS_PATH);
  const golden = await loadGoldenOutcomes(DEFAULT_GOLDEN_OUTCOMES_PATH);

  assert.equal(corpus.valid, true);
  assert.equal(golden.valid, true);
  for (const id of REQUIRED_BENCHMARK_CASES) assert.ok(corpus.cases.some((entry) => entry.id === id), id);
  assert.equal(filterBenchmarkCases(corpus, { caseId: "plan-review-loop" })[0].id, "plan-review-loop");
});

test("benchmark validators catch missing cases, unsafe fixtures, and stale golden outcomes", () => {
  const badCorpus = validateBenchmarkCorpus({
    schemaVersion: 1,
    cases: [{ id: "unsafe", inputArtifacts: { state: { note: "token=secret-value" } }, expected: {} }],
  });
  const badGolden = validateGoldenOutcomes({ schemaVersion: 1, outcomes: {} });

  assert.ok(badCorpus.issues.some((issue) => issue.code === "credential-like-fixture"));
  assert.ok(badCorpus.issues.some((issue) => issue.code === "missing-case"));
  assert.ok(badGolden.issues.some((issue) => issue.code === "missing-golden"));
  assert.doesNotMatch(redactBenchmarkArtifact("C:\\Users\\alice\\repo token=secret-value"), /secret-value/);
});
