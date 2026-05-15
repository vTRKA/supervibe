export const HOST_NEUTRAL_CAPABILITY_NAMES = Object.freeze([
  "browser",
  "context7",
  "figma",
  "firecrawl",
  "openai-docs",
  "tauri",
]);

const BUILT_IN_AGENT_CAPABILITIES = Object.freeze([
  profile("stack-developer", {
    stacks: ["javascript", "typescript", "node", "web"],
    moduleTypes: ["CORE_LOGIC", "ENTRY_POINT", "UTILITY", "INTEGRATION"],
    riskLevels: ["low", "medium"],
    testTypes: ["unit", "integration", "deterministic"],
    capabilityNames: ["context7", "openai-docs"],
    integration: true,
    reviewer: false,
    worktree: true,
  }),
  profile("quality-gate-reviewer", {
    moduleTypes: ["CORE_LOGIC", "INTEGRATION", "UI_COMPONENT", "DOCUMENTATION"],
    riskLevels: ["low", "medium", "high"],
    testTypes: ["unit", "integration", "browser", "trace"],
    capabilityNames: ["browser"],
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
    capabilityNames: ["context7", "firecrawl"],
    reviewer: true,
    worktree: false,
  }),
  profile("prompt-ai-engineer", {
    moduleTypes: ["AI_PROMPT", "INTEGRATION", "DOCUMENTATION"],
    riskLevels: ["low", "medium", "high"],
    testTypes: ["eval", "security", "trace"],
    capabilityNames: ["context7", "openai-docs"],
    integration: true,
    reviewer: false,
    worktree: true,
  }),
  profile("ux-ui-designer", {
    moduleTypes: ["UI_COMPONENT"],
    riskLevels: ["low", "medium"],
    testTypes: ["browser"],
    capabilityNames: ["figma", "firecrawl", "browser"],
    ui: true,
    browser: true,
    reviewer: false,
    worktree: true,
  }),
  profile("devops-sre", {
    moduleTypes: ["INFRASTRUCTURE"],
    riskLevels: ["medium", "high"],
    testTypes: ["runtime", "integration"],
    capabilityNames: ["firecrawl"],
    integration: true,
    releasePrep: true,
    reviewer: false,
    worktree: true,
  }),
  profile("network-router-engineer", {
    moduleTypes: ["NETWORK", "INFRASTRUCTURE"],
    riskLevels: ["medium", "high"],
    testTypes: ["read-only", "runtime"],
    integration: true,
    releasePrep: false,
    reviewer: false,
    worktree: false,
  }),
  profile("repo-researcher", {
    moduleTypes: ["DOCUMENTATION", "CORE_LOGIC"],
    riskLevels: ["low", "medium"],
    testTypes: ["read-only"],
    capabilityNames: ["context7", "firecrawl", "openai-docs"],
    docs: true,
    reviewer: false,
    worktree: false,
  }),
  profile("tauri-ui-designer", {
    stacks: ["tauri", "desktop", "web"],
    moduleTypes: ["UI_COMPONENT", "DOCUMENTATION"],
    riskLevels: ["low", "medium", "high"],
    testTypes: ["browser", "runtime", "trace"],
    capabilityNames: ["tauri", "figma", "browser"],
    ui: true,
    browser: true,
    reviewer: false,
    worktree: true,
  }),
  profile("tauri-rust-engineer", {
    stacks: ["tauri", "rust", "react", "typescript"],
    moduleTypes: ["CORE_LOGIC", "INTEGRATION", "INFRASTRUCTURE", "UI_COMPONENT"],
    riskLevels: ["low", "medium", "high"],
    testTypes: ["unit", "integration", "runtime", "browser"],
    capabilityNames: ["tauri", "browser", "context7"],
    integration: true,
    browser: true,
    worktree: true,
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
  const stack = task.stack || inferStack(task);
  const testType = inferTestType(task);
  const requiredCapabilityNames = inferRequiredCapabilityNames(task);

  if (includes(cap.moduleTypes, moduleType)) { score += 3; reasons.push(`module=${moduleType}`); }
  if (includes(cap.riskLevels, risk)) { score += 1.5; reasons.push(`risk=${risk}`); }
  if (includes(cap.stacks, stack)) { score += 1.5; reasons.push(`stack=${stack}`); }
  if (includes(cap.testTypes, testType)) { score += 1; reasons.push(`test=${testType}`); }
  const matchedCapabilityNames = requiredCapabilityNames.filter((name) => includes(cap.capabilityNames, name));
  if (matchedCapabilityNames.length) {
    score += matchedCapabilityNames.length * 2;
    reasons.push(`capability=${matchedCapabilityNames.join(",")}`);
  }
  if (/integration|api|mcp/i.test(`${task.category} ${task.goal}`) && cap.integration) { score += 1; reasons.push("integration capable"); }
  if (/prompt|intent|router|agent instruction|system instruction|eval/i.test(`${task.category} ${task.goal}`) && cap.moduleTypes?.includes("AI_PROMPT")) { score += 2; reasons.push("prompt capable"); }
  if (/router|vpn|wifi|wi-fi|network|firewall|dns|dhcp/i.test(`${task.category} ${task.goal}`) && cap.moduleTypes?.includes("NETWORK")) { score += 2; reasons.push("network capable"); }
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
  const stacks = asArray(agent.capabilities?.stacks);
  const capabilityNames = normalizeCapabilityNames([
    ...asArray(agent.capabilities?.capabilityNames),
    ...asArray(agent.capabilities?.hostCapabilities),
    ...(agent.capabilities?.browser ? ["browser"] : []),
    ...(stacks.includes("tauri") ? ["tauri"] : []),
  ]);
  return {
    agentId: agent.agentId,
    source: agent.source || "built-in",
    capabilities: {
      stacks,
      moduleTypes: asArray(agent.capabilities?.moduleTypes),
      riskLevels: asArray(agent.capabilities?.riskLevels),
      testTypes: asArray(agent.capabilities?.testTypes),
      capabilityNames,
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
  if (/prompt|intent|agent instruction|system instruction|eval|llm|openai/.test(text)) return "AI_PROMPT";
  if (/router|vpn|wifi|wi-fi|network|firewall|dns|dhcp/.test(text)) return "NETWORK";
  if (/integration|api|mcp|external/.test(text)) return "INTEGRATION";
  if (/doc|readme/.test(text)) return "DOCUMENTATION";
  if (/infra|deploy|runtime|docker/.test(text)) return "INFRASTRUCTURE";
  if (/cli|command|entry/.test(text)) return "ENTRY_POINT";
  return "CORE_LOGIC";
}

function inferStack(task = {}) {
  const text = taskText(task);
  if (/tauri|src-tauri/.test(text)) return "tauri";
  if (/rust|cargo/.test(text)) return "rust";
  if (/next.js|nextjs/.test(text)) return "nextjs";
  if (/react/.test(text)) return "react";
  return "node";
}

function inferTestType(task = {}) {
  const text = `${task.category || ""} ${task.goal || ""} ${(task.verificationCommands || []).join(" ")}`.toLowerCase();
  if (/browser|playwright|preview/.test(text)) return "browser";
  if (/tauri|desktop|webview/.test(text)) return "runtime";
  if (/integration|api|mcp/.test(text)) return "integration";
  if (/security/.test(text)) return "security";
  if (/prompt|intent|eval|red-team/.test(text)) return "eval";
  if (/router|vpn|wifi|wi-fi|network|firewall|dns|dhcp|diagnostic/.test(text)) return "read-only";
  if (/runtime|docker/.test(text)) return "runtime";
  if (/trace|refactor|caller|callee/.test(text)) return "trace";
  return "unit";
}

function inferRequiredCapabilityNames(task = {}) {
  const explicit = [
    ...asArray(task.capabilityNames),
    ...asArray(task.hostCapabilities),
    ...asArray(task.requiredCapabilities),
    ...asArray(task.requiredHostCapabilities),
    task.requiredCapability,
    task.hostCapability,
    task.mcpCapability,
  ];
  const inferred = [];
  const text = taskText(task);
  if (/figma/.test(text)) inferred.push("figma");
  if (/firecrawl|web-crawl|crawl|scrap|competitor|website reference/.test(text)) inferred.push("firecrawl");
  if (/browser|playwright|preview|screenshot|visual evidence/.test(text)) inferred.push("browser");
  if (/context7|library docs|current docs|official docs|api docs/.test(text)) inferred.push("context7");
  if (/openai-docs|openaideveloperdocs|openai developer|openai api|codex docs/.test(text)) inferred.push("openai-docs");
  if (/tauri|src-tauri|webview|desktop app/.test(text)) inferred.push("tauri");
  return normalizeCapabilityNames([...explicit, ...inferred]);
}

export function normalizeCapabilityNames(values = []) {
  return unique(asArray(values).flatMap((value) => {
    const normalized = normalizeCapabilityName(value);
    return normalized ? [normalized] : [];
  })).sort();
}

function normalizeCapabilityName(value) {
  const original = String(value || "").trim();
  if (!original) return null;
  const lower = original.replace(/_/g, "-").replace(/\s+/g, "-").toLowerCase();
  if (lower === "browser" || lower.includes("playwright")) return "browser";
  if (lower === "context7" || lower.includes("context7")) return "context7";
  if (lower === "figma" || lower.includes("figma")) return "figma";
  if (lower === "firecrawl" || lower.includes("firecrawl")) return "firecrawl";
  if (lower === "openai-docs" || lower.includes("openaideveloperdocs") || lower.includes("openai-developer-doc")) return "openai-docs";
  if (lower === "tauri" || lower.includes("src-tauri") || lower.includes("tauri-mcp")) return "tauri";
  return null;
}

function taskText(task = {}) {
  return [
    task.category,
    task.goal,
    task.title,
    task.stack,
    task.target,
    task.requiredAgentCapability,
    task.filesTouched?.join?.(" "),
    task.fileImpact?.join?.(" "),
    task.targetFiles?.join?.(" "),
    task.verificationCommands?.join?.(" "),
  ].filter(Boolean).join(" ").toLowerCase();
}

function includes(values = [], value) {
  return values.includes(value);
}

function asArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
