import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { hashFile } from './file-hash.mjs';
import { discoverSourceFiles, GENERATED_DIRS } from './supervibe-index-policy.mjs';
import { isGraphIndexableLanguage } from './code-chunker.mjs';
import { CODEGRAPH_INDEX_COMMAND, SOURCE_RAG_INDEX_COMMAND } from './supervibe-command-catalog.mjs';

const DEFAULT_COVERAGE_THRESHOLD = 0.9;
function isGeneratedSourcePath(filePath = '') {
  const normalized = String(filePath).replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  return segments.some((segment, index) => GENERATED_DIRS.has(segment) && !(index === 0 && segment === 'bin'));
}

function looksMinifiedSymbolName(name = '') {
  if (!name || typeof name !== 'string') return false;
  if (name.length === 1) return true;
  if (/^_[A-Za-z0-9]$/.test(name)) return true;
  if (/^[A-Z][a-zA-Z]$/.test(name)) return true;
  return /^[a-z]{2}$/.test(name);
}

export function buildIndexHealthSnapshot({
  manifest = {},
  coverageThreshold = DEFAULT_COVERAGE_THRESHOLD,
  generatedAt = 'deterministic-local',
} = {}) {
  const indexedPaths = normalizeIndexedPaths(manifest.indexedPaths || []);
  const generatedIndexedFiles = manifest.generatedIndexedFiles
    ? normalizeIndexedPaths(manifest.generatedIndexedFiles)
    : indexedPaths.filter(isGeneratedSourcePath);
  const eligibleSourceFiles = numberOrZero(manifest.eligibleSourceFiles);
  const indexedSourceFiles = numberOrZero(manifest.indexedSourceFiles ?? manifest.indexedFiles);
  const staleRows = normalizeIndexedPaths(manifest.staleRows || []);
  const contentChangedRows = normalizeIndexedPaths(manifest.contentChangedRows || []);
  const partialIndexedFiles = normalizeIndexedPaths(manifest.partialIndexedFiles || []);
  const languageCoverage = normalizeLanguageCoverage(manifest.languageCoverage || {});
  const symbolQuality = normalizeSymbolQuality(manifest.symbolQuality || {}, manifest.topSymbols || []);
  const graphHealth = normalizeGraphHealthMetrics(manifest.graphHealth || {});
  const crossResolvedEdges = normalizeCrossResolvedEdges(manifest.crossResolvedEdges || graphHealth.crossResolvedEdges || {
    resolved: manifest.resolvedEdges,
    total: manifest.totalEdges,
  });
  const eligibleProjectEdges = normalizeEligibleProjectEdges(manifest.eligibleProjectEdges || graphHealth.eligibleProjectEdges || {});
  const graphVersionStaleRows = normalizeIndexedPaths(manifest.graphVersionStaleRows || graphHealth.graphVersionStaleRows || []);
  const embeddingHealth = normalizeEmbeddingHealth(manifest.embeddingHealth || {});
  const chunkEntityHealth = normalizeChunkEntityHealth(manifest.chunkEntityHealth || {});
  const semanticAnchorHealth = normalizeSemanticAnchorHealth(manifest.semanticAnchorHealth || {});
  const retrievalLanes = normalizeRetrievalLanes(manifest.retrievalLanes || []);
  const sourceCoverage = eligibleSourceFiles === 0 ? 1 : indexedSourceFiles / eligibleSourceFiles;
  const issues = [];

  if (eligibleSourceFiles > 0 && sourceCoverage < coverageThreshold) {
    issues.push({
      code: 'indexed-source-coverage-below-threshold',
      severity: 'error',
      message: 'indexed source coverage below threshold',
      details: {
        indexedSourceFiles,
        eligibleSourceFiles,
        sourceCoverage,
        coverageThreshold,
      },
    });
  }

  if (generatedIndexedFiles.length > 0) {
    issues.push({
      code: 'generated-output-indexed-as-source',
      severity: 'error',
      message: 'generated output indexed as source',
      details: { generatedIndexedFiles },
    });
  }

  if (staleRows.length > 0) {
    issues.push({
      code: 'stale-index-rows',
      severity: 'warning',
      message: 'stale index rows present',
      details: { staleRows },
    });
  }

  if (contentChangedRows.length > 0) {
    issues.push({
      code: 'content-changed-index-rows',
      severity: 'error',
      message: 'indexed source content changed since last index write',
      details: { contentChangedRows },
    });
  }

  if (partialIndexedFiles.length > 0) {
    issues.push({
      code: 'partial-source-index-rows',
      severity: 'warning',
      message: 'partial source index rows present',
      details: { partialIndexedFiles },
    });
  }

  if (symbolQuality.minifiedTopSymbols.length > 0) {
    issues.push({
      code: 'minified-symbols-in-top-symbols',
      severity: 'warning',
      message: 'minified symbols appear in top graph symbols',
      details: { minifiedTopSymbols: symbolQuality.minifiedTopSymbols },
    });
  }

  if (embeddingHealth.totalChunks > 0 && embeddingHealth.embeddedChunks === 0) {
    issues.push({
      code: 'semantic-embeddings-unavailable',
      severity: 'warning',
      message: 'semantic embeddings are missing; search falls back to lexical/BM25',
      details: embeddingHealth,
    });
  } else if (embeddingHealth.totalChunks > 0 && embeddingHealth.coverage < 0.9) {
    issues.push({
      code: 'semantic-embeddings-partial',
      severity: 'warning',
      message: 'semantic embedding coverage is partial',
      details: embeddingHealth,
    });
  }

  if (chunkEntityHealth.rebuildRequired) {
    issues.push({
      code: 'chunk-entity-links-rebuild-required',
      severity: 'warning',
      message: 'chunk-to-entity link coverage is missing or stale',
      details: chunkEntityHealth,
    });
  }

  if (indexedSourceFiles > 0 && semanticAnchorHealth.totalAnchors === 0) {
    issues.push({
      code: 'semantic-anchors-missing',
      severity: 'warning',
      message: 'semantic anchors are missing for indexed code/artifacts',
      details: semanticAnchorHealth,
    });
  }

  if (graphVersionStaleRows.length > 0) {
    issues.push({
      code: 'graph-version-stale-rows',
      severity: 'warning',
      message: 'graph extractor version is stale for some graph-eligible rows',
      details: { graphVersionStaleRows },
    });
  }

  return {
    generatedAt,
    projectRoot: manifest.projectRoot || null,
    ok: !issues.some((issue) => issue.severity === 'error'),
    coverageThreshold,
    eligibleSourceFiles,
    indexedSourceFiles,
    sourceCoverage,
    generatedIndexedFiles,
    staleRows,
    contentChangedRows,
    partialIndexedFiles,
    languageCoverage,
    symbolQuality,
    graphHealth,
    graphVersionStaleRows,
    eligibleProjectEdges,
    crossResolvedEdges,
    embeddingHealth,
    chunkEntityHealth,
    semanticAnchorHealth,
    retrievalLanes,
    issues,
  };
}

export async function collectIndexHealthFromStore(store, {
  rootDir = process.cwd(),
  coverageThreshold = DEFAULT_COVERAGE_THRESHOLD,
  generatedAt = new Date().toISOString(),
} = {}) {
  const stats = store.stats();
  const grammarHealth = store.getGrammarHealth();
  const graphHealth = store.getGraphHealthMetrics();
  const embeddingHealth = store.getEmbeddingHealth();
  const chunkEntityHealth = store.getChunkEntityHealth();
  const semanticAnchorHealth = store.getSemanticAnchorHealth();
  const retrievalLanes = store.getRetrievalLaneHealth();
  const indexedRows = store.db.prepare('SELECT path, language, index_status AS indexStatus, content_hash AS contentHash FROM code_files ORDER BY path').all();
  const indexedPaths = indexedRows.map((row) => row.path);
  const partialIndexedFiles = indexedRows
    .filter((row) => row.indexStatus === 'partial')
    .map((row) => row.path);
  const generatedIndexedFiles = indexedPaths.filter(isGeneratedSourcePath);
  const staleRows = indexedPaths.filter((relPath) => !existsSync(join(rootDir, relPath)));
  const inventory = await collectEligibleSourceInventory(rootDir);
  const contentChangedRows = await collectContentChangedRows({ rootDir, inventory, indexedRows });
  const topSymbols = readTopSymbolNames(store);

  const eligibleByLanguage = new Map();
  for (const file of inventory.files) {
    eligibleByLanguage.set(file.language, (eligibleByLanguage.get(file.language) || 0) + 1);
  }

  const languageCoverage = {};
  for (const health of grammarHealth) {
    const eligible = eligibleByLanguage.get(health.language) || health.files;
    languageCoverage[health.language] = {
      eligible,
      indexed: health.files,
      filesWithSymbols: health.filesWithSymbols,
      configOnly: Boolean(health.configOnly),
      graphEligible: Boolean(health.graphEligible),
      retrievalOnly: health.graphEligible === false,
    };
  }
  for (const [language, eligible] of eligibleByLanguage) {
    if (!languageCoverage[language]) {
      const graphEligible = isGraphIndexableLanguage(language);
      languageCoverage[language] = { eligible, indexed: 0, filesWithSymbols: 0, configOnly: !graphEligible, graphEligible, retrievalOnly: !graphEligible };
    }
  }

  return buildIndexHealthSnapshot({
    manifest: {
      projectRoot: rootDir,
      eligibleSourceFiles: inventory.files.length,
      indexedSourceFiles: stats.totalFiles,
      indexedPaths,
      generatedIndexedFiles,
      staleRows,
      contentChangedRows,
      partialIndexedFiles,
      languageCoverage,
      topSymbols,
      graphHealth,
      graphVersionStaleRows: graphHealth.graphVersionStaleRows,
      eligibleProjectEdges: graphHealth.eligibleProjectEdges,
      embeddingHealth,
      chunkEntityHealth,
      semanticAnchorHealth,
      retrievalLanes,
      crossResolvedEdges: graphHealth.crossResolvedEdges || {
        resolved: stats.resolvedEdges,
        total: stats.totalEdges,
      },
    },
    coverageThreshold,
    generatedAt,
  });
}

async function collectContentChangedRows({ rootDir, inventory, indexedRows }) {
  const byPath = new Map(indexedRows.map((row) => [row.path, row]));
  const changed = [];
  for (const file of inventory.files) {
    const row = byPath.get(file.relPath);
    if (!row?.contentHash) continue;
    try {
      const currentHash = await hashFile(file.absPath);
      if (currentHash && currentHash !== row.contentHash) changed.push(file.relPath);
    } catch {
      // Missing files are reported through staleRows; unreadable files are handled by the indexer repair path.
    }
  }
  return changed;
}

async function collectEligibleSourceInventory(rootDir) {
  const inventory = await discoverSourceFiles(rootDir);
  return {
    files: inventory.files.map((file) => ({ path: file.absPath, absPath: file.absPath, relPath: file.relPath, language: file.language })),
  };
}

export function formatIndexHealth(health = {}) {
  const issueLines = (health.issues || []).length
    ? health.issues.map((issue) => `  - ${issue.severity}: ${issue.message}`).join('\n')
    : '  - none';
  const languageLines = Object.entries(health.languageCoverage || {})
    .map(([language, value]) => {
      const coverage = numberOrZero(value.coverage);
      const symbolCoverage = numberOrZero(value.symbolCoverage);
      return `  - ${language}: indexed ${value.indexed}/${value.eligible}, source ${(coverage * 100).toFixed(1)}%, symbols ${(symbolCoverage * 100).toFixed(1)}%`;
    });
  return [
    'SUPERVIBE_INDEX_HEALTH',
    `status: ${health.ok ? 'pass' : 'fail'}`,
    `eligibleSourceFiles: ${health.eligibleSourceFiles || 0}`,
    `indexedSourceFiles: ${health.indexedSourceFiles || 0}`,
    `sourceCoverage: ${(numberOrZero(health.sourceCoverage) * 100).toFixed(1)}%`,
    `generatedIndexedFiles: ${(health.generatedIndexedFiles || []).length}`,
    `staleRows: ${(health.staleRows || []).length}`,
    `contentChangedRows: ${(health.contentChangedRows || []).length}`,
    `partialRows: ${(health.partialIndexedFiles || []).length}`,
    `languageCoverage:`,
    ...(languageLines.length ? languageLines : ['  - none']),
    `symbolQuality:`,
    `  minifiedTopSymbols: ${health.symbolQuality?.minifiedTopSymbols?.join(', ') || 'none'}`,
    `semanticEmbeddings:`,
    `  status: ${health.embeddingHealth?.status || 'unknown'}`,
    `  embedded: ${health.embeddingHealth?.embeddedChunks || 0}/${health.embeddingHealth?.totalChunks || 0}`,
    `  coverage: ${(numberOrZero(health.embeddingHealth?.coverage) * 100).toFixed(1)}%`,
    `chunkEntityLinks:`,
    `  status: ${health.chunkEntityHealth?.status || 'unknown'}`,
    `  linkedChunks: ${health.chunkEntityHealth?.linkedChunks || 0}/${health.chunkEntityHealth?.totalChunks || 0}`,
    `  entities: ${health.chunkEntityHealth?.totalEntities || 0}`,
    `semanticAnchors:`,
    `  status: ${health.semanticAnchorHealth?.status || 'unknown'}`,
    `  total: ${health.semanticAnchorHealth?.totalAnchors || 0}`,
    `  derived: ${health.semanticAnchorHealth?.derivedAnchors || 0}`,
    `eligibleProjectEdges:`,
    `  resolved: ${health.eligibleProjectEdges?.resolved || 0}`,
    `  deterministic: ${health.eligibleProjectEdges?.deterministic || 0}`,
    `  rate: ${(numberOrZero(health.eligibleProjectEdges?.rate) * 100).toFixed(1)}%`,
    `crossResolvedEdges:`,
    `  resolved: ${health.crossResolvedEdges?.resolved || 0}`,
    `  total: ${health.crossResolvedEdges?.total || 0}`,
    `  rate: ${(numberOrZero(health.crossResolvedEdges?.rate) * 100).toFixed(1)}%`,
    `retrievalLanes:`,
    ...formatRetrievalLaneLines(health.retrievalLanes || []),
    `issues:`,
    issueLines,
  ].join('\n');
}

export function evaluateIndexHealthGate(health = {}, {
  coverageThreshold = health.coverageThreshold || DEFAULT_COVERAGE_THRESHOLD,
  minSymbolCoverage = 0.2,
  minCrossResolvedRate = 0.05,
  strictGraph = false,
} = {}) {
  const failedGates = [];
  const warnings = [];
  const eligible = numberOrZero(health.eligibleSourceFiles);
  const sourceCoverage = numberOrZero(health.sourceCoverage);

  if (eligible >= 10 && sourceCoverage < coverageThreshold) {
    failedGates.push({
      code: 'source-coverage',
      message: 'indexed source coverage below threshold',
      expected: coverageThreshold,
      actual: sourceCoverage,
    });
  }
  if ((health.generatedIndexedFiles || []).length > 0) {
    failedGates.push({
      code: 'generated-leakage',
      message: 'generated output indexed as source',
      actual: health.generatedIndexedFiles.length,
    });
  }
  if ((health.staleRows || []).length > 0) {
    failedGates.push({
      code: 'stale-rows',
      message: 'stale index rows present',
      actual: health.staleRows.length,
    });
  }
  if ((health.contentChangedRows || []).length > 0) {
    failedGates.push({
      code: 'content-stale',
      message: 'indexed source content changed since last index write',
      actual: health.contentChangedRows.length,
    });
  }
  if ((health.partialIndexedFiles || []).length > 0) {
    warnings.push({
      code: 'partial-source-rows',
      message: 'partial source index rows present',
      actual: health.partialIndexedFiles.length,
    });
  }
  for (const [language, value] of Object.entries(health.languageCoverage || {})) {
    const indexed = numberOrZero(value.indexed);
    const symbolCoverage = numberOrZero(value.symbolCoverage);
    if (indexed >= 5 && symbolCoverage < minSymbolCoverage) {
      if (value.configOnly || value.retrievalOnly) continue;
      const item = {
        code: 'symbol-coverage',
        language,
        message: 'language symbol coverage below threshold',
        expected: minSymbolCoverage,
        actual: symbolCoverage,
      };
      if (strictGraph) failedGates.push(item);
      else warnings.push(item);
    }
  }
  if ((health.symbolQuality?.minifiedTopSymbols || []).length > 0) {
    failedGates.push({
      code: 'symbol-quality',
      message: 'top graph symbols contain minified names',
      actual: health.symbolQuality.minifiedTopSymbols,
    });
  }
  const edgeTotal = numberOrZero(health.crossResolvedEdges?.total);
  const edgeRate = numberOrZero(health.crossResolvedEdges?.rate);
  if (edgeTotal >= 20 && edgeRate < minCrossResolvedRate) {
    warnings.push({
      code: 'cross-resolution',
      message: 'cross-resolved edge rate is low',
      expected: minCrossResolvedRate,
      actual: edgeRate,
    });
  }
  const eligibleEdges = health.eligibleProjectEdges || {};
  const deterministicEdges = numberOrZero(eligibleEdges.deterministic);
  const eligibleEdgeRate = numberOrZero(eligibleEdges.rate);
  if (deterministicEdges >= 20 && eligibleEdgeRate < 0.8) {
    const item = {
      code: 'eligible-project-edge-resolution',
      message: 'deterministic project edge resolution is below target',
      expected: 0.8,
      actual: eligibleEdgeRate,
    };
    if (strictGraph) failedGates.push(item);
    else warnings.push(item);
  }
  if ((health.graphVersionStaleRows || []).length > 0) {
    const item = {
      code: 'graph-version-stale',
      message: 'graph extractor version is stale for indexed rows',
      actual: health.graphVersionStaleRows.length,
    };
    if (strictGraph) failedGates.push(item);
    else warnings.push(item);
  }
  if (health.chunkEntityHealth?.rebuildRequired) {
    warnings.push({
      code: 'chunk-entity-links',
      message: 'chunk-to-entity links need rebuild',
      actual: health.chunkEntityHealth.status,
    });
  }
  if (health.embeddingHealth?.totalChunks > 0 && health.embeddingHealth?.embeddedChunks === 0) {
    warnings.push({
      code: 'semantic-embeddings-unavailable',
      message: 'semantic embeddings are unavailable; lexical retrieval remains usable',
      repairCommand: health.embeddingHealth.repairCommand,
    });
  }
  if (health.semanticAnchorHealth?.totalAnchors === 0 && numberOrZero(health.indexedSourceFiles) > 0) {
    warnings.push({
      code: 'semantic-anchors',
      message: 'semantic anchors are not populated for indexed context',
    });
  }

  const languageReadiness = {};
  for (const [language, value] of Object.entries(health.languageCoverage || {})) {
    const eligibleForLanguage = numberOrZero(value.eligible);
    const indexedForLanguage = numberOrZero(value.indexed);
    const sourceCoverageForLanguage = numberOrZero(value.coverage);
    const symbolCoverageForLanguage = numberOrZero(value.symbolCoverage);
    const sourceReady = eligibleForLanguage === 0 || sourceCoverageForLanguage >= coverageThreshold;
    const graphReady = value.configOnly || value.retrievalOnly || (indexedForLanguage === 0 ? sourceReady : symbolCoverageForLanguage >= minSymbolCoverage);
    languageReadiness[language] = {
      sourceReady,
      graphReady,
      eligible: eligibleForLanguage,
      indexed: indexedForLanguage,
      sourceCoverage: sourceCoverageForLanguage,
      symbolCoverage: symbolCoverageForLanguage,
      configOnly: Boolean(value.configOnly),
      retrievalOnly: Boolean(value.retrievalOnly),
      repairCommand: `${SOURCE_RAG_INDEX_COMMAND} --language ${language}`,
      graphRepairCommand: `${CODEGRAPH_INDEX_COMMAND} --language ${language}`,
    };
  }

  return {
    ready: failedGates.length === 0,
    eligibleSourceFiles: health.eligibleSourceFiles || 0,
    indexedSourceFiles: health.indexedSourceFiles || 0,
    sourceCoverage,
    failedGates,
    warnings,
    languageReadiness,
    repairCommand: SOURCE_RAG_INDEX_COMMAND,
    bm25RepairCommand: SOURCE_RAG_INDEX_COMMAND,
    graphRepairCommand: CODEGRAPH_INDEX_COMMAND,
  };
}

export function formatIndexHealthGate(gate = {}) {
  const failed = (gate.failedGates || []).map((item) => item.code).join(', ') || 'none';
  const warnings = (gate.warnings || []).map((item) => item.code).join(', ') || 'none';
  const indexed = numberOrZero(gate.indexedSourceFiles);
  const eligible = numberOrZero(gate.eligibleSourceFiles);
  const coverage = `${indexed}/${eligible} (${(numberOrZero(gate.sourceCoverage) * 100).toFixed(1)}%)`;
  return [
    'SUPERVIBE_INDEX_GATE',
    `READY: ${gate.ready ? 'true' : 'false'}`,
    `SOURCE_COVERAGE: ${coverage}`,
    `FAILED: ${failed}`,
    `WARNINGS: ${warnings}`,
    `REPAIR: ${gate.repairCommand || SOURCE_RAG_INDEX_COMMAND}`,
    `BM25_REPAIR: ${gate.bm25RepairCommand || SOURCE_RAG_INDEX_COMMAND}`,
    `GRAPH_REPAIR: ${gate.graphRepairCommand || CODEGRAPH_INDEX_COMMAND}`,
    'LANGUAGE_READY:',
    ...formatLanguageReadinessLines(gate.languageReadiness || {}),
  ].join('\n');
}

function formatLanguageReadinessLines(languageReadiness) {
  const entries = Object.entries(languageReadiness);
  if (entries.length === 0) return ['  - none'];
  return entries.map(([language, value]) => {
    return `  - ${language}: source=${value.sourceReady ? 'true' : 'false'} graph=${value.graphReady ? 'true' : 'false'} indexed=${value.indexed}/${value.eligible} repair=${value.repairCommand}`;
  });
}

function normalizeIndexedPaths(paths) {
  return [...new Set((paths || []).map((path) => String(path).replace(/\\/g, '/')).filter(Boolean))];
}

function normalizeLanguageCoverage(input) {
  const output = {};
  for (const [language, value] of Object.entries(input || {})) {
    const eligible = numberOrZero(value.eligible);
    const indexed = numberOrZero(value.indexed ?? value.files);
    const filesWithSymbols = numberOrZero(value.filesWithSymbols);
    output[language] = {
      eligible,
      indexed,
      filesWithSymbols,
      configOnly: Boolean(value.configOnly),
      graphEligible: value.graphEligible !== false,
      retrievalOnly: Boolean(value.retrievalOnly),
      coverage: eligible === 0 ? 1 : indexed / eligible,
      symbolCoverage: indexed === 0 ? 0 : filesWithSymbols / indexed,
    };
  }
  return output;
}


function normalizeEmbeddingHealth(input = {}) {
  const totalChunks = numberOrZero(input.totalChunks);
  const embeddedChunks = numberOrZero(input.embeddedChunks);
  const coverage = totalChunks === 0 ? 1 : numberOrZero(input.coverage || embeddedChunks / totalChunks);
  return {
    totalChunks,
    embeddedChunks,
    missingEmbeddings: numberOrZero(input.missingEmbeddings ?? Math.max(0, totalChunks - embeddedChunks)),
    coverage,
    semanticActive: Boolean(input.semanticActive ?? embeddedChunks > 0),
    status: input.status || (totalChunks === 0 ? 'empty' : embeddedChunks === 0 ? 'semantic-unavailable' : coverage >= 0.9 ? 'semantic-active' : 'partial-semantic'),
    repairCommand: input.repairCommand || SOURCE_RAG_INDEX_COMMAND + ' --resume --embeddings-only --max-files 100 --health',
  };
}

function normalizeChunkEntityHealth(input = {}) {
  const totalChunks = numberOrZero(input.totalChunks);
  const linkedChunks = numberOrZero(input.linkedChunks);
  return {
    pass: input.pass === true,
    status: input.status || 'unknown',
    totalChunks,
    totalEntities: numberOrZero(input.totalEntities),
    linkedChunks,
    coverage: totalChunks === 0 ? 1 : numberOrZero(input.coverage || linkedChunks / totalChunks),
    staleRows: numberOrZero(input.staleRows),
    version: numberOrZero(input.version),
    rebuildRequired: Boolean(input.rebuildRequired),
  };
}

function normalizeSemanticAnchorHealth(input = {}) {
  return {
    pass: input.pass === true,
    status: input.status || 'unknown',
    totalAnchors: numberOrZero(input.totalAnchors),
    derivedAnchors: numberOrZero(input.derivedAnchors),
    filesWithAnchors: numberOrZero(input.filesWithAnchors),
  };
}

function normalizeRetrievalLanes(input = []) {
  return (input || []).map((lane) => ({
    fileRole: String(lane.fileRole || 'source'),
    artifactType: String(lane.artifactType || 'source-code'),
    language: String(lane.language || 'unknown'),
    files: numberOrZero(lane.files),
    chunks: numberOrZero(lane.chunks),
    embeddedChunks: numberOrZero(lane.embeddedChunks),
    entities: numberOrZero(lane.entities),
  })).sort((a, b) => b.chunks - a.chunks || a.fileRole.localeCompare(b.fileRole));
}

function normalizeGraphHealthMetrics(input = {}) {
  return {
    ...input,
    graphVersionStaleRows: normalizeIndexedPaths(input.graphVersionStaleRows || []),
    eligibleProjectEdges: normalizeEligibleProjectEdges(input.eligibleProjectEdges || {}),
    crossResolvedEdges: normalizeCrossResolvedEdges(input.crossResolvedEdges || {}),
  };
}

function normalizeEligibleProjectEdges(input = {}) {
  const deterministic = numberOrZero(input.deterministic);
  const resolved = numberOrZero(input.resolved);
  return {
    deterministic,
    resolved,
    unresolved: numberOrZero(input.unresolved),
    ignored: numberOrZero(input.ignored),
    ambiguous: numberOrZero(input.ambiguous),
    missingSymbol: numberOrZero(input.missingSymbol),
    totalObserved: numberOrZero(input.totalObserved),
    rate: deterministic === 0 ? 1 : numberOrZero(input.rate || resolved / deterministic),
  };
}

function formatRetrievalLaneLines(lanes = []) {
  if (!lanes.length) return ['  - none'];
  return lanes.slice(0, 8).map((lane) => '  - ' + lane.fileRole + '/' + lane.artifactType + '/' + lane.language + ': files=' + lane.files + ', chunks=' + lane.chunks + ', embedded=' + lane.embeddedChunks + ', entities=' + lane.entities);
}

function normalizeSymbolQuality(input, topSymbols) {
  const names = input.topSymbols || topSymbols || [];
  const minifiedTopSymbols = input.minifiedTopSymbols || names.filter(looksMinifiedSymbolName);
  return {
    topSymbols: names,
    minifiedTopSymbols: [...new Set(minifiedTopSymbols)],
  };
}

function normalizeCrossResolvedEdges(input) {
  const resolved = numberOrZero(input.resolved);
  const total = numberOrZero(input.total);
  return {
    resolved,
    total,
    rate: total === 0 ? 1 : resolved / total,
  };
}

function readTopSymbolNames(store) {
  try {
    return store.db.prepare(`
      SELECT s.name AS name, COUNT(e.from_id) AS out_degree
      FROM code_symbols s
      LEFT JOIN code_edges e ON e.from_id = s.id
      GROUP BY s.id
      ORDER BY out_degree DESC, s.name ASC
      LIMIT 20
    `).all().map((row) => row.name);
  } catch {
    return [];
  }
}

function numberOrZero(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}
