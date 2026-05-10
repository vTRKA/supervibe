#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { parseArgs } from "node:util";

export const PLAN_REVIEW_REQUIRED_SECTIONS = Object.freeze([
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
]);

export const PLAN_REVIEW_DIMENSION_TERMS = Object.freeze([
  "spec-coverage",
  "mvp-value",
  "scope-safety",
  "architecture-fit",
  "data-storage-topology",
  "cache-queue-topology",
  "api-contract-readiness",
  "security-privacy",
  "observability-release-support",
  "dependency-graph",
  "task-size",
  "verification-coverage",
  "rollback-coverage",
  "parallel-safety",
  "worktree-suitability",
  "provider-policy",
  "convergence-decision",
]);

const PLACEHOLDER_PATTERNS = Object.freeze([
  /\bTBD\b/i,
  /<[^>\n]+>/,
  /\.\.\./,
  /\bto be decided\b/i,
  /\bsimilar to\b/i,
  /\badd appropriate\b/i,
  /\bimplement later\b/i,
]);

function hasSection(markdown, section) {
  return new RegExp(`^##\\s+${escapeRegex(section)}\\s*$`, "im").test(markdown);
}

function sectionBody(markdown, section) {
  const re = new RegExp(`^##\\s+${escapeRegex(section)}\\s*$`, "im");
  const match = re.exec(markdown);
  if (!match) return "";
  const start = match.index + match[0].length;
  const rest = markdown.slice(start);
  const next = /^##\s+/im.exec(rest);
  return (next ? rest.slice(0, next.index) : rest).trim();
}

function requireTerms({ issues, section, body, terms }) {
  for (const term of terms) {
    if (!new RegExp(escapeRegex(term), "i").test(body)) {
      issues.push(`${section.toLowerCase()}: missing ${term}`);
    }
  }
}

export function validatePlanReviewArtifact(markdown) {
  const issues = [];
  if (!/^#\s+Plan Review:/im.test(markdown)) {
    issues.push('format: missing "# Plan Review:" heading');
  }
  for (const section of PLAN_REVIEW_REQUIRED_SECTIONS) {
    if (!hasSection(markdown, section)) issues.push(`missing section: ${section}`);
  }

  requireTerms({
    issues,
    section: "Review Summary",
    body: sectionBody(markdown, "Review Summary"),
    terms: ["Plan", "Verdict", "Score", "Stop reason"],
  });
  requireTerms({
    issues,
    section: "Reviewer Coverage",
    body: sectionBody(markdown, "Reviewer Coverage"),
    terms: ["supervibe-orchestrator", "systems-analyst", "architect-reviewer", "quality-gate-reviewer"],
  });
  requireTerms({
    issues,
    section: "Risk Trigger Matrix",
    body: sectionBody(markdown, "Risk Trigger Matrix"),
    terms: ["database", "cache", "queue", "security", "api", "infrastructure", "frontend"],
  });
  requireTerms({
    issues,
    section: "Plan Review Scorecard",
    body: sectionBody(markdown, "Plan Review Scorecard"),
    terms: PLAN_REVIEW_DIMENSION_TERMS,
  });
  const scorecard = sectionBody(markdown, "Plan Review Scorecard");
  if (!/\|\s*Dimension\s*\|\s*Score\s*\|\s*Evidence\s*\|/i.test(scorecard)) {
    issues.push("plan review scorecard: missing evidence column");
  }
  requireTerms({
    issues,
    section: "Findings",
    body: sectionBody(markdown, "Findings"),
    terms: ["Critical", "Major", "Minor", "Resolved", "Open"],
  });
  const summary = sectionBody(markdown, "Review Summary");
  const findings = sectionBody(markdown, "Findings");
  if (/\b(Verdict|plan-review-passed)\b[\s\S]{0,80}\bpass(?:ed)?\b/i.test(summary)) {
    if (/\b(Critical|Major)\s*:\s*[1-9]\d*\s+Open\b/i.test(findings)) {
      issues.push("findings: pass verdict cannot have open critical or major findings");
    }
  }
  requireTerms({
    issues,
    section: "Convergence Ledger",
    body: sectionBody(markdown, "Convergence Ledger"),
    terms: ["Iteration", "Opened", "Resolved", "Remaining", "Stop reason"],
  });
  requireTerms({
    issues,
    section: "Residual Risks",
    body: sectionBody(markdown, "Residual Risks"),
    terms: ["Accepted", "Owner", "Expiry", "Rollback", "Source"],
  });
  requireTerms({
    issues,
    section: "Reviewer Self-Critique",
    body: sectionBody(markdown, "Reviewer Self-Critique"),
    terms: ["Weak assumptions", "What could be missed", "Hidden failure modes", "senior engineer", "10/10"],
  });
  requireTerms({
    issues,
    section: "Next User Decision",
    body: sectionBody(markdown, "Next User Decision"),
    terms: [
      "Continue to atomization",
      "Revise reviewed plan first",
      "Ask another specialist review",
      "Inspect readiness",
      "Keep reviewed plan and stop",
    ],
  });
  requireTerms({
    issues,
    section: "Evidence",
    body: sectionBody(markdown, "Evidence"),
    terms: ["workflow receipt", "verification command", "plan-review-passed"],
  });

  if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(markdown))) {
    issues.push("placeholders: unresolved placeholder or weak wording found");
  }
  return issues;
}

async function walkMarkdown(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walkMarkdown(path));
    else if (entry.name.endsWith(".md")) out.push(path);
  }
  return out;
}

export async function validatePlanReviewArtifactFiles({ rootDir = process.cwd(), files = [] } = {}) {
  const results = [];
  for (const file of files) {
    const markdown = await readFile(file, "utf8");
    results.push({ file, issues: validatePlanReviewArtifact(markdown) });
  }
  return {
    pass: results.every((result) => result.issues.length === 0),
    results,
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      file: { type: "string", short: "f" },
      all: { type: "boolean", default: false },
      "fixture-dir": { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    console.log(`Usage:
  node scripts/validate-plan-review-artifacts.mjs --file .supervibe/artifacts/plan-reviews/review.md
  node scripts/validate-plan-review-artifacts.mjs --all
  node scripts/validate-plan-review-artifacts.mjs --fixture-dir tests/fixtures/artifacts/plan-reviews`);
    return;
  }

  const root = process.cwd();
  const files = values.file
    ? [values.file]
    : values["fixture-dir"]
      ? await walkMarkdown(join(root, values["fixture-dir"]))
      : await walkMarkdown(join(root, ".supervibe", "artifacts", "plan-reviews"));

  if (files.length === 0) {
    console.log("[validate-plan-review-artifacts] no plan review markdown files found; skipping");
    return;
  }

  const report = await validatePlanReviewArtifactFiles({ rootDir: root, files });
  for (const result of report.results) {
    const rel = relative(root, result.file).split(sep).join("/");
    if (result.issues.length === 0) {
      console.log(`OK   plan-review ${rel}`);
    } else {
      console.error(`FAIL plan-review ${rel}`);
      for (const issue of result.issues) console.error(`  - ${issue}`);
    }
  }
  if (!report.pass) {
    console.error(`\n${report.results.filter((item) => item.issues.length > 0).length}/${report.results.length} plan review artifact(s) failed`);
    process.exit(1);
  }
  console.log(`\nAll ${report.results.length} plan review artifact(s) passed`);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const isMain = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`;
if (isMain || process.argv[1]?.endsWith("validate-plan-review-artifacts.mjs")) {
  main().catch((error) => {
    console.error(error);
    process.exit(2);
  });
}
