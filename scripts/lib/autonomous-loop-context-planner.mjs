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
    workflowSignal: buildWorkflowSignal(task, options),
  };
  return pack;
}

export function buildWorkflowSignal(task = {}, options = {}) {
  const flow = options.workflowFlow || options.flow || null;
  const activeStep = flow?.steps?.find((step) => step.active)
    || flow?.steps?.find((step) => step.id === flow.activeId)
    || null;
  const taskId = task.id || task.itemId || null;
  const gates = relevantRecords(options.gates || [], taskId).slice(0, 8).map((gate) => ({
    gateId: gate.gateId || gate.id || null,
    taskId: gate.taskId || gate.workItemId || null,
    type: gate.type || "gate",
    status: gate.status || "unknown",
    reason: gate.reason || gate.summary || null,
  }));
  const claims = relevantRecords(options.claims || [], taskId);
  const claim = options.claim || claims.find((entry) => ["active", "claimed"].includes(normalizeStatus(entry.status))) || claims[0] || null;
  const blockers = buildSignalBlockers({ task, gates, blockers: options.blockers || [] });
  const trigger = sanitizeTriggerSignal(options.triggerSignal || options.trigger || null);
  const inferredPhase = inferPhase(task, gates);

  return {
    schemaVersion: 1,
    signalSource: options.signalSource || "autonomous-loop",
    projectId: options.projectId || options.graphId || options.runId || null,
    epicId: options.epicId || options.graphId || task.epicId || task.graphId || null,
    runId: options.runId || null,
    taskId,
    taskTitle: task.goal || task.title || taskId || null,
    taskStatus: task.status || "open",
    phase: flow?.activeId || options.phase || inferredPhase,
    phaseStatus: flow?.status || activeStep?.state || "current",
    phaseHint: activeStep?.hint || null,
    nextAction: options.nextAction || task.resumeNotes?.nextAction || "execute current task within policy boundaries",
    activeAgent: options.agentId || claim?.agentId || options.dispatch?.primaryAgentId || null,
    reviewerAgent: options.reviewerAgentId || options.dispatch?.reviewerAgentId || null,
    trigger,
    flowSteps: (flow?.steps || []).map((step) => ({
      id: step.id,
      label: step.label,
      state: step.state,
      active: Boolean(step.active),
      hint: step.hint || null,
    })),
    metrics: flow?.metrics || {
      totalTasks: options.totalTasks ?? null,
      doneTasks: options.doneTasks ?? null,
      ready: options.readyTasks ?? null,
      claimed: options.claimedTasks ?? null,
      blocked: blockers.length,
      openGates: gates.length,
    },
    claim: claim ? {
      claimId: claim.claimId || claim.id || null,
      agentId: claim.agentId || null,
      status: claim.status || "unknown",
      attemptId: claim.attemptId || null,
    } : null,
    gates,
    blockers,
  };
}

export function contextConfidenceCap(task, pack) {
  if (!pack.workflowSignal?.taskId || !pack.workflowSignal?.phase) return 8;
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

function relevantRecords(records = [], taskId = null) {
  if (!taskId) return Array.isArray(records) ? records : [];
  return (Array.isArray(records) ? records : []).filter((record) => {
    const recordTaskId = record.taskId || record.workItemId || record.itemId;
    return !recordTaskId || recordTaskId === taskId;
  });
}

function buildSignalBlockers({ task = {}, gates = [], blockers = [] } = {}) {
  const taskId = task.id || task.itemId || null;
  const explicit = (Array.isArray(blockers) ? blockers : [])
    .filter((blocker) => !taskId || !blocker.taskId || blocker.taskId === taskId)
    .map((blocker) => ({
      type: blocker.type || "blocker",
      id: blocker.id || blocker.gateId || blocker.itemId || null,
      status: blocker.status || blocker.effectiveStatus || "open",
      reason: blocker.reason || blocker.title || blocker.summary || null,
    }));
  const gateBlockers = gates
    .filter((gate) => ["open", "waiting", "blocked", "pending"].includes(normalizeStatus(gate.status)))
    .map((gate) => ({
      type: "gate",
      id: gate.gateId || gate.id || null,
      status: gate.status || "open",
      reason: gate.reason || gate.summary || null,
    }));
  const resumeBlocker = task.resumeNotes?.blocker
    ? [{ type: "resume", id: taskId, status: "blocked", reason: task.resumeNotes.blocker }]
    : [];
  return [...explicit, ...gateBlockers, ...resumeBlocker].slice(0, 8);
}

function sanitizeTriggerSignal(trigger) {
  if (!trigger || typeof trigger !== "object") return null;
  return {
    source: trigger.source || trigger.type || null,
    intent: trigger.intent || trigger.command || null,
    confidence: trigger.confidence ?? null,
    request: trigger.request ? String(trigger.request).slice(0, 240) : null,
  };
}

function inferPhase(task = {}, gates = []) {
  const status = normalizeStatus(task.status);
  if (["complete", "completed", "done", "closed"].includes(status)) {
    return gates.some((gate) => ["open", "waiting", "blocked", "pending"].includes(normalizeStatus(gate.status)))
      ? "verify"
      : "close";
  }
  if (["blocked", "policy_stopped", "budget_stopped", "command_adapter_required"].includes(status)) return "execute";
  if (["open", "ready", "in_progress", "claimed", "running"].includes(status)) return "execute";
  return "plan";
}

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}
