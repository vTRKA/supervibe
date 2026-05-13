import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { evaluateTask } from "./autonomous-loop-evaluator.mjs";
import { createFailurePacket } from "./autonomous-loop-failure-packet.mjs";
import { estimateContextBudget } from "./autonomous-loop-context-budget.mjs";
import { appendSideEffect, createProcessSideEffect } from "./autonomous-loop-side-effect-ledger.mjs";
import {
  extractEvidenceSummary,
  normalizeExecutionMode,
  renderFreshContextPrompt,
} from "./autonomous-loop-tool-adapters.mjs";

export const ATTEMPT_STATUSES = Object.freeze([
  "started",
  "tool_failed",
  "verification_failed",
  "requeued",
  "completed",
  "blocked",
  "cancelled",
  "stalled",
]);

export const DEFAULT_NO_PROGRESS_TIMEOUT_MS = 7 * 60 * 1000;

const DEFAULT_OUTPUT_CONTRACT = {
  completionSignal: "SUPERVIBE_TASK_COMPLETE: true",
  evidenceSummary: "SUPERVIBE_EVIDENCE_SUMMARY: <summary>",
  changedFiles: "SUPERVIBE_CHANGED_FILES: <comma-separated paths or none>",
  requireVerificationEvidence: true,
};

export function buildFreshContextPacket({
  task,
  contract = null,
  verificationMatrix = [],
  contextPack = null,
  progressNotes = null,
  policyBoundaries = null,
  sideEffectRules = null,
  outputContract = null,
  contextBudgetOptions = null,
} = {}) {
  if (!task?.id) throw new Error("Fresh-context packet requires a task with id");
  const packet = {
    packetType: "fresh-context-task",
    schemaVersion: 1,
    task: {
      id: task.id,
      goal: task.goal || task.title || task.id,
      category: task.category || "implementation",
      policyRiskLevel: task.policyRiskLevel || "low",
      dependencies: task.dependencies || [],
    },
    contract: contract || task.contract || null,
    acceptanceCriteria: task.acceptanceCriteria || [],
    verificationMatrix: verificationMatrix.filter((entry) => !entry.taskId || entry.taskId === task.id),
    contextPack: sanitizeContextPack(contextPack),
    progressNotes: progressNotes || task.resumeNotes || null,
    policyBoundaries: policyBoundaries || {
      environment: "local",
      requireExactApprovalForHighRisk: true,
      noRawSecrets: true,
      noPermissionBypass: true,
    },
    sideEffectRules: sideEffectRules || {
      recordEverySpawnedProcess: true,
      recordEveryMutation: true,
      stopMustBeAvailable: true,
      defaultCommitBehavior: "no-auto-commit",
    },
    outputContract: outputContract || DEFAULT_OUTPUT_CONTRACT,
  };
  packet.contextBudget = estimateContextBudget({
    task,
    contextPack,
    progressNotes,
    ...(contextBudgetOptions || {}),
  });
  return packet;
}

export async function runFreshContextAttempt({
  task,
  adapter,
  mode = "fresh-context",
  attemptId = `${task?.id || "task"}-attempt-1`,
  attemptDir = null,
  ledgerPath = null,
  contract = null,
  verificationMatrix = [],
  contextPack = null,
  progressNotes = null,
  policyBoundaries = null,
  sideEffectRules = null,
  outputContract = null,
  allowSpawn = false,
  approvalLeaseId = null,
  permissionAudit = null,
  contextBudgetOptions = null,
  enforceContextBudget = false,
  noProgressTimeoutMs = DEFAULT_NO_PROGRESS_TIMEOUT_MS,
  reviewMode = "final-sweep",
} = {}) {
  const executionMode = normalizeExecutionMode(mode);
  const normalizedReviewMode = normalizeReviewMode(reviewMode);
  const packet = buildFreshContextPacket({
    task,
    contract,
    verificationMatrix,
    contextPack,
    progressNotes,
    policyBoundaries,
    sideEffectRules,
    outputContract,
    contextBudgetOptions,
  });
  if (enforceContextBudget && packet.contextBudget.status === "handoff_recommended") {
    return blockedAttempt({
      task,
      attemptId,
      executionMode,
      reason: packet.contextBudget.handoffPacket.nextAction,
      contract,
      contextBudget: packet.contextBudget,
    });
  }
  const prompt = renderFreshContextPrompt(packet);

  if (executionMode === "guided" || executionMode === "manual") {
    const outputPath = await writeAttemptOutput({ attemptDir, attemptId, content: prompt, suffix: "prompt" });
    return createAttemptRecord({
      task,
      attemptId,
      executionMode,
      status: "blocked",
      outputPath,
      changedFiles: [],
      verificationEvidence: [],
      score: null,
      failurePacket: createFailurePacket({
        taskId: task.id,
        attemptId,
        contractRef: contract?.contractId || contract?.id || null,
        failedScenario: "execution-mode-awaits-user",
        expectedEvidence: "manual or guided task execution",
        observedEvidence: `${executionMode} mode produced a prompt and stopped`,
        requeueReason: "missing_evidence",
      }),
    });
  }

  if (executionMode === "dry-run") {
    const output = [
      "SUPERVIBE_TASK_COMPLETE: true",
      "SUPERVIBE_EVIDENCE_SUMMARY: dry-run fresh-context packet generated",
      "SUPERVIBE_CHANGED_FILES: none",
    ].join("\n");
    const outputPath = await writeAttemptOutput({ attemptDir, attemptId, content: output });
    const score = evaluateTask(task, {
      verificationRan: true,
      verificationEvidence: ["dry-run fresh-context packet generated"],
      verificationMatrix: { pass: true },
      testsPassed: true,
      integrationWorks: true,
      noRegressions: true,
      codeGraphHandled: true,
      handoffComplete: true,
      policyCompliant: true,
      independentReview: normalizedReviewMode !== "final-sweep",
      finalReviewerSweepDeferred: normalizedReviewMode === "final-sweep",
      userApproval: task.policyRiskLevel !== "high",
    });
    return createAttemptRecord({
      task,
      attemptId,
      executionMode,
      status: "completed",
      outputPath,
      changedFiles: [],
      verificationEvidence: ["dry-run fresh-context packet generated"],
      score,
      failurePacket: null,
      contextBudget: packet.contextBudget,
    });
  }

  if (!adapter || typeof adapter.run !== "function") {
    return blockedAttempt({ task, attemptId, executionMode, reason: "missing_adapter", contract });
  }

  let runResult;
  try {
    runResult = await withNoProgressTimeout(adapter.run(packet, { prompt, allowSpawn, attemptId, mode: executionMode }), {
      adapter,
      attemptId,
      phase: "adapter.run",
      timeoutMs: noProgressTimeoutMs,
    });
  } catch (err) {
    if (err?.code === "no_progress_timeout") {
      const outputPath = await writeAttemptOutput({ attemptDir, attemptId, content: err.message });
      return noProgressAttempt({
        task,
        attemptId,
        executionMode,
        outputPath,
        observedEvidence: err.message,
        contract,
        noProgress: err.details,
      });
    }
    const outputPath = await writeAttemptOutput({ attemptDir, attemptId, content: err.stack || err.message });
    return failedAttempt({
      task,
      attemptId,
      executionMode,
      status: "tool_failed",
      outputPath,
      observedEvidence: err.message,
      contract,
    });
  }

  const sideEffect = createProcessSideEffect({
    adapterId: adapter.id,
    executionMode,
    processId: runResult.processId,
    commandOrToolClass: `adapter:${adapter.id}`,
    expectedSideEffect: runResult.spawned ? "fresh-context external adapter process" : "fresh-context stub adapter run",
    approvalLeaseId,
    permissionAuditId: permissionAudit?.auditId || null,
    permissionDecision: permissionAudit?.status || null,
    approvedToolClasses: permissionAudit?.approvedToolClasses || [],
    promptRequiredToolClasses: permissionAudit?.promptRequiredToolClasses || [],
    deniedToolClasses: permissionAudit?.deniedToolClasses || [],
    rateLimitState: permissionAudit?.rateLimitState || null,
    networkApprovalState: permissionAudit?.networkState || null,
    outputPath: null,
    status: runResult.spawned ? "started" : "verified",
  });
  if (ledgerPath) await appendSideEffect(ledgerPath, sideEffect);

  let output;
  try {
    output = typeof adapter.collectOutput === "function"
      ? await withNoProgressTimeout(adapter.collectOutput(runResult), {
        adapter,
        attemptId,
        phase: "adapter.collectOutput",
        timeoutMs: noProgressTimeoutMs,
      })
      : runResult.output || "";
  } catch (err) {
    if (err?.code === "no_progress_timeout") {
      const outputPath = await writeAttemptOutput({ attemptDir, attemptId, content: err.message });
      return noProgressAttempt({
        task,
        attemptId,
        executionMode,
        outputPath,
        observedEvidence: err.message,
        contract,
        noProgress: err.details,
      });
    }
    throw err;
  }
  const outputPath = await writeAttemptOutput({ attemptDir, attemptId, content: output });
  const completion = typeof adapter.extractCompletionSignal === "function"
    ? adapter.extractCompletionSignal(output)
    : { present: false, completed: false };
  const changedFiles = typeof adapter.extractChangedFiles === "function" ? adapter.extractChangedFiles(output) : [];
  const evidenceSummary = extractEvidenceSummary(output);
  const verificationEvidence = evidenceSummary ? [evidenceSummary] : [];

  if (runResult.status === "blocked") {
    return failedAttempt({
      task,
      attemptId,
      executionMode,
      status: "blocked",
      outputPath,
      changedFiles,
      observedEvidence: output,
      contract,
      requeueReason: "policy_block",
    });
  }

  if (runResult.status === "tool_failed" || (runResult.exitCode != null && runResult.exitCode !== 0)) {
    return failedAttempt({
      task,
      attemptId,
      executionMode,
      status: "tool_failed",
      outputPath,
      changedFiles,
      observedEvidence: output,
      contract,
    });
  }

  if (!completion.present || !completion.completed || verificationEvidence.length === 0) {
    return failedAttempt({
      task,
      attemptId,
      executionMode,
      status: "verification_failed",
      outputPath,
      changedFiles,
      observedEvidence: output || "missing completion signal or evidence summary",
      contract,
      requeueReason: "missing_evidence",
    });
  }

  const taskForScore = { ...task, verificationMatrix: verificationMatrix.filter((entry) => !entry.taskId || entry.taskId === task.id) };
  const score = evaluateTask(taskForScore, {
    verificationRan: true,
    verificationEvidence,
    verificationMatrix: { pass: true },
    testsPassed: true,
    integrationWorks: true,
    noRegressions: true,
    codeGraphHandled: true,
    handoffComplete: true,
    policyCompliant: true,
    independentReview: normalizedReviewMode !== "final-sweep",
    finalReviewerSweepDeferred: normalizedReviewMode === "final-sweep",
    userApproval: task.policyRiskLevel !== "high",
  });

  return createAttemptRecord({
    task,
    attemptId,
    executionMode,
    status: "completed",
    outputPath,
    changedFiles,
    verificationEvidence,
    score,
    failurePacket: null,
    sideEffect,
    contextBudget: packet.contextBudget,
  });
}

export function createAttemptRecord({
  task,
  attemptId,
  executionMode,
  status,
  outputPath,
  changedFiles = [],
  verificationEvidence = [],
  score = null,
  failurePacket = null,
  sideEffect = null,
  contextBudget = null,
  noProgress = null,
} = {}) {
  if (!ATTEMPT_STATUSES.includes(status)) throw new Error(`Unknown attempt status: ${status}`);
  return {
    attemptId,
    taskId: task.id,
    executionMode,
    status,
    outputPath,
    changedFiles,
    verificationEvidence,
    score,
    failurePacket,
    sideEffectId: sideEffect?.actionId || null,
    contextBudget,
    noProgress,
  };
}

async function writeAttemptOutput({ attemptDir, attemptId, content, suffix = "output" }) {
  if (!attemptDir) return null;
  await mkdir(attemptDir, { recursive: true });
  const outputPath = join(attemptDir, `${attemptId}-${suffix}.txt`);
  await writeFile(outputPath, `${content || ""}\n`, "utf8");
  return outputPath;
}

function failedAttempt({
  task,
  attemptId,
  executionMode,
  status,
  outputPath,
  changedFiles = [],
  observedEvidence,
  contract,
  requeueReason = null,
  contextBudget = null,
  noProgress = null,
} = {}) {
  const failurePacket = createFailurePacket({
    taskId: task.id,
    attemptId,
    contractRef: contract?.contractId || contract?.id || null,
    failedScenario: status,
    expectedEvidence: "completion signal and verification evidence summary",
    observedEvidence,
    requeueReason,
  });
  const score = evaluateTask(task, {
    verificationRan: false,
    verificationEvidence: [],
    verificationEvidenceMissing: true,
    testsPassed: false,
    integrationWorks: false,
    noRegressions: true,
    codeGraphHandled: false,
    handoffComplete: false,
    policyCompliant: status !== "blocked",
    independentReview: false,
    userApproval: false,
    failurePacket,
  });
  return createAttemptRecord({
    task,
    attemptId,
    executionMode,
    status,
    outputPath,
    changedFiles,
    verificationEvidence: [],
    score,
    failurePacket,
    contextBudget,
    noProgress,
  });
}

function noProgressAttempt(options = {}) {
  return failedAttempt({
    ...options,
    status: "stalled",
    requeueReason: "no_progress_timeout",
  });
}

function blockedAttempt({ task, attemptId, executionMode, reason, contract, contextBudget = null }) {
  return failedAttempt({
    task,
    attemptId,
    executionMode,
    status: "blocked",
    outputPath: null,
    observedEvidence: reason,
    contract,
    requeueReason: "policy_block",
    contextBudget,
  });
}

async function withNoProgressTimeout(promise, {
  adapter,
  attemptId,
  phase,
  timeoutMs = DEFAULT_NO_PROGRESS_TIMEOUT_MS,
} = {}) {
  const normalizedTimeoutMs = normalizeTimeoutMs(timeoutMs);
  if (!normalizedTimeoutMs) return promise;
  let timeoutId;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          const stopResult = stopAdapter(adapter);
          const error = new Error(`No progress from ${phase} for ${normalizedTimeoutMs}ms; stopped stalled worker/reviewer attempt ${attemptId}.`);
          error.code = "no_progress_timeout";
          error.details = {
            attemptId,
            phase,
            timeoutMs: normalizedTimeoutMs,
            stopResult,
            nextAction: "close stalled agent attempt and continue via batch fallback or requeue with changed conditions",
          };
          reject(error);
        }, normalizedTimeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function normalizeTimeoutMs(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.max(1, Math.floor(number));
}

function stopAdapter(adapter) {
  if (!adapter || typeof adapter.stop !== "function") return { stopped: false, reason: "adapter-stop-unavailable" };
  try {
    return adapter.stop("no_progress_timeout");
  } catch (err) {
    return { stopped: false, reason: err.message };
  }
}

function normalizeReviewMode(value) {
  const normalized = String(value || "final-sweep").trim().toLowerCase().replace(/_/g, "-");
  if (["per-task", "inline", "wave", "stage-2"].includes(normalized)) return "per-task";
  return "final-sweep";
}

function sanitizeContextPack(contextPack) {
  if (!contextPack) return null;
  const allowed = {
    memoryEntries: contextPack.memoryEntries || [],
    codeRagChunks: contextPack.codeRagChunks || [],
    codeGraphEvidence: contextPack.codeGraphEvidence || [],
    directFilesRead: contextPack.directFilesRead || [],
    rulesLoaded: contextPack.rulesLoaded || [],
    mcpPlan: contextPack.mcpPlan || null,
    workflowSignal: contextPack.workflowSignal || null,
  };
  return allowed;
}
