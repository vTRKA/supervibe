import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { curateProjectMemory } from "./supervibe-memory-curator.mjs";
import { evaluateMemoryGcSchedule, scanMemoryGc } from "./supervibe-memory-gc.mjs";

const execFileAsync = promisify(execFile);

export async function buildMemoryHealthReport({
  rootDir = process.cwd(),
  now = new Date().toISOString(),
  contextPackMaxTokens = 3_000,
  changedFiles = null,
} = {}) {
  const gitChangedFiles = changedFiles || await collectGitChangedFiles({ rootDir });
  const curation = await curateProjectMemory({ rootDir, now, rebuildSqlite: false, changedFiles: gitChangedFiles });
  const gcScan = await scanMemoryGc({ rootDir, now });
  const gcSchedule = await evaluateMemoryGcSchedule({ rootDir, now, scan: gcScan });
  const reviewQueues = curation.lifecycle?.candidateQueues || {};
  const issues = [];
  const warnings = [];

  for (const error of curation.validation?.errors || []) issues.push({ code: "memory-validation-error", message: error });
  for (const contradiction of curation.contradictions || []) issues.push({ code: "memory-contradiction-review", message: contradiction.reason });
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
    - Math.min(2, Math.ceil((curation.duplicateCandidates || []).length / 3))
    - (gcSchedule.due ? 1 : 0));

  return {
    schemaVersion: 1,
    generatedAt: now,
    pass: issues.length === 0,
    maturityScore: score,
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
    `ENTRIES: ${report.curation?.entries || 0}`,
    `STALE: ${report.curation?.stale || 0}`,
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
