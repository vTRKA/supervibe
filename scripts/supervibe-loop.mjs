#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { access, copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  forkAutonomousLoopCheckpoint,
  recordUserGoalAcceptance,
  runAutonomousLoop,
  resumeAutonomousLoop,
  stopAutonomousLoop,
} from "./lib/autonomous-loop-runner.mjs";
import { createTasksFromRequest, loadPlanTasks, loadPlanTasksWithSource } from "./lib/autonomous-loop-task-source.mjs";
import { buildPreflight } from "./lib/autonomous-loop-preflight-intake.mjs";
import { dispatchTask } from "./lib/autonomous-loop-dispatcher.mjs";
import { generateContracts, scoreAutonomyReadiness } from "./lib/autonomous-loop-contracts.mjs";
import { exportGraph, loadStateForGraphExport } from "./lib/autonomous-loop-graph-export.mjs";
import { formatDoctorReport, primeLoopRun, repairLoopRun } from "./lib/autonomous-loop-doctor.mjs";
import { archiveLoopRun, exportLoopBundle, importLoopBundle } from "./lib/autonomous-loop-archive.mjs";
import { archiveWorkItemGraph, classifyWorkItemGraphForGc } from "./lib/supervibe-work-item-gc.mjs";
import { atomizePlanFile, createWorkItemPreview, writeWorkItemGraph } from "./lib/supervibe-plan-to-work-items.mjs";
import { createCliTaskTrackerAdapter, createMemoryTaskTrackerAdapter, createUnavailableTaskTrackerAdapter } from "./lib/supervibe-durable-task-tracker-adapter.mjs";
import { createTaskTrackerMcpAdapter } from "./lib/supervibe-task-tracker-mcp-bridge.mjs";
import { formatTaskTrackerDoctorReport, repairTaskTracker } from "./lib/supervibe-task-tracker-doctor.mjs";
import { defaultTrackerMappingPath, materializeEpicAndTasks, readTrackerMapping, syncPull } from "./lib/supervibe-task-tracker-sync.mjs";
import { createTaskTrackerPrimeSummary, formatTaskTrackerPrimeReminder } from "./lib/supervibe-task-tracker-prime.mjs";
import { createWorkItemIndex, groupWorkItemsByStatus } from "./lib/supervibe-work-item-query.mjs";
import { defaultWorkItemDaemonPath, createWorkItemWatchRecord, formatWorkItemWatchStatus, readWorkItemDaemonState, stopWorkItemWatch, upsertWorkItemWatch, writeWorkItemDaemonState } from "./lib/supervibe-work-item-daemon.mjs";
import { defaultDelegatedInboxPath, formatDelegatedInbox, readDelegatedInbox } from "./lib/supervibe-work-item-message-delegation.mjs";
import { formatImportPreview, importWorkItemsFromFile } from "./lib/supervibe-work-item-migration-importer.mjs";
import { formatPriorityExplanation, orderReadyWorkItems } from "./lib/supervibe-work-item-priority-formula.mjs";
import { createOnboardingReport, createQuickstartPlan, formatOnboarding, formatQuickstart, generateShellCompletions } from "./lib/supervibe-shell-completions.mjs";
import { createFederatedSyncBundle, importFederatedSyncBundle, writeFederatedSyncBundle } from "./lib/supervibe-federated-sync-bundle.mjs";
import { formatNotificationRouteResult, routeNotificationEvent } from "./lib/supervibe-notification-router.mjs";
import { deferWorkItemFile } from "./lib/supervibe-work-item-scheduler.mjs";
import { mutateWorkItemGraphFile } from "./lib/supervibe-work-item-actions.mjs";
import { repairWorkItemRegistryIntegrity, resolveActiveWorkItemGraph, resolveActiveWorkItemGraphPath } from "./lib/supervibe-work-item-registry.mjs";
import { createGuidedWorkItemDraft, importGuidedWorkItemFromText, saveGuidedWorkItemDraft } from "./lib/supervibe-guided-work-item-forms.mjs";
import { createDryRunPreview, runInteractiveCli } from "./lib/supervibe-interactive-cli.mjs";
import { formatEvalHarnessReport, runAutonomousLoopEvals } from "./lib/autonomous-loop-eval-harness.mjs";
import { defaultApprovalReceiptLedgerPath, formatApprovalReceiptSummary, readApprovalReceipts } from "./lib/supervibe-approval-receipt-ledger.mjs";
import { detectPolicyConfigDrift, fixDerivedPolicyDefaults, formatPolicyDriftReport } from "./lib/supervibe-config-drift-detector.mjs";
import { loadPolicyProfile } from "./lib/supervibe-policy-profile-manager.mjs";
import { detectAnchorDrift, fixDerivedAnchorIndex, formatAnchorDriftReport, readDerivedAnchorIndex } from "./lib/supervibe-anchor-drift-detector.mjs";
import { appendChangeSummary, defaultChangeSummaryPath, formatChangeSummaryReport, readChangeSummaries } from "./lib/supervibe-change-summary-index.mjs";
import { buildSemanticAnchorIndex, formatSemanticAnchorReport, parseSemanticAnchors } from "./lib/supervibe-semantic-anchor-index.mjs";
import { formatAssignmentExplanation } from "./lib/supervibe-assignment-explainer.mjs";
import { buildExecutionWaves, formatWaveStatus, selectSafeExecutionWave, taskWriteSet } from "./lib/supervibe-wave-controller.mjs";
import { defaultRuntimeCleanupRegistryPath, summarizeHostManagedSubagentDebtSync } from "./lib/runtime-cleanup-registry.mjs";
import { createHappyPathPlan, formatHappyPathPlan } from "./lib/supervibe-happy-path.mjs";
import { formatEpicCompletionReport, validateEpicCompletion } from "./lib/supervibe-epic-completion-validator.mjs";
import { buildLoopCompletionDecision } from "./lib/supervibe-release-path.mjs";
import { formatStageDecisionCard } from "./lib/supervibe-post-stage-actions.mjs";
import { createPreLoopSummaryModel } from "./lib/supervibe-ui-server.mjs";
import {
  readWorkflowReceipts,
  validateWorkflowReceiptTrust,
} from "./lib/supervibe-workflow-receipt-runtime.mjs";
import {
  buildEvidencePacket,
  formatEvidencePacketSummary,
  hasEvidencePacket,
} from "./lib/supervibe-evidence-packet.mjs";
import {
  formatTaskBudgetPolicySummary,
  summarizeTaskBudgetPolicy,
} from "./lib/supervibe-task-budget-policy.mjs";
import { PRESET_NAMES, formatPresetSummary, selectWorkerPreset } from "./lib/supervibe-worker-reviewer-presets.mjs";
import { checkpointDiagnostics, formatCheckpointDiagnostics, readAgentCheckpoint, resumeAgentCheckpoint } from "./lib/supervibe-agent-checkpoints.mjs";
import {
  createWorktreeSessionRecord,
  defaultWorktreeRegistryPath,
  formatWorktreeSessionStatus,
  readWorktreeSessionRegistry,
  selectWorktreeDirectory,
  upsertWorktreeSession,
  upsertWorktreeSessionFile,
  validateExistingWorktree,
  writeWorktreeSessionRegistry,
} from "./lib/supervibe-worktree-session-manager.mjs";
import {
  formatLoopProviderCapabilityMatrix,
  getLoopProviderCapabilityMatrix,
  resolveDefaultLoopExecutionMode,
  resolveToolLoopCapabilities,
  TOOL_ADAPTER_IDS,
} from "./lib/autonomous-loop-tool-adapters.mjs";
import { loadProviderCapabilities } from "./lib/supervibe-provider-config-doctor.mjs";
import { startBackgroundNodeScript } from "./lib/supervibe-process-manager.mjs";
import { selectHostAdapter } from "./lib/supervibe-host-detector.mjs";
import { validatePlanReviewGateForPlan } from "./validate-plan-review-artifacts.mjs";
import {
  createFinalReviewerSweep,
  evaluateFinalReviewerSweep,
  formatFinalReviewerSweepReport,
  upsertFinalReviewerSweep,
} from "./lib/supervibe-final-review-sweep.mjs";

const SEMANTIC_EPIC_GROUPING_VERSION = 1;
const DEFAULT_SEMANTIC_EPIC_MAX_TASKS = 25;
const DEFAULT_AGENT_STALL_TIMEOUT_MINUTES = 7;
const DEFAULT_AGENT_STALL_MAX_RETRIES = 2;
const SEMANTIC_EPIC_BUCKETS = Object.freeze([
  {
    key: "ui",
    title: "Supervibe UI",
    keywords: ["ui", "interface", "screen", "tab", "dashboard", "work item", "work items", "kanban", "loop run", "browser", "design", "drawer"],
  },
  {
    key: "memory",
    title: "Project Memory",
    keywords: ["memory", "decision", "learning", "recall", "context pack", "project memory", "linked evidence", "knowledge"],
  },
  {
    key: "rag",
    title: "Code RAG",
    keywords: ["rag", "retrieval", "chunk", "metadata", "embedding", "fts", "golden query", "golden queries", "code-store", "code store", "search-code"],
  },
  {
    key: "codegraph",
    title: "CodeGraph",
    keywords: ["codegraph", "code graph", "symbol", "symbols", "edge", "edges", "graph coverage", "relationship map", "graph map"],
  },
  {
    key: "loop",
    title: "Loop Runtime And Scheduler",
    keywords: ["loop", "scheduler", "execution wave", "wave", "claim", "lease", "heartbeat", "concurrency", "parallel", "agent", "subagent", "worktree"],
  },
  {
    key: "receipts",
    title: "Receipts And Runtime Proof",
    keywords: ["receipt", "receipts", "workflow-receipt", "ledger", "trusted evidence", "proof", "reissue", "rebuild"],
  },
  {
    key: "providers",
    title: "Provider Configs",
    keywords: ["provider", "provider preset", "codex config", "subagent limit", "codex", "claude", "gemini", "cursor", "opencode", "config", "preset", "toml", "agents.md", "subagents", "hooks", "goals"],
  },
  {
    key: "plan-lifecycle",
    title: "Plan Lifecycle",
    keywords: ["plan", "archive", "stale plan", "current plan", "artifact", "lifecycle", "atomize", "atomization", "handoff"],
  },
  {
    key: "tests",
    title: "Verification And Tests",
    keywords: ["test", "tests", "verification", "smoke", "golden", "fixture", "validate", "npm run", "node --test"],
  },
]);

function parseArgs(argv) {
  const args = { _: [] };
  const booleanArgs = new Set([
    "dry-run",
    "guided",
    "manual",
    "fresh-context",
    "status",
    "epic-status",
    "readiness",
    "json",
    "commit-per-task",
    "graph",
    "doctor",
    "prime",
    "archive",
    "export",
    "import",
    "fix",
    "help",
    "atomize",
    "create-epic",
    "plan-review-passed",
    "reviewed",
    "worktree",
    "worktree-status",
    "watch",
    "quickstart",
    "onboard",
    "priority",
    "inbox",
    "tracker-sync-push",
    "tracker-sync-pull",
    "tracker-doctor",
    "tracker-prime",
    "interactive",
    "preview",
    "yes",
    "force",
    "create-work-item",
    "claim-ready",
    "dispatch-wave",
    "resume-dispatch",
    "status-only-fallback",
    "eval",
    "eval-live",
    "approval-receipts",
    "policy-doctor",
    "fix-derived",
    "approve-mcp-tracker",
    "anchors",
    "anchor-doctor",
    "summarize-changes",
    "speculative",
    "assign-ready",
    "explain",
    "setup-worker-presets",
    "allow-session-conflict",
    "happy-path",
    "checkpoint-status",
    "repair-checkpoints",
    "provider-matrix",
    "require-user-acceptance",
    "accept-goals",
    "reject-goals",
    "fork-checkpoint",
    "allow-spawn",
    "permission-prompt-bridge",
    "network-approved",
    "mcp-approved",
    "allow-flat-plan",
    "no-tracker-sync",
    "validate-completion",
    "completion-status",
    "close-eligible",
    "require-release-full-check",
    "allow-missing-release-full-check",
    "allow-dry-run-evidence",
    "require-trusted-evidence",
    "disallow-legacy-evidence",
    "allow-legacy-evidence",
    "allow-open-epic",
    "no-evidence-required",
    "stall-check",
    "non-production",
    "indefinite",
    "auto-ui",
    "auto-ui-dry-run",
    "no-auto-ui",
    "allow-unverified-plan-review",
    "pre-loop-summary",
    "final-review-sweep",
    "final-review-status",
    "write-final-review-sweep",
    "allow-untrusted-final-review",
    "apply",
  ]);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      args._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    if (key === "from-plan") {
      if (argv[i + 1] && !argv[i + 1].startsWith("--")) {
        args[key] = argv[i + 1];
        i += 1;
      } else {
        args[key] = true;
      }
    } else if (booleanArgs.has(key)) {
      args[key] = true;
    } else {
      args[key] = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

function isTenOfTenWaveRequest({ tasks = [], source = {}, planPath = "" } = {}) {
  const text = [
    planPath,
    source.planPath,
    source.sourcePath,
    source.content,
    ...(tasks || []).map((task) => `${task.id || ""} ${task.title || ""} ${task.goal || ""} ${task.acceptance || ""} ${(task.acceptanceCriteria || []).join(" ")}`),
  ].join(" ").toLowerCase();
  return /\b10\s*\/\s*10\b|\bten\s*of\s*ten\b/.test(text);
}

function applySemanticEpicGroupingToGraph(graph = {}, options = {}) {
  const items = Array.isArray(graph.items) ? graph.items : [];
  const candidates = items.filter((item) => isSemanticEpicCandidate(item));
  const maxTasksPerEpic = positiveInteger(options.maxTasksPerEpic, DEFAULT_SEMANTIC_EPIC_MAX_TASKS);
  const semanticEpics = groupTasksIntoSemanticEpics(candidates, {
    idPrefix: "semantic-epic",
    maxTasksPerEpic,
  });
  const groupByTaskId = new Map();
  for (const epic of semanticEpics) {
    for (const taskId of epic.taskIds) groupByTaskId.set(taskId, epic.id);
  }
  for (const item of candidates) {
    const taskId = semanticTaskId(item);
    if (!taskId || !groupByTaskId.has(taskId)) continue;
    item.executionHints = {
      ...(item.executionHints || {}),
      semanticEpicId: groupByTaskId.get(taskId),
    };
  }
  const averageConfidence = semanticEpics.length
    ? Number((semanticEpics.reduce((sum, epic) => sum + epic.confidence, 0) / semanticEpics.length).toFixed(2))
    : 0;
  graph.metadata = {
    ...(graph.metadata || {}),
    semanticEpicGrouping: {
      version: SEMANTIC_EPIC_GROUPING_VERSION,
      strategy: "supervibe-keyword-semantic-buckets",
      maxTasksPerEpic,
      taskCount: candidates.length,
      epicCount: semanticEpics.length,
      averageConfidence,
    },
    semanticEpics,
  };
  return graph;
}

function groupTasksIntoSemanticEpics(tasks = [], options = {}) {
  const maxTasksPerEpic = positiveInteger(options.maxTasksPerEpic, DEFAULT_SEMANTIC_EPIC_MAX_TASKS);
  const idPrefix = options.idPrefix || "semantic-epic";
  const grouped = new Map();

  for (const [index, task] of tasks.entries()) {
    const classification = classifySemanticTask(task);
    const key = classification.bucket.key;
    if (!grouped.has(key)) {
      grouped.set(key, {
        bucket: classification.bucket,
        tasks: [],
        keywordCounts: new Map(),
      });
    }
    const group = grouped.get(key);
    const taskId = semanticTaskId(task) || `${key}-task-${index + 1}`;
    group.tasks.push({ task, taskId, classification, sourceOrder: index });
    for (const keyword of classification.matchedKeywords) {
      group.keywordCounts.set(keyword, (group.keywordCounts.get(keyword) || 0) + 1);
    }
  }

  const epics = [];
  const orderedGroups = [...grouped.values()].sort((a, b) => {
    const orderA = SEMANTIC_EPIC_BUCKETS.findIndex((bucket) => bucket.key === a.bucket.key);
    const orderB = SEMANTIC_EPIC_BUCKETS.findIndex((bucket) => bucket.key === b.bucket.key);
    return orderA - orderB || a.bucket.title.localeCompare(b.bucket.title);
  });

  for (const group of orderedGroups) {
    const chunks = chunkArray(group.tasks.sort((a, b) => a.sourceOrder - b.sourceOrder), maxTasksPerEpic);
    for (const [chunkIndex, chunk] of chunks.entries()) {
      const topKeywords = [...group.keywordCounts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 4)
        .map(([keyword]) => keyword);
      const suffix = chunks.length > 1 ? `-${chunkIndex + 1}` : "";
      const confidenceBase = chunk.reduce((sum, entry) => sum + entry.classification.confidence, 0) / Math.max(1, chunk.length);
      const sizeBonus = chunk.length >= 3 ? 0.04 : 0;
      const confidence = Number(clamp(confidenceBase + sizeBonus, 0.5, 0.95).toFixed(2));
      epics.push({
        id: `${idPrefix}-${group.bucket.key}${suffix}`,
        type: "epic",
        semanticKey: group.bucket.key,
        title: chunks.length > 1 ? `${group.bucket.title} ${chunkIndex + 1}` : group.bucket.title,
        taskIds: chunk.map((entry) => entry.taskId),
        taskCount: chunk.length,
        groupingReason: topKeywords.length
          ? `Matched semantic signals: ${topKeywords.join(", ")}.`
          : `Grouped by fallback ${group.bucket.title} bucket because task text lacked stronger domain markers.`,
        confidence,
      });
    }
  }

  return epics;
}

function classifySemanticTask(task = {}) {
  const text = semanticTaskText(task);
  let best = null;
  for (const bucket of SEMANTIC_EPIC_BUCKETS) {
    const matchedKeywords = bucket.keywords.filter((keyword) => semanticKeywordMatches(text, keyword));
    const score = matchedKeywords.reduce((sum, keyword) => sum + (keyword.includes(" ") ? 3 : 1), 0);
    if (!best || score > best.score) best = { bucket, score, matchedKeywords };
  }
  if (!best || best.score === 0) {
    best = {
      bucket: { key: "implementation", title: "Implementation", keywords: [] },
      score: 0,
      matchedKeywords: [],
    };
  }
  const confidence = best.score > 0
    ? clamp(0.65 + (best.score * 0.04), 0.65, 0.91)
    : 0.56;
  return { ...best, confidence };
}

function semanticTaskText(task = {}) {
  const writeScope = Array.isArray(task.writeScope)
    ? task.writeScope.map((entry) => typeof entry === "string" ? entry : [entry.action, entry.path].filter(Boolean).join(" ")).join(" ")
    : "";
  return normalizeSemanticText([
    task.itemId,
    task.id,
    task.title,
    task.goal,
    task.category,
    task.component,
    task.owner,
    task.requiredAgentCapability,
    task.labels?.join?.(" "),
    task.targetFiles?.join?.(" "),
    task.filesTouched?.join?.(" "),
    task.fileImpact?.join?.(" "),
    writeScope,
    task.acceptanceCriteria?.join?.(" "),
    task.contractChecklist?.join?.(" "),
    task.executionHints?.sourceTaskRef,
    task.executionHints?.requiredAgentCapability,
    task.executionHints?.contractRows?.join?.(" "),
    task.executionHints?.scopeIds?.join?.(" "),
  ].filter(Boolean).join(" "));
}

function semanticKeywordMatches(text, keyword) {
  return text.includes(normalizeSemanticText(keyword));
}

function normalizeSemanticText(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[\\/_.:-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isSemanticEpicCandidate(item = {}) {
  if (["epic", "gate", "followup"].includes(item.type)) return false;
  return Boolean(semanticTaskId(item));
}

function taskDeclaredWriteSet(task = {}) {
  return taskWriteSet(task).map(normalizeTaskPath).filter(Boolean);
}

function tasksReadyForAssignment(state = {}) {
  if (Array.isArray(state.items) && state.items.length > 0) {
    const index = createWorkItemIndex({ graph: state });
    return orderReadyWorkItems(index.filter((item) => item.type !== "epic" && item.effectiveStatus === "ready"), { graph: state })
      .map((item) => ({
        ...(item.task || {}),
        ...item,
        id: item.itemId || item.id,
        taskId: item.itemId || item.id,
        goal: item.goal || item.title,
        category: item.category || item.type || "implementation",
      }));
  }
  return (state.tasks || [])
    .filter((task) => ["open", "ready", "pending"].includes(task.status || "open"))
    .map((task) => ({
      ...task,
      id: task.id || task.itemId || task.taskId,
      taskId: task.taskId || task.id || task.itemId,
    }));
}

function buildReadyAssignmentDispatches(tasks = [], {
  args = {},
  rootDir = process.cwd(),
  maxConcurrency = 3,
  commandId = "supervibe-loop-assign-ready",
  writeSetLocks = [],
} = {}) {
  const cleanupBlocked = Number(maxConcurrency) <= 0;
  const selection = cleanupBlocked
    ? { selected: [], blocked: [], serialized: [], conflicts: [] }
    : selectSafeExecutionWave({
        tasks,
        maxConcurrency,
        maxPolicyRiskLevel: args["max-policy-risk-level"] || args.maxPolicyRiskLevel || "medium",
        requireWriteSet: true,
        writeSetLocks,
      });
  const selectedIds = new Set(selection.selected.map((task) => task.id || task.taskId || task.itemId));
  const blockedReasons = new Map(selection.blocked.map((item) => [item.taskId, item.reason]));
  const serializedReasons = new Map(selection.serialized.map((item) => [item.taskId, item.reason]));
  const planned = tasks.map((task) => {
    const taskId = task.id || task.taskId || task.itemId;
    const writeSet = taskDeclaredWriteSet(task);
    if (cleanupBlocked) {
      return {
        task,
        taskId,
        writeSet,
        status: "blocked",
        blockedReason: "completed Codex subagent cleanup is required before opening new provider threads",
      };
    }
    if (selectedIds.has(taskId)) return { task, taskId, writeSet, status: "assigned", blockedReason: null };
    if (blockedReasons.has(taskId)) return { task, taskId, writeSet, status: "blocked", blockedReason: blockedReasons.get(taskId) };
    if (serializedReasons.has(taskId)) return { task, taskId, writeSet, status: "serialized", blockedReason: serializedReasons.get(taskId) };
    return { task, taskId, writeSet, status: "serialized", blockedReason: "outside current safe execution wave" };
  });

  return planned.map(({ task, taskId, writeSet, status, blockedReason }) => {
    const evidencePacket = buildEvidencePacket({ rootDir, task, commandId });
    const verificationPolicy = createTaskLocalVerificationPolicy(task);
    const writeSetLock = status === "assigned" ? createAssignmentWriteSetLock(task, writeSet) : null;
    if (status !== "assigned") {
      return {
        taskId,
        status,
        assignmentBlocked: true,
        blockedReason,
        writeSet,
        writeSetLock,
        evidencePacket,
        verificationPolicy,
        workerAssignmentPayload: null,
        reviewerAssignmentPayload: null,
        codexSpawnPayload: null,
        assignmentExplanation: null,
      };
    }
    const reviewMode = args.reviewMode || args["review-mode"] || "final-sweep";
    const dispatch = dispatchTask({ ...task, id: taskId }, { useCapabilityRegistry: true, reviewMode });
    const assignmentExplanation = attachVerificationPolicyToExplanation(dispatch.assignmentExplanation, verificationPolicy);
    const workerAssignmentPayload = {
      agentId: dispatch.primaryAgentId,
      taskId: dispatch.taskId,
      writeSet,
      writeSetLock,
      evidencePacket,
      verificationPolicy,
      verificationCommands: verificationPolicy.targetedCommands,
      deferredFullVerificationCommands: verificationPolicy.deferredFullCommands,
    };
    return {
      ...dispatch,
      status: "assigned",
      writeSet,
      writeSetLock,
      evidencePacket,
      verificationPolicy,
      assignmentExplanation,
      workerAssignmentPayload,
      reviewerAssignmentPayload: {
        deferredUntil: dispatch.reviewPolicy?.mode === "final-sweep" ? "graph-release-gate" : null,
        agentId: dispatch.reviewerAgentId,
        taskId: dispatch.taskId,
        writeSet,
        writeSetLock,
        evidencePacket,
        verificationPolicy,
        verificationCommands: verificationPolicy.targetedCommands,
        deferredFullVerificationCommands: verificationPolicy.deferredFullCommands,
      },
      codexSpawnPayload: {
        agent_type: "worker",
        fork_context: false,
        task_id: dispatch.taskId,
        message: [
          `Supervibe work item ${dispatch.taskId}: ${task.title || task.goal || "assigned task"}.`,
          "You are not alone in the codebase; do not revert edits made by others and keep to your assigned write set.",
          `Owned write set: ${writeSet.join(", ")}`,
          "Do not run tests or validators during development for plan/graph/task work; they are release-gate only.",
          `Non-test/non-validator evidence allowed now: ${verificationPolicy.targetedCommands.join(" && ") || "none; collect implementation evidence and defer test/validator execution"}.`,
          `Deferred test/validator/full verification: ${verificationPolicy.deferredFullCommands.join(" && ") || "none"}.`,
          "Final response must list changed file paths, non-test/non-validator evidence, deferred tests/validators, and any blockers.",
        ].join("\n"),
      },
    };
  });
}

function createAssignmentWriteSetLock(task = {}, writeSet = taskDeclaredWriteSet(task)) {
  const taskId = task.id || task.taskId || task.itemId || "unknown-task";
  const lockId = `write-set-${String(taskId).replace(/[^A-Za-z0-9_-]+/g, "-")}`;
  return {
    lockId,
    taskId,
    status: "reserved",
    owner: "supervibe-loop",
    writeSet,
    recoverCommand: `/supervibe-loop --recover-stale-lock ${lockId}`,
  };
}

function loadWriteSetLocksFromArgs(args = {}) {
  if (Array.isArray(args.writeSetLocks)) return args.writeSetLocks;
  return [];
}

function activeClaimWriteSetLocks(state = {}) {
  const claims = Array.isArray(state.claims) ? state.claims : [];
  const itemById = new Map();
  for (const entry of [...(state.items || []), ...(state.tasks || [])]) {
    const id = entry.itemId || entry.id || entry.taskId;
    if (id && !itemById.has(id)) itemById.set(id, entry);
  }
  const nowMs = Date.now();
  return claims
    .filter((claim) => isActiveClaimLock(claim, nowMs))
    .map((claim, index) => {
      const taskId = claim.taskId || claim.itemId || null;
      const declaredWriteSet = [
        ...(claim.writeSetLock?.writeSet || []),
        ...(claim.writeSet || []),
      ];
      const fallbackWriteSet = taskId ? taskDeclaredWriteSet(itemById.get(taskId) || {}) : [];
      const writeSet = [...new Set((declaredWriteSet.length ? declaredWriteSet : fallbackWriteSet)
        .map(normalizeTaskPath)
        .filter(Boolean))].sort();
      if (writeSet.length === 0) return null;
      return {
        lockId: claim.writeSetLock?.lockId || claim.claimId || `active-claim-${index + 1}`,
        taskId,
        owner: claim.agentId || claim.owner || "active-claim",
        status: "active",
        writeSet,
      };
    })
    .filter(Boolean);
}

function loadWriteSetLocksForState(state = {}, args = {}) {
  return [
    ...loadWriteSetLocksFromArgs(args),
    ...activeClaimWriteSetLocks(state),
  ];
}

function resolveMinimumParallelAgentsForDispatch(args = {}) {
  return Math.max(2, positiveInteger(args["min-parallel-agents"] || args["min-parallel"], 2));
}

function enforceMinimumParallelDispatchWave(dispatches = [], { minimumParallelAgents = 2, reason = "parallel agent wave required" } = {}) {
  const assigned = dispatches.filter((dispatch) => dispatch.status === "assigned");
  if (assigned.length === 0 || assigned.length >= minimumParallelAgents) return dispatches;
  const blockedReason = `${reason}; minimumParallelAgents=${minimumParallelAgents}, assigned=${assigned.length}`;
  return dispatches.map((dispatch) => {
    if (dispatch.status !== "assigned") return dispatch;
    return {
      ...dispatch,
      status: "blocked",
      assignmentBlocked: true,
      blockedReason,
      writeSetLock: null,
      workerAssignmentPayload: null,
      reviewerAssignmentPayload: null,
      codexSpawnPayload: null,
      assignmentExplanation: null,
    };
  });
}

function isActiveClaimLock(claim = {}, nowMs = Date.now()) {
  const status = String(claim.status || "").toLowerCase();
  if (!["active", "claimed", "in_progress"].includes(status)) return false;
  if (!claim.expiresAt) return true;
  const expiresAt = Date.parse(claim.expiresAt);
  return !Number.isFinite(expiresAt) || expiresAt > nowMs;
}

function semanticTaskId(task = {}) {
  return String(task.itemId || task.id || task.ref || "").trim();
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function chunkArray(items = [], size = DEFAULT_SEMANTIC_EPIC_MAX_TASKS) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeTaskPath(path = "") {
  return String(path || "").replace(/\\/g, "/").replace(/^\.\//, "").trim();
}

function planReviewLookupPath(rootDir, planPath) {
  const resolved = resolve(rootDir, planPath);
  const rel = relative(rootDir, resolved).replace(/\\/g, "/");
  if (rel && !rel.startsWith("../") && rel !== "..") return rel;
  return String(planPath).replace(/\\/g, "/");
}

function allowUnverifiedPlanReview(args) {
  return Boolean(args["allow-unverified-plan-review"])
    && process.env.SUPERVIBE_ALLOW_UNVERIFIED_PLAN_REVIEW === "1";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rootDir = process.cwd();
  let precomputedCompletionGraph = null;
  let precomputedCompletionGraphPath = null;
  if (args["resume-dispatch"]) args["dispatch-wave"] = true;

  if (args.help) {
    printHelp();
    return;
  }

  if (args["checkpoint-status"] || args["repair-checkpoints"]) {
    const report = await checkpointDiagnostics({ rootDir });
    console.log(formatCheckpointDiagnostics(report));
    if (!report.pass && !args["repair-checkpoints"]) process.exitCode = 2;
    return;
  }

  if (args["resume-task"]) {
    const checkpoint = await readAgentCheckpoint(args["resume-task"], { rootDir });
    if (!checkpoint) {
      console.error(`SUPERVIBE_RESUME_TASK_ERROR: checkpoint not found for ${args["resume-task"]}`);
      process.exitCode = 2;
      return;
    }
    const resume = resumeAgentCheckpoint(checkpoint, {
      now: new Date().toISOString(),
      requestedSideEffect: args["side-effect"] || null,
    });
    console.log([
      "SUPERVIBE_RESUME_TASK",
      `TASK: ${checkpoint.taskId}`,
      `PASS: ${resume.pass}`,
      `NEXT_SAFE_ACTION: ${resume.nextSafeAction}`,
      `REPLAY_GUARD: ${resume.replayGuard}`,
    ].join("\n"));
    if (!resume.pass) process.exitCode = 2;
    return;
  }

  if (args["happy-path"]) {
    const plan = createHappyPathPlan({
      prdPath: args["from-prd"] || args.prd,
      planPath: args.plan || args["atomize-plan"],
      request: args.request || args._.join(" "),
      epicId: args.epic || "<epic-id>",
      graphPath: args.file,
      maxDuration: args["max-duration"] || "until-goal-complete",
      tool: args.tool || "codex",
      dryRun: !args.apply,
    });
    if (args.json) console.log(JSON.stringify(plan, null, 2));
    else console.log(formatHappyPathPlan(plan));
    return;
  }

  if (args.interactive) {
    const result = runInteractiveCli({
      mode: "loop",
      planPath: args["atomize-plan"] || args.plan || null,
      graphPath: args.file || ".supervibe/memory/work-items/<epic-id>/graph.json",
      selectedAction: args["create-work-item"] ? "create-work-item" : null,
      isTTY: process.stdin.isTTY && process.stdout.isTTY,
      confirmed: Boolean(args.yes),
      yes: Boolean(args.yes),
    });
    console.log(result.output);
    if (!result.ok) process.exitCode = result.exitCode;
    return;
  }

  if (args.eval || args["eval-live"]) {
    const report = await runAutonomousLoopEvals({
      rootDir,
      caseId: args.case || null,
      replayDir: args.replay ? resolve(rootDir, args.replay) : null,
      live: Boolean(args["eval-live"]),
      maxRuntimeMinutes: args["max-runtime-minutes"],
      maxIterations: args["max-iterations"],
      providerBudget: args["provider-budget"],
      writeReportPath: args.out || ".supervibe/audits/autonomous-loop-evals/latest-report.json",
    });
    console.log(formatEvalHarnessReport(report));
    if (!report.pass) process.exitCode = report.blocked ? 2 : 1;
    return;
  }

  if (args["approval-receipts"]) {
    const receipts = await readApprovalReceipts(args.file || defaultApprovalReceiptLedgerPath(rootDir));
    console.log(formatApprovalReceiptSummary(receipts));
    return;
  }

  if (args["policy-doctor"]) {
    const drift = await detectPolicyConfigDrift({ rootDir });
    console.log(formatPolicyDriftReport(drift));
    if (args["fix-derived"]) {
      const fix = await fixDerivedPolicyDefaults({
        rootDir,
        derivedDefaults: {
          profile: args["policy-profile"] || "guided",
          deniedTools: ["provider-permission-bypass", "raw-secret-storage"],
          allowedTools: ["read", "status", "tests"],
        },
      });
      console.log(`FIX_DERIVED: changed=${fix.changed} file=${fix.outPath} backup=${fix.backupPath}`);
    }
    if (!drift.ok && !args["fix-derived"]) process.exitCode = 1;
    return;
  }

  if (args.anchors) {
    const anchors = args.file
      ? parseSemanticAnchors(await readFile(resolve(rootDir, args.file), "utf8"), { filePath: args.file })
      : (await buildSemanticAnchorIndex({ rootDir, files: [], sidecarPaths: [] })).anchors;
    console.log(formatSemanticAnchorReport({ anchors }));
    return;
  }

  if (args["anchor-doctor"]) {
    const indexPath = args.file || join(rootDir, ".supervibe", "memory", "anchors", "semantic-anchor-index.json");
    const index = await readDerivedAnchorIndex(indexPath);
    const drift = detectAnchorDrift({ anchors: index.anchors || [] });
    console.log(formatAnchorDriftReport(drift));
    if (args["fix-derived"]) {
      const fix = await fixDerivedAnchorIndex({ rootDir, anchors: index.anchors || [] });
      console.log(`FIX_DERIVED: changed=${fix.changed} file=${fix.outPath} backup=${fix.backupPath}`);
    }
    if (!drift.ok && !args["fix-derived"]) process.exitCode = 1;
    return;
  }

  if (args["summarize-changes"]) {
    const ledgerPath = args.out || defaultChangeSummaryPath(rootDir);
    if (args.task && args.file) {
      const summary = await appendChangeSummary(ledgerPath, {
        taskId: args.task,
        filePath: args.file,
        summary: args.summary || args.request || "Task changed file",
        why: args.why || "summarized by /supervibe-loop",
        evidenceRefs: args.evidence ? String(args.evidence).split(",") : [],
        verificationRefs: args.verification ? String(args.verification).split(",") : [],
        commit: args.commit || null,
        accepted: !args.speculative,
        speculative: Boolean(args.speculative),
      });
      console.log(`SUPERVIBE_CHANGE_SUMMARY\nSUMMARY: ${summary.summaryId}\nFILE: ${summary.filePath}\nLEDGER: ${ledgerPath}`);
      return;
    }
    console.log(formatChangeSummaryReport(await readChangeSummaries(ledgerPath)));
    return;
  }

  if (args["setup-worker-presets"]) {
    console.log("SUPERVIBE_WORKER_REVIEWER_PRESETS");
    console.log(`PRESETS: ${PRESET_NAMES.join(",")}`);
    console.log(formatPresetSummary(selectWorkerPreset({ category: "implementation" })));
    return;
  }

  if (args["provider-matrix"]) {
    console.log(formatLoopProviderCapabilityMatrix(getLoopProviderCapabilityMatrix()));
    return;
  }

  if (args["plan-waves"]) {
    const { tasks, source } = await loadPlanTasksWithSource(resolve(rootDir, args["plan-waves"]), { rootDir });
    for (const warning of source.warnings || []) console.log(warning);
    const schedulerPolicy = resolveSchedulerPolicy({ args, rootDir });
    const plan = buildExecutionWaves({
      tasks,
      maxConcurrency: schedulerPolicy.effectiveMaxConcurrency,
      requireWriteSet: true,
      writeSetLocks: loadWriteSetLocksFromArgs(args, { rootDir }),
    });
    plan.schedulerPolicy = schedulerPolicy;
    plan.semanticEpics = groupTasksIntoSemanticEpics(tasks, {
      maxTasksPerEpic: args["semantic-epic-max-tasks"] || DEFAULT_SEMANTIC_EPIC_MAX_TASKS,
    });
    const wavePacket = buildEvidencePacket({
      rootDir,
      task: {
        id: source.planPath || args["plan-waves"],
        goal: tasks.map((task) => task.goal || task.title || task.id).join(" "),
      },
      commandId: "supervibe-loop-plan-waves",
    });
    plan.evidencePacket = wavePacket;
    if (!hasEvidencePacket(wavePacket) && isTenOfTenWaveRequest({ tasks, source, planPath: args["plan-waves"] })) {
      plan.status = "paused";
      plan.blockers = [...(plan.blockers || []), "missing-evidence-packet"];
      if (plan.currentWave) plan.currentWave.status = "paused";
    }
    console.log(formatWaveStatus(plan));
    console.log(formatSchedulerPolicy(schedulerPolicy));
    console.log(formatSchedulerDecisions(plan));
    console.log(formatEvidencePacketSummary(wavePacket));
    return;
  }

  if (args["assign-ready"]) {
    const state = args.file ? JSON.parse(await readFile(resolve(rootDir, args.file), "utf8")) : { tasks: [] };
    const schedulerPolicy = resolveSchedulerPolicy({ args, rootDir, activeGraph: state });
    const dispatches = buildReadyAssignmentDispatches(tasksReadyForAssignment(state), {
      args,
      rootDir,
      maxConcurrency: schedulerPolicy.effectiveMaxConcurrency,
      commandId: "supervibe-loop-assign-ready",
      writeSetLocks: loadWriteSetLocksForState(state, args),
    });
    if (args.json) console.log(JSON.stringify(dispatches, null, 2));
    else {
      console.log("SUPERVIBE_ASSIGN_READY");
      console.log(formatSchedulerPolicy(schedulerPolicy));
      for (const dispatch of dispatches) {
        if (dispatch.assignmentBlocked) {
          console.log(`${dispatch.taskId}: blocked -> ${dispatch.blockedReason}`);
        } else {
          console.log(args.explain
            ? [formatAssignmentExplanation(dispatch.assignmentExplanation), formatTaskLocalVerificationPolicy(dispatch.verificationPolicy)].join("\n")
            : `${dispatch.taskId}: ${dispatch.primaryAgentId} -> ${dispatch.reviewerAgentId || "final-reviewer-sweep"}`);
        }
        console.log(formatEvidencePacketSummary(dispatch.evidencePacket));
      }
    }
    return;
  }

  if (args["dispatch-wave"]) {
    const graphPath = args.file
      ? resolve(rootDir, args.file)
      : await resolveActiveWorkItemGraphPath({ rootDir });
    if (!graphPath) {
      if (args["resume-dispatch"] || args["status-only-fallback"]) {
        console.log("SUPERVIBE_RESUME_DISPATCH");
        console.log("STATUS: no-active-work-graph");
        console.log("ASSIGNED: none");
        console.log("NEXT_ACTION: create or atomize a reviewed work-item graph before dispatching a parallel agent wave");
        return;
      }
      throw new Error("dispatch-wave requires --file <graph.json> or an active work graph");
    }
    const graph = JSON.parse(await readFile(graphPath, "utf8"));
    const schedulerPolicy = resolveSchedulerPolicy({ args, rootDir, activeGraph: graph });
    const dispatches = buildReadyAssignmentDispatches(tasksReadyForAssignment(graph), {
      args,
      rootDir,
      maxConcurrency: schedulerPolicy.effectiveMaxConcurrency,
      commandId: "supervibe-loop-dispatch-wave",
      writeSetLocks: loadWriteSetLocksForState(graph, args),
    });
    const minimumParallelAgents = resolveMinimumParallelAgentsForDispatch(args);
    const fanoutCheckedDispatches = enforceMinimumParallelDispatchWave(dispatches, {
      minimumParallelAgents,
      reason: "real parallel agent wave required for durable plan/graph/task workflows",
    });
    const assigned = fanoutCheckedDispatches.filter((dispatch) => dispatch.status === "assigned");
    const claimResults = [];
    if (args.apply && !args["dry-run"] && !args.preview) {
      if (assigned.length > 0) {
        const waveId = args["wave-id"] || `wave-${Date.now()}`;
        const result = await mutateWorkItemGraphFile(graphPath, {
          type: "claim-wave",
          waveId,
          claims: assigned.map((dispatch) => ({
            itemId: dispatch.taskId,
            writeSet: dispatch.writeSet,
            writeSetLock: dispatch.writeSetLock,
          })),
          actor: args.actor || args.owner || "codex-wave",
          reason: args.reason || "claimed by /supervibe-loop --dispatch-wave",
          force: Boolean(args.force),
          rootDir,
        });
        claimResults.push(...(result.claimResults || []).map((item) => ({
          itemId: item.itemId,
          claimId: item.claimId,
          changed: item.changed,
          action: result.action,
          waveId,
        })));
      }
    }
    const report = {
      schemaVersion: 1,
      command: "supervibe-loop-dispatch-wave",
      graphPath,
      applied: Boolean(args.apply && !args["dry-run"] && !args.preview),
      schedulerPolicy,
      minimumParallelAgents,
      parallelDispatchRequired: true,
      parallelDispatchBlocked: dispatches.some((dispatch) => dispatch.status === "assigned") && assigned.length === 0,
      assignedTaskIds: assigned.map((dispatch) => dispatch.taskId),
      dispatches: fanoutCheckedDispatches,
      claimResults,
    };
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else {
      console.log("SUPERVIBE_DISPATCH_WAVE");
      console.log(`GRAPH: ${graphPath}`);
      console.log(`APPLIED: ${report.applied}`);
      console.log(formatSchedulerPolicy(schedulerPolicy));
      console.log(`ASSIGNED: ${report.assignedTaskIds.join(", ") || "none"}`);
      for (const dispatch of fanoutCheckedDispatches) {
        if (dispatch.assignmentBlocked) console.log(`${dispatch.taskId}: ${dispatch.status} -> ${dispatch.blockedReason}`);
        else console.log(`${dispatch.taskId}: ${dispatch.primaryAgentId} writeSet=${dispatch.writeSet.join(",")}`);
      }
    }
    return;
  }

  if (args.heartbeat) {
    if (!args.file) throw new Error("--heartbeat requires --file <graph.json>");
    const graphPath = resolve(rootDir, args.file);
    const result = await updateAgentHeartbeatFile(graphPath, {
      itemId: args.heartbeat,
      owner: args.owner || args.actor || "agent",
      hostInvocationId: runtimeInvocationIdFromArgs(args),
      now: args.now || new Date().toISOString(),
      progressSignature: args["progress-signature"] || args.progress || null,
      status: args.status || null,
    });
    console.log("SUPERVIBE_AGENT_HEARTBEAT");
    console.log(`ITEM: ${result.itemId}`);
    console.log(`OWNER: ${result.owner}`);
    console.log(`HOST_INVOCATION_ID: ${result.hostInvocationId}`);
    console.log(`HEARTBEAT_AT: ${result.heartbeatAt}`);
    if (result.progressSignature) console.log(`PROGRESS_SIGNATURE: ${result.progressSignature}`);
    console.log(`GRAPH: ${graphPath}`);
    if (result.backupPath) console.log(`BACKUP: ${result.backupPath}`);
    return;
  }

  if (args["stall-check"]) {
    if (!args.file) throw new Error("--stall-check requires --file <graph.json>");
    const graphPath = resolve(rootDir, args.file);
    const result = await markStalledAgentsFile(graphPath, {
      now: args.now || new Date().toISOString(),
      staleAfterMinutes: args["stale-after-minutes"] || args["stall-timeout-minutes"],
      maxRetries: args["max-stall-retries"],
      owner: args.owner || args.actor || "loop",
    });
    console.log("SUPERVIBE_AGENT_STALL_CHECK");
    console.log(`STALLED: ${result.stalled.length}`);
    console.log(`RETRYABLE: ${result.retryable}`);
    console.log(`MANUAL_INTERVENTION: ${result.manualIntervention}`);
    for (const stalled of result.stalled) {
      console.log(`TASK: ${stalled.itemId} OWNER: ${stalled.owner || "unknown"} AGE_MINUTES: ${stalled.heartbeatAgeMinutes} RECOVERY: ${stalled.recoveryAction}`);
    }
    console.log(`GRAPH: ${graphPath}`);
    if (result.backupPath) console.log(`BACKUP: ${result.backupPath}`);
    return;
  }

  if (args["recover-stalled"]) {
    if (!args.file) throw new Error("--recover-stalled requires --file <graph.json>");
    const itemId = String(args["recover-stalled"] || "").trim();
    if (!itemId) throw new Error("--recover-stalled requires an item id");
    const graphPath = resolve(rootDir, args.file);
    const result = await recoverStalledAgentFile(graphPath, {
      itemId,
      now: args.now || new Date().toISOString(),
      owner: args.owner || args.actor || "loop",
    });
    console.log("SUPERVIBE_AGENT_STALL_RECOVERY");
    console.log(`ITEM: ${result.itemId}`);
    console.log(`RECOVERED: ${result.recovered}`);
    console.log(`RETRY_COUNT: ${result.retryCount}`);
    console.log(`STATUS: ${result.status}`);
    console.log(`GRAPH: ${graphPath}`);
    if (result.backupPath) console.log(`BACKUP: ${result.backupPath}`);
    return;
  }

  if (args["recover-stale-lock"]) {
    const lockId = String(args["recover-stale-lock"] || "").trim();
    if (!lockId) throw new Error("--recover-stale-lock requires a lock id");
    if (!args.file) throw new Error("--recover-stale-lock requires --file <state.json>");
    const filePath = resolve(rootDir, args.file);
    const state = JSON.parse(await readFile(filePath, "utf8"));
    const before = Array.isArray(state.writeSetLocks) ? state.writeSetLocks : [];
    const after = before.filter((lock) => {
      const candidateId = lock.lockId || lock.id;
      return !(candidateId === lockId && String(lock.status || "").toLowerCase() === "stale");
    });
    state.writeSetLocks = after;
    await writeFile(filePath, JSON.stringify(state, null, 2), "utf8");
    console.log("SUPERVIBE_WRITE_SET_LOCK_RECOVERY");
    console.log(`LOCK: ${lockId}`);
    console.log(`REMOVED: ${before.length - after.length}`);
    console.log(`FILE: ${filePath}`);
    return;
  }

  if (args.completion) {
    console.log(generateShellCompletions({ shell: args.completion }));
    return;
  }

  if (args.quickstart) {
    const plan = createQuickstartPlan({ rootDir });
    for (const dir of plan.directories) await mkdir(join(rootDir, dir), { recursive: true });
    console.log(formatQuickstart(plan));
    return;
  }

  if (args.onboard) {
    const report = createOnboardingReport({
      rootDir,
      hasWorkItems: await pathExists(join(rootDir, ".supervibe", "memory", "work-items")),
      hasLoopState: await pathExists(join(rootDir, ".supervibe", "memory", "loops")),
      hasTrackerMapping: await pathExists(join(rootDir, ".supervibe", "memory", "loops", "task-tracker-map.json")),
    });
    console.log(formatOnboarding(report));
    return;
  }

  if (args["tracker-prime"]) {
    const summary = await createTaskTrackerPrimeSummary({ rootDir });
    if (args.json) console.log(JSON.stringify(summary, null, 2));
    else console.log(formatTaskTrackerPrimeReminder(summary) || [
      "SUPERVIBE_TASK_TRACKER_PRIME",
      "STATUS: no active work graph",
      "NEXT_ACTION: atomize a reviewed plan or continue native loop setup",
      "ATOMIZE_COMMAND: /supervibe-loop --atomize-plan <plan-path> --plan-review-passed",
      "RUNTIME_GATE: node scripts/supervibe-task-graph-maturity.mjs --require-active-graph",
      "UI_COMMAND: /supervibe-ui",
    ].join("\n"));
    return;
  }

  if (args["stop-watch"]) {
    const daemonPath = args.file || defaultWorkItemDaemonPath(rootDir);
    const state = await readWorkItemDaemonState(daemonPath);
    const stopped = stopWorkItemWatch(state, args["stop-watch"]);
    await writeWorkItemDaemonState(daemonPath, stopped);
    console.log(formatWorkItemWatchStatus(stopped));
    return;
  }

  if (args.inbox) {
    const inbox = await readDelegatedInbox(args.file || defaultDelegatedInboxPath(rootDir));
    console.log(formatDelegatedInbox(inbox));
    return;
  }

  if (args["import-tasks"]) {
    const result = await importWorkItemsFromFile(resolve(rootDir, args["import-tasks"]), { epicId: args.epic });
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else console.log(formatImportPreview(result));
    return;
  }

  if (args.priority) {
    const graphPath = args.file || args.priority;
    const graph = JSON.parse(await readFile(resolve(rootDir, graphPath), "utf8"));
    const index = createWorkItemIndex({ graph });
    const ready = index.filter((item) => item.type !== "epic" && item.effectiveStatus === "ready");
    const ordered = orderReadyWorkItems(ready, { graph });
    console.log("SUPERVIBE_WORK_ITEM_PRIORITY");
    for (const item of ordered) console.log(formatPriorityExplanation(item));
    return;
  }

  if (args["pre-loop-summary"]) {
    const graphPath = args.file
      ? resolve(rootDir, args.file)
      : await resolveActiveWorkItemGraphPath({ rootDir });
    if (!graphPath) throw new Error("pre-loop-summary requires --file <graph.json> or an active work graph");
    const graph = JSON.parse(await readFile(graphPath, "utf8"));
    const index = createWorkItemIndex({ graph, claims: graph.claims || [], gates: graph.gates || [], evidence: graph.evidence || [] });
    const summary = withTaskBudgetPolicySummary(createPreLoopSummaryModel({ graph, index }), graph);
    if (args.json) {
      console.log(JSON.stringify({ graphPath, ...summary }, null, 2));
    } else {
      console.log(formatPreLoopSummary(summary, graphPath));
    }
    return;
  }

  if (args["create-work-item"]) {
    const draft = args.input
      ? importGuidedWorkItemFromText(await readFile(resolve(rootDir, args.input), "utf8"))
      : createGuidedWorkItemDraft({
        formType: args.template || args.type || "task",
        title: args.title || args.request || "Draft work item",
        owner: args.owner,
        priority: args.priority,
        labels: args.labels,
        acceptanceCriteria: args.acceptance || args["acceptance-criteria"],
        verificationHints: args.verification || args["verification-hints"],
        dependencies: args.dependencies,
        dueAt: args.until || args.due,
        risk: args.risk,
      });
    if (args.file && (args.yes || args.preview || args["dry-run"])) {
      if (!draft.validation.valid && !args.force) {
        throw new Error(`create-work-item draft is invalid: ${draft.validation.issues.map((issue) => `${issue.field}:${issue.code}`).join(",")}`);
      }
      const graphPath = resolve(rootDir, args.file);
      const result = await mutateWorkItemGraphFile(graphPath, {
        type: "create",
        item: {
          ...draft.item,
          parentId: args.parent || args.parentId || draft.item.parentId,
          itemType: draft.item.type,
        },
        actor: args.actor || args.owner || "user",
        reason: args.reason || "created from /supervibe-loop --create-work-item",
        dryRun: Boolean(args.preview || args["dry-run"]),
        rootDir,
      });
      console.log("SUPERVIBE_WORK_ITEM_ACTION");
      console.log(`ACTION: ${result.action}`);
      console.log(`ITEM: ${result.itemId}`);
      console.log(`CHANGED: ${result.changed}`);
      console.log(`DRY_RUN: ${result.dryRun}`);
      if (result.createdItems?.length) console.log(`CREATED_ITEMS: ${result.createdItems.join(",")}`);
      console.log(`GRAPH: ${graphPath}`);
      if (result.backupPath) console.log(`BACKUP: ${result.backupPath}`);
      return;
    }
    if (args.out) await saveGuidedWorkItemDraft(resolve(rootDir, args.out), draft);
    if (args.json) console.log(JSON.stringify(draft, null, 2));
    else console.log(draft.preview);
    if (args.out) console.log(`DRAFT: ${resolve(rootDir, args.out)}`);
    return;
  }

  const workItemAction = resolveWorkItemAction(args);
  if (args["claim-ready"]) {
    const graphPath = args.file
      ? resolve(rootDir, args.file)
      : await resolveActiveWorkItemGraphPath({ rootDir });
    if (!graphPath) throw new Error("claim-ready requires --file <graph.json> or an active work graph");
    const graph = JSON.parse(await readFile(graphPath, "utf8"));
    const index = createWorkItemIndex({ graph });
    const ready = orderReadyWorkItems(index.filter((item) => item.type !== "epic" && item.effectiveStatus === "ready"), { graph });
    const selected = ready[0];
    if (!selected) throw new Error("claim-ready found no ready work items; inspect blockers or status");
    const dryRun = Boolean(args["dry-run"] || args.preview);
    const result = await mutateWorkItemGraphFile(graphPath, {
      type: "claim",
      itemId: selected.itemId || selected.id,
      actor: args.actor || args.owner || "user",
      reason: args.reason || "claimed next ready work item from /supervibe-loop --claim-ready",
      dryRun,
      force: Boolean(args.force),
      rootDir,
    });
    console.log("SUPERVIBE_WORK_ITEM_ACTION");
    console.log("ACTION: claim-ready");
    console.log(`ITEM: ${result.itemId}`);
    console.log(`CHANGED: ${result.changed}`);
    console.log(`DRY_RUN: ${result.dryRun}`);
    console.log(`GRAPH: ${graphPath}`);
    if (result.backupPath) console.log(`BACKUP: ${result.backupPath}`);
    return;
  }

  if (workItemAction) {
    const graphPath = args.file
      ? resolve(rootDir, args.file)
      : await findGraphContainingItem(rootDir, workItemAction.itemId || workItemAction.from || workItemAction.to);
    const dryRun = Boolean(args["dry-run"] || args.preview);
    if (workItemAction.type === "delete" && !dryRun && !args.yes && !args.force) {
      throw new Error("delete requires --preview, --dry-run, --yes, or --force");
    }
    if (workItemAction.type === "close" && !args.force) {
      const graph = JSON.parse(await readFile(graphPath, "utf8"));
      const target = (graph.items || []).find((item) => (item.itemId || item.id) === workItemAction.itemId);
      if (target?.type === "epic" || workItemAction.itemId === graph.epicId || workItemAction.itemId === graph.graph_id) {
        const report = validateEpicCompletion(graph, {
          production: !args["non-production"],
          requireEvidence: !args["no-evidence-required"],
          allowDryRunEvidence: Boolean(args["allow-dry-run-evidence"]),
          requireTrustedEvidence: Boolean(args["require-trusted-evidence"]),
          trustedReceiptIds: trustedReceiptIdsForValidation(rootDir, {
            explicitReceiptIds: splitCsv(args["trusted-receipts"]),
          }),
          trustedGraphReceiptIds: trustedGraphReceiptIdsForValidation(rootDir, graph, {
            explicitReceiptIds: splitCsv(args["trusted-receipts"]),
          }),
          disallowLegacyEvidence: Boolean(args["disallow-legacy-evidence"]),
          allowLegacyEvidence: Boolean(args["allow-legacy-evidence"]),
          requireEpicClosed: false,
        });
        if (!report.pass) {
          console.log(formatEpicCompletionReport(report));
          console.log(`GRAPH: ${graphPath}`);
          console.log("NEXT_ACTION: fix completion blockers or rerun with --force after explicit user override");
          process.exitCode = 1;
          return;
        }
        const finalReviewGate = evaluateFinalReviewerSweep(graph, {
          requireReceipt: !args["non-production"] || Boolean(args["require-trusted-evidence"]),
          trustedReceiptIds: trustedFinalReviewerReceiptIdsForValidation(rootDir, graph, {
            explicitReceiptIds: splitCsv(args["trusted-receipts"]),
          }),
        });
        if (!args["non-production"] && !finalReviewGate.pass) {
          console.log(formatFinalReviewerSweepReport(finalReviewGate.sweep));
          console.log(`GRAPH: ${graphPath}`);
          console.log("NEXT_ACTION: run final reviewer sweep after all graph tasks are complete, then close/archive the epic");
          process.exitCode = 1;
          return;
        }
        const releaseFullCheckGate = createReleaseFullCheckGate(graph, workItemAction.verificationEvidence);
        if (!args["non-production"] && !args["allow-missing-release-full-check"] && !releaseFullCheckGate.pass) {
          console.log(formatReleaseFullCheckGate(releaseFullCheckGate));
          console.log(`GRAPH: ${graphPath}`);
          console.log("NEXT_ACTION: run npm run check at the final release gate, record verification evidence, then close/archive the epic");
          process.exitCode = 1;
          return;
        }
      }
    }
    const result = await mutateWorkItemGraphFile(graphPath, {
      ...workItemAction,
      actor: args.actor || args.owner || "user",
      reason: args.reason || null,
      dryRun,
      force: Boolean(args.force),
      rootDir,
    });
    if (args.preview) {
      console.log(createDryRunPreview({
        action: workItemAction.type,
        before: { itemId: workItemAction.itemId || workItemAction.from },
        after: {
          changed: result.changed,
          action: result.action,
          itemId: result.itemId,
          dependency: result.dependency || null,
          createdItems: result.createdItems || [],
        },
        risk: workItemAction.type === "delete" ? "high" : "medium",
        command: `/supervibe-loop --${workItemAction.type} ${workItemAction.itemId || workItemAction.from || ""} --file ${graphPath}`,
      }).output);
    }
    console.log("SUPERVIBE_WORK_ITEM_ACTION");
    console.log(`ACTION: ${result.action || workItemAction.type}`);
    console.log(`ITEM: ${result.itemId || workItemAction.itemId || workItemAction.from || "graph"}`);
    console.log(`CHANGED: ${result.changed}`);
    console.log(`DRY_RUN: ${result.dryRun}`);
    if (result.conflict) console.log(`CONFLICT: ${result.conflict.reason}`);
    if (result.createdItems?.length) console.log(`CREATED_ITEMS: ${result.createdItems.join(",")}`);
    if (result.dependency) console.log(`DEPENDENCY: ${result.dependency.from}->${result.dependency.to}:${result.dependency.type}`);
    console.log(`GRAPH: ${graphPath}`);
    if (result.backupPath) console.log(`BACKUP: ${result.backupPath}`);
    return;
  }

  if (args.defer) {
    if (!args.until && !args.reason && !args.indefinite) {
      throw new Error("defer requires --until or --reason for indefinite deferral");
    }
    const graphPath = args.file
      ? resolve(rootDir, args.file)
      : await findGraphContainingItem(rootDir, args.defer);
    const result = await deferWorkItemFile(graphPath, {
      itemId: args.defer,
      until: args.until,
      condition: args.condition || "timestamp",
      reason: args.reason || "deferred by /supervibe-loop",
      actor: args.actor || "user",
      dryRun: Boolean(args["dry-run"] || args.preview),
    });
    if (args.preview) {
      console.log(createDryRunPreview({
        action: "defer",
        before: { itemId: args.defer },
        after: result.deferred,
        risk: "low",
        command: `/supervibe-loop --defer ${args.defer} --until ${args.until} --file ${graphPath}`,
      }).output);
    }
    console.log("SUPERVIBE_WORK_ITEM_DEFER");
    console.log(`ITEM: ${result.itemId}`);
    console.log(`UNTIL: ${result.deferred.until || "manual"}`);
    console.log(`CONDITION: ${result.deferred.condition}`);
    console.log(`DRY_RUN: ${result.dryRun}`);
    console.log(`GRAPH: ${graphPath}`);
    if (result.backupPath) console.log(`BACKUP: ${result.backupPath}`);
    return;
  }

  if (args.watch) {
    const graph = args.file ? JSON.parse(await readFile(resolve(rootDir, args.file), "utf8")) : { items: [], tasks: [] };
    const index = createWorkItemIndex({ graph });
    const grouped = groupWorkItemsByStatus(index);
    const inbox = await readDelegatedInbox(defaultDelegatedInboxPath(rootDir));
    const record = createWorkItemWatchRecord({
      runId: args.loop || null,
      epicId: args.epic || graph.epicId || null,
      worktree: args.worktree || null,
      snapshot: {
        ready: grouped.ready.length,
        blocked: grouped.blocked.length,
        claimed: grouped.claimed.length,
        delegated: inbox.filter((message) => message.status === "open").length,
        review: grouped.review.length,
        done: grouped.done.length,
      },
    });
    const daemonPath = args.out || defaultWorkItemDaemonPath(rootDir);
    const state = await readWorkItemDaemonState(daemonPath);
    const next = upsertWorkItemWatch(state, record);
    await writeWorkItemDaemonState(daemonPath, next);
    console.log(formatWorkItemWatchStatus(next));
    return;
  }

  if (args["export-sync-bundle"]) {
    const runDir = resolve(rootDir, args["export-sync-bundle"]);
    const state = JSON.parse(await readFile(join(runDir, "state.json"), "utf8"));
    const packageJson = JSON.parse(await readFile(join(rootDir, "package.json"), "utf8"));
    let mapping = {};
    try {
      mapping = await readTrackerMapping(defaultTrackerMappingPath(rootDir));
    } catch {
      mapping = {};
    }
    const bundle = createFederatedSyncBundle({
      graph: state.task_graph || { tasks: state.tasks || [] },
      status: state,
      comments: [],
      evidence: state.evidence || [],
      mapping,
      packageVersion: packageJson.version,
      sourceRoot: rootDir,
    });
    const outDir = resolve(rootDir, args.out || join(runDir, "sync-bundle"));
    const result = await writeFederatedSyncBundle(bundle, outDir);
    console.log("SUPERVIBE_SYNC_BUNDLE_EXPORT");
    console.log(`DIR: ${result.outDir}`);
    console.log(`FILES: ${result.files.length}`);
    return;
  }

  if (args["import-sync-bundle"]) {
    const result = await importFederatedSyncBundle(resolve(rootDir, args["import-sync-bundle"]), {
      dryRun: Boolean(args["dry-run"]),
      expectedPackageVersion: JSON.parse(await readFile(join(rootDir, "package.json"), "utf8")).version,
    });
    console.log("SUPERVIBE_SYNC_BUNDLE_IMPORT");
    console.log(`OK: ${result.ok}`);
    console.log(`DRY_RUN: ${result.dryRun}`);
    console.log(`REMOTE_MUTATION: ${result.remoteMutation}`);
    console.log(`CONFLICTS: ${result.conflictReport.summary}`);
    if (result.validation.issues.length) console.log(`ISSUES: ${result.validation.issues.map((issue) => issue.code).join(",")}`);
    return;
  }

  if (args.status || args["epic-status"]) {
    if (args.file) {
      try {
        const graphPath = resolve(rootDir, args.file);
        const graph = JSON.parse(await readFile(graphPath, "utf8"));
        if (graph.kind === "supervibe-work-item-graph" || Array.isArray(graph.items)) {
          printEpicStatus({ graph, graphPath });
          printAutoUiStatus({ rootDir, args, graphPath });
          return;
        }
      } catch (error) {
        if (error.code !== "ENOENT" && error.name !== "SyntaxError") throw error;
      }
    }
    if (args.epic && !args.file) {
      const graphPath = join(rootDir, ".supervibe", "memory", "work-items", args.epic, "graph.json");
      try {
        const graph = JSON.parse(await readFile(graphPath, "utf8"));
        printEpicStatus({ graph, graphPath, epicId: args.epic });
        printAutoUiStatus({ rootDir, args, graphPath });
        return;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        console.log("SUPERVIBE_EPIC_STATUS");
        console.log(`EPIC: ${args.epic}`);
        console.log("STATUS: missing graph");
        console.log(`NEXT_ACTION: run /supervibe-loop --atomize-plan .supervibe/artifacts/plans/example.md --plan-review-passed`);
        return;
      }
    }
    if (!args.loop) {
      const activeGraph = await resolveActiveWorkItemGraph({ rootDir });
      if (activeGraph.status === "ambiguous") {
        console.log("SUPERVIBE_EPIC_STATUS");
        console.log("STATUS: ambiguous active work graph");
        console.log(`CANDIDATES: ${activeGraph.candidates.length}`);
        for (const candidate of activeGraph.candidates) console.log(`- ${candidate}`);
        console.log(`NEXT_ACTION: ${activeGraph.nextAction}`);
        process.exitCode = 2;
        return;
      }
      if (activeGraph.graphPath) {
        const activeGraphPath = activeGraph.graphPath;
        const graph = JSON.parse(await readFile(activeGraphPath, "utf8"));
        printEpicStatus({ graph, graphPath: activeGraphPath, source: "active-registry" });
        printAutoUiStatus({ rootDir, args, graphPath: activeGraphPath });
        return;
      }
    }
    const stateFile = args.file || join(rootDir, ".supervibe", "memory", "loops", args.loop || "", "state.json");
    try {
      const result = await runAutonomousLoop({ rootDir, statusFile: stateFile });
      console.log(result.statusText);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      console.log("SUPERVIBE_LOOP_STATUS");
      console.log("STATUS: no loop state found");
      console.log(`STATE: ${stateFile}`);
      console.log(`PROVIDER_CAPABILITIES: ${getLoopProviderCapabilityMatrix().map((entry) => `${entry.id}:${entry.nativeContinuation}`).join(",")}`);
      console.log("NEXT_ACTION: start a real loop with npm run supervibe:loop -- --request \"validate integrations\" or preview with --dry-run");
    }
    return;
  }

  if (args.graph || args._[0] === "graph") {
    const stateFile = args.file || join(rootDir, ".supervibe", "memory", "loops", args.loop || "", "state.json");
    const state = await loadStateForGraphExport(resolve(rootDir, stateFile));
    process.stdout.write(exportGraph(state, { format: args.format || "text" }));
    return;
  }

  if (args.doctor || args._[0] === "doctor") {
    const target = args.file || join(rootDir, ".supervibe", "memory", "loops", args.loop || "", "state.json");
    if (args.fix) {
      const result = await repairLoopRun(resolve(rootDir, target), { fix: true });
      console.log(`SUPERVIBE_LOOP_REPAIR\nCHANGED: ${result.changed}\nBACKUP: ${result.backupPath}`);
    } else {
      console.log(await formatDoctorReport(resolve(rootDir, target)));
    }
    return;
  }

  if (args.prime || args._[0] === "prime") {
    const target = args.file || join(rootDir, ".supervibe", "memory", "loops", args.loop || "", "state.json");
    console.log(await primeLoopRun(resolve(rootDir, target)));
    return;
  }

  if (args.archive || args._[0] === "archive") {
    const target = args.file || join(rootDir, ".supervibe", "memory", "loops", args.loop || "");
    const workItemArchive = await maybeArchiveWorkItemGraph({
      rootDir,
      target: resolve(rootDir, target),
      args,
    });
    if (workItemArchive) {
      console.log("SUPERVIBE_WORK_ITEM_ARCHIVE");
      console.log(`GRAPH_ID: ${workItemArchive.result.graphId}`);
      console.log(`STATUS: ${workItemArchive.result.status}`);
      console.log(`REASON: ${workItemArchive.result.reason}`);
      console.log(`ARCHIVE_DIR: ${workItemArchive.result.archiveDir}`);
      console.log(`REGISTRY_ACTIVE: ${workItemArchive.registry.after.activeEpicId || "none"}`);
      return;
    }
    const result = await archiveLoopRun(resolve(rootDir, target), { archiveRoot: args.out, label: args.label });
    console.log(`SUPERVIBE_LOOP_ARCHIVE\nBUNDLE: ${result.bundleDir}\nRUN_ID: ${result.runId}`);
    return;
  }

  if (args.export || args._[0] === "export") {
    const target = args.file || join(rootDir, ".supervibe", "memory", "loops", args.loop || "");
    const result = await exportLoopBundle(resolve(rootDir, target), { outDir: args.out });
    console.log(`SUPERVIBE_LOOP_EXPORT\nBUNDLE: ${result.bundleDir}\nRUN_ID: ${result.runId}`);
    return;
  }

  if (args.import || args._[0] === "import") {
    const target = args.file || args.bundle || args._[1];
    if (!target) throw new Error("import requires --file <bundle-dir>");
    const result = await importLoopBundle(resolve(rootDir, target), { targetRoot: args.out || rootDir });
    console.log(`SUPERVIBE_LOOP_IMPORT\nTARGET: ${result.targetDir}\nRUN_ID: ${result.runId}`);
    return;
  }

  if (args["worktree-status"]) {
    const registry = await readWorktreeSessionRegistry(args.file || defaultWorktreeRegistryPath(rootDir));
    console.log(formatWorktreeSessionStatus(registry));
    return;
  }

  if (args["tracker-sync-push"] || args["tracker-sync-pull"] || args["tracker-doctor"]) {
    const graphPath = args.file || args["work-item-graph"] || args._[0];
    if (!graphPath) throw new Error("tracker command requires --file <work-item-graph.json>");
    const graph = JSON.parse(await readFile(resolve(rootDir, graphPath), "utf8"));
    const mappingPath = args["mapping-file"] ? resolve(rootDir, args["mapping-file"]) : defaultTrackerMappingPath(rootDir);
    const adapter = createTaskTrackerAdapterFromArgs(args, {
      fallbackReason: "no external tracker selected; use --tracker memory for local smoke tests or --tracker cli --tracker-command <command>",
    });

    if (args["tracker-sync-push"]) {
      const result = await materializeEpicAndTasks(graph, adapter, { rootDir, mappingPath, dryRun: Boolean(args["dry-run"]) });
      console.log("SUPERVIBE_TRACKER_SYNC_PUSH");
      console.log(`STATUS: ${result.status}`);
      console.log(`MAPPING: ${mappingPath}`);
      console.log(`NATIVE_GRAPH_PRESERVED: ${result.nativeGraphPreserved}`);
      if (result.recovery?.nextAction) console.log(`RECOVERY: ${result.recovery.nextAction}`);
      if (result.issues?.length) console.log(`ISSUES: ${result.issues.length}`);
      if (result.ok === false) process.exitCode = 1;
      return;
    }

    if (args["tracker-sync-pull"]) {
      const mapping = await readTrackerMapping(mappingPath);
      const result = await syncPull(adapter, mapping);
      console.log("SUPERVIBE_TRACKER_SYNC_PULL");
      console.log(`STATUS: ${result.status}`);
      console.log(`MAPPING: ${mappingPath}`);
      return;
    }

    const result = await repairTaskTracker({ graph, mappingPath, fix: Boolean(args.fix) });
    console.log(formatTaskTrackerDoctorReport(result.diagnosis));
    if (result.changed) console.log(`BACKUP: ${result.backupPath}`);
    return;
  }

  if (args["final-review-sweep"] || args["final-review-status"] || args["record-final-review"]) {
    const graphPath = await resolveCompletionGraphPath({ rootDir, args });
    const graph = JSON.parse(await readFile(graphPath, "utf8"));
    const reviewEntry = args["record-final-review"] ? finalReviewEntryFromArgs(args) : null;
    const requireTrustedFinalReview = !args["non-production"] && !args["allow-untrusted-final-review"];
    const trustedFinalReviewReceiptIds = trustedFinalReviewerReceiptIdsForValidation(rootDir, graph, {
      explicitReceiptIds: splitCsv(args["trusted-receipts"]),
    });
    const nextGraph = reviewEntry
      ? upsertFinalReviewerSweep(graph, {
        entries: [reviewEntry],
        reviewerAgentId: args.reviewer || args["reviewer-agent"] || args.agent,
        receiptIds: splitCsv(args.receipts || args["receipt-ids"]),
      })
      : {
        ...graph,
        finalReviewerSweep: createFinalReviewerSweep(graph, {
          reviewerAgentId: args.reviewer || args["reviewer-agent"] || args.agent,
        }),
      };
    const sweep = nextGraph.finalReviewerSweep || createFinalReviewerSweep(nextGraph);
    const evaluation = evaluateFinalReviewerSweep(nextGraph, {
      sweep,
      requireReceipt: requireTrustedFinalReview || Boolean(args["require-trusted-evidence"]),
      trustedReceiptIds: trustedFinalReviewReceiptIds,
    });
    const entryReceiptTrusted = !reviewEntry
      || !requireTrustedFinalReview
      || finalReviewEntryHasTrustedReceipt(reviewEntry, trustedFinalReviewReceiptIds);
    const shouldWriteSweep = Boolean((reviewEntry || args["write-final-review-sweep"]) && !args["dry-run"] && !args.preview && entryReceiptTrusted);
    if (shouldWriteSweep) {
      await writeFile(graphPath, `${JSON.stringify(nextGraph, null, 2)}\n`, "utf8");
    }
    console.log(formatFinalReviewerSweepReport(sweep));
    console.log(`CHANGED: ${shouldWriteSweep}`);
    console.log(`DRY_RUN: ${Boolean(args["dry-run"] || args.preview)}`);
    console.log(`GRAPH: ${graphPath}`);
    if (!entryReceiptTrusted) {
      console.log("FINAL_REVIEW_WRITE_BLOCKED: untrusted-review-receipt");
    }
    if (!evaluation.pass || !entryReceiptTrusted) process.exitCode = 1;
    if (args["validate-completion"] || args["completion-status"] || args["close-eligible"]) {
      precomputedCompletionGraph = nextGraph;
      precomputedCompletionGraphPath = graphPath;
    } else {
      return;
    }
  }

  if (args["validate-completion"] || args["completion-status"] || args["close-eligible"]) {
    const graphPath = precomputedCompletionGraphPath || await resolveCompletionGraphPath({ rootDir, args });
    const graph = precomputedCompletionGraph || JSON.parse(await readFile(graphPath, "utf8"));
    const trustedFinalReviewReceiptIds = trustedFinalReviewerReceiptIdsForValidation(rootDir, graph, {
      explicitReceiptIds: splitCsv(args["trusted-receipts"]),
    });
    const report = validateEpicCompletion(graph, {
      production: !args["non-production"],
      requireEvidence: !args["no-evidence-required"],
      allowDryRunEvidence: Boolean(args["allow-dry-run-evidence"]),
      requireTrustedEvidence: Boolean(args["require-trusted-evidence"]),
      trustedReceiptIds: trustedReceiptIdsForValidation(rootDir, {
        explicitReceiptIds: splitCsv(args["trusted-receipts"]),
      }),
      trustedGraphReceiptIds: trustedGraphReceiptIdsForValidation(rootDir, graph, {
        explicitReceiptIds: splitCsv(args["trusted-receipts"]),
      }),
      disallowLegacyEvidence: Boolean(args["disallow-legacy-evidence"]),
      allowLegacyEvidence: Boolean(args["allow-legacy-evidence"]),
      requireEpicClosed: args["close-eligible"] ? false : !args["allow-open-epic"],
    });
    console.log(formatEpicCompletionReport(report));
    const finalReviewGate = evaluateFinalReviewerSweep(graph, {
      requireReceipt: !args["non-production"] || Boolean(args["require-trusted-evidence"]),
      trustedReceiptIds: trustedFinalReviewReceiptIds,
    });
    console.log(formatFinalReviewerSweepReport(finalReviewGate.sweep));
    const releaseFullCheckGate = createReleaseFullCheckGate(graph);
    console.log(formatReleaseFullCheckGate(releaseFullCheckGate));
    console.log(`GRAPH: ${graphPath}`);
    console.log(formatLoopCompletionDecisionCard({ graphPath, report, finalReviewGate, releaseFullCheckGate }));
    if (args["require-release-full-check"] && !releaseFullCheckGate.pass) {
      process.exitCode = 1;
      return;
    }
    if (!report.pass || (!args["non-production"] && !finalReviewGate.pass)) process.exitCode = 1;
    return;
  }

  if (args["atomize-plan"] || args.atomize || args["create-epic"]) {
    const planPath = args["atomize-plan"]
      || (typeof args["from-plan"] === "string" ? args["from-plan"] : null)
      || args.plan
      || args._[0];
    if (!planPath) throw new Error("atomize requires --atomize-plan <plan-path> or --from-plan <plan-path>");
    const dryRunAtomization = Boolean(args["dry-run"] || args.preview);
    const reviewed = Boolean(args["plan-review-passed"] || dryRunAtomization);
    if (!reviewed) {
      throw new Error("Atomization writes require --plan-review-passed. Use --dry-run for a preview before the review gate passes.");
    }
    if (!dryRunAtomization && !allowUnverifiedPlanReview(args)) {
      const reviewGate = await validatePlanReviewGateForPlan({
        rootDir,
        planPath: planReviewLookupPath(rootDir, planPath),
        requireActiveReview: true,
      });
      if (!reviewGate.pass) {
        const detail = reviewGate.issues?.length ? ` ${reviewGate.issues.join("; ")}` : "";
        throw new Error(`Atomization writes require a validated plan review artifact with trusted reviewer receipts, not only --plan-review-passed.${detail}`);
      }
    }
    const graph = await atomizePlanFile(resolve(rootDir, planPath), {
      planPath,
      epicId: args.epic,
      dryRun: dryRunAtomization,
      planReviewPassed: Boolean(args["plan-review-passed"]),
    });
    applySemanticEpicGroupingToGraph(graph, {
      maxTasksPerEpic: args["semantic-epic-max-tasks"] || DEFAULT_SEMANTIC_EPIC_MAX_TASKS,
    });
    if (args.json) {
      console.log(JSON.stringify(graph, null, 2));
      return;
    }
    if (args["dry-run"] || args.preview) {
      console.log(createWorkItemPreview(graph, graph.validation));
      if (args.preview) console.log("PREVIEW: true");
      console.log("DRY_RUN: true");
      return;
    }
    const writeResult = await writeWorkItemGraph(graph, { rootDir, outDir: args.out });
    const mappingPath = args["mapping-file"] ? resolve(rootDir, args["mapping-file"]) : defaultTrackerMappingPath(rootDir);
    const trackerAdapter = args["no-tracker-sync"]
      ? null
      : args.tracker
        ? createTaskTrackerAdapterFromArgs(args, {
          fallbackReason: "no external tracker selected; using native graph only",
        })
        : createMemoryTaskTrackerAdapter();
    const trackerResult = trackerAdapter
      ? await materializeEpicAndTasks(graph, trackerAdapter, { rootDir, mappingPath })
      : null;
    console.log("SUPERVIBE_WORK_ITEMS");
    console.log(`EPIC: ${graph.epicId}`);
    console.log(`GRAPH: ${writeResult.graphPath}`);
    console.log(`PREVIEW: ${writeResult.previewPath}`);
    console.log(`VALID: ${graph.validation.valid}`);
    if (trackerResult) {
      console.log(`TRACKER_MAPPING: ${mappingPath}`);
      console.log(`TRACKER_STATUS: ${trackerResult.status}`);
      const mapped = Object.keys(trackerResult.mapping?.items || {}).length;
      console.log(`TRACKER_MAPPED_ITEMS: ${mapped}`);
    }
    printAtomizationAutoUiHandoff({ rootDir, args, graphPath: writeResult.graphPath });
    return;
  }

  if (args.readiness) {
    const positionalRequest = args.request || args._.join(" ");
    const sourcePlan = args.plan || args["from-prd"];
    const tasks = sourcePlan
      ? await loadPlanTasks(resolve(rootDir, sourcePlan))
      : createTasksFromRequest(positionalRequest || "validate integrations");
    const runtimeDefaults = resolveLoopRuntimeDefaults({ rootDir, args });
    const preflight = buildPreflight({
      request: positionalRequest || sourcePlan || "",
      tasks,
      options: {
        ...args,
        tool: runtimeDefaults.tool,
        adapterId: runtimeDefaults.tool,
        executionMode: runtimeDefaults.executionMode,
        allowSpawn: runtimeDefaults.allowSpawn,
        permissionPromptBridge: runtimeDefaults.permissionPromptBridge,
        commitPerTask: Boolean(args["commit-per-task"]),
        policyProfile: await maybeLoadPolicyProfile(rootDir, args),
      },
    });
    const contracts = generateContracts(tasks);
    const readiness = scoreAutonomyReadiness({ tasks, contracts, preflight });
    const nextReadinessAction = preflight.blocked_actions.includes("fresh-context execution")
      ? `use --${preflight.provider_capabilities.recommendedMode} or --${preflight.provider_capabilities.fallbackMode} for ${args.tool || preflight.execution_policy.provider.selected_tool}`
      : readiness.pass ? "ready_for_safe_execution" : readiness.remediation[0];
    if (args.json) {
      console.log(JSON.stringify({
        readiness,
        contracts,
        toolAdapters: preflight.tool_adapters,
        providerCapabilities: preflight.provider_capabilities,
        providerCapabilitySummary: preflight.provider_capability_summary,
        providerLimitPolicy: preflight.provider_limit_policy,
        nextAction: nextReadinessAction,
      }, null, 2));
    } else {
      console.log("SUPERVIBE_LOOP_READINESS");
      console.log(`SCORE: ${readiness.score}/10`);
      console.log(`PASS: ${readiness.pass}`);
      console.log(`MISSING: ${readiness.missing.join(", ") || "none"}`);
      console.log(`EXECUTION_MODE: ${preflight.execution_policy.mode}`);
      console.log(`SELECTED_TOOL: ${preflight.execution_policy.provider.selected_tool}`);
      console.log(`MAX_CONCURRENT_AGENTS: ${preflight.max_concurrent_agents}`);
      console.log(`PROVIDER_MAX_THREADS: ${preflight.provider_limit_policy?.providerMaxThreads ?? "unknown"}`);
      console.log(`PROVIDER_CONCURRENCY_SOURCE: ${preflight.provider_limit_policy?.source || "unknown"}`);
      console.log(`ADAPTERS: ${preflight.tool_adapter_summary.available.join(",") || "none"}`);
      console.log(`CONTINUATION_MODE: ${preflight.provider_capabilities.nativeContinuation}`);
      console.log(`PROVIDER_RECOMMENDED_MODE: ${preflight.provider_capabilities.recommendedMode}`);
      console.log(`PROVIDER_FALLBACK_MODE: ${preflight.provider_capabilities.fallbackMode}`);
      console.log(`NEXT_ACTION: ${nextReadinessAction}`);
    }
    return;
  }

  if (args.resume) {
    const result = await resumeAutonomousLoop(resolve(rootDir, args.resume));
    console.log(`Resume status: ${result.status}`);
    if (result.state?.resume_work_graph) {
      const resumeGraph = result.state.resume_work_graph;
      console.log("SUPERVIBE_RESUME_WORK_GRAPH");
      console.log(`STATUS: ${resumeGraph.status}`);
      if (resumeGraph.epicId) console.log(`EPIC: ${resumeGraph.epicId}`);
      console.log(`READY: ${resumeGraph.ready ?? 0}`);
      console.log(`BLOCKED: ${resumeGraph.blocked ?? 0}`);
      console.log(`CLAIMED: ${resumeGraph.claimed ?? 0}`);
      console.log(`STALE: ${resumeGraph.stale ?? 0}`);
      console.log(`NEXT_READY: ${resumeGraph.nextReady || "none"}`);
      console.log(`NEXT_ACTION: ${resumeGraph.nextAction || "inspect resume state"}`);
      console.log(`GRAPH: ${resumeGraph.graphPath}`);
    }
    return;
  }

  if (args.stop) {
    const stateFile = args.file || join(rootDir, ".supervibe", "memory", "loops", args.stop, "state.json");
    const state = await stopAutonomousLoop(stateFile);
    console.log(`Stopped ${state.run_id}: ${state.stop_reason}`);
    return;
  }

  if (args["accept-goals"] || args["reject-goals"]) {
    if (!args.file) throw new Error("--accept-goals/--reject-goals requires --file <state.json>");
    const accepted = Boolean(args["accept-goals"]);
    const state = await recordUserGoalAcceptance(resolve(rootDir, args.file), {
      accepted,
      acceptedBy: args["accepted-by"] || args.actor || "user",
      feedback: args.feedback || args.reason || null,
    });
    console.log("SUPERVIBE_LOOP_USER_GOAL_ACCEPTANCE");
    console.log(`RUN_ID: ${state.run_id}`);
    console.log(`STATUS: ${state.status}`);
    console.log(`USER_GOAL_ACCEPTANCE: ${state.user_goal_acceptance?.status || "unknown"}`);
    console.log(`NEXT_ACTION: ${state.next_action || "none"}`);
    return;
  }

  if (args["fork-checkpoint"]) {
    if (!args.file) throw new Error("--fork-checkpoint requires --file <state.json>");
    const result = await forkAutonomousLoopCheckpoint(resolve(rootDir, args.file), {
      outPath: args.out ? resolve(rootDir, args.out) : null,
      reason: args.reason || args.feedback || "user_goal_replan",
    });
    console.log("SUPERVIBE_LOOP_CHECKPOINT_FORK");
    console.log(`RUN_ID: ${result.state.run_id}`);
    console.log(`STATUS: ${result.state.status}`);
    console.log(`STATE: ${result.path}`);
    console.log(`NEXT_ACTION: ${result.state.next_action}`);
    return;
  }

  const positionalRequest = args.request || args._.join(" ");
  const sourcePlan = args.plan || args["from-prd"];
  const executionSource = await resolveLoopExecutionSource({
    rootDir,
    args,
    sourcePlan,
    positionalRequest,
  });
  const worktreeSession = await maybePrepareWorktreeSession(args, rootDir);
  const policyProfile = await maybeLoadPolicyProfile(rootDir, args);
  const runtimeDefaults = resolveLoopRuntimeDefaults({ rootDir, args });
  const taskTrackerAdapter = shouldUseTaskTrackerAdapter(args)
    ? createTaskTrackerAdapterFromArgs(args)
    : null;
  const result = await runAutonomousLoop({
    rootDir,
    runId: args["run-id"],
    plan: executionSource.plan,
    request: executionSource.request,
    dryRun: Boolean(args["dry-run"]),
    fixture: args.fixture,
    maxLoops: args["max-loops"],
    maxRuntimeMinutes: args["max-runtime-minutes"] || parseDurationToMinutes(args["max-duration"]),
    maxConcurrentAgents: args["max-concurrency"] || args.maxConcurrentAgents,
    environmentTarget: args.environment,
    executionMode: runtimeDefaults.executionMode,
    commitPerTask: Boolean(args["commit-per-task"]),
    adapterId: runtimeDefaults.tool,
    adapterCommand: args["adapter-command"],
    adapterArgs: parseCsvArg(args["adapter-args"] || args["provider-args"]),
    adapterConfig: buildAdapterConfig(args),
    allowSpawn: runtimeDefaults.allowSpawn,
    permissionPromptBridge: runtimeDefaults.permissionPromptBridge,
    networkApproved: Boolean(args["network-approved"]),
    networkTargets: parseCsvArg(args["network-targets"] || args["network-allowlist"]),
    mcpApproved: Boolean(args["mcp-approved"]),
    mcpServers: parseCsvArg(args["mcp-servers"]),
    mcpToolsAllowed: parseCsvArg(args["mcp-tools"]),
    worktreeSession,
    policyProfile,
    requireUserAcceptance: Boolean(args["require-user-acceptance"]),
    taskTrackerAdapter,
    taskTrackerMappingPath: args["mapping-file"],
  });

  console.log("SUPERVIBE_LOOP_STATUS");
  console.log(`STATUS: ${result.status}`);
  console.log(`RUN_ID: ${result.runId}`);
  console.log(`CONFIDENCE: ${result.finalScore}`);
  console.log(`STOP_REASON: ${result.stopReason || "none"}`);
  console.log(`REPORT: ${result.reportPath}`);
  console.log(`TASK_SOURCE: ${executionSource.source}`);
  if (result.state?.provider_limit_policy) {
    console.log(`MAX_CONCURRENT_AGENTS: ${result.state.max_concurrent_agents ?? result.state.preflight?.max_concurrent_agents ?? "unknown"}`);
    console.log(`PROVIDER_MAX_THREADS: ${result.state.provider_limit_policy.providerMaxThreads ?? "unknown"}`);
    console.log(`PROVIDER_CONCURRENCY_SOURCE: ${result.state.provider_limit_policy.source || "unknown"}`);
  }
  if (result.state?.completion_semantics) {
    console.log(`COMPLETION_SEMANTICS: ${result.state.completion_semantics.status}`);
    console.log(`PRODUCTION_READY: ${result.state.completion_semantics.productionReady === true}`);
    console.log(`NEXT_COMPLETION_ACTION: ${result.state.completion_semantics.nextAction}`);
    if (result.status === "COMPLETE") {
      console.log(formatLoopCompletionDecisionCard({
        graphPath: result.reportPath,
        completionSemantics: result.state.completion_semantics,
      }));
    }
  }
  if (result.state?.native_work_graph_sync) {
    console.log(`NATIVE_WORK_GRAPH_SYNC: ${result.state.native_work_graph_sync.status}`);
  }
  if (policyProfile) console.log(`POLICY_PROFILE: ${policyProfile.name}`);
  if (args.notify) {
    const notification = routeNotificationEvent({
      class: result.status === "COMPLETE" ? "run-completed" : "run-failed",
      runId: result.runId,
      message: `Autonomous loop ${result.status}`,
      nextSafeAction: result.status === "COMPLETE" ? "review final report" : "inspect blockers",
    }, {
      routes: args.notify,
      webhookUrl: args.webhook,
      webhookAllowlist: args["webhook-allowlist"] ? String(args["webhook-allowlist"]).split(",") : [],
    });
    console.log(formatNotificationRouteResult(notification));
  }
}

async function maybeLoadPolicyProfile(rootDir, args) {
  if (!args["policy-profile"]) return null;
  return loadPolicyProfile({
    rootDir,
    profileName: args["policy-profile"],
    filePath: args["policy-file"] || null,
  });
}

async function resolveLoopExecutionSource({ rootDir, args, sourcePlan = null, positionalRequest = "" } = {}) {
  const explicitGraphPath = args.file || args["work-item-graph"] || null;
  if (explicitGraphPath) {
    return {
      plan: resolve(rootDir, explicitGraphPath),
      request: sourcePlan ? positionalRequest || `execute work graph for ${sourcePlan}` : positionalRequest || undefined,
      source: "explicit-work-graph",
    };
  }

  if (args.epic) {
    const graphPath = join(rootDir, ".supervibe", "memory", "work-items", args.epic, "graph.json");
    if (!await pathExists(graphPath)) {
      if (sourcePlan && !args["allow-flat-plan"]) {
        throw new Error([
          "PLAN_EXECUTION_REQUIRES_WORK_GRAPH",
          `EPIC: ${args.epic}`,
          `PLAN: ${sourcePlan}`,
          `NEXT_ACTION: run /supervibe-loop --atomize-plan ${sourcePlan} --plan-review-passed`,
        ].join("\n"));
      }
      return {
        plan: sourcePlan ? resolve(rootDir, sourcePlan) : null,
        request: sourcePlan ? positionalRequest || undefined : positionalRequest || `validate epic ${args.epic}`,
        source: sourcePlan ? "legacy-flat-plan" : "epic-without-graph-request",
      };
    }
    return {
      plan: graphPath,
      request: sourcePlan ? positionalRequest || `execute epic ${args.epic} for ${sourcePlan}` : positionalRequest || undefined,
      source: "epic-work-graph",
    };
  }

  if (sourcePlan && !args["allow-flat-plan"]) {
    const atomizeCommand = `/supervibe-loop --atomize-plan ${sourcePlan} --plan-review-passed`;
    throw new Error([
      "PLAN_EXECUTION_REQUIRES_WORK_GRAPH",
      `PLAN: ${sourcePlan}`,
      `NEXT_ACTION: run ${atomizeCommand}`,
      "THEN: run /supervibe-loop --file .supervibe/memory/work-items/<epic-id>/graph.json --guided",
      "DETAIL: direct flat-plan execution is legacy-only; use --allow-flat-plan only for diagnostic previews.",
    ].join("\n"));
  }

  if (!sourcePlan && !positionalRequest) {
    const activeGraphPath = await resolveActiveWorkItemGraphPath({ rootDir });
    if (activeGraphPath) {
      return {
        plan: activeGraphPath,
        request: undefined,
        source: "active-work-graph",
      };
    }
  }

  return {
    plan: sourcePlan ? resolve(rootDir, sourcePlan) : null,
    request: sourcePlan ? positionalRequest || undefined : positionalRequest || "validate integrations",
    source: sourcePlan ? "legacy-flat-plan" : "request",
  };
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function maybeArchiveWorkItemGraph({ rootDir, target, args = {} } = {}) {
  if (!target || !await pathExists(target)) return null;
  let graph = null;
  try {
    graph = JSON.parse(String(await readFile(target, "utf8")).replace(/^\uFEFF/, ""));
  } catch (error) {
    if (error.name === "SyntaxError" || error.code === "EISDIR") return null;
    throw error;
  }
  if (graph.kind !== "supervibe-work-item-graph" && !Array.isArray(graph.items)) return null;

  const now = args.now || new Date().toISOString();
  const classification = classifyWorkItemGraphForGc(graph, {
    graphPath: target,
    retentionDays: 0,
    now,
  });
  if (!classification.archiveCandidate) {
    throw new Error(`work-item graph is not archive-ready: ${classification.reason}`);
  }

  const result = await archiveWorkItemGraph(classification, {
    archiveRoot: args.out ? resolve(rootDir, args.out) : join(rootDir, ".supervibe", "memory", "work-items", ".archive"),
    dryRun: Boolean(args["dry-run"] || args.preview),
    now,
  });
  const registry = result.dryRun
    ? { after: { activeEpicId: "dry-run" } }
    : await repairWorkItemRegistryIntegrity({ rootDir, now });
  return { result, registry };
}

function formatLoopCompletionDecisionCard({ graphPath = "completed-loop", report = null, finalReviewGate = null, releaseFullCheckGate = null, completionSemantics = null } = {}) {
  const verified = Boolean(completionSemantics?.verified || completionSemantics?.verifyComplete);
  const reviewed = Boolean(finalReviewGate?.pass || completionSemantics?.reviewed || completionSemantics?.reviewComplete);
  const shipped = Boolean(completionSemantics?.shipped || completionSemantics?.shipComplete);
  const blocked = report && report.pass === false;
  const decision = buildLoopCompletionDecision({
    artifact: graphPath,
    verified,
    reviewed,
    shipped,
    nextCommand: blocked ? "/supervibe-loop --revise-goals" : "",
    recommendation: blocked
      ? "Resolve completion blockers or revise scope before production gates."
      : "Choose the next production-readiness gate for the completed loop.",
  });
  return formatStageDecisionCard(decision);
}

function runtimeInvocationIdFromArgs(args = {}) {
  return String(args["host-invocation-id"] || args["invocation-id"] || args["runtime-id"] || args["codex-spawn-id"] || args["spawn-id"] || "").trim();
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseIsoTime(value, label) {
  const text = String(value || "").trim();
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) throw new Error(`${label} must be an ISO timestamp`);
  return { text: new Date(ms).toISOString(), ms };
}

function graphEntryId(entry = {}) {
  return entry.itemId || entry.id || entry.taskId || null;
}

function isAgentActiveStatus(status) {
  return ["claimed", "in_progress", "running"].includes(String(status || "").trim().toLowerCase());
}

function entryHeartbeatAt(entry = {}) {
  return entry.heartbeatAt || entry.agentHeartbeat?.heartbeatAt || entry.stall?.heartbeatAt || entry.claimedAt || null;
}

function entryStallState(entry = {}) {
  return entry.stall || entry.agentStall || null;
}

function isStalledEntry(entry = {}) {
  return String(entryStallState(entry)?.status || "").toLowerCase() === "stalled";
}

function stallRecoveryAction(itemId, graphPath) {
  return `/supervibe-loop --recover-stalled ${itemId} --file ${graphPath}`;
}

function collectStalledItemsFromGraph(graph = {}) {
  const seen = new Set();
  const stalled = [];
  for (const entry of [...(graph.items || []), ...(graph.tasks || [])]) {
    const itemId = graphEntryId(entry);
    if (!itemId || seen.has(itemId) || !isStalledEntry(entry)) continue;
    seen.add(itemId);
    const stall = entryStallState(entry) || {};
    stalled.push({
      itemId,
      title: entry.title || "",
      owner: entry.heartbeatOwner || entry.owner || entry.claimOwner || stall.owner || null,
      retryable: stall.retryable !== false,
      manualIntervention: stall.manualIntervention === true,
      recoveryAction: stall.recoveryAction || null,
      stalledAt: stall.stalledAt || null,
      heartbeatAt: stall.heartbeatAt || entryHeartbeatAt(entry) || null,
      heartbeatAgeMinutes: stall.heartbeatAgeMinutes ?? null,
      reason: stall.reason || entry.blockerReason || "no-progress-timeout",
    });
  }
  return stalled;
}

function summarizeStalledItems(stalled = []) {
  return {
    retryable: stalled.filter((item) => item.retryable && !item.manualIntervention).length,
    manualIntervention: stalled.filter((item) => item.manualIntervention || !item.retryable).length,
  };
}

async function writeGraphFileWithBackup(graphPath, graph) {
  const backupPath = `${graphPath}.bak`;
  try {
    await copyFile(graphPath, backupPath);
  } catch {
    // Missing backup source is surfaced by the write below if the path is invalid.
  }
  await writeFile(graphPath, `${JSON.stringify(graph, null, 2)}\n`, "utf8");
  return backupPath;
}

async function updateAgentHeartbeatFile(graphPath, {
  itemId,
  owner,
  hostInvocationId,
  now,
  progressSignature = null,
  status = null,
} = {}) {
  const normalizedItemId = String(itemId || "").trim();
  if (!normalizedItemId) throw new Error("--heartbeat requires an item id");
  if (!hostInvocationId) {
    throw new Error("--heartbeat requires --host-invocation-id, --invocation-id, or --runtime-id; do not write heartbeat state without runtime invocation proof");
  }
  const heartbeatAt = parseIsoTime(now, "--now").text;
  const graph = JSON.parse(String(await readFile(graphPath, "utf8")).replace(/^\uFEFF/, ""));
  let changed = false;
  const update = (entry) => {
    if (graphEntryId(entry) !== normalizedItemId) return entry;
    changed = true;
    const nextStatus = status || (["open", "ready", "pending"].includes(String(entry.status || "").toLowerCase()) ? "claimed" : entry.status);
    const next = {
      ...entry,
      status: nextStatus || "claimed",
      heartbeatAt,
      heartbeatOwner: owner,
      hostInvocationId,
      progressSignature,
      updatedAt: heartbeatAt,
      updatedBy: owner,
    };
    delete next.stall;
    delete next.agentStall;
    delete next.blockerReason;
    delete next.blockerNextAction;
    return next;
  };
  const heartbeats = Array.isArray(graph.agentHeartbeats) ? graph.agentHeartbeats : [];
  const heartbeatRecord = {
    itemId: normalizedItemId,
    owner,
    hostInvocationId,
    heartbeatAt,
    progressSignature,
  };
  let heartbeatUpdated = false;
  const nextHeartbeats = heartbeats.map((record) => {
    if (record.itemId === normalizedItemId && record.hostInvocationId === hostInvocationId) {
      heartbeatUpdated = true;
      return { ...record, ...heartbeatRecord };
    }
    return record;
  });
  if (!heartbeatUpdated) nextHeartbeats.push(heartbeatRecord);
  const nextGraph = {
    ...graph,
    updatedAt: heartbeatAt,
    agentHeartbeats: nextHeartbeats,
    items: (graph.items || []).map(update),
    tasks: (graph.tasks || []).map(update),
  };
  if (!changed) throw new Error(`work item not found: ${normalizedItemId}`);
  const backupPath = await writeGraphFileWithBackup(graphPath, nextGraph);
  return {
    itemId: normalizedItemId,
    owner,
    hostInvocationId,
    heartbeatAt,
    progressSignature,
    backupPath,
  };
}

async function markStalledAgentsFile(graphPath, {
  now,
  staleAfterMinutes,
  maxRetries,
  owner,
} = {}) {
  const nowTime = parseIsoTime(now, "--now");
  const timeoutMinutes = parsePositiveInteger(staleAfterMinutes, DEFAULT_AGENT_STALL_TIMEOUT_MINUTES);
  const retryLimit = parsePositiveInteger(maxRetries, DEFAULT_AGENT_STALL_MAX_RETRIES);
  const graph = JSON.parse(String(await readFile(graphPath, "utf8")).replace(/^\uFEFF/, ""));
  const stalledById = new Map();
  const mark = (entry) => {
    const itemId = graphEntryId(entry);
    if (!itemId || !isAgentActiveStatus(entry.status)) return entry;
    const heartbeatAt = entryHeartbeatAt(entry);
    if (!heartbeatAt) return entry;
    const heartbeatTime = parseIsoTime(heartbeatAt, `${itemId} heartbeatAt`);
    const heartbeatAgeMinutes = Math.floor((nowTime.ms - heartbeatTime.ms) / 60_000);
    if (heartbeatAgeMinutes < timeoutMinutes) return entry;
    const previousStall = entryStallState(entry) || {};
    const retryCount = Number.parseInt(String(previousStall.retryCount || 0), 10) || 0;
    const retryable = retryCount < retryLimit;
    const recoveryAction = retryable
      ? stallRecoveryAction(itemId, graphPath)
      : "manual intervention required before retry";
    const stall = {
      status: "stalled",
      reason: "no-progress-timeout",
      stalledAt: nowTime.text,
      heartbeatAt: heartbeatTime.text,
      heartbeatAgeMinutes,
      timeoutMinutes,
      retryCount,
      maxRetries: retryLimit,
      retryable,
      manualIntervention: !retryable,
      recoveryAction,
      owner: entry.heartbeatOwner || entry.owner || entry.claimOwner || owner || null,
      hostInvocationId: entry.hostInvocationId || null,
    };
    stalledById.set(itemId, {
      itemId,
      owner: stall.owner,
      heartbeatAgeMinutes,
      retryable,
      manualIntervention: !retryable,
      recoveryAction,
    });
    return {
      ...entry,
      status: "blocked",
      stall,
      blockerReason: "stalled:no-progress-timeout",
      blockerNextAction: recoveryAction,
      updatedAt: nowTime.text,
      updatedBy: owner || "loop",
    };
  };
  const nextGraph = {
    ...graph,
    updatedAt: nowTime.text,
    items: (graph.items || []).map(mark),
    tasks: (graph.tasks || []).map(mark),
  };
  const stalled = [...stalledById.values()];
  const backupPath = stalled.length > 0 ? await writeGraphFileWithBackup(graphPath, nextGraph) : null;
  const summary = summarizeStalledItems(stalled);
  return {
    stalled,
    retryable: summary.retryable,
    manualIntervention: summary.manualIntervention,
    backupPath,
  };
}

async function recoverStalledAgentFile(graphPath, {
  itemId,
  now,
  owner,
} = {}) {
  const normalizedItemId = String(itemId || "").trim();
  if (!normalizedItemId) throw new Error("--recover-stalled requires an item id");
  const recoveredAt = parseIsoTime(now, "--now").text;
  const graph = JSON.parse(String(await readFile(graphPath, "utf8")).replace(/^\uFEFF/, ""));
  let changed = false;
  let retryCount = 0;
  let status = "ready";
  const update = (entry) => {
    if (graphEntryId(entry) !== normalizedItemId) return entry;
    const stall = entryStallState(entry);
    if (!stall || String(stall.status || "").toLowerCase() !== "stalled") return entry;
    changed = true;
    retryCount = (Number.parseInt(String(stall.retryCount || 0), 10) || 0) + 1;
    const next = {
      ...entry,
      status,
      stall: {
        ...stall,
        status: "recovered",
        recoveredAt,
        recoveredBy: owner || "loop",
        retryCount,
      },
      recoveredAt,
      recoveredBy: owner || "loop",
      updatedAt: recoveredAt,
      updatedBy: owner || "loop",
    };
    delete next.agentStall;
    delete next.blockerReason;
    delete next.blockerNextAction;
    return next;
  };
  const nextGraph = {
    ...graph,
    updatedAt: recoveredAt,
    items: (graph.items || []).map(update),
    tasks: (graph.tasks || []).map(update),
  };
  if (!changed) throw new Error(`stalled work item not found: ${normalizedItemId}`);
  const backupPath = await writeGraphFileWithBackup(graphPath, nextGraph);
  return {
    itemId: normalizedItemId,
    recovered: true,
    retryCount,
    status,
    backupPath,
  };
}

async function resolveCompletionGraphPath({ rootDir, args } = {}) {
  if (args.file || args["work-item-graph"]) return resolve(rootDir, args.file || args["work-item-graph"]);
  if (args.epic) return join(rootDir, ".supervibe", "memory", "work-items", args.epic, "graph.json");
  const activeGraphPath = await resolveActiveWorkItemGraphPath({ rootDir });
  if (!activeGraphPath) throw new Error("completion validation requires --file <graph.json>, --epic <epic-id>, or an active work graph");
  return activeGraphPath;
}

function printEpicStatus({ graph, graphPath, epicId = null, source = "explicit" }) {
  const index = createWorkItemIndex({ graph });
  const grouped = groupWorkItemsByStatus(index);
  const taskItems = index.filter((item) => item.type !== "epic");
  const stale = taskItems.filter((item) => item.effectiveStatus === "stale");
  const stalled = collectStalledItemsFromGraph(graph);
  const stalledSummary = summarizeStalledItems(stalled);
  let completionPass = false;
  try {
    completionPass = validateEpicCompletion(graph).pass === true;
  } catch {
    completionPass = false;
  }
  const archivedAt = graph.archivedAt || graph.archived_at || graph.metadata?.archivedAt || null;
  const archiveCandidate = !archivedAt && (completionPass || isOperationallyClosedWorkGraph(graph));
  const lifecycle = archivedAt ? "archived" : archiveCandidate ? "completed-awaiting-archive" : "active";
  console.log("SUPERVIBE_EPIC_STATUS");
  console.log(`EPIC: ${epicId || graph.epicId || graph.graph_id || "unknown"}`);
  console.log(`SOURCE: ${source}`);
  console.log(`LIFECYCLE: ${lifecycle}`);
  console.log(`TASKS: ${taskItems.length}`);
  console.log(`READY: ${grouped.ready.length}`);
  console.log(`BLOCKED: ${grouped.blocked.length}`);
  console.log(`CLAIMED: ${grouped.claimed.length}`);
  console.log(`DEFERRED: ${grouped.deferred.length}`);
  console.log(`REVIEW: ${grouped.review.length}`);
  console.log(`DONE: ${grouped.done.length}`);
  console.log(`STALLED: ${stalled.length}`);
  console.log(`RETRYABLE_STALLED: ${stalledSummary.retryable}`);
  console.log(`MANUAL_INTERVENTION: ${stalledSummary.manualIntervention}`);
  console.log(formatReleaseFullCheckGate(createReleaseFullCheckGate(graph)));
  console.log(formatFinalReviewerSweepReport(createFinalReviewerSweep(graph), { includeTasks: false }));
  console.log(`NEXT_READY: ${grouped.ready[0]?.itemId || grouped.ready[0]?.id || "none"}`);
  console.log(`NEXT_ACTION: ${nextActionForEpicStatus(grouped, graph)}`);
  for (const item of taskItems) {
    console.log(formatEpicTaskStatusLine(item));
  }
  if (archiveCandidate) {
    console.log(`ARCHIVE_COMMAND: /supervibe-loop --archive --file ${graphPath}`);
    console.log("ARCHIVE_MODE: manual; no passive auto-archive will run");
  }
  if (stale.length > 0) {
    console.log(`STALE_REPAIR_COMMAND: /supervibe-loop --recover-stale <item-id> --file ${graphPath}`);
  }
  if (stalled.length > 0) {
    console.log(`STALL_RECOVERY_COMMAND: /supervibe-loop --recover-stalled <item-id> --file ${graphPath}`);
  }
  console.log(`GRAPH: ${graphPath}`);
}

function withTaskBudgetPolicySummary(summary = {}, graph = {}) {
  return {
    ...summary,
    taskBudgetPolicy: summarizeTaskBudgetPolicy(graph.metadata?.taskBudgetPolicy),
  };
}

function formatPreLoopSummary(summary, graphPath) {
  const lines = [
    "SUPERVIBE_PRE_LOOP_SUMMARY",
    `GRAPH: ${graphPath}`,
    `STARTS_EXECUTION: ${summary.startsExecution === true}`,
    `EPICS: ${summary.epicCount}`,
    `TASKS: ${summary.taskCount}`,
  ];
  for (const epic of summary.epics || []) {
    lines.push(`EPIC: ${epic.id} TASKS: ${epic.taskCount} READY: ${epic.counts.ready} BLOCKED: ${epic.counts.blocked} DONE: ${epic.counts.done} STALE: ${epic.counts.stale}`);
  }
  if (summary.orphanBucket?.taskCount) {
    const counts = summary.orphanBucket.counts || {};
    lines.push(`ORPHANS: ${summary.orphanBucket.taskCount} READY: ${counts.ready || 0} BLOCKED: ${counts.blocked || 0} DONE: ${counts.done || 0} STALE: ${counts.stale || 0}`);
  }
  lines.push(...formatTaskBudgetPolicySummary(summary.taskBudgetPolicy).split("\n"));
  lines.push(`NEXT_ACTION: ${summary.nextAction}`);
  return lines.join("\n");
}

function formatEpicTaskStatusLine(item = {}) {
  const id = item.itemId || item.id || "unknown";
  const status = item.effectiveStatus || item.status || "open";
  const blocks = Array.isArray(item.blocks) && item.blocks.length ? item.blocks.join(",") : "none";
  const blockedBy = Array.isArray(item.blockedBy) && item.blockedBy.length ? item.blockedBy.join(",") : "none";
  const activeClaim = (item.claims || []).find(isDisplayActiveClaim);
  const owner = status === "done" ? null : (item.claimOwner || item.owner || null);
  const claim = activeClaim?.agentId || owner || "none";
  const stall = entryStallState(item) || entryStallState(item.task || {});
  const stalled = String(stall?.status || "").toLowerCase() === "stalled";
  const next = stalled
    ? (stall.recoveryAction || "manual intervention required before retry")
    : status === "ready"
    ? "claim"
    : status === "blocked"
      ? (item.blockerNextAction || item.blockerReason || "inspect blockers")
      : status === "claimed"
        ? "continue or recover stale claim"
        : status === "done"
          ? "verified"
          : "wait";
  return `TASK: ${id} STATUS: ${status} BLOCKS: ${blocks} BLOCKED_BY: ${blockedBy} CLAIM: ${claim} NEXT: ${next}`;
}

function isDisplayActiveClaim(claim = {}) {
  return ["active", "claimed", "in_progress", "running"].includes(String(claim.status || "").toLowerCase());
}

function isOperationallyClosedWorkGraph(graph = {}) {
  const items = Array.isArray(graph.items) ? graph.items : [];
  const epic = items.find((item) => item.type === "epic") || null;
  const required = items.filter((item) => item.type !== "epic" && item.type !== "followup");
  if (epic && !isTerminalWorkStatus(epic.status)) return false;
  if (required.length === 0) return false;
  return required.every((item) => isTerminalWorkStatus(item.status));
}

function isTerminalWorkStatus(status) {
  return ["done", "complete", "completed", "closed", "skipped", "skip", "cancelled", "canceled"].includes(String(status || "").trim().toLowerCase());
}

function printAutoUiStatus({ rootDir, args, graphPath }) {
  if (!shouldEmitAutoUi(args)) return;
  const plan = createAutoUiPlan({ rootDir, args, graphPath });
  console.log("SUPERVIBE_AUTO_UI");
  if (args["auto-ui-dry-run"] || args.preview || args["dry-run"]) {
    console.log("STATUS: dry-run");
    console.log(`URL: ${plan.url}`);
    console.log(`BIND: 127.0.0.1`);
    console.log(`COMMAND: ${plan.command}`);
    console.log(`GRAPH: ${graphPath || "active"}`);
    return;
  }
  const child = startBackgroundNodeScript({
    scriptPath: plan.scriptPath,
    args: plan.childArgs,
    cwd: rootDir,
    name: "supervibe-ui",
    port: plan.port,
  });
  console.log("STATUS: started");
  console.log(`URL: ${plan.url}`);
  console.log(`BIND: 127.0.0.1`);
  console.log(`PID: ${child.pid}`);
  console.log(`LOG_STDOUT: ${child.logs.stdout}`);
  console.log(`LOG_STDERR: ${child.logs.stderr}`);
  console.log(`COMMAND: ${plan.command}`);
  console.log(`GRAPH: ${graphPath || "active"}`);
}

function printAtomizationAutoUiHandoff({ rootDir, args, graphPath }) {
  if (args["no-auto-ui"]) {
    console.log("SUPERVIBE_AUTO_UI");
    console.log("STATUS: opted-out");
    console.log(`GRAPH: ${graphPath || "active"}`);
    console.log("NEXT_ACTION: run /supervibe-loop --status --file <graph.json> --auto-ui-dry-run when UI tracking is wanted");
    return;
  }
  if (shouldEmitAutoUi(args)) {
    printAutoUiStatus({ rootDir, args, graphPath });
    return;
  }
  const plan = createAutoUiPlan({ rootDir, args, graphPath });
  console.log("SUPERVIBE_AUTO_UI");
  console.log("STATUS: action-required");
  console.log(`URL: ${plan.url}`);
  console.log(`COMMAND: ${plan.command}`);
  console.log(`GRAPH: ${graphPath || "active"}`);
  console.log("NEXT_QUESTION: Start the loop UI sidecar now, or continue without UI using --no-auto-ui?");
}

function shouldEmitAutoUi(args = {}) {
  if (args["no-auto-ui"]) return false;
  return Boolean(args["auto-ui"] || args["auto-ui-dry-run"]);
}

function createAutoUiPlan({ rootDir, args, graphPath }) {
  const port = normalizeLocalPort(args["ui-port"] || args.port || 3057);
  const scriptPath = fileURLToPath(new URL("./supervibe-ui.mjs", import.meta.url));
  const childArgs = ["--port", String(port), "--root", rootDir, "--foreground"];
  const commandParts = ["npm run supervibe:ui --", "--daemon", "--port", String(port)];
  if (graphPath) {
    childArgs.push("--file", graphPath);
    commandParts.push("--file", graphPath);
  }
  return {
    port,
    url: `http://127.0.0.1:${port}/`,
    scriptPath,
    childArgs,
    command: commandParts.join(" "),
  };
}

function normalizeLocalPort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`--ui-port must be an integer between 1 and 65535, got ${value}`);
  }
  return port;
}

function trustedReceiptIdsForValidation(rootDir, { explicitReceiptIds = [] } = {}) {
  const explicit = new Set((explicitReceiptIds || []).map(String).filter(Boolean));
  const trusted = [];
  for (const receipt of readWorkflowReceipts(rootDir)) {
    if (!receipt?.receiptId) continue;
    if (receipt.recovery) continue;
    if (explicit.size > 0 && !explicit.has(String(receipt.receiptId))) continue;
    const trust = validateWorkflowReceiptTrust(rootDir, receipt, { requireHostInvocationProof: true });
    if (trust.pass) trusted.push(String(receipt.receiptId));
  }
  return trusted;
}

function trustedFinalReviewerReceiptIdsForValidation(rootDir, graph = {}, { explicitReceiptIds = [] } = {}) {
  const graphId = graph.epicId || graph.graph_id || graph.graphId || (graph.items || []).find((item) => item.type === "epic")?.itemId || null;
  const explicit = new Set((explicitReceiptIds || []).map(String).filter(Boolean));
  const trusted = [];
  for (const receipt of readWorkflowReceipts(rootDir)) {
    if (!receipt?.receiptId) continue;
    if (receipt.recovery) continue;
    if (explicit.size > 0 && !explicit.has(String(receipt.receiptId))) continue;
    const subjectType = String(receipt.subjectType || "").toLowerCase();
    if (subjectType !== "reviewer") continue;
    if (receipt.command && receipt.command !== "/supervibe-loop") continue;
    if (receipt.stage && receipt.stage !== "final-review-sweep") continue;
    if (!receipt.hostInvocation?.source || !receipt.hostInvocation?.invocationId) continue;
    const receiptGraphId = receipt.graphId || receipt.workItemBinding?.graphId || null;
    if (graphId && receiptGraphId && receiptGraphId !== graphId) continue;
    const trust = validateWorkflowReceiptTrust(rootDir, receipt, { requireHostInvocationProof: true });
    if (trust.pass) trusted.push(String(receipt.receiptId));
  }
  return trusted;
}

function finalReviewEntryHasTrustedReceipt(reviewEntry = {}, trustedReceiptIds = []) {
  const trusted = new Set((trustedReceiptIds || []).map(String));
  const receiptIds = [reviewEntry.receiptId, ...(reviewEntry.receiptIds || [])].filter(Boolean);
  return receiptIds.some((receiptId) => trusted.has(String(receiptId)));
}

function trustedGraphReceiptIdsForValidation(rootDir, graph = {}, { explicitReceiptIds = [] } = {}) {
  const graphId = graph.epicId || graph.graph_id || (graph.items || []).find((item) => item.type === "epic")?.itemId || null;
  if (!graphId) return [];
  const explicit = new Set((explicitReceiptIds || []).map(String).filter(Boolean));
  const trusted = [];
  const allowedStages = new Set([
    "final-review-sweep",
    "final-review-sweep-graph-evidence",
    "release-completion",
    "work-item-graph-release",
  ]);
  for (const receipt of readWorkflowReceipts(rootDir)) {
    if (!receipt?.receiptId) continue;
    if (receipt.recovery) continue;
    if (explicit.size > 0 && !explicit.has(String(receipt.receiptId))) continue;
    if (receipt.command !== "/supervibe-loop") continue;
    if (!allowedStages.has(String(receipt.stage || ""))) continue;
    const subjectType = String(receipt.subjectType || "").toLowerCase();
    if (!["reviewer", "agent"].includes(subjectType)) continue;
    if (!receipt.hostInvocation?.source || !receipt.hostInvocation?.invocationId) continue;
    const receiptGraphId = receipt.graphId || receipt.workItemBinding?.graphId || null;
    if (receiptGraphId !== graphId) continue;
    const taskId = receipt.taskId || receipt.workItemId || receipt.graphTaskId || receipt.workItemBinding?.taskId || null;
    if (taskId && !isGraphWideCompletionReceipt(receipt, taskId)) continue;
    const trust = validateWorkflowReceiptTrust(rootDir, receipt, { requireHostInvocationProof: true });
    if (trust.pass) trusted.push(String(receipt.receiptId));
  }
  return trusted;
}

function isGraphWideCompletionReceipt(receipt = {}, taskId = "") {
  const normalizedTaskId = String(taskId || "").toLowerCase();
  if (!normalizedTaskId) return true;
  return /(?:graph|epic|release)[-_ ]?(?:close|completion|handoff|proof|evidence)|completion[-_ ]?proof/.test(normalizedTaskId);
}

function splitCsv(value = "") {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeCommandList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  return String(value)
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueCommandList(commands = []) {
  const seen = new Set();
  const out = [];
  for (const command of commands) {
    const value = String(command || "").trim();
    if (!value) continue;
    const key = normalizeVerificationCommandKey(value);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function normalizeVerificationCommandKey(command = "") {
  return String(command || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function isFullVerificationCommand(command = "") {
  const text = String(command || "").trim();
  return [
    /^npm\s+run\s+check\b/i,
    /^npm\s+(run\s+)?test\b/i,
    /^pnpm\s+(run\s+)?test\b/i,
    /^yarn\s+(run\s+)?test\b/i,
    /^bun\s+test\b/i,
    /^node\s+--test(?:\s|$)/i,
    /^vitest(?:\s|$)/i,
    /^npx\s+vitest(?:\s|$)/i,
    /^pytest(?:\s|$)/i,
    /^npm\s+run\s+validate:/i,
    /^node\s+scripts[\\/]validate-/i,
  ].some((pattern) => pattern.test(text));
}

function taskAllowsFullVerification(task = {}) {
  const labels = normalizeCommandList(task.labels || task.label).map((label) => label.toLowerCase());
  const category = String(task.category || task.type || "").toLowerCase();
  const title = String(task.title || task.goal || "").toLowerCase();
  return task.releaseGate === true
    || task.phaseGate === true
    || task.fullVerificationGate === true
    || labels.some((label) => ["release-gate", "phase-gate", "full-verification"].includes(label))
    || ["release", "phase-gate", "final-verification"].includes(category)
    || /\b(final|release|phase)\s+(verification|gate|proof)\b/.test(title);
}

function createTaskLocalVerificationPolicy(task = {}) {
  const declaredCommands = normalizeCommandList(task.verificationCommands || task.verificationCommand || task.verification || task.tests);
  const explicitlyDeferredCommands = normalizeCommandList(task.deferredVerificationCommands || task.deferredFullVerificationCommands || task.finalVerificationCommands);
  const explicitDeferredKeys = new Set(explicitlyDeferredCommands.map(normalizeVerificationCommandKey));
  const allDeclaredCommands = uniqueCommandList([...declaredCommands, ...explicitlyDeferredCommands]);
  const fullCommands = allDeclaredCommands.filter((command) => isFullVerificationCommand(command) || explicitDeferredKeys.has(normalizeVerificationCommandKey(command)));
  const targetedCommands = allDeclaredCommands.filter((command) => !isFullVerificationCommand(command) && !explicitDeferredKeys.has(normalizeVerificationCommandKey(command)));
  const fullSuiteAllowed = taskAllowsFullVerification(task);
  const deferredFullCommands = fullSuiteAllowed ? [] : fullCommands;
  const allowedFullCommands = fullSuiteAllowed ? fullCommands : [];
  return {
    schemaVersion: 1,
    scope: fullSuiteAllowed ? "phase-or-release-gate" : "task-local",
    targetedOnly: !fullSuiteAllowed,
    fullSuiteAllowed,
    testExecutionAllowed: fullSuiteAllowed,
    testsDeferredUntil: fullSuiteAllowed ? null : "release-handoff",
    fullSuitePolicy: "All test and validator execution for plan/graph/task work is reserved for the final phase or release gate; ordinary task/epic workers may collect non-test/non-validator evidence only.",
    targetedCommands,
    fullVerificationCommands: allowedFullCommands,
    deferredFullCommands,
    workerInstruction: fullSuiteAllowed
      ? "This is a final phase/release gate; tests and validators may run after child work is complete."
      : "Do not run tests or validators during development. Use only non-test/non-validator evidence listed for this task and defer node --test, npm test, npm run check, npm run validate:*, node scripts/validate-*, and equivalents to release-handoff.",
  };
}

function attachVerificationPolicyToExplanation(explanation = {}, verificationPolicy = {}) {
  return {
    ...(explanation || {}),
    verificationScope: verificationPolicy.scope,
    targetedVerificationCommands: verificationPolicy.targetedCommands || [],
    deferredFullVerificationCommands: verificationPolicy.deferredFullCommands || [],
    policyConstraints: [
      ...(explanation?.policyConstraints || []),
      verificationPolicy.fullSuitePolicy,
    ].filter(Boolean),
  };
}

function formatTaskLocalVerificationPolicy(policy = {}) {
  return [
    "SUPERVIBE_TASK_VERIFICATION_POLICY",
    `VERIFICATION_SCOPE: ${policy.scope || "task-local"}`,
    `TARGETED_ONLY: ${policy.targetedOnly !== false}`,
    `TARGETED_COMMANDS: ${(policy.targetedCommands || []).join(" && ") || "none"}`,
    `DEFERRED_FULL_COMMANDS: ${(policy.deferredFullCommands || []).join(" && ") || "none"}`,
    `TEST_EXECUTION_ALLOWED: ${policy.testExecutionAllowed === true}`,
    `TESTS_DEFERRED_UNTIL: ${policy.testsDeferredUntil || "none"}`,
    `FULL_VERIFICATION_POLICY: ${policy.fullSuitePolicy || "full checks reserved for phase or release gates"}`,
  ].join("\n");
}

function collectGraphVerificationEvidence(graph = {}) {
  const out = [];
  const addEvidence = (entry, scope) => {
    if (!entry) return;
    if (typeof entry === "string") {
      out.push({ command: entry, status: "unknown", scope });
      return;
    }
    if (Array.isArray(entry)) {
      for (const item of entry) addEvidence(item, scope);
      return;
    }
    if (typeof entry !== "object") return;
    const commands = normalizeCommandList(entry.command || entry.verificationCommand || entry.verificationCommands || entry.commandLine || entry.cmd);
    if (commands.length === 0 && entry.receiptId) {
      out.push({ ...entry, command: "", status: entry.status || entry.verdict || "unknown", scope });
      return;
    }
    for (const command of commands) {
      out.push({
        ...entry,
        command,
        status: entry.status || entry.verdict || entry.result || "unknown",
        scope,
      });
    }
  };
  addEvidence(graph.verificationEvidence, "graph");
  addEvidence(graph.evidence, "graph");
  for (const item of graph.items || []) {
    const scope = item.type === "epic" ? "epic" : "task";
    addEvidence(item.verificationEvidence, scope);
    addEvidence(item.evidence, scope);
  }
  for (const task of graph.tasks || []) {
    addEvidence(task.verificationEvidence, "task");
    addEvidence(task.evidence, "task");
  }
  return out;
}

function isPassingVerificationEvidence(evidence = {}) {
  return /^(pass|passed|ok|success|succeeded|true)$/i.test(String(evidence.status || evidence.verdict || evidence.result || ""));
}

function createReleaseFullCheckGate(graph = {}, additionalEvidence = []) {
  const evidence = collectGraphVerificationEvidence(graph);
  const addAdditionalEvidence = (entry) => {
    if (!entry) return;
    if (Array.isArray(entry)) {
      for (const item of entry) addAdditionalEvidence(item);
      return;
    }
    evidence.push({ ...entry, scope: entry.scope || "pending-close" });
  };
  addAdditionalEvidence(additionalEvidence);
  const passed = evidence.find((entry) => isReleaseFullCheckEvidence(entry) && isFullVerificationCommand(entry.command) && isPassingVerificationEvidence(entry));
  return {
    schemaVersion: 1,
    pass: Boolean(passed),
    status: passed ? "passed" : "pending",
    requiredAt: "release-handoff",
    requiredForChildTasks: false,
    command: "npm run check",
    equivalentCommands: ["npm run check", "npm run check:release", "npm run check:release-strict"],
    evidenceCommand: passed?.command || null,
    evidenceScope: passed?.scope || null,
    evidenceStatus: passed?.status || null,
    policy: "Full checks run once at final phase/release handoff, not inside every child task or epic worker assignment.",
  };
}

function isReleaseFullCheckEvidence(entry = {}) {
  const scope = String(entry.scope || "").toLowerCase();
  const releaseScopes = new Set(["graph", "epic", "pending-close", "release", "final", "final-close", "release-gate", "graph-release-gate"]);
  if (!releaseScopes.has(scope)) return false;
  if (scope === "graph" && (entry.taskId || entry.workItemId) && !entry.releaseGate && !entry.phaseGate && !entry.finalGate) return false;
  return true;
}

function formatReleaseFullCheckGate(gate = {}) {
  return [
    "SUPERVIBE_RELEASE_FULL_CHECK_GATE",
    `RELEASE_FULL_CHECK_GATE: ${gate.status || "pending"}`,
    `FULL_CHECK_REQUIRED_AT: ${gate.requiredAt || "release-handoff"}`,
    `CHILD_TASK_REQUIRES_FULL_CHECK: ${gate.requiredForChildTasks === true}`,
    `FULL_CHECK_COMMAND: ${gate.command || "npm run check"}`,
    `FULL_CHECK_EQUIVALENTS: ${(gate.equivalentCommands || []).join(",") || "none"}`,
    `FULL_CHECK_EVIDENCE: ${gate.evidenceCommand || "none"}`,
    `FULL_CHECK_POLICY: ${gate.policy || "full checks are release-only"}`,
  ].join("\n");
}

function nextActionForEpicStatus(grouped = {}, graph = {}) {
  const nextReady = grouped.ready?.[0]?.itemId || grouped.ready?.[0]?.id || null;
  const readyCount = (grouped.ready || []).filter((item) => item.type !== "epic").length;
  const dispatchableReady = selectStatusReadyWave(grouped.ready || [], graph);
  if (nextReady && dispatchableReady.blockedByActiveClaims) {
    return `wait for current claimed wave or complete/recover active claims before dispatching ready items; blocked ready items: ${dispatchableReady.blockedTaskIds.join(", ")}`;
  }
  if (dispatchableReady.taskIds.length > 1) return `dispatch safe wave from ${dispatchableReady.taskIds.length} ready items with /supervibe-loop --dispatch-wave --apply --file <graph.json>, or claim ${dispatchableReady.taskIds[0]}`;
  if (dispatchableReady.taskIds.length === 1) return `claim ${dispatchableReady.taskIds[0]} or run /supervibe-loop --claim-ready`;
  if (nextReady && readyCount > 1) return `dispatch safe wave from ${readyCount} ready items with /supervibe-loop --dispatch-wave --apply --file <graph.json>, or claim ${nextReady}`;
  if (nextReady) return `claim ${nextReady} or run /supervibe-loop --claim-ready`;
  const stalled = collectStalledItemsFromGraph(graph);
  if (stalled.length > 0) return `recover stalled work: ${stalled.map((item) => item.itemId).join(", ")}`;
  if ((grouped.blocked || []).length > 0) return "inspect blockers, unblock tasks, or validate dependency completion";
  if ((grouped.review || []).length > 0) return "complete required review and gate work items";
  try {
    if (validateEpicCompletion(graph).pass === true) return "finish/archive completed epic";
  } catch {
    // Keep status reporting usable even if completion validation cannot inspect a legacy graph.
  }
  return "run /supervibe-loop --validate-completion";
}

function selectStatusReadyWave(readyItems = [], graph = {}) {
  const readyTasks = readyItems
    .filter((item) => item.type !== "epic")
    .map((item) => ({
      ...(item.task || {}),
      ...item,
      id: item.itemId || item.id,
      taskId: item.itemId || item.id,
    }));
  if (readyTasks.length === 0) return { taskIds: [], blockedTaskIds: [], blockedByActiveClaims: false };
  const activeLocks = activeClaimWriteSetLocks(graph);
  if (activeLocks.length === 0) {
    return { taskIds: readyTasks.map((task) => task.id || task.taskId || task.itemId).filter(Boolean), blockedTaskIds: [], blockedByActiveClaims: false };
  }
  const selection = selectSafeExecutionWave({
    tasks: readyTasks,
    maxConcurrency: readyTasks.length,
    requireWriteSet: true,
    writeSetLocks: activeLocks,
  });
  const blockedByLock = selection.blocked.filter((item) => /write-set lock conflict/.test(item.reason || ""));
  return {
    taskIds: selection.selected.map((task) => task.id || task.taskId || task.itemId).filter(Boolean),
    blockedTaskIds: blockedByLock.map((item) => item.taskId).filter(Boolean),
    blockedByActiveClaims: selection.selected.length === 0 && blockedByLock.length > 0,
  };
}

function resolveWorkItemAction(args) {
  const actionKeys = ["claim", "close", "complete", "reopen", "delete", "skip", "cancel", "block", "unblock", "comment", "handoff", "recover-stale", "edit", "split"];
  for (const key of actionKeys) {
    if (!args[key]) continue;
    const itemId = String(args[key]);
    if (key === "edit") {
      return {
        type: "edit",
        itemId,
        patch: {
          title: args.title,
          description: args.description,
          status: args["set-status"] || args.statusValue,
          priority: args.priority,
          owner: args.owner,
          assignee: args.assignee,
          labels: args.labels,
          acceptanceCriteria: args.acceptance || args["acceptance-criteria"],
          verificationCommands: args.verification || args["verification-commands"],
          dueAt: args.until || args.due,
        },
      };
    }
    if (key === "split") {
      return {
        type: "split",
        itemId,
        titles: parseCsvArg(args.titles || args.subtasks || args.title),
      };
    }
    if (key === "block") {
      return {
        type: "block",
        itemId,
        reason: args.reason,
        nextAction: args["next-action"] || args.nextAction,
      };
    }
    if (key === "comment") {
      return {
        type: "comment",
        itemId,
        body: args.body || args.message || args.reason,
        commentType: args["comment-type"] || args.commentType,
        links: args.links || args.link,
      };
    }
    if (key === "handoff") {
      return {
        type: "handoff",
        itemId,
        producer: args.producer || args.from,
        recipient: args.recipient || args.to,
        receiptId: args.receipt || args.receiptId,
        summary: args.summary || args.reason,
      };
    }
    const action = { type: key, itemId, status: args["set-status"] };
    const verificationEvidence = verificationEvidenceFromArgs(args, itemId);
    if (["close", "complete"].includes(key) && verificationEvidence.length > 0) {
      action.verificationEvidence = verificationEvidence;
    }
    return action;
  }
  if (args["dep-add"] || args["dependency-add"]) {
    return {
      type: "dep-add",
      from: args["dep-add"] || args["dependency-add"] || args.from,
      to: args.to || args.blocks || args.dependsOn,
      depType: args["dep-type"] || args.dependencyType || "blocks",
    };
  }
  if (args["dep-remove"] || args["dependency-remove"]) {
    return {
      type: "dep-remove",
      from: args["dep-remove"] || args["dependency-remove"] || args.from,
      to: args.to || args.blocks || args.dependsOn,
      depType: args["dep-type"] || args.dependencyType || "blocks",
    };
  }
  if (args.reparent) {
    return {
      type: "reparent",
      itemId: args.reparent,
      parentId: args.parent || args.parentId || null,
    };
  }
  return null;
}

function verificationEvidenceFromArgs(args, itemId) {
  const command = args.verification || args["verification-command"] || args["verification-commands"];
  const outputSummary = args.evidence || args["output-summary"] || args.summary;
  const receiptId = args.receipt || args.receiptId || args["receipt-id"];
  const reviewerStatus = args["reviewer-status"] || args.reviewerStatus;
  if (!command && !outputSummary && !receiptId && !reviewerStatus) return [];
  return [{
    taskId: itemId,
    status: args["verification-status"] || args.verdict || "pass",
    source: "supervibe-loop",
    command: command || undefined,
    outputSummary: outputSummary || (receiptId ? "runtime receipt evidence" : "verification evidence recorded"),
    receiptId: receiptId || undefined,
    reviewerStatus: reviewerStatus || undefined,
  }];
}

function finalReviewEntryFromArgs(args) {
  const taskId = args["record-final-review"];
  if (!taskId || taskId === true) throw new Error("--record-final-review requires a task/work item id");
  return {
    taskId,
    status: args["reviewer-status"] || args.reviewStatus || args.verdict || args.status || "pass",
    score: args.score || args["review-score"] || 10,
    reviewerAgentId: args.reviewer || args["reviewer-agent"] || args.agent || null,
    receiptId: args.receipt || args.receiptId || args["receipt-id"] || null,
    receiptIds: splitCsv(args.receipts || args["receipt-ids"]),
    evidence: splitCsv(args.evidence || args["evidence-paths"] || args["evidence-path"]),
    notes: args.notes || args.summary || args["output-summary"] || null,
    productionReady: args["production-ready"] == null ? null : args["production-ready"] !== "false",
  };
}

async function findGraphContainingItem(rootDir, itemId) {
  const base = join(rootDir, ".supervibe", "memory", "work-items");
  const candidates = [];
  async function walk(dir, depth = 0) {
    if (depth > 3) return;
    let entries = [];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full, depth + 1);
      else if (entry.name === "graph.json") candidates.push(full);
    }
  }
  await walk(base);
  for (const candidate of candidates) {
    try {
      const graph = JSON.parse(await readFile(candidate, "utf8"));
      const ids = [...(graph.items || []), ...(graph.tasks || [])].map((entry) => entry.itemId || entry.id);
      if (ids.includes(itemId)) return candidate;
    } catch {
      // Ignore malformed graph files during discovery; explicit --file can surface them.
    }
  }
  throw new Error(`Could not find graph containing ${itemId}; pass --file <graph.json>`);
}

async function maybePrepareWorktreeSession(args, rootDir) {
  if (!args.worktree && !args["worktree-existing"] && !args["resume-session"]) return null;
  const registryPath = defaultWorktreeRegistryPath(rootDir);

  if (args["resume-session"]) {
    const registry = await readWorktreeSessionRegistry(registryPath);
    const sessionId = args["resume-session"];
    const session = registry.sessions.find((candidate) => candidate.sessionId === sessionId);
    if (!session) throw new Error(`Unknown worktree session: ${args["resume-session"]}`);
    const owner = resolveWorktreeSessionOwner(args, session.owner);
    if (session.owner && owner && session.owner !== owner && !args["allow-session-conflict"]) {
      throw new Error(`Worktree session owner mismatch: ${session.sessionId} is owned by ${session.owner}; pass --owner ${session.owner} or --allow-session-conflict with --override-reason`);
    }
    if (["closed", "archived", "cleanup_blocked"].includes(session.status) && !args.force) {
      throw new Error(`Worktree session ${session.sessionId} is ${session.status}; pass --force only after reviewing cleanup state`);
    }
    const now = new Date().toISOString();
    const resumedSession = createWorktreeSessionRecord({
      ...session,
      owner: owner || session.owner,
      status: "active",
      heartbeatAt: now,
      updatedAt: now,
      resumedAt: now,
    });
    await writeWorktreeSessionRegistry(registryPath, {
      ...registry,
      sessions: registry.sessions.map((candidate) => candidate.sessionId === sessionId ? resumedSession : candidate),
    });
    return resumedSession;
  }

  const epicId = args.epic || args.plan || args.request || "epic-unassigned";
  const assignedTaskIds = parseCsvArg(args["assigned-task"] || args["assigned-tasks"] || args.task || args.tasks);
  const assignedWriteSet = parseCsvArg(args["assigned-write-set"] || args["write-set"] || args.files);
  const assignedWaveId = args["assigned-wave"] || args.wave || null;
  const branchName = args.branch || createScopedWorktreeBranchName(epicId, {
    assignedTaskIds,
    assignedWaveId,
    sessionId: args["session-id"],
  });
  let worktreePath = args["worktree-existing"];
  if (worktreePath) {
    const validation = validateExistingWorktree({
      rootDir,
      worktreePath: resolve(rootDir, worktreePath),
      gitignoreContent: "",
      dirty: false,
      baselineChecks: [],
    });
    if (!validation.valid) throw new Error(`Invalid existing worktree: ${validation.issues.join(", ")}`);
  } else {
    const selection = await selectWorktreeDirectory({
      rootDir,
      configWorktreeRoot: args["worktree-root"] || ".worktrees",
    });
    if (!selection.selected) {
      throw new Error(`No safe worktree root selected: ${selection.issues.join(", ") || "provide --worktree-existing or --worktree-root"}`);
    }
    worktreePath = join(selection.selected, branchName.replace(/[\\/]/g, "-"));
  }

  const baselineCommit = args["baseline-commit"] || "HEAD";
  let materializedAt = null;
  if (args["worktree-create"] && !args["dry-run"] && !args["worktree-existing"]) {
    const result = spawnSync("git", ["worktree", "add", worktreePath, "-b", branchName, baselineCommit], {
      cwd: rootDir,
      encoding: "utf8",
      windowsHide: true,
    });
    if (result.status !== 0) {
      throw new Error(`git worktree add failed: ${(result.stderr || result.stdout || `exit ${result.status}`).trim()}`);
    }
    materializedAt = new Date().toISOString();
  }

  const session = createWorktreeSessionRecord({
    sessionId: args["session-id"],
    rootDir,
    epicId,
    branchName,
    worktreePath,
    baselineCommit,
    materializedAt,
    baselineChecks: args["baseline-check"] ? [{ command: args["baseline-check"], status: "planned" }] : [],
    assignedWaveId,
    assignedTaskIds,
    assignedWriteSet,
    maxRuntimeMinutes: args["max-runtime-minutes"] || parseDurationToMinutes(args["max-duration"]),
    owner: resolveWorktreeSessionOwner(args),
    conflictOverride: args["allow-session-conflict"] ? {
      allowed: true,
      reason: args["override-reason"] || "explicit --allow-session-conflict",
      by: resolveWorktreeSessionOwner(args),
    } : null,
    status: "ready",
  });
  const upsert = args["dry-run"]
    ? upsertWorktreeSession(await readWorktreeSessionRegistry(registryPath), session, {
        allowConflict: Boolean(args["allow-session-conflict"]),
        overrideReason: args["override-reason"],
        overrideOwner: resolveWorktreeSessionOwner(args),
      })
    : await upsertWorktreeSessionFile(registryPath, session, {
        allowConflict: Boolean(args["allow-session-conflict"]),
        overrideReason: args["override-reason"],
        overrideOwner: resolveWorktreeSessionOwner(args),
      });
  if (!upsert.ok) throw new Error(`Worktree session conflict: ${upsert.conflicts.map((item) => item.sessionId).join(", ")}`);
  return upsert.session;
}

function resolveWorktreeSessionOwner(args = {}, fallback = "supervibe-loop") {
  return args.owner || args["session-owner"] || args.agent || args["agent-id"] || fallback || "supervibe-loop";
}

function parseCsvArg(value) {
  if (!value) return [];
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function buildAdapterConfig(args) {
  const config = {};
  if (args["adapter-command"]) config.command = args["adapter-command"];
  const adapterArgs = parseCsvArg(args["adapter-args"] || args["provider-args"]);
  if (adapterArgs.length > 0) config.args = adapterArgs;
  return Object.keys(config).length > 0 ? config : undefined;
}

function resolveSchedulerPolicy({ args = {}, rootDir = process.cwd(), activeGraph = null } = {}) {
  const requestedMaxConcurrency = positiveInt(args["max-concurrency"], 3);
  const providerId = String(args.provider || args.tool || process.env.SUPERVIBE_PROVIDER || "codex").toLowerCase();
  const manifest = loadProviderCapabilities({ rootDir: args["plugin-root"] || rootDir });
  const provider = (manifest.providers || []).find((entry) => String(entry.id || "").toLowerCase() === providerId) || null;
  const providerLimits = provider?.providerLimits || {};
  const providerMaxThreads = positiveInt(args["provider-max-threads"], positiveInt(providerLimits.defaultMaxThreads, requestedMaxConcurrency));
  const providerTimeoutSeconds = positiveInt(args["provider-timeout-seconds"], positiveInt(providerLimits.defaultJobRuntimeSeconds, null));
  const hostManagedCleanupDebt = providerId === "codex"
    ? summarizeHostManagedSubagentDebtSync({
        rootDir,
        path: defaultRuntimeCleanupRegistryPath(rootDir),
      })
    : { count: 0, closeRequired: [], discovered: 0 };
  const activeGraphClaimedSlots = countActiveGraphProviderSlots(activeGraph);
  const providerThreadLimit = providerMaxThreads || requestedMaxConcurrency;
  const availableProviderThreads = Math.max(0, providerThreadLimit - hostManagedCleanupDebt.count - activeGraphClaimedSlots);
  const effectiveMaxConcurrency = Math.min(requestedMaxConcurrency, availableProviderThreads || 0);
  const reason = schedulerPolicyReason({
    hostManagedCleanupDebt,
    providerThreadLimit,
    activeGraphClaimedSlots,
    providerMaxThreads,
    requestedMaxConcurrency,
  });
  return {
    providerId: provider?.id || providerId,
    providerName: provider?.name || providerId,
    requestedMaxConcurrency,
    providerMaxThreads: providerMaxThreads || null,
    providerTimeoutSeconds: providerTimeoutSeconds || null,
    hostManagedCleanupRequired: hostManagedCleanupDebt.count,
    hostManagedCleanupIds: hostManagedCleanupDebt.closeRequired.map((item) => item.hostInvocationId).filter(Boolean),
    activeGraphClaimedSlots,
    availableProviderThreads,
    effectiveMaxConcurrency,
    source: provider ? "provider-capabilities-manifest" : "cli-default",
    reason,
  };
}

function schedulerPolicyReason({
  hostManagedCleanupDebt,
  providerThreadLimit,
  activeGraphClaimedSlots,
  providerMaxThreads,
  requestedMaxConcurrency,
} = {}) {
  const cleanupCount = Number(hostManagedCleanupDebt?.count || 0);
  if (cleanupCount >= providerThreadLimit) {
    return `completed Codex subagent cleanup requires closing ${cleanupCount} host-managed thread(s) before new spawns`;
  }
  const reductions = [];
  if (cleanupCount > 0) reductions.push(`${cleanupCount} completed Codex subagent(s) awaiting close/reset`);
  if (activeGraphClaimedSlots > 0) reductions.push(`${activeGraphClaimedSlots} active graph claim(s) already consuming provider slots`);
  if (reductions.length > 0) return `provider threads reduced by ${reductions.join(" and ")}`;
  if (providerMaxThreads && providerMaxThreads < requestedMaxConcurrency) {
    return `provider max threads ${providerMaxThreads} caps requested concurrency ${requestedMaxConcurrency}`;
  }
  return "requested concurrency is within provider limits";
}

function countActiveGraphProviderSlots(graph = null, now = new Date().toISOString()) {
  if (!graph || typeof graph !== "object") return 0;
  const activeTaskIds = new Set();
  for (const claim of Array.isArray(graph.claims) ? graph.claims : []) {
    if (!isActiveGraphProviderClaim(claim, now)) continue;
    const taskId = claim.taskId || claim.itemId || claim.id;
    if (taskId) activeTaskIds.add(taskId);
  }
  const activeClaimedTaskIds = new Set(activeTaskIds);
  for (const entry of [...(graph.items || []), ...(graph.tasks || [])]) {
    if (!entry || entry.type === "epic") continue;
    const taskId = entry.itemId || entry.taskId || entry.id;
    if (!taskId) continue;
    if (activeClaimedTaskIds.size > 0 && !activeClaimedTaskIds.has(taskId)) continue;
    if (isProviderSlotStatus(entry.status)) activeTaskIds.add(taskId);
  }
  if (activeClaimedTaskIds.size === 0) {
    for (const entry of [...(graph.items || []), ...(graph.tasks || [])]) {
      if (!entry || entry.type === "epic") continue;
      const taskId = entry.itemId || entry.taskId || entry.id;
      if (taskId && isProviderSlotStatus(entry.status)) activeTaskIds.add(taskId);
    }
  }
  return activeTaskIds.size;
}

function isActiveGraphProviderClaim(claim = {}, now = new Date().toISOString()) {
  if (!isProviderSlotStatus(claim.status)) return false;
  if (!claim.expiresAt) return true;
  const expiresAt = Date.parse(claim.expiresAt);
  if (!Number.isFinite(expiresAt)) return true;
  return expiresAt > Date.parse(now);
}

function isProviderSlotStatus(status) {
  return ["active", "claimed", "in_progress", "running"].includes(String(status || "").toLowerCase());
}

function formatSchedulerPolicy(policy = {}) {
  return [
    "SUPERVIBE_SCHEDULER_POLICY",
    `PROVIDER: ${policy.providerId || "unknown"}`,
    `PROVIDER_NAME: ${policy.providerName || "unknown"}`,
    `REQUESTED_MAX_CONCURRENCY: ${policy.requestedMaxConcurrency || 0}`,
    `PROVIDER_MAX_THREADS: ${policy.providerMaxThreads ?? "unknown"}`,
    `PROVIDER_TIMEOUT_SECONDS: ${policy.providerTimeoutSeconds ?? "unknown"}`,
    `HOST_MANAGED_CLEANUP_REQUIRED: ${policy.hostManagedCleanupRequired || 0}`,
    `HOST_MANAGED_CLEANUP_IDS: ${(policy.hostManagedCleanupIds || []).join(",") || "none"}`,
    `ACTIVE_GRAPH_CLAIMED_SLOTS: ${policy.activeGraphClaimedSlots || 0}`,
    `AVAILABLE_PROVIDER_THREADS: ${policy.availableProviderThreads ?? "unknown"}`,
    `EFFECTIVE_MAX_CONCURRENCY: ${policy.effectiveMaxConcurrency || 0}`,
    `SOURCE: ${policy.source || "unknown"}`,
    `REASON: ${policy.reason || "not evaluated"}`,
  ].join("\n");
}

function formatSchedulerDecisions(plan = {}) {
  const selected = new Set(plan.currentWave?.tasks || []);
  const lines = ["SUPERVIBE_SCHEDULER_DECISIONS"];
  for (const taskId of selected) {
    lines.push(`TASK: ${taskId} DECISION: parallel REASON: ready, provider slot available, write-set lock reserved`);
  }
  for (const item of plan.serialized || []) {
    lines.push(`TASK: ${item.taskId} DECISION: serialized REASON: ${item.reason}`);
  }
  for (const item of plan.blocked || []) {
    lines.push(`TASK: ${item.taskId} DECISION: blocked REASON: ${item.reason}`);
  }
  if (lines.length === 1) lines.push("TASKS: none");
  return lines.join("\n");
}

function positiveInt(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function shouldUseTaskTrackerAdapter(args) {
  return Boolean(args.tracker || args["tracker-command"] || process.env.SUPERVIBE_TASK_TRACKER_COMMAND);
}

function createTaskTrackerAdapterFromArgs(args, options = {}) {
  if (args.tracker === "memory") return createMemoryTaskTrackerAdapter();
  if (args.tracker === "mcp") {
    return createTaskTrackerMcpAdapter({
      servers: parseCsvArg(args["tracker-mcp-servers"] || args["tracker-mcp-server"] || args["mcp-servers"]),
      allowedTools: parseCsvArg(args["tracker-mcp-tools"] || args["mcp-tools"]),
      approved: Boolean(args["approve-mcp-tracker"]),
    });
  }
  if (args.tracker === "cli" || args["tracker-command"] || process.env.SUPERVIBE_TASK_TRACKER_COMMAND) {
    return createCliTaskTrackerAdapter({
      command: args["tracker-command"] || process.env.SUPERVIBE_TASK_TRACKER_COMMAND,
      baseArgs: parseCsvArg(args["tracker-base-args"]),
      timeoutMs: args["tracker-timeout-ms"],
    });
  }
  return createUnavailableTaskTrackerAdapter(options.fallbackReason || "no external tracker configured");
}

function createScopedWorktreeBranchName(epicId, options = {}) {
  const epicSlug = String(epicId).replace(/[^A-Za-z0-9_-]+/g, "-");
  const scope = options.sessionId || options.assignedTaskIds?.[0] || options.assignedWaveId || "";
  const scopeSlug = String(scope).replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return scopeSlug ? `supervibe/${epicSlug}/${scopeSlug}` : `supervibe/${epicSlug}`;
}

function parseDurationToMinutes(value) {
  if (!value) return null;
  const match = /^(\d+)\s*(m|min|h|hr|hour|hours)?$/i.exec(String(value).trim());
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = (match[2] || "m").toLowerCase();
  return unit.startsWith("h") ? amount * 60 : amount;
}

function resolveLoopRuntimeDefaults({ rootDir = process.cwd(), args = {} } = {}) {
  const tool = resolveDefaultLoopTool({ rootDir, args });
  const providerCapabilities = safeResolveToolCapabilities(tool);
  const executionMode = deriveExecutionMode(args, {
    tool,
    providerCapabilities,
  });
  const externalFreshContext = executionMode === "fresh-context" && tool !== "generic-shell-stub";
  return {
    tool,
    executionMode,
    allowSpawn: args["allow-spawn"] ?? externalFreshContext,
    permissionPromptBridge: args["permission-prompt-bridge"] ?? externalFreshContext,
  };
}

function resolveDefaultLoopTool({ rootDir = process.cwd(), args = {} } = {}) {
  const explicit = String(args.tool || args.provider || process.env.SUPERVIBE_PROVIDER || "").trim().toLowerCase();
  if (explicit) return explicit;
  try {
    const selected = selectHostAdapter({ rootDir, env: process.env })?.adapter?.id || "";
    if (TOOL_ADAPTER_IDS.includes(selected)) return selected;
  } catch {
    // Host detection should not block loop startup; fall back to a non-mutating local mode.
  }
  return "generic-shell-stub";
}

function safeResolveToolCapabilities(tool) {
  try {
    return resolveToolLoopCapabilities(tool);
  } catch {
    return null;
  }
}

function deriveExecutionMode(args, { tool = null, providerCapabilities = null } = {}) {
  if (args.guided) return "guided";
  if (args.manual) return "manual";
  if (args["fresh-context"]) return "fresh-context";
  if (args["execution-mode"]) return args["execution-mode"];
  return resolveDefaultLoopExecutionMode({
    dryRun: Boolean(args["dry-run"]),
    adapterId: tool,
    providerCapabilities,
  });
}

function printHelp() {
  console.log(`SUPERVIBE_LOOP_HELP
Primary:
  supervibe-loop --request "validate integrations"
  supervibe-loop --happy-path --plan .supervibe/artifacts/plans/example.md
  supervibe-loop --plan .supervibe/artifacts/plans/example.md
  supervibe-loop --from-prd .supervibe/artifacts/specs/example.md
  supervibe-loop --atomize-plan .supervibe/artifacts/plans/example.md --plan-review-passed
  supervibe-loop --status --file .supervibe/memory/loops/<run-id>/state.json
  supervibe-loop --status --epic <epic-id>
  supervibe-loop --status --file .supervibe/memory/work-items/<epic-id>/graph.json --auto-ui
  supervibe-loop --status --file .supervibe/memory/work-items/<epic-id>/graph.json --auto-ui-dry-run --ui-port 3057
  supervibe-loop --stop <run-id>
  supervibe-loop --watch --file .supervibe/memory/work-items/<epic-id>/graph.json
  supervibe-loop --claim <task-id> --file .supervibe/memory/work-items/<epic-id>/graph.json
  supervibe-loop --claim-ready --file .supervibe/memory/work-items/<epic-id>/graph.json
  supervibe-loop --dispatch-wave --apply --file .supervibe/memory/work-items/<epic-id>/graph.json --max-concurrency 4
  supervibe-loop --close <task-id> --reason "verified" --file .supervibe/memory/work-items/<epic-id>/graph.json
  supervibe-loop --validate-completion --file .supervibe/memory/work-items/<epic-id>/graph.json
  supervibe-loop --validate-completion --file .supervibe/memory/work-items/<epic-id>/graph.json --require-trusted-evidence --trusted-receipts <id,id>
  supervibe-loop --final-review-sweep --file .supervibe/memory/work-items/<epic-id>/graph.json
  supervibe-loop --record-final-review <task-id> --reviewer quality-gate-reviewer --receipt <receipt-id> --file .supervibe/memory/work-items/<epic-id>/graph.json
  supervibe-loop --edit <task-id> --title "Updated title" --file .supervibe/memory/work-items/<epic-id>/graph.json
  supervibe-loop --split <task-id> --titles "Subtask A,Subtask B" --file .supervibe/memory/work-items/<epic-id>/graph.json --preview
  supervibe-loop --skip <task-id> --reason "out of scope" --file .supervibe/memory/work-items/<epic-id>/graph.json --preview
  supervibe-loop --block <task-id> --reason "needs clarification" --file .supervibe/memory/work-items/<epic-id>/graph.json --preview
  supervibe-loop --reparent <task-id> --parent <epic-or-task-id> --file .supervibe/memory/work-items/<epic-id>/graph.json
  supervibe-loop --dep-add <from-task-id> --to <to-task-id> --file .supervibe/memory/work-items/<epic-id>/graph.json
  supervibe-loop --delete <task-id> --file .supervibe/memory/work-items/<epic-id>/graph.json --preview
  supervibe-loop --create-work-item --interactive
  supervibe-loop --create-work-item --title "Fix checkout bug" --template bug --dry-run
  supervibe-loop --quickstart
  supervibe-loop --onboard
  supervibe-loop --tracker-prime
  supervibe-loop --completion bash|zsh|powershell
  supervibe-loop --worktree-status
  supervibe-loop --eval
  supervibe-loop --eval --case plan-review-loop
  supervibe-loop --eval --replay .supervibe/memory/loops/<run-id>
  supervibe-loop --eval-live --case worktree-run --max-runtime-minutes 30 --max-iterations 3 --provider-budget 1
  supervibe-loop --policy-profile guided --request "validate integrations"
  supervibe-loop --approval-receipts
  supervibe-loop --policy-doctor
  supervibe-loop --policy-doctor --fix-derived
  supervibe-loop --anchors --file src/example.ts
  supervibe-loop --anchor-doctor
  supervibe-loop --anchor-doctor --fix-derived
  supervibe-loop --summarize-changes --task task-123 --file src/example.ts --summary "Changed parser"
  supervibe-loop --plan-waves .supervibe/artifacts/plans/example.md
  supervibe-loop --assign-ready --explain --file .supervibe/memory/loops/<run-id>/state.json
  supervibe-loop --dispatch-wave --json --file .supervibe/memory/work-items/<epic-id>/graph.json --max-concurrency 4
  supervibe-loop --setup-worker-presets
  supervibe-loop --provider-matrix
  supervibe-loop --require-user-acceptance --request "validate integrations"
  supervibe-loop --accept-goals --file .supervibe/memory/loops/<run-id>/state.json --accepted-by <name>
  supervibe-loop --reject-goals --file .supervibe/memory/loops/<run-id>/state.json --feedback "what is missing"
  supervibe-loop --fork-checkpoint --file .supervibe/memory/loops/<run-id>/state.json

Advanced:
  supervibe-loop --readiness --plan .supervibe/artifacts/plans/example.md
  supervibe-loop graph --file .supervibe/memory/loops/<run-id>/state.json --format text|json|mermaid|dot
  supervibe-loop doctor --file .supervibe/memory/loops/<run-id>/state.json [--fix]
  supervibe-loop prime --file .supervibe/memory/loops/<run-id>/state.json
  supervibe-loop --import-tasks .supervibe/artifacts/plans/example.md --dry-run
  supervibe-loop --atomize-plan .supervibe/artifacts/plans/example.md --preview
  supervibe-loop --priority --file .supervibe/memory/work-items/<epic-id>/graph.json
  supervibe-loop --defer task-123 --until 2026-05-01T09:00:00Z --file .supervibe/memory/work-items/<epic-id>/graph.json
  supervibe-loop --notify terminal,inbox --request "validate integrations"
  supervibe-loop --export-sync-bundle .supervibe/memory/loops/<run-id>
  supervibe-loop --import-sync-bundle path/to/sync-bundle --dry-run
  supervibe-loop --tracker-sync-push --tracker memory --file .supervibe/memory/work-items/<epic-id>/graph.json
  supervibe-loop --tracker-prime --json
  supervibe-loop export --file .supervibe/memory/loops/<run-id>/state.json --out <bundle-dir>
  supervibe-loop import --file <bundle-dir> --out <target-root>

Execution modes:
  default: provider-recommended real mode (fresh-context for supported providers, guided without a real provider)
  --dry-run
  --guided
  --manual
  --fresh-context --tool codex|claude|gemini|opencode
  --fresh-context --tool codex|claude|gemini|opencode [--allow-spawn --permission-prompt-bridge]
  --adapter-command <command> [--adapter-args arg1,arg2]
  --tracker memory|cli|mcp [--tracker-command <command>] [--tracker-base-args arg1,arg2]
  --tracker mcp --tracker-mcp-servers issue-tracker --tracker-mcp-tools create_issue,link_dependency --approve-mcp-tracker
  --provider-matrix
  --require-user-acceptance
  --auto-ui | --auto-ui-dry-run [--no-auto-ui] [--ui-port 3057]
  --require-trusted-evidence [--trusted-receipts <id,id>] [--disallow-legacy-evidence|--allow-legacy-evidence]
  --accept-goals | --reject-goals --file <state.json>
  --fork-checkpoint --file <state.json>
  --commit-per-task
  --worktree --epic <epic-id> [--max-duration 3h]
  --worktree --epic <epic-id> --assigned-task T1 --assigned-write-set src/file.ts
  --worktree-existing .worktrees/<session>
  --resume-session <session-id>
  --allow-flat-plan (legacy diagnostic only; reviewed plans should be atomized first)`);
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
