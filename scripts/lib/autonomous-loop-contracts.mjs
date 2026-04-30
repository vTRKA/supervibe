import { createTaskGraph, validateTaskGraph } from "./autonomous-loop-task-graph.mjs";
import { buildFileLocalContractContext } from "./supervibe-file-local-contracts.mjs";

export const MODULE_TYPES = [
  "ENTRY_POINT",
  "CORE_LOGIC",
  "DATA_LAYER",
  "UI_COMPONENT",
  "UTILITY",
  "INTEGRATION",
  "DOCUMENTATION",
  "INFRASTRUCTURE",
];

export function generateContractForTask(task = {}, { semanticAnchors = [], fileLocalContracts = [] } = {}) {
  const moduleType = inferModuleType(task);
  const targetFiles = inferTargetFiles(task);
  const taskAnchors = [
    ...(task.semanticAnchors || []),
    ...semanticAnchors.filter((anchor) => targetFiles.includes(anchor.filePath) || (task.anchorRefs || []).includes(anchor.anchorId)),
  ];
  const localContractContext = buildFileLocalContractContext({
    task: { ...task, targetFiles },
    contracts: [...(task.fileLocalContracts || []), ...fileLocalContracts],
  });
  return {
    contractId: `contract-${task.id}`,
    taskId: task.id,
    purpose: task.goal || task.title || "Complete autonomous loop task",
    scopeIn: task.acceptanceCriteria || ["Task acceptance criteria"],
    scopeOut: ["provider bypass", "hidden background execution", "raw secret handling"],
    inputs: task.dependencies || [],
    outputs: task.acceptanceCriteria || [],
    sideEffects: sideEffectsFor(task),
    forbiddenBehavior: ["provider bypass", "rate-limit bypass", "unauthorized access", "unapproved production mutation"],
    dependencies: task.dependencies || [],
    targetFiles,
    moduleType,
    publicInterfaces: inferPublicInterfaces(task),
    semanticAnchors: taskAnchors,
    fileLocalContracts: localContractContext.contracts,
    fileLocalContractRefs: localContractContext.contracts.map((contract) => contract.contractId),
    observability: ["progress.md entry", "state.json claim/resume notes", "final-report.md evidence"],
    verificationRefs: task.verificationCommands || [],
    source: task.source || { type: "generated" },
  };
}

export function generateContracts(tasks = [], options = {}) {
  return tasks.map((task) => generateContractForTask(task, options));
}

export function scoreAutonomyReadiness({ tasks = [], graph = null, contracts = null, preflight = {}, gates = [], reviewerAvailable = true } = {}) {
  const taskGraph = graph || createTaskGraph({ tasks });
  const graphValidation = validateTaskGraph(taskGraph);
  const contractList = contracts || generateContracts(taskGraph.tasks);
  const byTask = new Map(contractList.map((contract) => [contract.taskId, contract]));
  const dimensions = [
    check("graph-validity", graphValidation.valid, "Fix graph duplicates, unknown dependencies, cycles, or impossible ready front."),
    check("contract-coverage", taskGraph.tasks.every((task) => byTask.has(task.id)), "Generate one execution contract per task."),
    check("verification-coverage", contractList.every((contract) => contract.verificationRefs.length > 0 || contract.moduleType === "DOCUMENTATION"), "Add verification commands or accepted test-gap rationale."),
    check("policy-readiness", gates.every((gate) => !["open", "waiting", "blocked"].includes(gate.status)), "Resolve open policy/approval gates before autonomous execution."),
    check("evidence-expectations", contractList.every((contract) => contract.outputs.length > 0), "Define expected outputs/evidence for every contract."),
    check("rollback-expectations", Boolean(preflight.rollback_expectation), "Define rollback or cleanup expectation in preflight."),
    check("tool-access", Array.isArray(preflight.allowed_write_scope) && preflight.allowed_write_scope.length > 0, "Define allowed write/tool scope."),
    check("reviewer-independence", reviewerAvailable === true, "Provide independent reviewer availability."),
    check("progress-resume", taskGraph.tasks.every((task) => task.stopConditions?.length > 0), "Define stop conditions and resume path for every task."),
    check("side-effect-boundaries", contractList.every((contract) => contract.forbiddenBehavior.includes("unapproved production mutation")), "Declare forbidden side effects and production mutation boundaries."),
  ];
  const score = dimensions.filter((dimension) => dimension.pass).length;
  return {
    score,
    maxScore: 10,
    pass: score >= 9,
    dimensions,
    missing: dimensions.filter((dimension) => !dimension.pass).map((dimension) => dimension.id),
    remediation: dimensions.filter((dimension) => !dimension.pass).map((dimension) => dimension.remediation),
  };
}

export function summarizeContracts(contracts = []) {
  const summary = {
    count: contracts.length,
    withVerification: contracts.filter((contract) => contract.verificationRefs.length > 0).length,
    moduleTypes: [...new Set(contracts.map((contract) => contract.moduleType))],
  };
  const withSemanticAnchors = contracts.filter((contract) => contract.semanticAnchors?.length > 0).length;
  const withFileLocalContracts = contracts.filter((contract) => contract.fileLocalContracts?.length > 0).length;
  if (withSemanticAnchors > 0) summary.withSemanticAnchors = withSemanticAnchors;
  if (withFileLocalContracts > 0) summary.withFileLocalContracts = withFileLocalContracts;
  return summary;
}

function check(id, pass, remediation) {
  return { id, pass: Boolean(pass), remediation };
}

function inferModuleType(task) {
  const value = `${task.category || ""} ${task.goal || ""}`.toLowerCase();
  if (value.includes("entry") || value.includes("command") || value.includes("cli")) return "ENTRY_POINT";
  if (value.includes("data") || value.includes("db") || value.includes("database")) return "DATA_LAYER";
  if (/\bui\b/.test(value) || value.includes("component") || value.includes("design")) return "UI_COMPONENT";
  if (value.includes("integration") || value.includes("mcp") || value.includes("api")) return "INTEGRATION";
  if (value.includes("doc") || value.includes("readme")) return "DOCUMENTATION";
  if (value.includes("infra") || value.includes("deploy") || value.includes("docker")) return "INFRASTRUCTURE";
  if (value.includes("util") || value.includes("helper")) return "UTILITY";
  return "CORE_LOGIC";
}

function inferTargetFiles(task) {
  if (Array.isArray(task.targetFiles)) return task.targetFiles;
  if (task.source?.path) return [task.source.path];
  return [];
}

function inferPublicInterfaces(task) {
  if (Array.isArray(task.publicInterfaces)) return task.publicInterfaces;
  if (task.category === "documentation") return ["documentation artifact"];
  if (task.requiredAgentCapability) return [task.requiredAgentCapability];
  return [];
}

function sideEffectsFor(task) {
  if (task.policyRiskLevel === "high") return ["requires explicit approval before mutation"];
  if ((task.verificationCommands || []).some((command) => command.includes("docker") || command.includes("deploy"))) {
    return ["runtime command execution"];
  }
  return ["repository-local file changes"];
}
