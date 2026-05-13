import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  validatePlanReviewArtifact,
  validatePlanReviewGateForPlan,
} from "../scripts/validate-plan-review-artifacts.mjs";

const FIXTURE = "tests/fixtures/artifacts/plan-reviews/review-loop-hardening-plan-review.md";
const VALIDATOR = fileURLToPath(new URL("../scripts/validate-plan-review-artifacts.mjs", import.meta.url));

test("plan review artifact validator accepts the canonical fixture", async () => {
  const markdown = await readFile(FIXTURE, "utf8");
  assert.deepEqual(validatePlanReviewArtifact(markdown), []);
});

test("plan review artifact validator rejects missing convergence ledger", async () => {
  const markdown = await readFile(FIXTURE, "utf8");
  const bad = markdown.replace(/^## Convergence Ledger[\s\S]*?(?=^## Residual Risks)/m, "");
  const issues = validatePlanReviewArtifact(bad);
  assert.ok(issues.some((issue) => issue.includes("missing section: Convergence Ledger")));
});

test("plan review artifact validator rejects missing reviewer self-critique", async () => {
  const markdown = await readFile(FIXTURE, "utf8");
  const bad = markdown.replace(/^## Reviewer Self-Critique[\s\S]*?(?=^## Next User Decision)/m, "");
  const issues = validatePlanReviewArtifact(bad);
  assert.ok(issues.some((issue) => issue.includes("missing section: Reviewer Self-Critique")));
});

test("plan review artifact validator rejects missing plan-review rubric reference", async () => {
  const markdown = await readFile(FIXTURE, "utf8");
  const bad = markdown.replace("Rubric: `plan-review.yaml`\n", "");
  const issues = validatePlanReviewArtifact(bad);
  assert.ok(issues.some((issue) => issue.includes("missing rubric reference to plan-review")));
});

test("plan review artifact validator rejects missing blocker findings section", async () => {
  const markdown = await readFile(FIXTURE, "utf8");
  const bad = markdown.replace(/^## Blocker Findings[\s\S]*?(?=^## Non-Blocker Findings)/m, "");
  const issues = validatePlanReviewArtifact(bad);
  assert.ok(issues.some((issue) => issue.includes("missing section: Blocker Findings")));
});

test("plan review artifact validator rejects missing non-blocker findings section", async () => {
  const markdown = await readFile(FIXTURE, "utf8");
  const bad = markdown.replace(/^## Non-Blocker Findings[\s\S]*?(?=^## Convergence Ledger)/m, "");
  const issues = validatePlanReviewArtifact(bad);
  assert.ok(issues.some((issue) => issue.includes("missing section: Non-Blocker Findings")));
});

test("plan review artifact validator rejects evidenceGatePass false", async () => {
  const markdown = await readFile(FIXTURE, "utf8");
  const bad = markdown.replace("evidenceGatePass: true", "evidenceGatePass: false");
  const issues = validatePlanReviewArtifact(bad);
  assert.ok(issues.some((issue) => issue.includes("evidenceGatePass:false blocks plan-review-passed")));
});

test("plan review artifact validator rejects evidenceGatePass null", async () => {
  const markdown = await readFile(FIXTURE, "utf8");
  const bad = markdown.replace("evidenceGatePass: true", "evidenceGatePass: null");
  const issues = validatePlanReviewArtifact(bad);
  assert.ok(issues.some((issue) => issue.includes("evidenceGatePass:null blocks plan-review-passed")));
});

test("plan review artifact validator rejects seeded weak review with pass verdict and no evidence gate", async () => {
  const markdown = await readFile(FIXTURE, "utf8");
  const bad = markdown
    .replace("Score: 9.4/10", "Score: 9.1/10")
    .replace("- evidenceGatePass: true.\n", "")
    .replace("Critical: 0 Open, 1 Resolved", "Critical: 1 Open, 0 Resolved");
  const issues = validatePlanReviewArtifact(bad);
  assert.ok(issues.some((issue) => issue.includes("missing evidenceGatePass:true")));
  assert.ok(issues.some((issue) => issue.includes("pass verdict cannot have open critical or major findings")));
});

test("plan review artifact validator rejects pass with open major finding", async () => {
  const markdown = await readFile(FIXTURE, "utf8");
  const bad = markdown.replace("Major: 0 Open, 2 Resolved", "Major: 1 Open, 1 Resolved");
  const issues = validatePlanReviewArtifact(bad);
  assert.ok(issues.some((issue) => issue.includes("pass verdict cannot have open critical or major findings")));
});

test("plan review artifact validator rejects missing next user decision", async () => {
  const markdown = await readFile(FIXTURE, "utf8");
  const bad = markdown.replace("- Continue to atomization: run `/supervibe-loop --atomize-plan .supervibe/artifacts/plans/review-loop-hardening.md --plan-review-passed`.", "");
  const issues = validatePlanReviewArtifact(bad);
  assert.ok(issues.some((issue) => issue.includes("next user decision: missing Continue to atomization")));
});

test("validate-plan-review-artifacts CLI validates fixture directory", () => {
  const stdout = execFileSync(process.execPath, [
    VALIDATOR,
    "--fixture-dir",
    "tests/fixtures/artifacts/plan-reviews",
  ], { encoding: "utf8" });

  assert.match(stdout, /All 1 plan review artifact\(s\) passed/);
});

test("validate-plan-review-artifacts CLI fails bad file", async () => {
  const dir = await mkdir(join(tmpdir(), `plan-review-validator-${Date.now()}`), { recursive: true });
  const file = join(dir, "bad.md");
  await writeFile(file, "# Plan Review: Bad\n\n## Review Summary\n\n- Plan: none\n", "utf8");

  assert.throws(() => execFileSync(process.execPath, [VALIDATOR, "--file", file], {
    encoding: "utf8",
    stdio: "pipe",
  }), /plan review artifact\(s\) failed/);
});

test("validate-plan-review-artifacts CLI rejects active review mode when no review artifact exists", async () => {
  const dir = await mkdir(join(tmpdir(), `plan-review-active-${Date.now()}`), { recursive: true });

  assert.throws(() => execFileSync(process.execPath, [
    VALIDATOR,
    "--plan",
    ".supervibe/artifacts/plans/missing.md",
    "--require-active-review",
  ], {
    cwd: dir,
    encoding: "utf8",
    stdio: "pipe",
  }), /no plan review artifacts found[\s\S]*plan review artifact\(s\) failed/);
});

test("active plan review gate requires trusted reviewer receipts before atomization", async () => {
  const dir = await mkdir(join(tmpdir(), `plan-review-receipts-${Date.now()}`), { recursive: true });
  const reviewDir = join(dir, ".supervibe", "artifacts", "plan-reviews");
  await mkdir(reviewDir, { recursive: true });
  const reviewPath = join(reviewDir, "example-plan-review.md");
  const markdown = (await readFile(FIXTURE, "utf8"))
    .replaceAll(".supervibe/artifacts/plans/review-loop-hardening.md", ".supervibe/artifacts/plans/example.md");
  await writeFile(reviewPath, markdown, "utf8");

  const gate = await validatePlanReviewGateForPlan({
    rootDir: dir,
    planPath: ".supervibe/artifacts/plans/example.md",
    requireActiveReview: true,
  });

  assert.equal(gate.pass, false);
  assert.ok(gate.issues.some((issue) => issue.includes("missing trusted reviewer receipt for supervibe-orchestrator")));
  assert.ok(gate.issues.every((issue) => issue.includes("repair: node scripts/workflow-receipt.mjs issue")));
});
