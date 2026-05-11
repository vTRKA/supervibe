#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { validateEpicCompletion } from "./lib/supervibe-epic-completion-validator.mjs";
import { createWorkItemIndex, detectOrphanWorkItems, detectStaleWorkItems, groupWorkItemsByStatus } from "./lib/supervibe-work-item-query.mjs";
import { resolveActiveWorkItemGraph } from "./lib/supervibe-work-item-registry.mjs";

export function summarizeTaskGraphStatus(graph = {}, { graphPath = "" } = {}) {
  const index = createWorkItemIndex({
    graph,
    claims: graph.claims || [],
    gates: graph.gates || [],
    evidence: graph.evidence || [],
  });
  const grouped = groupWorkItemsByStatus(index);
  const stale = detectStaleWorkItems(index);
  const orphans = detectOrphanWorkItems(index, graph);
  const nextReady = grouped.ready[0]?.itemId || grouped.ready[0]?.id || null;
  const completion = validateEpicCompletion(graph);
  const nextAction = nextReady
    ? `claim ${nextReady} or inspect blockers`
    : completion.pass
      ? "finish/archive completed epic"
      : "validate completion or unblock remaining work";
  return {
    graphPath,
    epicId: graph.epicId || graph.graph_id || graph.graphId || "unknown",
    total: index.length,
    ready: grouped.ready.length,
    blocked: grouped.blocked.length,
    stale: stale.length,
    orphans: orphans.length,
    completionPass: completion.pass === true,
    nextAction,
  };
}

export async function validateTaskGraphStatusConsistency({ rootDir = process.cwd(), graphPath = null } = {}) {
  const issues = [];
  let selectedPath = graphPath;
  if (!selectedPath) {
    const active = await resolveActiveWorkItemGraph({ rootDir });
    if (active.status === "active") selectedPath = active.graphPath;
    else if (active.status === "none") {
      return { pass: true, neutral: true, summaries: [], issues: [] };
    } else {
      issues.push(`active graph is ${active.status}: ${active.nextAction || "inspect registry"}`);
    }
  }
  const paths = selectedPath ? [selectedPath] : findGraphFiles(rootDir);
  const summaries = [];
  for (const path of paths) {
    if (!existsSync(path)) {
      issues.push(`graph path not found: ${path}`);
      continue;
    }
    const graph = JSON.parse(readFileSync(path, "utf8"));
    const summary = summarizeTaskGraphStatus(graph, { graphPath: relative(rootDir, path).split(sep).join("/") });
    summaries.push(summary);
    if (summary.completionPass && !/finish\/archive completed epic/i.test(summary.nextAction)) {
      issues.push(`${summary.graphPath}: completed graph has wrong next action: ${summary.nextAction}`);
    }
    if (!summary.completionPass && summary.nextAction === "finish/archive completed epic") {
      issues.push(`${summary.graphPath}: incomplete graph reports finish/archive`);
    }
  }
  return {
    pass: issues.length === 0,
    neutral: false,
    summaries,
    issues,
  };
}

export function formatTaskGraphStatusConsistencyReport(report = {}) {
  const lines = [
    "SUPERVIBE_TASK_GRAPH_STATUS_CONSISTENCY",
    `PASS: ${report.pass === true}`,
    `NEUTRAL: ${report.neutral === true}`,
    `GRAPHS: ${(report.summaries || []).length}`,
    `ISSUES: ${(report.issues || []).length}`,
  ];
  for (const summary of report.summaries || []) {
    lines.push(`GRAPH: ${summary.graphPath || summary.epicId}`);
    lines.push(`  COMPLETION_PASS: ${summary.completionPass}`);
    lines.push(`  NEXT_ACTION: ${summary.nextAction}`);
  }
  for (const issue of report.issues || []) lines.push(`ISSUE: ${issue}`);
  return lines.join("\n");
}

function findGraphFiles(rootDir) {
  const dir = join(rootDir, ".supervibe", "memory", "work-items");
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name, "graph.json");
    if (existsSync(path)) out.push(path);
  }
  return out;
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--help" || item === "-h") args.help = true;
    else if (item === "--json") args.json = true;
    else if (item === "--file") args.file = argv[++index];
  }
  return args;
}

if (process.argv[1]?.endsWith("validate-task-graph-status-consistency.mjs")) {
  const args = parseArgs();
  if (args.help) {
    console.log("Usage: node scripts/validate-task-graph-status-consistency.mjs [--file graph.json]");
    process.exit(0);
  }
  const report = await validateTaskGraphStatusConsistency({
    rootDir: process.cwd(),
    graphPath: args.file || null,
  });
  console.log(args.json ? JSON.stringify(report, null, 2) : formatTaskGraphStatusConsistencyReport(report));
  if (!report.pass) process.exit(1);
}
