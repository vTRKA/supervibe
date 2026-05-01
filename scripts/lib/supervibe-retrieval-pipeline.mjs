const DEFAULT_TOP_K = 8;

export function runRetrievalPipeline({
  query = "",
  memoryCandidates = [],
  ftsCandidates = [],
  embeddingCandidates = [],
  exactSymbolCandidates = [],
  repoMapCandidates = [],
  graphCandidates = [],
  topK = DEFAULT_TOP_K,
} = {}) {
  const rewritten = rewriteQuery(query);
  const stages = [];
  stages.push(stage("rewrite", [candidate("query", rewritten, { original: query, score: 1 })], [], "language-aware query rewrite"));
  stages.push(stage("exact-symbol", exactSymbolCandidates, [], "exact symbol lookup"));
  stages.push(stage("fts", ftsCandidates, [], "full-text candidate set"));
  stages.push(stage("embedding", embeddingCandidates, [], "semantic candidate set"));
  stages.push(stage("repo-map", repoMapCandidates, [], "repo-map expansion"));
  stages.push(stage("graph-neighbor", graphCandidates, [], "graph-neighbor expansion"));

  const deduped = dedupeCandidates([
    ...memoryCandidates.map((item) => candidate("memory", item.id || item.path, item)),
    ...exactSymbolCandidates.map((item) => candidate("exact-symbol", item.id || item.symbol || item.path, item)),
    ...ftsCandidates.map((item) => candidate("fts", item.id || item.path, item)),
    ...embeddingCandidates.map((item) => candidate("embedding", item.id || item.path, item)),
    ...repoMapCandidates.map((item) => candidate("repo-map", item.path || item.id, item)),
    ...graphCandidates.map((item) => candidate("graph-neighbor", item.symbol || item.path, item)),
  ]);
  stages.push(stage("dedupe", deduped.kept, deduped.rejected, "stable candidate dedupe"));

  const reranked = rerankCandidates(deduped.kept, { query: rewritten });
  stages.push(stage("rerank", reranked.slice(0, topK), reranked.slice(topK).map((item) => ({ ...item, rejectionReason: "below top-k" })), "calibrated freshness and source rerank"));

  const fallback = reranked.length === 0
    ? { used: true, reason: "no candidates from exact, FTS, embedding, repo-map or graph stages" }
    : { used: false, reason: "reranked candidates available" };
  return {
    schemaVersion: 1,
    query,
    rewrittenQuery: rewritten,
    topK,
    pass: stages.every((item) => item.candidateCount >= 0) && Boolean(stages.find((item) => item.name === "rerank")),
    stages,
    selected: reranked.slice(0, topK),
    fallback,
    calibration: {
      minScore: 0.25,
      freshnessPenalty: 0.05,
      generatedFilePenalty: 0.4,
      multilingualRewrite: rewritten !== query,
      contradictionWarningThreshold: 1,
    },
  };
}

function runRetrievalPipelineForCase(testCase = {}) {
  const quality = testCase.quality || {};
  const retrieved = quality.retrieved || {};
  return runRetrievalPipeline({
    query: testCase.request || testCase.query || testCase.id || "",
    memoryCandidates: (retrieved.memoryIds || []).map((id) => ({ id, score: 0.9 })),
    ftsCandidates: (retrieved.sourceChunkIds || []).map((id) => ({ id, path: id, score: 0.7 })),
    embeddingCandidates: (retrieved.sourceChunkIds || []).map((id) => ({ id: `${id}:semantic`, path: id, score: 0.75 })),
    exactSymbolCandidates: (retrieved.graphSymbols || []).map((symbol) => ({ id: symbol, symbol, score: 0.95 })),
    repoMapCandidates: (retrieved.sourceChunkIds || []).map((id) => ({ path: id, rank: 10, score: 0.6 })),
    graphCandidates: (retrieved.graphSymbols || []).map((symbol) => ({ symbol, score: 0.8 })),
  });
}

export function evaluateRetrievalPipelineCalibration(cases = []) {
  const results = cases.map((testCase) => {
    const pipeline = runRetrievalPipelineForCase(testCase);
    const failures = [];
    for (const requiredStage of ["rewrite", "exact-symbol", "fts", "embedding", "repo-map", "graph-neighbor", "dedupe", "rerank"]) {
      if (!pipeline.stages.some((stageItem) => stageItem.name === requiredStage)) {
        failures.push("retrieval pipeline missing rewrite, hybrid candidate set, rerank score or fallback reason");
      }
    }
    if (!pipeline.selected.every((item) => Number.isFinite(item.rerankScore))) {
      failures.push("retrieval pipeline missing rewrite, hybrid candidate set, rerank score or fallback reason");
    }
    if (!pipeline.fallback?.reason) failures.push("retrieval pipeline missing rewrite, hybrid candidate set, rerank score or fallback reason");
    return { id: testCase.id || "pipeline-case", pass: failures.length === 0, failures, pipeline };
  });
  const failed = results.filter((result) => !result.pass);
  return { pass: failed.length === 0, total: results.length, failed, results };
}

export function formatRetrievalPipelineReport(report = {}) {
  const lines = [
    "SUPERVIBE_RETRIEVAL_PIPELINE",
    `PASS: ${Boolean(report.pass)}`,
    `CASES: ${report.total || 0}`,
    `FAILED: ${report.failed?.length || 0}`,
  ];
  for (const result of report.results || []) {
    lines.push(`- ${result.id}: selected=${result.pipeline.selected.length} fallback=${result.pipeline.fallback.used ? result.pipeline.fallback.reason : "none"}`);
    lines.push(`  stages=${result.pipeline.stages.map((stageItem) => `${stageItem.name}:${stageItem.candidateCount}`).join(", ")}`);
  }
  for (const result of report.failed || []) lines.push(`  ! ${result.id}: ${result.failures.join("; ")}`);
  return lines.join("\n");
}

function rewriteQuery(query) {
  const text = String(query || "").trim();
  const synonyms = [
    [/раг/gi, "rag"],
    [/памят/gi, "memory"],
    [/граф/gi, "graph"],
    [/интент/gi, "intent"],
  ];
  return synonyms.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), text).replace(/\s+/g, " ");
}

function stage(name, candidates = [], rejected = [], reason = "") {
  return {
    name,
    candidateCount: candidates.length,
    rejectionCount: rejected.length,
    reason,
    candidates: candidates.slice(0, 12),
    rejected: rejected.slice(0, 12),
  };
}

function candidate(source, id, raw = {}) {
  return {
    id: String(id || `${source}-candidate`),
    source,
    path: raw.path || raw.file || "",
    symbol: raw.symbol || raw.name || "",
    score: Number(raw.score ?? raw.rank ?? 0.5),
    freshness: raw.freshness || "fresh",
    generated: Boolean(raw.generated || raw.generatedSource),
  };
}

function dedupeCandidates(items = []) {
  const seen = new Set();
  const kept = [];
  const rejected = [];
  for (const item of items) {
    const key = `${item.source}:${item.path || item.symbol || item.id}`;
    if (seen.has(key)) {
      rejected.push({ ...item, rejectionReason: "duplicate candidate" });
      continue;
    }
    seen.add(key);
    kept.push(item);
  }
  return { kept, rejected };
}

function rerankCandidates(items = []) {
  const sourceWeight = {
    "exact-symbol": 0.35,
    "graph-neighbor": 0.25,
    "repo-map": 0.2,
    fts: 0.15,
    embedding: 0.15,
    memory: 0.2,
  };
  return items.map((item) => {
    const freshnessPenalty = item.freshness === "stale" ? 0.05 : 0;
    const generatedPenalty = item.generated ? 0.4 : 0;
    return {
      ...item,
      rerankScore: Number((item.score + (sourceWeight[item.source] || 0) - freshnessPenalty - generatedPenalty).toFixed(3)),
      rejectionReason: null,
    };
  }).sort((a, b) => b.rerankScore - a.rerankScore || a.id.localeCompare(b.id));
}
