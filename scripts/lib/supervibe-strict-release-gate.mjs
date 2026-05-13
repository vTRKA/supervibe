import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

import { measureFootprint } from "../measure-token-footprint.mjs";
import { validateActiveWorkflows } from "../validate-active-workflows.mjs";
import { validateEpicCompletionFiles } from "../validate-epic-completion.mjs";
import {
  inspectActivePlanSource,
  validatePlanArtifact,
} from "../validate-plan-artifacts.mjs";
import {
  validatePlanReviewGateForPlan,
} from "../validate-plan-review-artifacts.mjs";
import { buildDesignWorkflowReport } from "./design-workflow-report.mjs";
import { validateSupervibeGcStrict } from "./supervibe-artifact-gc.mjs";
import { buildTaskGraphMaturityReport } from "./supervibe-task-graph-maturity.mjs";
import {
  readWorkflowReceipts,
  validateWorkflowReceiptTrust,
} from "./supervibe-workflow-receipt-runtime.mjs";

const ACTIVE_PROOF_GATE_IDS = Object.freeze([
  "active-workflows",
  "strict-plan",
  "strict-plan-review",
  "trusted-epic-completion",
  "task-graph-runtime-maturity",
]);

const ACTIVE_GRAPH_EPIC_STATUSES = new Set(["open", "active", "ready", "claimed", "blocked", "deferred", "review"]);
const TERMINAL_GRAPH_EPIC_STATUSES = new Set(["closed", "complete", "completed", "done", "skipped", "cancelled"]);

export async function buildStrictReleaseGateReport(rootDir = process.cwd(), options = {}) {
  const resolvedRoot = resolve(rootDir);
  const activeWorkflowResult = validateActiveWorkflows(resolvedRoot, {
    strict: true,
    pluginRoot: options.pluginRoot,
  });
  const requireActiveProof = resolveActiveProofRequirement(options.requireActiveProof, activeWorkflowResult);
  const maturityScope = requireActiveProof ? "active-workflow-readiness" : "global-capability";
  const gates = [];

  gates.push(activeWorkflowGate(resolvedRoot, { requireActiveProof, result: activeWorkflowResult }));
  gates.push(await strictPlanGate(resolvedRoot, { requireActiveProof }));
  gates.push(await strictPlanReviewGate(resolvedRoot, { requireActiveProof }));
  gates.push(await trustedEpicCompletionGate(resolvedRoot, { requireActiveProof }));
  gates.push(taskGraphRuntimeMaturityGate(resolvedRoot, { requireActiveProof }));
  gates.push(designWorkflowReportGate(resolvedRoot, { requireActiveProof, maturityScope }));
  gates.push(await tokenStrictGate(resolvedRoot, { workflowRunId: options.workflowRunId }));
  gates.push(await supervibeGcStrictGate(resolvedRoot));
  gates.push(await legacyEvidenceGraphGate(resolvedRoot));

  const activeProofPass = ACTIVE_PROOF_GATE_IDS
    .map((id) => gates.find((gate) => gate.id === id))
    .every((gate) => gate?.pass === true);
  const requiredGates = gates.filter((gate) => gate.required !== false);
  const global10Blocked = requireActiveProof && !activeProofPass;
  const pass = requiredGates.every((gate) => gate.pass === true) && !global10Blocked;

  return {
    schemaVersion: 1,
    kind: "supervibe-strict-release-gate",
    rootDir: resolvedRoot,
    pass,
    status: pass ? "release-strict-ready" : "release-strict-blocked",
    maturityScope,
    activeProofRequired: requireActiveProof,
    activeProofPass,
    global10Blocked,
    checked: gates.length,
    failed: gates.filter((gate) => gate.pass !== true && gate.required !== false).length,
    gates,
  };
}

function resolveActiveProofRequirement(value, activeWorkflowResult = {}) {
  if (value === true) return true;
  if (value === false) return false;
  return Boolean(
    Number(activeWorkflowResult.activeWorkflows || 0) > 0
      || activeWorkflowResult.resume?.canResume === true,
  );
}

export function formatStrictReleaseGateReport(report = {}) {
  const lines = [
    "SUPERVIBE_STRICT_RELEASE_GATE",
    `PASS: ${report.pass === true}`,
    `STATUS: ${report.status || "unknown"}`,
    `MATURITY_SCOPE: ${report.maturityScope || "unknown"}`,
    `ACTIVE_PROOF_REQUIRED: ${report.activeProofRequired === true}`,
    `ACTIVE_PROOF_PASS: ${report.activeProofPass === true}`,
    `GLOBAL_10_BLOCKED: ${report.global10Blocked === true}`,
    `CHECKED: ${report.checked || 0}`,
    `FAILED: ${report.failed || 0}`,
    "GATES:",
  ];
  for (const gate of report.gates || []) {
    lines.push(`- ${gate.id}: ${gate.pass === true ? "pass" : "fail"} scope=${gate.scope || "unknown"} required=${gate.required !== false}`);
    if (gate.summary) lines.push(`  SUMMARY: ${gate.summary}`);
    if (gate.repairCommand) lines.push(`  REPAIR: ${gate.repairCommand}`);
    for (const blocker of gate.blockers || []) lines.push(`  BLOCKER: ${blocker}`);
    for (const evidence of gate.evidence || []) lines.push(`  EVIDENCE: ${evidence}`);
  }
  return lines.join("\n");
}

function activeWorkflowGate(rootDir, { requireActiveProof, result } = {}) {
  result ||= validateActiveWorkflows(rootDir, { strict: true });
  const stage = result.resume?.stage || "none";
  const releaseReady = !requireActiveProof || stage === "release-ready";
  const pass = requireActiveProof
    ? result.pass === true && result.status === "passed" && releaseReady
    : result.pass === true;
  return {
    id: "active-workflows",
    title: "Active workflow strict proof",
    pass,
    required: true,
    scope: requireActiveProof ? "active-workflow-readiness" : "global-capability",
    summary: `status=${result.status || "unknown"}, activeWorkflows=${result.activeWorkflows || 0}, checks=${result.checked || 0}`,
    blockers: [
      ...(result.issues || []).map((issue) => `${issue.code || "issue"}: ${issue.message || issue}`),
      ...(requireActiveProof && result.status !== "passed" ? ["active workflow proof is required for a 10/10 release claim"] : []),
      ...(requireActiveProof && !releaseReady ? [`active workflow stage must be release-ready before strict release; current stage=${stage}, nextAction=${result.resume?.nextAction || "none"}`] : []),
    ],
    evidence: [".supervibe/memory/active-workflow.json", ".supervibe/memory/active-workflows"],
    repairCommand: "npm run validate:active-workflows -- --strict",
    result,
  };
}

async function strictPlanGate(rootDir, { requireActiveProof } = {}) {
  const inspection = await inspectActivePlanSource({ rootDir });
  const path = inspection.snapshotPath || inspection.sourcePath || null;
  const issues = [...(inspection.issues || [])];
  const warnings = [...(inspection.warnings || [])];
  if (path && existsSync(path)) {
    const markdown = await readFile(path, "utf8");
    issues.push(...validatePlanArtifact(markdown));
  } else if (requireActiveProof) {
    issues.push("active workflow plan source is required");
  }
  const pass = issues.length === 0 && warnings.length === 0 && (!requireActiveProof || Boolean(path));
  return {
    id: "strict-plan",
    title: "Strict active plan artifact",
    pass,
    required: true,
    scope: requireActiveProof ? "active-workflow-readiness" : "global-capability",
    summary: `source=${inspection.status || "unknown"}, issues=${issues.length}, warnings=${warnings.length}`,
    blockers: [...warnings.map((warning) => `warning: ${warning}`), ...issues],
    evidence: path ? [toRel(rootDir, path)] : [],
    repairCommand: "npm run validate:plan-artifacts -- --all --require-active-source",
    result: inspection,
  };
}

async function strictPlanReviewGate(rootDir, { requireActiveProof } = {}) {
  const inspection = await inspectActivePlanSource({ rootDir });
  const planPath = inspection.snapshotPath || inspection.sourcePath || null;
  const reviewPlanPath = planPath ? toRel(rootDir, planPath) : null;
  const result = await validatePlanReviewGateForPlan({
    rootDir,
    planPath: reviewPlanPath,
    requireActiveReview: requireActiveProof,
  });
  const pass = result.pass === true && (!requireActiveProof || Boolean(result.reviewPath));
  return {
    id: "strict-plan-review",
    title: "Trusted active plan review",
    pass,
    required: true,
    scope: requireActiveProof ? "active-workflow-readiness" : "global-capability",
    summary: `review=${result.reviewRel || result.reviewPath || "missing"}, issues=${result.issues?.length || 0}`,
    blockers: result.issues || [],
    evidence: [
      ...(planPath ? [toRel(rootDir, planPath)] : []),
      ...(result.reviewPath ? [toRel(rootDir, result.reviewPath)] : []),
    ],
    repairCommand: "npm run validate:plan-review-artifacts -- --plan <active-plan> --require-active-review",
    result,
  };
}

async function trustedEpicCompletionGate(rootDir, { requireActiveProof } = {}) {
  if (!requireActiveProof) {
    return {
      id: "trusted-epic-completion",
      title: "Trusted active epic completion",
      pass: true,
      required: false,
      scope: "global-capability",
      summary: "active workflow completion proof is not required when no workflow is active or resumable",
      blockers: [],
      evidence: [],
      repairCommand: "npm run validate:epic-completion:trusted",
      result: { pass: true, results: [] },
    };
  }
  const files = discoverActiveWorkItemGraphFiles(rootDir);
  const trustedReceiptIds = trustedReceiptIdsForStrictGate(rootDir);
  const trustedGraphReceiptIdsByGraphId = trustedGraphReceiptIdsByGraphForStrictGate(rootDir);
  if (files.length === 0) {
    return {
      id: "trusted-epic-completion",
      title: "Trusted epic completion",
      pass: false,
      required: true,
      scope: "active-workflow-readiness",
      summary: "no work-item graph files found",
      blockers: ["atomize and close the reviewed plan before release"],
      evidence: [],
      repairCommand: "npm run validate:epic-completion:trusted",
      result: { pass: false, results: [] },
    };
  }
  const result = await validateEpicCompletionFiles({
    rootDir,
    files,
    production: true,
    requireEvidence: true,
    allowSkipped: true,
    allowDryRunEvidence: false,
    requireTrustedEvidence: true,
    trustedReceiptIds,
    trustedGraphReceiptIdsByGraphId,
    disallowLegacyEvidence: true,
    requireEpicClosed: false,
  });
  const failing = result.results.filter((item) => item.report.pass !== true);
  return {
    id: "trusted-epic-completion",
    title: "Trusted epic completion",
    pass: result.pass === true,
    required: true,
    scope: "active-workflow-readiness",
    summary: `graphs=${files.length}, trustedReceipts=${trustedReceiptIds.length}, failing=${failing.length}`,
    blockers: failing.flatMap((item) => (item.report.issues || []).slice(0, 8)
      .map((issue) => `${toRel(rootDir, item.file)}: ${issue.code || "issue"}: ${issue.message || issue.itemId || "failed"}`)).slice(0, 20),
    evidence: files.slice(0, 6).map((file) => toRel(rootDir, file)),
    repairCommand: "npm run validate:epic-completion:trusted",
    result,
  };
}

function discoverActiveWorkItemGraphFiles(rootDir) {
  return walkFiles(join(rootDir, ".supervibe", "memory", "work-items"))
    .filter((file) => file.endsWith("graph.json") || file.endsWith(".work-item-graph.json"))
    .filter((file) => isActiveWorkItemGraphFile(file));
}

function isActiveWorkItemGraphFile(file) {
  let graph = null;
  try {
    graph = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return true;
  }
  const epic = (graph.items || []).find((item) => item.type === "epic")
    || (graph.items || []).find((item) => item.itemId === graph.epicId || item.itemId === graph.graph_id);
  const status = String(epic?.status || graph.status || "").toLowerCase();
  if (TERMINAL_GRAPH_EPIC_STATUSES.has(status)) return false;
  if (ACTIVE_GRAPH_EPIC_STATUSES.has(status)) return true;
  return [...(graph.items || []), ...(graph.tasks || [])].some((item) => {
    if (item.type === "epic") return false;
    return ACTIVE_GRAPH_EPIC_STATUSES.has(String(item.status || item.effectiveStatus || "").toLowerCase());
  });
}

function taskGraphRuntimeMaturityGate(rootDir, { requireActiveProof } = {}) {
  const result = buildTaskGraphMaturityReport(rootDir, {
    requireActiveGraph: requireActiveProof,
  });
  return {
    id: "task-graph-runtime-maturity",
    title: "Task graph runtime maturity",
    pass: result.pass === true,
    required: true,
    scope: result.maturityScope || (requireActiveProof ? "active-workflow-readiness" : "global-capability"),
    summary: `score=${result.score}/10, status=${result.status}`,
    blockers: (result.dimensions || [])
      .filter((dimension) => dimension.required !== false && dimension.pass !== true)
      .flatMap((dimension) => (dimension.blockers?.length ? dimension.blockers : [dimension.summary || dimension.id]))
      .slice(0, 20),
    evidence: (result.dimensions || []).flatMap((dimension) => dimension.evidence || []).slice(0, 10),
    repairCommand: "npm run supervibe:task-graph-runtime-maturity",
    result,
  };
}

function designWorkflowReportGate(rootDir, { requireActiveProof, maturityScope } = {}) {
  const result = buildDesignWorkflowReport(rootDir, {
    active: false,
    strict: true,
    declaredMaturity: maturityScope,
  });
  const noDesignRun = result.status === "not-started" && result.activeWorkflowReadiness === "not-started";
  const pass = result.pass === true || noDesignRun;
  return {
    id: "design-workflow-report",
    title: "Design workflow release report",
    pass,
    required: true,
    scope: noDesignRun ? "global-capability" : "active-workflow-readiness",
    summary: `status=${result.status || "unknown"}, releaseGate=${result.releaseGate?.status || "unknown"}, issues=${result.issues?.length || 0}`,
    blockers: pass ? [] : (result.issues || []).slice(0, 20).map((issue) => `${issue.code || "issue"}: ${issue.message || issue}`),
    evidence: result.evidencePaths || [],
    repairCommand: "npm run validate:design-workflow-report",
    result,
  };
}

async function tokenStrictGate(rootDir, { workflowRunId } = {}) {
  const result = await measureFootprint(rootDir, {
    strict: true,
    workflowRunId: workflowRunId || "strict-release-gate",
  });
  return {
    id: "token-strict",
    title: "Strict token economy",
    pass: result.pass === true,
    required: true,
    scope: "global-capability",
    summary: `violations=${result.violations.length}, blocking=${result.blockingViolations.length}, repairs=${result.repairs.length}, perAgentBudget=${result.perAgentContextBudget}`,
    blockers: (result.blockingViolations || []).map((item) => `${item.kind}: ${item.path || "unknown"}`),
    evidence: [`perAgentContextBudget=${result.perAgentContextBudget}`, `promptSlicing=${result.promptSlicingPolicy.join(">")}`],
    repairCommand: "npm run measure:tokens:strict",
    result,
  };
}

async function supervibeGcStrictGate(rootDir) {
  const result = await validateSupervibeGcStrict({ rootDir });
  return {
    id: "supervibe-gc-strict",
    title: ".supervibe strict garbage collection",
    pass: result.pass === true,
    required: true,
    scope: "global-capability",
    summary: `scanned=${result.summary?.scanned || 0}, unsafeProtected=${result.summary?.unsafeProtectedCandidates || 0}, unclassified=${result.summary?.unclassified || 0}, untrustedReceipts=${result.summary?.untrustedReceipts || 0}`,
    blockers: result.failures || [],
    evidence: [
      `coverageArtifacts=${result.coverage?.artifacts || 0}`,
      `coverageMemory=${result.coverage?.memory || 0}`,
      `coverageWorkItems=${result.coverage?.workItems || 0}`,
    ],
    repairCommand: "node scripts/validate-supervibe-gc-strict.mjs",
    result,
  };
}

async function legacyEvidenceGraphGate(rootDir) {
  const files = walkFiles(join(rootDir, ".supervibe", "memory", "work-items"))
    .filter((file) => file.endsWith("graph.json") || file.endsWith(".work-item-graph.json"));
  const offenders = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    if (/legacy-graph-evidence-migration/i.test(text)) offenders.push(file);
  }
  return {
    id: "legacy-evidence-graphs",
    title: "Legacy graph evidence quarantine",
    pass: offenders.length === 0,
    required: true,
    scope: "active-workflow-readiness",
    summary: `graphs=${files.length}, legacyEvidenceGraphs=${offenders.length}`,
    blockers: offenders.map((file) => `${toRel(rootDir, file)} contains migrated legacy evidence`),
    evidence: offenders.length > 0 ? offenders.map((file) => toRel(rootDir, file)) : files.slice(0, 6).map((file) => toRel(rootDir, file)),
    repairCommand: "replace legacy migrated graph evidence with fresh trusted runtime receipts or archive repaired graphs",
    result: { files, offenders },
  };
}

function trustedReceiptIdsForStrictGate(rootDir) {
  const trusted = [];
  for (const receipt of readWorkflowReceipts(rootDir)) {
    if (!receipt?.receiptId) continue;
    const trust = validateWorkflowReceiptTrust(rootDir, receipt);
    if (trust.pass) trusted.push(String(receipt.receiptId));
  }
  return trusted;
}

function trustedGraphReceiptIdsByGraphForStrictGate(rootDir) {
  const out = {};
  for (const receipt of readWorkflowReceipts(rootDir)) {
    if (!receipt?.receiptId) continue;
    const graphId = receipt.graphId || receipt.workItemBinding?.graphId || null;
    if (!graphId) continue;
    const taskId = receipt.taskId || receipt.workItemId || receipt.graphTaskId || receipt.workItemBinding?.taskId || null;
    if (taskId) continue;
    const trust = validateWorkflowReceiptTrust(rootDir, receipt);
    if (!trust.pass) continue;
    if (!out[graphId]) out[graphId] = [];
    out[graphId].push(String(receipt.receiptId));
  }
  return out;
}

function walkFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) out.push(...walkFiles(path));
    else out.push(path);
  }
  return out;
}

function toRel(rootDir, path) {
  return relative(rootDir, path).split(sep).join("/");
}
