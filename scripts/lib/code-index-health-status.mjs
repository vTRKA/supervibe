import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

import { impactRadius, neighborhood, searchSymbols } from "./code-graph-queries.mjs";
import { CodeStore } from "./code-store.mjs";
import { loadNodeSqliteDatabaseSync } from "./node-sqlite-runtime.mjs";
import { CODEGRAPH_INDEX_COMMAND, SOURCE_RAG_INDEX_COMMAND } from "./supervibe-command-catalog.mjs";
import { runRetrievalPipeline } from "./supervibe-retrieval-pipeline.mjs";

export const DEFAULT_REPAIRABLE_CONTENT_CHANGED_ROWS = 2;
export const DEFAULT_STALE_SOURCE_DETAIL_LIMIT = 25;
export const DEFAULT_MTIME_SCAN_TOLERANCE_MS = 1000;
export const CODE_INDEX_FRESHNESS_THRESHOLD_TABLE_SCHEMA_VERSION = 1;
export const CODE_INDEX_FRESHNESS_THRESHOLD_TABLE = Object.freeze([
  Object.freeze({
    id: "strict-gate-failure",
    priority: 10,
    status: "failed",
    label: "strict-failed",
    appliesWhen: {
      strict: true,
      failedGateCount: { min: 1 },
    },
    thresholds: {
      staleRows: "any",
      contentChangedRows: "any",
      nonFreshFailureCount: "any",
    },
    mode: {
      readyForMode: false,
      strictReady: false,
      devReady: false,
      repairable: false,
      degraded: false,
    },
    failedGatePolicy: "preserve-all",
    repairActionHint: SOURCE_RAG_INDEX_COMMAND,
    reasonTemplate: "strict index health rejects unresolved stale or failed gates",
  }),
  Object.freeze({
    id: "structural-stale-hard-stop",
    priority: 15,
    status: "failed",
    label: "structural-stale-hard-stop",
    appliesWhen: {
      structuralTask: true,
      freshnessDriftRows: { min: 1 },
    },
    thresholds: {
      staleRows: "any",
      contentChangedRows: "any",
      nonFreshFailureCount: "any",
      structuralTask: true,
    },
    mode: {
      readyForMode: false,
      strictReady: false,
      devReady: false,
      repairable: false,
      degraded: false,
    },
    failedGatePolicy: "preserve-all",
    repairActionHint: CODEGRAPH_INDEX_COMMAND,
    reasonTemplate: "structural task requires green index freshness before graph-dependent claims",
  }),
  Object.freeze({
    id: "repairable-content-changed",
    priority: 20,
    status: "repairable-stale",
    label: "repairable-content-changed",
    appliesWhen: {
      repairAvailable: true,
      staleRows: { equals: 0 },
      contentChangedRows: { min: 1, max: "repairableContentChangedRows" },
      nonFreshFailureCount: { equals: 0 },
    },
    thresholds: {
      staleRows: 0,
      contentChangedRows: "1..{repairableContentChangedRows}",
      nonFreshFailureCount: 0,
    },
    mode: {
      readyForMode: true,
      strictReady: false,
      devReady: true,
      repairable: true,
      degraded: false,
    },
    failedGatePolicy: "drop-content-stale",
    repairActionHint: SOURCE_RAG_INDEX_COMMAND,
    reasonTemplate: "contentChangedRows={contentChangedRows} is within dev repair threshold {repairableContentChangedRows}",
  }),
  Object.freeze({
    id: "repair-unavailable-content-changed",
    priority: 30,
    status: "degraded-context",
    label: "degraded-content-changed",
    appliesWhen: {
      repairAvailable: false,
      staleRows: { equals: 0 },
      contentChangedRows: { min: 1, max: "repairableContentChangedRows" },
      nonFreshFailureCount: { equals: 0 },
    },
    thresholds: {
      staleRows: 0,
      contentChangedRows: "1..{repairableContentChangedRows}",
      nonFreshFailureCount: 0,
    },
    mode: {
      readyForMode: true,
      strictReady: false,
      devReady: true,
      repairable: false,
      degraded: true,
    },
    failedGatePolicy: "drop-content-stale",
    repairActionHint: SOURCE_RAG_INDEX_COMMAND,
    reasonTemplate: "read path can use a stable snapshot, but repair requires an explicit index command",
  }),
  Object.freeze({
    id: "stale-index-rows",
    priority: 40,
    status: "failed",
    label: "stale-index-rows",
    appliesWhen: {
      staleRows: { min: 1 },
    },
    thresholds: {
      staleRows: ">=1",
      contentChangedRows: "any",
      nonFreshFailureCount: "any",
    },
    mode: {
      readyForMode: false,
      strictReady: false,
      devReady: false,
      repairable: false,
      degraded: false,
    },
    failedGatePolicy: "preserve-all",
    repairActionHint: SOURCE_RAG_INDEX_COMMAND,
    reasonTemplate: "stale index rows require an explicit rebuild",
  }),
  Object.freeze({
    id: "content-changed-over-threshold",
    priority: 50,
    status: "degraded-context",
    label: "large-delta-degraded-context",
    appliesWhen: {
      staleRows: { equals: 0 },
      contentChangedRows: { minExclusive: "repairableContentChangedRows" },
      nonFreshFailureCount: { equals: 0 },
    },
    thresholds: {
      staleRows: 0,
      contentChangedRows: ">{repairableContentChangedRows}",
      nonFreshFailureCount: 0,
    },
    mode: {
      readyForMode: true,
      strictReady: false,
      devReady: true,
      repairable: false,
      degraded: true,
    },
    failedGatePolicy: "drop-content-stale",
    repairActionHint: SOURCE_RAG_INDEX_COMMAND,
    reasonTemplate: "contentChangedRows={contentChangedRows} exceeds repair threshold {repairableContentChangedRows}; context is advisory until index repair completes",
  }),
  Object.freeze({
    id: "non-freshness-gate-failure",
    priority: 60,
    status: "failed",
    label: "non-freshness-gate-failure",
    appliesWhen: {
      nonFreshFailureCount: { min: 1 },
    },
    thresholds: {
      staleRows: 0,
      contentChangedRows: 0,
      nonFreshFailureCount: ">=1",
    },
    mode: {
      readyForMode: false,
      strictReady: false,
      devReady: false,
      repairable: false,
      degraded: false,
    },
    failedGatePolicy: "preserve-all",
    repairActionHint: SOURCE_RAG_INDEX_COMMAND,
    reasonTemplate: "non-freshness index health gate failed",
  }),
  Object.freeze({
    id: "ready",
    priority: 70,
    status: "ready",
    label: "fresh",
    appliesWhen: {
      staleRows: { equals: 0 },
      contentChangedRows: { equals: 0 },
      failedGateCount: { equals: 0 },
    },
    thresholds: {
      staleRows: 0,
      contentChangedRows: 0,
      nonFreshFailureCount: 0,
    },
    mode: {
      readyForMode: true,
      strictReady: true,
      devReady: true,
      repairable: false,
      degraded: false,
    },
    failedGatePolicy: "preserve-all",
    repairActionHint: "none",
    reasonTemplate: "index health gate is ready",
  }),
]);
const READ_SNAPSHOT_MODE = "read-only-transaction";

export function repairableContentChangedRowsLimit(value = process.env.SUPERVIBE_INDEX_REPAIRABLE_CONTENT_ROWS) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_REPAIRABLE_CONTENT_CHANGED_ROWS;
  return Math.trunc(parsed);
}

export function buildCodeIndexFreshnessStatus({
  health = {},
  gate = {},
  strict = false,
  repairAvailable = true,
  repairableContentChangedRows = repairableContentChangedRowsLimit(),
  snapshot = null,
  taskType = "feature",
  sourceType = "code-index",
  sourceIds = null,
  privacyStatus = "local-only",
} = {}) {
  const staleRows = (health.staleRows || []).length;
  const contentChangedRows = (health.contentChangedRows || []).length;
  const partialRows = (health.partialIndexedFiles || []).length;
  const rawFailedGates = gate.failedGates || [];
  const nonFreshFailures = rawFailedGates.filter((item) => !["content-stale", "stale-rows"].includes(item.code));
  const thresholdEvaluation = evaluateCodeIndexFreshnessThreshold({
    strict,
    repairAvailable,
    repairableContentChangedRows,
    staleRows,
    contentChangedRows,
    partialRows,
    failedGates: rawFailedGates,
    nonFreshFailures,
    taskType,
  });

  const status = thresholdEvaluation.status;
  const readyForMode = thresholdEvaluation.readyForMode;
  const strictReady = thresholdEvaluation.strictReady;
  const effectiveFailedGates = thresholdEvaluation.effectiveFailedGates;
  const reason = thresholdEvaluation.reason;
  const nextAction = thresholdEvaluation.nextAction;

  const staleSourceExplanation = buildCodeIndexStaleSourceExplanation({
    health,
    repairCommand: SOURCE_RAG_INDEX_COMMAND,
    graphRepairCommand: CODEGRAPH_INDEX_COMMAND,
  });
  const retrievalEvidence = buildCodeIndexRetrievalEvidence({
    freshness: {
      status,
      thresholdId: thresholdEvaluation.thresholdId,
      readyForMode,
      strictReady,
      devReady: thresholdEvaluation.devReady,
      repairable: thresholdEvaluation.repairable,
      degraded: thresholdEvaluation.degraded,
      reason,
      nextAction,
      staleRows,
      contentChangedRows,
      partialRows,
      failedGates: rawFailedGates,
      effectiveFailedGates,
      snapshot,
    },
    sourceType,
    sourceIds: sourceIds || deriveFreshnessSourceIds(health),
    taskType,
    privacyStatus,
  });

  return {
    status,
    label: thresholdEvaluation.label,
    thresholdId: thresholdEvaluation.thresholdId,
    thresholdSchemaVersion: thresholdEvaluation.schemaVersion,
    threshold: thresholdEvaluation.threshold,
    readyForMode,
    strictReady,
    devReady: thresholdEvaluation.devReady,
    repairAvailable,
    repairable: thresholdEvaluation.repairable,
    degraded: thresholdEvaluation.degraded,
    strict,
    reason,
    nextAction,
    repairCommand: SOURCE_RAG_INDEX_COMMAND,
    graphRepairCommand: CODEGRAPH_INDEX_COMMAND,
    repairableContentChangedRows,
    staleRows,
    contentChangedRows,
    partialRows,
    failedGates: rawFailedGates,
    effectiveFailedGates,
    warnings: gate.warnings || [],
    snapshot,
    staleSourceExplanation,
    retrievalEvidence,
  };
}

export function buildMissingCodeIndexFreshnessStatus({ dbPath = null } = {}) {
  const staleSourceExplanation = buildCodeIndexStaleSourceExplanation({
    health: {},
    repairCommand: SOURCE_RAG_INDEX_COMMAND,
    graphRepairCommand: CODEGRAPH_INDEX_COMMAND,
  });
  return {
    status: "not-built",
    label: "missing",
    thresholdId: "missing-index",
    thresholdSchemaVersion: CODE_INDEX_FRESHNESS_THRESHOLD_TABLE_SCHEMA_VERSION,
    threshold: {
      staleRows: "unknown",
      contentChangedRows: "unknown",
      nonFreshFailureCount: "unknown",
      dbPath: "required",
    },
    readyForMode: false,
    strictReady: false,
    devReady: false,
    repairAvailable: true,
    repairable: false,
    degraded: false,
    strict: false,
    reason: dbPath
      ? `code index database is missing: ${dbPath}`
      : "code index database is missing",
    nextAction: SOURCE_RAG_INDEX_COMMAND,
    repairCommand: SOURCE_RAG_INDEX_COMMAND,
    graphRepairCommand: CODEGRAPH_INDEX_COMMAND,
    repairableContentChangedRows: DEFAULT_REPAIRABLE_CONTENT_CHANGED_ROWS,
    staleRows: 0,
    contentChangedRows: 0,
    partialRows: 0,
    failedGates: [{
      code: "code-index-not-built",
      message: "Code RAG and CodeGraph database has not been built",
    }],
    effectiveFailedGates: [{
      code: "code-index-not-built",
      message: "Code RAG and CodeGraph database has not been built",
    }],
    warnings: [],
    snapshot: {
      status: "not-built",
      mode: "none",
      path: dbPath,
      dbAgeMs: null,
      retryCount: 0,
    },
    staleSourceExplanation,
    retrievalEvidence: buildCodeIndexRetrievalEvidence({
      freshness: {
        status: "not-built",
        readyForMode: false,
        strictReady: false,
        devReady: false,
        repairable: false,
        degraded: false,
        reason: dbPath
          ? `code index database is missing: ${dbPath}`
          : "code index database is missing",
        nextAction: SOURCE_RAG_INDEX_COMMAND,
        staleRows: 0,
        contentChangedRows: 0,
        partialRows: 0,
        failedGates: [{ code: "code-index-not-built" }],
        snapshot: { status: "not-built", mode: "none", path: dbPath },
      },
      sourceType: "code-index",
      sourceIds: dbPath ? [dbPath] : [],
      privacyStatus: "local-only",
    }),
  };
}

export function buildPreContextMtimeScanStatus({
  rootDir = process.cwd(),
  indexedRows = [],
  fileStats = null,
  mtimeToleranceMs = DEFAULT_MTIME_SCAN_TOLERANCE_MS,
  repairableContentChangedRows = repairableContentChangedRowsLimit(),
  taskType = "feature",
  nowMs = Date.now(),
  privacyStatus = "local-only",
} = {}) {
  const changedRows = [];
  const removedRows = [];
  const unchangedRows = [];
  const unreadableRows = [];
  const toleranceMs = nonNegativeInt(mtimeToleranceMs, DEFAULT_MTIME_SCAN_TOLERANCE_MS);

  for (const row of indexedRows || []) {
    const relPath = sourceRowPath(row);
    if (!relPath) continue;
    const indexedMtimeMs = indexedRowMtimeMs(row);
    const statResult = resolveMtimeScanFileStat({ rootDir, relPath, fileStats });
    if (statResult.status === "missing") {
      removedRows.push(relPath);
      continue;
    }
    if (statResult.status === "unreadable") {
      unreadableRows.push(relPath);
      continue;
    }
    if (Number.isFinite(indexedMtimeMs) && statResult.mtimeMs > indexedMtimeMs + toleranceMs) {
      changedRows.push(relPath);
    } else {
      unchangedRows.push(relPath);
    }
  }

  const health = {
    staleRows: removedRows,
    contentChangedRows: changedRows,
    partialIndexedFiles: unreadableRows,
  };
  const failedGates = [];
  if (removedRows.length > 0) {
    failedGates.push({
      code: "stale-rows",
      message: "pre-context mtime scan found indexed files missing from disk",
      actual: removedRows.length,
    });
  }
  if (changedRows.length > 0) {
    failedGates.push({
      code: "content-stale",
      message: "pre-context mtime scan found files newer than indexed snapshot",
      actual: changedRows.length,
    });
  }

  const freshness = buildCodeIndexFreshnessStatus({
    health,
    gate: { failedGates },
    strict: false,
    repairAvailable: false,
    repairableContentChangedRows,
    snapshot: {
      status: "pre-context-scan",
      mode: "mtime-scan",
      createdAt: new Date(nonNegativeInt(nowMs, Date.now())).toISOString(),
      scannedRows: (indexedRows || []).length,
      retryCount: 0,
    },
    taskType,
    sourceType: "mtime-scan",
    sourceIds: [...changedRows, ...removedRows, ...unreadableRows],
    privacyStatus,
  });

  return {
    schemaVersion: 1,
    status: freshness.status,
    freshnessMode: freshness.retrievalEvidence.freshnessMode,
    trustRole: freshness.retrievalEvidence.trustRole,
    hardStop: freshness.retrievalEvidence.hardStop,
    reason: freshness.reason,
    nextAction: freshness.nextAction,
    repairCommand: SOURCE_RAG_INDEX_COMMAND,
    graphRepairCommand: CODEGRAPH_INDEX_COMMAND,
    mtimeToleranceMs: toleranceMs,
    scannedRows: (indexedRows || []).length,
    changedRows,
    removedRows,
    unreadableRows,
    unchangedRows: unchangedRows.length,
    largeDelta: changedRows.length > repairableContentChangedRows,
    privacyStatus,
    retrievalEvidence: freshness.retrievalEvidence,
    freshness,
  };
}

export function buildCodeIndexRetrievalEvidence({
  freshness = {},
  sourceType = "code-index",
  sourceIds = [],
  taskType = "feature",
  indexSnapshotId = null,
  privacyStatus = "local-only",
} = {}) {
  const normalizedTaskType = normalizeTaskType(taskType);
  const structuralTask = isStructuralTaskType(normalizedTaskType);
  const status = freshness.status || "unknown";
  const freshnessMode = status === "ready" ? "green" : status;
  const driftRows = nonNegativeInt(freshness.staleRows, 0) + nonNegativeInt(freshness.contentChangedRows, 0);
  const hardStop = status === "failed"
    || status === "not-built"
    || (structuralTask && freshnessMode !== "green");
  const trustRole = freshnessMode === "green" && !hardStop ? "proof-bearing" : hardStop ? "blocked" : "advisory";
  const repairHints = buildFreshnessRepairHints({ freshness, structuralTask });

  return {
    schemaVersion: 1,
    kind: "RetrievalEvidenceV1",
    sourceType: normalizeEvidenceToken(sourceType, "code-index"),
    sourceIds: normalizeEvidenceSourceIds(sourceIds),
    freshnessMode,
    trustRole,
    hardStop,
    hardStopReason: hardStop ? freshness.reason || "index freshness is not green" : null,
    taskType: normalizedTaskType,
    structuralTask,
    indexSnapshotId: indexSnapshotId || buildIndexSnapshotId(freshness.snapshot),
    privacyStatus: normalizeEvidenceToken(privacyStatus, "local-only"),
    provenance: {
      thresholdId: freshness.thresholdId || null,
      status,
      staleRows: nonNegativeInt(freshness.staleRows, 0),
      contentChangedRows: nonNegativeInt(freshness.contentChangedRows, 0),
      partialRows: nonNegativeInt(freshness.partialRows, 0),
      driftRows,
    },
    repairHints,
  };
}

export function buildCodeIndexStaleSourceExplanation({
  health = {},
  repairCommand = SOURCE_RAG_INDEX_COMMAND,
  graphRepairCommand = CODEGRAPH_INDEX_COMMAND,
  limit = DEFAULT_STALE_SOURCE_DETAIL_LIMIT,
} = {}) {
  const detailLimit = nonNegativeInt(limit, DEFAULT_STALE_SOURCE_DETAIL_LIMIT);
  const stale = buildSourceRowBucket(health.staleRows || [], { limit: detailLimit });
  const changedContent = buildSourceRowBucket(health.contentChangedRows || [], { limit: detailLimit });
  const partial = buildSourceRowBucket(health.partialIndexedFiles || [], { limit: detailLimit });
  const normalizedChangedRows = normalizeSourceRows(health.contentChangedRows || []);
  const changedFiles = normalizedChangedRows.slice(0, detailLimit);
  const counts = {
    staleRows: stale.count,
    changedContentRows: changedContent.count,
    partialRows: partial.count,
  };
  const totalRows = counts.staleRows + counts.changedContentRows + counts.partialRows;

  return {
    schemaVersion: 1,
    hasDetails: totalRows > 0,
    rowCounts: counts,
    totalRows,
    buckets: {
      staleRows: stale,
      changedContentRows: changedContent,
      partialRows: partial,
    },
    changedFiles: {
      count: normalizedChangedRows.length,
      shown: changedFiles,
      omitted: Math.max(0, normalizedChangedRows.length - changedFiles.length),
    },
    repairCommand,
    graphRepairCommand,
  };
}


export function getCodeIndexFreshnessThresholdTable({
  repairableContentChangedRows = DEFAULT_REPAIRABLE_CONTENT_CHANGED_ROWS,
} = {}) {
  const repairLimit = repairableContentChangedRowsLimit(repairableContentChangedRows);
  return CODE_INDEX_FRESHNESS_THRESHOLD_TABLE.map((row) => ({
    ...row,
    thresholds: materializeFreshnessThresholds(row.thresholds, { repairableContentChangedRows: repairLimit }),
  }));
}

export function evaluateCodeIndexFreshnessThreshold({
  strict = false,
  repairAvailable = true,
  repairableContentChangedRows = DEFAULT_REPAIRABLE_CONTENT_CHANGED_ROWS,
  staleRows = 0,
  contentChangedRows = 0,
  partialRows = 0,
  failedGates = [],
  nonFreshFailures = null,
  taskType = "feature",
} = {}) {
  const repairLimit = repairableContentChangedRowsLimit(repairableContentChangedRows);
  const normalized = {
    strict: strict === true,
    repairAvailable: repairAvailable === true,
    repairableContentChangedRows: repairLimit,
    staleRows: nonNegativeInt(staleRows, 0),
    contentChangedRows: nonNegativeInt(contentChangedRows, 0),
    partialRows: nonNegativeInt(partialRows, 0),
    structuralTask: isStructuralTaskType(taskType),
    failedGateCount: (failedGates || []).length,
    nonFreshFailureCount: (nonFreshFailures || (failedGates || []).filter((item) => !["content-stale", "stale-rows"].includes(item.code))).length,
  };
  normalized.freshnessDriftRows = normalized.staleRows + normalized.contentChangedRows;
  const row = CODE_INDEX_FRESHNESS_THRESHOLD_TABLE.find((candidate) => thresholdRowMatches(candidate, normalized))
    || CODE_INDEX_FRESHNESS_THRESHOLD_TABLE.find((candidate) => candidate.id === "non-freshness-gate-failure");
  const effectiveFailedGates = row.failedGatePolicy === "drop-content-stale"
    ? (failedGates || []).filter((item) => item.code !== "content-stale")
    : (failedGates || []);

  return {
    schemaVersion: CODE_INDEX_FRESHNESS_THRESHOLD_TABLE_SCHEMA_VERSION,
    thresholdId: row.id,
    label: row.label,
    status: row.status,
    threshold: materializeFreshnessThresholds(row.thresholds, normalized),
    readyForMode: row.mode.readyForMode,
    strictReady: row.mode.strictReady,
    devReady: row.mode.devReady,
    repairable: row.mode.repairable,
    degraded: row.mode.degraded,
    reason: formatFreshnessReason(row.reasonTemplate, normalized),
    nextAction: row.repairActionHint,
    effectiveFailedGates,
  };
}

export function isMissingCodeIndexError(error = {}) {
  return error?.code === "SUPERVIBE_CODE_INDEX_MISSING";
}

export function applyCodeIndexFreshnessPolicyToGate(gate = {}, freshness = {}) {
  const status = freshness.status || "ready";
  const warnings = [...(gate.warnings || [])];
  if (status === "repairable-stale" || status === "degraded-context") {
    warnings.push({
      code: status,
      message: freshness.reason || status,
      actual: freshness.contentChangedRows || 0,
    });
  }
  return {
    ...gate,
    ready: freshness.readyForMode === true,
    failedGates: freshness.effectiveFailedGates || gate.failedGates || [],
    warnings: dedupeGateItems(warnings),
  };
}

export function formatCodeIndexFreshnessStatus(freshness = {}) {
  const snapshot = freshness.snapshot || {};
  const strictFailure = freshness.strictReady === false ? "true" : "false";
  return [
    "SUPERVIBE_CODE_INDEX_FRESHNESS",
    `STATUS: ${freshness.status || "unknown"}`,
    `LABEL: ${freshness.label || "unknown"}`,
    `THRESHOLD_ID: ${freshness.thresholdId || "unknown"}`,
    `THRESHOLD_SCHEMA_VERSION: ${freshness.thresholdSchemaVersion || CODE_INDEX_FRESHNESS_THRESHOLD_TABLE_SCHEMA_VERSION}`,
    `MODE_READY: ${freshness.readyForMode === true}`,
    `DEV_READY: ${freshness.devReady === true}`,
    `STRICT_READY: ${freshness.strictReady === true}`,
    `STRICT_FAILURE: ${strictFailure}`,
    `CONTENT_CHANGED_ROWS: ${freshness.contentChangedRows || 0}`,
    `STALE_ROWS: ${freshness.staleRows || 0}`,
    `PARTIAL_ROWS: ${freshness.partialRows || 0}`,
    `REPAIR_THRESHOLD: ${freshness.repairableContentChangedRows ?? DEFAULT_REPAIRABLE_CONTENT_CHANGED_ROWS}`,
    `REPAIR_COMMAND: ${freshness.repairCommand || SOURCE_RAG_INDEX_COMMAND}`,
    `GRAPH_REPAIR_COMMAND: ${freshness.graphRepairCommand || CODEGRAPH_INDEX_COMMAND}`,
    `FRESHNESS_MODE: ${freshness.retrievalEvidence?.freshnessMode || "unknown"}`,
    `TRUST_ROLE: ${freshness.retrievalEvidence?.trustRole || "unknown"}`,
    `HARD_STOP: ${freshness.retrievalEvidence?.hardStop === true}`,
    `REPAIR_HINTS: ${(freshness.retrievalEvidence?.repairHints || []).join("; ") || "none"}`,
    `READ_SNAPSHOT_MODE: ${snapshot.mode || "none"}`,
    `READ_SNAPSHOT_DB_AGE_MS: ${snapshot.dbAgeMs ?? "unknown"}`,
    `READ_SNAPSHOT_RETRIES: ${snapshot.retryCount ?? 0}`,
    `REASON: ${freshness.reason || "unknown"}`,
    `NEXT_ACTION: ${freshness.nextAction || "none"}`,
    formatCodeIndexStaleSourceExplanation(freshness.staleSourceExplanation || {
      rowCounts: {
        staleRows: freshness.staleRows || 0,
        changedContentRows: freshness.contentChangedRows || 0,
        partialRows: freshness.partialRows || 0,
      },
      totalRows: (freshness.staleRows || 0) + (freshness.contentChangedRows || 0) + (freshness.partialRows || 0),
      repairCommand: freshness.repairCommand || SOURCE_RAG_INDEX_COMMAND,
      graphRepairCommand: freshness.graphRepairCommand || CODEGRAPH_INDEX_COMMAND,
    }),
  ].join("\n");
}

export function formatCodeIndexStaleSourceExplanation(explanation = {}) {
  const counts = explanation.rowCounts || {};
  const hasDetails = explanation.hasDetails === true || Number(explanation.totalRows || 0) > 0;
  const lines = [
    "STALE_SOURCE_EXPLANATION",
    `SCHEMA_VERSION: ${explanation.schemaVersion || 1}`,
    `HAS_DETAILS: ${hasDetails}`,
    `ROW_COUNTS: staleRows=${counts.staleRows || 0}, changedContentRows=${counts.changedContentRows || 0}, partialRows=${counts.partialRows || 0}`,
    `REPAIR_COMMAND: ${explanation.repairCommand || SOURCE_RAG_INDEX_COMMAND}`,
    `GRAPH_REPAIR_COMMAND: ${explanation.graphRepairCommand || CODEGRAPH_INDEX_COMMAND}`,
  ];

  if (!hasDetails) {
    lines.push("DETAILS: none");
    return lines.join("\n");
  }

  lines.push("CHANGED_FILES:");
  lines.push(formatSourceRows(explanation.changedFiles || { shown: [], omitted: 0 }));
  lines.push("STALE_ROWS:");
  lines.push(formatSourceRows(explanation.buckets?.staleRows || { shown: [], omitted: 0 }));
  lines.push("CHANGED_CONTENT_ROWS:");
  lines.push(formatSourceRows(explanation.buckets?.changedContentRows || { shown: [], omitted: 0 }));
  lines.push("PARTIAL_ROWS:");
  lines.push(formatSourceRows(explanation.buckets?.partialRows || { shown: [], omitted: 0 }));
  return lines.join("\n");
}

export async function openCodeIndexReadSnapshot({
  rootDir = process.cwd(),
  useEmbeddings = false,
  useGraph = true,
  purpose = "read",
  maxAttempts = 3,
  retryDelayMs = 75,
  busyTimeoutMs = 1500,
} = {}) {
  const dbPath = join(rootDir, ".supervibe", "memory", "code.db");
  if (!existsSync(dbPath)) {
    const error = new Error(`code index database is missing: ${dbPath}`);
    error.code = "SUPERVIBE_CODE_INDEX_MISSING";
    throw error;
  }

  const DatabaseSync = await loadNodeSqliteDatabaseSync("Code RAG and code graph read snapshot");
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let db = null;
    try {
      db = new DatabaseSync(dbPath, { readOnly: true });
      db.exec(`PRAGMA busy_timeout=${positiveInt(busyTimeoutMs, 1500)}; PRAGMA query_only=ON; BEGIN;`);
      assertCodeIndexReadSchema(db);
      const store = new CodeStore(rootDir, { useEmbeddings, useGraph });
      store.db = db;
      const snapshot = buildReadSnapshotMetadata({ db, dbPath, attempt, maxAttempts, purpose });
      const close = createReadSnapshotClose(store);
      store.close = close;
      return { store, snapshot, close };
    } catch (error) {
      lastError = error;
      try { db?.close(); } catch {}
      if (!isSqliteLockError(error) || attempt >= maxAttempts) break;
      await delay(retryDelayMs * attempt);
    }
  }

  const error = new Error(`could not open code index read snapshot after ${maxAttempts} attempt(s): ${lastError?.message || "unknown error"}`);
  error.code = isSqliteLockError(lastError) ? "SUPERVIBE_CODE_INDEX_READ_LOCKED" : "SUPERVIBE_CODE_INDEX_READ_FAILED";
  error.cause = lastError;
  error.repairCommand = SOURCE_RAG_INDEX_COMMAND;
  throw error;
}

export async function buildCodeGraphContextFromReadSnapshot({
  rootDir = process.cwd(),
  query = "",
  symbol = "",
  limit = 8,
  graphDepth = 1,
  impactDepth = 2,
  includeImpact = true,
  useEmbeddings = true,
  maxChars = 14_000,
  taskType = "feature",
} = {}) {
  const read = await openCodeIndexReadSnapshot({
    rootDir,
    useEmbeddings,
    useGraph: true,
    purpose: "codegraph-context",
  });
  try {
    const context = await buildCodeGraphContextFromStore(read.store, {
      query,
      symbol,
      limit,
      graphDepth,
      impactDepth,
      includeImpact,
      useEmbeddings,
      maxChars,
      taskType,
    });
    context.readSnapshot = read.snapshot;
    context.markdown = trimMarkdown(formatCodeGraphContextMarkdown(context), maxChars);
    return context;
  } finally {
    read.close();
  }
}

async function buildCodeGraphContextFromStore(store, {
  query = "",
  symbol = "",
  limit = 8,
  graphDepth = 1,
  impactDepth = 2,
  includeImpact = true,
  useEmbeddings = true,
  taskType = "feature",
} = {}) {
  const searchQuery = String(query || symbol || "").trim();
  const ragChunks = searchQuery
    ? await store.search({ query: searchQuery, limit, semantic: useEmbeddings })
    : [];
  const entrySymbols = searchQuery
    ? searchSymbols(store.db, searchQuery, { limit })
    : [];
  const seedNames = selectSeedNames({ symbol, ragChunks, entrySymbols, query: searchQuery }).slice(0, 6);
  const graphEvidence = [];
  for (const seed of seedNames) {
    for (const row of neighborhood(store.db, seed, { depth: graphDepth }).slice(0, limit)) {
      graphEvidence.push({ seed, ...row });
    }
  }
  const dedupedGraph = dedupeBy(graphEvidence, (row) => row.id).slice(0, limit * 3);
  const impact = includeImpact && seedNames[0]
    ? impactRadius(store.db, seedNames[0], { depth: impactDepth, limit: limit * 4 })
    : { roots: [], nodes: [], edges: [] };
  const relatedFiles = collectRelatedFiles({ ragChunks, entrySymbols, graphEvidence: dedupedGraph, impact });
  const semanticAnchors = collectSemanticAnchors(store.db, relatedFiles, searchQuery).slice(0, limit);
  const retrievalPipeline = runRetrievalPipeline({
    query: searchQuery,
    ftsCandidates: ragChunks.map((row) => ({ id: `${row.file}:${row.startLine}`, path: row.file, score: row.score })),
    embeddingCandidates: useEmbeddings ? ragChunks.map((row) => ({ id: `${row.file}:${row.startLine}:semantic`, path: row.file, score: row.semantic || row.score })) : [],
    exactSymbolCandidates: entrySymbols.map((row) => ({ id: row.id, symbol: row.name, path: row.path, score: row.score / 100 || 0.9 })),
    repoMapCandidates: relatedFiles.map((path, index) => ({ path, rank: relatedFiles.length - index })),
    graphCandidates: dedupedGraph.map((row) => ({ symbol: row.name, path: row.path, score: 0.8 })),
  });
  const graphHealth = store.getGraphHealthMetrics();
  const quality = buildContextQuality({ retrievalPipeline, graphHealth, semanticAnchors, relatedFiles });
  const taskTypeGate = evaluateCodeGraphTaskTypeGate({
    taskType,
    quality,
    graphHealth,
    stats: {
      ragChunks: ragChunks.length,
      entrySymbols: entrySymbols.length,
      graphNodes: dedupedGraph.length,
      impactNodes: impact.nodes.length,
    },
  });
  return {
    schemaVersion: 1,
    query: searchQuery,
    seedNames,
    ragChunks,
    entrySymbols,
    graphEvidence: dedupedGraph,
    impact,
    relatedFiles,
    semanticAnchors,
    retrievalPipeline,
    graphHealth,
    quality,
    taskTypeGate,
    stats: {
      ragChunks: ragChunks.length,
      entrySymbols: entrySymbols.length,
      graphNodes: dedupedGraph.length,
      impactNodes: impact.nodes.length,
      relatedFiles: relatedFiles.length,
      semanticAnchors: semanticAnchors.length,
    },
  };
}

function createReadSnapshotClose(store) {
  let closed = false;
  const originalClose = CodeStore.prototype.close.bind(store);
  return () => {
    if (closed) return;
    closed = true;
    try { store.db?.exec("ROLLBACK;"); } catch {}
    originalClose();
  };
}

function buildReadSnapshotMetadata({ db, dbPath, attempt, maxAttempts, purpose }) {
  const stats = statSync(dbPath);
  const schema = readCodeIndexSchemaMetadata(db);
  return {
    status: "ready",
    mode: READ_SNAPSHOT_MODE,
    purpose,
    path: dbPath,
    createdAt: new Date().toISOString(),
    dbMtime: stats.mtime.toISOString(),
    dbAgeMs: Math.max(0, Date.now() - stats.mtimeMs),
    schemaVersion: schema.schemaVersion,
    tableCount: schema.tableCount,
    retryCount: attempt - 1,
    maxAttempts,
  };
}

function readCodeIndexSchemaMetadata(db) {
  const userVersion = db.prepare("PRAGMA user_version").get();
  const schemaVersion = userVersion?.user_version ?? Object.values(userVersion || {})[0] ?? 0;
  const tableCount = db.prepare("SELECT COUNT(*) AS n FROM sqlite_schema WHERE type IN ('table', 'virtual')").get().n;
  return { schemaVersion, tableCount };
}

function assertCodeIndexReadSchema(db) {
  const required = ["code_files", "code_chunks", "code_chunks_fts", "code_symbols", "code_edges"];
  const rows = db.prepare("SELECT name FROM sqlite_schema WHERE type IN ('table', 'virtual')").all();
  const names = new Set(rows.map((row) => row.name));
  const missing = required.filter((name) => !names.has(name));
  if (missing.length > 0) {
    const error = new Error(`code index schema missing required table(s): ${missing.join(", ")}`);
    error.code = "SUPERVIBE_CODE_INDEX_SCHEMA_MISSING";
    throw error;
  }
}

function isSqliteLockError(error = {}) {
  const code = String(error.code || error.errcode || "").toUpperCase();
  const message = String(error.message || "");
  return code.includes("SQLITE_BUSY")
    || code.includes("SQLITE_LOCKED")
    || /database is locked|database table is locked|SQLITE_BUSY|SQLITE_LOCKED/i.test(message);
}

function buildSourceRowBucket(rows = [], { limit = DEFAULT_STALE_SOURCE_DETAIL_LIMIT } = {}) {
  const normalized = normalizeSourceRows(rows);
  const detailLimit = nonNegativeInt(limit, DEFAULT_STALE_SOURCE_DETAIL_LIMIT);
  const shown = normalized.slice(0, detailLimit);
  return {
    count: normalized.length,
    shown,
    omitted: Math.max(0, normalized.length - shown.length),
  };
}

function normalizeSourceRows(rows = []) {
  return [...new Set((rows || []).map(sourceRowPath).filter(Boolean))].sort();
}

function indexedRowMtimeMs(row = {}) {
  const value = row.indexedMtimeMs
    ?? row.indexed_mtime_ms
    ?? row.mtimeMs
    ?? row.mtime_ms
    ?? row.updatedMtimeMs
    ?? row.indexedAtMs
    ?? Date.parse(row.indexed_at || row.indexedAt || row.updated_at || row.updatedAt || "");
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveMtimeScanFileStat({ rootDir, relPath, fileStats }) {
  const normalizedPath = normalizeSourcePath(relPath);
  const supplied = fileStats instanceof Map ? fileStats.get(normalizedPath) : fileStats?.[normalizedPath];
  if (supplied) {
    if (supplied.exists === false || supplied.status === "missing") return { status: "missing", mtimeMs: null };
    const mtimeMs = Number(supplied.mtimeMs ?? supplied.mtime_ms ?? Date.parse(supplied.mtime || ""));
    return Number.isFinite(mtimeMs) ? { status: "present", mtimeMs } : { status: "unreadable", mtimeMs: null };
  }
  const absPath = join(rootDir, normalizedPath);
  if (!existsSync(absPath)) return { status: "missing", mtimeMs: null };
  try {
    return { status: "present", mtimeMs: statSync(absPath).mtimeMs };
  } catch {
    return { status: "unreadable", mtimeMs: null };
  }
}

function sourceRowPath(row) {
  if (typeof row === "string") return normalizeSourcePath(row);
  if (!row || typeof row !== "object") return "";
  return normalizeSourcePath(
    row.path
    || row.file
    || row.relPath
    || row.sourcePath
    || row.changedFile
    || row.id
    || ""
  );
}

function normalizeSourcePath(value = "") {
  return String(value || "").replace(/\\/g, "/").trim();
}

function deriveFreshnessSourceIds(health = {}) {
  return [
    ...normalizeSourceRows(health.staleRows || []),
    ...normalizeSourceRows(health.contentChangedRows || []),
    ...normalizeSourceRows(health.partialIndexedFiles || []),
  ];
}

function buildFreshnessRepairHints({ freshness = {}, structuralTask = false } = {}) {
  const hints = [];
  if (structuralTask && (freshness.status !== "ready" || nonNegativeInt(freshness.staleRows, 0) > 0 || nonNegativeInt(freshness.contentChangedRows, 0) > 0)) {
    hints.push("run " + CODEGRAPH_INDEX_COMMAND + " before structural work");
  }
  if (freshness.status === "not-built") hints.push("run " + SOURCE_RAG_INDEX_COMMAND);
  if (nonNegativeInt(freshness.contentChangedRows, 0) > 0) hints.push("run " + SOURCE_RAG_INDEX_COMMAND + " to refresh changed content");
  if (nonNegativeInt(freshness.staleRows, 0) > 0) hints.push("run " + SOURCE_RAG_INDEX_COMMAND + " to remove stale rows");
  if (nonNegativeInt(freshness.partialRows, 0) > 0) hints.push("inspect partial index rows, then run " + SOURCE_RAG_INDEX_COMMAND);
  if (!hints.length && freshness.nextAction && freshness.nextAction !== "none") hints.push("run " + freshness.nextAction);
  return [...new Set(hints)];
}

function buildIndexSnapshotId(snapshot = {}) {
  const pathPart = snapshot?.path ? normalizeSourcePath(snapshot.path).split("/").pop() : "code-index";
  const timePart = snapshot?.dbMtime || snapshot?.createdAt || snapshot?.status || "unknown";
  return pathPart + ":" + timePart;
}

function normalizeEvidenceToken(value, fallback) {
  const normalized = String(value || "").trim().toLowerCase().replace(/[^a-z0-9._:-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function normalizeEvidenceSourceIds(sourceIds = []) {
  return [...new Set((Array.isArray(sourceIds) ? sourceIds : [sourceIds]).map(normalizeSourcePath).filter(Boolean))].sort();
}

function isStructuralTaskType(taskType = "") {
  return ["refactor", "rename", "move", "delete", "extract", "public-api"].includes(normalizeTaskType(taskType));
}

function formatSourceRows(bucket = {}) {
  const rows = bucket.shown || [];
  const lines = rows.length ? rows.map((row) => `- ${row}`) : ["- none"];
  if (Number(bucket.omitted || 0) > 0) lines.push(`- ... ${bucket.omitted} more`);
  return lines.join("\n");
}

function dedupeGateItems(items = []) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = `${item.code || "unknown"}:${item.message || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function selectSeedNames({ symbol, ragChunks, entrySymbols, query }) {
  const seeds = [];
  if (symbol) seeds.push(symbol);
  for (const sym of entrySymbols || []) seeds.push(sym.name);
  for (const chunk of ragChunks || []) {
    if (chunk.name) seeds.push(chunk.name);
  }
  for (const token of String(query || "").match(/\b[A-Za-z_$][A-Za-z0-9_$]{2,}\b/g) || []) {
    if (/[A-Z_]/.test(token) || /^use[A-Z0-9_]/.test(token)) seeds.push(token);
  }
  return [...new Set(seeds)].filter(Boolean);
}

function collectRelatedFiles({ ragChunks, entrySymbols, graphEvidence, impact }) {
  const files = new Set();
  for (const row of ragChunks || []) files.add(row.file);
  for (const row of entrySymbols || []) files.add(row.path);
  for (const row of graphEvidence || []) files.add(row.path);
  for (const row of impact?.nodes || []) files.add(row.path);
  return [...files].filter(Boolean).sort();
}

function collectSemanticAnchors(db, files, query) {
  const rows = [];
  const byFile = db.prepare(`
    SELECT anchor_id AS anchorId, path, symbol_name AS symbolName, responsibility,
           start_line AS startLine, end_line AS endLine
    FROM code_semantic_anchors
    WHERE path = ?
    ORDER BY start_line
  `);
  const terms = new Set(String(query || "").toLowerCase().split(/[^a-z0-9_$-]+/).filter((term) => term.length >= 3));
  for (const file of files || []) rows.push(...byFile.all(file));
  return rows
    .map((row) => ({ ...row, score: scoreAnchor(row, terms) }))
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path) || a.startLine - b.startLine);
}

function buildContextQuality({ retrievalPipeline, graphHealth, semanticAnchors, relatedFiles }) {
  const failures = [];
  const warnings = [];
  const requiredStages = ["rewrite", "exact-symbol", "fts", "embedding", "repo-map", "graph-neighbor", "dedupe", "rerank"];
  const stages = new Set((retrievalPipeline?.stages || []).map((stageItem) => stageItem.name));
  for (const stageName of requiredStages) {
    if (!stages.has(stageName)) failures.push(`missing retrieval stage: ${stageName}`);
  }
  if (!retrievalPipeline?.fallback?.reason) failures.push("missing fallback reason");
  if ((graphHealth?.sourceFileSymbolCoverage?.generatedIndexedFiles || 0) > 0) {
    failures.push("generated files indexed in graph context");
  }
  if ((graphHealth?.symbolNameQuality?.minifiedTopSymbols || []).length > 0) {
    failures.push("minified symbols appear in top graph symbols");
  }
  if ((graphHealth?.sourceFileSymbolCoverage?.files || 0) >= 5 && (graphHealth?.sourceFileSymbolCoverage?.coverage || 0) < 0.2) {
    warnings.push("low symbol coverage for graph-eligible indexed files");
  }
  const eligibleEdges = graphHealth?.eligibleProjectEdges || null;
  const edgeTotal = eligibleEdges ? Number(eligibleEdges.deterministic || 0) : Number(graphHealth?.crossResolvedEdges?.total || 0);
  const edgeRate = eligibleEdges ? Number(eligibleEdges.rate || 0) : Number(graphHealth?.crossResolvedEdges?.rate || 0);
  const edgeTarget = eligibleEdges ? 0.8 : 0.05;
  if (edgeTotal >= 20 && edgeRate < edgeTarget) {
    warnings.push(eligibleEdges ? "low deterministic project edge resolution" : "low cross-file edge resolution");
  }
  if ((semanticAnchors || []).length === 0 && (relatedFiles || []).length > 0) {
    warnings.push("no semantic anchors found for related files");
  }
  return {
    pass: failures.length === 0,
    failures,
    warnings,
    stageCount: retrievalPipeline?.stages?.length || 0,
    selectedCount: retrievalPipeline?.selected?.length || 0,
    fallbackReason: retrievalPipeline?.fallback?.reason || "",
    symbolCoverage: graphHealth?.sourceFileSymbolCoverage?.coverage ?? null,
    edgeResolutionRate: graphHealth?.eligibleProjectEdges?.rate ?? graphHealth?.crossResolvedEdges?.rate ?? null,
    eligibleProjectEdgeResolutionRate: graphHealth?.eligibleProjectEdges?.rate ?? null,
  };
}

function evaluateCodeGraphTaskTypeGate({ taskType = "feature", quality = {}, graphHealth = {}, stats = {} } = {}) {
  const normalized = normalizeTaskType(taskType);
  const failures = [];
  const warnings = [...(quality.warnings || [])];
  const symbolCoverage = Number(quality.symbolCoverage ?? graphHealth?.sourceFileSymbolCoverage?.coverage ?? 0);
  const edgeResolution = Number(quality.edgeResolutionRate ?? graphHealth?.eligibleProjectEdges?.rate ?? graphHealth?.crossResolvedEdges?.rate ?? 0);
  const edgeTotal = Number(graphHealth?.eligibleProjectEdges?.deterministic ?? graphHealth?.crossResolvedEdges?.total ?? 0);
  const edgeTarget = graphHealth?.eligibleProjectEdges ? 0.8 : 0.05;
  const hasGraphEvidence = Number(stats.graphNodes || 0) > 0 || Number(stats.impactNodes || 0) > 0;
  const hasSourceEvidence = Number(stats.ragChunks || 0) > 0 || Number(stats.entrySymbols || 0) > 0;
  const usefulness = evaluateCodeGraphUsefulness({
    taskType: normalized,
    quality,
    graphHealth,
    stats: { ...stats, hasGraphEvidence, hasSourceEvidence },
  });

  if (["refactor", "rename", "move", "delete", "extract", "public-api"].includes(normalized)) {
    if (!quality.pass) failures.push("base graph context quality failed");
    if (!hasGraphEvidence) failures.push("structural task requires graph neighborhood or impact evidence");
    if (symbolCoverage < 0.2) failures.push("structural task requires >=20% graph-eligible symbol coverage");
    if (edgeTotal >= 20 && edgeResolution < edgeTarget) failures.push(graphHealth?.eligibleProjectEdges ? "structural task requires >=80% deterministic project edge resolution" : "structural task requires >=5% cross-file edge resolution");
  } else if (["debug", "feature"].includes(normalized)) {
    if (!hasSourceEvidence) failures.push("task requires source RAG or symbol evidence");
    if (!hasGraphEvidence) warnings.push("graph evidence missing; keep changes localized until graph context is available");
  } else if (normalized === "docs") {
    if (!hasSourceEvidence && !hasGraphEvidence) warnings.push("docs task has no code evidence; acceptable only for text-only docs");
  }
  for (const warning of usefulness.warnings) if (!warnings.includes(warning)) warnings.push(warning);

  return {
    taskType: normalized,
    pass: failures.length === 0,
    failures,
    warnings,
    usefulness,
    requirements: requirementsForTaskType(normalized),
    metrics: {
      symbolCoverage,
      edgeResolution,
      graphNodes: Number(stats.graphNodes || 0),
      impactNodes: Number(stats.impactNodes || 0),
      ragChunks: Number(stats.ragChunks || 0),
      entrySymbols: Number(stats.entrySymbols || 0),
    },
  };
}

function evaluateCodeGraphUsefulness({ taskType = "feature", quality = {}, graphHealth = {}, stats = {} } = {}) {
  const normalized = normalizeTaskType(taskType);
  const hasSourceEvidence = Boolean(stats.hasSourceEvidence) || Number(stats.ragChunks || 0) > 0 || Number(stats.entrySymbols || 0) > 0;
  const hasGraphEvidence = Boolean(stats.hasGraphEvidence) || Number(stats.graphNodes || 0) > 0 || Number(stats.impactNodes || 0) > 0;
  const symbolCoverage = Number(quality.symbolCoverage ?? graphHealth?.sourceFileSymbolCoverage?.coverage ?? 0);
  const edgeResolution = Number(quality.edgeResolutionRate ?? graphHealth?.eligibleProjectEdges?.rate ?? graphHealth?.crossResolvedEdges?.rate ?? 0);
  const edgeTotal = Number(graphHealth?.eligibleProjectEdges?.deterministic ?? graphHealth?.crossResolvedEdges?.total ?? 0);
  const edgeTarget = graphHealth?.eligibleProjectEdges ? 0.8 : 0.05;
  const warnings = [];
  let score = 0;
  if (hasSourceEvidence) score += 0.35;
  if (hasGraphEvidence) score += 0.35;
  if (symbolCoverage >= 0.2) score += 0.15;
  if (edgeTotal < 20 || edgeResolution >= edgeTarget) score += 0.15;
  if (!hasSourceEvidence) warnings.push("CodeGraph context has no source RAG or symbol evidence for agent handoff");
  if (!hasGraphEvidence && ["refactor", "rename", "move", "delete", "extract", "public-api"].includes(normalized)) {
    warnings.push("structural agent handoff lacks graph neighborhood or impact evidence");
  } else if (!hasGraphEvidence && ["feature", "debug"].includes(normalized)) {
    warnings.push("agent handoff has source evidence but no graph neighborhood; keep implementation localized");
  }
  const pass = score >= (["refactor", "rename", "move", "delete", "extract", "public-api"].includes(normalized) ? 0.85 : 0.5)
    && hasSourceEvidence;
  return {
    pass,
    score: Number(score.toFixed(2)),
    hasSourceEvidence,
    hasGraphEvidence,
    symbolCoverage,
    edgeResolution,
    warnings,
    nextAction: pass ? "use CodeGraph context in agent packet" : "refresh index or narrow query before agent handoff",
  };
}

function formatCodeGraphContextMarkdown(context = {}) {
  return [
    "# Supervibe CodeGraph Context",
    "",
    `Query: ${context.query || "none"}`,
    `Seeds: ${(context.seedNames || []).join(", ") || "none"}`,
    "",
    "## RAG Entry Chunks",
    formatRagChunks(context.ragChunks || []),
    "",
    "## Entry Symbols",
    formatSymbols(context.entrySymbols || []),
    "",
    "## Graph Neighborhood",
    formatGraphRows(context.graphEvidence || []),
    "",
    "## Impact Radius",
    formatGraphRows((context.impact?.nodes || []).filter((row) => row.distance > 0)),
    "",
    "## Related Files",
    formatList(context.relatedFiles || []),
    "",
    "## Semantic Anchors",
    formatList((context.semanticAnchors || []).map((anchor) => `${anchor.path}:${anchor.startLine} ${anchor.anchorId} ${anchor.symbolName || ""} ${anchor.responsibility || ""}`)),
    "",
    "## Retrieval Quality",
    formatRetrievalQuality(context.retrievalPipeline),
    "",
    "## Graph Quality Gates",
    formatGraphQuality(context.quality),
    "",
    "## Task-Type Graph Gate",
    formatTaskTypeGate(context.taskTypeGate),
    "",
    "## Read Snapshot",
    formatList([
      `mode=${context.readSnapshot?.mode || READ_SNAPSHOT_MODE}`,
      `dbAgeMs=${context.readSnapshot?.dbAgeMs ?? "unknown"}`,
      `retryCount=${context.readSnapshot?.retryCount ?? 0}`,
    ]),
    "",
    "## Metrics",
    formatList([
      `ragChunks=${context.stats?.ragChunks || 0}`,
      `entrySymbols=${context.stats?.entrySymbols || 0}`,
      `graphNodes=${context.stats?.graphNodes || 0}`,
      `impactNodes=${context.stats?.impactNodes || 0}`,
      `relatedFiles=${context.stats?.relatedFiles || 0}`,
    ]),
    "",
  ].join("\n");
}

function formatRagChunks(rows) {
  if (!rows.length) return "- none";
  return rows.map((row) => [
    `- ${row.file}:${row.startLine}-${row.endLine} [${row.kind}${row.name ? `: ${row.name}` : ""}] score=${Number(row.score || 0).toFixed(3)}`,
    `  ${String(row.snippet || "").split("\n").slice(0, 3).join("\n  ")}`,
  ].join("\n")).join("\n");
}

function formatSymbols(rows) {
  if (!rows.length) return "- none";
  return rows.map((row) => `- ${row.path}:${row.startLine} [${row.kind}: ${row.name}] score=${Number(row.score || 0).toFixed(0)}`).join("\n");
}

function formatGraphRows(rows) {
  if (!rows.length) return "- none";
  return rows.map((row) => `- d=${row.distance ?? 0} ${row.path}:${row.startLine || 1} [${row.kind || "symbol"}:${row.name || row.toName || "unknown"}] via=${row.via || row.seed || "graph"}`).join("\n");
}

function formatRetrievalQuality(pipeline = {}) {
  return formatList([
    `pass=${pipeline.pass === true}`,
    `rewrittenQuery=${pipeline.rewrittenQuery || "none"}`,
    `stages=${(pipeline.stages || []).map((stage) => `${stage.name}:${stage.count ?? stage.candidateCount ?? stage.selectedCount ?? 0}`).join(", ") || "none"}`,
    `selected=${pipeline.selected?.length || 0}`,
    `fallback=${pipeline.fallback?.reason || "none"}`,
  ]);
}

function formatGraphQuality(quality = {}) {
  return formatList([
    `pass=${quality.pass === true}`,
    `failures=${(quality.failures || []).join("; ") || "none"}`,
    `warnings=${(quality.warnings || []).join("; ") || "none"}`,
    `symbolCoverage=${quality.symbolCoverage ?? "unknown"}`,
    `edgeResolution=${quality.edgeResolutionRate ?? "unknown"}`,
    `eligibleProjectEdgeResolution=${quality.eligibleProjectEdgeResolutionRate ?? "unknown"}`,
  ]);
}

function formatTaskTypeGate(gate = {}) {
  return formatList([
    `taskType=${gate.taskType || "feature"}`,
    `pass=${gate.pass === true}`,
    `usefulness=${gate.usefulness?.score ?? "unknown"} pass=${gate.usefulness?.pass === true}`,
    `requirements=${gate.requirements || "unknown"}`,
    `failures=${(gate.failures || []).join("; ") || "none"}`,
    `warnings=${(gate.warnings || []).join("; ") || "none"}`,
  ]);
}

function requirementsForTaskType(taskType) {
  if (["refactor", "rename", "move", "delete", "extract", "public-api"].includes(taskType)) {
    return "graph neighborhood or impact evidence; >=20% symbol coverage; low unresolved-risk warning surfaced";
  }
  if (["feature", "debug"].includes(taskType)) {
    return "source RAG or symbol evidence; graph warning surfaced when missing";
  }
  return "source references when relevant; graph optional";
}

function normalizeTaskType(taskType = "") {
  const value = String(taskType || "").trim().toLowerCase();
  if (["refactor", "rename", "move", "delete", "extract", "public-api", "debug", "feature", "docs"].includes(value)) return value;
  if (/rename|move|delete|extract|api|contract|public/.test(value)) return "public-api";
  if (/refactor|restructure/.test(value)) return "refactor";
  if (/bug|debug|fix|incident/.test(value)) return "debug";
  if (/doc|readme|copy/.test(value)) return "docs";
  return "feature";
}

function scoreAnchor(anchor, terms) {
  const text = `${anchor.anchorId} ${anchor.symbolName || ""} ${anchor.responsibility || ""}`.toLowerCase();
  let score = 0;
  for (const term of terms) if (text.includes(term)) score += 1;
  return score;
}

function dedupeBy(rows, keyFn) {
  const seen = new Set();
  const result = [];
  for (const row of rows || []) {
    const key = keyFn(row);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(row);
  }
  return result;
}

function formatList(items) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return "- none";
  return list.map((item) => `- ${item}`).join("\n");
}

function trimMarkdown(markdown, maxChars) {
  const limit = positiveInt(maxChars, 14_000);
  const text = String(markdown || "");
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 80)).replace(/\s+$/g, "")}\n\n[trimmed to ${limit} chars]`;
}


function thresholdRowMatches(row, metrics) {
  return Object.entries(row.appliesWhen || {}).every(([key, condition]) => valueMatchesThreshold(metrics[key], condition, metrics));
}

function valueMatchesThreshold(value, condition, metrics) {
  if (condition === undefined || condition === "any") return true;
  if (typeof condition !== "object" || condition === null) return value === condition;
  if (Object.hasOwn(condition, "equals") && value !== resolveThresholdValue(condition.equals, metrics)) return false;
  if (Object.hasOwn(condition, "min") && value < resolveThresholdValue(condition.min, metrics)) return false;
  if (Object.hasOwn(condition, "max") && value > resolveThresholdValue(condition.max, metrics)) return false;
  if (Object.hasOwn(condition, "minExclusive") && value <= resolveThresholdValue(condition.minExclusive, metrics)) return false;
  return true;
}

function resolveThresholdValue(value, metrics) {
  if (typeof value === "string" && Object.hasOwn(metrics, value)) return metrics[value];
  return value;
}

function materializeFreshnessThresholds(thresholds = {}, metrics = {}) {
  return Object.fromEntries(Object.entries(thresholds).map(([key, value]) => [key, formatFreshnessReason(value, metrics)]));
}

function formatFreshnessReason(template, metrics) {
  return String(template).replace(/\{([A-Za-z0-9_]+)\}/g, (_match, key) => String(metrics[key] ?? "unknown"));
}

function nonNegativeInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.trunc(parsed);
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.trunc(parsed);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}
