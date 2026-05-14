import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeApprovalRecord,
  normalizeArtifactManifest,
  normalizeChoiceRecord,
  normalizeEvidenceMap,
  normalizeGoal,
  normalizeQuestionRecord,
  normalizeStageSummaryRecord,
  normalizeWaiverRecord,
  validateAcceptanceCriterion,
  validateApprovalRecord,
  validateArtifactManifest,
  validateChoiceRecord,
  validateEvidenceMap,
  validateGoal,
  validateQuestionRecord,
  validateSpecialistEvidenceRecord,
  validateStageSummaryRecord,
  validateWaiverRecord,
} from "../scripts/lib/supervibe-goals-contract.mjs";

const NOW = "2026-05-14T00:00:00.000Z";

function codes(result) {
  return new Set(result.issues.map((issue) => issue.code));
}

function approval(overrides = {}) {
  return {
    id: "approval-plan-1",
    targetId: "plan-1",
    targetType: "plan",
    actor: "codex-worker",
    approvedAt: "2026-05-13T00:00:00.000Z",
    expiresAt: "2026-05-20T00:00:00.000Z",
    evidenceIds: ["evidence-plan-review"],
    decision: "approved",
    ...overrides,
  };
}

test("goal and acceptance criteria records normalize deterministically", () => {
  const goal = normalizeGoal({
    id: "goal-1",
    title: "Ship reviewed workflow",
    status: "open",
    acceptanceCriteria: [
      {
        id: "criterion-1",
        description: "Review evidence is present",
        evidenceIds: ["evidence-review"],
      },
    ],
  });
  const result = validateGoal(goal);

  assert.equal(result.pass, true);
  assert.equal(goal.acceptanceCriteria[0].status, "pending");
  assert.deepEqual(result.issues, []);
  assert.equal(validateAcceptanceCriterion(goal.acceptanceCriteria[0]).pass, true);
});

test("question and choice records require stable resume data", () => {
  const question = normalizeQuestionRecord({
    id: "approve-plan",
    prompt: "Approve the reviewed plan?",
    resumeCursor: "question:approve-plan",
    choices: [
      normalizeChoiceRecord({ id: "approve", label: "Approve", ordinal: 2 }),
      normalizeChoiceRecord({ id: "revise", label: "Revise", ordinal: 1 }),
    ],
  });
  const validQuestion = validateQuestionRecord(question);
  const invalidQuestion = validateQuestionRecord({
    id: "approve-plan",
    prompt: "Approve the reviewed plan?",
    choices: [{ id: "approve", label: "Approve" }],
  });

  assert.equal(validQuestion.pass, true);
  assert.equal(validateChoiceRecord(question.choices[0]).pass, true);
  assert.equal(invalidQuestion.pass, false);
  assert.ok(codes(invalidQuestion).has("question-record-resume-cursor-missing"));
});

test("approval records fail when stale", () => {
  const stale = validateApprovalRecord(approval({
    expiresAt: "2026-05-13T00:00:00.000Z",
  }), { now: NOW });

  assert.equal(validateApprovalRecord(normalizeApprovalRecord(approval()), { now: NOW }).pass, true);
  assert.equal(stale.pass, false);
  assert.ok(codes(stale).has("approval-record-stale"));
});

test("waiver records require risk, goals, evidence, approval, revisit trigger, and release impact", () => {
  const validWaiver = normalizeWaiverRecord({
    id: "waiver-1",
    risk: "medium",
    affectedGoals: ["goal-1"],
    evidenceIds: ["evidence-risk-review"],
    approval: approval({ id: "approval-waiver-1", targetId: "waiver-1", targetType: "waiver" }),
    revisitTrigger: "before ship stage",
    releaseImpact: "ship may proceed with documented follow-up",
  });
  const unsafe = validateWaiverRecord({
    id: "waiver-unsafe",
    affectedGoals: [],
    evidenceIds: [],
    approval: null,
  }, { now: NOW });

  assert.equal(validateWaiverRecord(validWaiver, { now: NOW }).pass, true);
  assert.equal(unsafe.pass, false);
  assert.ok(codes(unsafe).has("waiver-record-risk-missing"));
  assert.ok(codes(unsafe).has("waiver-record-affected-goals-missing"));
  assert.ok(codes(unsafe).has("waiver-record-evidence-missing"));
  assert.ok(codes(unsafe).has("waiver-record-approval-missing"));
  assert.ok(codes(unsafe).has("waiver-record-revisit-trigger-missing"));
  assert.ok(codes(unsafe).has("waiver-record-release-impact-missing"));
});

test("evidence maps, artifact manifests, summaries, and specialist evidence validate", () => {
  const evidence = normalizeEvidenceMap({
    "evidence-review": {
      kind: "test-output",
      path: ".supervibe/evidence/review.txt",
      hash: "sha256:abc123",
    },
  });
  const manifest = normalizeArtifactManifest({
    id: "artifact-manifest-1",
    artifacts: [
      {
        id: "plan",
        path: ".supervibe/artifacts/plans/plan.md",
        hash: "sha256:def456",
        evidenceIds: ["evidence-review"],
      },
    ],
  });
  const summary = normalizeStageSummaryRecord({
    id: "summary-review-pre",
    stage: "review",
    kind: "pre-action",
    summary: "Review gate is ready.",
    evidenceIds: ["evidence-review"],
    createdAt: "2026-05-14T00:00:00.000Z",
  });
  const specialist = {
    id: "specialist-reviewer-1",
    specialist: "quality-gate-reviewer",
    source: "codex-spawn-agent",
    invocationId: "agent-123",
    evidenceIds: ["evidence-review"],
    artifactIds: ["plan"],
  };
  const missingHash = validateArtifactManifest({
    id: "artifact-manifest-1",
    artifacts: [{ id: "plan", path: ".supervibe/artifacts/plans/plan.md" }],
  });

  assert.equal(validateEvidenceMap(evidence).pass, true);
  assert.equal(validateArtifactManifest(manifest).pass, true);
  assert.equal(validateStageSummaryRecord(summary).pass, true);
  assert.equal(validateSpecialistEvidenceRecord(specialist).pass, true);
  assert.equal(missingHash.pass, false);
  assert.ok(codes(missingHash).has("artifact-manifest-artifact-hash-missing"));
});
