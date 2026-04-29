export function createBudget(options = {}) {
  return {
    maxLoops: Number(options.maxLoops || 20),
    maxRuntimeMinutes: Number(options.maxRuntimeMinutes || 60),
    maxDispatchesPerTask: Number(options.maxDispatchesPerTask || 3),
    maxRepairAttempts: Number(options.maxRepairAttempts || 3),
    maxConcurrentAgents: Number(options.maxConcurrentAgents || 3),
    providerCallBudget: options.providerCallBudget == null ? null : Number(options.providerCallBudget),
    tokenBudget: options.tokenBudget == null ? null : Number(options.tokenBudget),
  };
}

export function budgetRemaining(budget, usage = {}) {
  return {
    loops: budget.maxLoops - Number(usage.loops || 0),
    runtimeMinutes: budget.maxRuntimeMinutes - Number(usage.runtimeMinutes || 0),
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
