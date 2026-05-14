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

export const COMMAND_AGENT_SELECTOR_INPUT_FIELDS = Object.freeze([
  "intent",
  "stackTags",
  "riskDomains",
  "artifactType",
  "stage",
]);

export const REGULATED_DOMAIN_REVIEWER_GATES = Object.freeze({
  finance: regulatedGate("finance", [
    "payments-billing-architect",
    "privacy-compliance-architect",
    "security-auditor",
    "release-governance-reviewer",
  ], [
    "domain-evidence",
    "privacy-risk-evidence",
    "payment-or-billing-impact",
    "rollback-plan",
  ]),
  fintech: regulatedGate("fintech", [
    "payments-billing-architect",
    "privacy-compliance-architect",
    "security-auditor",
    "release-governance-reviewer",
  ], [
    "domain-evidence",
    "privacy-risk-evidence",
    "payment-or-billing-impact",
    "rollback-plan",
  ]),
  health: regulatedGate("health", [
    "privacy-compliance-architect",
    "security-auditor",
    "release-governance-reviewer",
  ], [
    "domain-evidence",
    "privacy-risk-evidence",
    "safety-impact",
    "rollback-plan",
  ]),
  medical: regulatedGate("medical", [
    "privacy-compliance-architect",
    "security-auditor",
    "release-governance-reviewer",
  ], [
    "domain-evidence",
    "privacy-risk-evidence",
    "safety-impact",
    "rollback-plan",
  ]),
  legal: regulatedGate("legal", [
    "privacy-compliance-architect",
    "security-auditor",
    "release-governance-reviewer",
  ], [
    "domain-evidence",
    "privacy-risk-evidence",
    "legal-risk-boundary",
    "rollback-plan",
  ]),
  government: regulatedGate("government", [
    "privacy-compliance-architect",
    "security-auditor",
    "release-governance-reviewer",
  ], [
    "domain-evidence",
    "privacy-risk-evidence",
    "public-sector-compliance-boundary",
    "rollback-plan",
  ]),
  security: regulatedGate("security", [
    "security-auditor",
    "security-researcher",
    "release-governance-reviewer",
  ], [
    "threat-model",
    "secret-handling-evidence",
    "rollback-plan",
  ]),
  privacy: regulatedGate("privacy", [
    "privacy-compliance-architect",
    "security-auditor",
    "release-governance-reviewer",
  ], [
    "privacy-risk-evidence",
    "data-flow-evidence",
    "rollback-plan",
  ]),
});

const STACK_SPECIALIST_AGENTS = Object.freeze({
  android: { implementers: ["android-developer"], architects: ["mobile-ui-designer"] },
  aspnet: { implementers: ["aspnet-developer"], architects: ["api-designer"] },
  chrome: { implementers: ["chrome-extension-developer"], architects: ["chrome-extension-architect"], designers: ["extension-ui-designer"] },
  django: { implementers: ["django-developer"], architects: ["django-architect"] },
  electron: { implementers: ["react-implementer"], architects: ["electron-ui-designer"], designers: ["electron-ui-designer"] },
  express: { implementers: ["express-developer"], architects: ["api-designer"] },
  fastapi: { implementers: ["fastapi-developer"], architects: ["fastapi-architect"] },
  fastify: { implementers: ["fastify-developer"], architects: ["api-designer"] },
  flutter: { implementers: ["flutter-developer"], architects: ["mobile-ui-designer"], designers: ["mobile-ui-designer"] },
  go: { implementers: ["go-service-developer"], architects: ["api-designer"] },
  ios: { implementers: ["ios-developer"], architects: ["mobile-ui-designer"], designers: ["mobile-ui-designer"] },
  laravel: { implementers: ["laravel-developer"], architects: ["laravel-architect"] },
  mongo: { implementers: [], architects: ["mongo-architect"], reviewers: ["db-reviewer"] },
  mysql: { implementers: [], architects: ["mysql-architect"], reviewers: ["db-reviewer"] },
  nestjs: { implementers: ["nestjs-developer"], architects: ["api-designer"] },
  nextjs: { implementers: ["nextjs-developer", "react-implementer"], architects: ["nextjs-architect"], designers: ["ux-ui-designer"] },
  nuxt: { implementers: ["nuxt-developer"], architects: ["nuxt-architect"], designers: ["ux-ui-designer"] },
  postgres: { implementers: [], architects: ["postgres-architect"], reviewers: ["db-reviewer"] },
  rails: { implementers: ["rails-developer"], architects: ["rails-architect"] },
  react: { implementers: ["react-implementer"], architects: ["nextjs-architect"], designers: ["ux-ui-designer"] },
  redis: { implementers: [], architects: ["redis-architect"], reviewers: ["performance-reviewer"] },
  spring: { implementers: ["spring-developer"], architects: ["spring-architect"] },
  sveltekit: { implementers: ["sveltekit-developer"], architects: ["sveltekit-developer"], designers: ["ux-ui-designer"] },
  tauri: { implementers: ["tauri-rust-engineer", "react-implementer"], architects: ["tauri-rust-engineer"], designers: ["tauri-ui-designer"] },
});

const STACK_ALIASES = Object.freeze({
  "android-native": "android",
  "asp.net": "aspnet",
  "browser-extension": "chrome",
  "chrome-extension": "chrome",
  "electronjs": "electron",
  "go-service": "go",
  "ios-native": "ios",
  "next": "nextjs",
  "next.js": "nextjs",
  "node": "express",
  "nodejs": "express",
  "postgresql": "postgres",
  "reactjs": "react",
  "rust-tauri": "tauri",
  "svelte": "sveltekit",
});

const RISK_REVIEWER_AGENTS = Object.freeze({
  accessibility: ["accessibility-reviewer"],
  api: ["api-contract-reviewer"],
  database: ["db-reviewer"],
  db: ["db-reviewer"],
  dependency: ["dependency-reviewer"],
  deploy: ["devops-sre", "release-governance-reviewer"],
  performance: ["performance-reviewer"],
  privacy: ["privacy-compliance-architect"],
  release: ["release-governance-reviewer"],
  security: ["security-auditor", "security-researcher"],
});

const ARTIFACT_OWNER_AGENTS = Object.freeze({
  agent: ["prompt-ai-engineer", "quality-gate-reviewer"],
  agents: ["prompt-ai-engineer", "quality-gate-reviewer"],
  api: ["api-designer", "api-contract-reviewer"],
  code: ["code-reviewer"],
  command: ["supervibe-orchestrator", "quality-gate-reviewer"],
  commands: ["supervibe-orchestrator", "quality-gate-reviewer"],
  design: ["ux-ui-designer", "ui-polish-reviewer", "accessibility-reviewer"],
  epic: ["ai-agent-orchestrator", "quality-gate-reviewer"],
  graph: ["repo-researcher", "quality-gate-reviewer"],
  memory: ["memory-curator", "repo-researcher"],
  plan: ["systems-analyst", "architect-reviewer", "quality-gate-reviewer"],
  prototype: ["prototype-builder", "ui-polish-reviewer", "accessibility-reviewer"],
  receipt: ["quality-gate-reviewer", "repo-researcher"],
  receipts: ["quality-gate-reviewer", "repo-researcher"],
  rule: ["rules-curator", "quality-gate-reviewer"],
  rules: ["rules-curator", "quality-gate-reviewer"],
  skill: ["prompt-ai-engineer", "quality-gate-reviewer"],
  skills: ["prompt-ai-engineer", "quality-gate-reviewer"],
  task: ["ai-agent-orchestrator", "quality-gate-reviewer"],
  ui: ["ux-ui-designer", "ui-polish-reviewer", "accessibility-reviewer"],
  workflow: ["supervibe-orchestrator", "ai-agent-orchestrator", "quality-gate-reviewer"],
});

const INTENT_AGENT_HINTS = Object.freeze({
  adapt: ["repo-researcher", "rules-curator", "memory-curator"],
  audit: ["repo-researcher", "memory-curator", "quality-gate-reviewer"],
  design: ["creative-director", "ux-ui-designer", "prototype-builder", "ui-polish-reviewer", "accessibility-reviewer"],
  gc: ["memory-curator", "quality-gate-reviewer"],
  loop: ["ai-agent-orchestrator", "repo-researcher", "quality-gate-reviewer"],
  plan: ["systems-analyst", "architect-reviewer", "quality-gate-reviewer"],
  preview: ["prototype-builder", "ui-polish-reviewer", "accessibility-reviewer"],
  review: ["architect-reviewer", "code-reviewer", "quality-gate-reviewer"],
  security: ["security-auditor", "security-researcher", "dependency-reviewer"],
  status: ["repo-researcher", "quality-gate-reviewer"],
});

const DYNAMIC_AGENT_SELECTOR_HANDLERS = Object.freeze({
  "artifact-owner-agents": (context) => selectArtifactOwners(context),
  "audit-domain-specialists": (context) => [
    ...selectDomainSpecialists(context),
    ...selectRiskReviewers(context),
  ],
  "changed-artifact-specialists": (context) => [
    ...selectArtifactOwners(context),
    ...selectStackAgents(context, "implementers"),
  ],
  "changed-stack-specialists": (context) => [
    ...selectStackAgents(context, "architects"),
    ...selectStackAgents(context, "implementers"),
    ...selectRiskReviewers(context),
  ],
  "competitive-design-researcher": (context) => context.intent.includes("design") || ["design", "prototype", "ui"].includes(context.artifactType)
    ? [select("competitive-design-researcher", "design or prototype context needs competitive evidence")]
    : [skip("competitive-design-researcher", "no design/prototype signal")],
  "dashboard-domain-reviewers": (context) => [
    ...selectArtifactOwners({ ...context, artifactType: context.artifactType || "ui" }),
    select("quality-gate-reviewer", "dashboard changes need final quality gate"),
  ],
  "design-reviewers": (context) => [
    ...selectArtifactOwners({ ...context, artifactType: context.artifactType || "prototype" }),
    select("copywriter", "presentation/design output needs copy review"),
  ],
  "detected-stack-specialists": (context) => [
    ...selectStackAgents(context, "architects"),
    ...selectStackAgents(context, "implementers"),
  ],
  "domain-specialists": (context) => selectDomainSpecialists(context),
  "health-domain-specialists": (context) => [
    ...selectRiskReviewers(context),
    select("observability-architect", "status/health flows need observability evidence"),
    select("devops-sre", "status/health flows need runtime health owner"),
  ],
  "host-adapter-specialists": () => [
    select("devops-sre", "host adapter diagnostics need runtime/process evidence"),
    select("infrastructure-architect", "host adapter diagnostics need integration architecture review"),
  ],
  "intent-router": (context) => selectIntentAgents(context),
  "low-risk-fast-path": (context) => context.lowRisk
    ? [skip("low-risk-fast-path", "low-risk base required agents are handled before dynamic selection")]
    : [skip("low-risk-fast-path", "low-risk context not present")],
  reviewers: (context) => [
    ...selectRiskReviewers(context),
    ...selectStageReviewers(context),
  ],
  "risk-reviewers": (context) => selectRiskReviewers(context),
  "rubric-owner-reviewers": () => [
    select("quality-gate-reviewer", "rubric scoring must be owned by the quality gate"),
  ],
  "stack-architects": (context) => selectStackAgents(context, "architects"),
  "stack-implementers": (context) => selectStackAgents(context, "implementers"),
  "stack-security-specialists": (context) => [
    ...selectStackAgents(context, "architects"),
    select("security-auditor", "security audit needs implementation-aware security review"),
    select("dependency-reviewer", "security audit needs dependency risk review"),
  ],
  "target-platform-designers": (context) => [
    ...selectStackAgents(context, "designers"),
    ...selectArtifactOwners({ ...context, artifactType: context.artifactType || "ui" }),
  ],
  "task-wave-specialists": (context) => [
    ...selectArtifactOwners(context),
    ...selectStackAgents(context, "implementers"),
    ...selectRiskReviewers(context),
  ],
  "weak-artifact-specialists": (context) => [
    ...selectArtifactOwners(context),
    select("prompt-ai-engineer", "weak agent/skill artifacts need prompt and instruction hardening"),
  ],
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
    instructions: "Invoke every required Supervibe specialist with the generated fork-safe payload for that exact specialist id. Do not substitute a generic worker or explorer subagent, and do not let controller-authored inline edits satisfy specialist receipts. With fork_context=true, omit agent_type, model, and reasoning_effort; encode the Supervibe role in message, log the returned agent id, then issue receipts with hostInvocation.source=codex-spawn-agent.",
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
  "design-system-architect": "default",
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
  "tauri-ui-designer": "default",
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
    baselineOnlyRequiredAgentIds: ["quality-gate-reviewer"],
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
    "design-system-architect",
    "ux-ui-designer",
    "tauri-ui-designer",
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
  ], { dynamicAgentSelectors: ["stack-architects", "domain-specialists", "reviewers"] }),
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
  callableAgentIds = null,
  callableAgentSources = null,
  extraRequiredAgentIds = [],
  hostAdapterId = null,
  enforceHostProof = false,
  receiptTrust = null,
  scopedReceiptTrust = null,
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
  const adaptBaselineOnlyApplyPhase = profile.commandId === "/supervibe-adapt"
    && workflowContext.apply === true
    && workflowContext.verifyAgents !== true
    && isBaselineOnlyFastPath(workflowContext);
  const bootstrapPreAgent = genesisBootstrapPhase;
  const lowRiskFastPath = isLowRiskFastPath(profile, workflowContext);
  const receiptStatus = normalizeReceiptTrust(receiptTrust);
  const scopedReceiptStatus = normalizeReceiptTrust(scopedReceiptTrust);
  const scopedReceiptGateActive = shouldUseScopedReceiptTrust(workflowContext);
  const activeReceiptStatus = scopedReceiptGateActive ? scopedReceiptStatus : receiptStatus;
  const runtimeReceiptsTrusted = activeReceiptStatus.trusted === true;
  const dynamicAgentResolution = resolveDynamicCommandAgents(profile, workflowContext);
  const baseRequiredAgentIds = adaptBaselineOnlyApplyPhase
    ? (profile.baselineOnlyRequiredAgentIds || profile.lowRiskRequiredAgentIds || [])
    : [
        profile.ownerAgentId,
        ...(lowRiskFastPath ? profile.lowRiskRequiredAgentIds : profile.requiredAgentIds),
      ];
  const requiredAgentIds = unique([
    ...baseRequiredAgentIds,
    ...dynamicAgentResolution.selectedAgentIds,
    ...extraRequiredAgentIds,
  ]);
  const callableAgentSourceRows = agentSourcesFor(requiredAgentIds, callableAgentSources);
  const logicalFallbackRequiredAgents = callableAgentSourceRows
    .filter((item) => /logical/i.test(String(item.source || "")))
    .map((item) => item.agentId);
  const immediateAgentIds = normalizeImmediateAgentIds(profile, requiredAgentIds);
  const deferredAgentIds = requiredAgentIds.filter((agentId) => !immediateAgentIds.includes(agentId));
  const available = availableAgentIds ? new Set([...availableAgentIds].map(String)) : null;
  const missingAgents = available
    ? requiredAgentIds.filter((agentId) => !available.has(agentId))
    : [];
  const callable = callableAgentIds ? new Set([...callableAgentIds].map(String)) : null;
  const missingCallableAgents = callable
    ? requiredAgentIds.filter((agentId) => !callable.has(agentId))
    : [];
  const callableAgentsReady = missingCallableAgents.length === 0;
  const hostDispatch = resolveHostAgentDispatcher(hostAdapterId);
  const hostProofBlocked = Boolean(
    enforceHostProof
      && requestedMode !== "inline"
      && hostDispatch
      && hostDispatch.status !== "supported",
  );
  const callableAgentsBlocked = callable !== null && !callableAgentsReady;
  const blocked = !bootstrapPreAgent
    && !adaptDryRunPhase
    && !adaptBaselineOnlyApplyPhase
    && requestedMode !== "inline"
    && (missingAgents.length > 0 || callableAgentsBlocked || hostProofBlocked);
  const executionMode = blocked
    ? COMMAND_AGENT_ORCHESTRATION_CONTRACT.blockedMode
    : adaptDryRunPhase
      ? "dry-run-no-agent"
    : adaptBaselineOnlyApplyPhase
      ? "baseline-only-fast-path"
    : bootstrapPreAgent
      ? "bootstrap-pre-agent"
    : requestedMode === "inline"
      ? "inline"
      : "agent-dispatch-required";
  const inlineOnly = executionMode === "inline";
  const realAgentCapable = executionMode === "agent-dispatch-required";
  const bootstrapOnly = executionMode === "bootstrap-pre-agent";
  const dryRunAgentless = executionMode === "dry-run-no-agent";
  const baselineOnly = executionMode === "baseline-only-fast-path";
  const receiptTrustApplies = runtimeReceiptsTrusted && !blocked && !bootstrapOnly && !dryRunAgentless && !baselineOnly;
  const activeScopedCommandAgentPlanRequired = scopedReceiptGateActive && !bootstrapOnly && !dryRunAgentless && !baselineOnly;
  const globalReceiptTrustIgnoredForActiveScope = activeScopedCommandAgentPlanRequired
    && receiptStatus.trusted === true
    && scopedReceiptStatus.trusted !== true;
  const durableWriteProofSource = receiptTrustApplies
    ? (scopedReceiptGateActive ? "scoped-runtime-agent-receipts" : "runtime-agent-receipts")
    : "blocked";
  const codexSpawnPayloads = hostDispatch?.hostAdapterId === "codex"
    && requestedMode !== "inline"
    && !bootstrapPreAgent
    && !dryRunAgentless
    && !baselineOnly
    && callableAgentsReady
    && !receiptTrustApplies
    ? buildCodexSpawnPayloads(requiredAgentIds, { commandId: profile.commandId })
    : [];

  return {
    commandId: profile.commandId,
    ownerAgentId: profile.ownerAgentId,
    agentSelectionMode: baselineOnly ? "baseline-only-fast-path" : lowRiskFastPath ? "low-risk-fast-path" : "standard",
    executionMode,
    requestedExecutionMode: requestedMode,
    defaultExecutionMode: profile.defaultExecutionMode,
    requiredAgentIds,
    requiredAgentSources: agentSourcesFor(requiredAgentIds, availableAgentSources),
    callableAgentSources: callableAgentSourceRows,
    logicalFallbackRequiredAgents,
    immediateAgentIds,
    deferredAgentIds,
    stageGate: profile.stageGate || null,
    stageGateCommand: profile.stageGateCommand || null,
    stageGateReason: profile.stageGateReason || null,
    dynamicAgentSelectors: [...profile.dynamicAgentSelectors],
    dynamicAgentResolution,
    selectorInputFields: [...COMMAND_AGENT_SELECTOR_INPUT_FIELDS],
    selectorInputs: dynamicAgentResolution.inputs,
    regulatedDomainGates: dynamicAgentResolution.regulatedDomainGates,
    mandatoryEvidence: dynamicAgentResolution.mandatoryEvidence,
    reviewerGateAgentIds: dynamicAgentResolution.reviewerGateAgentIds,
    orchestratorDecisionArtifact: buildOrchestratorDecisionArtifact({
      commandId: profile.commandId,
      profile,
      workflowContext,
      dynamicAgentResolution,
      requiredAgentIds,
      immediateAgentIds,
      deferredAgentIds,
    }),
    missingAgents,
    missingCallableAgents,
    hostDispatch,
    hostProofRequired: requestedMode !== "inline",
    hostProofBlocked,
    callableAgentsBlocked,
    agentsInstalled: missingAgents.length === 0,
    callableAgentsReady,
    hostDispatchAvailable: hostDispatch?.status === "supported",
    agentInvocationsCompleted: receiptTrustApplies,
    agentReceiptsTrusted: receiptTrustApplies,
    receiptGate: dryRunAgentless
        ? "not-required-for-dry-run"
      : baselineOnly
        ? "quality-gate-only-baseline-refresh"
      : bootstrapOnly
        ? "bootstrap-pre-agent-basic-scaffold"
      : scopedReceiptGateActive && receiptTrustApplies
        ? "trusted-scoped-runtime-agent-receipts"
      : receiptTrustApplies
        ? "trusted-runtime-agent-receipts"
      : scopedReceiptGateActive && realAgentCapable
        ? "pending-scoped-runtime-agent-receipts"
      : realAgentCapable
        ? "pending-runtime-agent-receipts"
        : "not-applicable",
    receiptTrust: receiptStatus,
    scopedReceiptGateActive,
    scopedReceiptTrust: scopedReceiptStatus,
    activeReceiptTrust: activeReceiptStatus,
    activeScopedCommandAgentPlanRequired,
    globalReceiptTrustIgnoredForActiveScope,
    durableWriteProofSource,
    requiredPlanFields: [...profile.requiredPlanFields],
    requiredReceiptFields: [...profile.requiredReceiptFields],
    durableWritesAllowed: (bootstrapOnly && workflowContext.dryRun !== true) || baselineOnly || receiptTrustApplies,
    agentOwnedOutputAllowed: receiptTrustApplies,
    agentOwnedOutputRequiresReceipts: realAgentCapable && !receiptTrustApplies,
    agentDispatchRequired: realAgentCapable && !receiptTrustApplies,
    inlineDraftAllowed: inlineOnly,
    bootstrapPreAgentAllowed: bootstrapOnly,
    dryRunAgentlessAllowed: dryRunAgentless,
    baselineOnlyFastPathAllowed: baselineOnly,
    qualityImpact: inlineOnly
      ? "Inline mode is diagnostic/dry-run only and cannot satisfy specialist output."
      : receiptTrustApplies
        ? `${scopedReceiptGateActive ? "Scoped runtime agent receipt gate" : "Runtime agent receipt gate"} is trusted (${activeReceiptStatus.trustedHostAgentReceipts}/${activeReceiptStatus.minHostAgentReceipts} host receipts, ${activeReceiptStatus.agentInvocations}/${activeReceiptStatus.minAgentInvocations} receipt-bound invocations).`
      : dryRunAgentless
        ? "Adapt dry-run is read-only planning and may run without real-agent receipts; apply and verify-agents remain separate gated phases."
      : baselineOnly
        ? "Baseline-only adapt apply has no managed artifact changes and uses deterministic adapt validators plus the quality gate; real-agent dispatch is not required."
      : bootstrapOnly
        ? "Bootstrap-pre-agent mode may install base host scaffold and state only; specialist-owned output and completion claims still require runtime agent receipts after agents are installed."
      : hostProofBlocked
        ? `Host ${hostDispatch.hostAdapterId} requires runtime invocation proof before real-agents mode can run.`
      : callableAgentsBlocked
        ? `Required agents are defined but not callable in the selected host registry: ${missingCallableAgents.join(", ")}.`
      : blocked
        ? `Missing required agents: ${missingAgents.join(", ")}.`
      : scopedReceiptGateActive
        ? "Agent definitions and host dispatch are available, but this active command/handoff has no trusted scoped runtime receipts yet."
        : lowRiskFastPath
          ? "Low-risk workflow context selected the owner plus quality gate fast path; durable outputs still require runtime receipts for any claimed producer."
          : "Agent definitions and host dispatch are available, but durable outputs remain blocked until runtime agent receipts are issued.",
    blockedQuestion: blocked
      ? buildBlockedAgentQuestion({
        commandId: profile.commandId,
        missingAgents,
        missingCallableAgents,
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

export function listDynamicAgentSelectors() {
  return Object.keys(DYNAMIC_AGENT_SELECTOR_HANDLERS).sort();
}

function resolveDynamicCommandAgents(profileOrCommandId = {}, workflowContext = {}) {
  const profile = typeof profileOrCommandId === "string"
    ? getCommandAgentProfile(profileOrCommandId)
    : profileOrCommandId;
  const context = normalizeSelectorContext(workflowContext);
  const selectors = [...(profile?.dynamicAgentSelectors || [])];
  const decisions = [];

  for (const selectorId of selectors) {
    const handler = DYNAMIC_AGENT_SELECTOR_HANDLERS[selectorId];
    if (!handler) {
      decisions.push({
        selectorId,
        decision: "skip",
        subject: selectorId,
        reason: "selector is not executable",
      });
      continue;
    }
    const rows = handler(context, profile) || [];
    if (rows.length === 0) {
      decisions.push({
        selectorId,
        decision: "skip",
        subject: selectorId,
        reason: "selector returned no candidates",
      });
      continue;
    }
    for (const row of rows) decisions.push({ selectorId, ...row });
  }

  const regulated = resolveRegulatedDomainGates(context);
  decisions.push(...regulated.decisions);
  const selectedAgentIds = unique(decisions
    .filter((entry) => entry.decision === "select" && entry.agentId)
    .map((entry) => entry.agentId));

  return {
    schemaVersion: 1,
    inputFields: [...COMMAND_AGENT_SELECTOR_INPUT_FIELDS],
    inputs: {
      intent: context.intent || null,
      stackTags: [...context.stackTags],
      riskDomains: [...context.riskDomains],
      artifactType: context.artifactType || null,
      stage: context.stage || null,
    },
    selectors,
    executableSelectors: selectors.filter((selectorId) => Boolean(DYNAMIC_AGENT_SELECTOR_HANDLERS[selectorId])),
    selectedAgentIds,
    selected: selectedAgentIds.map((agentId) => ({
      agentId,
      reasons: decisions
        .filter((entry) => entry.decision === "select" && entry.agentId === agentId)
        .map((entry) => `${entry.selectorId}: ${entry.reason}`),
    })),
    skipped: decisions.filter((entry) => entry.decision !== "select"),
    decisions,
    regulatedDomainGates: regulated.gates,
    reviewerGateAgentIds: regulated.reviewerGateAgentIds,
    mandatoryEvidence: regulated.mandatoryEvidence,
  };
}

function buildOrchestratorDecisionArtifact({
  commandId = "unknown",
  profile = {},
  workflowContext = {},
  dynamicAgentResolution = resolveDynamicCommandAgents(profile, workflowContext),
  requiredAgentIds = [],
  immediateAgentIds = [],
  deferredAgentIds = [],
} = {}) {
  return {
    schemaVersion: 1,
    artifactType: "supervibe-orchestrator-agent-selection-decision",
    generatedAt: "deterministic-local",
    commandId: normalizeCommandId(commandId),
    selectorInputFields: [...COMMAND_AGENT_SELECTOR_INPUT_FIELDS],
    selectorInputs: dynamicAgentResolution.inputs || normalizeSelectorContext(workflowContext),
    dynamicSelectors: [...(dynamicAgentResolution.selectors || [])],
    baseRequiredAgentIds: [...(profile.requiredAgentIds || [])],
    selectedDynamicAgentIds: [...(dynamicAgentResolution.selectedAgentIds || [])],
    requiredAgentIds: [...requiredAgentIds],
    immediateAgentIds: [...immediateAgentIds],
    deferredAgentIds: [...deferredAgentIds],
    regulatedDomainGates: [...(dynamicAgentResolution.regulatedDomainGates || [])],
    mandatoryEvidence: [...(dynamicAgentResolution.mandatoryEvidence || [])],
    reviewerGateAgentIds: [...(dynamicAgentResolution.reviewerGateAgentIds || [])],
    decisions: [...(dynamicAgentResolution.decisions || [])],
    policy: {
      ownerAgentId: COMMAND_AGENT_ORCHESTRATION_CONTRACT.ownerAgentId,
      emulationAllowed: false,
      durableOutputPolicy: COMMAND_AGENT_ORCHESTRATION_CONTRACT.durableOutputPolicy,
    },
  };
}

function buildBlockedAgentQuestion({
  commandId = "unknown",
  missingAgents = [],
  missingCallableAgents = [],
  hostDispatch = null,
  hostProofBlocked = false,
  requiredAgentIds = [],
} = {}) {
  const missingAgentLike = missingAgents.length ? missingAgents : missingCallableAgents;
  const agentSummary = missingAgentLike.length
    ? missingAgentLike.join(", ")
    : requiredAgentIds.length
      ? requiredAgentIds.join(", ")
      : "required specialists";
  const hostSummary = hostDispatch?.hostAdapterId
    ? `${hostDispatch.hostAdapterId} ${hostDispatch.nativeTool || "host dispatch"}`
    : "host dispatch";
  const blocker = hostProofBlocked
    ? `${hostSummary} proof is missing`
    : missingCallableAgents.length
      ? `agents are not callable in ${hostSummary}: ${agentSummary}`
    : `missing agents: ${agentSummary}`;

  return {
    prompt: `Step 1/1: ${commandId} cannot claim real-agent output yet because ${blocker}. Fix dispatch, run a diagnostic draft, or stop?`,
    specialist: "supervibe-orchestrator",
    evidence: [
      `command=${commandId}`,
      `missingAgents=${missingAgents.join(",") || "none"}`,
      `missingCallableAgents=${missingCallableAgents.join(",") || "none"}`,
      `hostDispatch=${hostDispatch?.status || "not-configured"}`,
    ],
    artifactImpact: "This answer decides whether durable command outputs remain blocked, agent provisioning runs, or the session stops without emulated specialist work.",
    choices: [
      {
        id: "provision-agents",
        label: missingAgents.length || missingCallableAgents.length ? `Install missing agents for ${commandId}` : `Refresh agent availability for ${commandId}`,
        tradeoff: `Runs the provisioning path for ${agentSummary}; durable outputs stay blocked until receipts exist.`,
        recommended: missingAgents.length > 0 || missingCallableAgents.length > 0,
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
      logCommand: "node <resolved-supervibe-plugin-root>/scripts/agent-invocation.mjs log --agent <agent-id> --host codex --host-invocation-id <returned-codex-agent-id> --task <summary> --confidence <0-10> --changed-files <paths> --risks <items> --recommendations <items> --issue-receipt --command <command-id> --stage <stage-id> --handoff-id <handoff-id> --input-evidence <paths> --output-artifacts .supervibe/artifacts/_agent-outputs/<returned-codex-agent-id>/agent-output.json",
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
    `CALLABLE_AGENTS_READY: ${plan.callableAgentsReady === true}`,
    `HOST_DISPATCH_AVAILABLE: ${plan.hostDispatchAvailable === true}`,
    `AGENT_INVOCATIONS_COMPLETED: ${plan.agentInvocationsCompleted === true}`,
    `AGENT_RECEIPTS_TRUSTED: ${plan.agentReceiptsTrusted === true}`,
    `SCOPED_RECEIPT_GATE: ${plan.scopedReceiptGateActive === true}`,
    `ACTIVE_SCOPED_COMMAND_AGENT_PLAN_REQUIRED: ${plan.activeScopedCommandAgentPlanRequired === true}`,
    `GLOBAL_RECEIPTS_IGNORED_FOR_ACTIVE_SCOPE: ${plan.globalReceiptTrustIgnoredForActiveScope === true}`,
    `DURABLE_WRITE_PROOF_SOURCE: ${plan.durableWriteProofSource || "unknown"}`,
    `BOOTSTRAP_PRE_AGENT_ALLOWED: ${plan.bootstrapPreAgentAllowed === true}`,
    `DRY_RUN_AGENTLESS_ALLOWED: ${plan.dryRunAgentlessAllowed === true}`,
    `BASELINE_ONLY_FAST_PATH_ALLOWED: ${plan.baselineOnlyFastPathAllowed === true}`,
    `AGENT_OUTPUT_REQUIRES_RECEIPTS: ${plan.agentOwnedOutputRequiresReceipts === true}`,
    `REQUIRED_AGENTS: ${(plan.requiredAgentIds || []).join(", ") || "none"}`,
    `REQUIRED_AGENT_SOURCES: ${formatAgentSources(plan.requiredAgentSources)}`,
    `CALLABLE_AGENT_SOURCES: ${formatAgentSources(plan.callableAgentSources)}`,
    `IMMEDIATE_AGENTS: ${(plan.immediateAgentIds || []).join(", ") || "none"}`,
    `DEFERRED_AGENTS: ${(plan.deferredAgentIds || []).join(", ") || "none"}`,
    `AGENT_STAGE_GATE: ${plan.stageGate || "none"}`,
    `AGENT_STAGE_GATE_COMMAND: ${plan.stageGateCommand || "none"}`,
    `AGENT_STAGE_GATE_REASON: ${plan.stageGateReason || "none"}`,
    `DYNAMIC_SELECTORS: ${(plan.dynamicAgentSelectors || []).join(", ") || "none"}`,
    `SELECTOR_INPUT_FIELDS: ${(plan.selectorInputFields || COMMAND_AGENT_SELECTOR_INPUT_FIELDS).join(", ")}`,
    `SELECTOR_INPUTS: ${formatSelectorInputs(plan.selectorInputs)}`,
    `SELECTOR_SELECTED_AGENTS: ${(plan.dynamicAgentResolution?.selectedAgentIds || []).join(", ") || "none"}`,
    `REGULATED_DOMAIN_GATES: ${(plan.regulatedDomainGates || []).map((gate) => gate.domain).join(", ") || "none"}`,
    `REVIEWER_GATE_AGENTS: ${(plan.reviewerGateAgentIds || []).join(", ") || "none"}`,
    `MANDATORY_EVIDENCE: ${(plan.mandatoryEvidence || []).join(", ") || "none"}`,
    `ORCHESTRATOR_DECISION_ARTIFACT: ${plan.orchestratorDecisionArtifact ? "embedded" : "none"}`,
    `MISSING_AGENTS: ${(plan.missingAgents || []).join(", ") || "none"}`,
    `MISSING_CALLABLE_AGENTS: ${(plan.missingCallableAgents || []).join(", ") || "none"}`,
    `LOGICAL_FALLBACK_AGENTS: ${(plan.logicalFallbackRequiredAgents || []).join(", ") || "none"}`,
    `SCOPED_RECEIPTS_MISSING: ${(plan.scopedReceiptTrust?.missingSubjects || []).join(", ") || "none"}`,
    `HOST_DISPATCH: ${plan.hostDispatch?.hostAdapterId || "unspecified"}:${plan.hostDispatch?.status || "not-checked"}`,
    `HOST_TOOL: ${plan.hostDispatch?.nativeTool || "unspecified"}`,
    `HOST_PROOF: ${plan.hostDispatch?.invocationProof || "unspecified"}`,
    `HOST_EVIDENCE: ${plan.hostDispatch?.evidencePath || "unspecified"}`,
    `CODEX_COMPLETED_SUBAGENT_CLEANUP_REQUIRED: ${plan.hostManagedCleanupDebt?.count || 0}`,
    `CODEX_CLOSE_COMPLETED_SUBAGENTS: ${(plan.hostManagedCleanupDebt?.closeRequired || []).map((item) => item.hostInvocationId).filter(Boolean).join(", ") || "none"}`,
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
    for (const selectorId of profile.dynamicAgentSelectors || []) {
      if (!DYNAMIC_AGENT_SELECTOR_HANDLERS[selectorId]) {
        issues.push(issue(commandId, "unknown-dynamic-agent-selector", `Dynamic selector is not executable: ${selectorId}`));
      }
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
    for (const payload of buildCodexSpawnPayloads(profile.requiredAgentIds, { commandId: profile.commandId })) {
      const logCommand = payload.receipt?.logCommand || "";
      if (/--output-artifacts\s+(?:none|<paths>)(?:\s|$)/i.test(logCommand)) {
        issues.push(issue(commandId, "invalid-codex-receipt-output-template", `Codex receipt log command for ${payload.agentId} must not use placeholder output artifacts.`));
      }
      if (!/\.supervibe\/artifacts\/_agent-outputs\/<returned-codex-agent-id>\/agent-output\.json/.test(logCommand)) {
        issues.push(issue(commandId, "missing-stable-codex-output-artifact", `Codex receipt log command for ${payload.agentId} must bind the stable structured agent output artifact.`));
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
    baselineOnlyRequiredAgentIds: Object.freeze(unique(options.baselineOnlyRequiredAgentIds || [])),
    dynamicAgentSelectors: Object.freeze(options.dynamicAgentSelectors || []),
    selectorInputFields: Object.freeze(options.selectorInputFields || COMMAND_AGENT_SELECTOR_INPUT_FIELDS),
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
    baselineOnlyRequiredAgentIds: [...(profile.baselineOnlyRequiredAgentIds || [])],
    dynamicAgentSelectors: [...profile.dynamicAgentSelectors],
    selectorInputFields: [...(profile.selectorInputFields || COMMAND_AGENT_SELECTOR_INPUT_FIELDS)],
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

function isBaselineOnlyFastPath(workflowContext = {}) {
  const adds = Number(workflowContext.adds ?? workflowContext.add ?? NaN);
  const updates = Number(workflowContext.updates ?? workflowContext.update ?? NaN);
  const projectOnly = Number(workflowContext.projectOnly ?? workflowContext["project-only"] ?? NaN);
  const conflicts = Number(workflowContext.conflicts ?? workflowContext.conflict ?? NaN);
  const memoryWrites = normalizeBoolean(workflowContext.memoryWrites ?? workflowContext["memory-writes"], false);
  if ([adds, updates, projectOnly, conflicts].some((value) => !Number.isFinite(value))) return false;
  return adds === 0 && updates === 0 && projectOnly === 0 && conflicts === 0 && memoryWrites === false;
}

function normalizeReceiptTrust(receiptTrust = null) {
  const minHostAgentReceipts = Number(receiptTrust?.minHostAgentReceipts || 1);
  const minAgentInvocations = Number(receiptTrust?.minAgentInvocations || 1);
  const trustedHostAgentReceipts = Number(receiptTrust?.trustedHostAgentReceipts || 0);
  const agentInvocations = Number(receiptTrust?.agentInvocations || receiptTrust?.receiptBoundAgentInvocations || 0);
  return {
    trusted: receiptTrust?.pass === true
      && trustedHostAgentReceipts >= minHostAgentReceipts
      && agentInvocations >= minAgentInvocations,
    trustedHostAgentReceipts,
    agentInvocations,
    loggedAgentInvocations: Number(receiptTrust?.loggedAgentInvocations || 0),
    minHostAgentReceipts,
    minAgentInvocations,
    requiredSubjects: [...(receiptTrust?.requiredSubjects || [])],
    missingSubjects: [...(receiptTrust?.missingSubjects || [])],
    scope: receiptTrust?.scope || null,
    issues: [...(receiptTrust?.issues || [])],
  };
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
  const explicitSourceMap = availableAgentSources !== null && availableAgentSources !== undefined;
  const sourceMap = availableAgentSources instanceof Map
    ? availableAgentSources
    : new Map(Object.entries(availableAgentSources || {}));
  return agentIds.map((agentId) => ({
    agentId,
    source: sourceMap.get(agentId) || (explicitSourceMap ? "missing" : "logical role"),
  }));
}

function formatAgentSources(sources = []) {
  if (!sources.length) return "none";
  return sources.map((item) => `${item.agentId}=${item.source}`).join(", ");
}

function nextActionForPlan(plan = {}) {
  if (plan.executionMode === COMMAND_AGENT_ORCHESTRATION_CONTRACT.blockedMode) {
    if (plan.hostProofBlocked) return "Connect a host runtime that records invocation ids, or stop; do not emulate specialists.";
    if (plan.missingCallableAgents?.length) return "Provision/connect the required agents in the selected host registry, then rebuild this plan; do not emulate specialists.";
    if (plan.missingAgents?.length) return "Provision/connect the missing agents, then rebuild this plan; do not emulate specialists.";
    return "Resolve the blocked agent plan before durable work.";
  }
  if (plan.executionMode === "bootstrap-pre-agent") {
    return "Write only bootstrap scaffold/state, then rebuild the real-agent plan after installed agents are available.";
  }
  if (plan.executionMode === "dry-run-no-agent") {
    return "Run the read-only dry-run and review the plan; use apply for approved writes and verify-agents for runtime receipt proof.";
  }
  if (plan.executionMode === "baseline-only-fast-path") {
    return "Run baseline-only adapt apply and deterministic validators; real-agent dispatch is not required for zero-change metadata refresh.";
  }
  if (plan.executionMode === "inline") return "Diagnostic/dry-run only; do not claim specialist output.";
  if (plan.agentReceiptsTrusted) return "Runtime agent receipt gate is already trusted; proceed with the command-specific verified next action.";
  if (plan.scopedReceiptGateActive) return "Invoke required host agents for this command/handoff, capture invocation ids, then issue scoped workflow receipts before durable writes or completion claims.";
  if (plan.stageGate && plan.immediateAgentIds?.length && plan.deferredAgentIds?.length) {
    return `Invoke immediate owner agent(s) now: ${plan.immediateAgentIds.join(", ")}. Then run ${plan.stageGateCommand || "the workflow gate"}; defer staged specialist agents (${plan.deferredAgentIds.join(", ")}) until the gate unlocks their stages.`;
  }
  return "Invoke required host agents, capture invocation ids, then issue workflow receipts before completion claims.";
}

function shouldUseScopedReceiptTrust(workflowContext = {}) {
  return Boolean(
    workflowContext.commandScopedReceiptGate === true
    || workflowContext.active === true
    || workflowContext.handoffId
    || workflowContext.handoff
    || workflowContext.workflowRunId
    || workflowContext.slug
  );
}

function resolveRegulatedDomainGates(context = normalizeSelectorContext()) {
  const domains = unique(context.riskDomains.map(normalizeRiskDomainToken));
  const gates = domains
    .map((domain) => REGULATED_DOMAIN_REVIEWER_GATES[domain])
    .filter(Boolean)
    .map(copyRegulatedGate);
  const reviewerGateAgentIds = unique(gates.flatMap((gate) => gate.reviewerGateAgentIds || []));
  const mandatoryEvidence = unique(gates.flatMap((gate) => gate.mandatoryEvidence || []));
  const decisions = reviewerGateAgentIds.map((agentId) => ({
    selectorId: "regulated-domain-reviewer-gates",
    decision: "select",
    agentId,
    reason: `regulated domain gate requires reviewer for ${gates.map((gate) => gate.domain).join(", ")}`,
    gateDomains: gates.map((gate) => gate.domain),
  }));
  if (domains.length && gates.length === 0) {
    decisions.push({
      selectorId: "regulated-domain-reviewer-gates",
      decision: "skip",
      subject: domains.join(","),
      reason: "risk domains are not configured as regulated gates",
    });
  }
  return { gates, reviewerGateAgentIds, mandatoryEvidence, decisions };
}

function selectIntentAgents(context = normalizeSelectorContext()) {
  const intent = context.intent || "";
  const matched = Object.entries(INTENT_AGENT_HINTS)
    .filter(([token]) => intent === token || intent.includes(token))
    .flatMap(([, agents]) => agents);
  if (!matched.length) return [skip("intent-router", "no intent-specific agent hint matched")];
  return unique(matched).map((agentId) => select(agentId, `intent=${intent}`));
}

function selectArtifactOwners(context = normalizeSelectorContext()) {
  const artifactType = normalizeArtifactToken(context.artifactType);
  const agents = ARTIFACT_OWNER_AGENTS[artifactType] || [];
  if (!agents.length) return [skip("artifact-owner", `no artifact owner mapping for ${artifactType || "unspecified"}`)];
  return agents.map((agentId) => select(agentId, `artifactType=${artifactType}`));
}

function selectDomainSpecialists(context = normalizeSelectorContext()) {
  const domains = unique(context.riskDomains.map(normalizeRiskDomainToken));
  const agents = [];
  for (const domain of domains) {
    const gate = REGULATED_DOMAIN_REVIEWER_GATES[domain];
    if (gate) agents.push("best-practices-researcher", ...(gate.reviewerGateAgentIds || []));
  }
  if (!agents.length) return [skip("domain-specialists", "no regulated or specialist domain signal")];
  return unique(agents).map((agentId) => select(agentId, `riskDomain=${domains.join(",")}`));
}

function selectRiskReviewers(context = normalizeSelectorContext()) {
  const risks = unique([
    ...context.riskDomains,
    riskFromArtifact(context.artifactType),
  ].filter(Boolean).map(normalizeRiskDomainToken));
  const agents = unique(risks.flatMap((risk) => RISK_REVIEWER_AGENTS[risk] || []));
  if (!agents.length) return [skip("risk-reviewers", "no risk reviewer mapping matched")];
  return agents.map((agentId) => select(agentId, `risk=${risks.join(",")}`));
}

function selectStageReviewers(context = normalizeSelectorContext()) {
  const stage = context.stage || "";
  const artifactType = context.artifactType || "";
  const agents = [];
  if (["review", "gate", "quality-gate", "release"].some((token) => stage.includes(token))) {
    agents.push("code-reviewer", "quality-gate-reviewer");
  }
  if (stage.includes("release") || stage.includes("deploy")) {
    agents.push("release-governance-reviewer", "devops-sre");
  }
  if (["design", "prototype", "ui"].some((token) => artifactType.includes(token) || stage.includes(token))) {
    agents.push("ui-polish-reviewer", "accessibility-reviewer");
  }
  if (!agents.length) return [skip("stage-reviewers", "no stage reviewer mapping matched")];
  return unique(agents).map((agentId) => select(agentId, `stage=${stage || "unspecified"}`));
}

function selectStackAgents(context = normalizeSelectorContext(), group = "implementers") {
  const rows = [];
  for (const stackTag of context.stackTags) {
    const stack = normalizeStackToken(stackTag);
    const config = STACK_SPECIALIST_AGENTS[stack];
    if (!config) {
      rows.push(skip(stack, `no stack specialist mapping for ${stack}`));
      continue;
    }
    const agents = config[group] || [];
    if (!agents.length) {
      rows.push(skip(stack, `no ${group} specialists for ${stack}`));
      continue;
    }
    rows.push(...agents.map((agentId) => select(agentId, `stack=${stack} group=${group}`)));
  }
  return rows.length ? rows : [skip(`stack-${group}`, "no stack tags supplied")];
}

function normalizeSelectorContext(workflowContext = {}) {
  return {
    intent: normalizeContextToken(workflowContext.intent || workflowContext.commandIntent || workflowContext.routeIntent || ""),
    stackTags: normalizeList(workflowContext.stackTags ?? workflowContext.stackTag ?? workflowContext.stacks ?? workflowContext.stack)
      .map(normalizeStackToken),
    riskDomains: normalizeList(workflowContext.riskDomains ?? workflowContext.riskDomain ?? workflowContext.domain ?? workflowContext.domains)
      .map(normalizeRiskDomainToken),
    artifactType: normalizeArtifactToken(workflowContext.artifactType || workflowContext.artifact || workflowContext.targetArtifact || ""),
    stage: normalizeContextToken(workflowContext.stage || workflowContext.workflowStage || workflowContext.phase || ""),
    lowRisk: workflowContext.lowRisk === true || workflowContext["low-risk"] === true,
  };
}

function normalizeList(value) {
  if (Array.isArray(value)) return unique(value.flatMap((item) => normalizeList(item)));
  if (value === undefined || value === null || value === "") return [];
  return String(value)
    .split(/[,\s;|]+/u)
    .map(normalizeContextToken)
    .filter(Boolean);
}

function normalizeStackToken(value = "") {
  const token = normalizeContextToken(value);
  return STACK_ALIASES[token] || token;
}

function normalizeRiskDomainToken(value = "") {
  const token = normalizeContextToken(value);
  if (["payments", "payment", "billing", "banking"].includes(token)) return "finance";
  if (["gov", "public-sector"].includes(token)) return "government";
  if (["medical-care", "healthcare"].includes(token)) return "health";
  if (["privacy-compliance", "pii"].includes(token)) return "privacy";
  if (["sec", "security-audit"].includes(token)) return "security";
  return token;
}

function normalizeArtifactToken(value = "") {
  const token = normalizeContextToken(value);
  if (["work-item", "work-items", "task-graph", "tasks"].includes(token)) return "task";
  if (["prototype-set", "mockup", "mockups", "screen"].includes(token)) return "prototype";
  if (["command-route", "route", "router"].includes(token)) return "command";
  if (["skill-file"].includes(token)) return "skill";
  return token;
}

function normalizeContextToken(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/[^\p{L}\p{N}.+#/-]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function riskFromArtifact(artifactType = "") {
  const artifact = normalizeArtifactToken(artifactType);
  if (artifact === "api") return "api";
  if (artifact === "db" || artifact === "database") return "database";
  if (artifact === "prototype" || artifact === "ui" || artifact === "design") return "accessibility";
  if (artifact === "release" || artifact === "deploy") return "release";
  return "";
}

function regulatedGate(domain, reviewerGateAgentIds = [], mandatoryEvidence = []) {
  return Object.freeze({
    domain,
    reviewerGateAgentIds: Object.freeze(unique(reviewerGateAgentIds)),
    mandatoryEvidence: Object.freeze(unique(mandatoryEvidence)),
  });
}

function copyRegulatedGate(gate = {}) {
  return {
    domain: gate.domain,
    reviewerGateAgentIds: [...(gate.reviewerGateAgentIds || [])],
    mandatoryEvidence: [...(gate.mandatoryEvidence || [])],
  };
}

function select(agentId, reason, extra = {}) {
  return {
    decision: "select",
    agentId,
    reason,
    ...extra,
  };
}

function skip(subject, reason, extra = {}) {
  return {
    decision: "skip",
    subject,
    reason,
    ...extra,
  };
}

function formatSelectorInputs(inputs = {}) {
  const stackTags = (inputs.stackTags || []).join(",") || "none";
  const riskDomains = (inputs.riskDomains || []).join(",") || "none";
  return [
    `intent=${inputs.intent || "none"}`,
    `stackTags=${stackTags}`,
    `riskDomains=${riskDomains}`,
    `artifactType=${inputs.artifactType || "none"}`,
    `stage=${inputs.stage || "none"}`,
  ].join(" ");
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
