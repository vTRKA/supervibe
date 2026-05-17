const DEFAULT_LIMIT = 10;

const SOURCE_PREFIXES = [
  "scripts/lib/",
  "scripts/",
  "src/",
  "lib/",
  "packages/",
  "apps/",
];

const SOURCE_NOISE_PREFIXES = [
  ".supervibe/",
  "tests/",
  "test/",
  "fixtures/",
  "docs/",
  "agents/",
  "skills/",
  "rules/",
  "commands/",
  "node_modules/",
  "dist/",
  "build/",
  "coverage/",
];

const HARD_NOISE_PREFIXES = [
  ".supervibe/",
  "node_modules/",
  "dist/",
  "build/",
  "coverage/",
];

const ARTIFACT_PREFIXES = [
  "agents/",
  "skills/",
  "rules/",
  "commands/",
  "docs/",
  "schemas/",
  "templates/",
  "references/",
  "questionnaires/",
  "confidence-rubrics/",
  "hooks/",
];

const ARTIFACT_ROLES = new Set([
  "agent",
  "skill",
  "rule",
  "command",
  "docs",
  "config",
  "registry",
  "template",
  "reference",
  "questionnaire",
  "rubric",
  "hook",
]);

const ARTIFACT_QUERY_HINTS = new Set([
  "agent",
  "agents",
  "skill",
  "skills",
  "rule",
  "rules",
  "command",
  "commands",
  "slash",
  "workflow",
  "receipt",
  "receipts",
  "registry",
  "schema",
  "schemas",
  "template",
  "templates",
  "reference",
  "references",
  "questionnaire",
  "questionnaires",
  "rubric",
  "rubrics",
  "hook",
  "hooks",
  "readme",
  "agents.md",
  "docs",
  "documentation",
]);

const HYBRID_CODE_SEARCH_POLICY = "hybrid-lexical-embedding-v1";

export async function runHybridCodeSearch(store, {
  query,
  language = null,
  kind = null,
  limit = DEFAULT_LIMIT,
  semantic = true,
} = {}) {
  const normalizedLimit = normalizeLimit(limit);
  const poolLimit = Math.max(normalizedLimit * 3, normalizedLimit);
  const lexicalResults = await store.search({
    query,
    language,
    kind,
    limit: poolLimit,
    semantic: false,
  });

  let mergedResults = lexicalResults;
  if (semantic) {
    mergedResults = await store.search({
      query,
      language,
      kind,
      limit: poolLimit,
      semantic: true,
    });
  }

  const results = rankHybridCodeSearchResults(mergedResults, {
    query,
    limit: normalizedLimit,
  });
  const retrieval = buildHybridRetrievalEvidence({
    query,
    semanticRequested: Boolean(semantic),
    lexicalResults,
    mergedResults,
    results,
  });
  return { results, retrieval };
}

export function rankHybridCodeSearchResults(results = [], {
  query = "",
  limit = DEFAULT_LIMIT,
} = {}) {
  const normalizedLimit = normalizeLimit(limit);
  return (results || [])
    .map((row, index) => {
      const preference = scoreSourceBackedOwner(row, query);
      const rankScore = 1 / (60 + index + 1);
      const baseScore = Number.isFinite(Number(row.score)) && Number(row.score) > 0
        ? Number(row.score)
        : 0;
      const adjustedScore = baseScore + rankScore + preference.score;
      return {
        ...row,
        sourceBacked: preference.sourceBacked,
        artifactBacked: preference.artifactBacked,
        ownerMatch: preference.ownerMatch,
        retrievalLane: preference.retrievalLane,
        scoreComponents: {
          ...(row.scoreComponents || {}),
          sourceBacked: Number(preference.score.toFixed(6)),
          adjusted: Number(adjustedScore.toFixed(6)),
        },
        __hybridAdjustedScore: adjustedScore,
        __hybridOriginalIndex: index,
      };
    })
    .sort((a, b) =>
      b.__hybridAdjustedScore - a.__hybridAdjustedScore ||
      Number(b.score || 0) - Number(a.score || 0) ||
      a.__hybridOriginalIndex - b.__hybridOriginalIndex
    )
    .slice(0, normalizedLimit)
    .map(({ __hybridAdjustedScore, __hybridOriginalIndex, ...row }) => row);
}

function buildHybridRetrievalEvidence({
  query = "",
  semanticRequested = true,
  lexicalResults = [],
  mergedResults = [],
  results = [],
} = {}) {
  const modeSet = new Set();
  const mergedModeSet = new Set();
  const lexicalCount = lexicalResults.length;
  const mergedCount = mergedResults.length;
  const semanticUsed = mergedResults.some(hasSemanticSignal);
  const mergedScoringUsed = mergedResults.some(hasMergedSignal);

  if (lexicalCount > 0 || mergedResults.some(hasLexicalSignal)) {
    modeSet.add("lexical");
  }
  if (semanticUsed) {
    modeSet.add("semantic");
  }
  if (mergedScoringUsed) {
    modeSet.add("merged-scoring");
  }

  for (const row of mergedResults) {
    for (const mode of modesForResult(row)) mergedModeSet.add(mode);
  }

  const fallback = computeFallbackEvidence({
    semanticRequested,
    lexicalCount,
    mergedCount,
    semanticUsed,
    mergedScoringUsed,
  });
  const routing = inferRetrievalRouting(query);
  const roleCounts = countResultRoles(results);

  return {
    policy: HYBRID_CODE_SEARCH_POLICY,
    query,
    requested: {
      lexical: true,
      semantic: Boolean(semanticRequested),
      mergedScoring: Boolean(semanticRequested),
    },
    usedModes: [...modeSet],
    resultModes: [...mergedModeSet],
    counts: {
      lexical: lexicalCount,
      merged: mergedCount,
      returned: results.length,
      sourceBacked: results.filter((row) => row.sourceBacked).length,
      artifactBacked: results.filter((row) => row.artifactBacked).length,
      ownerMatches: results.filter((row) => row.ownerMatch).length,
      roles: roleCounts,
    },
    routing,
    fallback,
    scoring: {
      merge: "CodeStore RRF when lexical and semantic signals are available",
      rerank: routing.intent === "artifact" ? "artifact lanes boosted for command/agent/skill/rule/docs queries" : "source-backed owner modules boosted; generated/test/docs artifact lanes limited for source queries",
    },
  };
}

export function formatHybridRetrievalEvidence(retrieval = {}) {
  const usedModes = retrieval.usedModes?.length
    ? retrieval.usedModes.join(", ")
    : "none";
  const fallback = retrieval.fallback?.used
    ? `fallback=${retrieval.fallback.reason}`
    : `fallback=not-used (${retrieval.fallback?.reason || "merged candidates available"})`;
  const counts = retrieval.counts
    ? `counts=lexical:${retrieval.counts.lexical || 0}, merged:${retrieval.counts.merged || 0}, returned:${retrieval.counts.returned || 0}`
    : "counts=unknown";
  const routing = retrieval.routing
    ? `routing=${retrieval.routing.intent}/${retrieval.routing.lane}`
    : "routing=unknown";
  return `Retrieval modes used: ${usedModes}; ${fallback}; ${counts}; ${routing}; policy=${retrieval.policy || HYBRID_CODE_SEARCH_POLICY}`;
}

function normalizeLimit(limit) {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.trunc(parsed);
}

function normalizePath(path = "") {
  return String(path || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function tokenize(text = "") {
  return new Set(
    String(text || "")
      .toLowerCase()
      .split(/[^a-z0-9_$-]+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3)
  );
}

function scoreSourceBackedOwner(row = {}, query = "") {
  const path = normalizePath(row.file || row.path || "");
  const lowerPath = path.toLowerCase();
  const role = String(row.metadata?.fileRole || row.fileRole || "source").toLowerCase();
  const artifactType = String(row.metadata?.artifactType || row.artifactType || "source-code").toLowerCase();
  const routing = inferRetrievalRouting(query);
  const hardNoise = Boolean(row.generatedSource) || HARD_NOISE_PREFIXES.some((prefix) => lowerPath.startsWith(prefix));
  const sourceNoise = hardNoise || SOURCE_NOISE_PREFIXES.some((prefix) => lowerPath.startsWith(prefix));
  const sourceBacked = !sourceNoise && SOURCE_PREFIXES.some((prefix) => lowerPath.startsWith(prefix));
  const artifactBacked = !hardNoise && (ARTIFACT_ROLES.has(role) || ARTIFACT_PREFIXES.some((prefix) => lowerPath.startsWith(prefix)) || artifactType.startsWith("supervibe-"));
  const queryTokens = tokenize(query);
  const candidateText = [
    path,
    role,
    artifactType,
    row.kind || "",
    row.name || "",
    row.metadata?.heading || "",
    ...(row.metadata?.symbolHints || []),
    row.snippet || "",
  ].join(" ").toLowerCase();

  let tokenMatches = 0;
  for (const token of queryTokens) {
    if (candidateText.includes(token)) tokenMatches += 1;
  }

  let score = 0;
  if (routing.intent === "artifact") {
    if (artifactBacked) score += 0.09;
    if (sourceBacked) score += 0.02;
    if (tokenMatches > 0) score += Math.min(0.1, tokenMatches * 0.018);
    if (artifactBacked && tokenMatches >= 2) score += 0.08;
    if (hardNoise) score -= 0.12;
  } else {
    if (sourceBacked) score += 0.05;
    if (tokenMatches > 0) score += Math.min(0.08, tokenMatches * 0.015);
    if (sourceBacked && tokenMatches >= 2) score += 0.08;
    if (sourceBacked && row.name && queryTokens.has(String(row.name).toLowerCase())) score += 0.04;
    if (sourceNoise) score -= 0.12;
  }
  if (String(row.kind || "").toLowerCase() === "leftover") score -= 0.02;

  return {
    score,
    sourceBacked,
    artifactBacked,
    retrievalLane: routing.intent === "artifact" && artifactBacked ? "artifact" : sourceBacked ? "source" : role,
    ownerMatch: (routing.intent === "artifact" ? artifactBacked : sourceBacked) && tokenMatches >= 2,
  };
}


function inferRetrievalRouting(query = "") {
  const normalized = String(query || "").toLowerCase();
  const tokens = tokenize(normalized);
  for (const hint of ARTIFACT_QUERY_HINTS) {
    if (normalized.includes(hint) || tokens.has(hint)) {
      return { intent: "artifact", lane: "artifact", reason: "query mentions Supervibe artifact/documentation surface" };
    }
  }
  return { intent: "source", lane: "source", reason: "query does not request an artifact lane" };
}

function countResultRoles(results = []) {
  const counts = {};
  for (const row of results || []) {
    const role = String(row.metadata?.fileRole || row.fileRole || row.retrievalLane || "source");
    counts[role] = (counts[role] || 0) + 1;
  }
  return counts;
}
function modesForResult(row = {}) {
  const mode = String(row.retrievalMode || "").toLowerCase();
  const modes = new Set();
  if (mode === "hybrid") {
    modes.add("lexical");
    modes.add("semantic");
    modes.add("merged-scoring");
  } else if (mode === "semantic") {
    modes.add("semantic");
  } else if (mode === "fts" || mode === "fts-relaxed" || mode === "lexical") {
    modes.add("lexical");
  }
  if (hasLexicalSignal(row)) modes.add("lexical");
  if (hasSemanticSignal(row)) modes.add("semantic");
  if (hasMergedSignal(row)) modes.add("merged-scoring");
  return [...modes];
}

function hasLexicalSignal(row = {}) {
  const mode = String(row.retrievalMode || "").toLowerCase();
  return mode === "fts" || mode === "fts-relaxed" || mode === "hybrid" || Number(row.bm25 || row.scoreComponents?.bm25 || 0) > 0;
}

function hasSemanticSignal(row = {}) {
  const mode = String(row.retrievalMode || "").toLowerCase();
  return mode === "semantic" || mode === "hybrid" || Number(row.semantic || row.scoreComponents?.semantic || 0) > 0;
}

function hasMergedSignal(row = {}) {
  const mode = String(row.retrievalMode || "").toLowerCase();
  return mode === "hybrid" || (hasLexicalSignal(row) && hasSemanticSignal(row));
}

function computeFallbackEvidence({
  semanticRequested,
  lexicalCount,
  mergedCount,
  semanticUsed,
  mergedScoringUsed,
}) {
  if (!semanticRequested) {
    return {
      used: true,
      reason: "semantic-disabled-lexical-only",
      evidence: "semantic search was disabled by request; lexical FTS results are authoritative fallback",
    };
  }
  if (mergedCount === 0) {
    return {
      used: true,
      reason: "no-candidates",
      evidence: "lexical and semantic retrieval returned no candidates",
    };
  }
  if (lexicalCount === 0 && semanticUsed) {
    return {
      used: true,
      reason: "lexical-empty-semantic-fallback",
      evidence: "lexical FTS returned no candidates; semantic embedding candidates supplied results",
    };
  }
  if (lexicalCount > 0 && !semanticUsed) {
    return {
      used: true,
      reason: "semantic-unavailable-or-zero-signal",
      evidence: "semantic search was requested, but returned no semantic signal; lexical candidates supplied results",
    };
  }
  if (lexicalCount > 0 && semanticUsed && !mergedScoringUsed) {
    return {
      used: true,
      reason: "separate-lexical-and-semantic-signals",
      evidence: "lexical and semantic candidates were available, but no single result carried both signals",
    };
  }
  return {
    used: false,
    reason: "merged-lexical-semantic",
    evidence: "lexical and semantic signals were merged for ranking",
  };
}
