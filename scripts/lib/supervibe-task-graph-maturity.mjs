import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { findCommandShortcut } from "./supervibe-command-catalog.mjs";
import { routeTriggerRequest } from "./supervibe-trigger-router.mjs";

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

const REQUIRED_LOOP_TOKENS = Object.freeze([
  "--atomize-plan",
  "--claim-ready",
  "--validate-completion",
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
  ];
  const requiredDimensions = dimensions.filter((dimension) => dimension.required !== false);
  const passed = requiredDimensions.filter((dimension) => dimension.pass).length;
  const score = requiredDimensions.length === 0
    ? 0
    : Number(((passed / requiredDimensions.length) * 10).toFixed(1));
  const pass = score === 10 && requiredDimensions.every((dimension) => dimension.pass);
  return {
    kind: "supervibe-task-graph-maturity",
    rootDir,
    score,
    pass,
    status: pass ? "10-of-10-ready" : "needs-work",
    dimensions,
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
  const checks = [
    ["structured evidence helper", validator.includes("isStructuredProductionEvidence")],
    ["insufficient evidence blocker", validator.includes("insufficient-evidence")],
    ["event reason is not collected as evidence", !validator.includes("event.evidence || event.reason || event")],
  ];
  const blockers = checks.filter(([, pass]) => !pass).map(([label]) => label);
  return {
    id: "strict-completion-evidence",
    title: "Strict production evidence",
    pass: blockers.length === 0,
    summary: blockers.length === 0 ? "completion validator rejects weak event reasons and unstructured evidence" : `${blockers.length} evidence checks missing`,
    blockers,
    evidence: ["scripts/lib/supervibe-epic-completion-validator.mjs"],
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
    "DIMENSIONS:",
  ];
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
  const dir = join(rootDir, ".supervibe", "memory", "work-items");
  const files = walkFiles(dir).filter((file) => file.endsWith("graph.json") || file.endsWith(".work-item-graph.json"));
  return {
    id: "current-active-graph",
    title: "Current project work graph",
    required,
    pass: required ? files.length > 0 : true,
    summary: files.length > 0 ? `${files.length} current graph file(s) found` : "no current graph active; atomize a reviewed plan when execution starts",
    blockers: required && files.length === 0 ? ["no current work-item graph files found"] : [],
    evidence: files.slice(0, 5).map((file) => relative(rootDir, file).split(sep).join("/")),
  };
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

function readOptional(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}
