import { cleanupRuntimeTargets } from "./runtime-cleanup-registry.mjs";
import { evaluateMemoryGcSchedule, scanMemoryGc } from "./supervibe-memory-gc.mjs";
import { evaluateArtifactGcSchedule, scanSupervibeArtifactGc, validateSupervibeGcStrict } from "./supervibe-artifact-gc.mjs";
import { scanWorkItemGc } from "./supervibe-work-item-gc.mjs";
import { createPlanLifecycleReport } from "../supervibe-plan-lifecycle.mjs";
import { resolveCleanupPolicy, decideCleanupAction } from "./supervibe-cleanup-policy.mjs";
import { buildCleanupReachability } from "./supervibe-cleanup-reachability.mjs";

export async function runCleanupOrchestrator({
  rootDir = process.cwd(),
  now = new Date().toISOString(),
  mode = "dry-run",
  retentionDays = 14,
  includeStaleOpen = false,
  staleOpenDays = 90,
  completedGraceHours = 24,
} = {}) {
  const policy = resolveCleanupPolicy({ mode, now });
  const dryRun = mode !== "manual-apply";
  const terminalSignals = await collectTerminalSignals({ rootDir, now });
  const [runtime, workItems, memory, artifacts, reachability] = await Promise.all([
    cleanupRuntimeTargets({ rootDir, dryRun: true, unusedOnly: true, now: new Date(now) }),
    scanWorkItemGc({ rootDir, now, retentionDays, includeStaleOpen, staleOpenDays, completedGraceHours }),
    scanMemoryGc({ rootDir, now }),
    scanSupervibeArtifactGc({ rootDir, now, retentionDays }),
    buildCleanupReachability({ rootDir, now }),
  ]);
  const [memorySchedule, artifactSchedule, artifactStrict] = await Promise.all([
    evaluateMemoryGcSchedule({ rootDir, now, scan: memory }),
    evaluateArtifactGcSchedule({ rootDir, now, scan: artifacts }),
    validateSupervibeGcStrict({ rootDir, now, scan: artifacts, retentionDays }),
  ]);
  const actionSummary = summarizeActions({ policy, reachability, artifacts, workItems, memory, runtime });
  const blocked = terminalSignals.blocked.length > 0 || artifactStrict.pass !== true;
  return {
    schemaVersion: 1,
    generatedAt: now,
    mode,
    dryRun,
    blocked,
    policy: {
      policyVersion: policy.policyVersion,
      mode: policy.mode,
      twoPhaseApplyRequired: policy.twoPhaseApplyRequired,
      archiveBudget: policy.archiveBudget,
    },
    terminalSignals,
    components: {
      runtime,
      workItems: workItems.summary,
      memory: { ...memory.summary, schedule: memorySchedule },
      artifacts: { ...artifacts.summary, schedule: artifactSchedule, strict: artifactStrict.summary },
      reachability: reachability.summary,
    },
    actions: actionSummary,
    nextAction: blocked
      ? "resolve cleanup blockers before apply"
      : mode === "dry-run"
        ? "inspect dry-run report or rerun in review mode"
        : "manual apply requires a hashed action manifest",
  };
}

export function formatCleanupOrchestratorReport(report = {}) {
  const components = report.components || {};
  const actions = report.actions || {};
  return [
    "SUPERVIBE_CLEANUP_ORCHESTRATOR",
    `MODE: ${report.mode || "unknown"}`,
    `DRY_RUN: ${report.dryRun !== false}`,
    `BLOCKED: ${report.blocked === true}`,
    `POLICY_VERSION: ${report.policy?.policyVersion || "unknown"}`,
    `TERMINAL_READY: ${report.terminalSignals?.ready === true}`,
    `TERMINAL_BLOCKERS: ${(report.terminalSignals?.blocked || []).join(",") || "none"}`,
    `RUNTIME_CHECKED: ${components.runtime?.checked || 0}`,
    `WORK_ITEM_CANDIDATES: ${components.workItems?.candidates || 0}`,
    `MEMORY_CANDIDATES: ${components.memory?.candidates || 0}`,
    `ARTIFACT_CANDIDATES: ${components.artifacts?.candidates || 0}`,
    `ARTIFACT_ACTIVE_NOISE: ${components.artifacts?.activeNoise || 0}`,
    `REACHABILITY_PROTECTED: ${components.reachability?.protected || 0}`,
    `REACHABILITY_HOT: ${components.reachability?.hot || 0}`,
    `REACHABILITY_COLD: ${components.reachability?.cold || 0}`,
    `REACHABILITY_TRASH: ${components.reachability?.trash || 0}`,
    `ACTION_PROTECT: ${actions.protect || 0}`,
    `ACTION_REVIEW: ${actions.review || 0}`,
    `ACTION_REPORT: ${actions.report || 0}`,
    `ACTION_DELETE: ${actions.delete || 0}`,
    `NEXT_ACTION: ${report.nextAction || "inspect cleanup lifecycle"}`,
  ].join("\n");
}

async function collectTerminalSignals({ rootDir, now }) {
  const plan = createPlanLifecycleReport({ rootDir });
  const runtimeDebt = await cleanupRuntimeTargets({ rootDir, dryRun: true, unusedOnly: true, now: new Date(now) });
  const blocked = [];
  if (runtimeDebt.hostManagedCompleted > 0 || runtimeDebt.wouldPruneHostManagedCompleted > 0) blocked.push("host-managed-subagent-close-state");
  if (plan.staleActiveSource) blocked.push("stale-active-plan-source");
  return {
    ready: blocked.length === 0,
    blocked,
    plan: {
      activePlan: plan.activePlan || null,
      activeStatus: plan.activeStatus || null,
      staleActiveSource: plan.staleActiveSource === true,
    },
    runtime: {
      checked: runtimeDebt.checked,
      hostManagedCompleted: runtimeDebt.hostManagedCompleted,
      wouldPruneHostManagedCompleted: runtimeDebt.wouldPruneHostManagedCompleted,
    },
  };
}

function summarizeActions({ policy, reachability, artifacts, workItems, memory, runtime }) {
  const counts = { protect: 0, review: 0, report: 0, delete: 0, archive: 0, compact: 0, budget: 0, none: 0 };
  const candidates = [
    ...(reachability.inventory || []).slice(0, 1000).map((item) => ({ relPath: item.relPath, lifecycleClass: item.lifecycleClass, reason: item.reason, receiptLinked: item.protectedByReceipt, protectedProvenance: item.protectedProvenance })),
    ...(artifacts.candidates || []).map((item) => ({ relPath: item.relPath, lifecycleClass: "trash", reason: item.reason })),
    ...(artifacts.archiveCleanup || []).map((item) => ({ relPath: item.relPath, lifecycleClass: "cold", reason: item.reason })),
    ...(workItems.candidates || []).map((item) => ({ relPath: item.graphPath, lifecycleClass: "archivable", reason: item.reason })),
    ...(memory.candidates || []).map((item) => ({ relPath: item.file || item.path || item.id, lifecycleClass: "archivable", reason: item.reason })),
    ...(runtime.results || []).map((item) => ({ relPath: item.id || item.path || item.pidFile || "runtime", lifecycleClass: item.status?.startsWith("would") ? "trash" : "warm", reason: item.status })),
  ];
  for (const item of candidates) {
    const decision = decideCleanupAction({ policy, ...item });
    counts[decision.action] = (counts[decision.action] || 0) + 1;
  }
  return counts;
}
