#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildTaskGraphMaturityReport,
  formatTaskGraphMaturityReport,
} from "./lib/supervibe-task-graph-maturity.mjs";

function parseArgs(argv = []) {
  const options = {};
  for (let index = 2; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      options[key] = true;
      continue;
    }
    options[key] = next;
    index += 1;
  }
  return options;
}

function usage() {
  return [
    "SUPERVIBE_TASK_GRAPH_MATURITY_HELP",
    "USAGE:",
    "  node scripts/supervibe-task-graph-maturity.mjs [--root .] [--json] [--require-active-graph]",
    "",
    "Checks task graph integration maturity across routing, loop actions, UI controls, tracker sync, validators, tests, fixtures, and optional active workflow proof.",
  ].join("\n");
}


const TERMINAL_TASK_STATUSES = new Set(["closed", "complete", "completed", "done", "skipped", "cancelled"]);
const READY_TASK_STATUSES = new Set(["open", "ready"]);
const IN_FLIGHT_TASK_STATUSES = new Set(["claimed", "review"]);

function enrichExecutabilityGate(report, rootDir) {
  const graphPath = report.executability?.activeGraphResolution?.graphPath;
  if (!graphPath) return report;

  let graph = null;
  try {
    graph = JSON.parse(readFileSync(resolve(rootDir, graphPath), "utf8"));
  } catch (error) {
    return addExecutabilityAnalysis(report, {
      checks: [weightedCheck("executable-graph-inspection", false, 2)],
      blockers: [gateBlocker({
        code: "graph-inspection-failed",
        message: "Selected graph could not be inspected for executable decomposition: " + error.message,
        affectedTaskIds: [],
        nextAction: "repair or regenerate the selected work-item graph before dispatch",
        repairCommand: "node scripts/supervibe-loop.mjs --status",
        releaseImpact: "Graph executability cannot be trusted until the selected graph can be inspected.",
      })],
      readyTaskIds: [],
      blockedFinalTaskIds: [],
      dependencyIssueCount: 0,
      missingWriteScopeTaskIds: [],
      missingAcceptanceTaskIds: [],
      missingVerificationTaskIds: [],
    });
  }

  return addExecutabilityAnalysis(report, analyzeExecutableGraph(graph));
}

function addExecutabilityAnalysis(report, analysis) {
  const executability = report.executability || {};
  const checks = [...(executability.checks || []), ...analysis.checks];
  const blockers = [...(executability.blockers || []), ...analysis.blockers];
  const total = checks.reduce((sum, check) => sum + Number(check.weight || 0), 0);
  const earned = checks.reduce((sum, check) => sum + (check.pass ? Number(check.weight || 0) : 0), 0);
  const score = total === 0 ? 0 : Number(((earned / total) * 10).toFixed(1));
  const pass = score === 10 && blockers.length === 0;
  const primaryBlocker = blockers[0] || null;

  report.executability = {
    ...executability,
    schemaVersion: Math.max(Number(executability.schemaVersion || 1), 2),
    score,
    pass,
    status: pass ? "executable" : executability.activeProofRequired ? "blocked" : "informational-blocked",
    nextAction: primaryBlocker?.nextAction || executability.nextAction || "no graph execution repair needed",
    repairCommand: primaryBlocker?.repairCommand || executability.repairCommand || null,
    releaseImpact: primaryBlocker?.releaseImpact || executability.releaseImpact || "No graph executability blocker detected.",
    readyTaskIds: analysis.readyTaskIds,
    blockedFinalTaskIds: analysis.blockedFinalTaskIds,
    executableGate: {
      schemaVersion: 1,
      pass: analysis.blockers.length === 0,
      readyTaskCount: analysis.readyTaskIds.length,
      blockedFinalTaskCount: analysis.blockedFinalTaskIds.length,
      dependencyIssueCount: analysis.dependencyIssueCount,
      missingWriteScopeCount: analysis.missingWriteScopeTaskIds.length,
      missingAcceptanceCount: analysis.missingAcceptanceTaskIds.length,
      missingVerificationCount: analysis.missingVerificationTaskIds.length,
    },
    affectedTaskIds: uniqueStrings([
      ...(executability.affectedTaskIds || []),
      ...blockers.flatMap((blocker) => blocker.affectedTaskIds || []),
    ]),
    blockers,
    checks,
  };

  if (!pass) {
    report.pass = false;
    report.status = "needs-work";
  }
  return report;
}

function analyzeExecutableGraph(graph) {
  const items = Array.isArray(graph.items) ? graph.items : Array.isArray(graph.tasks) ? graph.tasks : [];
  const tasks = items.filter((item) => item && taskId(item) && item.type !== "epic");
  const taskIds = new Set(tasks.map(taskId));
  const statusById = new Map(tasks.map((task) => [taskId(task), normalizedStatus(task)]));
  const remainingTasks = tasks.filter((task) => !TERMINAL_TASK_STATUSES.has(normalizedStatus(task)));
  const dependentsById = new Map(tasks.map((task) => [taskId(task), []]));
  const dependencyIssues = [];

  for (const task of tasks) {
    const id = taskId(task);
    const dependencies = dependencyIds(task);
    const seenDeps = new Set();
    for (const dependencyId of dependencies) {
      if (dependencyId === id) dependencyIssues.push({ code: "self-dependency", taskId: id, dependencyId });
      if (seenDeps.has(dependencyId)) dependencyIssues.push({ code: "duplicate-dependency", taskId: id, dependencyId });
      seenDeps.add(dependencyId);
      if (!taskIds.has(dependencyId)) {
        dependencyIssues.push({ code: "missing-dependency", taskId: id, dependencyId });
      } else {
        dependentsById.get(dependencyId)?.push(id);
      }
    }
  }

  for (const taskIdInCycle of cycleTaskIds(tasks)) {
    dependencyIssues.push({ code: "dependency-cycle", taskId: taskIdInCycle, dependencyId: taskIdInCycle });
  }

  const readyTaskIds = [];
  const inFlightTaskIds = [];
  const blockedTaskIds = [];
  const missingWriteScopeTaskIds = [];
  const missingAcceptanceTaskIds = [];
  const missingVerificationTaskIds = [];
  const blockedFinalTaskIds = [];

  for (const task of remainingTasks) {
    const id = taskId(task);
    const status = normalizedStatus(task);
    const unresolvedDependencies = dependencyIds(task).filter((dependencyId) => {
      if (!taskIds.has(dependencyId)) return true;
      return !TERMINAL_TASK_STATUSES.has(statusById.get(dependencyId) || "");
    });
    if (IN_FLIGHT_TASK_STATUSES.has(status)) inFlightTaskIds.push(id);
    else if (READY_TASK_STATUSES.has(status) && unresolvedDependencies.length === 0) readyTaskIds.push(id);
    else blockedTaskIds.push(id);

    if (!hasWriteScope(task)) missingWriteScopeTaskIds.push(id);
    if (!hasAcceptance(task)) missingAcceptanceTaskIds.push(id);
    if (!hasVerification(task)) missingVerificationTaskIds.push(id);
    if (isFinalTask(task, dependentsById) && unresolvedDependencies.length > 0 && !hasBlockedFinalExplanation(task)) {
      blockedFinalTaskIds.push(id);
    }
  }

  const blockers = [];
  if (remainingTasks.length > 0 && readyTaskIds.length === 0 && inFlightTaskIds.length === 0) {
    blockers.push(gateBlocker({
      code: "no-ready-task",
      message: "Graph has remaining work but no ready or in-flight task.",
      affectedTaskIds: blockedTaskIds,
      nextAction: "complete dependencies or repair task status so at least one remaining task is executable",
      repairCommand: "node scripts/supervibe-loop.mjs --status",
      releaseImpact: "Agents cannot start safely without a deterministic ready task.",
    }));
  }
  if (dependencyIssues.length > 0) {
    blockers.push(gateBlocker({
      code: "dependency-sanity-failed",
      message: String(dependencyIssues.length) + " dependency sanity issue(s) were found.",
      affectedTaskIds: uniqueStrings(dependencyIssues.map((issue) => issue.taskId)),
      nextAction: "repair missing, duplicate, self-referential, or cyclic dependencies before dispatch",
      repairCommand: "node scripts/supervibe-loop.mjs --status",
      releaseImpact: "Unsafe dependency metadata can dispatch tasks out of order or deadlock the graph.",
    }));
  }
  if (missingWriteScopeTaskIds.length > 0) {
    blockers.push(gateBlocker({
      code: "write-scope-missing",
      message: String(missingWriteScopeTaskIds.length) + " remaining task(s) have no write scope.",
      affectedTaskIds: missingWriteScopeTaskIds,
      nextAction: "add explicit write scope or mark non-editing tasks with a durable rationale before dispatch",
      repairCommand: "node scripts/supervibe-loop.mjs --status",
      releaseImpact: "Agents cannot safely claim work without knowing the files or artifacts they may change.",
    }));
  }
  if (missingAcceptanceTaskIds.length > 0 || missingVerificationTaskIds.length > 0) {
    blockers.push(gateBlocker({
      code: "acceptance-verification-missing",
      message: String(missingAcceptanceTaskIds.length) + " task(s) lack acceptance and " + String(missingVerificationTaskIds.length) + " task(s) lack verification.",
      affectedTaskIds: uniqueStrings([...missingAcceptanceTaskIds, ...missingVerificationTaskIds]),
      nextAction: "add acceptance criteria and verification commands or deferred verification commands to remaining tasks",
      repairCommand: "node scripts/supervibe-loop.mjs --status",
      releaseImpact: "Task completion cannot be machine-checked without acceptance and verification contracts.",
    }));
  }
  if (blockedFinalTaskIds.length > 0) {
    blockers.push(gateBlocker({
      code: "blocked-final-task-unexplained",
      message: String(blockedFinalTaskIds.length) + " final task(s) are blocked without an explicit blocker explanation.",
      affectedTaskIds: blockedFinalTaskIds,
      nextAction: "record why each blocked final task is waiting and what must happen next",
      repairCommand: "node scripts/supervibe-loop.mjs --status",
      releaseImpact: "A graph can look complete while final release work is not safely runnable.",
    }));
  }

  return {
    readyTaskIds: readyTaskIds.sort(),
    blockedFinalTaskIds: blockedFinalTaskIds.sort(),
    dependencyIssueCount: dependencyIssues.length,
    missingWriteScopeTaskIds: missingWriteScopeTaskIds.sort(),
    missingAcceptanceTaskIds: missingAcceptanceTaskIds.sort(),
    missingVerificationTaskIds: missingVerificationTaskIds.sort(),
    blockers,
    checks: [
      weightedCheck("ready-task-or-inflight-work", remainingTasks.length === 0 || readyTaskIds.length > 0 || inFlightTaskIds.length > 0, 2),
      weightedCheck("dependency-sanity", dependencyIssues.length === 0, 2),
      weightedCheck("write-scope-availability", missingWriteScopeTaskIds.length === 0, 2),
      weightedCheck("acceptance-verification-presence", missingAcceptanceTaskIds.length === 0 && missingVerificationTaskIds.length === 0, 2),
      weightedCheck("blocked-final-task-explanation", blockedFinalTaskIds.length === 0, 2),
    ],
  };
}

function weightedCheck(id, pass, weight) {
  return { id, pass: pass === true, weight };
}

function gateBlocker({ code, message, affectedTaskIds, nextAction, repairCommand, releaseImpact }) {
  return {
    schemaVersion: 1,
    code,
    severity: "blocker",
    message,
    affectedTaskIds: uniqueStrings(affectedTaskIds),
    nextAction,
    repairCommand,
    releaseImpact,
  };
}

function cycleTaskIds(tasks) {
  const graph = new Map(tasks.map((task) => [taskId(task), dependencyIds(task)]));
  const visiting = new Set();
  const visited = new Set();
  const inCycle = new Set();

  function visit(id, stack = []) {
    if (visiting.has(id)) {
      for (const cycleId of stack.slice(stack.indexOf(id))) inCycle.add(cycleId);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependencyId of graph.get(id) || []) {
      if (graph.has(dependencyId)) visit(dependencyId, [...stack, id]);
    }
    visiting.delete(id);
    visited.add(id);
  }

  for (const id of graph.keys()) visit(id, []);
  return [...inCycle].sort();
}

function isFinalTask(task, dependentsById) {
  const id = taskId(task);
  if ((dependentsById.get(id) || []).length > 0) return false;
  const title = String(task.title || task.goal || "").toLowerCase();
  return title.includes("final") || title.includes("release") || dependencyIds(task).length > 0;
}

function hasWriteScope(task) {
  if (Array.isArray(task.writeScope) && task.writeScope.length > 0) return true;
  if (Array.isArray(task.writeSet) && task.writeSet.length > 0) return true;
  if (task.noWriteScopeRequired === true) return true;
  if (task.executionHints?.noWriteScopeRequired === true) return true;
  return false;
}

function hasAcceptance(task) {
  return Array.isArray(task.acceptanceCriteria) && task.acceptanceCriteria.some((item) => String(item || "").trim());
}

function hasVerification(task) {
  return [
    task.verificationCommands,
    task.deferredVerificationCommands,
    task.executionHints?.deferredVerificationCommands,
    task.verificationHints,
  ].some((items) => Array.isArray(items) && items.some((item) => String(item || "").trim()));
}

function hasBlockedFinalExplanation(task) {
  return [
    task.blockedReason,
    task.blockerExplanation,
    task.completionReason,
    task.executionHints?.blockedReason,
    task.executionHints?.blockerExplanation,
  ].some((value) => String(value || "").trim().length > 0);
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

function uniqueStrings(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))].sort();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv);
  if (options.help || options.h) {
    console.log(usage());
    process.exit(0);
  }
  const rootDir = resolve(options.root || process.cwd());
  const report = buildTaskGraphMaturityReport(rootDir, {
    requireActiveGraph: Boolean(options["require-active-graph"]),
  });
  enrichExecutabilityGate(report, rootDir);
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatTaskGraphMaturityReport(report));
  }
  process.exit(report.pass ? 0 : 1);
}
