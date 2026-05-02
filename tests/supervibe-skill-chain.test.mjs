import assert from "node:assert/strict";
import test from "node:test";

import {
  assertNoSilentStop,
  createPlanReviewPackage,
  evaluatePlanReviewPackage,
  formatNextStepBlock,
  getNextWorkflowStep,
  PHASE_ALIASES,
  PLAN_REVIEW_DIMENSIONS,
  parseNextStepBlock,
  WORKFLOW_PHASES,
} from "../scripts/lib/supervibe-skill-chain.mjs";

test("workflow phase graph forces brainstorm to plan to review to atomization", () => {
  assert.ok(WORKFLOW_PHASES.includes("brainstorm"));
  assert.equal(PHASE_ALIASES.plan_review_passed, "plan-review");
  assert.ok(PLAN_REVIEW_DIMENSIONS.includes("provider-policy"));
  assert.equal(getNextWorkflowStep("brainstorm").command, "/supervibe-plan");
  assert.equal(getNextWorkflowStep("plan").command, "/supervibe-plan --review");
  assert.equal(getNextWorkflowStep("plan-review").command, "/supervibe-loop --from-plan --atomize");
  assert.equal(getNextWorkflowStep("work-item-atomization").command, "/supervibe-loop --guided --max-duration 3h");
  assert.equal(getNextWorkflowStep("worktree-setup").command, "/supervibe-loop --epic --worktree --max-duration 3h");
});

test("next-step handoff block is parseable and prevents silent producer stops", () => {
  const output = formatNextStepBlock({
    phase: "plan",
    artifactPath: ".supervibe/artifacts/plans/example.md",
    locale: "en",
  });

  const parsed = parseNextStepBlock(output);
  assert.equal(parsed.nextCommand, "/supervibe-plan --review");
  assert.equal(parsed.nextSkill, "supervibe:requesting-code-review");

  const assertion = assertNoSilentStop({
    phase: "plan",
    output,
    artifactPath: ".supervibe/artifacts/plans/example.md",
    locale: "en",
  });
  assert.equal(assertion.pass, true);
});

test("no-silent-stop assertion fails when next question is missing", () => {
  const assertion = assertNoSilentStop({
    phase: "brainstorm",
    output: "Spec saved to .supervibe/artifacts/specs/example.md",
    artifactPath: ".supervibe/artifacts/specs/example.md",
    locale: "en",
  });
  assert.equal(assertion.pass, false);
  assert.ok(assertion.missing.some((item) => item.code === "handoff-marker"));
  assert.ok(assertion.missing.some((item) => item.code === "question"));
});

test("plan review package passes only with atomic tasks, verification, rollback, and policy guard", () => {
  const planReviewPackage = createPlanReviewPackage({
    planPath: ".supervibe/artifacts/plans/example.md",
    specPath: ".supervibe/artifacts/specs/example.md",
    coverageMatrix: true,
    worktree: { required: true },
    policy: { providerSafe: true },
    tasks: [
      {
        id: "T1",
        dependencies: [],
        atomic: true,
        verification: "npm test",
        rollback: "git revert <sha>",
        parallelGroup: "A",
        writeSet: ["scripts/lib/a.mjs"],
      },
      {
        id: "T2",
        dependencies: ["T1"],
        atomic: true,
        verification: "npm test",
        rollback: "git revert <sha>",
        parallelGroup: "B",
        writeSet: ["scripts/lib/b.mjs"],
      },
    ],
  });

  const evaluation = evaluatePlanReviewPackage(planReviewPackage);
  assert.equal(evaluation.pass, true);
  assert.equal(evaluation.score, 10);
});

test("plan review package blocks parallel write conflicts and permission bypass", () => {
  const planReviewPackage = createPlanReviewPackage({
    planPath: ".supervibe/artifacts/plans/example.md",
    specPath: ".supervibe/artifacts/specs/example.md",
    coverageMatrix: true,
    tasks: [
      {
        id: "T1",
        dependencies: [],
        atomic: true,
        verification: "npm test",
        rollback: "git revert <sha>",
        parallelGroup: "A",
        writeSet: ["README.md"],
      },
      {
        id: "T2",
        dependencies: [],
        atomic: true,
        verification: "npm test",
        rollback: "git revert <sha>",
        parallelGroup: "A",
        writeSet: ["README.md"],
        permissionBypass: true,
      },
    ],
  });

  const evaluation = evaluatePlanReviewPackage(planReviewPackage);
  assert.equal(evaluation.pass, false);
  assert.ok(evaluation.failed.some((dimension) => dimension.id === "parallel-safety"));
  assert.ok(evaluation.failed.some((dimension) => dimension.id === "provider-policy"));
});
