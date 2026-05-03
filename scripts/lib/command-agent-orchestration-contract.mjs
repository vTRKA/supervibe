export const COMMAND_AGENT_ORCHESTRATION_CONTRACT = Object.freeze({
  ownerAgentId: "supervibe-orchestrator",
  defaultExecutionMode: "real-agents",
  executionModes: Object.freeze(["real-agents", "hybrid", "inline"]),
  blockedMode: "agent-required-blocked",
  requiredPlanFields: Object.freeze(["agentPlan", "requiredAgentIds"]),
  requiredReceiptFields: Object.freeze(["hostInvocation.source", "hostInvocation.invocationId"]),
  inlineScope: "diagnostic/dry-run only",
  emulationAllowed: false,
  emulationPolicy: "Do not emulate specialist agents; command or skill receipts must not substitute for specialist output.",
  durableOutputPolicy: "blocked-without-real-agent-receipts",
});

const HOST_AGENT_DISPATCHERS = Object.freeze({
  claude: dispatcher({
    hostAdapterId: "claude",
    status: "supported",
    nativeTool: "Task",
    invocationProof: "claude-post-tool-use-hook",
    evidencePath: ".supervibe/memory/agent-invocations.jsonl",
    instructions: "Invoke every required specialist through the Claude Code Task tool using the exact subagent_type, then issue receipts with the logged invocation id.",
  }),
  codex: dispatcher({
    hostAdapterId: "codex",
    status: "supported",
    nativeTool: "spawn_agent",
    invocationProof: "codex-spawn-agent",
    evidencePath: ".supervibe/memory/agent-invocations.jsonl",
    instructions: "Invoke every required specialist through Codex spawn_agent using the generated fork-safe payloads. With fork_context=true, omit agent_type, model, and reasoning_effort; encode the Supervibe role in message, log the returned agent id, then issue receipts with hostInvocation.source=codex-spawn-agent.",
  }),
  cursor: dispatcher({
    hostAdapterId: "cursor",
    status: "requires-runtime-proof",
    nativeTool: "host-agent-dispatch",
    invocationProof: "cursor-host-trace-required",
    evidencePath: ".supervibe/memory/agent-invocations.jsonl",
    instructions: "Use Cursor-native agent dispatch only when the runtime exposes invocation proof; otherwise enter agent-required-blocked.",
  }),
  gemini: dispatcher({
    hostAdapterId: "gemini",
    status: "requires-runtime-proof",
    nativeTool: "host-agent-dispatch",
    invocationProof: "gemini-host-trace-required",
    evidencePath: ".supervibe/memory/agent-invocations.jsonl",
    instructions: "Use Gemini-native agent dispatch only when the runtime exposes invocation proof; otherwise enter agent-required-blocked.",
  }),
  opencode: dispatcher({
    hostAdapterId: "opencode",
    status: "requires-runtime-proof",
    nativeTool: "host-agent-dispatch",
    invocationProof: "opencode-host-trace-required",
    evidencePath: ".supervibe/memory/agent-invocations.jsonl",
    instructions: "Use OpenCode-native agent dispatch only when the runtime exposes invocation proof; otherwise enter agent-required-blocked.",
  }),
});

const CODEX_FORK_CONTEXT_FORBIDDEN_OVERRIDES = Object.freeze([
  "agent_type",
  "model",
  "reasoning_effort",
]);

const CODEX_SPAWN_PAYLOAD_RULES = Object.freeze([
  "fork_context=true: omit agent_type, model, reasoning_effort because Codex inherits them from the parent agent.",
  "encode Supervibe logical agent role in message, not Codex agent_type.",
  "capture the returned Codex agent id as receipt evidence before issuing workflow receipts.",
  "use fork_context=false only for compact-context spawns that intentionally need agent_type/model/reasoning_effort overrides.",
]);

const CODEX_WORKER_AGENT_PATTERNS = Object.freeze([
  /(?:^|-)builder$/,
  /(?:^|-)developer$/,
  /(?:^|-)engineer$/,
  /(?:^|-)implementer$/,
]);

const CODEX_EXECUTION_MODE_HINT_OVERRIDES = Object.freeze({
  "accessibility-reviewer": "default",
  "ai-agent-orchestrator": "default",
  "api-contract-reviewer": "default",
  "architect-reviewer": "default",
  "code-reviewer": "default",
  "competitive-design-researcher": "default",
  "copywriter": "default",
  "creative-director": "default",
  "db-reviewer": "default",
  "dependency-reviewer": "default",
  "memory-curator": "default",
  "performance-reviewer": "default",
  "product-manager": "default",
  "quality-gate-reviewer": "default",
  "repo-researcher": "default",
  "root-cause-debugger": "default",
  "rules-curator": "default",
  "security-auditor": "default",
  "security-researcher": "default",
  "supervibe-orchestrator": "default",
  "systems-analyst": "default",
  "ui-polish-reviewer": "default",
  "ux-ui-designer": "default",
  "prototype-builder": "worker",
  "presentation-deck-builder": "worker",
  "react-implementer": "worker",
  "tauri-rust-engineer": "worker",
});

const COMMAND_AGENT_PROFILES = Object.freeze(Object.fromEntries([
  profile("/supervibe", [
    "supervibe-orchestrator",
    "systems-analyst",
    "quality-gate-reviewer",
  ], { dynamicAgentSelectors: ["intent-router"] }),
  profile("/supervibe-adapt", [
    "supervibe-orchestrator",
    "repo-researcher",
    "rules-curator",
    "memory-curator",
    "quality-gate-reviewer",
  ], { dynamicAgentSelectors: ["changed-artifact-specialists"] }),
  profile("/supervibe-audit", [
    "supervibe-orchestrator",
    "repo-researcher",
    "memory-curator",
    "quality-gate-reviewer",
  ], { dynamicAgentSelectors: ["audit-domain-specialists"] }),
  profile("/supervibe-brainstorm", [
    "supervibe-orchestrator",
    "product-manager",
    "systems-analyst",
    "quality-gate-reviewer",
  ], { dynamicAgentSelectors: ["domain-specialists"] }),
  profile("/supervibe-design", [
    "supervibe-orchestrator",
    "creative-director",
    "ux-ui-designer",
    "copywriter",
    "prototype-builder",
    "accessibility-reviewer",
    "ui-polish-reviewer",
    "quality-gate-reviewer",
  ], { dynamicAgentSelectors: ["target-platform-designers", "competitive-design-researcher"] }),
  profile("/supervibe-doctor", [
    "supervibe-orchestrator",
    "repo-researcher",
    "devops-sre",
    "quality-gate-reviewer",
  ], { dynamicAgentSelectors: ["host-adapter-specialists"] }),
  profile("/supervibe-execute-plan", [
    "supervibe-orchestrator",
    "repo-researcher",
    "root-cause-debugger",
    "code-reviewer",
    "quality-gate-reviewer",
  ], { dynamicAgentSelectors: ["stack-implementers", "risk-reviewers"] }),
  profile("/supervibe-gc", [
    "supervibe-orchestrator",
    "memory-curator",
    "quality-gate-reviewer",
  ], { dynamicAgentSelectors: ["artifact-owner-agents"] }),
  profile("/supervibe-genesis", [
    "supervibe-orchestrator",
    "repo-researcher",
    "rules-curator",
    "memory-curator",
    "quality-gate-reviewer",
  ], { dynamicAgentSelectors: ["detected-stack-specialists"] }),
  profile("/supervibe-loop", [
    "supervibe-orchestrator",
    "ai-agent-orchestrator",
    "repo-researcher",
    "quality-gate-reviewer",
  ], { dynamicAgentSelectors: ["task-wave-specialists", "reviewers"] }),
  profile("/supervibe-plan", [
    "supervibe-orchestrator",
    "systems-analyst",
    "architect-reviewer",
    "quality-gate-reviewer",
  ], { dynamicAgentSelectors: ["stack-architects", "domain-specialists"] }),
  profile("/supervibe-presentation", [
    "supervibe-orchestrator",
    "presentation-director",
    "presentation-deck-builder",
    "copywriter",
    "accessibility-reviewer",
    "quality-gate-reviewer",
  ], { dynamicAgentSelectors: ["design-reviewers"] }),
  profile("/supervibe-preview", [
    "supervibe-orchestrator",
    "prototype-builder",
    "ui-polish-reviewer",
    "accessibility-reviewer",
    "quality-gate-reviewer",
  ], { dynamicAgentSelectors: ["target-platform-designers"] }),
  profile("/supervibe-score", [
    "supervibe-orchestrator",
    "quality-gate-reviewer",
  ], { dynamicAgentSelectors: ["rubric-owner-reviewers"] }),
  profile("/supervibe-security-audit", [
    "supervibe-orchestrator",
    "security-auditor",
    "security-researcher",
    "dependency-reviewer",
    "quality-gate-reviewer",
  ], { dynamicAgentSelectors: ["stack-security-specialists"] }),
  profile("/supervibe-status", [
    "supervibe-orchestrator",
    "repo-researcher",
    "quality-gate-reviewer",
  ], { dynamicAgentSelectors: ["health-domain-specialists"] }),
  profile("/supervibe-strengthen", [
    "supervibe-orchestrator",
    "rules-curator",
    "memory-curator",
    "prompt-ai-engineer",
    "quality-gate-reviewer",
  ], { dynamicAgentSelectors: ["weak-artifact-specialists"] }),
  profile("/supervibe-ui", [
    "supervibe-orchestrator",
    "ux-ui-designer",
    "accessibility-reviewer",
    "quality-gate-reviewer",
  ], { dynamicAgentSelectors: ["dashboard-domain-reviewers"] }),
  profile("/supervibe-update", [
    "supervibe-orchestrator",
    "dependency-reviewer",
    "repo-researcher",
    "quality-gate-reviewer",
  ], { dynamicAgentSelectors: ["changed-stack-specialists"] }),
].map((entry) => [entry.commandId, entry])));

export function listCommandAgentProfiles() {
  return Object.values(COMMAND_AGENT_PROFILES).map(copyCommandAgentProfile);
}

export function getCommandAgentProfile(commandId) {
  const normalized = normalizeCommandId(commandId);
  const profile = COMMAND_AGENT_PROFILES[normalized];
  return profile ? copyCommandAgentProfile(profile) : null;
}

export function buildCommandAgentPlan(commandId, {
  requestedExecutionMode,
  availableAgentIds,
  extraRequiredAgentIds = [],
  hostAdapterId = null,
  enforceHostProof = false,
} = {}) {
  const profile = getCommandAgentProfile(commandId);
  if (!profile) {
    return {
      commandId: normalizeCommandId(commandId),
      executionMode: COMMAND_AGENT_ORCHESTRATION_CONTRACT.blockedMode,
      durableWritesAllowed: false,
      agentOwnedOutputAllowed: false,
      missingProfiles: [normalizeCommandId(commandId)],
      issues: ["missing-command-agent-profile"],
    };
  }

  const requestedMode = normalizeExecutionMode(requestedExecutionMode || profile.defaultExecutionMode);
  const requiredAgentIds = unique([
    profile.ownerAgentId,
    ...profile.requiredAgentIds,
    ...extraRequiredAgentIds,
  ]);
  const available = availableAgentIds ? new Set([...availableAgentIds].map(String)) : null;
  const missingAgents = available
    ? requiredAgentIds.filter((agentId) => !available.has(agentId))
    : [];
  const hostDispatch = resolveHostAgentDispatcher(hostAdapterId);
  const hostProofBlocked = Boolean(
    enforceHostProof
      && requestedMode !== "inline"
      && hostDispatch
      && hostDispatch.status !== "supported",
  );
  const blocked = requestedMode !== "inline" && (missingAgents.length > 0 || hostProofBlocked);
  const executionMode = blocked ? COMMAND_AGENT_ORCHESTRATION_CONTRACT.blockedMode : requestedMode;
  const inlineOnly = executionMode === "inline";
  const codexSpawnPayloads = hostDispatch?.hostAdapterId === "codex" && requestedMode !== "inline"
    ? buildCodexSpawnPayloads(requiredAgentIds, { commandId: profile.commandId })
    : [];

  return {
    commandId: profile.commandId,
    ownerAgentId: profile.ownerAgentId,
    executionMode,
    requestedExecutionMode: requestedMode,
    defaultExecutionMode: profile.defaultExecutionMode,
    requiredAgentIds,
    dynamicAgentSelectors: [...profile.dynamicAgentSelectors],
    missingAgents,
    hostDispatch,
    hostProofRequired: requestedMode !== "inline",
    hostProofBlocked,
    requiredPlanFields: [...profile.requiredPlanFields],
    requiredReceiptFields: [...profile.requiredReceiptFields],
    durableWritesAllowed: executionMode === "real-agents" || executionMode === "hybrid",
    agentOwnedOutputAllowed: executionMode === "real-agents" || executionMode === "hybrid",
    agentOwnedOutputRequiresReceipts: executionMode === "real-agents" || executionMode === "hybrid",
    inlineDraftAllowed: inlineOnly,
    qualityImpact: inlineOnly
      ? "Inline mode is diagnostic/dry-run only and cannot satisfy specialist output."
      : hostProofBlocked
        ? `Host ${hostDispatch.hostAdapterId} requires runtime invocation proof before real-agents mode can run.`
        : blocked
        ? `Missing required agents: ${missingAgents.join(", ")}.`
        : "none",
    blockedQuestion: blocked
      ? {
        prompt: "Required real agents or host invocation proof are unavailable. Choose provision agents, connect host agents, or stop.",
        choices: ["provision-agents", "connect-host-agents", "stop"],
      }
      : null,
    emulationPolicy: profile.emulationPolicy,
    codexSpawnPayloadRules: codexSpawnPayloads.length ? [...CODEX_SPAWN_PAYLOAD_RULES] : undefined,
    codexSpawnPayloads: codexSpawnPayloads.length ? codexSpawnPayloads : undefined,
  };
}

function buildCodexSpawnPayloads(requiredAgentIds = [], { commandId = "unknown" } = {}) {
  return unique(requiredAgentIds).map((agentId) => buildCodexSpawnPayload(agentId, { commandId }));
}

function buildCodexSpawnPayload(agentId, { commandId = "unknown" } = {}) {
  const normalizedAgentId = String(agentId || "").trim();
  const normalizedCommandId = normalizeCommandId(commandId) || "unknown";
  const message = [
    `You are acting as the Supervibe required specialist agent \`${normalizedAgentId}\` for \`${normalizedCommandId}\`.`,
    "Use the installed Supervibe agent instructions for this logical role when available.",
    "This is a real Codex spawn_agent invocation; Do not claim inline emulation or substitute skill-only output.",
    "Return a typed output contract: changedFiles, risks, recommendations, artifact paths, decisions, blockers, confidence score, and receipt-ready evidence for the orchestrator.",
  ].join(" ");

  return {
    agentId: normalizedAgentId,
    codexExecutionModeHint: resolveCodexExecutionModeHint(normalizedAgentId),
    forkContext: true,
    forbiddenWhenForked: [...CODEX_FORK_CONTEXT_FORBIDDEN_OVERRIDES],
    payload: {
      fork_context: true,
      message,
    },
    receipt: {
      hostInvocationSource: "codex-spawn-agent",
      logCommand: "node <resolved-supervibe-plugin-root>/scripts/agent-invocation.mjs log --agent <agent-id> --host codex --host-invocation-id <returned-codex-agent-id> --task <summary> --confidence <0-10> --changed-files <paths> --risks <items> --recommendations <items>",
      structuredOutput: ".supervibe/artifacts/_agent-outputs/<invocation-id>/agent-output.json",
    },
  };
}

function resolveCodexExecutionModeHint(agentId) {
  const normalizedAgentId = String(agentId || "").trim();
  if (!normalizedAgentId) return "default";
  const override = CODEX_EXECUTION_MODE_HINT_OVERRIDES[normalizedAgentId];
  if (override) return override;
  return CODEX_WORKER_AGENT_PATTERNS.some((pattern) => pattern.test(normalizedAgentId))
    ? "worker"
    : "default";
}

export function resolveHostAgentDispatcher(hostAdapterId) {
  const normalized = String(hostAdapterId || "").trim().toLowerCase();
  if (!normalized) return null;
  const dispatcherConfig = HOST_AGENT_DISPATCHERS[normalized];
  return dispatcherConfig ? copyDispatcher(dispatcherConfig) : dispatcher({
    hostAdapterId: normalized,
    status: "unsupported",
    nativeTool: "unknown",
    invocationProof: "unknown",
    evidencePath: ".supervibe/memory/agent-invocations.jsonl",
    instructions: "Host adapter has no registered real-agent dispatch contract; enter agent-required-blocked.",
  });
}

export function formatCommandAgentPlan(plan = {}) {
  const lines = [
    "SUPERVIBE_COMMAND_AGENT_PLAN",
    `COMMAND: ${plan.commandId || "unknown"}`,
    `OWNER_AGENT: ${plan.ownerAgentId || "none"}`,
    `EXECUTION_MODE: ${plan.executionMode || "unknown"}`,
    `DEFAULT_MODE: ${plan.defaultExecutionMode || COMMAND_AGENT_ORCHESTRATION_CONTRACT.defaultExecutionMode}`,
    `DURABLE_WRITES_ALLOWED: ${plan.durableWritesAllowed === true}`,
    `AGENT_OUTPUT_REQUIRES_RECEIPTS: ${plan.agentOwnedOutputRequiresReceipts === true}`,
    `REQUIRED_AGENTS: ${(plan.requiredAgentIds || []).join(", ") || "none"}`,
    `DYNAMIC_SELECTORS: ${(plan.dynamicAgentSelectors || []).join(", ") || "none"}`,
    `MISSING_AGENTS: ${(plan.missingAgents || []).join(", ") || "none"}`,
    `HOST_DISPATCH: ${plan.hostDispatch?.hostAdapterId || "unspecified"}:${plan.hostDispatch?.status || "not-checked"}`,
    `HOST_TOOL: ${plan.hostDispatch?.nativeTool || "unspecified"}`,
    `HOST_PROOF: ${plan.hostDispatch?.invocationProof || "unspecified"}`,
    `HOST_EVIDENCE: ${plan.hostDispatch?.evidencePath || "unspecified"}`,
    `QUALITY_IMPACT: ${plan.qualityImpact || "none"}`,
    `EMULATION_ALLOWED: false`,
  ];
  if (plan.codexSpawnPayloadRules?.length) {
    lines.push("CODEX_SPAWN_PAYLOAD_RULES:");
    for (const rule of plan.codexSpawnPayloadRules) {
      lines.push(`- ${rule}`);
    }
    lines.push("CODEX_ROLE_EXECUTION_MODES:");
    for (const payload of plan.codexSpawnPayloads || []) {
      lines.push(`- ${payload.agentId}: ${payload.codexExecutionModeHint} (hint only; do not pass as agent_type when fork_context=true)`);
    }
    lines.push("CODEX_SPAWN_PAYLOADS:");
    for (const payload of plan.codexSpawnPayloads || []) {
      lines.push(`- ${payload.agentId}: ${JSON.stringify(payload.payload)}`);
    }
    lines.push("CODEX_RECEIPT_LOG_COMMANDS:");
    for (const payload of plan.codexSpawnPayloads || []) {
      lines.push(`- ${payload.agentId}: ${payload.receipt.logCommand}`);
    }
  }
  lines.push(`NEXT: ${nextActionForPlan(plan)}`);
  return lines.join("\n");
}

export function validateCommandAgentProfiles({
  commandIds = Object.keys(COMMAND_AGENT_PROFILES),
  availableAgentIds,
} = {}) {
  const issues = [];
  const available = availableAgentIds ? new Set([...availableAgentIds].map(String)) : null;
  const normalizedCommandIds = [...new Set(commandIds.map(normalizeCommandId))].sort();

  for (const commandId of normalizedCommandIds) {
    const profile = COMMAND_AGENT_PROFILES[commandId];
    if (!profile) {
      issues.push(issue(commandId, "missing-command-agent-profile", "Published command has no agent profile."));
      continue;
    }
    if (profile.ownerAgentId !== COMMAND_AGENT_ORCHESTRATION_CONTRACT.ownerAgentId) {
      issues.push(issue(commandId, "wrong-owner-agent", "Command owner must be supervibe-orchestrator."));
    }
    if (profile.defaultExecutionMode !== "real-agents") {
      issues.push(issue(commandId, "non-real-agent-default", "Command defaultExecutionMode must be real-agents."));
    }
    if (!profile.requiredAgentIds.includes(profile.ownerAgentId)) {
      issues.push(issue(commandId, "missing-owner-in-required-agents", "requiredAgentIds must include the owner agent."));
    }
    if (new Set(profile.requiredAgentIds).size !== profile.requiredAgentIds.length) {
      issues.push(issue(commandId, "duplicate-required-agent", "requiredAgentIds must not contain duplicates."));
    }
    if (profile.emulationAllowed !== false || !/Do not emulate/i.test(profile.emulationPolicy)) {
      issues.push(issue(commandId, "emulation-not-forbidden", "Specialist emulation must be explicitly forbidden."));
    }
    if (profile.inlineScope !== COMMAND_AGENT_ORCHESTRATION_CONTRACT.inlineScope) {
      issues.push(issue(commandId, "inline-scope-not-diagnostic", "inline scope must be diagnostic/dry-run only."));
    }
    if (available) {
      for (const agentId of profile.requiredAgentIds) {
        if (!available.has(agentId)) {
          issues.push(issue(commandId, "unknown-required-agent", `Required agent is not present: ${agentId}`));
        }
      }
    }
  }

  for (const commandId of Object.keys(COMMAND_AGENT_PROFILES)) {
    if (!normalizedCommandIds.includes(commandId)) {
      issues.push(issue(commandId, "profile-without-command", "Agent profile exists for an unpublished command."));
    }
  }

  return {
    pass: issues.length === 0,
    checked: normalizedCommandIds.length,
    issues,
  };
}

export function copyCommandAgentContract(contract = COMMAND_AGENT_ORCHESTRATION_CONTRACT) {
  return {
    ...contract,
    executionModes: [...(contract.executionModes || [])],
    requiredPlanFields: [...(contract.requiredPlanFields || [])],
    requiredReceiptFields: [...(contract.requiredReceiptFields || [])],
  };
}

function profile(commandId, requiredAgentIds, options = {}) {
  return Object.freeze({
    commandId,
    ownerAgentId: COMMAND_AGENT_ORCHESTRATION_CONTRACT.ownerAgentId,
    defaultExecutionMode: COMMAND_AGENT_ORCHESTRATION_CONTRACT.defaultExecutionMode,
    requiredAgentIds: Object.freeze(unique(requiredAgentIds)),
    dynamicAgentSelectors: Object.freeze(options.dynamicAgentSelectors || []),
    executionModes: COMMAND_AGENT_ORCHESTRATION_CONTRACT.executionModes,
    blockedMode: COMMAND_AGENT_ORCHESTRATION_CONTRACT.blockedMode,
    requiredPlanFields: COMMAND_AGENT_ORCHESTRATION_CONTRACT.requiredPlanFields,
    requiredReceiptFields: COMMAND_AGENT_ORCHESTRATION_CONTRACT.requiredReceiptFields,
    inlineScope: COMMAND_AGENT_ORCHESTRATION_CONTRACT.inlineScope,
    emulationAllowed: COMMAND_AGENT_ORCHESTRATION_CONTRACT.emulationAllowed,
    emulationPolicy: COMMAND_AGENT_ORCHESTRATION_CONTRACT.emulationPolicy,
    durableOutputPolicy: COMMAND_AGENT_ORCHESTRATION_CONTRACT.durableOutputPolicy,
  });
}

function dispatcher(fields) {
  return Object.freeze({ ...fields });
}

function copyDispatcher(dispatcherConfig) {
  return { ...dispatcherConfig };
}

function copyCommandAgentProfile(profile) {
  return {
    ...profile,
    requiredAgentIds: [...profile.requiredAgentIds],
    dynamicAgentSelectors: [...profile.dynamicAgentSelectors],
    executionModes: [...profile.executionModes],
    requiredPlanFields: [...profile.requiredPlanFields],
    requiredReceiptFields: [...profile.requiredReceiptFields],
  };
}

function nextActionForPlan(plan = {}) {
  if (plan.executionMode === COMMAND_AGENT_ORCHESTRATION_CONTRACT.blockedMode) {
    if (plan.hostProofBlocked) return "Connect a host runtime that records invocation ids, or stop; do not emulate specialists.";
    if (plan.missingAgents?.length) return "Provision/connect the missing agents, then rebuild this plan; do not emulate specialists.";
    return "Resolve the blocked agent plan before durable work.";
  }
  if (plan.executionMode === "inline") return "Diagnostic/dry-run only; do not claim specialist output.";
  return "Invoke required host agents, capture invocation ids, then issue workflow receipts before completion claims.";
}

function normalizeCommandId(commandId) {
  const value = String(commandId || "").trim();
  if (!value) return "";
  return value.startsWith("/") ? value : `/${value}`;
}

function normalizeExecutionMode(mode) {
  const value = String(mode || "").trim();
  if (COMMAND_AGENT_ORCHESTRATION_CONTRACT.executionModes.includes(value)) return value;
  if (value === COMMAND_AGENT_ORCHESTRATION_CONTRACT.blockedMode) return value;
  return COMMAND_AGENT_ORCHESTRATION_CONTRACT.defaultExecutionMode;
}

function issue(commandId, code, message) {
  return { commandId, code, message };
}

function unique(values) {
  return [...new Set(values.filter(Boolean).map(String))];
}
