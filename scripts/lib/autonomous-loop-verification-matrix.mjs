const EVIDENCE_TYPES = new Set([
  "deterministic assertion",
  "trace assertion",
  "integration check",
  "browser check",
  "semantic evaluation with rubric",
]);

const LEVELS = new Set(["module", "wave", "phase", "production-prep"]);

export function createVerificationMatrix(tasks = [], contracts = []) {
  const contractByTask = new Map(contracts.map((contract) => [contract.taskId, contract]));
  return tasks.map((task) => {
    const contract = contractByTask.get(task.id);
    const evidenceType = inferEvidenceType(task, contract);
    const anchorRefs = (contract?.semanticAnchors || task.semanticAnchors || []).map((anchor) => anchor.anchorId || anchor.id).filter(Boolean);
    return {
      scenarioId: `verify-${task.id}`,
      contractRef: contract?.contractId || `contract-${task.id}`,
      taskId: task.id,
      evidenceType,
      command: task.verificationCommands?.[0] || null,
      expectedOutcome: task.verificationCommands?.length > 0 ? "command exits 0 or documented test gap is accepted" : "rubric evidence supports acceptance criteria",
      requiredMarkers: [
        `[${contract?.moduleType || "CORE_LOGIC"}][${task.id}][PASS]`,
        ...anchorRefs.map((anchorId) => `[ANCHOR:${anchorId}][PASS]`),
      ],
      forbiddenMarkers: ["provider bypass", "raw secret", "hidden background execution"],
      level: task.policyRiskLevel === "high" ? "production-prep" : task.dependencies?.length > 0 ? "wave" : "module",
      anchoredRegionRefs: anchorRefs,
      assignmentRefs: assignmentRefs(task),
    };
  });
}

export function validateVerificationMatrixEntries(entries = []) {
  const issues = [];
  for (const entry of entries) {
    for (const field of ["scenarioId", "contractRef", "taskId", "evidenceType", "expectedOutcome", "requiredMarkers", "forbiddenMarkers", "level"]) {
      if (!(field in entry)) issues.push({ code: "missing-field", scenarioId: entry.scenarioId, field });
    }
    if (!EVIDENCE_TYPES.has(entry.evidenceType)) {
      issues.push({ code: "bad-evidence-type", scenarioId: entry.scenarioId, evidenceType: entry.evidenceType });
    }
    if (!LEVELS.has(entry.level)) {
      issues.push({ code: "bad-level", scenarioId: entry.scenarioId, level: entry.level });
    }
  }
  return { pass: issues.length === 0, issues };
}

export function validateEvidenceCoverage({ tasks = [], matrix = [], gates = [] } = {}) {
  const issues = [];
  const matrixByTask = new Map();
  for (const entry of matrix) {
    if (!matrixByTask.has(entry.taskId)) matrixByTask.set(entry.taskId, []);
    matrixByTask.get(entry.taskId).push(entry);
  }

  for (const task of tasks) {
    const entries = matrixByTask.get(task.id) || [];
    const blockedGate = gates.some((gate) => gate.taskId === task.id && ["open", "waiting", "blocked"].includes(gate.status));
    if (entries.length === 0 && !task.testGapAccepted) {
      issues.push({ code: "missing-verification-entry", taskId: task.id });
      continue;
    }
    if (requiresBrowserEvidence(task) && !entries.some((entry) => entry.evidenceType === "browser check")) {
      issues.push({ code: "missing-browser-evidence", taskId: task.id });
    }
    if (requiresIntegrationEvidence(task) && !blockedGate && !entries.some((entry) => entry.evidenceType === "integration check")) {
      issues.push({ code: "missing-integration-evidence", taskId: task.id });
    }
    if (requiresTraceEvidence(task) && !entries.some((entry) => entry.evidenceType === "trace assertion")) {
      issues.push({ code: "missing-trace-evidence", taskId: task.id });
    }
  }

  return { pass: issues.length === 0, issues };
}

export function evidenceMatchesScenario(scenario, observedEvidence = "") {
  const text = Array.isArray(observedEvidence) ? observedEvidence.join("\n") : String(observedEvidence || "");
  const missingMarkers = (scenario.requiredMarkers || []).filter((marker) => !text.includes(marker));
  const forbiddenMarkers = (scenario.forbiddenMarkers || []).filter((marker) => text.toLowerCase().includes(marker.toLowerCase()));
  return {
    pass: missingMarkers.length === 0 && forbiddenMarkers.length === 0,
    missingMarkers,
    forbiddenMarkers,
  };
}

function inferEvidenceType(task, contract) {
  const text = `${task.category || ""} ${task.goal || ""} ${contract?.moduleType || ""}`.toLowerCase();
  if (requiresBrowserEvidence(task)) return "browser check";
  if (requiresIntegrationEvidence(task)) return "integration check";
  if (requiresTraceEvidence(task)) return "trace assertion";
  if (task.verificationCommands?.length > 0) return "deterministic assertion";
  return "semantic evaluation with rubric";
}

function requiresBrowserEvidence(task) {
  return /(ui|browser|preview|component|design)/i.test(`${task.category || ""} ${task.goal || ""}`);
}

function requiresIntegrationEvidence(task) {
  return /(integration|api|mcp|external|runtime)/i.test(`${task.category || ""} ${task.goal || ""}`);
}

function requiresTraceEvidence(task) {
  return /(refactor|caller|callee|blast-radius|public api|architecture)/i.test(`${task.category || ""} ${task.goal || ""}`);
}

function assignmentRefs(task = {}) {
  return [
    task.assignmentExplanationId,
    task.dispatchId,
    ...(task.assignmentRefs || []),
  ].filter(Boolean);
}
