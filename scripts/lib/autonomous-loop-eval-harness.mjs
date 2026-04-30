import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { DEFAULT_BENCHMARK_CORPUS_PATH, DEFAULT_GOLDEN_OUTCOMES_PATH, filterBenchmarkCases, loadBenchmarkCorpus, loadGoldenOutcomes, redactBenchmarkArtifact } from "./autonomous-loop-benchmark-corpus.mjs";
import { formatReplayDiff, replayArchivedRun, replayBenchmarkCase } from "./autonomous-loop-replay-runner.mjs";
import { createQualityScorecard, summarizeQualityScorecards } from "./autonomous-loop-quality-scorecard.mjs";

export async function runAutonomousLoopEvals({
  rootDir = process.cwd(),
  corpusPath = DEFAULT_BENCHMARK_CORPUS_PATH,
  goldenPath = DEFAULT_GOLDEN_OUTCOMES_PATH,
  caseId = null,
  replayDir = null,
  live = false,
  maxRuntimeMinutes = null,
  maxIterations = null,
  providerBudget = null,
  writeReportPath = null,
} = {}) {
  if (live) {
    const liveGate = validateLiveEvalOptions({ maxRuntimeMinutes, maxIterations, providerBudget });
    if (!liveGate.pass) {
      return {
        pass: false,
        live: true,
        blocked: true,
        issues: liveGate.issues,
        cases: [],
        summary: { total: 0, pass: 0, fail: 0, average: 0, topRegressions: [] },
      };
    }
  }

  const corpus = await loadBenchmarkCorpus(corpusPath, { rootDir });
  const golden = await loadGoldenOutcomes(goldenPath, { rootDir });
  const results = [];

  if (replayDir) {
    const replay = await replayArchivedRun(replayDir);
    const card = createQualityScorecard({ snapshot: replay.snapshot, comparison: replay.comparison, state: {} });
    results.push({ caseId: replay.snapshot.runId, replay, scorecard: card });
  } else {
    for (const caseDef of filterBenchmarkCases(corpus, { caseId })) {
      const replay = replayBenchmarkCase(caseDef, golden.outcomes[caseDef.id]);
      const scorecard = createQualityScorecard({
        caseDef,
        snapshot: replay.snapshot,
        comparison: replay.comparison,
        state: caseDef.inputArtifacts?.state || {},
      });
      results.push({ caseId: caseDef.id, replay, scorecard });
    }
  }

  const scorecards = results.map((result) => result.scorecard);
  const summary = summarizeQualityScorecards(scorecards);
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    live: Boolean(live),
    corpusPath,
    goldenPath,
    pass: results.every((result) => result.replay.comparison.pass && result.scorecard.pass),
    cases: results,
    summary,
  };

  if (writeReportPath) await writeEvalReport(isAbsolute(writeReportPath) ? writeReportPath : join(rootDir, writeReportPath), report);
  return report;
}

export function validateLiveEvalOptions({ maxRuntimeMinutes, maxIterations, providerBudget } = {}) {
  const issues = [];
  if (!Number(maxRuntimeMinutes) || Number(maxRuntimeMinutes) <= 0) issues.push("live eval requires --max-runtime-minutes");
  if (!Number(maxIterations) || Number(maxIterations) <= 0) issues.push("live eval requires --max-iterations");
  if (!Number(providerBudget) || Number(providerBudget) <= 0) issues.push("live eval requires --provider-budget");
  return { pass: issues.length === 0, issues };
}

export async function writeEvalReport(outPath, report) {
  await mkdir(dirname(outPath), { recursive: true });
  const content = `${redactBenchmarkArtifact(JSON.stringify(report, null, 2))}\n`;
  await writeFile(outPath, content, "utf8");
  return { outPath, bytes: Buffer.byteLength(content) };
}

export function formatEvalHarnessReport(report = {}) {
  if (report.blocked) {
    return [
      "SUPERVIBE_LOOP_EVAL",
      "PASS: false",
      "BLOCKED: true",
      `ISSUES: ${(report.issues || []).join("; ")}`,
    ].join("\n");
  }
  return [
    "SUPERVIBE_LOOP_EVAL",
    `PASS: ${report.pass}`,
    `LIVE: ${Boolean(report.live)}`,
    `CASES: ${report.summary?.total || 0}`,
    `SCORE_AVG: ${report.summary?.average || 0}/10`,
    `FAILURES: ${report.summary?.fail || 0}`,
    ...(report.cases || []).flatMap((result) => [
      `- ${result.caseId}: replay=${result.replay.comparison.pass} score=${result.scorecard.score}/10`,
      ...(result.replay.comparison.pass ? [] : [formatReplayDiff(result.replay.comparison)]),
    ]),
  ].join("\n");
}
