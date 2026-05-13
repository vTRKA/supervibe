import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { scanMemoryBackfill } from "./supervibe-memory-backfill.mjs";
import { curateProjectMemory, readMarkdownMemoryEntries } from "./supervibe-memory-curator.mjs";
import { evaluateMemoryGcSchedule, scanMemoryGc } from "./supervibe-memory-gc.mjs";

const execFileAsync = promisify(execFile);
const MEMORY_MATURITY_MIN_ENTRIES = 20;
const MEMORY_REQUIRED_SUBSYSTEMS = Object.freeze([
  "workflow",
  "ui",
  "memory",
  "rag",
  "codegraph",
  "receipts",
  "provider-config",
  "loop",
]);
const MEMORY_BACKFILL_REPAIR_COMMAND = "node scripts/supervibe-memory-backfill.mjs --source all";

export async function buildMemoryHealthReport({
  rootDir = process.cwd(),
  now = new Date().toISOString(),
  contextPackMaxTokens = 3_000,
  changedFiles = null,
  largeProjectMode = "auto",
} = {}) {
  const gitChangedFiles = changedFiles || await collectGitChangedFiles({ rootDir });
  const curation = await curateProjectMemory({ rootDir, now, rebuildSqlite: false, changedFiles: gitChangedFiles });
  const entries = await readMarkdownMemoryEntries({ rootDir, now });
  const backfill = await scanMemoryBackfill({ rootDir, now, limit: 200 });
  const gcScan = await scanMemoryGc({ rootDir, now });
  const gcSchedule = await evaluateMemoryGcSchedule({ rootDir, now, scan: gcScan });
  const reviewQueues = curation.lifecycle?.candidateQueues || {};
  const qualityGate = buildMemoryQualityGate({
    entries,
    curation,
    backfill,
    largeProjectMode,
  });
  const issues = [];
  const warnings = [];

  for (const error of curation.validation?.errors || []) issues.push({ code: "memory-validation-error", message: error });
  for (const contradiction of curation.contradictions || []) issues.push({ code: "memory-contradiction-review", message: contradiction.reason });
  for (const reason of qualityGate.reasons) warnings.push({ code: reason.code, message: reason.message });
  for (const issue of curation.referenceIssues || []) warnings.push({ code: "memory-reference-review", message: `${issue.entryId} -> ${issue.reference}` });

  if ((curation.duplicateCandidates || []).length > 0) {
    warnings.push({ code: "memory-duplicate-review", count: curation.duplicateCandidates.length });
  }
  if ((curation.invalidationCandidates || []).length > 0) {
    warnings.push({ code: "memory-invalidation-review", count: curation.invalidationCandidates.length });
  }
  if (gcSchedule.due) {
    warnings.push({ code: "memory-gc-due", count: gcSchedule.candidates });
  }
  if ((curation.lifecycle?.staleCount || 0) > 0) {
    warnings.push({ code: "memory-stale-preserved", count: curation.lifecycle.staleCount });
  }

  const score = Math.max(0, 10
    - Math.min(4, issues.length * 2)
    - (qualityGate.enforced && qualityGate.entries < qualityGate.minEntries ? 2 : 0)
    - (qualityGate.enforced ? Math.min(2, qualityGate.missingSubsystems.length) : 0)
    - Math.min(2, Math.ceil((curation.duplicateCandidates || []).length / 3))
    - (gcSchedule.due ? 1 : 0));

  return {
    schemaVersion: 1,
    generatedAt: now,
    pass: issues.length === 0 && qualityGate.pass,
    maturityScore: score,
    qualityGate,
    retrievalPolicy: {
      currentOnlyDefault: true,
      historyOptInFlags: ["--include-history", "--include-superseded"],
      staleExcludedFromContextPack: true,
    },
    tokenSlo: {
      contextPackMaxTokens,
      warningRatio: 0.7,
      hardRatio: 1.0,
      nextAction: "reduce memory/evidence limits or split context when context-pack reports warning/over_budget",
    },
    curation: {
      entries: curation.markdownEntries,
      stale: curation.lifecycle?.staleCount || 0,
      contradictions: curation.contradictions?.length || 0,
      referenceIssues: curation.referenceIssues?.length || 0,
      duplicateCandidates: curation.duplicateCandidates?.length || 0,
      invalidationCandidates: curation.invalidationCandidates?.length || 0,
      hierarchy: curation.hierarchy,
      reviewQueues: {
        memoryReview: reviewQueues.memoryReview?.length || 0,
        referenceReview: reviewQueues.referenceReview?.length || 0,
        duplicateReview: reviewQueues.duplicateReview?.length || 0,
        invalidationReview: reviewQueues.invalidationReview?.length || 0,
      },
      freshness: qualityGate.freshness,
      subsystemCoverage: qualityGate.subsystemCoverage,
    },
    gitDiff: {
      changedFiles: gitChangedFiles.length,
      sampled: gitChangedFiles.slice(0, 20),
    },
    gc: {
      candidates: gcScan.summary?.candidates || 0,
      due: gcSchedule.due,
      nextRunAt: gcSchedule.nextRunAt,
      nextAction: gcSchedule.nextAction,
      autoEligible: gcSchedule.autoEligible,
    },
    issues,
    warnings,
  };
}

export function formatMemoryHealthReport(report = {}) {
  const warnings = report.warnings || [];
  const issues = report.issues || [];
  return [
    "SUPERVIBE_MEMORY_HEALTH",
    `PASS: ${Boolean(report.pass)}`,
    `MATURITY_SCORE: ${report.maturityScore ?? 0}/10`,
    `CURRENT_ONLY_RETRIEVAL: ${Boolean(report.retrievalPolicy?.currentOnlyDefault)}`,
    `HISTORY_OPT_IN: ${(report.retrievalPolicy?.historyOptInFlags || []).join(",") || "none"}`,
    `STALE_EXCLUDED_FROM_CONTEXT: ${Boolean(report.retrievalPolicy?.staleExcludedFromContextPack)}`,
    `CONTEXT_PACK_TOKEN_MAX: ${report.tokenSlo?.contextPackMaxTokens ?? "unknown"}`,
    `TOKEN_WARNING_RATIO: ${report.tokenSlo?.warningRatio ?? "unknown"}`,
    `QUALITY_GATE: ${report.qualityGate?.status || "unknown"}`,
    `ENTRIES: ${report.curation?.entries || 0}`,
    `MIN_ENTRIES: ${report.qualityGate?.minEntries ?? "unknown"}`,
    `STALE: ${report.curation?.stale || 0}`,
    `FRESHNESS: ${formatCounts(report.qualityGate?.freshness)}`,
    `SUBSYSTEM_COVERAGE: ${formatSubsystemCoverage(report.qualityGate?.subsystemCoverage)}`,
    `MISSING_SUBSYSTEMS: ${(report.qualityGate?.missingSubsystems || []).join(",") || "none"}`,
    `BACKFILL_CANDIDATES: ${report.qualityGate?.backfillCandidateCount ?? "unknown"}`,
    `REPAIR_COMMAND: ${report.qualityGate?.repairCommand || "none"}`,
    `CONTRADICTION_REVIEWS: ${report.curation?.reviewQueues?.memoryReview || 0}`,
    `REFERENCE_ISSUES: ${report.curation?.referenceIssues || 0}`,
    `DUPLICATE_CANDIDATES: ${report.curation?.duplicateCandidates || 0}`,
    `INVALIDATION_CANDIDATES: ${report.curation?.invalidationCandidates || 0}`,
    `CURRENT_LAYER: ${report.curation?.hierarchy?.current?.count ?? "unknown"}`,
    `HISTORY_LAYER: ${report.curation?.hierarchy?.history?.count ?? "unknown"}`,
    `MEMORY_SUMMARY_TOKENS: ${report.curation?.hierarchy?.tokenEstimate ?? "unknown"}`,
    `GIT_CHANGED_FILES: ${report.gitDiff?.changedFiles || 0}`,
    `GC_CANDIDATES: ${report.gc?.candidates || 0}`,
    `GC_DUE: ${Boolean(report.gc?.due)}`,
    `GC_AUTO_ELIGIBLE: ${report.gc?.autoEligible || 0}`,
    `NEXT_ACTION: ${report.gc?.nextAction || report.tokenSlo?.nextAction || "none"}`,
    ...issues.slice(0, 8).map((issue) => `ISSUE: ${issue.code} ${issue.message || ""}`.trim()),
    ...warnings.slice(0, 8).map((warning) => `WARN: ${warning.code}${warning.count !== undefined ? ` count=${warning.count}` : ""}${warning.message ? ` ${warning.message}` : ""}`.trim()),
  ].join("\n");
}

function buildMemoryQualityGate({ entries = [], curation = {}, backfill = {}, largeProjectMode = "auto" } = {}) {
  const lifecycle = curation.lifecycle?.byId || {};
  const subsystemCoverage = buildSubsystemCoverage(entries);
  const missingSubsystems = MEMORY_REQUIRED_SUBSYSTEMS
    .filter((subsystem) => (subsystemCoverage[subsystem]?.entries || 0) === 0);
  const freshness = buildFreshnessCounts(entries, lifecycle);
  const backfillCandidateCount = Number(backfill.candidates?.length || 0);
  const enforced = shouldEnforceMemoryMaturityGate({ largeProjectMode, entries, backfillCandidateCount });
  const reasons = [];
  if (enforced && entries.length < MEMORY_MATURITY_MIN_ENTRIES) {
    reasons.push({
      code: "memory-thin-large-project",
      message: `${entries.length} memory entries is below the ${MEMORY_MATURITY_MIN_ENTRIES} entry maturity floor for Supervibe-scale retrieval.`,
    });
  }
  if (enforced && missingSubsystems.length) {
    reasons.push({
      code: "memory-subsystem-coverage-gap",
      message: `Missing memory coverage for subsystem(s): ${missingSubsystems.join(", ")}.`,
    });
  }
  if ((curation.lifecycle?.staleCount || 0) > 0) {
    reasons.push({
      code: "memory-freshness-review",
      message: `${curation.lifecycle.staleCount} stale or superseded memory entries need review.`,
    });
  }
  return {
    pass: reasons.length === 0,
    status: enforced ? (reasons.length === 0 ? "mature" : "not-mature") : "not-enforced",
    enforced,
    minEntries: MEMORY_MATURITY_MIN_ENTRIES,
    entries: entries.length,
    subsystemCoverage,
    requiredSubsystems: [...MEMORY_REQUIRED_SUBSYSTEMS],
    missingSubsystems,
    freshness,
    backfillCandidateCount,
    repairCommand: MEMORY_BACKFILL_REPAIR_COMMAND,
    reasons,
  };
}

function shouldEnforceMemoryMaturityGate({ largeProjectMode = "auto", entries = [], backfillCandidateCount = 0 } = {}) {
  if (largeProjectMode === true || largeProjectMode === "strict" || largeProjectMode === "large-project") return true;
  if (largeProjectMode === false || largeProjectMode === "off" || largeProjectMode === "none") return false;
  return backfillCandidateCount > 0 || entries.length >= MEMORY_MATURITY_MIN_ENTRIES;
}

function buildSubsystemCoverage(entries = []) {
  const coverage = Object.fromEntries(MEMORY_REQUIRED_SUBSYSTEMS.map((subsystem) => [subsystem, {
    entries: 0,
    current: 0,
    tags: [],
  }]));
  for (const entry of entries) {
    const haystack = `${entry.id} ${entry.type} ${(entry.tags || []).join(" ")} ${entry.summary || ""} ${entry.body || ""}`.toLowerCase();
    for (const subsystem of MEMORY_REQUIRED_SUBSYSTEMS) {
      if (!subsystemMatchesMemoryEntry(subsystem, haystack)) continue;
      coverage[subsystem].entries += 1;
      if (!entry.stale) coverage[subsystem].current += 1;
      coverage[subsystem].tags = [...new Set([...(coverage[subsystem].tags || []), ...(entry.tags || [])])].slice(0, 8);
    }
  }
  return coverage;
}

function subsystemMatchesMemoryEntry(subsystem, haystack) {
  const aliases = {
    workflow: ["workflow", "handoff", "plan", "command", "router"],
    ui: ["ui", "kanban", "work item", "loop run", "browser"],
    memory: ["memory", "curation", "backfill", "freshness"],
    rag: ["rag", "retrieval", "chunk", "context"],
    codegraph: ["codegraph", "code graph", "symbol", "edge"],
    receipts: ["receipt", "ledger", "workflow receipt"],
    "provider-config": ["provider", "config", "codex", "claude", "gemini", "cursor", "opencode"],
    loop: ["loop", "scheduler", "agent", "parallel", "claim"],
  };
  const normalized = ` ${String(haystack || "").replace(/[^a-z0-9]+/g, " ")} `;
  return (aliases[subsystem] || [subsystem]).some((alias) => normalized.includes(` ${String(alias).replace(/[^a-z0-9]+/g, " ")} `));
}

function buildFreshnessCounts(entries = [], lifecycle = {}) {
  const counts = { fresh: 0, aging: 0, stale: 0, superseded: 0, unknown: 0 };
  for (const entry of entries) {
    const freshness = lifecycle[entry.id]?.freshness || "unknown";
    counts[freshness] = (counts[freshness] || 0) + 1;
  }
  return counts;
}

function formatSubsystemCoverage(coverage = {}) {
  const entries = Object.entries(coverage || {});
  return entries.length
    ? entries.map(([key, value]) => `${key}=${value.entries || 0}`).join(",")
    : "none";
}

function formatCounts(counts = {}) {
  const entries = Object.entries(counts || {});
  return entries.length
    ? entries.map(([key, value]) => `${key}=${value}`).join(",")
    : "none";
}

async function collectGitChangedFiles({ rootDir = process.cwd() } = {}) {
  try {
    const [worktree, staged] = await Promise.all([
      execFileAsync("git", ["diff", "--name-only"], { cwd: rootDir }),
      execFileAsync("git", ["diff", "--name-only", "--cached"], { cwd: rootDir }),
    ]);
    return [...new Set(`${worktree.stdout}\n${staged.stdout}`.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))];
  } catch {
    return [];
  }
}
