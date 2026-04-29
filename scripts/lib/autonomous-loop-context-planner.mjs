export function buildContextPlan(task, options = {}) {
  const queries = [
    task.goal,
    task.category,
    ...(task.acceptanceCriteria || []),
  ].filter(Boolean);
  const structural = /(refactor|integration|dependency|public api|architecture)/i.test(`${task.goal} ${task.category}`);
  const pack = {
    taskId: task.id,
    retrievalQueries: [...new Set(queries)],
    memoryEntries: options.memoryEntries || [],
    codeRagChunks: options.codeRagChunks || [],
    codeGraphEvidence: structural ? options.codeGraphEvidence || [] : [],
    directFilesRead: options.directFilesRead || [],
    approximateTokenCost: Number(options.approximateTokenCost || estimateTokens(queries.join(" "))),
    omittedContext: options.omittedContext || [],
    freshnessTimestamp: new Date().toISOString(),
    cacheKey: `${task.id}:${task.goal}`,
    rulesLoaded: options.rulesLoaded || [],
    mcpPlan: options.mcpPlan || null,
  };
  return pack;
}

export function contextConfidenceCap(task, pack) {
  if (!pack.memoryEntries?.length) return 8;
  if (!pack.codeRagChunks?.length) return 8;
  if (/(refactor|integration|dependency|public api|architecture)/i.test(`${task.goal} ${task.category}`) && !pack.codeGraphEvidence?.length) return 7;
  if (pack.stale) return 7;
  if (pack.approximateTokenCost > 8000 && !pack.retrievalJustification) return 6;
  return 10;
}

function estimateTokens(text) {
  return Math.ceil(String(text).length / 4);
}
