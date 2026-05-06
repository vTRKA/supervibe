export function createBudget(options = {}) {
  return {
    maxLoops: optionalPositiveNumber(options.maxLoops),
    maxRuntimeMinutes: optionalPositiveNumber(options.maxRuntimeMinutes),
    maxDispatchesPerTask: Number(options.maxDispatchesPerTask || 3),
    maxRepairAttempts: Number(options.maxRepairAttempts || 3),
    maxConcurrentAgents: Number(options.maxConcurrentAgents || 3),
    providerCallBudget: options.providerCallBudget == null ? null : Number(options.providerCallBudget),
    tokenBudget: options.tokenBudget == null ? null : Number(options.tokenBudget),
  };
}

export function budgetRemaining(budget, usage = {}) {
  return {
    loops: remainingFor(budget.maxLoops, usage.loops),
    runtimeMinutes: remainingFor(budget.maxRuntimeMinutes, usage.runtimeMinutes),
    providerCalls: budget.providerCallBudget == null ? null : budget.providerCallBudget - Number(usage.providerCalls || 0),
    tokens: budget.tokenBudget == null ? null : budget.tokenBudget - Number(usage.tokens || 0),
  };
}

export function budgetStatus(budget, usage = {}) {
  const remaining = budgetRemaining(budget, usage);
  const exceeded = Object.entries(remaining).filter(([, value]) => value != null && value < 0).map(([key]) => key);
  return {
    exceeded: exceeded.length > 0,
    exceededFields: exceeded,
    remaining,
    status: exceeded.length > 0 ? "budget_stopped" : "within_budget",
  };
}

function optionalPositiveNumber(value) {
  if (value === undefined || value === null || value === "" || value === false) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function remainingFor(limit, used) {
  if (limit === undefined || limit === null) return null;
  return Number(limit) - Number(used || 0);
}
