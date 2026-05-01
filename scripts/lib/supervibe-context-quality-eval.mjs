const DEFAULT_THRESHOLDS = Object.freeze({
  contextRecall: 0.85,
  contextPrecision: 0.7,
  citationValidity: 0.95,
  graphImpactRecall: 0.9,
});

export function evaluateContextQualityCases(cases = [], { thresholds = DEFAULT_THRESHOLDS } = {}) {
  const results = (cases || [])
    .filter((testCase) => testCase?.quality)
    .map((testCase) => evaluateContextQualityCase(testCase, { thresholds }));
  const aggregate = aggregateQualityResults(results);
  const pass = results.length > 0 && results.every((result) => result.pass) && aggregate.pass;
  return {
    schemaVersion: 1,
    kind: "context-quality",
    pass,
    thresholds,
    summary: {
      total: results.length,
      passed: results.filter((result) => result.pass).length,
      failed: results.filter((result) => !result.pass).length,
      ...aggregate.metrics,
    },
    cases: results,
  };
}

function evaluateContextQualityCase(testCase = {}, { thresholds = DEFAULT_THRESHOLDS } = {}) {
  const quality = testCase.quality || {};
  const gold = quality.gold || {};
  const retrieved = quality.retrieved || {};
  const memory = setMetrics(gold.memoryIds, retrieved.memoryIds);
  const source = setMetrics(gold.sourceChunkIds, retrieved.sourceChunkIds);
  const graph = setMetrics(gold.graphSymbols, retrieved.graphSymbols);
  const citations = retrieved.citations || [];
  const validCitations = citations.filter((citation) => citation?.id && citation?.source && citation?.path && citation?.redacted !== false);
  const staleEvidence = (retrieved.evidence || []).filter((entry) => entry?.stale === true);
  const contradictionRequired = Boolean(gold.contradiction);
  const contradictionDetected = !contradictionRequired || Boolean(retrieved.contradictionWarning);
  const tokenBudgetCompliance = !quality.tokenBudget
    || Number(retrieved.estimatedTokens || 0) <= Number(quality.tokenBudget.maxTokens || Number.POSITIVE_INFINITY);
  const contextRecall = average([memory.recall, source.recall, graph.recall]);
  const contextPrecision = average([memory.precision, source.precision, graph.precision]);
  const citationValidity = citations.length ? validCitations.length / citations.length : 1;
  const staleEvidenceRate = retrieved.evidence?.length ? staleEvidence.length / retrieved.evidence.length : 0;
  const checks = [
    check("context-recall", contextRecall >= thresholds.contextRecall, `context recall below threshold: ${round(contextRecall)} < ${thresholds.contextRecall}`),
    check("context-precision", contextPrecision >= thresholds.contextPrecision, `context precision below threshold: ${round(contextPrecision)} < ${thresholds.contextPrecision}`),
    check("citation-validity", citationValidity >= thresholds.citationValidity, `citation precision below threshold: ${round(citationValidity)} < ${thresholds.citationValidity}`),
    check("graph-impact-recall", graph.recall >= thresholds.graphImpactRecall, `graph impact recall below threshold: ${round(graph.recall)} < ${thresholds.graphImpactRecall}`),
    check("stale-evidence-rate", staleEvidenceRate === 0, `stale evidence rate must be zero for release cases, got ${round(staleEvidenceRate)}`),
    check("contradiction-detection", contradictionDetected, "contradiction was expected but not detected"),
    check("token-budget", tokenBudgetCompliance, "context pack exceeded token budget"),
  ];
  return {
    id: testCase.id || "context-quality-case",
    pass: checks.every((entry) => entry.pass),
    metrics: {
      memoryRecall: round(memory.recall),
      memoryPrecision: round(memory.precision),
      sourceChunkRecall: round(source.recall),
      sourceChunkPrecision: round(source.precision),
      graphImpactRecall: round(graph.recall),
      graphImpactPrecision: round(graph.precision),
      contextRecall: round(contextRecall),
      contextPrecision: round(contextPrecision),
      citationValidity: round(citationValidity),
      staleEvidenceRate: round(staleEvidenceRate),
      contradictionDetected,
      tokenBudgetCompliance,
    },
    checks,
  };
}

export function formatContextQualityReport(report = {}) {
  const lines = [
    "SUPERVIBE_CONTEXT_QUALITY_EVAL",
    `PASS: ${Boolean(report.pass)}`,
    `CASES: ${report.summary?.total || 0}`,
    `CONTEXT_RECALL: ${report.summary?.contextRecall ?? 0}`,
    `CONTEXT_PRECISION: ${report.summary?.contextPrecision ?? 0}`,
    `CITATION_VALIDITY: ${report.summary?.citationValidity ?? 0}`,
    `GRAPH_IMPACT_RECALL: ${report.summary?.graphImpactRecall ?? 0}`,
  ];
  for (const result of report.cases || []) {
    lines.push(`- ${result.id}: pass=${result.pass} recall=${result.metrics.contextRecall} precision=${result.metrics.contextPrecision} graph=${result.metrics.graphImpactRecall}`);
    for (const failure of result.checks.filter((entry) => !entry.pass)) lines.push(`  ! ${failure.message}`);
  }
  return lines.join("\n");
}

function aggregateQualityResults(results = []) {
  const metrics = {
    contextRecall: round(average(results.map((result) => result.metrics.contextRecall))),
    contextPrecision: round(average(results.map((result) => result.metrics.contextPrecision))),
    citationValidity: round(average(results.map((result) => result.metrics.citationValidity))),
    graphImpactRecall: round(average(results.map((result) => result.metrics.graphImpactRecall))),
  };
  return {
    pass: results.length > 0
      && metrics.contextRecall >= DEFAULT_THRESHOLDS.contextRecall
      && metrics.contextPrecision >= DEFAULT_THRESHOLDS.contextPrecision
      && metrics.citationValidity >= DEFAULT_THRESHOLDS.citationValidity
      && metrics.graphImpactRecall >= DEFAULT_THRESHOLDS.graphImpactRecall,
    metrics,
  };
}

function setMetrics(goldValues = [], retrievedValues = []) {
  const gold = new Set((goldValues || []).map(String));
  const retrieved = new Set((retrievedValues || []).map(String));
  const hits = [...retrieved].filter((value) => gold.has(value)).length;
  return {
    recall: gold.size ? hits / gold.size : 1,
    precision: retrieved.size ? hits / retrieved.size : 1,
  };
}

function check(name, pass, message) {
  return { name, pass: Boolean(pass), message };
}

function average(values = []) {
  const usable = values.filter((value) => Number.isFinite(value));
  if (!usable.length) return 0;
  return usable.reduce((sum, value) => sum + value, 0) / usable.length;
}

function round(value) {
  return Number((Number.isFinite(value) ? value : 0).toFixed(3));
}
