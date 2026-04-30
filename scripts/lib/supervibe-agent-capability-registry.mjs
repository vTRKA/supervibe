const BUILT_IN_AGENT_CAPABILITIES = Object.freeze([
  profile("stack-developer", {
    stacks: ["javascript", "typescript", "node", "web"],
    moduleTypes: ["CORE_LOGIC", "ENTRY_POINT", "UTILITY", "INTEGRATION"],
    riskLevels: ["low", "medium"],
    testTypes: ["unit", "integration", "deterministic"],
    integration: true,
    reviewer: false,
    worktree: true,
  }),
  profile("quality-gate-reviewer", {
    moduleTypes: ["CORE_LOGIC", "INTEGRATION", "UI_COMPONENT", "DOCUMENTATION"],
    riskLevels: ["low", "medium", "high"],
    testTypes: ["unit", "integration", "browser", "trace"],
    reviewer: true,
    worktree: false,
  }),
  profile("code-reviewer", {
    moduleTypes: ["CORE_LOGIC", "ENTRY_POINT", "UTILITY"],
    riskLevels: ["low", "medium"],
    testTypes: ["unit", "trace"],
    refactorScope: ["small", "medium"],
    reviewer: true,
    worktree: false,
  }),
  profile("security-auditor", {
    moduleTypes: ["INTEGRATION", "INFRASTRUCTURE", "ENTRY_POINT"],
    riskLevels: ["medium", "high"],
    testTypes: ["security", "integration"],
    reviewer: true,
    worktree: false,
  }),
  profile("ux-ui-designer", {
    moduleTypes: ["UI_COMPONENT"],
    riskLevels: ["low", "medium"],
    testTypes: ["browser"],
    ui: true,
    browser: true,
    reviewer: false,
    worktree: true,
  }),
  profile("devops-sre", {
    moduleTypes: ["INFRASTRUCTURE"],
    riskLevels: ["medium", "high"],
    testTypes: ["runtime", "integration"],
    integration: true,
    releasePrep: true,
    reviewer: false,
    worktree: true,
  }),
  profile("repo-researcher", {
    moduleTypes: ["DOCUMENTATION", "CORE_LOGIC"],
    riskLevels: ["low", "medium"],
    testTypes: ["read-only"],
    docs: true,
    reviewer: false,
    worktree: false,
  }),
]);

export function createAgentCapabilityRegistry({ builtIns = BUILT_IN_AGENT_CAPABILITIES, overrides = [], priorOutcomes = [] } = {}) {
  const agents = new Map();
  for (const agent of builtIns || []) agents.set(agent.agentId, normalizeAgentProfile(agent));
  for (const override of overrides || []) {
    const existing = agents.get(override.agentId) || profile(override.agentId, {});
    agents.set(override.agentId, normalizeAgentProfile({
      ...existing,
      ...override,
      capabilities: { ...(existing.capabilities || {}), ...(override.capabilities || {}) },
      source: override.source || "local-override",
    }));
  }
  return {
    schemaVersion: 1,
    agents: [...agents.values()],
    priorOutcomes: priorOutcomes.map(redactOutcome),
  };
}

export function matchAgentForTask(task = {}, { registry = createAgentCapabilityRegistry(), role = "worker", minScore = 2 } = {}) {
  const candidates = (registry.agents || [])
    .filter((agent) => role === "reviewer" ? agent.capabilities.reviewer === true : agent.capabilities.reviewer !== true)
    .map((agent) => scoreAgent(agent, task, registry.priorOutcomes || []))
    .sort((a, b) => b.score - a.score || a.agent.agentId.localeCompare(b.agent.agentId));
  const best = candidates[0];
  if (!best || best.score < minScore) {
    return {
      status: "manual-assignment-required",
      manualAssignmentRequired: true,
      score: best?.score || 0,
      agent: best?.agent || null,
      reasons: best?.reasons || ["no confident capability match"],
      alternatives: candidates.slice(0, 3),
    };
  }
  return {
    status: "matched",
    manualAssignmentRequired: false,
    agent: best.agent,
    score: best.score,
    reasons: best.reasons,
    alternatives: candidates.slice(1, 4).map((candidate) => ({
      agentId: candidate.agent.agentId,
      score: candidate.score,
      rejectedBecause: candidate.reasons.join("; ") || "lower capability score",
    })),
  };
}

export function recordOutcomeSignal(registry = createAgentCapabilityRegistry(), outcome = {}) {
  return {
    ...registry,
    priorOutcomes: [
      ...(registry.priorOutcomes || []),
      redactOutcome(outcome),
    ],
  };
}

export function formatCapabilityMatch(match = {}) {
  return [
    "SUPERVIBE_CAPABILITY_MATCH",
    `STATUS: ${match.status || "unknown"}`,
    `AGENT: ${match.agent?.agentId || "manual"}`,
    `SCORE: ${match.score || 0}`,
    `REASONS: ${(match.reasons || []).join("; ") || "none"}`,
  ].join("\n");
}

function scoreAgent(agent, task, priorOutcomes = []) {
  const cap = agent.capabilities || {};
  const reasons = [];
  let score = agent.source === "local-override" ? 1 : 0;
  const moduleType = task.moduleType || inferModuleType(task);
  const risk = task.policyRiskLevel || "low";
  const stack = task.stack || "node";
  const testType = inferTestType(task);

  if (includes(cap.moduleTypes, moduleType)) { score += 3; reasons.push(`module=${moduleType}`); }
  if (includes(cap.riskLevels, risk)) { score += 1.5; reasons.push(`risk=${risk}`); }
  if (includes(cap.stacks, stack)) { score += 1.5; reasons.push(`stack=${stack}`); }
  if (includes(cap.testTypes, testType)) { score += 1; reasons.push(`test=${testType}`); }
  if (/integration|api|mcp/i.test(`${task.category} ${task.goal}`) && cap.integration) { score += 1; reasons.push("integration capable"); }
  if (/ui|browser|component|design/i.test(`${task.category} ${task.goal}`) && (cap.ui || cap.browser)) { score += 1; reasons.push("ui/browser capable"); }
  if (/refactor|rename|move/i.test(`${task.category} ${task.goal}`) && cap.refactorScope?.length) { score += 1; reasons.push("refactor capable"); }
  if (task.worktreeRequired && cap.worktree) { score += 0.5; reasons.push("worktree capable"); }
  const prior = priorOutcomes.filter((outcome) => outcome.agentId === agent.agentId);
  if (prior.length) {
    const avg = prior.reduce((sum, outcome) => sum + Number(outcome.score || 0), 0) / prior.length;
    score += Math.min(1, avg / 10);
    reasons.push(`prior-outcome=${avg.toFixed(1)}`);
  }
  return { agent, score: Number(score.toFixed(2)), reasons };
}

function profile(agentId, capabilities) {
  return { agentId, capabilities, source: "built-in" };
}

function normalizeAgentProfile(agent = {}) {
  return {
    agentId: agent.agentId,
    source: agent.source || "built-in",
    capabilities: {
      stacks: asArray(agent.capabilities?.stacks),
      moduleTypes: asArray(agent.capabilities?.moduleTypes),
      riskLevels: asArray(agent.capabilities?.riskLevels),
      testTypes: asArray(agent.capabilities?.testTypes),
      ui: Boolean(agent.capabilities?.ui),
      browser: Boolean(agent.capabilities?.browser),
      integration: Boolean(agent.capabilities?.integration),
      refactorScope: asArray(agent.capabilities?.refactorScope),
      docs: Boolean(agent.capabilities?.docs),
      releasePrep: Boolean(agent.capabilities?.releasePrep),
      reviewer: Boolean(agent.capabilities?.reviewer),
      worktree: Boolean(agent.capabilities?.worktree),
    },
  };
}

function redactOutcome(outcome = {}) {
  return {
    agentId: outcome.agentId,
    taskId: outcome.taskId,
    score: Number(outcome.score || 0),
    outcome: outcome.outcome || "unknown",
    recordedAt: outcome.recordedAt || new Date().toISOString(),
  };
}

function inferModuleType(task = {}) {
  const text = `${task.category || ""} ${task.goal || ""}`.toLowerCase();
  if (/ui|browser|component|design/.test(text)) return "UI_COMPONENT";
  if (/integration|api|mcp|external/.test(text)) return "INTEGRATION";
  if (/doc|readme/.test(text)) return "DOCUMENTATION";
  if (/infra|deploy|runtime|docker/.test(text)) return "INFRASTRUCTURE";
  if (/cli|command|entry/.test(text)) return "ENTRY_POINT";
  return "CORE_LOGIC";
}

function inferTestType(task = {}) {
  const text = `${task.category || ""} ${task.goal || ""} ${(task.verificationCommands || []).join(" ")}`.toLowerCase();
  if (/browser|playwright|preview/.test(text)) return "browser";
  if (/integration|api|mcp/.test(text)) return "integration";
  if (/security/.test(text)) return "security";
  if (/runtime|docker/.test(text)) return "runtime";
  if (/trace|refactor|caller|callee/.test(text)) return "trace";
  return "unit";
}

function includes(values = [], value) {
  return values.includes(value);
}

function asArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value === undefined || value === null || value === "") return [];
  return [value];
}
