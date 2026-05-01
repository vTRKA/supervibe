import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { discoverSourceFiles, GENERATED_DIRS } from './supervibe-index-policy.mjs';

const DEFAULT_COVERAGE_THRESHOLD = 0.9;
function isGeneratedSourcePath(filePath = '') {
  const normalized = String(filePath).replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  return segments.some((segment) => GENERATED_DIRS.has(segment));
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
  const languageCoverage = normalizeLanguageCoverage(manifest.languageCoverage || {});
  const symbolQuality = normalizeSymbolQuality(manifest.symbolQuality || {}, manifest.topSymbols || []);
  const crossResolvedEdges = normalizeCrossResolvedEdges(manifest.crossResolvedEdges || {
    resolved: manifest.resolvedEdges,
    total: manifest.totalEdges,
  });
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

  if (symbolQuality.minifiedTopSymbols.length > 0) {
    issues.push({
      code: 'minified-symbols-in-top-symbols',
      severity: 'warning',
      message: 'minified symbols appear in top graph symbols',
      details: { minifiedTopSymbols: symbolQuality.minifiedTopSymbols },
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
    languageCoverage,
    symbolQuality,
    crossResolvedEdges,
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
  const indexedRows = store.db.prepare('SELECT path, language FROM code_files ORDER BY path').all();
  const indexedPaths = indexedRows.map((row) => row.path);
  const generatedIndexedFiles = indexedPaths.filter(isGeneratedSourcePath);
  const staleRows = indexedPaths.filter((relPath) => !existsSync(join(rootDir, relPath)));
  const inventory = await collectEligibleSourceInventory(rootDir);
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
    };
  }
  for (const [language, eligible] of eligibleByLanguage) {
    if (!languageCoverage[language]) {
      languageCoverage[language] = { eligible, indexed: 0, filesWithSymbols: 0 };
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
      languageCoverage,
      topSymbols,
      crossResolvedEdges: {
        resolved: stats.resolvedEdges,
        total: stats.totalEdges,
      },
    },
    coverageThreshold,
    generatedAt,
  });
}

async function collectEligibleSourceInventory(rootDir) {
  const inventory = await discoverSourceFiles(rootDir);
  return {
    files: inventory.files.map((file) => ({ path: file.absPath, language: file.language })),
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
    `languageCoverage:`,
    ...(languageLines.length ? languageLines : ['  - none']),
    `symbolQuality:`,
    `  minifiedTopSymbols: ${health.symbolQuality?.minifiedTopSymbols?.join(', ') || 'none'}`,
    `crossResolvedEdges:`,
    `  resolved: ${health.crossResolvedEdges?.resolved || 0}`,
    `  total: ${health.crossResolvedEdges?.total || 0}`,
    `  rate: ${(numberOrZero(health.crossResolvedEdges?.rate) * 100).toFixed(1)}%`,
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
  for (const [language, value] of Object.entries(health.languageCoverage || {})) {
    const indexed = numberOrZero(value.indexed);
    const symbolCoverage = numberOrZero(value.symbolCoverage);
    if (indexed >= 5 && symbolCoverage < minSymbolCoverage) {
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

  return {
    ready: failedGates.length === 0,
    failedGates,
    warnings,
    repairCommand: 'node scripts/build-code-index.mjs --root . --force --health',
    bm25RepairCommand: 'node scripts/build-code-index.mjs --root . --force --health --no-embeddings',
  };
}

export function formatIndexHealthGate(gate = {}) {
  const failed = (gate.failedGates || []).map((item) => item.code).join(', ') || 'none';
  const warnings = (gate.warnings || []).map((item) => item.code).join(', ') || 'none';
  return [
    'SUPERVIBE_INDEX_GATE',
    `READY: ${gate.ready ? 'true' : 'false'}`,
    `FAILED: ${failed}`,
    `WARNINGS: ${warnings}`,
    `REPAIR: ${gate.repairCommand || 'node scripts/build-code-index.mjs --root . --force --health'}`,
    `BM25_REPAIR: ${gate.bm25RepairCommand || 'node scripts/build-code-index.mjs --root . --force --health --no-embeddings'}`,
  ].join('\n');
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
      coverage: eligible === 0 ? 1 : indexed / eligible,
      symbolCoverage: indexed === 0 ? 0 : filesWithSymbols / indexed,
    };
  }
  return output;
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
