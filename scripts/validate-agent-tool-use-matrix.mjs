#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const MATRIX_PATH = "docs/references/agent-tool-use-matrix.md";

const REQUIRED_MATRIX_PATTERNS = Object.freeze([
  /# Agent Tool Use Matrix/i,
  /Project memory is mandatory/i,
  /Code RAG is mandatory/i,
  /Code Graph is mandatory/i,
  /Workflow receipts are mandatory/i,
  /Verification commands are mandatory/i,
  /Core reviewers/i,
  /Repo researchers/i,
  /Refactoring specialists/i,
  /Stack developers/i,
  /Design agents/i,
  /UI reviewers/i,
  /Product agents/i,
  /Ops\/SRE agents/i,
  /Research agents/i,
  /Meta\/orchestrator agents/i,
  /Regulated-trust briefs/i,
  /supervibe:agent-retrieval-health -- --strict/i,
]);

const AGENT_REQUIRED_PATTERNS = Object.freeze([
  /Project Memory|supervibe:project-memory/i,
  /Code RAG|supervibe:code-search/i,
  /Code Graph|code graph|--callers|--callees|--neighbors/i,
  /confidence|supervibe:confidence-scoring/i,
]);

function walkMarkdown(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkMarkdown(full));
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

export function validateAgentToolUseMatrix(rootDir = process.cwd()) {
  const issues = [];
  const matrixFile = join(rootDir, ...MATRIX_PATH.split("/"));
  if (!existsSync(matrixFile)) {
    issues.push(issue(MATRIX_PATH, "missing-file", `${MATRIX_PATH}: file not found`));
  } else {
    const text = readFileSync(matrixFile, "utf8");
    for (const pattern of REQUIRED_MATRIX_PATTERNS) {
      if (!pattern.test(text)) issues.push(issue(MATRIX_PATH, "missing-matrix-contract", `${MATRIX_PATH}: missing ${pattern}`));
    }
  }

  for (const agentFile of walkMarkdown(join(rootDir, "agents"))) {
    const rel = agentFile.replace(rootDir, "").replace(/^[/\\]/, "").replace(/\\/g, "/");
    const text = readFileSync(agentFile, "utf8");
    for (const pattern of AGENT_REQUIRED_PATTERNS) {
      if (!pattern.test(text)) issues.push(issue(rel, "missing-agent-tool-baseline", `${rel}: missing ${pattern}`));
    }
  }

  return {
    pass: issues.length === 0,
    checked: 1 + walkMarkdown(join(rootDir, "agents")).length,
    issues,
  };
}

export function formatAgentToolUseMatrixReport(result = {}) {
  const lines = [
    "SUPERVIBE_AGENT_TOOL_USE_MATRIX",
    `PASS: ${result.pass === true}`,
    `CHECKED: ${result.checked || 0}`,
    `ISSUES: ${result.issues?.length || 0}`,
  ];
  for (const item of result.issues || []) {
    lines.push(`ISSUE: ${item.code} ${item.file} - ${item.message}`);
  }
  return lines.join("\n");
}

function issue(file, code, message) {
  return { file, code, message };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = validateAgentToolUseMatrix(process.cwd());
  console.log(formatAgentToolUseMatrixReport(result));
  process.exit(result.pass ? 0 : 1);
}
