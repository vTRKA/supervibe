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
  ], {
    dynamicAgentSelectors: ["changed-artifact-specialists", "low-risk-fast-path"],
    lowRiskRequiredAgentIds: ["supervibe-orchestrator", "quality-gate-reviewer"],
  }),
  profile("/supervibe-audit", [
    "supervibe-orchestrator",
    "repo-researcher",
    "memory-curator",
    "quality-gate-reviewer",
  ], {
    dynamicAgentSelectors: ["audit-domain-specialists"],
    immediateAgentIds: ["supervibe-orchestrator"],
    stageGate: "audit-maturity",
    stageGateCommand: "node <resolved-supervibe-plugin-root>/scripts/supervibe-agent-maturity.mjs",
    stageGateReason: "Audit and 10/10 maturity claims must pass strict receipts, host-agent telemetry, Code RAG/CodeGraph readiness, specialist-question quality, and continuation gates before completion claims.",
  }),
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
  ], {
    dynamicAgentSelectors: ["target-platform-designers", "competitive-design-researcher"],
    immediateAgentIds: ["supervibe-orchestrator"],
    stageGate: "design-wizard",
    stageGateCommand: "node <resolved-supervibe-plugin-root>/scripts/design-agent-plan.mjs --status --plan-writes --slug <slug>",
    stageGateReason: "Stage 0 wizard gates collect mode, viewport, and preference coverage before specialist design agents can produce durable artifacts.",
  }),
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
  availableAgentSources = null,
  extraRequiredAgentIds = [],
  hostAdapterId = null,
  enforceHostProof = false,
  workflowContext = {},
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
  const genesisBootstrapPhase = profile.commandId === "/supervibe-genesis"
    && (
      workflowContext.bootstrapPreAgent === true
      || workflowContext.dryRun === true
      || workflowContext.apply === true
      || workflowContext.generateApps === true
    )
    && workflowContext.verifyAgents !== true;
  const adaptDryRunPhase = profile.commandId === "/supervibe-adapt"
    && workflowContext.dryRun === true
    && workflowContext.apply !== true
    && workflowContext.verifyAgents !== true;
  const bootstrapPreAgent = genesisBootstrapPhase;
  const lowRiskFastPath = isLowRiskFastPath(profile, workflowContext);
  const requiredAgentIds = unique([
    profile.ownerAgentId,
    ...(lowRiskFastPath ? profile.lowRiskRequiredAgentIds : profile.requiredAgentIds),
    ...extraRequiredAgentIds,
  ]);
  const immediateAgentIds = normalizeImmediateAgentIds(profile, requiredAgentIds);
  const deferredAgentIds = requiredAgentIds.filter((agentId) => !immediateAgentIds.includes(agentId));
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
  const blocked = !bootstrapPreAgent && !adaptDryRunPhase && requestedMode !== "inline" && (missingAgents.length > 0 || hostProofBlocked);
  const executionMode = blocked
    ? COMMAND_AGENT_ORCHESTRATION_CONTRACT.blockedMode
    : adaptDryRunPhase
      ? "dry-run-no-agent"
    : bootstrapPreAgent
      ? "bootstrap-pre-agent"
    : requestedMode === "inline"
      ? "inline"
      : "agent-dispatch-required";
  const inlineOnly = executionMode === "inline";
  const realAgentCapable = executionMode === "agent-dispatch-required";
  const bootstrapOnly = executionMode === "bootstrap-pre-agent";
  const dryRunAgentless = executionMode === "dry-run-no-agent";
  const codexSpawnPayloads = hostDispatch?.hostAdapterId === "codex" && requestedMode !== "inline" && !bootstrapPreAgent && !dryRunAgentless
    ? buildCodexSpawnPayloads(requiredAgentIds, { commandId: profile.commandId })
    : [];

  return {
    commandId: profile.commandId,
    ownerAgentId: profile.ownerAgentId,
    agentSelectionMode: lowRiskFastPath ? "low-risk-fast-path" : "standard",
    executionMode,
    requestedExecutionMode: requestedMode,
    defaultExecutionMode: profile.defaultExecutionMode,
    requiredAgentIds,
    requiredAgentSources: agentSourcesFor(requiredAgentIds, availableAgentSources),
    immediateAgentIds,
    deferredAgentIds,
    stageGate: profile.stageGate || null,
    stageGateCommand: profile.stageGateCommand || null,
    stageGateReason: profile.stageGateReason || null,
    dynamicAgentSelectors: [...profile.dynamicAgentSelectors],
    missingAgents,
    hostDispatch,
    hostProofRequired: requestedMode !== "inline",
    hostProofBlocked,
    agentsInstalled: missingAgents.length === 0,
    hostDispatchAvailable: hostDispatch?.status === "supported",
    agentInvocationsCompleted: false,
    agentReceiptsTrusted: false,
    receiptGate: dryRunAgentless ? "not-required-for-dry-run" : bootstrapOnly ? "bootstrap-pre-agent-basic-scaffold" : realAgentCapable ? "pending-runtime-agent-receipts" : "not-applicable",
    requiredPlanFields: [...profile.requiredPlanFields],
    requiredReceiptFields: [...profile.requiredReceiptFields],
    durableWritesAllowed: bootstrapOnly && workflowContext.dryRun !== true,
    agentOwnedOutputAllowed: false,
    agentOwnedOutputRequiresReceipts: realAgentCapable,
    agentDispatchRequired: realAgentCapable,
    inlineDraftAllowed: inlineOnly,
    bootstrapPreAgentAllowed: bootstrapOnly,
    dryRunAgentlessAllowed: dryRunAgentless,
    qualityImpact: inlineOnly
      ? "Inline mode is diagnostic/dry-run only and cannot satisfy specialist output."
      : dryRunAgentless
        ? "Adapt dry-run is read-only planning and may run without real-agent receipts; apply and verify-agents remain separate gated phases."
      : bootstrapOnly
        ? "Bootstrap-pre-agent mode may install base host scaffold and state only; specialist-owned output and completion claims still require runtime agent receipts after agents are installed."
      : hostProofBlocked
        ? `Host ${hostDispatch.hostAdapterId} requires runtime invocation proof before real-agents mode can run.`
      : blocked
        ? `Missing required agents: ${missingAgents.join(", ")}.`
        : lowRiskFastPath
          ? "Low-risk workflow context selected the owner plus quality gate fast path; durable outputs still require runtime receipts for any claimed producer."
          : "Agent definitions and host dispatch are available, but durable outputs remain blocked until runtime agent receipts are issued.",
    blockedQuestion: blocked
      ? buildBlockedAgentQuestion({
        commandId: profile.commandId,
        missingAgents,
        hostDispatch,
        hostProofBlocked,
        requiredAgentIds,
      })
      : null,
    emulationPolicy: profile.emulationPolicy,
    codexSpawnPayloadRules: codexSpawnPayloads.length ? [...CODEX_SPAWN_PAYLOAD_RULES] : undefined,
    codexSpawnPayloads: codexSpawnPayloads.length ? codexSpawnPayloads : undefined,
  };
}

function buildBlockedAgentQuestion({
  commandId = "unknown",
  missingAgents = [],
  hostDispatch = null,
  hostProofBlocked = false,
  requiredAgentIds = [],
} = {}) {
  const agentSummary = missingAgents.length
    ? missingAgents.join(", ")
    : requiredAgentIds.length
      ? requiredAgentIds.join(", ")
      : "required specialists";
  const hostSummary = hostDispatch?.hostAdapterId
    ? `${hostDispatch.hostAdapterId} ${hostDispatch.nativeTool || "host dispatch"}`
    : "host dispatch";
  const blocker = hostProofBlocked
    ? `${hostSummary} proof is missing`
    : `missing agents: ${agentSummary}`;

  return {
    prompt: `Step 1/1: ${commandId} cannot claim real-agent output yet because ${blocker}. Fix dispatch, run a diagnostic draft, or stop?`,
    specialist: "supervibe-orchestrator",
    evidence: [
      `command=${commandId}`,
      `missingAgents=${missingAgents.join(",") || "none"}`,
      `hostDispatch=${hostDispatch?.status || "not-configured"}`,
    ],
    artifactImpact: "This answer decides whether durable command outputs remain blocked, agent provisioning runs, or the session stops without emulated specialist work.",
    choices: [
      {
        id: "provision-agents",
        label: missingAgents.length ? `Install missing agents for ${commandId}` : `Refresh agent availability for ${commandId}`,
        tradeoff: `Runs the provisioning path for ${agentSummary}; durable outputs stay blocked until receipts exist.`,
        recommended: missingAgents.length > 0,
      },
      {
        id: "connect-host-agents",
        label: `Connect ${hostSummary} proof`,
        tradeoff: "Use the real host invocation path and issue runtime receipts before claiming specialist output.",
        recommended: missingAgents.length === 0,
      },
      {
        id: "diagnostic-draft",
        label: `Produce a diagnostic draft for ${commandId}`,
        tradeoff: "Allows analysis only; it cannot satisfy agent-owned durable artifacts or quality claims.",
      },
      {
        id: "stop",
        label: "Stop without durable writes",
        tradeoff: "Preserves the blocker context and avoids hidden emulation or metadata churn.",
      },
    ],
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
      logCommand: "node <resolved-supervibe-plugin-root>/scripts/agent-invocation.mjs log --agent <agent-id> --host codex --host-invocation-id <returned-codex-agent-id> --task <summary> --confidence <0-10> --changed-files <paths> --risks <items> --recommendations <items> --issue-receipt --command <command-id> --stage <stage-id> --handoff-id <handoff-id> --input-evidence <paths> --output-artifacts <paths>",
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
    `AGENT_SELECTION_MODE: ${plan.agentSelectionMode || "standard"}`,
    `EXECUTION_MODE: ${plan.executionMode || "unknown"}`,
    `DEFAULT_MODE: ${plan.defaultExecutionMode || COMMAND_AGENT_ORCHESTRATION_CONTRACT.defaultExecutionMode}`,
    `DURABLE_WRITES_ALLOWED: ${plan.durableWritesAllowed === true}`,
    `RECEIPT_GATE: ${plan.receiptGate || "unknown"}`,
    `AGENTS_INSTALLED: ${plan.agentsInstalled === true}`,
    `HOST_DISPATCH_AVAILABLE: ${plan.hostDispatchAvailable === true}`,
    `AGENT_INVOCATIONS_COMPLETED: ${plan.agentInvocationsCompleted === true}`,
    `AGENT_RECEIPTS_TRUSTED: ${plan.agentReceiptsTrusted === true}`,
    `BOOTSTRAP_PRE_AGENT_ALLOWED: ${plan.bootstrapPreAgentAllowed === true}`,
    `DRY_RUN_AGENTLESS_ALLOWED: ${plan.dryRunAgentlessAllowed === true}`,
    `AGENT_OUTPUT_REQUIRES_RECEIPTS: ${plan.agentOwnedOutputRequiresReceipts === true}`,
    `REQUIRED_AGENTS: ${(plan.requiredAgentIds || []).join(", ") || "none"}`,
    `REQUIRED_AGENT_SOURCES: ${formatAgentSources(plan.requiredAgentSources)}`,
    `IMMEDIATE_AGENTS: ${(plan.immediateAgentIds || []).join(", ") || "none"}`,
    `DEFERRED_AGENTS: ${(plan.deferredAgentIds || []).join(", ") || "none"}`,
    `AGENT_STAGE_GATE: ${plan.stageGate || "none"}`,
    `AGENT_STAGE_GATE_COMMAND: ${plan.stageGateCommand || "none"}`,
    `AGENT_STAGE_GATE_REASON: ${plan.stageGateReason || "none"}`,
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
    if (plan.stageGate && plan.immediateAgentIds?.length) {
      const immediate = new Set(plan.immediateAgentIds || []);
      lines.push("CODEX_SPAWN_NOW_PAYLOADS:");
      for (const payload of plan.codexSpawnPayloads || []) {
        if (immediate.has(payload.agentId)) lines.push(`- ${payload.agentId}: ${JSON.stringify(payload.payload)}`);
      }
      lines.push("CODEX_DEFERRED_SPAWN_PAYLOADS:");
      for (const payload of plan.codexSpawnPayloads || []) {
        if (!immediate.has(payload.agentId)) lines.push(`- ${payload.agentId}: deferred until ${plan.stageGate}`);
      }
    }
    lines.push("CODEX_RECEIPT_LOG_COMMANDS:");
    for (const payload of plan.codexSpawnPayloads || []) {
      lines.push(`- ${payload.agentId}: ${payload.receipt.logCommand}`);
    }
  }
  if (plan.blockedQuestion) {
    lines.push(`BLOCKED_QUESTION: ${plan.blockedQuestion.prompt}`);
    lines.push("BLOCKED_CHOICES:");
    for (const choice of plan.blockedQuestion.choices || []) {
      const recommended = choice.recommended ? " recommended" : "";
      lines.push(`- ${choice.label}${recommended} - ${choice.tradeoff}`);
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
    for (const agentId of profile.immediateAgentIds || []) {
      if (!profile.requiredAgentIds.includes(agentId)) {
        issues.push(issue(commandId, "immediate-agent-not-required", `Immediate agent must also be required: ${agentId}`));
      }
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
    lowRiskRequiredAgentIds: Object.freeze(unique(options.lowRiskRequiredAgentIds || requiredAgentIds)),
    dynamicAgentSelectors: Object.freeze(options.dynamicAgentSelectors || []),
    immediateAgentIds: Object.freeze(options.immediateAgentIds || []),
    stageGate: options.stageGate || null,
    stageGateCommand: options.stageGateCommand || null,
    stageGateReason: options.stageGateReason || null,
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
    lowRiskRequiredAgentIds: [...(profile.lowRiskRequiredAgentIds || profile.requiredAgentIds)],
    dynamicAgentSelectors: [...profile.dynamicAgentSelectors],
    immediateAgentIds: [...(profile.immediateAgentIds || [])],
    executionModes: [...profile.executionModes],
    requiredPlanFields: [...profile.requiredPlanFields],
    requiredReceiptFields: [...profile.requiredReceiptFields],
  };
}

function isLowRiskFastPath(profile = {}, workflowContext = {}) {
  if (!profile.lowRiskRequiredAgentIds?.length) return false;
  if (workflowContext.lowRisk === true || workflowContext["low-risk"] === true) return true;
  const adds = Number(workflowContext.adds ?? workflowContext.add ?? NaN);
  const updates = Number(workflowContext.updates ?? workflowContext.update ?? NaN);
  const projectOnly = Number(workflowContext.projectOnly ?? workflowContext["project-only"] ?? NaN);
  const conflicts = Number(workflowContext.conflicts ?? workflowContext.conflict ?? NaN);
  const memoryWrites = normalizeBoolean(workflowContext.memoryWrites ?? workflowContext["memory-writes"], false);
  if ([adds, updates, projectOnly, conflicts].some((value) => !Number.isFinite(value))) return false;
  return adds === 0 && updates <= 1 && projectOnly === 0 && conflicts === 0 && memoryWrites === false;
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return fallback;
}

function agentSourcesFor(agentIds = [], availableAgentSources = null) {
  const sourceMap = availableAgentSources instanceof Map
    ? availableAgentSources
    : new Map(Object.entries(availableAgentSources || {}));
  return agentIds.map((agentId) => ({
    agentId,
    source: sourceMap.get(agentId) || "logical role",
  }));
}

function formatAgentSources(sources = []) {
  if (!sources.length) return "none";
  return sources.map((item) => `${item.agentId}=${item.source}`).join(", ");
}

function nextActionForPlan(plan = {}) {
  if (plan.executionMode === COMMAND_AGENT_ORCHESTRATION_CONTRACT.blockedMode) {
    if (plan.hostProofBlocked) return "Connect a host runtime that records invocation ids, or stop; do not emulate specialists.";
    if (plan.missingAgents?.length) return "Provision/connect the missing agents, then rebuild this plan; do not emulate specialists.";
    return "Resolve the blocked agent plan before durable work.";
  }
  if (plan.executionMode === "bootstrap-pre-agent") {
    return "Write only bootstrap scaffold/state, then rebuild the real-agent plan after installed agents are available.";
  }
  if (plan.executionMode === "dry-run-no-agent") {
    return "Run the read-only dry-run and review the plan; use apply for approved writes and verify-agents for runtime receipt proof.";
  }
  if (plan.executionMode === "inline") return "Diagnostic/dry-run only; do not claim specialist output.";
  if (plan.stageGate && plan.immediateAgentIds?.length && plan.deferredAgentIds?.length) {
    return `Invoke immediate owner agent(s) now: ${plan.immediateAgentIds.join(", ")}. Then run ${plan.stageGateCommand || "the workflow gate"}; defer staged specialist agents (${plan.deferredAgentIds.join(", ")}) until the gate unlocks their stages.`;
  }
  return "Invoke required host agents, capture invocation ids, then issue workflow receipts before completion claims.";
}

function normalizeImmediateAgentIds(profile, requiredAgentIds) {
  const configured = unique(profile.immediateAgentIds || []);
  if (configured.length === 0) return [...requiredAgentIds];
  const required = new Set(requiredAgentIds);
  return configured.filter((agentId) => required.has(agentId));
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
