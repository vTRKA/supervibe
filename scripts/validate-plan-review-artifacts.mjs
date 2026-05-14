#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { readWorkflowReceipts, validateWorkflowReceiptTrust } from "./lib/supervibe-workflow-receipt-runtime.mjs";
import { resolveActiveWorkItemGraph } from "./lib/supervibe-work-item-registry.mjs";

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
export const PLAN_REVIEW_BASE_REVIEWERS = Object.freeze([
  "supervibe-orchestrator",
  "systems-analyst",
  "architect-reviewer",
  "quality-gate-reviewer",
]);

export const PLAN_REVIEW_MANDATORY_RISK_REVIEWERS = Object.freeze([
  "security-auditor",
  "qa-test-engineer",
  "release-governance-reviewer",
  "db-reviewer",
]);

const REQUIRED_REVIEWERS = PLAN_REVIEW_BASE_REVIEWERS;
const USER_WAIVER_PATTERN = /\b(?:user[-\s]?waived\s+by\s+user|waived by user|explicit user waiver\s*:|user accepted waiver)\b/i;

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
  const summary = sectionBody(markdown, "Review Summary");
  const scorecard = sectionBody(markdown, "Plan Review Scorecard");
  const findings = sectionBody(markdown, "Findings");
  const evidence = sectionBody(markdown, "Evidence");
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
    body: scorecard,
    terms: PLAN_REVIEW_DIMENSION_TERMS,
  });
  if (!/Rubric\s*:\s*(?:`?plan-review(?:\.ya?ml)?`?)/i.test(scorecard)) {
    issues.push("plan review scorecard: missing rubric reference to plan-review");
  }
  const scoreMatch = /(?:Overall|Final|Review)?\s*Score\s*:\s*([0-9]+(?:\.[0-9]+)?)\s*\/\s*10/i.exec(scorecard)
    || /Score\s*:\s*([0-9]+(?:\.[0-9]+)?)\s*\/\s*10/i.exec(summary);
  if (!scoreMatch) {
    issues.push("plan review scorecard: missing numeric score out of 10");
  } else if (Number(scoreMatch[1]) < 9) {
    issues.push("plan review scorecard: score must be >= 9.0 for plan-review-passed gate");
  }
  if (!/\|\s*Dimension\s*\|\s*Score\s*\|\s*Evidence\s*\|/i.test(scorecard)) {
    issues.push("plan review scorecard: missing evidence column");
  }
  requireTerms({
    issues,
    section: "Findings",
    body: sectionBody(markdown, "Findings"),
    terms: ["Critical", "Major", "Minor", "Resolved", "Open"],
  });
  if (!hasSection(markdown, "Blocker Findings")) {
    issues.push("missing section: Blocker Findings");
  }
  if (!hasSection(markdown, "Non-Blocker Findings")) {
    issues.push("missing section: Non-Blocker Findings");
  }
  const blockerBody = sectionBody(markdown, "Blocker Findings");
  if (!/\b(Critical|Major)\b/i.test(blockerBody)) {
    issues.push("blocker findings: missing critical/major classification");
  }
  const nonBlockerBody = sectionBody(markdown, "Non-Blocker Findings");
  if (!/\b(Minor|Info|Advisory)\b/i.test(nonBlockerBody)) {
    issues.push("non-blocker findings: missing minor/info/advisory classification");
  }
  const blockerFindings = sectionBody(markdown, "Blocker Findings");
  const openBlockerSeverity = ["Critical", "Major"].find((severity) => {
    return hasOpenSeverityFinding(findings, severity) || hasOpenSeverityFinding(blockerFindings, severity);
  });
  if (openBlockerSeverity) {
    issues.push(`findings: pass verdict cannot have open critical or major findings (${openBlockerSeverity})`);
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
    body: evidence,
    terms: ["workflow receipt", "verification command", "plan-review-passed", "evidenceGatePass"],
  });
  const evidenceGateMatch = /\bevidenceGatePass\s*[:=]\s*(true|false|null)\b/i.exec(evidence);
  if (!evidenceGateMatch) {
    issues.push("evidence gate: missing evidenceGatePass:true");
  } else if (evidenceGateMatch[1].toLowerCase() !== "true") {
    issues.push(`evidence gate: evidenceGatePass:${evidenceGateMatch[1].toLowerCase()} blocks plan-review-passed`);
  }

  if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(markdown))) {
    issues.push("placeholders: unresolved placeholder or weak wording found");
  }
  return issues;
}

function normalizePath(value = "") {
  return String(value).replace(/\\/g, "/");
}

function resolvePlanPathFromReview(markdown = "") {
  const planMatch = /-\s*Plan:\s*`?([^`\r\n]+)`?/i.exec(markdown);
  return planMatch ? normalizePath(planMatch[1].trim()) : null;
}

function rel(rootDir, filePath) {
  return normalizePath(relative(rootDir, filePath));
}

function reviewMentionsPlan(markdown = "", planPath = "") {
  const normalizedPlan = normalizePath(planPath);
  if (!normalizedPlan) return false;
  return new RegExp(escapeRegex(normalizedPlan), "i").test(markdown);
}

export async function inspectActivePlanReviewSource({ rootDir = process.cwd(), planPath = null } = {}) {
  const targetPlan = planPath ? normalizePath(planPath) : null;
  const active = await resolveActiveWorkItemGraph({ rootDir });
  if (!targetPlan && active.status !== "active") {
    return { status: active.status === "none" ? "no-active-graph" : active.status, active, issues: [], warnings: [] };
  }
  const reviews = await walkMarkdown(join(rootDir, ".supervibe", "artifacts", "plan-reviews"));
  if (!reviews.length) {
    return { status: "no-review-artifacts", active, issues: ["no plan review artifacts found"], warnings: [] };
  }
  const desiredPlanPath = targetPlan || (() => null);
  let matched = [];
  for (const reviewFile of reviews) {
    const markdown = await readFile(reviewFile, "utf8");
    const declaredPlan = resolvePlanPathFromReview(markdown);
    const reviewRel = rel(rootDir, reviewFile);
    const reviewAbs = resolve(rootDir, reviewRel);
    const passesPlanMatch = desiredPlanPath
      ? declaredPlan === desiredPlanPath || reviewMentionsPlan(markdown, desiredPlanPath)
      : true;
    if (!passesPlanMatch) continue;
    matched.push({ reviewPath: reviewAbs, reviewRel, markdown, declaredPlan });
  }
  if (!matched.length && desiredPlanPath) {
    return {
      status: "missing-review-for-plan",
      active,
      issues: [`no review artifact references plan ${desiredPlanPath}`],
      warnings: [],
    };
  }
  matched = matched.sort((a, b) => b.reviewRel.localeCompare(a.reviewRel));
  const chosen = matched[0];
  return {
    status: "review-found",
    active,
    reviewPath: chosen.reviewPath,
    reviewRel: chosen.reviewRel,
    markdown: chosen.markdown,
    issues: [],
    warnings: [],
  };
}

function planReviewReviewerCoverageForArtifact(markdown = "") {
  const issues = [];
  const waivedReviewers = new Set();
  const requiredReviewers = new Set(PLAN_REVIEW_BASE_REVIEWERS);

  for (const reviewer of PLAN_REVIEW_BASE_REVIEWERS) {
    const disposition = reviewerCoverageDisposition(markdown, reviewer);
    if (!disposition.covered) {
      issues.push(`reviewer coverage: missing baseline reviewer ${reviewer}`);
    }
  }

  for (const reviewer of PLAN_REVIEW_MANDATORY_RISK_REVIEWERS) {
    const disposition = reviewerCoverageDisposition(markdown, reviewer);
    if (disposition.waived) {
      waivedReviewers.add(reviewer);
      continue;
    }
    requiredReviewers.add(reviewer);
    if (!disposition.covered) {
      issues.push(`reviewer coverage: missing mandatory risk reviewer ${reviewer} or explicit user waiver`);
    }
  }

  return {
    requiredReviewers: [...requiredReviewers],
    waivedReviewers: [...waivedReviewers],
    issues,
  };
}

function trustedReviewerReceiptsForArtifact(rootDir, reviewRel, markdown = "") {
  const coverageRequirements = planReviewReviewerCoverageForArtifact(markdown);
  const coverage = new Map(coverageRequirements.requiredReviewers.map((id) => [id, false]));
  const issues = [];
  const receipts = readWorkflowReceipts(rootDir);
  for (const receipt of receipts) {
    if (!receipt?.receiptId) continue;
    if (!["reviewer", "agent", "worker"].includes(String(receipt.subjectType || "").toLowerCase())) continue;
    const outputArtifacts = Array.isArray(receipt.outputArtifacts) ? receipt.outputArtifacts.map(normalizePath) : [];
    if (!outputArtifacts.includes(normalizePath(reviewRel))) continue;
    const trust = validateWorkflowReceiptTrust(rootDir, receipt);
    const id = String(receipt.subjectId || receipt.agentId || "").toLowerCase();
    if (!coverage.has(id)) continue;
    if (!trust.pass) {
      issues.push(`untrusted reviewer receipt for ${id}: ${trust.issues.join("; ")}`);
      continue;
    }
    coverage.set(id, true);
  }
  for (const [reviewer, seen] of coverage.entries()) {
    if (!seen) {
      issues.push([
        `missing trusted reviewer receipt for ${reviewer} bound to current review artifact`,
        `repair: node scripts/agent-invocation.mjs log --reviewer ${reviewer} --host codex --host-invocation-id <returned-host-agent-id> --task "Review plan artifact" --confidence <0-10> --issue-receipt --command /supervibe-plan --stage plan-review-${reviewer} --handoff-id <handoff-id> --output-artifacts ${reviewRel}`,
        `receipt repair fallback: node scripts/workflow-receipt.mjs issue --subject-type reviewer --subject-id ${reviewer} --output ${reviewRel}`,
      ].join("; "));
    }
  }
  return {
    pass: coverageRequirements.issues.length === 0 && issues.length === 0,
    issues: [...coverageRequirements.issues, ...issues],
    requiredReviewers: coverageRequirements.requiredReviewers,
    waivedReviewers: coverageRequirements.waivedReviewers,
  };
}

export async function validatePlanReviewGateForPlan({ rootDir = process.cwd(), planPath, requireActiveReview = true } = {}) {
  const inspection = await inspectActivePlanReviewSource({ rootDir, planPath });
  if (inspection.status !== "review-found") {
    return {
      pass: !requireActiveReview,
      reviewPath: null,
      issues: inspection.issues?.length ? inspection.issues : ["missing active review artifact"],
    };
  }
  const artifactIssues = validatePlanReviewArtifact(inspection.markdown);
  const receiptGate = trustedReviewerReceiptsForArtifact(rootDir, inspection.reviewRel, inspection.markdown);
  return {
    pass: artifactIssues.length === 0 && receiptGate.pass,
    reviewPath: inspection.reviewPath,
    reviewRel: inspection.reviewRel,
    issues: [...artifactIssues, ...receiptGate.issues],
  };
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
      plan: { type: "string" },
      "require-active-review": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    console.log(`Usage:
  node scripts/validate-plan-review-artifacts.mjs --file .supervibe/artifacts/plan-reviews/review.md
  node scripts/validate-plan-review-artifacts.mjs --all
  node scripts/validate-plan-review-artifacts.mjs --fixture-dir tests/fixtures/artifacts/plan-reviews
  node scripts/validate-plan-review-artifacts.mjs --plan .supervibe/artifacts/plans/example.md --require-active-review`);
    return;
  }

  const root = process.cwd();
  let files = values.file
    ? [values.file]
    : values["fixture-dir"]
      ? await walkMarkdown(join(root, values["fixture-dir"]))
      : await walkMarkdown(join(root, ".supervibe", "artifacts", "plan-reviews"));

  let activeReviewIssueCount = 0;
  if (values.plan || values["require-active-review"]) {
    const inspection = await inspectActivePlanReviewSource({
      rootDir: root,
      planPath: values.plan || null,
    });
    if (inspection.status === "review-found") {
      files = [inspection.reviewPath];
      const receiptGate = trustedReviewerReceiptsForArtifact(root, inspection.reviewRel, inspection.markdown);
      if (!receiptGate.pass) {
        activeReviewIssueCount += 1;
        console.error(`FAIL active-review ${inspection.reviewRel}`);
        for (const issue of receiptGate.issues) console.error(`  - ${issue}`);
      } else {
        console.log(`OK   active-review ${inspection.reviewRel}`);
      }
    } else if (values["require-active-review"]) {
      activeReviewIssueCount += 1;
      console.error("FAIL active-review");
      for (const issue of inspection.issues || ["missing active review artifact"]) console.error(`  - ${issue}`);
    } else {
      for (const issue of inspection.issues || []) console.warn(`WARN active-review ${issue}`);
    }
  }

  if (files.length === 0 && activeReviewIssueCount > 0) {
    console.error(`\n${activeReviewIssueCount}/${activeReviewIssueCount} plan review artifact(s) failed`);
    process.exit(1);
  }

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
  const failedArtifacts = report.results.filter((item) => item.issues.length > 0).length;
  if (!report.pass || activeReviewIssueCount > 0) {
    console.error(`\n${failedArtifacts + activeReviewIssueCount}/${report.results.length + (activeReviewIssueCount > 0 ? 1 : 0)} plan review artifact(s) failed`);
    process.exit(1);
  }
  console.log(`\nAll ${report.results.length} plan review artifact(s) passed`);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasOpenSeverityFinding(body = "", severity = "") {
  const severityPattern = new RegExp(`\\b${escapeRegex(severity)}\\b`, "i");
  for (const line of String(body || "").split(/\r?\n/)) {
    if (!severityPattern.test(line) || !/\bopen\b/i.test(line)) continue;
    const openCount = /open\s+count\s*[:=]?\s*(\d+)/i.exec(line)
      || /open\s*[:=]\s*(\d+)/i.exec(line)
      || /(\d+)\s+open\b/i.exec(line);
    if (openCount) return Number(openCount[1]) > 0;
  }
  return false;
}

function reviewerCoverageDisposition(markdown = "", reviewer = "") {
  const body = [
    sectionBody(markdown, "Reviewer Coverage"),
    sectionBody(markdown, "Risk Trigger Matrix"),
  ].filter(Boolean).join("\n");
  const reviewerPattern = new RegExp(`(^|[^a-z0-9-])${escapeRegex(reviewer)}([^a-z0-9-]|$)`, "i");
  const lines = body.split(/\r?\n/).filter((line) => reviewerPattern.test(line));
  return {
    covered: lines.length > 0,
    waived: lines.some((line) => USER_WAIVER_PATTERN.test(line)),
    lines,
  };
}

const isMain = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`;
if (isMain || process.argv[1]?.endsWith("validate-plan-review-artifacts.mjs")) {
  main().catch((error) => {
    console.error(error);
    process.exit(2);
  });
}
