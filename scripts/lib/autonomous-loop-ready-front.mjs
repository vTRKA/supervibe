import { createTaskGraph, isDependencySatisfiedStatus, validateTaskGraph } from "./autonomous-loop-task-graph.mjs";
import { detectWriteSetConflicts, selectSafeExecutionWave } from "./supervibe-wave-controller.mjs";

const OPEN_STATUSES = new Set(["open", "ready"]);
const RISK_ORDER = { none: 0, low: 1, medium: 2, high: 3 };
const DEFAULT_REVIEW_MODE = "final-sweep";

export function calculateReadyFront(input = {}, options = {}) {
  const validation = validateTaskGraph(input);
  const graph = validation.graph || createTaskGraph(input);
  if (!validation.valid) {
    return {
      valid: false,
      issues: validation.issues,
      ready: [],
      blocked: [],
      parallel: [],
      graph,
    };
  }

  const byId = new Map(graph.tasks.map((task) => [task.id, task]));
  const ready = [];
  const blocked = [];

  for (const task of graph.tasks) {
    if (!OPEN_STATUSES.has(task.status)) continue;
    const blockers = task.dependencies.filter((dependencyId) => !isDependencySatisfiedStatus(byId.get(dependencyId)?.status));
    if (blockers.length === 0) ready.push(task);
    else blocked.push({ ...task, blockers });
  }

  const orderedReady = orderTasks(ready, graph);
  const maxConcurrent = Number(options.maxConcurrentAgents || options.max_concurrent_agents || orderedReady.length || 1);
  const maxRisk = options.maxPolicyRiskLevel || options.max_policy_risk_level || "medium";
  const reviewMode = normalizeReviewMode(options.reviewMode ?? options.reviewerMode ?? options.review_mode ?? options.reviewer_mode);
  const reviewersAvailable = options.reviewersAvailable ?? options.reviewers_available ?? true;
  const reviewerBlocksParallel = reviewMode !== "final-sweep" && reviewersAvailable === false;
  const wave = reviewerBlocksParallel
    ? { selected: [], serialized: [], blocked: [], conflicts: detectWriteSetConflicts(orderedReady) }
    : selectSafeExecutionWave({
        tasks: orderedReady,
        maxConcurrency: maxConcurrent,
        maxPolicyRiskLevel: maxRisk,
        requireWriteSet: false,
      });
  const parallel = wave.selected;
  const writeSetConflicts = detectWriteSetConflicts(orderedReady);

  return {
    valid: true,
    issues: [],
    ready: orderedReady,
    blocked: orderTasks(blocked, graph),
    parallel,
    serialized: wave.serialized,
    parallelBlocked: wave.blocked,
    writeSetConflicts,
    parallelizationBlockedBy: reviewerBlocksParallel
      ? ["missing-reviewer"]
      : [
          ...writeSetConflicts.map((conflict) => `write-set:${conflict.filePath}`),
          ...wave.blocked.map((item) => item.reason),
        ],
    reviewPolicy: {
      mode: reviewMode,
      reviewersAvailable,
      reviewersRequiredAt: reviewMode === "final-sweep" ? "final-graph-sweep" : "per-task",
    },
    graph,
  };
}

export function dependencyDepth(taskId, graph) {
  const byId = new Map(graph.tasks.map((task) => [task.id, task]));
  const memo = new Map();

  function depth(id) {
    if (memo.has(id)) return memo.get(id);
    const task = byId.get(id);
    if (!task || task.dependencies.length === 0) {
      memo.set(id, 0);
      return 0;
    }
    const value = 1 + Math.max(...task.dependencies.map(depth));
    memo.set(id, value);
    return value;
  }

  return depth(taskId);
}

function orderTasks(tasks, graph) {
  return [...tasks].sort((a, b) => {
    const priority = priorityRank(b.priority) - priorityRank(a.priority);
    if (priority !== 0) return priority;
    const depth = dependencyDepth(b.id, graph) - dependencyDepth(a.id, graph);
    if (depth !== 0) return depth;
    return a.sourceOrder - b.sourceOrder;
  });
}

function priorityRank(priority) {
  if (typeof priority === "number") return priority;
  const value = String(priority || "").toLowerCase();
  const match = /^p(\d+)$/.exec(value);
  if (match) return 100 - Number(match[1]);
  if (value === "critical") return 100;
  if (value === "high") return 75;
  if (value === "medium") return 50;
  if (value === "low") return 25;
  return 0;
}

function normalizeReviewMode(value) {
  const normalized = String(value || DEFAULT_REVIEW_MODE).trim().toLowerCase().replace(/_/g, "-");
  if (["per-task", "inline", "wave", "stage-2"].includes(normalized)) return "per-task";
  return DEFAULT_REVIEW_MODE;
}
