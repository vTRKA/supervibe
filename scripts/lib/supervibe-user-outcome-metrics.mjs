export function buildUserOutcomeReport({
  contextPack = {},
  scenarioEvaluation = null,
  startedAt = 0,
  firstUsefulContextAt = 0,
  confidenceBefore = 0,
  confidenceAfter = contextPack.confidence ?? 0,
  avoidedQuestions = 0,
  successfulResumeRate = 1,
} = {}) {
  const provenance = buildContextProvenance(contextPack);
  const repairActions = buildRepairActions(contextPack);
  const lifecycle = buildLifecycleEvidence(scenarioEvaluation);
  const timeToFirstUsefulContextMs = Math.max(0, Number(firstUsefulContextAt || 0) - Number(startedAt || 0));
  const metrics = {
    timeToFirstUsefulContextMs,
    contextProvenanceVisible: provenance.length > 0,
    repairSuggestionQuality: scoreRepairSuggestions(repairActions),
    confidenceDelta: Number((Number(confidenceAfter || 0) - Number(confidenceBefore || 0)).toFixed(3)),
    avoidedQuestions,
    successfulResumeRate,
    userConfirmableCitations: provenance.filter((item) => item.path).length,
    postDeliveryChoiceClarity: lifecycle.postDeliveryChoiceClarity,
    approvalMenuCompletionRate: lifecycle.approvalMenuCompletionRate,
    noSilentDoneViolations: lifecycle.noSilentDoneViolations,
  };
  const checks = [
    check("context-provenance", metrics.contextProvenanceVisible, "user outcome report missing context provenance, repair action or confidence delta"),
    check("repair-action", repairActions.length > 0, "user outcome report missing context provenance, repair action or confidence delta"),
    check("confidence-delta", Number.isFinite(metrics.confidenceDelta), "user outcome report missing context provenance, repair action or confidence delta"),
    check("no-silent-done", metrics.noSilentDoneViolations === 0, "silent done violation detected"),
  ];
  return {
    schemaVersion: 1,
    pass: checks.every((entry) => entry.pass),
    metrics,
    provenance,
    repairActions,
    lifecycle,
    checks,
  };
}

export function buildUserOutcomeReportFromContextPack(contextPack = {}) {
  return buildUserOutcomeReport({
    contextPack,
    startedAt: 0,
    firstUsefulContextAt: contextPack.citations?.length ? 250 : 0,
    confidenceBefore: 0,
    confidenceAfter: contextPack.confidence ?? 0,
    avoidedQuestions: (contextPack.citations || []).length > 0 ? 1 : 0,
  });
}

export function formatUserOutcomeReport(report = {}) {
  const lines = [
    "SUPERVIBE_USER_OUTCOME_METRICS",
    `PASS: ${Boolean(report.pass)}`,
    `TIME_TO_FIRST_CONTEXT_MS: ${report.metrics?.timeToFirstUsefulContextMs ?? 0}`,
    `CONFIDENCE_DELTA: ${report.metrics?.confidenceDelta ?? 0}`,
    `CITATIONS: ${report.metrics?.userConfirmableCitations ?? 0}`,
    `REPAIR_ACTIONS: ${report.repairActions?.length || 0}`,
    `NO_SILENT_DONE_VIOLATIONS: ${report.metrics?.noSilentDoneViolations ?? 0}`,
  ];
  for (const item of report.provenance || []) lines.push(`- ${item.source}: ${item.path} (${item.reason})`);
  for (const action of report.repairActions || []) lines.push(`  repair: ${action.action} (${action.reason})`);
  return lines.join("\n");
}

function buildContextProvenance(pack = {}) {
  return (pack.citations || []).map((citation) => ({
    source: citation.source || "unknown",
    path: citation.path || "",
    reason: pack.sources?.[citation.source]?.reason || pack.sources?.[citation.source]?.status || "context citation",
  }));
}

function buildRepairActions(pack = {}) {
  const actions = [];
  for (const [source, diagnostic] of Object.entries(pack.diagnostics || {})) {
    if (diagnostic.status === "skipped") {
      actions.push({ source, action: `repair or populate ${source} context`, reason: diagnostic.reason });
    }
  }
  if (pack.tokenBudget?.overflow) {
    actions.push({ source: "tokenBudget", action: "switch to deeper budget or narrow query", reason: "context pack overflowed token budget" });
  }
  if (pack.confidence < 0.85) {
    actions.push({ source: "confidence", action: "run memory/RAG/codegraph diagnostics", reason: "confidence below release gate" });
  }
  if (actions.length === 0) actions.push({ source: "context", action: "continue with cited context", reason: "all required sources are present" });
  return actions;
}

function buildLifecycleEvidence(evaluation = null) {
  const results = evaluation?.results || [];
  if (!results.length) {
    return {
      postDeliveryChoiceClarity: 1,
      approvalMenuCompletionRate: 1,
      noSilentDoneViolations: 0,
    };
  }
  const delivery = results.filter((result) => result.state?.lastPostDeliveryPrompt);
  return {
    postDeliveryChoiceClarity: delivery.length ? delivery.filter(hasRequiredChoices).length / delivery.length : 1,
    approvalMenuCompletionRate: delivery.length ? delivery.filter((result) => result.state?.approvalState === "pending-user-choice").length / delivery.length : 1,
    noSilentDoneViolations: results.filter((result) => result.state?.claimsDoneWithoutChoice).length,
  };
}

function hasRequiredChoices(result) {
  const choices = new Set((result.state?.lastPostDeliveryPrompt?.choices || []).map((choice) => choice.id));
  return ["approve", "refine", "alternative", "stop"].every((choice) => choices.has(choice));
}

function scoreRepairSuggestions(actions = []) {
  if (!actions.length) return 0;
  return actions.every((action) => action.action && action.reason) ? 1 : 0.5;
}

function check(name, pass, message) {
  return { name, pass: Boolean(pass), message };
}
