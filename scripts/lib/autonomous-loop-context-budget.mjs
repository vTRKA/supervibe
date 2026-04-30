const DEFAULT_MAX_CONTEXT_CHARS = 24_000;
const DEFAULT_WARNING_RATIO = 0.7;
const DEFAULT_HANDOFF_RATIO = 0.9;

export function estimateContextBudget({
  task = {},
  packet = null,
  contextPack = null,
  progressNotes = null,
  maxChars = DEFAULT_MAX_CONTEXT_CHARS,
  warningRatio = DEFAULT_WARNING_RATIO,
  handoffRatio = DEFAULT_HANDOFF_RATIO,
} = {}) {
  const source = packet || { task, contextPack, progressNotes };
  const estimatedChars = JSON.stringify(source).length;
  const pressure = maxChars > 0 ? estimatedChars / maxChars : 1;
  const warnings = [];
  if (pressure >= warningRatio) warnings.push("context-budget-warning");
  if (pressure >= handoffRatio) warnings.push("handoff-before-context-exhaustion");

  return {
    maxChars,
    estimatedChars,
    pressure: Number(pressure.toFixed(3)),
    status: pressure >= handoffRatio ? "handoff_recommended" : pressure >= warningRatio ? "warning" : "ok",
    smallEnoughForAutonomy: pressure < warningRatio,
    oneStoryPerContext: pressure < handoffRatio,
    warnings,
    handoffPacket: pressure >= handoffRatio ? createContextHandoffPacket({ task, estimatedChars, maxChars, pressure }) : null,
  };
}

export function createContextHandoffPacket({ task = {}, estimatedChars = 0, maxChars = DEFAULT_MAX_CONTEXT_CHARS, pressure = 0 } = {}) {
  return {
    type: "context-budget-handoff",
    taskId: task.id || null,
    title: task.title || task.goal || task.id || "unknown",
    reason: "context pressure is close to exhaustion",
    estimatedChars,
    maxChars,
    pressure: Number(pressure.toFixed(3)),
    nextAction: "split task or create a fresh-context handoff before execution",
  };
}

export function annotateTaskWithContextBudget(task = {}, options = {}) {
  const budget = estimateContextBudget({ task, ...options });
  return {
    ...task,
    contextBudget: budget,
    autonomyFit: budget.smallEnoughForAutonomy ? "small-enough" : budget.status,
  };
}

export function formatContextBudgetStatus(budget = {}) {
  return [
    `CONTEXT_BUDGET: ${budget.status || "unknown"}`,
    `ESTIMATED_CHARS: ${budget.estimatedChars ?? 0}/${budget.maxChars ?? DEFAULT_MAX_CONTEXT_CHARS}`,
    `SMALL_ENOUGH_FOR_AUTONOMY: ${Boolean(budget.smallEnoughForAutonomy)}`,
    `NEXT_ACTION: ${budget.handoffPacket?.nextAction || "execute"}`,
  ].join("\n");
}
