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
  PLAN_REVIEW_RISK_SPECIALISTS,
  parseNextStepBlock,
  selectPlanReviewSpecialists,
  WORKFLOW_PHASES,
} from "../scripts/lib/supervibe-skill-chain.mjs";

test("workflow phase graph forces brainstorm to plan to review to atomization", () => {
  assert.ok(WORKFLOW_PHASES.includes("brainstorm"));
  assert.equal(PHASE_ALIASES.plan_review_passed, "plan-review");
  assert.ok(PLAN_REVIEW_DIMENSIONS.includes("provider-policy"));
  assert.ok(PLAN_REVIEW_DIMENSIONS.includes("mvp-value"));
  assert.ok(PLAN_REVIEW_DIMENSIONS.includes("architecture-fit"));
  assert.ok(PLAN_REVIEW_DIMENSIONS.includes("cache-queue-topology"));
  assert.ok(PLAN_REVIEW_DIMENSIONS.includes("convergence-decision"));
  assert.equal(getNextWorkflowStep("brainstorm").command, "/supervibe-plan --from-brainstorm");
  assert.equal(getNextWorkflowStep("plan").command, "/supervibe-plan --review");
  assert.equal(getNextWorkflowStep("plan-review").command, "/supervibe-loop --atomize-plan <plan-path> --plan-review-passed");
  assert.equal(getNextWorkflowStep("work-item-atomization").command, "/supervibe-loop --guided");
  assert.equal(getNextWorkflowStep("worktree-setup").command, "/supervibe-loop --epic --worktree");
  assert.match(getNextWorkflowStep("worktree-setup").why, /explicit timeboxes are optional/);
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
  assert.match(output, /Choices:\n- Continue \.supervibe\/artifacts\/plans\/example\.md \(recommended\)/);
  assert.match(output, /Revise scope for \.supervibe\/artifacts\/plans\/example\.md/);
  assert.match(output, /Exclude or defer items from \.supervibe\/artifacts\/plans\/example\.md/);
  assert.match(output, /Inspect readiness for \.supervibe\/artifacts\/plans\/example\.md/);

  const assertion = assertNoSilentStop({
    phase: "plan",
    output,
    artifactPath: ".supervibe/artifacts/plans/example.md",
    locale: "en",
  });
  assert.equal(assertion.pass, true);
});

test("plan review handoff resolves atomization command with reviewed plan path and proof flag", () => {
  const output = formatNextStepBlock({
    phase: "plan-review",
    artifactPath: ".supervibe/artifacts/plans/example.md",
    locale: "en",
  });

  const parsed = parseNextStepBlock(output);
  assert.equal(parsed.nextCommand, "/supervibe-loop --atomize-plan .supervibe/artifacts/plans/example.md --plan-review-passed");
  assert.match(output, /Continue \.supervibe\/artifacts\/plans\/example\.md \(recommended\)/);
  assert.match(output, /--plan-review-passed/);

  const assertion = assertNoSilentStop({
    phase: "plan-review",
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
    riskTags: ["database", "cache", "queue", "api", "security", "infrastructure", "frontend"],
    mvp: {
      smallestProductionSafeSlice: true,
      valueHypothesis: "Users receive a reviewed, production-safe plan before atomization.",
    },
    scope: {
      approved: ["durable review-loop gate"],
      deferred: ["interactive dashboard"],
      rejected: ["hidden background automation"],
    },
    architecture: {
      style: "host-neutral ESM control plane",
      boundaries: ["router", "review package", "artifact validator"],
      prdDecisionRequired: false,
    },
    data: {
      topologyReviewed: true,
      migrationSafety: true,
      backupRestore: true,
    },
    cacheQueue: {
      topologyReviewed: true,
      retryPolicy: true,
      idempotency: true,
      deadLetter: true,
    },
    api: {
      contractReviewed: true,
      errorEnvelope: true,
      compatibility: true,
      idempotency: true,
    },
    securityPrivacy: {
      threatModelReviewed: true,
      piiBoundary: true,
      secretsPolicy: true,
      auditLogging: true,
    },
    observabilityRelease: {
      logs: true,
      metrics: true,
      alerts: true,
      rollback: true,
      release: true,
      support: true,
    },
    convergence: {
      iterations: 2,
      openCritical: 0,
      openMajor: 0,
      stopReason: "all blocking findings resolved",
      nextUserDecision: "continue to atomization",
    },
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
  assert.ok(planReviewPackage.reviewers.includes("security-auditor"));
  assert.ok(planReviewPackage.reviewers.includes("db-reviewer"));
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

test("plan review package blocks unresolved convergence and non-MVP bloat", () => {
  const planReviewPackage = createPlanReviewPackage({
    planPath: ".supervibe/artifacts/plans/example.md",
    specPath: ".supervibe/artifacts/specs/example.md",
    coverageMatrix: true,
    worktree: { required: true },
    policy: { providerSafe: true },
    mvp: {
      smallestProductionSafeSlice: true,
      valueHypothesis: "Users can ship the smallest reviewed slice.",
    },
    scope: {
      approved: ["reviewed MVP"],
      deferred: [],
      rejected: [],
    },
    architecture: {
      style: "modular monolith",
      boundaries: ["api", "worker"],
    },
    securityPrivacy: {
      threatModelReviewed: true,
      piiBoundary: true,
      secretsPolicy: true,
      auditLogging: true,
    },
    observabilityRelease: {
      logs: true,
      metrics: true,
      alerts: true,
      rollback: true,
      release: true,
      support: true,
    },
    convergence: {
      iterations: 1,
      openCritical: 0,
      openMajor: 1,
      stopReason: "major finding still open",
      nextUserDecision: "revise reviewed plan first",
    },
    tasks: [
      {
        id: "T1",
        dependencies: [],
        atomic: true,
        verification: "npm test",
        rollback: "git revert <sha>",
        niceToHave: true,
      },
    ],
  });

  const evaluation = evaluatePlanReviewPackage(planReviewPackage);
  assert.equal(evaluation.pass, false);
  assert.ok(evaluation.failed.some((dimension) => dimension.id === "mvp-value"));
  assert.ok(evaluation.failed.some((dimension) => dimension.id === "convergence-decision"));
});

test("plan review package requires topology evidence only for triggered infra risks", () => {
  const baseOptions = {
    planPath: ".supervibe/artifacts/plans/example.md",
    specPath: ".supervibe/artifacts/specs/example.md",
    coverageMatrix: true,
    worktree: { required: true },
    policy: { providerSafe: true },
    mvp: {
      smallestProductionSafeSlice: true,
      valueHypothesis: "No infra change is needed.",
    },
    scope: {
      approved: ["docs-only review"],
      deferred: [],
      rejected: [],
    },
    architecture: {
      style: "documentation update",
      boundaries: ["docs"],
    },
    securityPrivacy: {
      threatModelReviewed: true,
      piiBoundary: true,
      secretsPolicy: true,
      auditLogging: true,
    },
    observabilityRelease: {
      logs: true,
      metrics: true,
      alerts: true,
      rollback: true,
      release: true,
      support: true,
    },
    convergence: {
      iterations: 1,
      openCritical: 0,
      openMajor: 0,
      stopReason: "no infra risks triggered",
      nextUserDecision: "continue to atomization",
    },
    tasks: [
      {
        id: "T1",
        dependencies: [],
        atomic: true,
        verification: "npm test",
        rollback: "git revert <sha>",
      },
    ],
  };
  const untriggered = createPlanReviewPackage(baseOptions);
  assert.equal(evaluatePlanReviewPackage(untriggered).pass, true);

  const triggered = createPlanReviewPackage({
    ...baseOptions,
    risks: ["PostgreSQL migration and Redis queue retry risk"],
    data: { topologyReviewed: false },
    cacheQueue: { topologyReviewed: false },
  });
  const evaluation = evaluatePlanReviewPackage(triggered);
  assert.equal(evaluation.pass, false);
  assert.ok(evaluation.failed.some((dimension) => dimension.id === "data-storage-topology"));
  assert.ok(evaluation.failed.some((dimension) => dimension.id === "cache-queue-topology"));
});

test("plan review specialist selector maps risk triggers to reviewers", () => {
  const plan = selectPlanReviewSpecialists({
    text: "Postgres migration, Redis cache, queue retry, JWT auth, OpenAPI contract, Kubernetes release, and mobile UI.",
  });

  assert.deepEqual(plan.baseReviewers, [
    "supervibe-orchestrator",
    "systems-analyst",
    "architect-reviewer",
    "quality-gate-reviewer",
  ]);
  for (const risk of ["database", "cache", "queue", "security", "api", "infrastructure", "frontend"]) {
    assert.ok(plan.riskTriggers.includes(risk), risk);
  }
  assert.ok(plan.reviewers.includes(PLAN_REVIEW_RISK_SPECIALISTS.database[0]));
  assert.ok(plan.reviewers.includes(PLAN_REVIEW_RISK_SPECIALISTS.cache[0]));
  assert.ok(plan.reviewers.includes(PLAN_REVIEW_RISK_SPECIALISTS.queue[0]));
  assert.ok(plan.reviewers.includes(PLAN_REVIEW_RISK_SPECIALISTS.security[0]));
  assert.ok(plan.reviewers.includes(PLAN_REVIEW_RISK_SPECIALISTS.api[0]));
  assert.ok(plan.reviewers.includes(PLAN_REVIEW_RISK_SPECIALISTS.infrastructure[0]));
  assert.ok(plan.reviewers.includes(PLAN_REVIEW_RISK_SPECIALISTS.frontend[0]));
});
