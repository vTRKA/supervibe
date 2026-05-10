import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import {
  artifactRoot,
} from "./supervibe-artifact-roots.mjs";
import {
  validateDesignVariantSet,
} from "./design-variant-set.mjs";

const REQUIRED_DESIGN_REVIEW_FILES = Object.freeze(["polish.md", "a11y.md"]);
const PROTOTYPE_HIGH_CONFIDENCE_CHECKS = Object.freeze([
  { id: "dom-overflow", patterns: [/dom[-_\s]?overflow/i, /no\s+overflow/i] },
  { id: "focus-trap", patterns: [/focus[-_\s]?trap/i] },
  { id: "escape-behavior", patterns: [/escape[-_\s]+(?:key|behavior|closes)/i, /\besc\b/i] },
  { id: "aria-activedescendant", patterns: [/aria-activedescendant/i] },
  { id: "aria-selected", patterns: [/aria-selected/i] },
  { id: "native-button-semantics", patterns: [/native[-_\s]+button/i, /button[-_\s]+semantics/i] },
  { id: "approval-composer-disabled", patterns: [/composer.*disabled/i, /blocked\s+composer/i, /approval.*disabled/i] },
  { id: "visible-focus", patterns: [/visible[-_\s]+focus/i, /focus-visible/i] },
  { id: "reduced-motion", patterns: [/reduced[-_\s]+motion/i, /prefers-reduced-motion/i] },
]);

export function evaluateDesignQualityGate(rootDir = process.cwd(), {
  slug = "",
  requireReviews = false,
  receiptValidation = null,
  browserVerification = null,
} = {}) {
  const prototypeRoot = slug ? join(artifactRoot(rootDir, "prototypes"), slug) : null;
  const reviewRoot = prototypeRoot ? join(prototypeRoot, "_reviews") : null;
  const reviewFiles = listReviewFiles(reviewRoot);
  const reviews = reviewFiles.map((file) => parseReviewFile(rootDir, file));
  const issues = reviews.flatMap((review) => review.findings);
  if (requireReviews && !prototypeWorkStarted(prototypeRoot)) {
    issues.push({
      code: "prototype-not-started",
      severity: "blocker",
      file: prototypeRoot ? rel(rootDir, prototypeRoot) : `.supervibe/artifacts/prototypes/${slug || "<slug>"}`,
      line: 0,
      message: "prototype artifacts must exist before approval can be evaluated",
    });
  }
  const missingRequiredReviews = requiredReviewFilesMissing(reviewRoot, { requireReviews });
  for (const fileName of missingRequiredReviews) {
    issues.push({
      code: "missing-required-review",
      severity: "high",
      file: reviewRoot ? rel(rootDir, join(reviewRoot, fileName)) : `_reviews/${fileName}`,
      line: 0,
      message: `${fileName}: required review is missing before prototype approval`,
    });
  }
  if (prototypeRoot && existsSync(join(prototypeRoot, "variant-manifest.json"))) {
    const variantSet = validateDesignVariantSet(rootDir, { slug });
    for (const variantIssue of variantSet.issues || []) {
      issues.push({
        code: "design-variant-set-invalid",
        severity: "high",
        file: variantIssue.file,
        line: 0,
        message: `${variantIssue.code}: ${variantIssue.message}`,
      });
    }
  }

  const blockerCount = issues.filter((item) => item.severity === "blocker").length;
  const highCount = issues.filter((item) => item.severity === "high").length;
  const approvalAllowed = blockerCount === 0 && highCount === 0;
  const confidence = aggregateDesignConfidence({
    qualityIssues: issues,
    receiptValidation,
    browserVerification,
  });

  return {
    schemaVersion: 1,
    slug: slug || null,
    reviewRoot: reviewRoot ? rel(rootDir, reviewRoot) : null,
    checkedReviews: reviews.length,
    requiredReviews: [...REQUIRED_DESIGN_REVIEW_FILES],
    missingRequiredReviews,
    blockerCount,
    highCount,
    approvalAllowed,
    pass: approvalAllowed,
    confidence,
    reviews,
    issues,
    nextAllowedActions: approvalAllowed
      ? ["approve-prototype", "package-handoff", "revise-prototype", "stop"]
      : ["revise-prototype", "rerun-blocked-review", "stop"],
  };
}

export function aggregateDesignConfidence({
  builderConfidence = null,
  polishConfidence = null,
  a11yConfidence = null,
  browserVerification = null,
  receiptValidation = null,
  qualityIssues = [],
} = {}) {
  const components = [
    componentScore("prototype-builder", builderConfidence),
    componentScore("ui-polish-reviewer", polishConfidence),
    componentScore("accessibility-reviewer", a11yConfidence),
    browserVerificationScore(browserVerification),
    receiptValidationScore(receiptValidation),
  ].filter((item) => item.score !== null);
  const rawScore = components.length
    ? round(components.reduce((sum, item) => sum + item.score, 0) / components.length)
    : 8;
  const caps = [];
  const blockers = qualityIssues.filter((item) => item.severity === "blocker");
  const highs = qualityIssues.filter((item) => item.severity === "high");
  if (blockers.length) caps.push({ score: 6, reason: "BLOCKER review finding" });
  if (qualityIssues.some((item) => item.code === "prototype-not-started")) caps.push({ score: 0, reason: "prototype not started" });
  if (highs.length) caps.push({ score: 7, reason: "high severity review finding" });
  if (receiptValidation && receiptValidation.pass !== true) caps.push({ score: 7, reason: "receipt validation failed" });
  if (browserVerification && browserVerification.pass === false) caps.push({ score: 7, reason: "browser verification failed" });
  const cap = caps.length ? Math.min(...caps.map((item) => item.score)) : 10;
  const finalScore = round(Math.min(rawScore, cap));
  return {
    score: finalScore,
    rawScore,
    cap,
    capped: finalScore < rawScore,
    capReasons: caps.filter((item) => item.score === cap).map((item) => item.reason),
    components,
  };
}

export function validatePrototypeBuilderHighConfidenceEvidence(rootDir = process.cwd(), {
  confidence = null,
  evidencePaths = [],
} = {}) {
  const score = Number(confidence);
  if (!Number.isFinite(score) || score < 9) {
    return { pass: true, required: false, missingChecks: [], checkedEvidence: [], issues: [] };
  }
  const evidence = readEvidenceTexts(rootDir, evidencePaths);
  const text = evidence.map((item) => item.text).join("\n");
  const missingChecks = PROTOTYPE_HIGH_CONFIDENCE_CHECKS
    .filter((check) => !check.patterns.some((pattern) => pattern.test(text)))
    .map((check) => check.id);
  const issues = missingChecks.map((id) => ({
    code: "missing-prototype-builder-high-confidence-check",
    severity: "high",
    file: evidence.length ? evidence.map((item) => item.path).join(",") : "input-evidence",
    message: `prototype-builder confidence >= 9 requires evidence for ${id}`,
  }));
  return {
    pass: issues.length === 0,
    required: true,
    missingChecks,
    checkedEvidence: evidence.map((item) => item.path),
    issues,
  };
}

export function formatDesignQualityGateReport(result = {}) {
  const lines = [
    "SUPERVIBE_DESIGN_QUALITY_GATE",
    `PASS: ${result.pass === true}`,
    `SLUG: ${result.slug || "none"}`,
    `APPROVAL_ALLOWED: ${result.approvalAllowed === true}`,
    `CHECKED_REVIEWS: ${result.checkedReviews || 0}`,
    `BLOCKERS: ${result.blockerCount || 0}`,
    `HIGH: ${result.highCount || 0}`,
    `CONFIDENCE: ${result.confidence?.score ?? "unknown"}`,
    `CONFIDENCE_CAP: ${result.confidence?.cap ?? "unknown"}`,
  ];
  for (const issue of result.issues || []) {
    lines.push(`ISSUE: ${issue.severity} ${issue.file}:${issue.line || 0} ${issue.message}`);
  }
  if (result.nextAllowedActions?.length) {
    lines.push(`NEXT_ALLOWED_ACTIONS: ${result.nextAllowedActions.join(",")}`);
  }
  return lines.join("\n");
}

function parseReviewFile(rootDir, file) {
  const text = readFileSync(file, "utf8");
  const findings = [];
  const lines = text.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    const severity = severityForReviewLine(line);
    if (!severity) continue;
    findings.push({
      code: `${severity}-review-finding`,
      severity,
      file: rel(rootDir, file),
      line: index + 1,
      message: cleanReviewLine(line),
    });
  }
  return {
    file: rel(rootDir, file),
    findings,
  };
}

function severityForReviewLine(line = "") {
  const value = String(line || "").trim();
  if (!value || isNegatedFindingLine(value)) return null;
  if (/\b(?:blocker|critical|p0)\b/i.test(value) || /verdict\s*:\s*(?:blocked|hard-block)/i.test(value)) {
    return "blocker";
  }
  if (
    /(?:severity|priority|risk|issue|finding)\s*[:=-]\s*high\b/i.test(value)
    || /^\s{0,3}#{1,6}\s*high\b/i.test(value)
    || /^\s*[-*]?\s*\[?high\]?\s*[:-]/i.test(value)
    || /\bp1\b/i.test(value)
  ) {
    return "high";
  }
  return null;
}

function isNegatedFindingLine(line = "") {
  return /\b(?:no|none|0)\s+(?:open\s+)?(?:blockers?|critical(?:\s+issues?)?|p0(?:\s+issues?)?|p1(?:\s+issues?)?|high(?:-severity)?\s+issues?)\b/i.test(line)
    || /\b(?:blockers?|critical(?:\s+issues?)?|p0(?:\s+issues?)?|p1(?:\s+issues?)?|high(?:-severity)?\s+issues?)\s*[:=-]\s*(?:none|0|no)\b/i.test(line)
    || /\bhigh confidence\b/i.test(line);
}

function cleanReviewLine(line = "") {
  return String(line || "").replace(/^\s{0,3}(?:[-*]\s*)?/, "").trim();
}

function listReviewFiles(reviewRoot) {
  if (!reviewRoot || !existsSync(reviewRoot)) return [];
  return readdirSync(reviewRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => join(reviewRoot, entry.name))
    .filter((file) => statSync(file).size <= 1_000_000)
    .sort((left, right) => left.localeCompare(right));
}

function requiredReviewFilesMissing(reviewRoot, { requireReviews = false } = {}) {
  if (!requireReviews) return [];
  return REQUIRED_DESIGN_REVIEW_FILES.filter((fileName) => !reviewRoot || !existsSync(join(reviewRoot, fileName)));
}

function prototypeWorkStarted(prototypeRoot) {
  if (!prototypeRoot || !existsSync(prototypeRoot)) return false;
  return existsSync(join(prototypeRoot, "index.html"))
    || existsSync(join(prototypeRoot, "variant-manifest.json"));
}

function componentScore(name, value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return { name, score: null, source: "missing" };
  return { name, score: clamp(score), source: "agent-confidence" };
}

function browserVerificationScore(value) {
  if (!value) return { name: "browser-verification", score: null, source: "missing" };
  if (typeof value.score === "number") return { name: "browser-verification", score: clamp(value.score), source: value.source || "browser" };
  return { name: "browser-verification", score: value.pass === true ? 9.5 : 6, source: value.source || "browser" };
}

function receiptValidationScore(value) {
  if (!value) return { name: "receipt-validation", score: null, source: "missing" };
  return { name: "receipt-validation", score: value.pass === true ? 9.5 : 6, source: "workflow-receipts" };
}

function readEvidenceTexts(rootDir, paths = []) {
  const out = [];
  for (const item of paths || []) {
    const relPath = normalizeRelPath(item);
    const absPath = join(rootDir, ...relPath.split("/"));
    if (!existsSync(absPath) || !statSync(absPath).isFile() || statSync(absPath).size > 1_000_000) continue;
    out.push({ path: relPath, text: readFileSync(absPath, "utf8") });
  }
  return out;
}

function clamp(value) {
  return Math.max(0, Math.min(10, Number(value)));
}

function round(value) {
  return Number(Number(value).toFixed(1));
}

function rel(rootDir, path) {
  return normalizeRelPath(relative(rootDir, path));
}

function normalizeRelPath(path) {
  return String(path ?? "").split(sep).join("/").replace(/^\.\//, "");
}
