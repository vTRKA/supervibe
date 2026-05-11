#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

const REQUIREMENT_HEADING = /^(?:#{1,4}\s*)?(?:Requirement|Goal|Success Criteria|Acceptance Criteria|Recovered Work Items)\s*[:#-]?\s*(.*)$/i;

export function extractTraceabilityRequirements(markdown = "") {
  const text = String(markdown || "");
  const requirements = [];
  const lines = text.split(/\r?\n/);
  let inRequirementList = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (REQUIREMENT_HEADING.test(line)) {
      inRequirementList = true;
      const title = line.replace(/^#{1,4}\s*/, "").replace(/^(Requirement|Goal|Success Criteria|Acceptance Criteria)\s*[:#-]?\s*/i, "").trim();
      if (title && !/^(requirements?|recovered work items)$/i.test(title)) requirements.push(title);
      continue;
    }
    if (/^#{1,4}\s+/.test(line) && !/^(#{1,4}\s*)?(Requirement|Goal|Success Criteria|Acceptance Criteria|Recovered Work Items)/i.test(line)) {
      inRequirementList = false;
    }
    if (inRequirementList && /^[-*]\s+\S/.test(line)) {
      requirements.push(line.replace(/^[-*]\s+/, "").replace(/\s+\[[ x]\]$/i, "").trim());
    }
  }
  return [...new Set(requirements.map(normalizeRequirement).filter(Boolean))];
}

export function validateTaskGraphTraceability({ spec = "", plan = "", graph = null, requireRequirements = false } = {}) {
  const requirements = [
    ...extractTraceabilityRequirements(spec),
    ...extractTraceabilityRequirements(plan),
  ];
  const uniqueRequirements = [...new Set(requirements)];
  const issues = [];
  if (graph && requireRequirements && uniqueRequirements.length === 0) {
    issues.push("active graph has no source requirements");
  }
  if (!graph) {
    return {
      pass: uniqueRequirements.length === 0,
      neutral: uniqueRequirements.length === 0,
      requirements: uniqueRequirements,
      mapped: 0,
      issues: uniqueRequirements.length ? ["graph is required when requirements are present"] : [],
    };
  }
  const items = Array.isArray(graph.items) ? graph.items : [];
  const evidence = Array.isArray(graph.evidence) ? graph.evidence : [];
  const terminalItems = items.filter((item) => isTerminal(item.status));
  const mapped = new Set();
  for (const requirement of uniqueRequirements) {
    const matches = terminalItems.filter((item) => itemMatchesRequirement(item, requirement));
    if (!matches.length) {
      issues.push(`requirement has no terminal work item: ${requirement}`);
      continue;
    }
    mapped.add(requirement);
    const hasEvidence = matches.some((item) => itemHasEvidence(item, evidence));
    if (!hasEvidence) issues.push(`requirement has no production evidence: ${requirement}`);
    for (const item of matches) {
      if (isSkippedOrCancelled(item.status) && (!impactReason(item) || !impactText(item))) {
        issues.push(`skipped/cancelled item lacks reason and impact: ${item.itemId || item.id}`);
      }
    }
  }
  return {
    pass: issues.length === 0,
    neutral: uniqueRequirements.length === 0,
    requirements: uniqueRequirements,
    mapped: mapped.size,
    issues,
  };
}

export function formatTaskGraphTraceabilityReport(report = {}) {
  const lines = [
    "SUPERVIBE_TASK_GRAPH_TRACEABILITY",
    `PASS: ${report.pass === true}`,
    `NEUTRAL: ${report.neutral === true}`,
    `REQUIREMENTS: ${(report.requirements || []).length}`,
    `MAPPED: ${report.mapped || 0}`,
    `ISSUES: ${(report.issues || []).length}`,
  ];
  for (const issue of report.issues || []) lines.push(`ISSUE: ${issue}`);
  return lines.join("\n");
}

function normalizeRequirement(value = "") {
  return String(value || "")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function itemMatchesRequirement(item = {}, requirement = "") {
  const haystack = [
    item.sourceRequirement,
    item.requirementId,
    item.requirement,
    item.itemId,
    item.id,
    item.type,
    item.title,
    item.description,
    ...(Array.isArray(item.requirementIds) ? item.requirementIds : []),
    ...(Array.isArray(item.acceptanceCriteria) ? item.acceptanceCriteria : []),
    ...(Array.isArray(item.labels) ? item.labels : []),
  ].filter(Boolean).join(" ").toLowerCase();
  const normalized = requirement.toLowerCase();
  if (haystack.includes(normalized)) return true;
  const tokens = normalized.split(/[^a-z0-9]+/).filter((token) => token.length > 3);
  return tokens.length > 0 && tokens.every((token) => haystack.includes(token));
}

function isTerminal(status = "") {
  return /^(done|complete|completed|closed|skipped|cancelled|canceled)$/i.test(String(status || ""));
}

function isSkippedOrCancelled(status = "") {
  return /^(skipped|cancelled|canceled)$/i.test(String(status || ""));
}

function impactReason(item = {}) {
  return item.skipReason || item.cancelReason || item.closeReason || item.reason;
}

function impactText(item = {}) {
  return item.skipImpact || item.cancelImpact || item.scopeImpact || item.goalImpact || item.impact;
}

function itemHasEvidence(item = {}, graphEvidence = []) {
  const id = item.itemId || item.id;
  return Boolean(
    item.evidence?.length
    || item.verificationEvidence?.length
    || graphEvidence.some((entry) => (entry.taskId || entry.itemId || entry.id) === id)
  );
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--help" || item === "-h") args.help = true;
    else if (item === "--json") args.json = true;
    else if (item === "--strict") args.strict = true;
    else if (item.startsWith("--")) args[item.slice(2)] = argv[++index];
  }
  return args;
}

function readIfPresent(path) {
  return path && existsSync(path) ? readFileSync(path, "utf8") : "";
}

function readGraphSourceMarkdown({ rootDir, graphPath, graph }) {
  if (!graph || !graphPath) return "";
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

function findActiveGraph(rootDir) {
  const workItemsDir = join(rootDir, ".supervibe", "memory", "work-items");
  if (!existsSync(workItemsDir)) return null;
  const candidates = [];
  for (const name of readFileSyncSafeDir(workItemsDir)) {
    const path = join(workItemsDir, name, "graph.json");
    if (existsSync(path)) candidates.push(path);
  }
  return candidates.length === 1 ? candidates[0] : null;
}

function readFileSyncSafeDir(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function usage() {
  return [
    "SUPERVIBE_TASK_GRAPH_TRACEABILITY_HELP",
    "USAGE:",
    "  node scripts/validate-task-graph-traceability.mjs --spec <spec.md> --plan <plan.md> --graph <graph.json>",
    "  node scripts/validate-task-graph-traceability.mjs --strict",
  ].join("\n");
}

if (process.argv[1]?.endsWith("validate-task-graph-traceability.mjs")) {
  const args = parseArgs();
  if (args.help) {
    console.log(usage());
    process.exit(0);
  }
  const root = process.cwd();
  const graphPath = args.graph || findActiveGraph(root);
  const graph = graphPath && existsSync(graphPath) ? JSON.parse(readFileSync(graphPath, "utf8")) : null;
  const plan = readIfPresent(args.plan) || (!args.spec && !args.plan ? readGraphSourceMarkdown({ rootDir: root, graphPath, graph }) : "");
  const report = validateTaskGraphTraceability({
    spec: readIfPresent(args.spec),
    plan,
    graph,
    requireRequirements: Boolean(args.strict && graph),
  });
  if (graphPath) report.graph = relative(root, graphPath).split(sep).join("/");
  console.log(args.json ? JSON.stringify(report, null, 2) : formatTaskGraphTraceabilityReport(report));
  if (!report.pass && (args.strict || !report.neutral)) process.exit(1);
}
