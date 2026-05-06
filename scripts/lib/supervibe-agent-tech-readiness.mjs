import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { buildContextMcpSelfTest } from "../supervibe-context-mcp.mjs";
import { evaluateAgentRegressionChecks } from "./supervibe-agent-regression-checks.mjs";
import { buildProjectKnowledgeGraph } from "./supervibe-project-knowledge-graph.mjs";
import { buildRepoMap, selectRepoMapContext } from "./supervibe-repo-map.mjs";
import { buildTraceReadinessReport } from "./supervibe-runtime-trace.mjs";
import { inspectScipImportReadiness } from "./supervibe-scip-import.mjs";

const RECOMMENDATION_IDS = Object.freeze([
  "runtime-trace-spine",
  "context-mcp-v1",
  "repo-map-context-budget",
  "agent-rag-regression-harness",
  "checkpoint-resume-semantics",
  "memory-knowledge-graph",
  "scip-import-readiness",
]);

export async function buildAgentTechReadinessReport({
  rootDir = process.cwd(),
  repoMapMaxFiles = 120,
  now = new Date().toISOString(),
} = {}) {
  const trace = await buildTraceReadinessReport({ rootDir });
  const mcp = buildContextMcpSelfTest({ rootDir });
  const repoMap = await buildRepoMap({ rootDir, maxFiles: repoMapMaxFiles, tier: "standard" });
  const repoMapSelection = selectRepoMapContext(repoMap, { tier: "standard", query: "agent technology readiness trace mcp regression graph scip" });
  const regression = evaluateAgentRegressionChecks({ packageJson: readPackageJson(rootDir) });
  const checkpoint = inspectCheckpointSemantics(rootDir);
  const knowledgeGraph = await safeKnowledgeGraph({ rootDir, now });
  const scip = await inspectScipImportReadiness({ rootDir });

  const recommendations = [
    recommendation({
      id: "runtime-trace-spine",
      title: "OpenTelemetry-compatible local trace spine",
      status: trace.pass ? "implemented" : "blocked",
      evidence: [`spans=${trace.spans}`, `capabilities=${trace.capabilities.join(",")}`],
      nextAction: trace.nextAction,
    }),
    recommendation({
      id: "context-mcp-v1",
      title: "Read-only Supervibe Context MCP resources",
      status: mcp.pass && hasMcpResourceSet(mcp) ? "implemented" : "blocked",
      evidence: [`resources=${mcp.resources.length}`, `templates=${mcp.resourceTemplates.length}`],
      nextAction: "use read-only resources for host-neutral context exposure",
    }),
    recommendation({
      id: "repo-map-context-budget",
      title: "Aider-style repo map and token-budgeted context packs",
      status: repoMapSelection.usedTokens <= repoMapSelection.budget.repoMapTokens ? "implemented" : "blocked",
      evidence: [`files=${repoMap.fileCount}`, `repoMapTokens=${repoMapSelection.usedTokens}/${repoMapSelection.budget.repoMapTokens}`],
      nextAction: "feed selected repo-map context into task context packs",
    }),
    recommendation({
      id: "agent-rag-regression-harness",
      title: "Promptfoo-style declarative agent and RAG regression checks",
      status: regression.pass ? "implemented" : "blocked",
      evidence: [`cases=${regression.total}`, `failed=${regression.failed.length}`],
      nextAction: "extend cases as new workflow regressions are found",
    }),
    recommendation({
      id: "checkpoint-resume-semantics",
      title: "LangGraph-style checkpoint, interrupt, resume, and replay semantics",
      status: checkpoint.pass ? "implemented" : "blocked",
      evidence: checkpoint.evidence,
      nextAction: "keep deterministic loop state and side-effect ledgers as the local checkpoint contract",
    }),
    recommendation({
      id: "memory-knowledge-graph",
      title: "GraphRAG-inspired memory graph summaries",
      status: knowledgeGraph.pass ? "implemented" : "blocked",
      evidence: [`nodes=${knowledgeGraph.summary?.totalNodes || 0}`, `edges=${knowledgeGraph.summary?.totalEdges || 0}`],
      nextAction: "use knowledge graph search for durable memory and symbol relationships",
    }),
    recommendation({
      id: "scip-import-readiness",
      title: "Optional SCIP import path for precise code intelligence",
      status: scip.status === "json-summary" ? "implemented" : "deferred-with-gate",
      evidence: [`status=${scip.status}`, `binaryParser=${scip.binaryParser}`, `documents=${scip.summary.documents}`],
      nextAction: scip.nextAction,
    }),
  ];

  const failed = recommendations.filter((item) => !["implemented", "deferred-with-gate"].includes(item.status));
  return {
    schemaVersion: 1,
    generatedAt: now,
    pass: failed.length === 0 && recommendations.length === RECOMMENDATION_IDS.length,
    score: failed.length === 0 ? 10 : Math.max(0, 10 - failed.length),
    recommendations,
    failed,
    inputs: {
      trace,
      mcp: { pass: mcp.pass, resources: mcp.resources.length, templates: mcp.resourceTemplates.length },
      repoMap: { fileCount: repoMap.fileCount, selected: repoMapSelection.selected.length, usedTokens: repoMapSelection.usedTokens },
      regression: { pass: regression.pass, total: regression.total, failed: regression.failed.length },
      checkpoint,
      knowledgeGraph: { pass: knowledgeGraph.pass, summary: knowledgeGraph.summary },
      scip,
    },
  };
}

export function formatAgentTechReadinessReport(report = {}) {
  return [
    "SUPERVIBE_AGENT_TECH_READINESS",
    `PASS: ${Boolean(report.pass)}`,
    `SCORE: ${report.score ?? 0}/10`,
    `RECOMMENDATIONS: ${report.recommendations?.length || 0}`,
    `FAILED: ${report.failed?.length || 0}`,
    ...((report.recommendations || []).map((item) => `- ${item.id}: ${item.status} evidence=${item.evidence.join(" | ")} next=${item.nextAction}`)),
  ].join("\n");
}

function recommendation({ id, title, status, evidence, nextAction }) {
  return { id, title, status, evidence, nextAction };
}

function hasMcpResourceSet(report = {}) {
  const uris = new Set((report.resources || []).map((item) => item.uri));
  return [
    "supervibe://memory",
    "supervibe://code-context",
    "supervibe://code-graph",
    "supervibe://repo-map",
    "supervibe://project-knowledge-graph",
    "supervibe://agent-regression",
    "supervibe://runtime-trace",
    "supervibe://scip-import",
  ].every((uri) => uris.has(uri));
}

function inspectCheckpointSemantics(rootDir) {
  const files = [
    "scripts/lib/autonomous-loop-runner.mjs",
    "scripts/lib/autonomous-loop-doctor.mjs",
    "scripts/lib/autonomous-loop-archive.mjs",
    "scripts/lib/autonomous-loop-task-graph.mjs",
  ];
  const evidence = [];
  for (const rel of files) {
    const path = join(rootDir, ...rel.split("/"));
    if (!existsSync(path)) continue;
    const text = readFileSync(path, "utf8");
    const markers = [];
    if (/state\.json/.test(text)) markers.push("state-json");
    if (/events\.jsonl/.test(text)) markers.push("events-jsonl");
    if (/side-effects\.jsonl/.test(text)) markers.push("side-effects-jsonl");
    if (/resume|checkpoint|doctor|archive/i.test(text)) markers.push("resume-contract");
    evidence.push(`${rel}:${markers.join(",") || "present"}`);
  }
  return {
    pass: evidence.length >= 3 && evidence.some((item) => /state-json|resume-contract/.test(item)),
    evidence,
  };
}

async function safeKnowledgeGraph({ rootDir, now }) {
  try {
    const graph = await buildProjectKnowledgeGraph({ rootDir, now });
    return { pass: (graph.summary?.totalNodes || 0) > 0, summary: graph.summary };
  } catch (err) {
    return { pass: false, summary: { totalNodes: 0, totalEdges: 0 }, error: err.message };
  }
}

function readPackageJson(rootDir) {
  try {
    return JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"));
  } catch {
    return {};
  }
}
