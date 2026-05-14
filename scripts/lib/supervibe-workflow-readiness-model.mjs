export const WORKFLOW_READINESS_PROBE_ORDER = Object.freeze([
  "receipts",
  "indexHealth",
  "graphProof",
  "commandAgentPlan",
  "cleanupDebt",
  "verificationPolicy",
  "maturity",
]);

export const FINAL_ONLY_VERIFICATION_WORKFLOW_TYPES = Object.freeze([
  "plan",
  "graph",
  "task",
]);

export const PLAN_GRAPH_TASK_FINAL_ONLY_VERIFICATION_POLICY = Object.freeze({
  schemaVersion: 1,
  id: "plan-graph-task-final-only-release-verification",
  mode: "final-only-release-verification",
  appliesTo: FINAL_ONLY_VERIFICATION_WORKFLOW_TYPES,
  development: Object.freeze({
    testsAllowed: false,
    validatorsAllowed: false,
    runnableVerificationCommands: Object.freeze([]),
    policy: "Plan, graph, and task workflows must not schedule tests or validators during development; defer them to the final release gate.",
  }),
  release: Object.freeze({
    testsRequired: true,
    validatorsRequired: true,
    finalValidationRequired: true,
    strictReleaseGateRequired: true,
    policy: "Final release validation remains mandatory before release or phase handoff.",
  }),
});

const DEFAULT_NEXT_ACTIONS = Object.freeze({
  receipts: "run node scripts/workflow-receipt.mjs recovery-status",
  indexHealth: "run node scripts/build-code-index.mjs --root . --resume --source-only --health --json-progress",
  graphProof: "defer to final release gate: npm run validate:work-item-graphs",
  commandAgentPlan: "defer to final release gate: node scripts/command-agent-plan.mjs --strict --command <workflow-command>",
  cleanupDebt: "close/reset scoped host-managed subagents before spawning more agents",
  verificationPolicy: "restore plan/graph/task final-only release verification scheduling",
  maturity: "defer to final release gate: npm run validate:workflow-logic-10of10:dev",
});

export function buildWorkflowReadinessModel({
  receipts = null,
  indexHealth = null,
  graphProof = null,
  commandAgentPlan = null,
  cleanupDebt = null,
  verificationPolicy = PLAN_GRAPH_TASK_FINAL_ONLY_VERIFICATION_POLICY,
  maturity = null,
} = {}) {
  const probes = {
    receipts: normalizeProbe("receipts", receipts),
    indexHealth: normalizeProbe("indexHealth", indexHealth),
    graphProof: normalizeProbe("graphProof", graphProof),
    commandAgentPlan: normalizeProbe("commandAgentPlan", commandAgentPlan),
    cleanupDebt: normalizeProbe("cleanupDebt", cleanupDebt, { invertCount: true }),
    verificationPolicy: normalizeVerificationPolicyProbe(verificationPolicy),
    maturity: normalizeProbe("maturity", maturity),
  };
  const ordered = WORKFLOW_READINESS_PROBE_ORDER.map((id) => probes[id]);
  const primary = ordered.find((probe) => probe.pass !== true) || null;
  return {
    schemaVersion: 1,
    kind: "supervibe-workflow-readiness-model",
    pass: !primary,
    status: primary ? "blocked" : "ready",
    primaryAction: primary?.nextAction || "continue with the approved workflow",
    primaryBlocker: primary ? primary.id : null,
    checked: ordered.length,
    finalOnlyVerification: probes.verificationPolicy.pass === true,
    verificationPolicy: probes.verificationPolicy,
    probes: ordered,
    diagnostics: ordered.filter((probe) => probe.pass !== true).slice(1),
  };
}

export function formatWorkflowReadinessModel(model = {}) {
  const lines = [
    "SUPERVIBE_WORKFLOW_READINESS",
    "PASS: " + (model.pass === true),
    "STATUS: " + (model.status || "unknown"),
    "PRIMARY_BLOCKER: " + (model.primaryBlocker || "none"),
    "NEXT_ACTION: " + (model.primaryAction || "unknown"),
    "CHECKED: " + (model.checked || 0),
    "FINAL_ONLY_VERIFICATION: " + (model.finalOnlyVerification === true),
    "FINAL_ONLY_WORKFLOW_TYPES: " + ((model.verificationPolicy?.details?.policy?.appliesTo || []).join(",") || "none"),
    "DEVELOPMENT_TESTS_ALLOWED: " + (model.verificationPolicy?.details?.policy?.development?.testsAllowed === true),
    "DEVELOPMENT_VALIDATORS_ALLOWED: " + (model.verificationPolicy?.details?.policy?.development?.validatorsAllowed === true),
    "RELEASE_FINAL_VALIDATION_REQUIRED: " + (model.verificationPolicy?.details?.policy?.release?.finalValidationRequired === true),
  ];
  for (const probe of model.probes || []) {
    lines.push("PROBE: " + probe.id + " pass=" + (probe.pass === true) + " summary=\"" + (probe.summary || "none") + "\" next=\"" + (probe.nextAction || "none") + "\"");
  }
  return lines.join("\n");
}

export function evaluateFinalOnlyVerificationPolicy(policy = PLAN_GRAPH_TASK_FINAL_ONLY_VERIFICATION_POLICY) {
  const resolvedPolicy = policy && typeof policy === "object" ? policy : {};
  const appliesTo = Array.isArray(resolvedPolicy.appliesTo) ? resolvedPolicy.appliesTo.map((item) => String(item).toLowerCase()) : [];
  const missingWorkflowTypes = FINAL_ONLY_VERIFICATION_WORKFLOW_TYPES.filter((type) => !appliesTo.includes(type));
  const development = resolvedPolicy.development && typeof resolvedPolicy.development === "object" ? resolvedPolicy.development : {};
  const release = resolvedPolicy.release && typeof resolvedPolicy.release === "object" ? resolvedPolicy.release : {};
  const failures = [];
  if (resolvedPolicy.mode !== "final-only-release-verification") failures.push("mode");
  if (missingWorkflowTypes.length > 0) failures.push("appliesTo:" + missingWorkflowTypes.join(","));
  if (development.testsAllowed !== false) failures.push("development.testsAllowed");
  if (development.validatorsAllowed !== false) failures.push("development.validatorsAllowed");
  if (release.testsRequired !== true) failures.push("release.testsRequired");
  if (release.validatorsRequired !== true) failures.push("release.validatorsRequired");
  if (release.finalValidationRequired !== true) failures.push("release.finalValidationRequired");
  if (release.strictReleaseGateRequired !== true) failures.push("release.strictReleaseGateRequired");
  const pass = failures.length === 0;
  return {
    id: "verificationPolicy",
    pass,
    summary: "mode=" + (resolvedPolicy.mode || "unknown")
      + ", appliesTo=" + (appliesTo.join(",") || "none")
      + ", developmentTestsAllowed=" + (development.testsAllowed === true)
      + ", developmentValidatorsAllowed=" + (development.validatorsAllowed === true)
      + ", releaseFinalRequired=" + (release.finalValidationRequired === true),
    nextAction: pass ? null : DEFAULT_NEXT_ACTIONS.verificationPolicy,
    details: {
      policy: resolvedPolicy,
      failures,
    },
  };
}

function normalizeProbe(id, probe = null, options = {}) {
  if (!probe) {
    return {
      id,
      pass: false,
      summary: "not checked",
      nextAction: DEFAULT_NEXT_ACTIONS[id] || "inspect workflow readiness",
      details: null,
    };
  }
  const count = Number(probe.count ?? probe.blockingCount ?? 0);
  const pass = options.invertCount ? count === 0 && probe.pass !== false : probe.pass === true || probe.ready === true || probe.strictReady === true;
  return {
    id,
    pass,
    summary: probe.summary || summarizeProbe(id, probe, { count }),
    nextAction: pass ? null : probe.nextAction || probe.nextRepairCommand || probe.repairCommand || DEFAULT_NEXT_ACTIONS[id] || "inspect workflow readiness",
    details: probe,
  };
}

function normalizeVerificationPolicyProbe(policy = PLAN_GRAPH_TASK_FINAL_ONLY_VERIFICATION_POLICY) {
  return evaluateFinalOnlyVerificationPolicy(policy?.details?.policy || policy);
}

function summarizeProbe(id, probe = {}, { count = 0 } = {}) {
  if (id === "cleanupDebt") return "blocking=" + count + ", diagnostics=" + (probe.diagnosticCount ?? 0);
  if (id === "indexHealth") return "status=" + (probe.status || "unknown") + ", strictReady=" + (probe.strictReady === true);
  if (id === "maturity") return "score=" + (probe.score ?? "unknown") + "/" + (probe.maxScore ?? 10) + ", pass=" + (probe.pass === true);
  if (id === "receipts") return "pass=" + (probe.pass === true) + ", issues=" + ((probe.issues || []).length);
  if (id === "graphProof") return "pass=" + (probe.pass === true) + ", score=" + (probe.score ?? "unknown");
  if (id === "commandAgentPlan") return "pass=" + (probe.pass === true) + ", mode=" + (probe.plan?.executionMode || "unknown");
  if (id === "verificationPolicy") return evaluateFinalOnlyVerificationPolicy(probe).summary;
  return "pass=" + (probe.pass === true);
}
