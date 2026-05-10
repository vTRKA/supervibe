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
      "Product and MVP delivery fit",
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
      "Development Contract Map",
      "File Structure",
      "Critical Path",
      "Scope Safety Gate",
      "Delivery Strategy",
      "Production Readiness",
      "Final 10/10 Acceptance Gate",
      "Self-Review",
      "Execution Handoff",
    ],
    requiredTerms: [
      "Behavior contract",
      "Architecture contract",
      "Data and schema contract",
      "API and event contract",
      "UI state contract",
      "Security and privacy contract",
      "Performance contract",
      "Observability contract",
      "Rollout and rollback contract",
      "Documentation and support contract",
      "Scope IDs",
      "Requirement IDs",
      "Contract rows touched",
      "Stop conditions",
      "MVP production slice",
      "anti-bloat",
      "RAG",
      "CodeGraph",
      "Mermaid",
      "accTitle",
      "rollback",
      "no open blockers",
    ],
    rejectedTerms: [
      "<one sentence>",
      "<2-3 sentences>",
      "<key libraries>",
      "<hard rules>",
      "Which approach?",
    ],
    minimumWordCount: 900,
  },
  {
    file: "docs/templates/plan-review-template.md",
    label: "plan review template",
    requiredSections: [
      "Review Summary",
      "Reviewer Coverage",
      "Risk Trigger Matrix",
      "Plan Review Scorecard",
      "Findings",
      "Convergence Ledger",
      "Residual Risks",
      "Reviewer Self-Critique",
      "Next User Decision",
      "Evidence",
    ],
    requiredTerms: [
      "supervibe-orchestrator",
      "systems-analyst",
      "architect-reviewer",
      "quality-gate-reviewer",
      "Reviewer Self-Critique",
      "Weak assumptions",
      "Hidden failure modes",
      "mvp-value",
      "architecture-fit",
      "cache-queue-topology",
      "convergence-decision",
      "workflow receipt",
      "plan-review-passed",
    ],
  },
  {
    file: "docs/templates/PRD-template.md",
    label: "PRD template",
    requiredSections: [
      "Problem Statement",
      "Users And Jobs",
      "Goals And Non-Goals",
      "Scope",
      "User Stories",
      "Requirements",
      "Success Metrics",
      "Data And Privacy",
      "Risks And Open Questions",
      "Launch And Readiness",
      "Acceptance And Evidence",
    ],
    requiredTerms: ["10/10", "verification", "source", "blocker", "PII", "permission", "redaction", "retention"],
    minimumWordCount: 250,
  },
  {
    file: "docs/templates/ADR-template.md",
    label: "ADR template",
    requiredSections: [
      "Status",
      "Context",
      "Decision",
      "Alternatives",
      "Consequences",
      "Compatibility And Migration",
      "Rollback And Review",
      "Evidence",
    ],
    requiredTerms: ["accepted", "constraint", "driver", "because", "owner", "benefit", "cost", "risk", "CodeGraph", "RAG", "verification"],
    minimumWordCount: 200,
  },
  {
    file: "docs/templates/RFC-template.md",
    label: "RFC template",
    requiredSections: [
      "Summary",
      "Motivation",
      "Proposal",
      "Contracts",
      "Compatibility And Migration",
      "Rollout And Rollback",
      "Verification Plan",
      "Security Privacy Observability",
      "Open Questions",
    ],
    requiredTerms: ["owner", "status", "outcome", "architecture", "data", "API", "failure mode", "schema", "event", "error", "permission", "observability"],
    minimumWordCount: 250,
  },
  {
    file: "docs/templates/decision-brief-template.md",
    label: "decision brief template",
    requiredSections: [
      "Executive Summary",
      "User Decision",
      "Visual Explanation",
      "Options",
      "Risk And Tradeoff Summary",
      "Implementation Snapshot",
      "Next User Actions",
      "Acceptance And Evidence",
    ],
    requiredTerms: [
      "plain-language",
      "recommended action",
      "Mermaid",
      "accTitle",
      "accDescr",
      "Text fallback",
      "Continue",
      "Revise",
      "Defer",
      "Stop",
      "Evidence And Assumptions",
      "Complexity cost",
      "Residual risks accepted",
    ],
    minimumWordCount: 250,
  },
  {
    file: "docs/templates/api-contract-template.md",
    label: "API contract template",
    requiredSections: [
      "Contract Overview",
      "Protocol And Versioning",
      "Auth And Authorization",
      "Request And Response Contract",
      "Error Envelope",
      "Idempotency And Retry Semantics",
      "Frontend Integration",
      "Mock Data And Scenarios",
      "Verification",
    ],
    requiredTerms: [
      "OpenAPI",
      "GraphQL",
      "RPC",
      "breaking change",
      "error envelope",
      "idempotency",
      "retry",
      "typed client",
      "mock",
      "Example request",
      "Example success response",
      "Redacted fields",
      "Security test",
      "Observability check",
      "Rollback check",
    ],
    minimumWordCount: 300,
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
    for (const term of rule.rejectedTerms || []) {
      if (new RegExp(escapeRegex(term), "i").test(markdown)) issues.push(`rejected generic prompt term: ${term}`);
    }
    if (rule.minimumWordCount && countWords(markdown) < rule.minimumWordCount) {
      issues.push(`template too thin: expected at least ${rule.minimumWordCount} words`);
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

function countWords(markdown) {
  return String(markdown)
    .replace(/`[^`]*`/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("validate-template-quality.mjs")) {
  const report = validateTemplateQuality();
  process.stdout.write(formatTemplateQualityReport(report));
  if (!report.pass) process.exit(1);
}
