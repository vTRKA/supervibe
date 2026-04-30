import { createWorkItemIndex, groupWorkItemsByStatus } from "./supervibe-work-item-query.mjs";

const WORKFLOW_FLOW_STEPS = Object.freeze([
  { id: "plan", label: "Plan" },
  { id: "atomize", label: "Atomize" },
  { id: "execute", label: "Execute" },
  { id: "verify", label: "Verify" },
  { id: "close", label: "Close" },
  { id: "archive", label: "Archive" },
]);

export function createWorkflowFlowModel({
  graph = null,
  index = null,
  grouped = null,
  run = null,
  waves = null,
  dashboard = null,
} = {}) {
  const normalizedIndex = normalizeFlowIndex({ graph, index, run });
  const groups = grouped || groupWorkItemsByStatus(normalizedIndex);
  const taskItems = normalizedIndex.filter((item) => item.type !== "epic");
  const gates = [...asArray(graph?.gates), ...asArray(run?.gates)];
  const openGates = gates.filter((gate) => isOpenGateStatus(gate.status));
  const blockedGates = gates.filter((gate) => isBlockedStatus(gate.status));
  const runStatus = normalizeFlowStatus(run?.status || run?.runStatus || "");
  const graphStatus = normalizeFlowStatus(graph?.status || graph?.state || "");
  const archived = hasArchiveMarker(graph) || hasArchiveMarker(run) || runStatus === "archived" || graphStatus === "archived";
  const closed = archived || hasCloseMarker(graph) || hasCloseMarker(run) || isCompleteStatus(graphStatus);
  const totalTasks = taskItems.length;
  const doneTasks = taskItems.filter(isDoneWorkItem).length;
  const allTasksDone = totalTasks > 0 && doneTasks === totalTasks;
  const graphLoaded = Boolean(graph) || totalTasks > 0;
  const runLoaded = Boolean(run);
  const runTerminal = isCompleteStatus(runStatus);
  const runBlocked = isBlockedStatus(runStatus) || isBlockedStatus(waves?.status) || Boolean(run?.stop_reason || run?.stopReason);
  const readyCount = groups.ready?.length || 0;
  const claimedCount = groups.claimed?.length || 0;
  const blockedCount = groups.blocked?.length || 0;
  const evidenceCount = asArray(graph?.evidence).length + asArray(run?.evidence).length + asArray(dashboard?.evidence).length;

  let activeId = "plan";
  let activeState = "current";
  if (archived) {
    activeId = "archive";
  } else if (!graphLoaded && !runLoaded) {
    activeId = "plan";
  } else if (graphLoaded && totalTasks === 0) {
    activeId = "atomize";
  } else if (runBlocked && !allTasksDone && !runTerminal) {
    activeId = "execute";
    activeState = "blocked";
  } else if (!allTasksDone && !runTerminal) {
    activeId = "execute";
    activeState = blockedCount > 0 && readyCount === 0 && claimedCount === 0 ? "blocked" : "current";
  } else if (openGates.length > 0) {
    activeId = "verify";
    activeState = blockedGates.length > 0 ? "blocked" : "current";
  } else if (!closed && (allTasksDone || runTerminal)) {
    activeId = "close";
  } else if (closed) {
    activeId = "archive";
  }

  const activeIndex = WORKFLOW_FLOW_STEPS.findIndex((step) => step.id === activeId);
  const steps = WORKFLOW_FLOW_STEPS.map((step, index) => {
    const state = index < activeIndex ? "complete" : index === activeIndex ? activeState : "pending";
    return {
      ...step,
      state,
      active: step.id === activeId,
      hint: workflowFlowHint(step.id, {
        graphLoaded,
        totalTasks,
        doneTasks,
        ready: readyCount,
        claimed: claimedCount,
        blocked: blockedCount,
        runLoaded,
        runStatus,
        runTerminal,
        openGates: openGates.length,
        evidenceCount,
        closed,
        archived,
      }),
    };
  });

  return {
    activeId,
    status: activeState,
    completion: Math.round((steps.filter((step) => step.state === "complete").length / steps.length) * 100),
    metrics: {
      totalTasks,
      doneTasks,
      ready: readyCount,
      claimed: claimedCount,
      blocked: blockedCount,
      openGates: openGates.length,
      evidence: evidenceCount,
    },
    steps,
  };
}

function normalizeFlowIndex({ graph, index, run }) {
  if (Array.isArray(index)) return index;
  if (graph?.items) {
    return createWorkItemIndex({
      graph,
      claims: graph.claims || [],
      gates: graph.gates || [],
      evidence: graph.evidence || [],
      delegatedMessages: graph.delegatedMessages || graph.delegated_messages || [],
    });
  }
  if (run?.items) {
    return createWorkItemIndex({
      graph: { ...run, items: run.items, tasks: run.tasks || [] },
      claims: run.claims || [],
      gates: run.gates || [],
      evidence: run.evidence || [],
      delegatedMessages: run.delegatedMessages || run.delegated_messages || [],
    });
  }
  if (Array.isArray(run?.tasks)) return run.tasks.map((task) => loopTaskToWorkItem(task, run));
  return [];
}

function loopTaskToWorkItem(task = {}, run = {}) {
  const id = task.itemId || task.id;
  const activeId = run.active_task || run.activeTask;
  const status = id && activeId === id && ["", "open", "ready", "pending"].includes(normalizeFlowStatus(task.status))
    ? "in_progress"
    : task.status;
  return {
    ...task,
    itemId: id,
    id,
    type: task.type || "task",
    title: task.title || task.goal || id || "Task",
    goal: task.goal || task.title || id || "Task",
    task,
    claims: [],
    gates: [],
    evidence: [],
    owner: task.owner || task.agentId || task.assignee || null,
    effectiveStatus: normalizeLoopTaskStatus(status),
  };
}

function normalizeLoopTaskStatus(status) {
  const normalized = normalizeFlowStatus(status);
  if (isCompleteStatus(normalized)) return "done";
  if (["in_progress", "running", "claimed", "active", "started"].includes(normalized)) return "claimed";
  if (["blocked", "policy_stopped", "budget_stopped", "command_adapter_required", "failed", "failure", "error", "cancelled", "canceled", "stopped", "paused"].includes(normalized)) return "blocked";
  if (["deferred", "waiting"].includes(normalized)) return "deferred";
  if (["review", "reviewing", "verify", "verification"].includes(normalized)) return "review";
  return "ready";
}

function workflowFlowHint(id, facts) {
  if (id === "plan") return facts.graphLoaded ? "Graph loaded" : "No graph loaded";
  if (id === "atomize") return facts.totalTasks > 0 ? `${facts.totalTasks} task(s)` : "No work items yet";
  if (id === "execute") {
    const run = facts.runLoaded ? `run ${facts.runStatus || "loaded"}` : "no run loaded";
    return `${run}; ready ${facts.ready}, claimed ${facts.claimed}, blocked ${facts.blocked}`;
  }
  if (id === "verify") {
    if (facts.openGates > 0) return `${facts.openGates} gate(s) open`;
    if (facts.evidenceCount > 0) return `${facts.evidenceCount} evidence item(s)`;
    return facts.doneTasks > 0 ? "No open gates" : "Waiting for execution";
  }
  if (id === "close") return facts.closed ? "Closed" : facts.doneTasks > 0 ? `${facts.doneTasks} done task(s)` : "Waiting for verification";
  if (id === "archive") return facts.archived ? "Archived" : facts.closed ? "Ready to archive" : "Waiting for close";
  return "";
}

function isDoneWorkItem(item) {
  const status = normalizeFlowStatus(item.effectiveStatus || item.status || item.task?.status);
  return ["done", "complete", "completed", "closed"].includes(status);
}

function isOpenGateStatus(status) {
  return ["open", "waiting", "blocked", "pending"].includes(normalizeFlowStatus(status));
}

function isCompleteStatus(status) {
  return ["complete", "completed", "closed", "done", "succeeded", "success"].includes(normalizeFlowStatus(status));
}

function isBlockedStatus(status) {
  return ["blocked", "failed", "failure", "error", "cancelled", "canceled", "stopped", "paused"].includes(normalizeFlowStatus(status));
}

function hasArchiveMarker(value) {
  return Boolean(value?.archivedAt || value?.archived_at || value?.metadata?.archivedAt || value?.metadata?.archived_at);
}

function hasCloseMarker(value) {
  return Boolean(value?.closedAt || value?.closed_at || value?.completedAt || value?.completed_at || value?.metadata?.closedAt || value?.metadata?.closed_at);
}

function normalizeFlowStatus(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}
