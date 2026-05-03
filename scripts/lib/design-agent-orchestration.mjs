import { sep } from "node:path";
import { loadAgentRosterSync } from "./supervibe-agent-roster.mjs";
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
  mode = null,
  currentWindow = null,
  deviceScaleFactor = null,
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
    stages: dedupeStages(stages),
  };
  plan.executionStatus = buildDesignExecutionStatus(rootDir, plan);
  return plan;
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

export function formatDesignPlanPrompt(plan = {}) {
  const status = plan.executionStatus || {};
  if (status.executionMode && status.executionMode !== "real-agents" && status.degradedModeQuestion) {
    return [
      "EXECUTION_GATE: real-agents unavailable",
      formatDesignWizardQuestion(status.degradedModeQuestion),
    ].join("\n");
  }
  const nextQuestion = plan.wizard?.questionQueue?.[0] || null;
  if (!nextQuestion) {
    return [
      "EXECUTION_GATE: ready",
      "NEXT_WIZARD_QUESTION: none",
    ].join("\n");
  }
  return [
    "EXECUTION_GATE: real-agents required",
    "NEXT_WIZARD_QUESTION:",
    formatDesignWizardQuestion(nextQuestion),
  ].join("\n");
}

function buildDesignExecutionStatus(rootDir = process.cwd(), plan = {}) {
  const stages = Array.isArray(plan.stages) ? plan.stages : [];
  const requiredAgentIds = unique(stages.map((item) => item.agentId).filter(Boolean));
  const requiredSkillIds = unique(stages.map((item) => item.skillId).filter(Boolean));
  const roster = loadAgentRosterSync({ rootDir });
  const available = new Set((roster.agents || []).map((agent) => agent.id));
  const missingAgents = requiredAgentIds.filter((agentId) => !available.has(agentId));
  const executionMode = requiredAgentIds.length === 0
    ? "skills-only"
    : missingAgents.length > 0
      ? "agent-required-blocked"
      : "real-agents";

  return {
    executionMode,
    requiredAgentIds,
    requiredSkillIds,
    missingAgents,
    qualityImpact: missingAgents.length
      ? `Specialist stages cannot be claimed as multi-agent output without these agents: ${missingAgents.join(", ")}`
      : "All planned specialist agents are present; durable outputs still require runtime receipts.",
    receiptGate: "pending-until-runtime-issued-receipts",
    degradedModeQuestion: missingAgents.length
      ? buildDegradedModeQuestion(missingAgents)
      : null,
  };
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

function buildDegradedModeQuestion(missingAgents) {
  return {
    prompt: "Step N/M: specialist agents are unavailable. Continue degraded or stop?",
    why: "A manual draft can be useful, but it must not be presented as completed multi-agent design work.",
    decisionUnlocked: "config.json.executionMode, missingAgents, and qualityImpact",
    ifSkipped: "Stop and ask the user to connect the missing agents.",
    choices: [
      {
        id: "stop-connect-agents",
        label: "Stop and connect agents",
        tradeoff: "Preserves workflow quality and prevents false specialist claims.",
        recommended: true,
      },
      {
        id: "save-manual-draft",
        label: "Save non-agent manual draft",
        tradeoff: "Allows notes, but blocks agent-stage completion and marks quality impact visibly.",
      },
      {
        id: "skills-only",
        label: "Run deterministic skill stages only",
        tradeoff: "Limits work to validation, memory, receipts, and materialization steps.",
      },
      {
        id: "stop",
        label: "Stop here",
        tradeoff: "Saves current state and makes no hidden progress.",
      },
    ],
    missingAgents,
  };
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
