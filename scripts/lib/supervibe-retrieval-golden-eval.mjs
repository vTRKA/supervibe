import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

export async function runRetrievalGoldenEval({
  rootDir = process.cwd(),
  caseFile = null,
  cases = [],
  out = null,
  now = new Date().toISOString(),
} = {}) {
  const loadedCases = caseFile ? await readCases(resolve(rootDir, caseFile)) : cases;
  const results = (loadedCases || []).map(evaluateRetrievalGoldenCase);
  const passed = results.filter((result) => result.pass).length;
  const report = {
    schemaVersion: 1,
    generatedAt: now,
    pass: results.length > 0 && passed === results.length,
    summary: {
      total: results.length,
      passed,
      failed: results.length - passed,
      averageRecall: average(results.map((result) => result.recall)),
      averagePrecision: average(results.map((result) => result.precision)),
      averageScore: average(results.map((result) => result.score)),
    },
    cases: results,
  };
  if (out) {
    const outPath = resolve(rootDir, out);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    report.outPath = outPath;
  }
  return report;
}

export function evaluateRetrievalGoldenCase(testCase = {}) {
  const actual = normalizeActual(testCase.actual || testCase.context || {});
  const expected = normalizeExpected(testCase.expected || testCase);
  const checks = [
    ...containsAll("memory", expected.memoryIds, actual.memoryIds),
    ...containsAll("rag", expected.ragPaths, actual.ragPaths),
    ...containsAll("codegraph", expected.graphSymbols, actual.graphSymbols),
    ...containsAll("stage", expected.requiredStages, actual.retrievalStages),
  ];
  if (expected.maxEstimatedTokens) {
    checks.push(check("token-budget", Number(actual.estimatedTokens || 0) <= Number(expected.maxEstimatedTokens), `${actual.estimatedTokens || 0} <= ${expected.maxEstimatedTokens}`));
  }
  const expectedCount = expected.memoryIds.length + expected.ragPaths.length + expected.graphSymbols.length + expected.requiredStages.length + (expected.maxEstimatedTokens ? 1 : 0);
  const passed = checks.filter((item) => item.pass).length;
  const retrieved = actual.memoryIds.length + actual.ragPaths.length + actual.graphSymbols.length;
  const relevantRetrieved = [
    ...intersection(expected.memoryIds, actual.memoryIds),
    ...intersection(expected.ragPaths, actual.ragPaths),
    ...intersection(expected.graphSymbols, actual.graphSymbols),
  ].length;
  const recall = expectedCount ? passed / expectedCount : 0;
  const precision = retrieved ? relevantRetrieved / retrieved : (expectedCount ? 0 : 1);
  const minRecall = Number(testCase.minRecall ?? expected.minRecall ?? 1);
  const minPrecision = Number(testCase.minPrecision ?? expected.minPrecision ?? 0.5);
  const pass = checks.every((item) => item.pass) && recall >= minRecall && precision >= minPrecision;
  return {
    id: testCase.id || "retrieval-case",
    pass,
    score: Number((Math.min(recall, precision) * 10).toFixed(2)),
    recall: Number(recall.toFixed(3)),
    precision: Number(precision.toFixed(3)),
    minRecall,
    minPrecision,
    checks,
    actual,
    expected,
  };
}

export function formatRetrievalGoldenEvalReport(report = {}) {
  return [
    "SUPERVIBE_RETRIEVAL_GOLDEN_EVAL",
    `PASS: ${Boolean(report.pass)}`,
    `CASES: ${report.summary?.total || 0}`,
    `PASSED: ${report.summary?.passed || 0}`,
    `FAILED: ${report.summary?.failed || 0}`,
    `RECALL_AVG: ${report.summary?.averageRecall ?? 0}`,
    `PRECISION_AVG: ${report.summary?.averagePrecision ?? 0}`,
    `SCORE_AVG: ${report.summary?.averageScore ?? 0}/10`,
    ...((report.cases || []).map((item) => `- ${item.id}: pass=${item.pass} recall=${item.recall} precision=${item.precision} score=${item.score}`)),
    ...(report.outPath ? [`OUT: ${report.outPath}`] : []),
  ].join("\n");
}

async function readCases(filePath) {
  if (!existsSync(filePath)) return [];
  const parsed = JSON.parse(await readFile(filePath, "utf8"));
  return Array.isArray(parsed) ? parsed : parsed.cases || [];
}

function normalizeActual(actual = {}) {
  return {
    memoryIds: unique([
      ...(actual.memoryIds || []),
      ...(actual.memory || []).map((entry) => entry.id),
      ...(actual.sources?.memory?.items || []).map((entry) => entry.id),
    ]),
    ragPaths: unique([
      ...(actual.ragPaths || []),
      ...(actual.ragChunks || []).map((entry) => entry.file || entry.path),
      ...(actual.sources?.rag?.items || []).map((entry) => entry.path || entry.file),
    ]),
    graphSymbols: unique([
      ...(actual.graphSymbols || []),
      ...(actual.graphEvidence || []).map((entry) => entry.name || entry.symbol),
      ...(actual.sources?.codegraph?.items || []).map((entry) => entry.symbol || entry.name),
    ]),
    retrievalStages: unique([
      ...(actual.retrievalStages || []),
      ...(actual.retrievalPipeline?.stages || []).map((stage) => stage.name),
    ]),
    estimatedTokens: actual.estimatedTokens || actual.summary?.estimatedTokens || actual.tokenBudget?.estimatedTokens || 0,
  };
}

function normalizeExpected(expected = {}) {
  return {
    memoryIds: unique(expected.memoryIds || expected.expectMemoryIds),
    ragPaths: unique(expected.ragPaths || expected.expectRagPaths),
    graphSymbols: unique(expected.graphSymbols || expected.expectGraphSymbols),
    requiredStages: unique(expected.requiredStages || expected.expectRetrievalStages),
    maxEstimatedTokens: expected.maxEstimatedTokens || expected.maxTokens || null,
    minRecall: expected.minRecall,
    minPrecision: expected.minPrecision,
  };
}

function containsAll(label, expected = [], actual = []) {
  return (expected || []).map((value) => {
    const found = actual.some((item) => String(item).includes(String(value)));
    return check(label, found, `expected ${label} ${value}`);
  });
}

function check(name, pass, message) {
  return { name, pass: Boolean(pass), message };
}

function unique(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(String).filter(Boolean))];
}

function intersection(left = [], right = []) {
  return left.filter((item) => right.some((candidate) => String(candidate).includes(String(item))));
}

function average(values = []) {
  const numeric = values.map(Number).filter((value) => Number.isFinite(value));
  return numeric.length ? Number((numeric.reduce((sum, value) => sum + value, 0) / numeric.length).toFixed(3)) : 0;
}
