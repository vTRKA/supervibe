function estimateTokenCost(value) {
  return Math.ceil(JSON.stringify(value || "").length / 4);
}

export function enforceTokenBudget(contextPack, budget = 8000) {
  const cost = contextPack.approximateTokenCost ?? estimateTokenCost(contextPack);
  return {
    cost,
    budget,
    withinBudget: cost <= budget,
    status: cost <= budget ? "within_budget" : "token_budget_stopped",
  };
}

function shouldReuseContext(cacheEntry, watchedMtime) {
  if (!cacheEntry) return false;
  return Number(cacheEntry.mtime || 0) >= Number(watchedMtime || 0);
}
