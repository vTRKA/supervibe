import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { validatePlanReviewArtifact } from "../scripts/validate-plan-review-artifacts.mjs";

const FIXTURE = "tests/fixtures/artifacts/plan-reviews/review-loop-hardening-plan-review.md";

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

test("plan review artifact validator rejects missing next user decision", async () => {
  const markdown = await readFile(FIXTURE, "utf8");
  const bad = markdown.replace("- Continue to atomization: run `/supervibe-loop --atomize-plan .supervibe/artifacts/plans/review-loop-hardening.md --plan-review-passed`.", "");
  const issues = validatePlanReviewArtifact(bad);
  assert.ok(issues.some((issue) => issue.includes("next user decision: missing Continue to atomization")));
});

test("validate-plan-review-artifacts CLI validates fixture directory", () => {
  const stdout = execFileSync(process.execPath, [
    "scripts/validate-plan-review-artifacts.mjs",
    "--fixture-dir",
    "tests/fixtures/artifacts/plan-reviews",
  ], { encoding: "utf8" });

  assert.match(stdout, /All 1 plan review artifact\(s\) passed/);
});

test("validate-plan-review-artifacts CLI fails bad file", async () => {
  const dir = await mkdir(join(tmpdir(), `plan-review-validator-${Date.now()}`), { recursive: true });
  const file = join(dir, "bad.md");
  await writeFile(file, "# Plan Review: Bad\n\n## Review Summary\n\n- Plan: none\n", "utf8");

  assert.throws(() => execFileSync(process.execPath, ["scripts/validate-plan-review-artifacts.mjs", "--file", file], {
    encoding: "utf8",
    stdio: "pipe",
  }), /plan review artifact\(s\) failed/);
});
