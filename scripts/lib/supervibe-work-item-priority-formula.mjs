const SEVERITY_WEIGHT = {
  blocker: 50,
  critical: 40,
  high: 30,
  medium: 15,
  low: 5,
};

const RISK_PENALTY = {
  high: -10,
  medium: -4,
  low: 0,
};

export function scoreWorkItemPriority(item = {}, { graph = {}, now = new Date(), ownerAvailability = {}, worktreeFit = {} } = {}) {
  const tasks = graph.tasks || graph.items || [];
  const dependencyDepth = calculateDependencyDepth(item.itemId || item.id, tasks);
  const blockerCount = (item.blocks || item.dependents || []).length;
  const ageHours = ageInHours(item.createdAt || item.created_at, now);
  const severity = String(item.severity || item.priorityLabel || "medium").toLowerCase();
  const owner = item.owner || item.assignee || "unassigned";
  const ownerScore = ownerAvailability[owner] === false ? -20 : ownerAvailability[owner] === true ? 10 : 0;
  const fitScore = worktreeFit[item.itemId || item.id] === false ? -10 : worktreeFit[item.itemId || item.id] === true ? 8 : 0;
  const risk = String(item.policyRiskLevel || item.risk || "low").toLowerCase();
  const basePriority = Number(item.priority || 0);
  const dueUrgency = scoreDueUrgency(item, { now });
  const staleClaimPenalty = hasStaleClaim(item, now) ? -8 : 0;
  const score = basePriority
    + (SEVERITY_WEIGHT[severity] ?? SEVERITY_WEIGHT.medium)
    + dependencyDepth * 6
    + blockerCount * 5
    + Math.min(ageHours, 72) * 0.2
    + dueUrgency
    + ownerScore
    + fitScore
    + (RISK_PENALTY[risk] ?? 0)
    + staleClaimPenalty;

  return {
    itemId: item.itemId || item.id,
    score: Number(score.toFixed(2)),
    criticalPath: dependencyDepth > 0 || blockerCount > 0,
    explanation: [
      `priority=${basePriority}`,
      `severity=${severity}`,
      `dependencyDepth=${dependencyDepth}`,
      `blockerCount=${blockerCount}`,
      `ageHours=${Number(ageHours.toFixed(1))}`,
      `dueUrgency=${dueUrgency}`,
      `owner=${owner}`,
      `worktreeFit=${worktreeFit[item.itemId || item.id] ?? "unknown"}`,
      `risk=${risk}`,
      `staleClaim=${staleClaimPenalty !== 0}`,
    ],
  };
}

export function orderReadyWorkItems(items = [], options = {}) {
  return items
    .map((item) => ({ item, priority: scoreWorkItemPriority(item, options) }))
    .sort((a, b) => b.priority.score - a.priority.score)
    .map(({ item, priority }) => ({ ...item, priorityScore: priority.score, priorityExplanation: priority.explanation, criticalPath: priority.criticalPath }));
}

export function createPriorityOverrideAudit({ itemId, from, to, reason, actor = "user", at = new Date().toISOString() } = {}) {
  if (!itemId || !reason || String(reason).length < 8) {
    throw new Error("priority override requires itemId and a visible reason");
  }
  return { type: "priority-override", itemId, from, to, reason, actor, at };
}

export function formatPriorityExplanation(item = {}) {
  return [
    `${item.itemId || item.id}: score=${item.priorityScore ?? "unknown"}`,
    ...(item.priorityExplanation || []).map((line) => `- ${line}`),
  ].join("\n");
}

export function calculateDependencyDepth(id, tasks = []) {
  const byId = new Map(tasks.map((task) => [task.itemId || task.id, task]));
  const dependents = new Map();
  for (const task of tasks) {
    const taskId = task.itemId || task.id;
    for (const dep of task.dependencies || task.blockedBy || []) {
      const list = dependents.get(dep) || [];
      list.push(taskId);
      dependents.set(dep, list);
    }
  }
  const seen = new Set();
  function depth(taskId) {
    if (seen.has(taskId)) return 0;
    seen.add(taskId);
    const children = dependents.get(taskId) || [];
    if (children.length === 0) return 0;
    return 1 + Math.max(...children.map(depth));
  }
  return byId.has(id) || dependents.has(id) ? depth(id) : 0;
}

export function scoreDueUrgency(item = {}, { now = new Date() } = {}) {
  const dueAt = item.dueAt || item.due_at || item.dueDate || item.due_date || item.task?.dueAt || item.task?.dueDate;
  if (!dueAt) return 0;
  const due = Date.parse(dueAt);
  const current = Date.parse(now instanceof Date ? now.toISOString() : now);
  if (!Number.isFinite(due) || !Number.isFinite(current)) return 0;
  const hours = (due - current) / 3_600_000;
  if (hours < 0) return 18;
  if (hours <= 24) return 12;
  if (hours <= 72) return 6;
  return 0;
}

function ageInHours(value, now) {
  if (!value) return 0;
  const start = Date.parse(value);
  const end = Date.parse(now instanceof Date ? now.toISOString() : now);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, (end - start) / 3_600_000);
}

function hasStaleClaim(item, now) {
  const current = Date.parse(now instanceof Date ? now.toISOString() : now);
  return (item.claims || []).some((claim) => {
    if (["stale", "expired"].includes(claim.status)) return true;
    const heartbeat = Date.parse(claim.heartbeatAt || claim.claimedAt || "");
    return Number.isFinite(heartbeat) && Number.isFinite(current) && current - heartbeat > 30 * 60_000;
  });
}
