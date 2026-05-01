import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { buildContextPack } from "./supervibe-context-pack.mjs";
import { evaluateContextQualityCases, formatContextQualityReport } from "./supervibe-context-quality-eval.mjs";

export async function runContextPackEval({
  rootDir = process.cwd(),
  cases = [],
  caseFile = null,
  out = null,
  now = new Date().toISOString(),
} = {}) {
  const loadedCases = caseFile ? await readCases(resolve(rootDir, caseFile)) : cases;
  if ((loadedCases || []).some((testCase) => testCase?.quality) && !(loadedCases || []).some((testCase) => testCase?.graphPath)) {
    const qualityReport = evaluateContextQualityCases(loadedCases);
    const report = {
      ...qualityReport,
      generatedAt: now,
    };
    if (out) {
      const outPath = resolve(rootDir, out);
      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
      report.outPath = outPath;
    }
    return report;
  }
  const results = [];
  for (const testCase of loadedCases || []) {
    results.push(await evaluateContextCase({ rootDir, testCase, now }));
  }
  const passed = results.filter((result) => result.pass).length;
  const report = {
    schemaVersion: 1,
    generatedAt: now,
    pass: results.length > 0 && passed === results.length,
    summary: {
      total: results.length,
      passed,
      failed: results.length - passed,
      averageScore: results.length ? Number((results.reduce((sum, result) => sum + result.score, 0) / results.length).toFixed(2)) : 0,
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

export async function evaluateContextCase({ rootDir = process.cwd(), testCase = {}, now = new Date().toISOString() } = {}) {
  const pack = await buildContextPack({
    rootDir,
    graphPath: resolve(rootDir, testCase.graphPath),
    itemId: testCase.itemId,
    query: testCase.query || "",
    maxChars: testCase.maxChars || 12_000,
    now,
  });
  const checks = [
    check("active-item", pack.activeItem?.itemId === testCase.itemId, `expected active item ${testCase.itemId}`),
    ...containsAll("memory", testCase.expectMemoryIds, (pack.memory || []).map((entry) => entry.id)),
    ...containsAll("evidence", testCase.expectEvidence, (pack.evidence || []).map((entry) => `${entry.kind || ""} ${entry.path || ""} ${entry.command || ""} ${entry.summary || ""}`)),
    ...containsAll("semantic-anchor", testCase.expectSemanticAnchors, (pack.semanticAnchors || []).map((entry) => entry.anchorId)),
  ];
  if (testCase.maxEstimatedTokens) {
    checks.push(check("token-budget", pack.summary.estimatedTokens <= Number(testCase.maxEstimatedTokens), `tokens ${pack.summary.estimatedTokens} <= ${testCase.maxEstimatedTokens}`));
  }
  const pass = checks.every((entry) => entry.pass);
  const score = checks.length ? Number(((checks.filter((entry) => entry.pass).length / checks.length) * 10).toFixed(2)) : 0;
  return {
    id: testCase.id || testCase.itemId || "context-case",
    pass,
    score,
    estimatedTokens: pack.summary.estimatedTokens,
    checks,
  };
}

export function formatContextEvalReport(report = {}) {
  if (report.kind === "context-quality") return formatContextQualityReport(report);
  return [
    "SUPERVIBE_CONTEXT_EVAL",
    `PASS: ${Boolean(report.pass)}`,
    `CASES: ${report.summary?.total || 0}`,
    `PASSED: ${report.summary?.passed || 0}`,
    `FAILED: ${report.summary?.failed || 0}`,
    `SCORE_AVG: ${report.summary?.averageScore || 0}/10`,
    ...((report.cases || []).map((item) => `- ${item.id}: pass=${item.pass} score=${item.score} tokens=${item.estimatedTokens}`)),
    ...(report.outPath ? [`OUT: ${report.outPath}`] : []),
  ].join("\n");
}

async function readCases(filePath) {
  if (!existsSync(filePath)) return [];
  const parsed = JSON.parse(await readFile(filePath, "utf8"));
  return Array.isArray(parsed) ? parsed : parsed.cases || [];
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
