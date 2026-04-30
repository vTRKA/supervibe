import { LOOP_SCHEMA_VERSION } from "./autonomous-loop-constants.mjs";

const GRAPH_STATUSES = new Set([
  "open",
  "ready",
  "claimed",
  "in_progress",
  "blocked",
  "deferred",
  "failed",
  "complete",
  "cancelled",
  "policy_stopped",
  "budget_stopped",
]);

const LEGACY_STATUS_MAP = {
  pending: "open",
  running: "in_progress",
  partial: "failed",
};

export function createTaskGraph(input = {}, options = {}) {
  const rawTasks = Array.isArray(input) ? input : input.tasks || [];
  const tasks = rawTasks.map((task, index) => normalizeGraphTask(task, index, options));
  const byId = new Map(tasks.map((task) => [task.id, task]));

  for (const task of tasks) {
    task.dependents = [];
  }
  for (const task of tasks) {
    for (const dependencyId of task.dependencies) {
      const dependency = byId.get(dependencyId);
      if (dependency && !dependency.dependents.includes(task.id)) {
        dependency.dependents.push(task.id);
      }
    }
  }

  return {
    schema_version: input.schema_version || LOOP_SCHEMA_VERSION,
    graph_id: input.graph_id || options.graphId || "autonomous-loop-graph",
    source: input.source || options.source || { type: "generated" },
    tasks,
  };
}

export function validateTaskGraph(input = {}) {
  const rawTasks = Array.isArray(input) ? input : input.tasks || [];
  const issues = [];
  const seen = new Set();
  const duplicates = new Set();

  for (const task of rawTasks) {
    if (!task?.id) {
      issues.push(issue("missing-id", null, "Task is missing id."));
      continue;
    }
    if (seen.has(task.id)) duplicates.add(task.id);
    seen.add(task.id);
  }
  for (const id of duplicates) {
    issues.push(issue("duplicate-id", id, `Duplicate task id ${id}.`));
  }

  const graph = createTaskGraph(input);
  const byId = new Map(graph.tasks.map((task) => [task.id, task]));

  for (const task of graph.tasks) {
    for (const dependencyId of task.dependencies) {
      if (dependencyId === task.id) {
        issues.push(issue("self-dependency", task.id, `Task ${task.id} depends on itself.`));
      } else if (!byId.has(dependencyId)) {
        issues.push(issue("unknown-dependency", task.id, `Task ${task.id} depends on unknown task ${dependencyId}.`, { dependencyId }));
      }
    }
  }

  const cycle = findCycle(graph.tasks);
  if (cycle.length > 0) {
    issues.push(issue("cycle", cycle[0], `Dependency cycle detected: ${cycle.join(" -> ")}.`, { cycle }));
  }

  const openTasks = graph.tasks.filter((task) => ["open", "ready"].includes(task.status));
  const readyTasks = openTasks.filter((task) => task.dependencies.every((dependencyId) => byId.get(dependencyId)?.status === "complete"));
  if (openTasks.length > 0 && readyTasks.length === 0 && issues.length === 0) {
    issues.push(issue("impossible-ready-front", null, "Open tasks exist but no ready front can be computed."));
  }

  return { valid: issues.length === 0, issues, graph };
}

export function normalizeGraphTask(task = {}, sourceOrder = 0, options = {}) {
  const id = String(task.id || `task-${sourceOrder + 1}`);
  const dependencies = uniqueStrings([...(task.dependencies || []), ...(task.blockedBy || [])]);
  const relations = normalizeRelations(task.relations || []);
  const status = normalizeStatus(task.status || options.defaultStatus || "open");

  return {
    id,
    title: task.title || task.goal || id,
    goal: task.goal || task.title || id,
    category: task.category || "implementation",
    type: task.type || "task",
    status,
    priority: task.priority ?? sourceOrder + 1,
    dependencies,
    dependents: uniqueStrings(task.dependents || []),
    blocks: uniqueStrings(task.blocks || []),
    related: uniqueStrings(task.related || []),
    relations,
    parentId: task.parentId || task.parent_id || null,
    epicId: task.epicId || task.epic_id || null,
    discoveredFrom: task.discoveredFrom || task.discovered_from || null,
    source: task.source || options.source || { type: "generated" },
    acceptanceCriteria: task.acceptanceCriteria || task.acceptance_criteria || ["Task evidence is present"],
    verificationCommands: task.verificationCommands || task.verification_commands || [],
    writeScope: task.writeScope || task.write_scope || [],
    estimatedSize: task.estimatedSize || task.estimated_size || null,
    parallelGroup: task.parallelGroup || task.parallel_group || null,
    executionHints: task.executionHints || task.execution_hints || {},
    policyRiskLevel: task.policyRiskLevel || task.policy_risk_level || "low",
    stopConditions: task.stopConditions || task.stop_conditions || ["policy_stop", "budget_stop", "verification_failed"],
    requiredAgentCapability: task.requiredAgentCapability || task.required_agent_capability || "generalist",
    confidenceRubricId: task.confidenceRubricId || task.confidence_rubric_id || "autonomous-loop",
    sourceOrder: task.sourceOrder ?? sourceOrder,
  };
}

export function graphToFlatTasks(input = {}) {
  return createTaskGraph(input).tasks.map((task) => ({
    id: task.id,
    goal: task.goal,
    category: task.category,
    requiredAgentCapability: task.requiredAgentCapability,
    dependencies: [...task.dependencies],
    acceptanceCriteria: [...task.acceptanceCriteria],
    verificationCommands: [...task.verificationCommands],
    confidenceRubricId: task.confidenceRubricId,
    policyRiskLevel: task.policyRiskLevel,
    stopConditions: [...task.stopConditions],
    status: task.status,
    source: task.source,
    parentId: task.parentId,
    epicId: task.epicId,
    type: task.type,
    blocks: [...task.blocks],
    related: [...task.related],
    discoveredFrom: task.discoveredFrom,
    writeScope: task.writeScope,
    estimatedSize: task.estimatedSize,
    parallelGroup: task.parallelGroup,
    executionHints: task.executionHints,
  }));
}

export function mergeExternalTrackerStatus(input = {}, trackerRecords = []) {
  const graph = createTaskGraph(input);
  const byNativeId = new Map(trackerRecords.map((record) => [record.nativeId || record.itemId || record.id, record]));
  const byExternalId = new Map(trackerRecords.map((record) => [record.externalId, record]));
  return {
    ...graph,
    tasks: graph.tasks.map((task) => {
      const external = byNativeId.get(task.id) || byExternalId.get(task.externalId);
      if (!external) return task;
      return {
        ...task,
        externalTracker: {
          externalId: external.externalId,
          status: external.status || null,
          url: external.url || null,
          updatedAt: external.updatedAt || null,
        },
        status: external.status ? normalizeStatusFromTracker(external.status, task.status) : task.status,
      };
    }),
  };
}

export function reconcileReadyFrontWithTracker(nativeReady = [], externalReady = [], mapping = {}) {
  const externalReadyIds = new Set(externalReady.map((record) => record.externalId || record.id));
  return nativeReady.map((task) => {
    const externalId = mapping.items?.[task.id]?.externalId || task.externalTracker?.externalId || null;
    return {
      ...task,
      trackerReady: !externalId || externalReadyIds.has(externalId),
      externalId,
    };
  });
}

function normalizeStatus(status) {
  const value = String(status).trim();
  const mapped = LEGACY_STATUS_MAP[value] || value;
  return GRAPH_STATUSES.has(mapped) ? mapped : "open";
}

function normalizeStatusFromTracker(status, fallback) {
  const value = String(status || "").toLowerCase();
  if (["done", "closed", "complete", "completed"].includes(value)) return "complete";
  if (["blocked", "waiting", "needs_approval"].includes(value)) return "blocked";
  if (["claimed", "assigned", "in_progress", "running"].includes(value)) return "claimed";
  if (["ready", "open", "todo"].includes(value)) return "open";
  return fallback;
}

function normalizeRelations(relations) {
  return relations.map((relation) => ({
    type: relation.type,
    targetId: relation.targetId || relation.target_id,
  })).filter((relation) => relation.type && relation.targetId);
}

function findCycle(tasks) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const visiting = new Set();
  const visited = new Set();

  function visit(task, path) {
    if (visiting.has(task.id)) {
      const start = path.indexOf(task.id);
      return path.slice(start);
    }
    if (visited.has(task.id)) return [];
    visiting.add(task.id);
    for (const dependencyId of task.dependencies) {
      if (dependencyId === task.id) continue;
      const dependency = byId.get(dependencyId);
      if (!dependency) continue;
      const cycle = visit(dependency, [...path, dependency.id]);
      if (cycle.length > 0) return cycle;
    }
    visiting.delete(task.id);
    visited.add(task.id);
    return [];
  }

  for (const task of tasks) {
    const cycle = visit(task, [task.id]);
    if (cycle.length > 0) return cycle;
  }
  return [];
}

function uniqueStrings(values) {
  return [...new Set(values.map(String).filter(Boolean))];
}

function issue(code, taskId, message, extra = {}) {
  return { code, taskId, message, ...extra };
}
