import { relative, sep } from "node:path";

import {
  readWorkflowReceipts,
  validateWorkflowReceiptTrust,
} from "./supervibe-workflow-receipt-runtime.mjs";

const EPIC_AGENT_CONTRACT_SCHEMA_VERSION = 1;
const DEFAULT_EPIC_AGENT_IDS = Object.freeze([
  "stack-developer",
  "supervibe-orchestrator",
  "quality-gate-reviewer",
  "work-item-graph-builder",
]);

export function createEpicAgentContract({
  required = true,
  agentIds = DEFAULT_EPIC_AGENT_IDS,
  stage = "work-item-atomization",
  outputArtifact = "graph.json",
} = {}) {
  return {
    schemaVersion: EPIC_AGENT_CONTRACT_SCHEMA_VERSION,
    required: Boolean(required),
    stage,
    outputArtifact,
    requiredSubjectTypes: ["agent", "worker"],
    allowedAgentIds: [...new Set(agentIds.map((agentId) => String(agentId).trim()).filter(Boolean))],
    trust: "runtime-issued-host-agent-receipt",
  };
}

export function validateEpicAgentContract({ rootDir = process.cwd(), graph = {}, graphPath = null } = {}) {
  const issues = [];
  const contract = graph.metadata?.epicAgentContract || null;
  const requiresContract = graph.metadata?.createdFrom === "plan"
    && graph.metadata?.planReviewPassed === true
    && graph.metadata?.dryRun !== true;

  if (requiresContract && contract?.required !== true) {
    issues.push(issue("missing-epic-agent-contract", graph.epicId, "Plan-created durable work-item graph is missing a required epic-agent receipt contract."));
    return { pass: false, issues, trustedReceipts: [] };
  }
  if (!contract?.required) return { pass: true, issues, trustedReceipts: [] };

  if (contract.schemaVersion !== EPIC_AGENT_CONTRACT_SCHEMA_VERSION) {
    issues.push(issue("bad-epic-agent-contract-version", graph.epicId, "Epic-agent contract schema version is unsupported."));
  }
  if (!Array.isArray(contract.allowedAgentIds) || contract.allowedAgentIds.length === 0) {
    issues.push(issue("missing-epic-agent-ids", graph.epicId, "Epic-agent contract must name allowed real-agent ids."));
  }
  if (!Array.isArray(contract.requiredSubjectTypes) || !contract.requiredSubjectTypes.some((type) => ["agent", "worker"].includes(String(type)))) {
    issues.push(issue("missing-epic-agent-subject-types", graph.epicId, "Epic-agent contract must require agent or worker receipts."));
  }
  if (!graphPath) {
    issues.push(issue("missing-epic-agent-graph-path", graph.epicId, "Epic-agent receipt trust check requires a graph path."));
    return { pass: false, issues, trustedReceipts: [] };
  }

  const trustedReceipts = findTrustedEpicAgentReceipts({
    rootDir,
    graphPath,
    allowedAgentIds: contract.allowedAgentIds,
    requiredSubjectTypes: contract.requiredSubjectTypes,
  });
  if (trustedReceipts.length === 0) {
    issues.push(issue("missing-epic-agent-receipt", graph.epicId, "Durable epic/task graph must have a trusted runtime agent or worker receipt bound to graph.json."));
  }

  return {
    pass: issues.length === 0,
    issues,
    trustedReceipts,
  };
}

function findTrustedEpicAgentReceipts({
  rootDir = process.cwd(),
  graphPath,
  allowedAgentIds = DEFAULT_EPIC_AGENT_IDS,
  requiredSubjectTypes = ["agent", "worker"],
} = {}) {
  const graphRel = normalizeRel(rootDir, graphPath);
  const allowed = new Set((allowedAgentIds || []).map((id) => String(id).toLowerCase()));
  const subjectTypes = new Set((requiredSubjectTypes || []).map((type) => String(type).toLowerCase()));
  const trusted = [];

  for (const receipt of readWorkflowReceipts(rootDir)) {
    const subjectType = String(receipt.subjectType || "").toLowerCase();
    if (!subjectTypes.has(subjectType)) continue;
    const agentId = String(receipt.agentId || receipt.subjectId || "").toLowerCase();
    if (allowed.size > 0 && !allowed.has(agentId)) continue;
    const outputArtifacts = Array.isArray(receipt.outputArtifacts) ? receipt.outputArtifacts.map(normalizePath) : [];
    if (!outputArtifacts.includes(graphRel)) continue;
    const trust = validateWorkflowReceiptTrust(rootDir, receipt);
    if (!trust.pass) continue;
    trusted.push({
      receiptId: receipt.receiptId,
      subjectId: receipt.subjectId,
      agentId: receipt.agentId,
      stage: receipt.stage,
    });
  }
  return trusted;
}

function normalizeRel(rootDir, filePath) {
  const value = String(filePath || "");
  if (!value) return "";
  if (/^(?:[A-Za-z]:[\\/]|\/)/.test(value)) return normalizePath(relative(rootDir, value).split(sep).join("/"));
  return normalizePath(value);
}

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function issue(code, itemId, message, extra = {}) {
  return { code, itemId: itemId || null, message, ...extra };
}
