import { sep } from "node:path";
import { loadAgentRosterSync } from "./supervibe-agent-roster.mjs";
import {
  formatDesignArtifactChoiceQuestion,
} from "./design-artifact-intake.mjs";
import {
  buildDesignWizardState,
  formatDesignWizardQuestion,
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
  expectedProducerReceiptsForDurableOutputs,
  validateHostInvocationProof,
} from "./agent-producer-contract.mjs";
import { createAgentProvisioningPlan } from "./agent-provisioning.mjs";

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
  flowType = "in-product",
  designSystemStatus = "missing",
  rootDir = process.cwd(),
  pluginRoot = process.cwd(),
  mode = null,
  requestedExecutionMode = null,
  currentWindow = null,
  deviceScaleFactor = null,
  intake = null,
} = {}) {
  const text = String(brief ?? "");
  const sources = Array.isArray(referenceSources) ? referenceSources : [];
  const stages = [];
  const hostWindowMetrics = readDesignWindowMetrics({ rootDir, target });
  const resolvedCurrentWindow = currentWindow || hostWindowMetrics?.currentWindow || null;
  const resolvedDeviceScaleFactor = deviceScaleFactor ?? hostWindowMetrics?.deviceScaleFactor ?? null;
  const wizard = buildDesignWizardState({
    brief,
    target,
    designSystemStatus,
    mode,
    currentWindow: resolvedCurrentWindow,
    deviceScaleFactor: resolvedDeviceScaleFactor,
    initialDecisions: intake?.referenceScopeDecision
      ? { reference_borrow_avoid: intake.referenceScopeDecision }
      : {},
  });

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

  const plan = {
    schemaVersion: 1,
    command: "/supervibe-design",
    target,
    flowType,
    requestedExecutionMode: normalizeDesignExecutionMode(requestedExecutionMode || inferExecutionModeFromBrief(text)),
    mode: wizard.mode,
    requiresReceipts: true,
    receiptDirectory: ".supervibe/artifacts/_workflow-invocations/supervibe-design/<handoff-id>/",
    executionStatus: null,
    wizard,
    viewportPolicy: {
      ...resolveDesignViewportPolicy({
        target,
        currentWindow: resolvedCurrentWindow,
        deviceScaleFactor: resolvedDeviceScaleFactor,
      }),
      metricsSource: hostWindowMetrics?.source || null,
    },
    writeGate: null,
    stages: dedupeStages(stages),
  };
  plan.executionStatus = buildDesignExecutionStatus(rootDir, plan, { pluginRoot, requestedExecutionMode: plan.requestedExecutionMode, locale: wizard.locale });
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
  if (plan?.executionStatus?.executionMode && plan.executionStatus.executionMode !== "real-agents") {
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
  const planned = [
    ...protectedArtifacts.map((path) => ({ path, writeClass: writeClassForDesignArtifact(path) })),
    { path: `.supervibe/artifacts/prototypes/${prototypeSlug}/spec.md`, writeClass: "durable-design-artifacts" },
    { path: `.supervibe/artifacts/prototypes/${prototypeSlug}/content/copy.md`, writeClass: "durable-design-artifacts" },
    { path: `.supervibe/artifacts/prototypes/${prototypeSlug}/index.html`, writeClass: "prototype" },
    { path: `.supervibe/artifacts/prototypes/${prototypeSlug}/_reviews/polish.md`, writeClass: "review-styleboard" },
    { path: `.supervibe/artifacts/prototypes/${prototypeSlug}/_reviews/a11y.md`, writeClass: "review-styleboard" },
  ];
  const allowed = new Set(gate.allowedWriteClasses || []);
  return {
    schemaVersion: 1,
    command: "/supervibe-design",
    workflowStage: designWorkflowStageForPlan(plan),
    durableWritesAllowed: gate.durableWritesAllowed === true,
    reviewStyleboardAllowed: gate.reviewStyleboardAllowed === true,
    blockedReason: gate.blockedReason || null,
    nextQuestion: gate.nextQuestion?.reason || null,
    files: planned.map((item) => ({
      ...item,
      status: allowed.has(item.writeClass) ? "allowed" : "blocked",
      gateReason: allowed.has(item.writeClass) ? null : gate.blockedReason || `${item.writeClass} is blocked`,
    })),
  };
}

export function formatDesignPrewriteManifest(manifest = {}) {
  const lines = [
    "SUPERVIBE_DESIGN_PREWRITE_MANIFEST",
    `WORKFLOW_STAGE: ${manifest.workflowStage || "unknown"}`,
    `DURABLE_WRITES_ALLOWED: ${manifest.durableWritesAllowed === true}`,
    `REVIEW_STYLEBOARD_ALLOWED: ${manifest.reviewStyleboardAllowed === true}`,
    `BLOCKED_REASON: ${manifest.blockedReason || "none"}`,
    `NEXT_QUESTION: ${manifest.nextQuestion || "none"}`,
    "FILES:",
  ];
  for (const file of manifest.files || []) {
    lines.push(`- ${file.status} ${file.writeClass} ${file.path}${file.gateReason ? ` :: ${file.gateReason}` : ""}`);
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
  const receipts = readAllReceipts(rootDir);
  const expected = expectedReceiptsForDurableOutputs(rootDir);
  const issues = [];

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

  return {
    pass: issues.length === 0,
    checked: expected.length,
    receipts: receipts.length,
    executionMode: deriveDesignReceiptExecutionMode({ receipts, expected, issues }),
    missingAgents: missingAgentsForIssues(issues),
    missingSubjects: missingSubjectsForIssues(issues),
    qualityImpact: qualityImpactForIssues(issues),
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
  return [
    gate.durableWritesAllowed ? "WRITE_GATE: ready" : "WRITE_GATE: blocked",
    "EXECUTION_GATE: real-agents required",
    "NEXT_WIZARD_QUESTION:",
    formatDesignWizardQuestion(nextQuestion),
  ].join("\n");
}

function buildDesignExecutionStatus(rootDir = process.cwd(), plan = {}, { pluginRoot = process.cwd(), requestedExecutionMode = null, locale = "en" } = {}) {
  const stages = Array.isArray(plan.stages) ? plan.stages : [];
  const requiredAgentIds = unique(stages.map((item) => item.agentId).filter(Boolean));
  const requiredSkillIds = unique(stages.map((item) => item.skillId).filter(Boolean));
  const roster = loadAgentRosterSync({ rootDir });
  const available = new Set((roster.agents || []).map((agent) => agent.id));
  const missingAgents = requiredAgentIds.filter((agentId) => !available.has(agentId));
  const provisioningPlan = missingAgents.length > 0
    ? createAgentProvisioningPlan({
      projectRoot: rootDir,
      pluginRoot,
      agentIds: requiredAgentIds,
      skillIds: requiredSkillIds,
    })
    : null;
  const explicitMode = normalizeDesignExecutionMode(requestedExecutionMode);
  const executionMode = explicitMode
    || (requiredAgentIds.length === 0
      ? "inline"
      : missingAgents.length > 0
        ? "agent-required-blocked"
        : "real-agents");
  const realAgentCapable = requiredAgentIds.length > 0 && missingAgents.length === 0;
  const agentReceiptsAllowed = realAgentCapable && ["real-agents", "hybrid"].includes(executionMode);
  const nonRealMode = executionMode !== "real-agents";

  return {
    executionMode,
    requestedExecutionMode: explicitMode || null,
    executionModes: ["inline", "real-agents", "hybrid"],
    requiredAgentIds,
    requiredSkillIds,
    missingAgents,
    provisioningPlan,
    agentReceiptsAllowed,
    inlineDraftAllowed: executionMode === "inline" || executionMode === "hybrid",
    manualEmulationAllowed: false,
    qualityImpact: missingAgents.length
      ? `Specialist stages cannot run or be claimed without real project agents: ${missingAgents.join(", ")}`
      : executionMode === "inline"
        ? "Inline mode may produce diagnostics and drafts only; it cannot satisfy specialist-agent output claims."
        : executionMode === "hybrid"
          ? "Hybrid mode may run deterministic skills inline, but every agent-owned durable artifact still requires a real host invocation receipt."
      : "All planned specialist agents are present; durable outputs still require runtime receipts.",
    receiptGate: "pending-until-runtime-issued-receipts",
    degradedModeQuestion: missingAgents.length || nonRealMode
      ? buildDegradedModeQuestion(missingAgents, provisioningPlan, { executionMode, locale })
      : null,
  };
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

function deriveDesignReceiptExecutionMode({ receipts = [], expected = [], issues = [] } = {}) {
  if (expected.length === 0) return "not-started";
  const designReceipts = receipts.filter((receipt) => receipt.command === "/supervibe-design" && !receipt.__invalidJson);
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
    return {
      source: "wizard",
      reason: plan?.wizard?.gates?.blockedReason || "wizard question required",
      question,
      markdown: formatDesignWizardQuestion(question),
    };
  }
  return null;
}

function expectedReceiptsForDurableOutputs(rootDir) {
  return expectedProducerReceiptsForDurableOutputs(rootDir)
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
  const missing = missingSubjectsForIssues(issues);
  if (missing.length === 0) return null;
  return `Durable design artifacts were found without completed specialist receipts for: ${missing.join(", ")}. Treat this run as degraded until real agent receipts are issued.`;
}

function unique(values) {
  return [...new Set(values)];
}

function readAllReceipts(rootDir) {
  return readWorkflowReceipts(rootDir).filter((receipt) => receipt.command === "/supervibe-design");
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
