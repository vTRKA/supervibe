import { readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { loadAgentRosterSync } from "./supervibe-agent-roster.mjs";
import {
  buildReferenceInventoryPlan,
  formatDesignArtifactChoiceQuestion,
} from "./design-artifact-intake.mjs";
import {
  bindDesignWizardQuestionProposals,
  buildDesignQuestionProposalDispatchQueue,
  buildDesignWizardState,
  formatDesignWizardQuestion,
  isTrustedDesignWizardQuestion,
  resolveDesignViewportPolicy,
} from "./design-wizard-catalog.mjs";
import {
  readDesignWindowMetrics,
} from "./design-window-metrics.mjs";
import {
  readWorkflowReceipts,
  validateWorkflowReceiptTrust,
} from "./supervibe-workflow-receipt-runtime.mjs";
import {
  validateWorkflowStageId,
} from "./workflow-stage-registry.mjs";
import {
  expectedProducerReceiptsForDurableOutputs,
  validateHostInvocationProof,
} from "./agent-producer-contract.mjs";
import { createAgentProvisioningPlan } from "./agent-provisioning.mjs";
import { resolveHostAgentDispatcher } from "./command-agent-orchestration-contract.mjs";
import { selectHostAdapter } from "./supervibe-host-detector.mjs";
import {
  classifyDesignIntent,
} from "./design-intent-classifier.mjs";
import {
  buildDesignAcceptanceContract,
  buildDesignVariantSet,
} from "./design-variant-set.mjs";

const REQUIRED_RECEIPT_FIELDS = Object.freeze([
  "schemaVersion",
  "invokedBy",
  "stage",
  "status",
  "invocationReason",
  "inputEvidence",
  "outputArtifacts",
  "startedAt",
  "completedAt",
  "handoffId",
]);

export function buildDesignAgentPlan({
  brief = "",
  target = "unknown",
  referenceSources = [],
  flowType = "",
  designSystemStatus = "missing",
  rootDir = process.cwd(),
  pluginRoot = null,
  mode = null,
  requestedExecutionMode = null,
  slug = null,
  currentWindow = null,
  deviceScaleFactor = null,
  initialDecisions = {},
  intake = null,
  hostAdapterId = null,
  env = process.env,
} = {}) {
  const text = String(brief ?? "");
  const intent = classifyDesignIntent({ brief: text, target, flowType });
  target = intent.target;
  flowType = intent.flowType;
  const sources = Array.isArray(referenceSources) ? referenceSources : [];
  const stages = [];
  const referenceInventory = buildReferenceInventoryPlan({ slug, intake });
  const hostWindowMetrics = readDesignWindowMetrics({ rootDir, target });
  const resolvedCurrentWindow = currentWindow || hostWindowMetrics?.currentWindow || null;
  const resolvedDeviceScaleFactor = deviceScaleFactor ?? hostWindowMetrics?.deviceScaleFactor ?? null;
  const resolvedInitialDecisions = {
    ...(initialDecisions || {}),
    ...(intake?.referenceScopeDecision
      ? { reference_borrow_avoid: intake.referenceScopeDecision }
      : {}),
  };
  const wizard = buildDesignWizardState({
    brief,
    target,
    designSystemStatus,
    mode,
    currentWindow: resolvedCurrentWindow,
    deviceScaleFactor: resolvedDeviceScaleFactor,
    initialDecisions: resolvedInitialDecisions,
  });
  const acceptanceContract = buildDesignAcceptanceContract({
    brief: text,
    slug,
    target,
    referenceSources: sources,
    wizard,
  });
  const variantSet = buildDesignVariantSet({
    slug: slug || "design-run",
    acceptanceContract,
  });

  stages.push(stage({
    id: "stage-0-orchestrator",
    agentId: "supervibe-orchestrator",
    reason: "own the design workflow state machine, wizard gate, specialist dispatch timing, and receipt evidence",
    immediate: true,
  }));
  stages.push(stage({
    id: "stage-0-memory",
    skillId: "supervibe:project-memory",
    reason: "surface prior brand, product, and design decisions before new design work",
  }));
  stages.push(stage({
    id: "stage-0-design-intelligence",
    skillId: "supervibe:design-intelligence",
    reason: "ground the design in local expert knowledge, tokens, patterns, and accessibility constraints",
  }));

  for (const source of sources) {
    if (source.kind === "website" || source.kind === "figma") {
      stages.push(stage({
        id: `stage-0-reference-${source.kind}`,
        skillId: "supervibe:mcp-discovery",
        reason: `${source.kind} reference requires tool discovery before scraping, opening, or extracting data`,
        reference: source.value,
      }));
    }
    if (source.kind === "pdf" || source.kind === "image" || source.kind === "screenshot") {
      stages.push(stage({
        id: `stage-0-reference-${source.kind}`,
        skillId: "supervibe:design-intelligence",
        reason: `${source.kind} reference must be classified as functional, IA, visual inspiration, or authoritative source before use`,
        reference: source.value,
      }));
    }
  }

  if (referenceInventory) {
    stages.push(stage({
      id: "stage-0-reference-inventory",
      skillId: "supervibe:design-intelligence",
      reason: `produce ${referenceInventory.path} with flows, states, capabilities, and explicit avoid list before creative direction`,
      referenceInventory,
    }));
  }

  stages.push(stage({
    id: "stage-1-brand-direction",
    agentId: "creative-director",
    reason: `creative direction is required for ${target}; must produce direction options before tokens`,
  }));

  if (designSystemStatus !== "approved") {
    stages.push(stage({
      id: "stage-2-design-system",
      skillId: "supervibe:brandbook",
      reason: "candidate tokens and design-system sections require the brandbook skill and explicit approval lifecycle",
    }));
    stages.push(stage({
      id: "stage-2-design-system-review",
      agentId: "design-system-architect",
      reason: "design-system architecture, token drift, component coverage, library bridge, and memory writeback require an explicit specialist review before prototype unlock",
    }));
  }

  stages.push(stage({
    id: "stage-3-screen-spec",
    agentId: "ux-ui-designer",
    reason: "screen architecture, states, and component inventory require an explicit UX/UI design pass",
  }));
  stages.push(stage({
    id: "stage-4-copy",
    agentId: "copywriter",
    reason: "visible UI text, empty states, and errors need a dedicated copy pass",
  }));
  stages.push(stage({
    id: "stage-5-prototype-build",
    agentId: "prototype-builder",
    reason: "native HTML/CSS/JS prototype build requires a builder receipt before claiming the agent ran",
  }));
  stages.push(stage({
    id: flowType === "landing" || /landing|marketing/i.test(text) ? "stage-5-landing-skill" : "stage-5-prototype-skill",
    skillId: flowType === "landing" || /landing|marketing/i.test(text) ? "supervibe:landing-page" : "supervibe:prototype",
    reason: "prototype builder must choose the concrete prototype skill based on target flow",
  }));
  stages.push(stage({
    id: "stage-6-polish-review",
    agentId: "ui-polish-reviewer",
    reason: "visual hierarchy, responsive behavior, token compliance, and interaction states require review",
  }));
  stages.push(stage({
    id: "stage-6-a11y-review",
    agentId: "accessibility-reviewer",
    reason: "accessibility review is required before prototype approval",
  }));
  stages.push(stage({
    id: "stage-7-quality-gate",
    agentId: "quality-gate-reviewer",
    reason: "aggregate receipts, polish, accessibility, browser verification, and confidence caps before approval",
  }));

  const plan = {
    schemaVersion: 1,
    command: "/supervibe-design",
    slug,
    target,
    flowType,
    designSystemStatus,
    requestedExecutionMode: normalizeDesignExecutionMode(requestedExecutionMode || inferExecutionModeFromBrief(text)),
    mode: wizard.mode,
    requiresReceipts: true,
    receiptDirectory: ".supervibe/artifacts/_workflow-invocations/supervibe-design/<handoff-id>/",
    executionStatus: null,
    referenceInventory,
    wizard,
    intent,
    viewportPolicy: {
      ...resolveDesignViewportPolicy({
        target,
        currentWindow: resolvedCurrentWindow,
        deviceScaleFactor: resolvedDeviceScaleFactor,
      }),
      metricsSource: hostWindowMetrics?.source || null,
    },
    acceptanceContract,
    variantSet,
    writeGate: null,
    stages: dedupeStages(stages),
  };
  plan.executionStatus = buildDesignExecutionStatus(rootDir, plan, {
    pluginRoot,
    requestedExecutionMode: plan.requestedExecutionMode,
    locale: wizard.locale,
    hostAdapterId,
    env,
  });
  plan.wizard = bindDesignWizardQuestionProposals(plan.wizard, readTrustedQuestionProposalOutputs(rootDir, plan.executionStatus.questionProposalProducers));
  plan.writeGate = buildDesignWriteGate({ intake, plan });
  return plan;
}

export function buildDesignWriteGate({ intake = null, plan = null } = {}) {
  const blocked = [];
  if (intake?.needsQuestion === true) {
    blocked.push({
      code: "intake-question-open",
      message: `design intake requires one question before artifact writes: ${intake.reason || "unspecified intake blocker"}`,
    });
  }
  if (plan?.executionStatus?.executionMode === "agent-required-blocked") {
    blocked.push({
      code: "agent-required-blocked",
      message: "specialist agents are unavailable; provision/connect real agents before any design artifact write",
    });
  }
  if (plan?.executionStatus?.executionMode === "agent-dispatch-required") {
    blocked.push({
      code: "pending-runtime-agent-receipts",
      message: `specialist agents are installed but durable design writes require runtime-issued receipts first: ${formatMissingRuntimeProofs(plan.executionStatus.missingRuntimeProofs)}`,
    });
  }
  if (
    plan?.executionStatus?.executionMode
    && !["real-agents", "agent-required-blocked", "agent-dispatch-required"].includes(plan.executionStatus.executionMode)
  ) {
    blocked.push({
      code: "non-real-agent-execution-mode",
      message: `${plan.executionStatus.executionMode} mode can save run-state and diagnostics only; agent-owned durable design artifacts require real-agents mode and runtime receipts`,
    });
  }
  if (plan?.wizard?.gates?.viewportPolicyRecorded === false) {
    blocked.push({
      code: "viewport-policy-open",
      message: "viewport policy must be recorded before review styleboards, prototypes, or visual approval evidence",
    });
  }
  if (plan?.wizard?.gates?.tokensUnlocked !== true) {
    blocked.push({
      code: "tokens-locked",
      message: plan?.wizard?.gates?.blockedReason || "wizard preference coverage matrix is incomplete",
    });
  }

  const durableWritesAllowed = blocked.length === 0;
  const reviewStyleboardAllowed = durableWritesAllowed && plan?.wizard?.gates?.reviewStyleboardUnlocked === true;
  const nextQuestion = nextDesignBlockingQuestion({ intake, plan });
  return {
    schemaVersion: 1,
    durableWritesAllowed,
    artifactWritesAllowed: durableWritesAllowed,
    reviewStyleboardAllowed,
    diagnosticScratchAllowed: true,
    allowedWriteClasses: durableWritesAllowed
      ? ["run-state", "diagnostic-scratch", "review-styleboard", "durable-design-artifacts"]
      : ["run-state", "diagnostic-scratch"],
    blockedWriteClasses: durableWritesAllowed
      ? []
      : ["durable-design-artifacts", "review-styleboard", "prototype"],
    protectedArtifacts: [
      ".supervibe/artifacts/brandbook/direction.md",
      ".supervibe/artifacts/prototypes/_design-system/tokens.css",
      ".supervibe/artifacts/prototypes/_design-system/manifest.json",
      ".supervibe/artifacts/prototypes/_design-system/design-flow-state.json",
      ".supervibe/artifacts/prototypes/_design-system/styleboard.html",
      ".supervibe/artifacts/prototypes/_design-system/_reviews/architecture.md",
      ".supervibe/artifacts/prototypes/_design-system/.approvals/*.json",
    ],
    blockedReasons: blocked,
    blockedReason: blocked.map((item) => item.message).join("; ") || null,
    nextQuestion,
  };
}

export function buildDesignPrewriteManifest(plan = {}, { slug = null } = {}) {
  const gate = plan.writeGate || buildDesignWriteGate({ plan });
  const protectedArtifacts = gate.protectedArtifacts || [];
  const prototypeSlug = slug || "<prototype-slug>";
  const variantSet = plan.variantSet?.active
    ? buildDesignVariantSet({
      slug: prototypeSlug,
      acceptanceContract: plan.acceptanceContract || plan.variantSet,
    })
    : null;
  const prototypeArtifacts = variantSet?.active
    ? [
      { path: variantSet.manifestPath, writeClass: "durable-design-artifacts" },
      { path: variantSet.previewManifestPath, writeClass: "durable-design-artifacts" },
      { path: variantSet.diversityReportPath, writeClass: "review-styleboard" },
      ...variantSet.variants.flatMap((variant) => [
        { path: variant.artifactPath, writeClass: "prototype" },
        { path: variant.reviewArtifacts.polish, writeClass: "review-styleboard" },
        { path: variant.reviewArtifacts.a11y, writeClass: "review-styleboard" },
      ]),
      { path: `.supervibe/artifacts/prototypes/${prototypeSlug}/_reviews/quality-gate.json`, writeClass: "review-styleboard" },
    ]
    : [
      { path: `.supervibe/artifacts/prototypes/${prototypeSlug}/index.html`, writeClass: "prototype" },
      { path: `.supervibe/artifacts/prototypes/${prototypeSlug}/_reviews/polish.md`, writeClass: "review-styleboard" },
      { path: `.supervibe/artifacts/prototypes/${prototypeSlug}/_reviews/a11y.md`, writeClass: "review-styleboard" },
      { path: `.supervibe/artifacts/prototypes/${prototypeSlug}/_reviews/quality-gate.json`, writeClass: "review-styleboard" },
    ];
  const planned = [
    ...protectedArtifacts.map((path) => ({ path, writeClass: writeClassForDesignArtifact(path) })),
    { path: `.supervibe/artifacts/prototypes/${prototypeSlug}/spec.md`, writeClass: "durable-design-artifacts" },
    { path: `.supervibe/artifacts/prototypes/${prototypeSlug}/content/copy.md`, writeClass: "durable-design-artifacts" },
    ...prototypeArtifacts,
  ];
  const allowed = new Set(gate.allowedWriteClasses || []);
  const producerProofs = producerProofsByArtifact(plan);
  const files = planned.map((item) => perArtifactWriteStatus({
    item,
    proof: producerProofs.get(normalizeRelPath(item.path)),
    gate,
    allowed,
  }));
  const pendingProducer = firstPendingProducer(files);
  const nextQuestion = gate.nextQuestion || null;
  const nextProducer = nextQuestionBlocksProducer(nextQuestion) ? null : pendingProducer;
  return {
    schemaVersion: 1,
    command: "/supervibe-design",
    workflowStage: designWorkflowStageForPlan(plan),
    durableWritesAllowed: gate.durableWritesAllowed === true,
    reviewStyleboardAllowed: gate.reviewStyleboardAllowed === true,
    blockedReason: gate.blockedReason || null,
    nextProducer,
    nextQuestion: nextQuestion?.reason || null,
    nextQuestionSource: nextQuestion?.source || null,
    nextQuestionAxis: nextQuestion?.question?.axis || null,
    variantSet: variantSet?.active
      ? {
        active: true,
        requestedVariantCount: variantSet.requestedVariantCount,
        manifestPath: variantSet.manifestPath,
        primarySwitcherForbidden: variantSet.primarySwitcherForbidden,
      }
      : { active: false, requestedVariantCount: 1 },
    files,
  };
}

export function formatDesignPrewriteManifest(manifest = {}) {
  const lines = [
    "SUPERVIBE_DESIGN_PREWRITE_MANIFEST",
    `WORKFLOW_STAGE: ${manifest.workflowStage || "unknown"}`,
    `DURABLE_WRITES_ALLOWED: ${manifest.durableWritesAllowed === true}`,
    `REVIEW_STYLEBOARD_ALLOWED: ${manifest.reviewStyleboardAllowed === true}`,
    `BLOCKED_REASON: ${manifest.blockedReason || "none"}`,
    `NEXT_PRODUCER: ${formatProducerSummary(manifest.nextProducer)}`,
    `NEXT_QUESTION_SOURCE: ${manifest.nextQuestionSource || "none"}`,
    `NEXT_QUESTION_AXIS: ${manifest.nextQuestionAxis || "none"}`,
    `PREWRITE_NEXT_QUESTION: ${manifest.nextQuestion || "none"}`,
    `VARIANT_SET: ${manifest.variantSet?.active === true ? `active count=${manifest.variantSet.requestedVariantCount} manifest=${manifest.variantSet.manifestPath}` : "inactive"}`,
    "FILES:",
  ];
  for (const file of manifest.files || []) {
    const producer = file.producerId
      ? ` [producer=${file.producerType}:${file.producerId}@${file.stageId}; receipt=${file.receiptTrusted ? "trusted" : file.receiptPresent ? "present-untrusted" : "missing"}]`
      : "";
    lines.push(`- ${file.status} ${file.writeClass} ${file.path}${producer}${file.gateReason ? ` :: ${file.gateReason}` : ""}`);
  }
  return lines.join("\n");
}

export function assertDesignWriteAllowed(writeGate = {}, {
  writeClass = "durable-design-artifacts",
  artifact = "design artifact",
} = {}) {
  const allowed = new Set(writeGate.allowedWriteClasses || []);
  if (allowed.has(writeClass)) return true;
  const reason = writeGate.blockedReason || "design write gate is blocked";
  throw new Error(`${artifact}: ${writeClass} write blocked by /supervibe-design writeGate: ${reason}`);
}

export function validateDesignAgentInvocationReceipts(rootDir = process.cwd(), options = {}) {
  const scope = normalizeDesignReceiptScope(options);
  const receipts = readAllReceipts(rootDir).filter((receipt) => receiptMatchesDesignScope(receipt, scope));
  const expected = expectedReceiptsForDurableOutputs(rootDir, scope);
  const issues = [];
  const warnings = [];

  if (scope.active && expected.length === 0) {
    issues.push({
      code: "active-design-receipt-scope-empty",
      file: scopeFileHint(scope),
      expectedAgentId: null,
      message: "active /supervibe-design receipt validation found no scoped durable outputs to check; do not treat this as completed specialist work",
    });
  }

  for (const item of expected) {
    const matching = receipts.filter((receipt) => receiptMatches(receipt, item));
    if (matching.length === 0) {
      issues.push({
        code: "missing-design-agent-receipt",
        file: item.outputArtifact,
        expectedAgentId: item.agentId,
        message: `${item.outputArtifact}: missing completed ${item.agentId} invocation receipt`,
      });
      continue;
    }
    for (const receipt of matching) {
      for (const problem of validateReceiptShape(rootDir, receipt, item, options)) {
        issues.push({
          code: problem.code,
          file: receipt.__file,
          expectedAgentId: item.agentId,
          message: problem.message,
        });
      }
    }
  }

  issues.push(...detectIncompatibleDesignReceipts(receipts));
  warnings.push(...detectDesignReceiptWarnings(receipts, expected));

  return {
    pass: issues.length === 0,
    checked: expected.length,
    receipts: receipts.length,
    scope,
    executionMode: deriveDesignReceiptExecutionMode({ receipts, expected, issues }),
    missingAgents: missingAgentsForIssues(issues),
    missingSubjects: missingSubjectsForIssues(issues),
    qualityImpact: qualityImpactForIssues(issues),
    warnings,
    issues,
  };
}

export function formatDesignPlanPrompt(plan = {}, { intake = null, writeGate = null } = {}) {
  const gate = writeGate || plan.writeGate || buildDesignWriteGate({ intake, plan });
  if (gate.nextQuestion?.source === "intake") {
    return [
      "WRITE_GATE: blocked",
      "NEXT_BLOCKING_QUESTION:",
      gate.nextQuestion.markdown,
    ].join("\n");
  }
  const status = plan.executionStatus || {};
  if (status.executionMode && status.executionMode !== "real-agents" && status.degradedModeQuestion) {
    const executionGate = status.executionMode === "agent-required-blocked"
      ? "EXECUTION_GATE: specialist agents are unavailable; manual emulation is not allowed"
      : `EXECUTION_GATE: ${status.executionMode} mode selected; specialist output claims require real-agents receipts`;
    return [
      "WRITE_GATE: blocked",
      executionGate,
      status.provisioningPlan?.readyToApply ? `AGENT_PROVISIONING: ${status.provisioningPlan.applyCommand}` : null,
      formatDesignWizardQuestion(status.degradedModeQuestion),
    ].filter(Boolean).join("\n");
  }
  const nextQuestion = plan.wizard?.questionQueue?.[0] || null;
  if (!nextQuestion) {
    return [
      gate.durableWritesAllowed ? "WRITE_GATE: ready" : "WRITE_GATE: blocked",
      "NEXT_WIZARD_QUESTION: none",
    ].join("\n");
  }
  if (!isTrustedDesignWizardQuestion(nextQuestion)) {
    return [
      gate.durableWritesAllowed ? "WRITE_GATE: ready" : "WRITE_GATE: blocked",
      agentGateLine(plan),
      "SPECIALIST_QUESTION_GATE: blocked",
      "NEXT_SPECIALIST_QUESTION_PRODUCER:",
      formatQuestionProposalGate(plan, nextQuestion),
    ].join("\n");
  }
  return [
    gate.durableWritesAllowed ? "WRITE_GATE: ready" : "WRITE_GATE: blocked",
    agentGateLine(plan),
    "NEXT_WIZARD_QUESTION:",
    formatDesignWizardQuestion(nextQuestion),
  ].join("\n");
}

export function formatDesignPlanUserPrompt(plan = {}, { intake = null, writeGate = null } = {}) {
  const gate = writeGate || plan.writeGate || buildDesignWriteGate({ intake, plan });
  if (gate.nextQuestion?.source === "intake") {
    return [
      "Before I write design artifacts, one blocking decision is still open.",
      gate.nextQuestion.markdown,
    ].join("\n");
  }
  const status = plan.executionStatus || {};
  if (status.executionMode && status.executionMode !== "real-agents" && status.degradedModeQuestion) {
    return [
      status.executionMode === "agent-required-blocked"
        ? "Required specialists are unavailable, so durable design work stays paused."
        : "Required specialist work has not been recorded yet, so durable design work stays paused.",
      status.provisioningPlan?.readyToApply ? `Setup command: ${status.provisioningPlan.applyCommand}` : null,
      formatDesignWizardQuestion(status.degradedModeQuestion),
    ].filter(Boolean).join("\n");
  }
  const nextQuestion = plan.wizard?.questionQueue?.[0] || null;
  if (!nextQuestion) {
    return gate.durableWritesAllowed
      ? "The design wizard has no open question. Continue to the next ready stage."
      : "The design wizard has no open question, but artifact writes are still paused until the current stage proof is recorded.";
  }
  if (!isTrustedDesignWizardQuestion(nextQuestion)) {
    return [
      "The next visible design question must come from its owning specialist before I present it as agent-authored.",
      friendlyQuestionProposalGate(plan, nextQuestion),
    ].join("\n");
  }
  return [
    "Next design decision:",
    formatDesignWizardQuestion(nextQuestion),
  ].join("\n");
}

function buildDesignExecutionStatus(rootDir = process.cwd(), plan = {}, {
  pluginRoot = null,
  requestedExecutionMode = null,
  locale = "en",
  hostAdapterId = null,
  env = process.env,
} = {}) {
  const stages = Array.isArray(plan.stages) ? plan.stages : [];
  const requiredAgentIds = unique(stages.map((item) => item.agentId).filter(Boolean));
  const requiredSkillIds = unique(stages.map((item) => item.skillId).filter(Boolean));
  const roster = loadMergedAgentRoster({ rootDir, pluginRoot });
  const available = new Set((roster.agents || []).map((agent) => agent.id));
  const missingAgents = requiredAgentIds.filter((agentId) => !available.has(agentId));
  const runtimeProof = buildDesignRuntimeProofStatus(rootDir, plan);
  const hostSelection = selectHostAdapter({
    rootDir,
    env: hostAdapterId ? { ...env, SUPERVIBE_HOST: hostAdapterId } : env,
  });
  const hostDispatch = resolveHostAgentDispatcher(hostSelection.adapter.id);
  const hostDispatchAvailable = hostDispatch?.status === "supported";
  const provisioningPlan = missingAgents.length > 0
    ? createAgentProvisioningPlan({
      projectRoot: rootDir,
      pluginRoot: pluginRoot || rootDir,
      agentIds: requiredAgentIds,
      skillIds: requiredSkillIds,
    })
    : null;
  const explicitMode = normalizeDesignExecutionMode(requestedExecutionMode);
  const requestedMode = explicitMode || (requiredAgentIds.length === 0 ? "inline" : "real-agents");
  const specialistDispatchDeferred = designWizardStillOpen(plan);
  const durableMissingRuntimeProofs = runtimeProof.missingRuntimeProofs || [];
  const activeMissingRuntimeProofs = specialistDispatchDeferred ? [] : durableMissingRuntimeProofs;
  const questionProposalProducers = buildQuestionProposalProducerStatuses(plan, runtimeProof);
  const executionMode = deriveDesignExecutionMode({
    requestedMode,
    requiredAgentIds,
    missingAgents,
    runtimeProof,
    specialistDispatchDeferred,
  });
  const realAgentCapable = requiredAgentIds.length > 0 && missingAgents.length === 0;
  const agentReceiptsAllowed = realAgentCapable && ["real-agents", "hybrid", "agent-dispatch-required"].includes(executionMode);
  const nonRealMode = executionMode !== "real-agents" && executionMode !== "agent-dispatch-required";
  const receiptGate = specialistDispatchDeferred
    ? "question-proposals-before-durable-gate"
    : runtimeProof.producerReceiptsTrusted
      ? "satisfied"
      : "pending-runtime-agent-receipts";

  return {
    executionMode,
    requestedExecutionMode: explicitMode || null,
    executionModes: ["inline", "real-agents", "hybrid", "agent-dispatch-required"],
    requiredAgentIds,
    requiredSkillIds,
    missingAgents,
    provisioningPlan,
    agentsInstalled: realAgentCapable,
    hostDispatchAvailable,
    hostDispatch,
    selectedHost: hostSelection.selectedHost,
    hostConfidence: hostSelection.confidence,
    hostInvocationsLogged: runtimeProof.hostInvocationsLogged,
    agentInvocationsCompleted: runtimeProof.agentInvocationsCompleted,
    agentReceiptsTrusted: specialistDispatchDeferred ? true : runtimeProof.agentReceiptsTrusted,
    producerReceiptsTrusted: specialistDispatchDeferred ? true : runtimeProof.producerReceiptsTrusted,
    durableAgentReceiptsTrusted: runtimeProof.agentReceiptsTrusted,
    durableProducerReceiptsTrusted: runtimeProof.producerReceiptsTrusted,
    completedStageSubjects: runtimeProof.completedStageSubjects,
    specialistDispatchDeferred,
    questionProposalDispatchAllowed: specialistDispatchDeferred && questionProposalProducers.length > 0,
    questionProposalProducers,
    runtimeProofRequirements: runtimeProof.requirements,
    missingRuntimeProofs: activeMissingRuntimeProofs,
    durableMissingRuntimeProofs,
    agentReceiptsAllowed,
    inlineDraftAllowed: executionMode === "inline" || executionMode === "hybrid",
    manualEmulationAllowed: false,
    qualityImpact: missingAgents.length
      ? `Specialist stages cannot run or be claimed without real project agents: ${missingAgents.join(", ")}`
      : executionMode === "inline"
        ? "Inline mode may produce diagnostics and drafts only; it cannot satisfy specialist-agent output claims."
      : executionMode === "hybrid"
        ? "Hybrid mode may run deterministic skills inline, but every agent-owned durable artifact still requires a real host invocation receipt."
        : executionMode === "agent-dispatch-required"
          ? `Agents are installed, but durable outputs are blocked until trusted runtime receipts exist for: ${formatMissingRuntimeProofs(activeMissingRuntimeProofs)}.`
          : specialistDispatchDeferred
            ? "Agents are installed; durable specialist outputs are deferred, but scratch SpecialistQuestionContract proposals may run before wizard gates close."
            : "Runtime agent receipts are trusted for the active durable-output stage.",
    receiptGate,
    degradedModeQuestion: executionMode === "agent-dispatch-required"
      ? buildAgentDispatchQuestion(runtimeProof, { locale })
      : missingAgents.length || nonRealMode
      ? buildDegradedModeQuestion(missingAgents, provisioningPlan, { executionMode, locale })
      : null,
  };
}

function deriveDesignExecutionMode({
  requestedMode = "real-agents",
  requiredAgentIds = [],
  missingAgents = [],
  runtimeProof = {},
  specialistDispatchDeferred = false,
} = {}) {
  if (requestedMode === "inline") return "inline";
  if (requestedMode === "hybrid") return "hybrid";
  if (requiredAgentIds.length === 0) return "inline";
  if (missingAgents.length > 0) return "agent-required-blocked";
  if (specialistDispatchDeferred) return "real-agents";
  return runtimeProof.producerReceiptsTrusted ? "real-agents" : "agent-dispatch-required";
}

function buildDesignRuntimeProofStatus(rootDir = process.cwd(), plan = {}) {
  const requirements = designReceiptRequirementsForPlan(plan);
  const receipts = readAllReceipts(rootDir);
  const statuses = requirements.map((requirement) => {
    const matching = receipts.filter((receipt) => receiptMatchesRequirement(receipt, requirement));
    const validationProblems = matching.flatMap((receipt) => validateReceiptShape(rootDir, receipt, {
      outputArtifact: requirement.outputArtifact,
      agentId: requirement.subjectId,
      stageId: requirement.stageId,
      subjectType: requirement.subjectType,
    }));
    const trusted = matching.length > 0 && matching.some((receipt) => validateReceiptShape(rootDir, receipt, {
      outputArtifact: requirement.outputArtifact,
      agentId: requirement.subjectId,
      stageId: requirement.stageId,
      subjectType: requirement.subjectType,
    }).length === 0);
    return {
      ...requirement,
      receiptPresent: matching.length > 0,
      trusted,
      issues: validationProblems.map((problem) => problem.message),
    };
  });
  const agentStatuses = statuses.filter((item) => isHostAgentSubject(item.subjectType));
  const missingRuntimeProofs = statuses
    .filter((item) => item.trusted !== true)
    .map((item) => ({
      stageId: item.stageId,
      subjectType: item.subjectType,
      subjectId: item.subjectId,
      outputArtifact: item.outputArtifact,
      reason: item.receiptPresent ? "untrusted-runtime-receipt" : "missing-runtime-receipt",
      issues: item.issues,
    }));
  const hostInvocationsLogged = receipts.some((receipt) => {
    if (!isHostAgentSubject(receipt.subjectType)) return false;
    return Boolean(receipt.hostInvocation?.source && receipt.hostInvocation?.invocationId);
  });
  const completedStageSubjects = receipts
    .filter((receipt) => validateWorkflowReceiptTrust(rootDir, receipt).pass === true)
    .map((receipt) => ({
      subjectType: receipt.subjectType,
      subjectId: receipt.subjectId ?? receipt.agentId ?? receipt.skillId,
      stageId: receipt.stage,
      hostInvocation: receipt.hostInvocation || null,
      outputArtifacts: Array.isArray(receipt.outputArtifacts) ? receipt.outputArtifacts : [],
    }));

  return {
    requirements: statuses,
    hostInvocationsLogged,
    agentInvocationsCompleted: agentStatuses.every((item) => item.trusted === true),
    agentReceiptsTrusted: agentStatuses.every((item) => item.trusted === true),
    producerReceiptsTrusted: statuses.length === 0 || statuses.every((item) => item.trusted === true),
    completedStageSubjects,
    missingRuntimeProofs,
  };
}

function buildQuestionProposalProducerStatuses(plan = {}, runtimeProof = {}) {
  const completed = runtimeProof.completedStageSubjects || [];
  return buildDesignQuestionProposalDispatchQueue(plan.wizard || {}).map((producer) => {
    const outputArtifact = questionProposalOutputArtifact(plan, producer);
    const completedReceipt = completed.find((item) => {
      return item.subjectType === producer.producerType
        && item.subjectId === producer.producerId
        && item.stageId === producer.stageId
        && (item.outputArtifacts || []).includes(outputArtifact);
    });
    const completedForStage = Boolean(completedReceipt);
    return {
      ...producer,
      outputArtifact,
      receiptPresent: completedForStage,
      receiptTrusted: completedForStage,
      hostInvocation: completedReceipt?.hostInvocation || null,
    };
  });
}

function questionProposalOutputArtifact(plan = {}, producer = {}) {
  const slug = sanitizePathPart(plan.slug || "design-run");
  const stage = sanitizePathPart(producer.stageId || "stage");
  const id = sanitizePathPart(producer.producerId || "producer");
  return `.supervibe/artifacts/_agent-outputs/${slug}/question-proposals/${stage}-${id}.json`;
}

function designReceiptRequirementsForPlan(plan = {}) {
  const requirements = [];
  const add = (requirement) => requirements.push(requirement);
  const designSystemApproved = plan.designSystemStatus === "approved";
  if (!designSystemApproved) {
    add({ command: "/supervibe-design", outputArtifact: ".supervibe/artifacts/brandbook/direction.md", subjectType: "agent", subjectId: "creative-director", stageId: "stage-1-brand-direction" });
    for (const artifact of [
      ".supervibe/artifacts/prototypes/_design-system/tokens.css",
      ".supervibe/artifacts/prototypes/_design-system/manifest.json",
      ".supervibe/artifacts/prototypes/_design-system/design-flow-state.json",
      ".supervibe/artifacts/prototypes/_design-system/styleboard.html",
    ]) {
      add({ command: "/supervibe-design", outputArtifact: artifact, subjectType: "skill", subjectId: "supervibe:brandbook", stageId: "stage-2-design-system" });
    }
    add({ command: "/supervibe-design", outputArtifact: ".supervibe/artifacts/prototypes/_design-system/_reviews/architecture.md", subjectType: "agent", subjectId: "design-system-architect", stageId: "stage-2-design-system-review" });
    return requirements;
  }

  if (plan.mode !== "design-system-only") {
    const slug = plan.slug || "<prototype-slug>";
    const variantSet = plan.variantSet?.active
      ? buildDesignVariantSet({
        slug,
        acceptanceContract: plan.acceptanceContract || plan.variantSet,
      })
      : null;
    add({ command: "/supervibe-design", outputArtifact: `.supervibe/artifacts/prototypes/${slug}/spec.md`, subjectType: "agent", subjectId: "ux-ui-designer", stageId: "stage-3-screen-spec" });
    add({ command: "/supervibe-design", outputArtifact: `.supervibe/artifacts/prototypes/${slug}/content/copy.md`, subjectType: "agent", subjectId: "copywriter", stageId: "stage-4-copy" });
    if (variantSet?.active) {
      add({ command: "/supervibe-design", outputArtifact: variantSet.manifestPath, subjectType: "agent", subjectId: "creative-director", stageId: "stage-1-brand-direction" });
      add({ command: "/supervibe-design", outputArtifact: variantSet.diversityReportPath, subjectType: "reviewer", subjectId: "ui-polish-reviewer", stageId: "stage-6-polish-review" });
      for (const variant of variantSet.variants) {
        add({ command: "/supervibe-design", outputArtifact: variant.artifactPath, subjectType: "agent", subjectId: "prototype-builder", stageId: "stage-5-prototype-build" });
        add({ command: "/supervibe-design", outputArtifact: variant.reviewArtifacts.polish, subjectType: "reviewer", subjectId: "ui-polish-reviewer", stageId: "stage-6-polish-review" });
        add({ command: "/supervibe-design", outputArtifact: variant.reviewArtifacts.a11y, subjectType: "reviewer", subjectId: "accessibility-reviewer", stageId: "stage-6-a11y-review" });
      }
    } else {
      add({ command: "/supervibe-design", outputArtifact: `.supervibe/artifacts/prototypes/${slug}/index.html`, subjectType: "agent", subjectId: "prototype-builder", stageId: "stage-5-prototype-build" });
      add({ command: "/supervibe-design", outputArtifact: `.supervibe/artifacts/prototypes/${slug}/_reviews/polish.md`, subjectType: "reviewer", subjectId: "ui-polish-reviewer", stageId: "stage-6-polish-review" });
      add({ command: "/supervibe-design", outputArtifact: `.supervibe/artifacts/prototypes/${slug}/_reviews/a11y.md`, subjectType: "reviewer", subjectId: "accessibility-reviewer", stageId: "stage-6-a11y-review" });
    }
    add({ command: "/supervibe-design", outputArtifact: `.supervibe/artifacts/prototypes/${slug}/_reviews/quality-gate.json`, subjectType: "reviewer", subjectId: "quality-gate-reviewer", stageId: "stage-7-quality-gate" });
  }
  return requirements;
}

function loadMergedAgentRoster({ rootDir = process.cwd(), pluginRoot = null } = {}) {
  const byId = new Map();
  for (const root of unique([rootDir, pluginRoot].filter(Boolean))) {
    const roster = loadAgentRosterSync({ rootDir: root });
    for (const agent of roster.agents || []) {
      if (!byId.has(agent.id)) byId.set(agent.id, agent);
    }
  }
  const agents = [...byId.values()];
  return { agents, count: agents.length };
}

function designWizardStillOpen(plan = {}) {
  return Boolean(
    plan.wizard?.questionQueue?.length
    || plan.wizard?.gates?.tokensUnlocked !== true
    || plan.wizard?.gates?.viewportPolicyRecorded === false,
  );
}

function receiptMatchesRequirement(receipt = {}, requirement = {}) {
  if (receipt.__invalidJson || receipt.status !== "completed") return false;
  if (receipt.command !== requirement.command) return false;
  if (receipt.subjectType !== requirement.subjectType) return false;
  if (receipt.stage !== requirement.stageId) return false;
  const id = receipt.subjectId ?? receipt.agentId ?? receipt.skillId;
  if (id !== requirement.subjectId) return false;
  const outputs = Array.isArray(receipt.outputArtifacts) ? receipt.outputArtifacts : [];
  return outputs.some((output) => sameArtifact(output, requirement.outputArtifact));
}

function isHostAgentSubject(subjectType = "") {
  return ["agent", "worker", "reviewer"].includes(String(subjectType || "").toLowerCase());
}

function formatMissingRuntimeProofs(items = []) {
  const subjects = unique((items || [])
    .map((item) => `${item.subjectId}@${item.stageId}`)
    .filter(Boolean));
  return subjects.length ? subjects.join(", ") : "none";
}

function agentGateLine(plan = {}) {
  if (plan.wizard?.questionQueue?.length) {
    return "AGENT_GATE: collect specialist scratch question proposals before durable design writes; wizard/writeGate still blocks durable artifacts";
  }
  return "AGENT_GATE: invoke each stage specialist before writing its durable output";
}

function designWorkflowStageForPlan(plan = {}) {
  if (plan.writeGate?.nextQuestion?.source === "intake") return "intake";
  if (plan.executionStatus?.executionMode && plan.executionStatus.executionMode !== "real-agents") return "agent-proof";
  if (plan.wizard?.questionQueue?.length) return "candidate-design-system";
  if (plan.wizard?.gates?.reviewStyleboardUnlocked !== true) return "review-styleboard";
  if (plan.mode === "design-system-only") return "approval";
  return "prototype-unlock";
}

function writeClassForDesignArtifact(path = "") {
  if (/styleboard\.html|_reviews\//.test(path)) return "review-styleboard";
  if (/index\.html$/.test(path)) return "prototype";
  if (/\.approvals\//.test(path)) return "run-state";
  if (/design-flow-state\.json|config\.json/.test(path)) return "run-state";
  return "durable-design-artifacts";
}

function producerProofsByArtifact(plan = {}) {
  const entries = plan.executionStatus?.runtimeProofRequirements || [];
  return new Map(entries.map((proof) => [normalizeRelPath(proof.outputArtifact), proof]));
}

function perArtifactWriteStatus({ item = {}, proof = null, gate = {}, allowed = new Set() } = {}) {
  const base = {
    ...item,
    producerType: proof?.subjectType || null,
    producerId: proof?.subjectId || null,
    stageId: proof?.stageId || null,
    receiptPresent: proof?.receiptPresent === true,
    receiptTrusted: proof?.trusted === true,
  };
  if (proof?.trusted === true) {
    return {
      ...base,
      status: "complete",
      gateReason: null,
    };
  }
  if (proof) {
    return {
      ...base,
      status: "blocked",
      gateReason: producerGateReason(proof),
    };
  }
  const classAllowed = allowed.has(item.writeClass);
  return {
    ...base,
    status: classAllowed ? "allowed" : "blocked",
    gateReason: classAllowed ? null : gate.blockedReason || `${item.writeClass} is blocked`,
  };
}

function producerGateReason(proof = {}) {
  const producer = `${proof.subjectType || "producer"}:${proof.subjectId || "unknown"}@${proof.stageId || "unknown-stage"}`;
  if (proof.receiptPresent) {
    const issues = (proof.issues || []).filter(Boolean);
    return `producer receipt present but untrusted for ${producer}${issues.length ? `: ${issues.join("; ")}` : ""}`;
  }
  return `pending producer receipt for ${producer}`;
}

function firstPendingProducer(files = []) {
  const pending = files.find((file) => file.status === "blocked" && file.producerId);
  if (!pending) return null;
  return {
    producerType: pending.producerType,
    producerId: pending.producerId,
    stageId: pending.stageId,
    outputArtifact: pending.path,
    receiptPresent: pending.receiptPresent === true,
    receiptTrusted: pending.receiptTrusted === true,
  };
}

function nextQuestionBlocksProducer(nextQuestion = null) {
  return ["intake", "wizard", "specialist-question-gate"].includes(String(nextQuestion?.source || ""));
}

function formatProducerSummary(producer = null) {
  if (!producer) return "none";
  const receipt = producer.receiptTrusted
    ? "trusted"
    : producer.receiptPresent
      ? "present-untrusted"
      : "missing";
  return `${producer.producerType}:${producer.producerId}@${producer.stageId} -> ${producer.outputArtifact} (${receipt})`;
}

function deriveDesignReceiptExecutionMode({ receipts = [], expected = [], issues = [] } = {}) {
  const designReceipts = receipts.filter((receipt) => receipt.command === "/supervibe-design" && !receipt.__invalidJson);
  if (issues.some((issue) => issue.code === "active-design-receipt-scope-empty")) return "agent-required-blocked";
  if (expected.length === 0) return designReceipts.length > 0 ? "receipt-only" : "not-started";
  const agentReceipts = designReceipts.filter((receipt) => receipt.agentId || receipt.subjectType === "agent");
  const skillReceipts = designReceipts.filter((receipt) => receipt.skillId || receipt.subjectType === "skill");
  const missingAgentIssues = issues.filter((issue) => issue.code === "missing-design-agent-receipt");
  if (missingAgentIssues.length > 0) return "agent-required-blocked";
  if (agentReceipts.length > 0) return "real-agents";
  if (skillReceipts.length > 0) return "skills-only";
  return "agent-required-blocked";
}

function stage(fields) {
  return {
    receiptRequired: true,
    ...fields,
  };
}

function dedupeStages(stages) {
  const seen = new Set();
  const out = [];
  for (const item of stages) {
    const key = `${item.id}:${item.agentId || item.skillId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function buildDegradedModeQuestion(missingAgents, provisioningPlan = null, { executionMode = "agent-required-blocked", locale = "en" } = {}) {
  const ru = String(locale || "en").toLowerCase().startsWith("ru");
  const canProvision = provisioningPlan?.readyToApply === true;
  return {
    locale: ru ? "ru" : "en",
    prompt: ru
      ? "Режим выполнения не доказывает работу specialist agents. Что делаем?"
      : "Execution mode cannot prove specialist agent work. What should happen?",
    why: ru
      ? "Supervibe не должен эмулировать specialist agent stages. Durable design work блокируется, пока реальные агенты не запущены и receipts не выпущены runtime."
      : "Supervibe must not emulate specialist agent stages. Durable design work stays blocked until real agents are present and runtime receipts can be issued.",
    decisionUnlocked: "config.json.executionMode, missingAgents, and qualityImpact",
    ifSkipped: ru
      ? "Остановиться и попросить установить или подключить реальные агенты."
      : "Stop and ask the user to install or connect the missing agents.",
    choices: [
      {
        id: "install-missing-agents",
        label: ru ? "Установить недостающих агентов" : "Install missing agents",
        tradeoff: canProvision
          ? (ru ? `Скопирует нужных агентов и skills в host adapter: ${provisioningPlan.applyCommand}` : `Copies required agents and support skills into the detected host adapter: ${provisioningPlan.applyCommand}`)
          : (ru ? "Нужен понятный plugin source и однозначный host adapter." : "Requires a resolvable plugin source and unambiguous host adapter before continuing."),
        recommended: true,
      },
      {
        id: "connect-host-agents",
        label: ru ? "Подключить host agents" : "Connect host agents",
        tradeoff: ru ? "Выбрать, если host уже имеет native agent registry или connector вне filesystem provisioning." : "Use this when the host already has a native agent registry or connector outside filesystem provisioning.",
      },
      {
        id: "hybrid",
        label: ru ? "Hybrid: skills inline, агенты реально" : "Hybrid: skills inline, agents real",
        tradeoff: ru ? "Skills/diagnostics можно вести inline, но agent-owned outputs требуют настоящих host receipts." : "Skills and diagnostics may run inline, but agent-owned outputs still require real host receipts.",
      },
      {
        id: "inline",
        label: ru ? "Inline draft без agent claims" : "Inline draft without agent claims",
        tradeoff: ru ? "Можно сохранить черновик/диагностику, но нельзя говорить, что creative-director или другие agents работали." : "Can save drafts or diagnostics, but cannot claim creative-director or other agents ran.",
      },
      {
        id: "stop",
        label: ru ? "Остановиться" : "Stop here",
        tradeoff: ru ? "Сохранить состояние и не продолжать скрыто." : "Saves current state and makes no hidden progress.",
      },
    ],
    executionMode,
    missingAgents,
    provisioning: provisioningPlan
      ? {
        readyToApply: provisioningPlan.readyToApply,
        applyCommand: provisioningPlan.applyCommand,
        blockedReason: provisioningPlan.applyBlockedReason,
      }
      : null,
  };
}

function buildAgentDispatchQuestion(runtimeProof = {}, { locale = "en" } = {}) {
  const pending = formatMissingRuntimeProofs(runtimeProof.missingRuntimeProofs || []);
  const ru = String(locale || "en").toLowerCase().startsWith("ru");
  return {
    locale: ru ? "ru" : "en",
    prompt: ru
      ? "Нет runtime receipts от специалистов. Запустить нужных host agents перед durable writes?"
      : "Run the required specialists before writing design artifacts?",
    why: ru
      ? "Файлы agents доказывают только доступность. Durable /supervibe-design artifacts требуют завершенных host invocations и runtime-issued receipts."
      : "Installed specialist files prove availability only. The workflow needs completed specialist runs for the current stage before durable outputs can be trusted.",
    decisionUnlocked: ru
      ? "agent-invocations.jsonl, agent-output.json и workflow receipts для активного stage"
      : "the next trusted stage and permission to write design artifacts",
    ifSkipped: ru
      ? "Держать результат только в diagnostic scratch; не писать и не claiming agent-owned durable artifacts."
      : "Keep output as diagnostic scratch only; do not write final design artifacts.",
    choices: [
      {
        id: "dispatch-host-agents",
        label: ru ? "Запустить специалистов" : "Run specialists",
        tradeoff: ru
          ? `Запустить и залогировать missing stage producers перед writes: ${pending}.`
          : `Continues the chain from the current trusted point: ${pending}.`,
        recommended: true,
      },
      {
        id: "save-scratch-only",
        label: ru ? "Только черновик" : "Draft only",
        tradeoff: ru
          ? "Разрешает диагностику без claims на specialist output и без durable artifact mutations."
          : "Keeps notes without final writes or claims that specialists completed the work.",
      },
      {
        id: "stop",
        label: ru ? "Остановиться" : "Stop here",
        tradeoff: ru ? "Сохранить state и ждать real agent dispatch." : "Preserve state and wait for real agent dispatch.",
      },
    ],
    executionMode: "agent-dispatch-required",
    missingRuntimeProofs: runtimeProof.missingRuntimeProofs || [],
  };
}

function inferExecutionModeFromBrief(text = "") {
  const value = String(text || "").toLowerCase();
  if (/\bhybrid\b|гибрид/i.test(value)) return "hybrid";
  if (/\binline\b|без\s+агент|черновик/i.test(value)) return "inline";
  if (/\breal[- ]agents?\b|реальн[а-яё]+\s+агент/i.test(value)) return "real-agents";
  return null;
}

function normalizeDesignExecutionMode(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/_/g, "-");
  if (!normalized) return null;
  if (["real", "real-agent", "real-agents", "agents"].includes(normalized)) return "real-agents";
  if (["inline", "manual", "draft"].includes(normalized)) return "inline";
  if (normalized === "hybrid") return "hybrid";
  return null;
}

function nextDesignBlockingQuestion({ intake = null, plan = null } = {}) {
  if (intake?.needsQuestion === true) {
    return {
      source: "intake",
      reason: intake.reason || "design intake question required",
      markdown: formatDesignArtifactChoiceQuestion(intake),
    };
  }
  if (plan?.executionStatus?.executionMode && plan.executionStatus.executionMode !== "real-agents") {
    return {
      source: "execution-status",
      reason: plan.executionStatus.executionMode,
      question: plan.executionStatus.degradedModeQuestion,
      markdown: formatDesignWizardQuestion(plan.executionStatus.degradedModeQuestion),
    };
  }
  const question = plan?.wizard?.questionQueue?.[0] || null;
  if (question) {
    if (!isTrustedDesignWizardQuestion(question)) {
      return {
        source: "specialist-question-gate",
        reason: "trusted specialist question proposal required",
        question,
        markdown: formatQuestionProposalGate(plan, question),
      };
    }
    return {
      source: "wizard",
      reason: plan?.wizard?.gates?.blockedReason || "wizard question required",
      question,
      markdown: formatDesignWizardQuestion(question),
    };
  }
  return null;
}

function readTrustedQuestionProposalOutputs(rootDir = process.cwd(), producers = []) {
  const proposals = [];
  for (const producer of producers || []) {
    if (producer.receiptTrusted !== true || !producer.outputArtifact) continue;
    const absPath = join(rootDir, ...String(producer.outputArtifact).split("/"));
    let parsed = null;
    try {
      parsed = JSON.parse(readFileSync(absPath, "utf8"));
    } catch {
      continue;
    }
    const items = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.questionProposals)
        ? parsed.questionProposals
        : Array.isArray(parsed.proposals)
          ? parsed.proposals
          : parsed.questionProposal
            ? [parsed.questionProposal]
            : parsed.proposal
              ? [parsed.proposal]
              : [parsed];
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      proposals.push({
        ...item,
        producer: {
          ...(item.producer || {}),
          type: producer.producerType,
          id: producer.producerId,
          stageId: producer.stageId,
          outputArtifact: producer.outputArtifact,
          receiptTrusted: true,
          receiptPresent: true,
          hostInvocation: producer.hostInvocation || item.producer?.hostInvocation || item.hostInvocation || null,
        },
      });
    }
  }
  return proposals;
}

function formatQuestionProposalGate(plan = {}, question = {}) {
  const producer = (plan.executionStatus?.questionProposalProducers || [])
    .find((item) => item.stageId === question.stage && item.producerId === question.ownerAgent)
    || (plan.executionStatus?.questionProposalProducers || []).find((item) => item.producerId === question.ownerAgent)
    || null;
  const target = producer
    ? `${producer.producerType}:${producer.producerId}@${producer.stageId} -> ${producer.outputArtifact}`
    : `${question.ownerAgent || question.specialist || "specialist"}@${question.stage || "unknown-stage"}`;
  return [
    `REQUIRED_SOURCE: real-specialist-proposal`,
    `CURRENT_SOURCE: ${question.source || question.proposalSource || "unknown"}`,
    `BLOCKED_AXIS: ${question.axis || "unknown"}`,
    `OWNER_AGENT: ${question.ownerAgent || question.specialist || "unknown"}`,
    `PRODUCER: ${target}`,
    "REQUIRED_ACTION: dispatch the owner host agent for a scratch SpecialistQuestionContract proposal, issue a runtime receipt for that proposal artifact, then re-run the plan.",
  ].join("\n");
}

function friendlyQuestionProposalGate(plan = {}, question = {}) {
  const producer = (plan.executionStatus?.questionProposalProducers || [])
    .find((item) => item.stageId === question.stage && item.producerId === question.ownerAgent)
    || (plan.executionStatus?.questionProposalProducers || []).find((item) => item.producerId === question.ownerAgent)
    || null;
  const owner = friendlyProducerName(producer?.producerId || question.ownerAgent || question.specialist || "specialist");
  const stage = friendlyStageName(producer?.stageId || question.stage || "");
  return [
    `Next specialist: ${owner}`,
    `Stage: ${stage}`,
    "Scope: scratch question proposal only; durable design files remain paused.",
    "Continue command: node scripts/design-agent-plan.mjs --continue --dispatch --status --plan-writes --slug <slug>",
  ].join("\n");
}

function friendlyProducerName(value = "") {
  const map = {
    "supervibe-orchestrator": "workflow orchestrator",
    "creative-director": "creative director",
    "ux-ui-designer": "UX/UI designer",
    copywriter: "copywriter",
    "prototype-builder": "prototype builder",
    "ui-polish-reviewer": "UI polish reviewer",
    "accessibility-reviewer": "accessibility reviewer",
    "quality-gate-reviewer": "quality gate reviewer",
    "supervibe:brandbook": "brandbook producer",
  };
  return map[value] || value || "specialist";
}

function friendlyStageName(value = "") {
  if (/stage-0-orchestrator/.test(value)) return "workflow setup";
  if (/stage-1-brand-direction/.test(value)) return "creative direction";
  if (/stage-2-design-system/.test(value)) return "design system";
  if (/stage-3-screen-spec/.test(value)) return "screen specification";
  if (/stage-4-copy/.test(value)) return "copy pass";
  if (/stage-5/.test(value)) return "prototype build";
  if (/stage-6/.test(value)) return "review";
  if (/stage-7/.test(value)) return "quality gate";
  return value || "current stage";
}

function expectedReceiptsForDurableOutputs(rootDir, scope = {}) {
  return expectedProducerReceiptsForDurableOutputs(rootDir, { prototypeSlug: scope.slug })
    .filter((expectation) => expectation.command === "/supervibe-design")
    .map((expectation) => ({
      outputArtifact: expectation.outputArtifact,
      agentId: expectation.subjectId,
      stageId: expectation.stageId,
      subjectType: expectation.subjectType,
    }));
}

function missingAgentsForIssues(issues) {
  return unique((issues || [])
    .filter((issue) => issue.code === "missing-design-agent-receipt")
    .map((issue) => issue.expectedAgentId)
    .filter((id) => !String(id).includes(":"))
    .filter(Boolean));
}

function missingSubjectsForIssues(issues) {
  return unique((issues || [])
    .filter((issue) => issue.code === "missing-design-agent-receipt")
    .map((issue) => issue.expectedAgentId)
    .filter(Boolean));
}

function qualityImpactForIssues(issues) {
  if ((issues || []).some((issue) => issue.code === "active-design-receipt-scope-empty")) {
    return "Active design workflow has no scoped durable-output receipt coverage. Invoke the required specialists and issue runtime receipts before claiming completion.";
  }
  const missing = missingSubjectsForIssues(issues);
  if (missing.length === 0) return null;
  return `Durable design artifacts were found without completed specialist receipts for: ${missing.join(", ")}. Treat this run as degraded until real agent receipts are issued.`;
}

function detectDesignReceiptWarnings(receipts = [], expected = []) {
  const warnings = [];
  const validReceipts = receipts.filter((receipt) => !receipt.__invalidJson);
  if (validReceipts.length > 0 && expected.length === 0) {
    warnings.push({
      code: "design-receipts-without-durable-output-checks",
      file: ".supervibe/artifacts/_workflow-invocations/supervibe-design",
      message: `found ${validReceipts.length} /supervibe-design receipt(s), but no durable design outputs were checked; treat this as receipt-only state, not a green completed run`,
    });
  }
  for (const receipt of validReceipts) {
    const stageCheck = validateWorkflowStageId({ command: receipt.command, stage: receipt.stage });
    if (!stageCheck.pass) {
      warnings.push({
        code: "unknown-design-receipt-stage",
        file: receipt.__file || "workflow receipt",
        message: stageCheck.message,
      });
    }
  }
  return warnings;
}

function detectIncompatibleDesignReceipts(receipts = []) {
  const groups = new Map();
  for (const receipt of receipts || []) {
    if (receipt.__invalidJson || receipt.command !== "/supervibe-design") continue;
    const subjectType = receipt.subjectType || "unknown";
    const subjectId = receipt.subjectId ?? receipt.agentId ?? receipt.skillId ?? "unknown";
    for (const output of receipt.outputArtifacts || []) {
      const artifact = normalizeRelPath(output);
      const key = `${receipt.command}:${artifact}`;
      const item = {
        receipt,
        artifact,
        subjectType,
        subjectId,
        stage: receipt.stage || "unknown-stage",
      };
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
  }

  const issues = [];
  for (const [key, items] of groups.entries()) {
    const compatibleKeys = new Set(items.map((item) => `${item.subjectType}:${item.subjectId}@${item.stage}`));
    if (compatibleKeys.size <= 1) continue;
    const artifact = items[0]?.artifact || key;
    issues.push({
      code: "incompatible-design-receipts",
      file: artifact,
      expectedAgentId: null,
      message: `${artifact}: multiple incompatible /supervibe-design receipts found for one artifact: ${[...compatibleKeys].join(", ")}`,
    });
  }
  return issues;
}

function unique(values) {
  return [...new Set(values)];
}

function readAllReceipts(rootDir) {
  return readWorkflowReceipts(rootDir).filter((receipt) => {
    if (receipt.command === "/supervibe-design") return true;
    return receipt.__invalidJson && normalizeRelPath(receipt.__file || "").includes("_workflow-invocations/supervibe-design/");
  });
}

function normalizeDesignReceiptScope(options = {}) {
  return {
    active: options.active === true,
    slug: normalizeOptional(options.slug || options.prototypeSlug),
    handoffId: normalizeOptional(options.handoffId || options.handoff),
    workflowRunId: normalizeOptional(options.workflowRunId || options.workflow_run_id),
  };
}

function receiptMatchesDesignScope(receipt = {}, scope = {}) {
  if (!scope.handoffId && !scope.workflowRunId) return true;
  if (receipt.__invalidJson) return invalidReceiptPathMatchesDesignScope(receipt, scope);
  if (scope.handoffId && receipt.handoffId !== scope.handoffId) return false;
  if (scope.workflowRunId && receipt.workflowRunId !== scope.workflowRunId && receipt.workflow_run_id !== scope.workflowRunId) return false;
  return true;
}

function invalidReceiptPathMatchesDesignScope(receipt = {}, scope = {}) {
  const file = normalizeRelPath(receipt.__file || "");
  if (!file) return false;
  if (scope.handoffId && !file.includes(`/${scope.handoffId}/`)) return false;
  if (scope.workflowRunId && !file.includes(`/${scope.workflowRunId}/`)) return false;
  return true;
}

function receiptMatches(receipt, expected) {
  if (receipt.__invalidJson) return false;
  if (expected.subjectType && receipt.subjectType !== expected.subjectType) return false;
  const id = receipt.subjectId ?? receipt.agentId ?? receipt.agent_id ?? receipt.skillId ?? receipt.skill_id;
  if (id !== expected.agentId) return false;
  const outputs = Array.isArray(receipt.outputArtifacts) ? receipt.outputArtifacts : [];
  return outputs.some((output) => sameArtifact(output, expected.outputArtifact));
}

function validateReceiptShape(rootDir, receipt, expected, options = {}) {
  const issues = [];
  if (receipt.__invalidJson) return [{ code: "invalid-design-agent-receipt", message: "receipt is not valid JSON" }];
  for (const field of REQUIRED_RECEIPT_FIELDS) {
    if (receipt[field] === undefined || receipt[field] === null || receipt[field] === "") {
      issues.push({ code: "invalid-design-agent-receipt", message: `${receipt.__file}: missing ${field}` });
    }
  }
  if (receipt.invokedBy !== "supervibe-design") {
    issues.push({ code: "invalid-design-agent-receipt", message: `${receipt.__file}: invokedBy must be supervibe-design` });
  }
  if (expected.subjectType && receipt.subjectType !== expected.subjectType) {
    issues.push({ code: "invalid-design-agent-receipt", message: `${receipt.__file}: subjectType must be ${expected.subjectType} for durable output ${expected.outputArtifact}` });
  }
  const subjectId = receipt.subjectId ?? receipt.agentId ?? receipt.skillId;
  if (subjectId !== expected.agentId) {
    issues.push({ code: "invalid-design-agent-receipt", message: `${receipt.__file}: subject must be ${expected.agentId} for durable output ${expected.outputArtifact}` });
  }
  if (receipt.stage !== expected.stageId) {
    issues.push({ code: "invalid-design-agent-receipt", message: `${receipt.__file}: stage must be ${expected.stageId} for durable output ${expected.outputArtifact}` });
  }
  if (receipt.status !== "completed") {
    issues.push({ code: "invalid-design-agent-receipt", message: `${receipt.__file}: status must be completed for durable output ${expected.outputArtifact}` });
  }
  if (!Array.isArray(receipt.inputEvidence) || receipt.inputEvidence.length === 0) {
    issues.push({ code: "invalid-design-agent-receipt", message: `${receipt.__file}: inputEvidence must be a non-empty array` });
  }
  if (!Array.isArray(receipt.outputArtifacts) || receipt.outputArtifacts.length === 0) {
    issues.push({ code: "invalid-design-agent-receipt", message: `${receipt.__file}: outputArtifacts must be a non-empty array` });
  }
  const trust = validateWorkflowReceiptTrust(rootDir, receipt, options);
  for (const message of trust.issues) {
    issues.push({
      code: /artifact link manifest missing|artifact link missing/i.test(message)
        ? "missing-design-artifact-receipt-link"
        : "untrusted-design-agent-receipt",
      message: `${receipt.__file}: ${message}`,
    });
  }
  for (const problem of validateHostInvocationProof(rootDir, receipt, options)) {
    issues.push({
      code: problem.code,
      message: problem.message,
    });
  }
  return issues;
}

function sameArtifact(left, right) {
  const a = normalizeRelPath(left);
  const b = normalizeRelPath(right);
  return a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`);
}

function normalizeRelPath(path) {
  return String(path ?? "").split(sep).join("/");
}

function normalizeOptional(value) {
  const normalized = String(value ?? "").trim();
  return normalized || "";
}

function scopeFileHint(scope = {}) {
  if (scope.handoffId) return `.supervibe/artifacts/_workflow-invocations/supervibe-design/${scope.handoffId}`;
  if (scope.workflowRunId) return `.supervibe/artifacts/_workflow-invocations/supervibe-design/${scope.workflowRunId}`;
  if (scope.slug) return `.supervibe/artifacts/prototypes/${scope.slug}`;
  return ".supervibe/artifacts/_workflow-invocations/supervibe-design";
}

function sanitizePathPart(value = "") {
  return String(value || "item")
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "item";
}
