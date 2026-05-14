import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
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
    allowedStages: [...new Set([stage, "review-gate"].filter(Boolean))],
    outputArtifact,
    requiredSubjectTypes: ["agent", "worker", "reviewer"],
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
  if (!Array.isArray(contract.allowedStages) || contract.allowedStages.length === 0) {
    return { pass: true, issues, trustedReceipts: [], legacyContract: true };
  }

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
    allowedStages: contract.allowedStages || [contract.stage].filter(Boolean),
    graphId: graph.epicId || graph.graph_id || graph.id || null,
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
  graphId = null,
  allowedAgentIds = DEFAULT_EPIC_AGENT_IDS,
  requiredSubjectTypes = ["agent", "worker", "reviewer"],
  allowedStages = ["work-item-atomization", "review-gate"],
} = {}) {
  const graphRel = normalizeRel(rootDir, graphPath);
  const allowed = new Set((allowedAgentIds || []).map((id) => String(id).toLowerCase()));
  const subjectTypes = new Set((requiredSubjectTypes || []).map((type) => String(type).toLowerCase()));
  const stages = new Set((allowedStages || []).map((stage) => String(stage).toLowerCase()).filter(Boolean));
  const trusted = [];

  for (const receipt of readWorkflowReceipts(rootDir)) {
    const subjectType = String(receipt.subjectType || "").toLowerCase();
    if (!subjectTypes.has(subjectType)) continue;
    const agentId = String(receipt.agentId || receipt.subjectId || "").toLowerCase();
    if (allowed.size > 0 && !allowed.has(agentId)) continue;
    if (stages.size > 0 && !stages.has(String(receipt.stage || "").toLowerCase())) continue;
    if (!isGraphLevelReceipt(receipt, graphId)) continue;
    const binding = receiptBindsGraph(receipt, { graphRel });
    if (!binding.binds) continue;
    if (binding.mode === "input" && !receiptInputEvidenceCurrent(receipt, { rootDir, graphRel })) continue;
    const trust = validateWorkflowReceiptTrust(rootDir, receipt);
    if (!trust.pass) continue;
    trusted.push({
      receiptId: receipt.receiptId,
      subjectId: receipt.subjectId,
      agentId: receipt.agentId,
      stage: receipt.stage,
      binding: binding.mode,
    });
  }
  return trusted;
}

function receiptBindsGraph(receipt = {}, { graphRel = "" } = {}) {
  const outputArtifacts = Array.isArray(receipt.outputArtifacts) ? receipt.outputArtifacts.map(normalizePath) : [];
  if (graphRel && outputArtifacts.includes(graphRel)) return { binds: true, mode: "output" };
  const inputEvidence = Array.isArray(receipt.inputEvidence) ? receipt.inputEvidence.map(normalizePath) : [];
  if (graphRel && inputEvidence.includes(graphRel)) return { binds: true, mode: "input" };
  return { binds: false, mode: null };
}

function isGraphLevelReceipt(receipt = {}, graphId = null) {
  const taskId = receipt.taskId || receipt.task_id || receipt.workItemBinding?.taskId || receipt.workItemBinding?.task_id || null;
  if (!taskId) return true;
  return Boolean(graphId && String(taskId) === String(graphId));
}

function receiptInputEvidenceCurrent(receipt = {}, { rootDir = process.cwd(), graphRel = "" } = {}) {
  const normalizedGraph = normalizePath(graphRel);
  const inputHashes = Array.isArray(receipt.inputHashes) ? receipt.inputHashes : [];
  const match = inputHashes.find((entry) => normalizePath(entry.path) === normalizedGraph);
  if (!match?.sha256) return false;
  const absPath = joinPath(rootDir, normalizedGraph);
  if (!existsSync(absPath)) return false;
  const currentHash = createHash("sha256").update(readFileSync(absPath)).digest("hex");
  return currentHash === match.sha256;
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

function joinPath(rootDir, relPath) {
  return `${rootDir}/${relPath}`.replace(/\\/g, "/");
}

function issue(code, itemId, message, extra = {}) {
  return { code, itemId: itemId || null, message, ...extra };
}
