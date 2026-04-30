import { readFile } from "node:fs/promises";
import { createTaskGraph } from "./autonomous-loop-task-graph.mjs";
import { calculateReadyFront } from "./autonomous-loop-ready-front.mjs";

export const GRAPH_EXPORT_FORMATS = Object.freeze(["json", "mermaid", "dot", "text"]);

export async function loadStateForGraphExport(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

export function createGraphInspection(state = {}) {
  const graph = createTaskGraph({
    graph_id: state.task_graph?.graph_id || state.run_id || "autonomous-loop-graph",
    source: state.task_graph?.source || { type: "state", runId: state.run_id || "unknown" },
    tasks: state.tasks || state.task_graph?.tasks || [],
  });
  const rawTasksById = new Map((state.tasks || state.task_graph?.tasks || []).map((task) => [task.id, task]));
  const readyFront = calculateReadyFront(graph, {
    maxConcurrentAgents: state.preflight?.max_concurrent_agents || 3,
    maxPolicyRiskLevel: "high",
    reviewersAvailable: true,
  });
  const scores = new Map((state.scores || []).map((score) => [score.taskId, score]));
  const claims = new Map((state.claims || []).map((claim) => [claim.taskId, claim]));
  const gatesByTask = new Map();
  for (const gate of state.gates || []) {
    if (!gatesByTask.has(gate.taskId)) gatesByTask.set(gate.taskId, []);
    gatesByTask.get(gate.taskId).push(gate);
  }
  const readyIds = new Set((readyFront.ready || []).map((task) => task.id));
  const parallelIds = new Set((readyFront.parallel || []).map((task) => task.id));
  const anchorsByTask = collectAnchorsByTask(state);

  const nodes = graph.tasks.map((task) => ({
    id: task.id,
    title: task.title || task.goal,
    goal: task.goal,
    status: task.status,
    score: scores.get(task.id)?.finalScore ?? null,
    claim: claims.get(task.id) || null,
    gates: gatesByTask.get(task.id) || [],
    requeueReason: rawTasksById.get(task.id)?.requeueReason || null,
    ready: readyIds.has(task.id),
    parallelReady: parallelIds.has(task.id),
    dependencies: [...task.dependencies],
    dependents: [...task.dependents],
    semanticAnchors: anchorsByTask.get(task.id) || [],
  }));
  const edges = graph.tasks.flatMap((task) =>
    task.dependencies.map((dependencyId) => ({
      from: dependencyId,
      to: task.id,
      type: "depends-on",
    }))
  ).concat(
    [...anchorsByTask.entries()].flatMap(([taskId, anchors]) =>
      anchors.map((anchor) => ({ from: `anchor:${anchor.anchorId}`, to: taskId, type: "anchors" }))
    ),
  );

  return {
    graphId: graph.graph_id,
    runId: state.run_id || null,
    status: state.status || null,
    observabilitySummary: state.observability_summary || state.observabilitySummary || null,
    readyFront: {
      valid: readyFront.valid,
      ready: readyFront.ready.map((task) => task.id),
      parallel: readyFront.parallel.map((task) => task.id),
      blocked: readyFront.blocked.map((task) => ({ id: task.id, blockers: task.blockers || [] })),
      issues: readyFront.issues || [],
    },
    nodes,
    edges,
  };
}

export function exportGraph(state = {}, { format = "text" } = {}) {
  const normalized = normalizeFormat(format);
  const inspection = createGraphInspection(state);
  if (normalized === "json") return `${JSON.stringify(inspection, null, 2)}\n`;
  if (normalized === "mermaid") return renderMermaid(inspection);
  if (normalized === "dot") return renderDot(inspection);
  return renderText(inspection);
}

export function renderMermaid(inspection) {
  const lines = ["flowchart TD"];
  for (const node of inspection.nodes) {
    lines.push(`  ${mermaidId(node.id)}["${escapeMermaid(labelForNode(node, "<br/>"))}"]`);
  }
  for (const edge of inspection.edges) {
    lines.push(`  ${mermaidId(edge.from)} --> ${mermaidId(edge.to)}`);
  }
  return `${lines.join("\n")}\n`;
}

export function renderDot(inspection) {
  const lines = [`digraph "${escapeDot(inspection.graphId)}" {`, "  rankdir=LR;"];
  for (const node of inspection.nodes) {
    lines.push(`  "${escapeDot(node.id)}" [label="${escapeDot(labelForNode(node, "\\n"))}"];`);
  }
  for (const edge of inspection.edges) {
    lines.push(`  "${escapeDot(edge.from)}" -> "${escapeDot(edge.to)}";`);
  }
  lines.push("}");
  return `${lines.join("\n")}\n`;
}

export function renderText(inspection) {
  const lines = [
    `Graph: ${inspection.graphId}`,
    `Run: ${inspection.runId || "unknown"}`,
    `Status: ${inspection.status || "unknown"}`,
    `Ready: ${inspection.readyFront.ready.join(", ") || "none"}`,
    "",
  ];
  for (const node of inspection.nodes) {
    const marker = node.parallelReady ? ">>" : node.ready ? ">" : "-";
    lines.push(`${marker} ${node.id} [${node.status}] ${node.title}`);
    lines.push(`  score=${node.score ?? "none"} claim=${node.claim?.claimId || "none"} gates=${node.gates.length} requeue=${node.requeueReason || "none"}`);
    if (node.dependencies.length > 0) lines.push(`  depends_on=${node.dependencies.join(", ")}`);
    if (node.semanticAnchors.length > 0) lines.push(`  anchors=${node.semanticAnchors.map((anchor) => anchor.anchorId).join(", ")}`);
  }
  return `${lines.join("\n")}\n`;
}

function collectAnchorsByTask(state = {}) {
  const byTask = new Map();
  for (const contract of state.contracts || []) {
    const anchors = contract.semanticAnchors || [];
    if (!anchors.length) continue;
    if (!byTask.has(contract.taskId)) byTask.set(contract.taskId, []);
    byTask.get(contract.taskId).push(...anchors);
  }
  for (const task of state.tasks || []) {
    const anchors = task.semanticAnchors || [];
    if (!anchors.length) continue;
    if (!byTask.has(task.id)) byTask.set(task.id, []);
    byTask.get(task.id).push(...anchors);
  }
  return byTask;
}

function normalizeFormat(format) {
  const value = String(format || "text").trim().toLowerCase();
  return GRAPH_EXPORT_FORMATS.includes(value) ? value : "text";
}

function labelForNode(node, separator) {
  return [
    node.id,
    node.status,
    node.score == null ? "score:none" : `score:${node.score}`,
    node.claim ? `claim:${node.claim.claimId}` : "claim:none",
    node.gates.length > 0 ? `gates:${node.gates.length}` : "gates:0",
    node.requeueReason ? `requeue:${node.requeueReason}` : null,
    node.ready ? "ready" : null,
  ].filter(Boolean).join(separator);
}

function mermaidId(id) {
  return `n_${String(id).replace(/[^a-zA-Z0-9_]/g, "_")}`;
}

function escapeMermaid(value) {
  return String(value).replace(/"/g, "'");
}

function escapeDot(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}
