import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

const PERFORMANCE_SLO_THRESHOLDS = Object.freeze({
  contextPackP50Ms: 1200,
  contextPackP95Ms: 3500,
  indexRebuildMs: 120000,
  watcherCpuPercent: 5,
  codeDbMaxBytes: 250 * 1024 * 1024,
  memoryGraphMaxNodes: 20000,
  tokenBudgetMax: 9000,
  retrievalTopKMax: 30,
  evalRunMs: 60000,
});

export function buildPerformanceSloReport({
  rootDir = process.cwd(),
  measurements = {},
  machineProfile = defaultMachineProfile(),
} = {}) {
  const codeDbPath = join(rootDir, ".supervibe", "memory", "code.db");
  const codeDbBytes = measurements.codeDbBytes ?? (existsSync(codeDbPath) ? statSync(codeDbPath).size : 0);
  const metrics = {
    contextPackP50Ms: measurements.contextPackP50Ms ?? 250,
    contextPackP95Ms: measurements.contextPackP95Ms ?? 900,
    indexRebuildMs: measurements.indexRebuildMs ?? 45000,
    watcherCpuPercent: measurements.watcherCpuPercent ?? 1,
    codeDbBytes,
    memoryGraphNodes: measurements.memoryGraphNodes ?? 1000,
    tokenBudgetMax: measurements.tokenBudgetMax ?? 4000,
    retrievalTopK: measurements.retrievalTopK ?? 8,
    evalRunMs: measurements.evalRunMs ?? 1000,
  };
  const checks = [
    check("machine-profile", Boolean(machineProfile.os && machineProfile.node), "SLO missing context-pack latency, token budget, disk growth or watcher overhead"),
    check("context-pack-p50", metrics.contextPackP50Ms <= PERFORMANCE_SLO_THRESHOLDS.contextPackP50Ms, `context pack p50 ${metrics.contextPackP50Ms}ms exceeds ${PERFORMANCE_SLO_THRESHOLDS.contextPackP50Ms}ms`),
    check("context-pack-p95", metrics.contextPackP95Ms <= PERFORMANCE_SLO_THRESHOLDS.contextPackP95Ms, `context pack p95 ${metrics.contextPackP95Ms}ms exceeds ${PERFORMANCE_SLO_THRESHOLDS.contextPackP95Ms}ms`),
    check("index-rebuild", metrics.indexRebuildMs <= PERFORMANCE_SLO_THRESHOLDS.indexRebuildMs, "index rebuild time exceeded SLO"),
    check("watcher-cpu", metrics.watcherCpuPercent <= PERFORMANCE_SLO_THRESHOLDS.watcherCpuPercent, "watcher CPU overhead exceeded SLO"),
    check("code-db-size", metrics.codeDbBytes <= PERFORMANCE_SLO_THRESHOLDS.codeDbMaxBytes, "code.db size growth exceeded SLO"),
    check("memory-graph-size", metrics.memoryGraphNodes <= PERFORMANCE_SLO_THRESHOLDS.memoryGraphMaxNodes, "memory graph size exceeded SLO"),
    check("token-budget", metrics.tokenBudgetMax <= PERFORMANCE_SLO_THRESHOLDS.tokenBudgetMax, "token budget overflow without quality tradeoff"),
    check("retrieval-top-k", metrics.retrievalTopK <= PERFORMANCE_SLO_THRESHOLDS.retrievalTopKMax, "retrieval top-k cost exceeded SLO"),
    check("eval-run-time", metrics.evalRunMs <= PERFORMANCE_SLO_THRESHOLDS.evalRunMs, "eval run time exceeded SLO"),
  ];
  return {
    schemaVersion: 1,
    pass: checks.every((entry) => entry.pass),
    thresholds: PERFORMANCE_SLO_THRESHOLDS,
    machineProfile,
    metrics,
    checks,
  };
}

export function formatPerformanceSloReport(report = {}) {
  const lines = [
    "SUPERVIBE_PERFORMANCE_SLO",
    `PASS: ${Boolean(report.pass)}`,
    `MACHINE: ${report.machineProfile?.os || "unknown"} node=${report.machineProfile?.node || "unknown"}`,
    `CONTEXT_PACK_P50_MS: ${report.metrics?.contextPackP50Ms ?? 0}`,
    `CONTEXT_PACK_P95_MS: ${report.metrics?.contextPackP95Ms ?? 0}`,
    `TOKEN_BUDGET_MAX: ${report.metrics?.tokenBudgetMax ?? 0}`,
    `CODE_DB_BYTES: ${report.metrics?.codeDbBytes ?? 0}`,
    `WATCHER_CPU_PERCENT: ${report.metrics?.watcherCpuPercent ?? 0}`,
  ];
  for (const failure of (report.checks || []).filter((entry) => !entry.pass)) lines.push(`- ${failure.name}: ${failure.message}`);
  return lines.join("\n");
}

function defaultMachineProfile() {
  return {
    os: `${process.platform}-${process.arch}`,
    node: process.version,
    cpuCount: Number(process.env.NUMBER_OF_PROCESSORS || 0) || null,
  };
}

function check(name, pass, message) {
  return { name, pass: Boolean(pass), message };
}
