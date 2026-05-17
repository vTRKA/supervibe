import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

import { findCommandShortcut } from "./supervibe-command-catalog.mjs";
import { routeTriggerRequest } from "./supervibe-trigger-router.mjs";
import { validateTaskGraphTraceability } from "../validate-task-graph-traceability.mjs";
import { validateEpicCompletion } from "./supervibe-epic-completion-validator.mjs";
import {
  resolveActiveWorkItemGraphSync,
  validateWorkItemRegistryIntegrity,
} from "./supervibe-work-item-registry.mjs";
import {
  readWorkflowReceipts,
  validateWorkflowReceiptTrust,
} from "./supervibe-workflow-receipt-runtime.mjs";
import { validateActiveGraphReceiptPolicy } from "./supervibe-epic-agent-contract.mjs";
import {
  graphIdentity,
  isTrustedGraphCompletionReceiptForGraph,
  isTrustedTaskCompletionReceiptForGraph,
  isReceiptSuppressedForCompletion,
  trustedReceiptScopeFromReceipt,
} from "./supervibe-receipt-completion-trust.mjs";
import { createBlockerV1 } from "./supervibe-work-state.mjs";

const ROUTING_CASES = Object.freeze([
  ["создай задачи и эпик из плана", "task_graph_create_from_plan"],
  ["атомизируй план", "atomize_plan"],
  ["создай подзадачи", "task_graph_split"],
  ["разбей задачу на подзадачи", "task_graph_split"],
  ["перенеси задачу в другой эпик", "task_graph_reparent"],
  ["пропусти задачу с причиной", "task_graph_skip"],
  ["заблокируй задачу", "task_graph_block"],
  ["покажи готовые задачи", "ready_query"],
  ["проверь готовность эпика к продакшену", "task_graph_validate_completion"],
  ["create work items from plan", "task_graph_create_from_plan"],
  ["split task into subtasks", "task_graph_split"],
  ["move task to another epic", "task_graph_reparent"],
]);

const COMMAND_SHORTCUT_CASES = Object.freeze([
  ["task graph maturity", "task_graph_maturity"],
  ["проверь task graph maturity", "task_graph_maturity"],
  ["оцени task graph на 10 из 10", "task_graph_maturity"],
  ["план", "supervibe_plan"],
  ["сделай план", "supervibe_plan"],
  ["create plan and then tasks", "supervibe_plan"],
  ["брейншторм", "supervibe_brainstorm"],
  ["давай новую фичу", "supervibe_brainstorm"],
  ["new feature", "supervibe_brainstorm"],
]);

const ACTIVE_GRAPH_EPIC_STATUSES = new Set(["open", "active", "ready", "claimed", "blocked", "deferred", "review"]);
const TERMINAL_GRAPH_EPIC_STATUSES = new Set(["closed", "complete", "completed", "done", "skipped", "cancelled"]);
const TERMINAL_TASK_STATUSES = new Set(["closed", "complete", "completed", "done", "skipped", "cancelled"]);
const EXECUTABLE_TASK_STATUSES = new Set(["open", "ready"]);
const IN_FLIGHT_TASK_STATUSES = new Set(["claimed", "review"]);

const REQUIRED_LOOP_TOKENS = Object.freeze([
  "--atomize-plan",
  "--claim-ready",
  "--adopt-completed",
  "--validate-completion",
  "--require-trusted-evidence",
  "--auto-ui-dry-run",
  "--no-auto-ui",
  "--split",
  "--reparent",
  "--skip",
  "--block",
  "--delete",
  "--edit",
]);

const REQUIRED_UI_TOKENS = Object.freeze([
  "no-active-graph",
  "atomizeReviewedPlan",
  "tracker",
  "actionImpact",
  "claim",
  "defer",
  "close",
  "reopen",
  "skip",
  "cancel",
  "create",
  "edit",
  "split",
  "reparent",
  "dep-add",
  "dep-remove",
  "delete",
]);

const REQUIRED_SYNC_TOKENS = Object.freeze([
  "createEpic",
  "createTask",
  "addDependency",
  "ready",
  "claim",
  "update",
  "close",
  "syncPush",
  "syncPull",
]);

const REQUIRED_SYNC_DIAGNOSTIC_TOKENS = Object.freeze([
  "validateTrackerMapping",
  "diagnoseTrackerSyncConflicts",
  "partial-sync",
  "redactTrackerSyncDiagnostics",
]);

export function buildTaskGraphMaturityReport(rootDir = process.cwd(), options = {}) {
  const requireActiveGraph = Boolean(options.requireActiveGraph);
  const requireReleaseProof = Boolean(options.requireReleaseProof || options.releaseProof || options.finalGate);
  const maturityScope = requireActiveGraph ? "active-workflow-readiness" : "global-capability";
  const dimensions = [
    routingDimension(rootDir),
    commandShortcutDimension(),
    sourceTokenDimension(rootDir, {
      id: "loop-actions",
      title: "Loop actions",
      file: "scripts/supervibe-loop.mjs",
      tokens: REQUIRED_LOOP_TOKENS,
    }),
    sourceTokenDimension(rootDir, {
      id: "ui-actions",
      title: "UI task controls",
      file: "scripts/lib/supervibe-ui-server.mjs",
      tokens: REQUIRED_UI_TOKENS,
    }),
    sourceTokenDimension(rootDir, {
      id: "sync-adapter",
      title: "Tracker adapter contract",
      file: "scripts/lib/supervibe-durable-task-tracker-adapter.mjs",
      tokens: REQUIRED_SYNC_TOKENS,
    }),
    sourceTokenDimension(rootDir, {
      id: "sync-diagnostics",
      title: "Tracker sync diagnostics",
      file: "scripts/lib/supervibe-task-tracker-sync.mjs",
      tokens: REQUIRED_SYNC_DIAGNOSTIC_TOKENS,
    }),
    validatorDimension(rootDir),
    sourceSnapshotDimension(rootDir),
    strictCompletionEvidenceDimension(rootDir),
    mcpTrackerWiringDimension(rootDir),
    testsDimension(rootDir),
    graphFixtureDimension(rootDir),
    currentGraphDimension(rootDir, { required: requireActiveGraph }),
    ...(requireActiveGraph ? [
      registryIntegrityDimension(rootDir),
      activeGraphReceiptPolicyDimension(rootDir, { requireReleaseProof }),
      activeTraceabilityDimension(rootDir),
      activeTrustedCompletionDimension(rootDir),
    ] : []),
  ];
  const requiredDimensions = dimensions.filter((dimension) => dimension.required !== false);
  const passed = requiredDimensions.filter((dimension) => dimension.pass).length;
  const score = requiredDimensions.length === 0
    ? 0
    : Number(((passed / requiredDimensions.length) * 10).toFixed(1));
  const pass = score === 10 && requiredDimensions.every((dimension) => dimension.pass);
  const executability = buildGraphExecutabilityScore(rootDir, { requireActiveGraph, requireReleaseProof });
  return {
    kind: "supervibe-task-graph-maturity",
    rootDir,
    maturityScope,
    activeProofRequired: requireActiveGraph,
    releaseProofRequired: requireReleaseProof,
    globalCapabilityOnly: !requireActiveGraph,
    score,
    pass,
    status: pass ? "10-of-10-ready" : "needs-work",
    executability,
    dimensions,
  };
}


export function buildGraphExecutabilityScore(rootDir = process.cwd(), options = {}) {
  const requireActiveGraph = Boolean(options.requireActiveGraph);
  const requireReleaseProof = Boolean(options.requireReleaseProof || options.releaseProof || options.finalGate);
  const resolution = resolveActiveWorkItemGraphSync({ rootDir });
  const evidence = (resolution.candidates || []).slice(0, 5).map((file) => relative(rootDir, file).split(sep).join("/"));
  const checks = [];
  const blockers = [];
  const repairCommand = "node scripts/supervibe-loop.mjs --status";

  const activeSelected = resolution.status === "active";
  checks.push(scoreCheck("active-graph-selected", activeSelected, 2));
  if (!activeSelected) {
    blockers.push(executabilityBlocker({
      code: resolution.status === "ambiguous" ? "needs-human-input" : "policy-hard-stop",
      message: resolution.status === "ambiguous"
        ? "Multiple active work-item graph candidates require an explicit user choice before execution."
        : "No active work-item graph is selected for execution.",
      affectedTaskIds: [],
      nextAction: resolution.nextAction || "select an active work-item graph or atomize a user-approved loop-ready plan before execution",
      repairCommand,
      releaseImpact: "Plan, graph, and task workflows cannot dispatch deterministically without exactly one active graph.",
    }));
  }

  let graph = null;
  let graphPathEvidence = null;
  if (activeSelected) {
    graphPathEvidence = relative(rootDir, resolution.graphPath).split(sep).join("/");
    try {
      graph = JSON.parse(readFileSync(resolution.graphPath, "utf8"));
      checks.push(scoreCheck("active-graph-readable", true, 2));
    } catch (error) {
      checks.push(scoreCheck("active-graph-readable", false, 2));
      blockers.push(executabilityBlocker({
        code: "policy-hard-stop",
        message: "Active graph cannot be read: " + error.message,
        affectedTaskIds: [],
        nextAction: "repair or regenerate the active work-item graph JSON",
        repairCommand,
        releaseImpact: "Workflow dispatch and release readiness cannot be trusted until the active graph can be read.",
      }));
    }
  } else {
    checks.push(scoreCheck("active-graph-readable", false, 2));
  }

  const registry = activeSelected ? validateWorkItemRegistryIntegrity({ rootDir }) : { pass: false, issues: [] };
  checks.push(scoreCheck("registry-integrity", registry.pass === true, 2));
  if (activeSelected && registry.pass !== true) {
    blockers.push(executabilityBlocker({
      code: "policy-hard-stop",
      message: String(registry.issues.length) + " work-item registry issue(s) block deterministic graph execution.",
      affectedTaskIds: affectedIdsFromIssues(registry.issues),
      nextAction: "repair work-item registry integrity before dispatch",
      repairCommand,
      releaseImpact: "Graph execution can target stale or wrong items while registry integrity is broken.",
    }));
  }

  let receiptPolicy = { pass: false, issues: [] };
  if (graph) receiptPolicy = activeGraphReceiptPolicyForMaturity({ rootDir, graph, graphPath: resolution.graphPath, requireReleaseProof });
  checks.push(scoreCheck("active-graph-receipt-policy", receiptPolicy.pass === true, 2));
  if (graph && receiptPolicy.pass !== true) {
    blockers.push(executabilityBlocker({
      code: "receipt-missing",
      message: String(receiptPolicy.issues.length) + " active graph receipt binding issue(s) block trusted execution.",
      affectedTaskIds: affectedIdsFromIssues(receiptPolicy.issues),
      nextAction: "bind the active graph to trusted runtime-issued host receipts",
      repairCommand: "node scripts/workflow-receipt.mjs recovery-status",
      releaseImpact: "Release workflow readiness is blocked until graph provenance and host invocation proof are trusted.",
    }));
  }

  const readiness = graph ? summarizeGraphReadiness(graph) : emptyReadiness();
  checks.push(scoreCheck("dispatchable-work", readiness.remainingTaskIds.length === 0 || readiness.dispatchableTaskIds.length > 0 || readiness.inFlightTaskIds.length > 0, 2));
  if (graph && readiness.dispatchableTaskIds.length === 0 && readiness.inFlightTaskIds.length === 0 && readiness.remainingTaskIds.length > 0) {
    const affectedTaskIds = readiness.blockedTaskIds.length > 0 ? readiness.blockedTaskIds : readiness.remainingTaskIds;
    blockers.push(executabilityBlocker({
      code: "dependency-not-ready",
      message: "Active graph has remaining work but no dispatchable or in-flight task.",
      affectedTaskIds,
      nextAction: affectedTaskIds.length ? "complete or repair dependencies for " + affectedTaskIds[0] : "inspect graph dependencies before dispatch",
      repairCommand,
      releaseImpact: "The active graph cannot dispatch additional work until dependencies complete, blockers clear, or the graph is repaired.",
    }));
  }

  const total = checks.reduce((sum, check) => sum + check.weight, 0);
  const earned = checks.reduce((sum, check) => sum + (check.pass ? check.weight : 0), 0);
  const score = total === 0 ? 0 : Number(((earned / total) * 10).toFixed(1));
  const pass = score === 10 && blockers.length === 0;
  const primaryBlocker = blockers[0] || null;
  const nextAction = primaryBlocker?.nextAction
    || (readiness.dispatchableTaskIds[0] ? "claim ready task: " + readiness.dispatchableTaskIds[0] : "no graph execution repair needed");

  return {
    kind: "supervibe-graph-executability-score",
    schemaVersion: 1,
    score,
    pass,
    status: pass ? "executable" : requireActiveGraph ? "blocked" : "informational-blocked",
    activeProofRequired: requireActiveGraph,
    releaseProofRequired: requireReleaseProof,
    activeGraphResolution: {
      status: resolution.status,
      source: resolution.source || null,
      graphPath: graphPathEvidence,
      readOnly: resolution.readOnly === true,
      userChoiceRequired: resolution.userChoiceRequired === true,
      executionBlocked: resolution.executionBlocked === true,
    },
    totals: readiness.totals,
    dispatchableTaskIds: readiness.dispatchableTaskIds,
    inFlightTaskIds: readiness.inFlightTaskIds,
    affectedTaskIds: uniqueStrings(blockers.flatMap((blocker) => blocker.affectedTaskIds || [])),
    nextAction,
    repairCommand: primaryBlocker?.repairCommand || null,
    releaseImpact: primaryBlocker?.releaseImpact || "No graph executability blocker detected.",
    blockers,
    checks,
    evidence: graphPathEvidence ? [graphPathEvidence] : evidence,
  };
}

function sourceSnapshotDimension(rootDir) {
  const planWriter = readOptional(join(rootDir, "scripts/lib/supervibe-plan-to-work-items.mjs"));
  const graphValidator = readOptional(join(rootDir, "scripts/validate-work-item-graphs.mjs"));
  const checks = [
    ["atomizer records sourcePlanSnapshot", planWriter.includes("sourcePlanSnapshot")],
    ["atomizer writes source-plan.md", planWriter.includes("source-plan.md")],
    ["validator exposes strict source flag", graphValidator.includes("require-source-plan-snapshot")],
    ["validator checks sha256", graphValidator.includes("source-plan-snapshot-hash-mismatch") && graphValidator.includes("sha256")],
  ];
  const blockers = checks.filter(([, pass]) => !pass).map(([label]) => label);
  return {
    id: "source-plan-snapshots",
    title: "Source plan snapshot traceability",
    pass: blockers.length === 0,
    summary: blockers.length === 0 ? "source plan snapshot metadata, persistence, and strict validation present" : `${blockers.length} source snapshot checks missing`,
    blockers,
    evidence: [
      "scripts/lib/supervibe-plan-to-work-items.mjs",
      "scripts/validate-work-item-graphs.mjs",
    ],
  };
}

function strictCompletionEvidenceDimension(rootDir) {
  const validator = readOptional(join(rootDir, "scripts/lib/supervibe-epic-completion-validator.mjs"));
  const cli = readOptional(join(rootDir, "scripts/validate-epic-completion.mjs"));
  const loop = readOptional(join(rootDir, "scripts/supervibe-loop.mjs"));
  const checks = [
    ["structured evidence helper", validator.includes("isStructuredProductionEvidence")],
    ["insufficient evidence blocker", validator.includes("insufficient-evidence")],
    ["trusted receipt evidence blocker", validator.includes("requireTrustedEvidence") && validator.includes("untrusted-evidence")],
    ["trusted receipt CLI flag", cli.includes("require-trusted-evidence") && cli.includes("validateWorkflowReceiptTrust")],
    ["loop trusted completion flag", loop.includes("require-trusted-evidence") && loop.includes("trustedReceiptIdsForValidation")],
    ["event reason is not collected as evidence", !validator.includes("event.evidence || event.reason || event")],
  ];
  const blockers = checks.filter(([, pass]) => !pass).map(([label]) => label);
  return {
    id: "strict-completion-evidence",
    title: "Strict production evidence",
    pass: blockers.length === 0,
    summary: blockers.length === 0 ? "completion validator rejects weak event reasons, unstructured evidence, and untrusted runtime receipt evidence when requested" : `${blockers.length} evidence checks missing`,
    blockers,
    evidence: [
      "scripts/lib/supervibe-epic-completion-validator.mjs",
      "scripts/validate-epic-completion.mjs",
      "scripts/supervibe-loop.mjs",
    ],
  };
}

function mcpTrackerWiringDimension(rootDir) {
  const loop = readOptional(join(rootDir, "scripts/supervibe-loop.mjs"));
  const bridge = readOptional(join(rootDir, "scripts/lib/supervibe-task-tracker-mcp-bridge.mjs"));
  const checks = [
    ["loop imports MCP adapter", loop.includes("createTaskTrackerMcpAdapter")],
    ["loop supports --tracker mcp", loop.includes("args.tracker === \"mcp\"") && loop.includes("--tracker memory|cli|mcp")],
    ["approval flag is present", loop.includes("approve-mcp-tracker")],
    ["bridge adapter is approval gated", bridge.includes("createTaskTrackerMcpAdapter") && bridge.includes("requires explicit approval")],
  ];
  const blockers = checks.filter(([, pass]) => !pass).map(([label]) => label);
  return {
    id: "mcp-tracker-wiring",
    title: "MCP tracker adapter wiring",
    pass: blockers.length === 0,
    summary: blockers.length === 0 ? "MCP tracker path is wired and approval-gated" : `${blockers.length} MCP tracker checks missing`,
    blockers,
    evidence: [
      "scripts/supervibe-loop.mjs",
      "scripts/lib/supervibe-task-tracker-mcp-bridge.mjs",
    ],
  };
}

export function formatTaskGraphMaturityReport(report) {
  const lines = [
    "SUPERVIBE_TASK_GRAPH_MATURITY",
    `SCORE: ${report.score}/10`,
    `STATUS: ${report.status}`,
    `PASS: ${report.pass}`,
    `MATURITY_SCOPE: ${report.maturityScope || "unknown"}`,
    `ACTIVE_PROOF_REQUIRED: ${report.activeProofRequired === true}`,
    `RELEASE_PROOF_REQUIRED: ${report.releaseProofRequired === true}`,
    `GLOBAL_CAPABILITY_ONLY: ${report.globalCapabilityOnly === true}`,
    "EXECUTABILITY:",
    `  SCORE: ${report.executability?.score ?? 0}/10`,
    `  STATUS: ${report.executability?.status || "unknown"}`,
    `  PASS: ${report.executability?.pass === true}`,
    `  NEXT_ACTION: ${report.executability?.nextAction || "inspect graph executability"}`,
    `  REPAIR_COMMAND: ${report.executability?.repairCommand || "none"}`,
    `  RELEASE_IMPACT: ${report.executability?.releaseImpact || "unknown"}`,
    "DIMENSIONS:",
  ];
  for (const blocker of report.executability?.blockers || []) {
    lines.push(`  BLOCKER: ${blocker.code}: ${blocker.message}`);
    lines.push(`    AFFECTED_TASK_IDS: ${(blocker.affectedTaskIds || []).join(", ") || "none"}`);
    lines.push(`    NEXT_ACTION: ${blocker.nextAction || "inspect blocker"}`);
    lines.push(`    REPAIR_COMMAND: ${blocker.repairCommand || "none"}`);
    lines.push(`    RELEASE_IMPACT: ${blocker.releaseImpact}`);
  }
  for (const dimension of report.dimensions) {
    lines.push(`- ${dimension.id}: ${dimension.pass ? "pass" : "fail"}${dimension.required === false ? " (informational)" : ""}`);
    if (dimension.summary) lines.push(`  SUMMARY: ${dimension.summary}`);
    for (const blocker of dimension.blockers || []) lines.push(`  BLOCKER: ${blocker}`);
    for (const evidence of dimension.evidence || []) lines.push(`  EVIDENCE: ${evidence}`);
  }
  return lines.join("\n");
}

function routingDimension(rootDir) {
  const failures = [];
  const evidence = [];
  for (const [request, expectedIntent] of ROUTING_CASES) {
    const route = routeTriggerRequest(request, { pluginRoot: rootDir, projectRoot: rootDir });
    if (route.intent !== expectedIntent) {
      failures.push(`${request} routed to ${route.intent}, expected ${expectedIntent}`);
    } else {
      evidence.push(`${request} -> ${expectedIntent}`);
    }
  }
  return {
    id: "routing",
    title: "Russian and English task graph routing",
    pass: failures.length === 0,
    summary: `${ROUTING_CASES.length - failures.length}/${ROUTING_CASES.length} phrases route correctly`,
    blockers: failures,
    evidence: evidence.slice(0, 5),
  };
}

function commandShortcutDimension() {
  const failures = [];
  const evidence = [];
  for (const [request, expectedIntent] of COMMAND_SHORTCUT_CASES) {
    const shortcut = findCommandShortcut(request);
    if (shortcut?.intent !== expectedIntent) {
      failures.push(`${request} matched ${shortcut?.intent || "none"}, expected ${expectedIntent}`);
    } else {
      evidence.push(`${request} -> ${shortcut.command}`);
    }
  }
  return {
    id: "command-shortcuts",
    title: "Task graph command shortcuts",
    pass: failures.length === 0,
    summary: `${COMMAND_SHORTCUT_CASES.length - failures.length}/${COMMAND_SHORTCUT_CASES.length} command shortcuts route correctly`,
    blockers: failures,
    evidence,
  };
}

function sourceTokenDimension(rootDir, { id, title, file, tokens }) {
  const path = join(rootDir, file);
  if (!existsSync(path)) {
    return {
      id,
      title,
      pass: false,
      summary: "source file missing",
      blockers: [`missing ${file}`],
      evidence: [],
    };
  }
  const content = readFileSync(path, "utf8");
  const missing = tokens.filter((token) => !content.includes(token));
  return {
    id,
    title,
    pass: missing.length === 0,
    summary: missing.length === 0 ? `${tokens.length} required tokens present` : `${missing.length} required tokens missing`,
    blockers: missing.map((token) => `${file} missing ${token}`),
    evidence: [file],
  };
}

function validatorDimension(rootDir) {
  const files = [
    "scripts/validate-work-item-graphs.mjs",
    "scripts/validate-epic-completion.mjs",
    "scripts/validate-task-graph-runtime.mjs",
    "scripts/validate-task-graph-traceability.mjs",
    "scripts/validate-task-graph-status-consistency.mjs",
    "scripts/lib/supervibe-epic-completion-validator.mjs",
    "scripts/lib/supervibe-plan-to-work-items.mjs",
  ];
  const missing = files.filter((file) => !existsSync(join(rootDir, file)));
  const completionCli = readOptional(join(rootDir, "scripts/validate-epic-completion.mjs"));
  const strictCoverage = completionCli.includes("strict-coverage");
  const blockers = [
    ...missing.map((file) => `missing ${file}`),
    ...(strictCoverage ? [] : ["validate-epic-completion.mjs missing --strict-coverage"]),
  ];
  return {
    id: "validators",
    title: "Graph and completion validators",
    pass: blockers.length === 0,
    summary: strictCoverage ? "validators and strict coverage gate present" : "strict coverage gate missing",
    blockers,
    evidence: files.filter((file) => existsSync(join(rootDir, file))),
  };
}

function testsDimension(rootDir) {
  const tests = [
    "tests/supervibe-commands-routing.test.mjs",
    "tests/supervibe-plan-to-work-items.test.mjs",
    "tests/supervibe-loop-work-items.test.mjs",
    "tests/supervibe-work-item-actions.test.mjs",
    "tests/supervibe-ui-server.test.mjs",
    "tests/supervibe-epic-completion-validator.test.mjs",
    "tests/task-graph-runtime-validator.test.mjs",
    "tests/task-graph-traceability-validator.test.mjs",
    "tests/task-graph-status-consistency.test.mjs",
  ];
  const missing = tests.filter((file) => !existsSync(join(rootDir, file)));
  return {
    id: "tests",
    title: "Task graph regression tests",
    pass: missing.length === 0,
    summary: `${tests.length - missing.length}/${tests.length} required tests present`,
    blockers: missing.map((file) => `missing ${file}`),
    evidence: tests.filter((file) => existsSync(join(rootDir, file))),
  };
}

function graphFixtureDimension(rootDir) {
  const dir = join(rootDir, "tests", "fixtures", "artifacts", "work-item-graphs");
  const files = walkFiles(dir).filter((file) => file.endsWith(".json"));
  return {
    id: "graph-fixtures",
    title: "Work-item graph fixture coverage",
    pass: files.length > 0,
    summary: `${files.length} graph fixture file(s) found`,
    blockers: files.length > 0 ? [] : ["missing work-item graph fixture coverage"],
    evidence: files.slice(0, 5).map((file) => relative(rootDir, file).split(sep).join("/")),
  };
}

function currentGraphDimension(rootDir, { required }) {
  const resolution = resolveActiveWorkItemGraphSync({ rootDir });
  const evidence = (resolution.candidates || []).slice(0, 5).map((file) => relative(rootDir, file).split(sep).join("/"));
  const pass = required ? resolution.status === "active" : true;
  return {
    id: "current-active-graph",
    title: "Current project work graph",
    required,
    pass,
    summary: resolution.status === "active"
      ? "one active graph selected from " + resolution.source
      : resolution.status === "ambiguous"
        ? String((resolution.candidates || []).length) + " active graph candidate(s) require user choice"
        : "no active work-item graph selected",
    blockers: pass ? [] : [resolution.nextAction || "choose an active work-item graph or atomize a user-approved loop-ready plan before execution"],
    evidence,
    activeGraphResolution: {
      status: resolution.status,
      source: resolution.source,
      readOnly: resolution.readOnly === true,
      userChoiceRequired: resolution.userChoiceRequired === true,
      executionBlocked: resolution.executionBlocked === true,
    },
  };
}

function registryIntegrityDimension(rootDir) {
  const report = validateWorkItemRegistryIntegrity({ rootDir });
  return {
    id: "work-item-registry",
    title: "Work-item registry integrity",
    pass: report.pass,
    summary: report.pass ? `registry valid with ${report.epicCount} epic(s)` : `${report.issues.length} registry issue(s) found`,
    blockers: report.issues.map((issue) => `${issue.code}: ${issue.message}`),
    evidence: [report.registryPath || ".supervibe/memory/work-items/index.json"],
  };
}

function activeGraphReceiptPolicyDimension(rootDir, { requireReleaseProof = false } = {}) {
  const resolution = resolveActiveWorkItemGraphSync({ rootDir });
  if (resolution.status !== "active") {
    return {
      id: "active-graph-receipts",
      title: "Active graph receipt binding",
      pass: false,
      summary: resolution.status === "ambiguous"
        ? String((resolution.candidates || []).length) + " active graph candidate(s) require user choice"
        : "no active graph selected",
      blockers: [resolution.nextAction || "choose an active work-item graph or atomize a user-approved loop-ready plan before execution"],
      evidence: (resolution.candidates || []).slice(0, 5).map((file) => relative(rootDir, file).split(sep).join("/")),
    };
  }
  let graph = null;
  try {
    graph = JSON.parse(readFileSync(resolution.graphPath, "utf8"));
  } catch (error) {
    return {
      id: "active-graph-receipts",
      title: "Active graph receipt binding",
      pass: false,
      summary: "active graph cannot be read",
      blockers: [error.message],
      evidence: [relative(rootDir, resolution.graphPath).split(sep).join("/")],
    };
  }
  const report = activeGraphReceiptPolicyForMaturity({ rootDir, graph, graphPath: resolution.graphPath, requireReleaseProof });
  return {
    id: "active-graph-receipts",
    title: "Active graph receipt binding",
    pass: report.pass,
    summary: report.deferred
      ? "fast-session startup receipts deferred until release-handoff"
      : report.pass
        ? "active graph has trusted path/hash/host receipt binding"
        : String(report.issues.length) + " active graph receipt issue(s)",
    blockers: report.issues.map((issue) => issue.code + ": " + issue.message),
    evidence: [relative(rootDir, resolution.graphPath).split(sep).join("/")],
  };
}

function activeGraphReceiptPolicyForMaturity({ rootDir, graph, graphPath, requireReleaseProof = false } = {}) {
  if (!requireReleaseProof && graphDefersStartupReceipts(graph)) {
    return {
      pass: true,
      deferred: true,
      issues: [],
      trustedReceipts: [],
      candidateIssues: [],
      expected: {
        graphPath: graphPath ? relative(rootDir, graphPath).split(sep).join("/") : null,
        requiredAt: graph.metadata?.receiptPolicy?.releaseProofRequiredAt || "release-handoff",
      },
    };
  }
  return validateActiveGraphReceiptPolicy({ rootDir, graph, graphPath });
}

function graphDefersStartupReceipts(graph = {}) {
  const metadata = graph.metadata || {};
  const policy = metadata.receiptPolicy || {};
  const mode = String(policy.mode || metadata.workflowEvidenceMode || "").toLowerCase();
  return mode === "fast-session"
    && policy.startupReceiptsRequired === false
    && String(policy.releaseProofRequiredAt || "release-handoff").toLowerCase() !== "now";
}

function activeTraceabilityDimension(rootDir) {
  const resolution = resolveActiveWorkItemGraphSync({ rootDir });
  if (resolution.status !== "active") {
    return {
      id: "active-traceability",
      title: "Active graph strict traceability",
      pass: false,
      summary: resolution.status === "ambiguous"
        ? String((resolution.candidates || []).length) + " active graph candidate(s) require user choice"
        : "no active graph selected",
      blockers: [resolution.nextAction || "choose an active work-item graph or atomize a user-approved loop-ready plan before strict traceability"],
      evidence: (resolution.candidates || []).slice(0, 5).map((file) => relative(rootDir, file).split(sep).join("/")),
    };
  }
  let graph = null;
  try {
    graph = JSON.parse(readFileSync(resolution.graphPath, "utf8"));
  } catch (error) {
    return {
      id: "active-traceability",
      title: "Active graph strict traceability",
      pass: false,
      summary: "active graph cannot be read",
      blockers: [error.message],
      evidence: [relative(rootDir, resolution.graphPath).split(sep).join("/")],
    };
  }
  const plan = readGraphSourceMarkdown({ rootDir, graphPath: resolution.graphPath, graph });
  const report = validateTaskGraphTraceability({ plan, graph, requireRequirements: true });
  const trustedGraphReceiptIds = trustedGraphReceiptIdsForMaturity(rootDir, graph, { graphPath: resolution.graphPath });
  const mappedRatio = report.requirements?.length ? report.mapped / report.requirements.length : 0;
  const trustedGraphCompletionCoverage = report.pass !== true
    && trustedGraphReceiptIds.length > 0
    && report.requirements?.length > 0
    && mappedRatio >= 0.9
    && !(report.issues || []).some((issue) => /no source requirements/i.test(issue));
  const pass = (report.pass && report.neutral !== true) || trustedGraphCompletionCoverage;
  return {
    id: "active-traceability",
    title: "Active graph strict traceability",
    pass,
    summary: pass
      ? `${report.mapped}/${report.requirements.length} requirements mapped`
      : `${report.issues.length} traceability issue(s), requirements=${report.requirements.length}`,
    blockers: pass ? [] : report.issues,
    evidence: [relative(rootDir, resolution.graphPath).split(sep).join("/")],
  };
}

function activeTrustedCompletionDimension(rootDir) {
  const resolution = resolveActiveWorkItemGraphSync({ rootDir });
  if (resolution.status !== "active") {
    return {
      id: "active-trusted-completion",
      title: "Active graph trusted completion",
      pass: false,
      summary: resolution.status === "ambiguous"
        ? String((resolution.candidates || []).length) + " active graph candidate(s) require user choice"
        : "no active graph selected",
      blockers: [resolution.nextAction || "choose an active work-item graph or atomize a user-approved loop-ready plan before trusted completion"],
      evidence: (resolution.candidates || []).slice(0, 5).map((file) => relative(rootDir, file).split(sep).join("/")),
    };
  }
  let graph = null;
  try {
    graph = JSON.parse(readFileSync(resolution.graphPath, "utf8"));
  } catch (error) {
    return {
      id: "active-trusted-completion",
      title: "Active graph trusted completion",
      pass: false,
      summary: "active graph cannot be read",
      blockers: [error.message],
      evidence: [relative(rootDir, resolution.graphPath).split(sep).join("/")],
    };
  }
  const trustedReceiptScopes = trustedReceiptScopesForMaturity(rootDir, graph);
  const trustedReceiptIds = Object.keys(trustedReceiptScopes);
  const trustedGraphReceiptIds = trustedGraphReceiptIdsForMaturity(rootDir, graph, { graphPath: resolution.graphPath });
  const report = validateEpicCompletion(graph, {
    production: true,
    requireEvidence: true,
    allowSkipped: true,
    allowDryRunEvidence: false,
    requireTrustedEvidence: true,
    trustedReceiptIds,
    trustedReceiptScopesById: trustedReceiptScopes,
    trustedGraphReceiptIds,
    disallowLegacyEvidence: true,
    requireEpicClosed: false,
  });
  return {
    id: "active-trusted-completion",
    title: "Active graph trusted completion",
    pass: report.pass,
    summary: report.pass
      ? `strict trusted completion passed with ${trustedReceiptIds.length} trusted receipt id(s)`
      : `${report.issues.length} trusted completion issue(s) found`,
    blockers: (report.issues || []).slice(0, 10).map((issue) => `${issue.code}: ${issue.itemId || "graph"}: ${issue.message}`),
    evidence: [relative(rootDir, resolution.graphPath).split(sep).join("/")],
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

function trustedReceiptIdsForMaturity(rootDir, graph = null) {
  return Object.keys(trustedReceiptScopesForMaturity(rootDir, graph));
}

function trustedReceiptScopesForMaturity(rootDir, graph = null) {
  const trusted = {};
  for (const receipt of readWorkflowReceipts(rootDir)) {
    if (!receipt?.receiptId) continue;
    if (isReceiptSuppressedForCompletion(receipt)) continue;
    if (!isTrustedTaskCompletionReceiptForGraph(receipt, graph)) continue;
    const trust = validateWorkflowReceiptTrust(rootDir, receipt, { requireHostInvocationProof: true });
    if (trust.pass) trusted[String(receipt.receiptId)] = trustedReceiptScopeFromReceipt(receipt, graph);
  }
  return trusted;
}

function trustedGraphReceiptIdsForMaturity(rootDir, graph = {}, { graphPath = null } = {}) {
  const graphId = graphIdentity(graph);
  if (!graphId) return [];
  const trusted = [];
  for (const receipt of readWorkflowReceipts(rootDir)) {
    if (!receipt?.receiptId) continue;
    if (isReceiptSuppressedForCompletion(receipt)) continue;
    if (!isTrustedGraphCompletionReceiptForGraph(receipt, graph, { rootDir, graphPath })) continue;
    const trust = validateWorkflowReceiptTrust(rootDir, receipt, { requireHostInvocationProof: true });
    if (trust.pass) trusted.push(String(receipt.receiptId));
  }
  return trusted;
}

function readGraphSourceMarkdown({ rootDir, graphPath, graph }) {
  const sourcePath = graph.source?.path || graph.metadata?.sourcePlanSnapshot?.path || graph.planPath || null;
  const snapshotPath = graph.source?.snapshotPath || graph.metadata?.sourcePlanSnapshot?.storedPath || null;
  const candidates = [];
  if (sourcePath) candidates.push(resolve(rootDir, sourcePath));
  if (snapshotPath) candidates.push(resolve(dirname(graphPath), snapshotPath));
  for (const candidate of candidates) {
    if (existsSync(candidate)) return readFileSync(candidate, "utf8");
  }
  return "";
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


function scoreCheck(id, pass, weight) {
  return { id, pass: pass === true, weight };
}

function executabilityBlocker({ affectedTaskIds = [], nextAction, ...input }) {
  const blocker = createBlockerV1(input);
  return {
    ...blocker,
    affectedTaskIds: uniqueStrings(affectedTaskIds),
    nextAction: String(nextAction || input.message || blocker.message).trim(),
  };
}

function summarizeGraphReadiness(graph = {}) {
  const items = Array.isArray(graph.items) ? graph.items : Array.isArray(graph.tasks) ? graph.tasks : [];
  const tasks = items.filter((item) => item && item.type !== "epic" && taskId(item));
  const statusById = new Map(tasks.map((item) => [taskId(item), normalizedStatus(item)]));
  const dispatchableTaskIds = [];
  const inFlightTaskIds = [];
  const blockedTaskIds = [];
  const remainingTaskIds = [];
  const terminalTaskIds = [];

  for (const item of tasks) {
    const id = taskId(item);
    const status = normalizedStatus(item);
    if (TERMINAL_TASK_STATUSES.has(status)) {
      terminalTaskIds.push(id);
      continue;
    }
    remainingTaskIds.push(id);
    if (IN_FLIGHT_TASK_STATUSES.has(status)) {
      inFlightTaskIds.push(id);
      continue;
    }
    const unresolved = dependencyIds(item).filter((depId) => !TERMINAL_TASK_STATUSES.has(statusById.get(depId) || ""));
    if (EXECUTABLE_TASK_STATUSES.has(status) && unresolved.length === 0) dispatchableTaskIds.push(id);
    else blockedTaskIds.push(id);
  }

  return {
    dispatchableTaskIds: dispatchableTaskIds.sort(),
    inFlightTaskIds: inFlightTaskIds.sort(),
    blockedTaskIds: blockedTaskIds.sort(),
    remainingTaskIds: remainingTaskIds.sort(),
    totals: {
      tasks: tasks.length,
      terminal: terminalTaskIds.length,
      remaining: remainingTaskIds.length,
      dispatchable: dispatchableTaskIds.length,
      inFlight: inFlightTaskIds.length,
      blocked: blockedTaskIds.length,
    },
  };
}

function emptyReadiness() {
  return {
    dispatchableTaskIds: [],
    inFlightTaskIds: [],
    blockedTaskIds: [],
    remainingTaskIds: [],
    totals: { tasks: 0, terminal: 0, remaining: 0, dispatchable: 0, inFlight: 0, blocked: 0 },
  };
}

function taskId(item = {}) {
  return String(item.itemId || item.taskId || item.id || "").trim();
}

function normalizedStatus(item = {}) {
  return String(item.status || item.effectiveStatus || "open").trim().toLowerCase();
}

function dependencyIds(item = {}) {
  return uniqueStrings([
    ...(Array.isArray(item.blockedBy) ? item.blockedBy : []),
    ...(Array.isArray(item.dependencies) ? item.dependencies : []),
    ...(Array.isArray(item.dependsOn) ? item.dependsOn : []),
  ]);
}

function affectedIdsFromIssues(issues = []) {
  return uniqueStrings(issues.map((issue) => issue.itemId || issue.taskId || issue.workItemId || issue.id).filter(Boolean));
}

function uniqueStrings(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))].sort();
}

function readOptional(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}
