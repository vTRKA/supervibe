#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { relative, sep } from "node:path";

const TEMPLATE_RULES = [
  {
    file: "docs/templates/brainstorm-output-template.md",
    label: "brainstorm output template",
    requiredSections: [
      "Problem statement",
      "First-principle decomposition",
      "Evidence and retrieval plan",
      "Product and SDLC fit",
      "Scope Safety Gate",
      "Visual explanation plan",
      "Production readiness contract",
      "Acceptance and 10/10 scorecard",
    ],
    requiredTerms: [
      "RAG",
      "CodeGraph",
      "project memory",
      "Mermaid",
      "accTitle",
      "10/10",
      "defer / reject",
    ],
  },
  {
    file: "docs/templates/plan-template.md",
    label: "implementation plan template",
    requiredSections: [
      "AI/Data Boundary",
      "Retrieval, CodeGraph, And Visual Evidence",
      "Critical Path",
      "Scope Safety Gate",
      "Delivery Strategy",
      "Production Readiness",
      "Final 10/10 Acceptance Gate",
      "Execution Handoff",
    ],
    requiredTerms: [
      "RAG",
      "CodeGraph",
      "Mermaid",
      "accTitle",
      "rollback",
      "no open blockers",
    ],
  },
  {
    file: "templates/agent.md.tpl",
    label: "agent template",
    requiredSections: [
      "Persona",
      "RAG + Memory pre-flight",
      "Visual explanation standard",
      "User dialogue discipline",
      "Verification",
    ],
    requiredTerms: [
      "project-memory",
      "code-search",
      "CodeGraph",
      "Mermaid",
      "accDescr",
      "confidence-scoring",
    ],
  },
  {
    file: "templates/skill.md.tpl",
    label: "skill template",
    requiredSections: [
      "Step 0",
      "Retrieval and evidence policy",
      "Operational quality bar",
      "Visual explanation policy",
      "Decision tree",
      "Output contract",
      "Verification",
    ],
    requiredTerms: [
      "project-memory",
      "code-search",
      "CodeGraph",
      "Mermaid",
      "accTitle",
      "confidence-scoring",
    ],
  },
];

export function validateTemplateQuality({ rootDir = process.cwd(), rules = TEMPLATE_RULES } = {}) {
  const results = [];
  for (const rule of rules) {
    const path = `${rootDir}/${rule.file}`.replace(/\\/g, "/");
    const issues = [];
    if (!existsSync(path)) {
      issues.push("template file missing");
      results.push({ ...rule, path, issues });
      continue;
    }
    const markdown = readFileSync(path, "utf8");
    for (const section of rule.requiredSections || []) {
      if (!hasHeading(markdown, section)) issues.push(`missing section: ${section}`);
    }
    for (const term of rule.requiredTerms || []) {
      if (!new RegExp(escapeRegex(term), "i").test(markdown)) issues.push(`missing term: ${term}`);
    }
    results.push({ ...rule, path, issues });
  }
  return {
    pass: results.every((result) => result.issues.length === 0),
    results,
  };
}

export function formatTemplateQualityReport(report, { rootDir = process.cwd() } = {}) {
  const lines = ["SUPERVIBE_TEMPLATE_QUALITY", `PASS: ${report.pass}`];
  for (const result of report.results || []) {
    const rel = relative(rootDir, result.path).split(sep).join("/");
    lines.push(`${result.issues.length === 0 ? "OK" : "FAIL"} ${result.label}: ${rel}`);
    for (const issue of result.issues) lines.push(`  - ${issue}`);
  }
  return `${lines.join("\n")}\n`;
}

function hasHeading(markdown, section) {
  const escaped = escapeRegex(section);
  return new RegExp(`^#{2,3}\\s+${escaped}(?:\\s|$)`, "im").test(markdown);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("validate-template-quality.mjs")) {
  const report = validateTemplateQuality();
  process.stdout.write(formatTemplateQualityReport(report));
  if (!report.pass) process.exit(1);
}
