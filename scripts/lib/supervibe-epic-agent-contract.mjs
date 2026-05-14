import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { relative, sep } from "node:path";

import {
  readWorkflowReceipts,
  validateWorkflowReceiptTrust,
} from "./supervibe-workflow-receipt-runtime.mjs";

const EPIC_AGENT_CONTRACT_SCHEMA_VERSION = 1;
const GRAPH_PRODUCER_PROOF_SCHEMA_VERSION = 1;
const GRAPH_PRODUCER_PROOF_KIND = "work-item-graph-producer-proof";
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


export function createGraphProducerProof({
  required = true,
  command = "/supervibe-loop",
  stage = "work-item-atomization",
  subjectType = "agent",
  subjectId = "work-item-graph-builder",
  agentId = null,
  graphId = null,
  handoffId = null,
  hostInvocation = null,
  hostInvocationSource = null,
  hostInvocationId = null,
  hostInvocationEvidence = null,
  outputArtifact = "graph.json",
  outputArtifacts = [],
  outputBinding = null,
  receiptId = null,
  receiptPath = null,
  createdAt = null,
} = {}) {
  const normalizedSubjectId = normalizeOptional(subjectId || agentId);
  const normalizedHostInvocation = normalizeProofHostInvocation(hostInvocation || {
    source: hostInvocationSource,
    invocationId: hostInvocationId,
    evidencePath: hostInvocationEvidence,
    agentId: agentId || normalizedSubjectId,
  });
  return {
    schemaVersion: GRAPH_PRODUCER_PROOF_SCHEMA_VERSION,
    kind: GRAPH_PRODUCER_PROOF_KIND,
    required: Boolean(required),
    command: normalizeCommand(command),
    stage: normalizeOptional(stage),
    subjectType: normalizeOptional(subjectType || "agent"),
    subjectId: normalizedSubjectId,
    agentId: normalizeOptional(agentId || normalizedSubjectId),
    graphId: normalizeOptional(graphId),
    handoffId: normalizeOptional(handoffId || graphId),
    hostInvocation: normalizedHostInvocation,
    outputBinding: normalizeOutputBinding({
      outputBinding,
      outputArtifact,
      outputArtifacts,
      graphId,
    }),
    receipt: normalizeReceiptBinding({ receiptId, receiptPath }),
    createdAt: createdAt || new Date().toISOString(),
  };
}

export function bindGraphProducerProofOutput(proof = null, { rootDir = process.cwd(), graphPath = null, graphId = null } = {}) {
  if (!proof) return proof;
  const graphRel = graphPath ? normalizeRel(rootDir, graphPath) : null;
  const existing = normalizeOutputBinding({
    outputBinding: proof.outputBinding,
    outputArtifact: proof.outputArtifact,
    outputArtifacts: proof.outputArtifacts,
    graphId: proof.graphId || graphId,
  });
  const artifact = graphRel || existing.artifact || "graph.json";
  return {
    ...proof,
    graphId: proof.graphId || normalizeOptional(graphId),
    outputBinding: {
      ...existing,
      artifact,
      artifacts: uniqueStrings([artifact, ...(existing.artifacts || [])]),
      graphId: existing.graphId || proof.graphId || normalizeOptional(graphId),
    },
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

  const producerProof = validateGraphProducerProof({
    graph,
    graphPath,
    rootDir,
    contract,
  });
  if (producerProof.pass) {
    return {
      pass: issues.length === 0,
      issues,
      trustedReceipts: [],
      producerProof: producerProof.proof,
      proofMode: "graph-producer-proof",
    };
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
    issues.push(missingProducerProofIssue({
      graph,
      graphPath,
      rootDir,
      contract,
      producerProof,
    }));
  }

  return {
    pass: issues.length === 0,
    issues,
    trustedReceipts,
    producerProof: producerProof.proof || null,
    producerProofIssues: producerProof.issues,
    proofMode: trustedReceipts.length > 0 ? "legacy-receipt" : "missing-proof",
  };
}


function validateGraphProducerProof({
  graph = {},
  graphPath = null,
  rootDir = process.cwd(),
  contract = {},
} = {}) {
  const rawProof = graph.metadata?.graphProducerProof || graph.metadata?.producerProof || null;
  const issues = [];
  if (!rawProof?.required) {
    return {
      pass: false,
      present: Boolean(rawProof),
      proof: rawProof || null,
      issues: rawProof ? [proofIssue("graph-producer-proof-not-required", "Graph producer proof is present but not marked required.", { field: "required" })] : [],
      missingFields: rawProof ? ["required"] : ["graphProducerProof"],
    };
  }

  const proof = {
    ...rawProof,
    command: normalizeCommand(rawProof.command),
    stage: normalizeOptional(rawProof.stage),
    subjectType: normalizeOptional(rawProof.subjectType),
    subjectId: normalizeOptional(rawProof.subjectId),
    agentId: normalizeOptional(rawProof.agentId || rawProof.subjectId),
    graphId: normalizeOptional(rawProof.graphId),
    handoffId: normalizeOptional(rawProof.handoffId),
    hostInvocation: normalizeProofHostInvocation(rawProof.hostInvocation),
    outputBinding: normalizeOutputBinding({
      outputBinding: rawProof.outputBinding,
      outputArtifact: rawProof.outputArtifact,
      outputArtifacts: rawProof.outputArtifacts,
      graphId: rawProof.graphId || graph.epicId || graph.graph_id,
    }),
  };

  if (proof.schemaVersion !== GRAPH_PRODUCER_PROOF_SCHEMA_VERSION) {
    issues.push(proofIssue("bad-graph-producer-proof-version", "Graph producer proof schema version is unsupported.", {
      expected: GRAPH_PRODUCER_PROOF_SCHEMA_VERSION,
      actual: proof.schemaVersion,
      field: "schemaVersion",
    }));
  }
  if (proof.kind !== GRAPH_PRODUCER_PROOF_KIND) {
    issues.push(proofIssue("bad-graph-producer-proof-kind", "Graph producer proof kind is unsupported.", {
      expected: GRAPH_PRODUCER_PROOF_KIND,
      actual: proof.kind,
      field: "kind",
    }));
  }
  for (const [field, value] of [
    ["command", proof.command],
    ["stage", proof.stage],
    ["subjectType", proof.subjectType],
    ["subjectId", proof.subjectId],
    ["hostInvocation.source", proof.hostInvocation?.source],
    ["hostInvocation.invocationId", proof.hostInvocation?.invocationId],
    ["outputBinding.artifact", proof.outputBinding?.artifact],
  ]) {
    if (!value) issues.push(proofIssue("missing-graph-producer-proof-field", "Graph producer proof is missing " + field + ".", { field }));
  }

  const graphId = normalizeOptional(graph.epicId || graph.graph_id || graph.id);
  if (proof.graphId && graphId && proof.graphId !== graphId) {
    issues.push(proofIssue("graph-producer-proof-graph-mismatch", "Graph producer proof graphId " + proof.graphId + " does not match graph " + graphId + ".", {
      field: "graphId",
      expected: graphId,
      actual: proof.graphId,
    }));
  }

  const allowedStages = new Set((contract.allowedStages || []).map((stage) => String(stage).toLowerCase()).filter(Boolean));
  if (allowedStages.size > 0 && proof.stage && !allowedStages.has(proof.stage.toLowerCase())) {
    issues.push(proofIssue("graph-producer-proof-stage-not-allowed", "Graph producer proof stage " + proof.stage + " is not allowed by the graph contract.", {
      field: "stage",
      allowedStages: [...allowedStages],
    }));
  }

  const subjectTypes = new Set((contract.requiredSubjectTypes || []).map((type) => String(type).toLowerCase()));
  if (subjectTypes.size > 0 && proof.subjectType && !subjectTypes.has(proof.subjectType.toLowerCase())) {
    issues.push(proofIssue("graph-producer-proof-subject-type-not-allowed", "Graph producer proof subjectType " + proof.subjectType + " is not allowed by the graph contract.", {
      field: "subjectType",
      requiredSubjectTypes: [...subjectTypes],
    }));
  }

  const allowedAgentIds = new Set((contract.allowedAgentIds || []).map((id) => String(id).toLowerCase()).filter(Boolean));
  const proofAgentIds = [proof.agentId, proof.subjectId].map((id) => String(id || "").toLowerCase()).filter(Boolean);
  if (allowedAgentIds.size > 0 && proofAgentIds.length > 0 && !proofAgentIds.some((id) => allowedAgentIds.has(id))) {
    issues.push(proofIssue("graph-producer-proof-subject-not-allowed", "Graph producer proof subject " + proof.subjectId + " is not allowed by the graph contract.", {
      field: "subjectId",
      allowedAgentIds: [...allowedAgentIds],
    }));
  }

  if (graphPath && !producerProofBindsGraph(proof, { rootDir, graphPath, graphId })) {
    issues.push(proofIssue("graph-producer-proof-output-mismatch", "Graph producer proof output binding does not point at this graph artifact.", {
      field: "outputBinding.artifact",
      expectedOutputArtifact: normalizeRel(rootDir, graphPath),
      actualOutputArtifacts: proof.outputBinding?.artifacts || [],
    }));
  }

  return {
    pass: issues.length === 0,
    present: true,
    proof,
    issues,
    missingFields: issues.filter((item) => item.field).map((item) => item.field),
  };
}

function missingProducerProofIssue({ graph = {}, graphPath = null, rootDir = process.cwd(), contract = {}, producerProof = {} } = {}) {
  const graphId = graph.epicId || graph.graph_id || graph.id || null;
  const stages = Array.isArray(contract.allowedStages) && contract.allowedStages.length > 0
    ? contract.allowedStages
    : [contract.stage || "work-item-atomization"];
  const subjectIds = Array.isArray(contract.allowedAgentIds) ? contract.allowedAgentIds : DEFAULT_EPIC_AGENT_IDS;
  const outputArtifact = graphPath ? normalizeRel(rootDir, graphPath) : contract.outputArtifact || "graph.json";
  const repairScope = {
    command: producerProof.proof?.command || "/supervibe-loop",
    stage: stages[0] || "work-item-atomization",
    allowedStages: stages,
    subjectIds,
    subjectTypes: contract.requiredSubjectTypes || ["agent", "worker", "reviewer"],
    graphId,
    handoffId: producerProof.proof?.handoffId || graphId,
    outputArtifact,
    hostInvocationRequired: true,
    producerProofPath: "graph.metadata.graphProducerProof",
    receiptCommand: "node scripts/agent-invocation.mjs log --agent <agent-id> --host <host> --host-invocation-id <id> --task \"create durable epic/task graph\" --issue-receipt --command /supervibe-loop --stage " + (stages[0] || "work-item-atomization") + " --handoff-id " + (graphId || "<graph-id>") + " --output-artifacts " + outputArtifact,
  };
  const missingFields = producerProof.missingFields?.length ? producerProof.missingFields : ["graphProducerProof"];
  return issue(
    "missing-epic-agent-receipt",
    graphId,
    "Durable epic/task graph is missing first-class producer proof or a trusted scoped runtime receipt. Repair scope: command=" + repairScope.command + " stage=" + repairScope.stage + " graphId=" + (repairScope.graphId || "<graph-id>") + " handoffId=" + (repairScope.handoffId || "<handoff-id>") + " outputArtifact=" + repairScope.outputArtifact + " subjectIds=" + subjectIds.join(",") + ".",
    {
      repairScope,
      missingProducerProofFields: missingFields,
      producerProofIssues: producerProof.issues || [],
    },
  );
}

function producerProofBindsGraph(proof = {}, { rootDir = process.cwd(), graphPath = null, graphId = null } = {}) {
  const graphRel = graphPath ? normalizeRel(rootDir, graphPath) : "";
  const binding = proof.outputBinding || {};
  const artifacts = uniqueStrings([binding.artifact, ...(binding.artifacts || [])]).map(normalizePath);
  if (graphRel && artifacts.includes(graphRel)) return true;
  if (graphRel && artifacts.some((artifact) => artifact && graphRel.endsWith("/" + artifact))) return true;
  if (graphRel && artifacts.includes("graph.json") && graphRel.endsWith("/graph.json")) return true;
  if (graphId && binding.graphId && String(binding.graphId) === String(graphId) && artifacts.length > 0) return true;
  return false;
}

function proofIssue(code, message, extra = {}) {
  return { code, message, ...extra };
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


function normalizeProofHostInvocation(proof = null) {
  if (!proof) return null;
  const source = normalizeOptional(proof.source || proof.hostInvocationSource);
  const invocationId = normalizeOptional(proof.invocationId || proof.invocation_id || proof.id || proof.hostInvocationId);
  const evidencePath = normalizeOptional(proof.evidencePath || proof.evidence_path || proof.hostInvocationEvidence);
  const agentId = normalizeOptional(proof.agentId || proof.agent_id || proof.subjectId);
  if (!source && !invocationId && !evidencePath && !agentId) return null;
  return { source, invocationId, evidencePath, agentId };
}

function normalizeOutputBinding({ outputBinding = null, outputArtifact = null, outputArtifacts = [], graphId = null } = {}) {
  const artifacts = uniqueStrings([
    outputBinding?.artifact,
    ...(Array.isArray(outputBinding?.artifacts) ? outputBinding.artifacts : []),
    outputArtifact,
    ...(Array.isArray(outputArtifacts) ? outputArtifacts : []),
  ]).map(normalizePath);
  return {
    mode: normalizeOptional(outputBinding?.mode || "output"),
    artifact: artifacts[0] || null,
    artifacts,
    graphId: normalizeOptional(outputBinding?.graphId || graphId),
  };
}

function normalizeReceiptBinding({ receiptId = null, receiptPath = null } = {}) {
  if (!receiptId && !receiptPath) return null;
  return {
    receiptId: normalizeOptional(receiptId),
    receiptPath: normalizeOptional(receiptPath) ? normalizePath(receiptPath) : null,
  };
}

function normalizeCommand(value) {
  const normalized = normalizeOptional(value);
  if (!normalized) return null;
  return normalized.startsWith("/") ? normalized : "/" + normalized;
}

function normalizeOptional(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function uniqueStrings(values = []) {
  return [...new Set(values.map((item) => String(item || "").trim()).filter(Boolean))];
}

function issue(code, itemId, message, extra = {}) {
  return { code, itemId: itemId || null, message, ...extra };
}
