#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

const ROOT = process.cwd();

const REQUIRED_DIMENSIONS = Object.freeze([
  "requirements-completeness",
  "specification-completeness",
  "traceability",
  "retrieval-evidence",
  "dependency-readiness",
  "implementation-confidence",
  "testability",
  "rollback-observability",
  "independent-review-provenance",
  "scope-safety",
]);

const REQUIRED_CAPS = Object.freeze([
  "missing-acceptance-criteria",
  "missing-verification-command",
  "verification-not-run",
  "verification-failed",
  "codegraph-missing",
  "index-not-ready",
  "high-risk-no-approval",
  "rollback-missing",
  "traceability-missing",
  "open-critical-findings",
  "evidence-gate-failed",
  "inline-producer",
  "untrusted-receipt-evidence",
]);

export async function validateDeliveryConfidence({ rootDir = ROOT } = {}) {
  const issues = [];

  const enginePath = join(rootDir, "scripts", "lib", "delivery-confidence-score.mjs");
  await requireFile(enginePath, "scripts/lib/delivery-confidence-score.mjs", issues);
  if (existsSync(enginePath)) {
    const engine = await readFile(enginePath, "utf8");
    for (const token of [
      "scoreDeliveryConfidence",
      "calculateReadinessScore",
      "evaluateDeliveryRisks",
      "inferDeliveryHardCaps",
      "riskPenalty",
      "HARD_CAPS",
    ]) {
      if (!engine.includes(token)) issues.push(`scripts/lib/delivery-confidence-score.mjs: missing ${token}`);
    }
  }

  const rubricPath = join(rootDir, "confidence-rubrics", "delivery-readiness.yaml");
  await requireFile(rubricPath, "confidence-rubrics/delivery-readiness.yaml", issues);
  if (existsSync(rubricPath)) {
    const rubric = parseYaml(await readFile(rubricPath, "utf8"));
    if (rubric?.artifact !== "delivery-readiness") issues.push("confidence-rubrics/delivery-readiness.yaml: artifact must be delivery-readiness");
    if (rubric?.["max-score"] !== 10) issues.push("confidence-rubrics/delivery-readiness.yaml: max-score must be 10");
    const dimensions = new Set((rubric?.dimensions || []).map((dimension) => dimension.id));
    for (const dimension of REQUIRED_DIMENSIONS) {
      if (!dimensions.has(dimension)) issues.push(`confidence-rubrics/delivery-readiness.yaml: missing dimension ${dimension}`);
    }
    const caps = rubric?.["hard-caps"] || {};
    for (const cap of REQUIRED_CAPS) {
      if (!Number.isFinite(Number(caps[cap]))) issues.push(`confidence-rubrics/delivery-readiness.yaml: missing numeric hard cap ${cap}`);
    }
    if (!String(rubric?.["risk-model"]?.formula || "").includes("mitigationCoverage")) {
      issues.push("confidence-rubrics/delivery-readiness.yaml: risk-model formula must include mitigationCoverage");
    }
    if (rubric?.gates?.["block-below"] !== 9 || rubric?.gates?.["warn-below"] !== 10) {
      issues.push("confidence-rubrics/delivery-readiness.yaml: gates must be block-below 9 and warn-below 10");
    }
  }

  const docsPath = join(rootDir, "docs", "confidence-gates-spec.md");
  await requireFile(docsPath, "docs/confidence-gates-spec.md", issues);
  if (existsSync(docsPath)) {
    const docs = await readFile(docsPath, "utf8");
    for (const token of [
      "Delivery Confidence Formula",
      "ReadinessScore",
      "RiskPenalty",
      "FinalConfidence",
      "hard caps",
      "NEXT_USER_ACTIONS[]",
    ]) {
      if (!docs.includes(token)) issues.push(`docs/confidence-gates-spec.md: missing ${token}`);
    }
  }

  const packagePath = join(rootDir, "package.json");
  await requireFile(packagePath, "package.json", issues);
  if (existsSync(packagePath)) {
    const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
    if (packageJson.scripts?.["validate:delivery-confidence"] !== "node scripts/validate-delivery-confidence.mjs") {
      issues.push("package.json: missing validate:delivery-confidence script");
    }
    const checkScript = String(packageJson.scripts?.check || "");
    const checkFullScript = String(packageJson.scripts?.["check:full"] || "");
    const checkCoversDeliveryConfidence = checkScript.includes("validate:delivery-confidence")
      || (checkScript.includes("run-release-check.mjs") && checkFullScript.includes("validate:delivery-confidence"));
    if (!checkCoversDeliveryConfidence) {
      issues.push("package.json: check script must include validate:delivery-confidence or route to check:full containing it");
    }
  }

  for (const file of [
    "tests/delivery-confidence-score.test.mjs",
    "tests/delivery-confidence-validator.test.mjs",
    "tests/autonomous-loop-evaluator.test.mjs",
    "tests/agent-invocation-logger.test.mjs",
  ]) {
    if (!existsSync(join(rootDir, ...file.split("/")))) issues.push(`${file}: required coverage file is missing`);
  }

  return { pass: issues.length === 0, issues };
}

export function formatDeliveryConfidenceValidation(result = {}) {
  const lines = [
    "SUPERVIBE_DELIVERY_CONFIDENCE_VALIDATION",
    `PASS: ${Boolean(result.pass)}`,
  ];
  if (result.issues?.length) {
    lines.push("ISSUES:");
    for (const issue of result.issues) lines.push(`- ${issue}`);
  }
  return lines.join("\n");
}

async function requireFile(path, label, issues) {
  if (!existsSync(path)) issues.push(`${label}: file not found`);
}

async function main() {
  const result = await validateDeliveryConfidence({ rootDir: ROOT });
  console.log(formatDeliveryConfidenceValidation(result));
  if (!result.pass) process.exitCode = 1;
}

const isMain = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`;
if (isMain || process.argv[1]?.endsWith("validate-delivery-confidence.mjs")) {
  main().catch((error) => {
    console.error(error);
    process.exit(2);
  });
}
