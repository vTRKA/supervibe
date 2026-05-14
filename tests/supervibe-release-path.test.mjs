import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLoopCompletionDecision,
  normalizeWorkflowEvent,
  normalizeWorkflowState,
  validateProductionReleasePath,
  validateWorkflowEvent,
  validateWorkflowState,
} from "../scripts/lib/supervibe-release-path.mjs";

const NOW = "2026-05-14T00:00:00.000Z";

function codes(result) {
  return new Set(result.issues.map((issue) => issue.code));
}

function validApproval(overrides = {}) {
  return {
    id: "approval-plan-1",
    targetId: "plan-1",
    targetType: "plan",
    actor: "codex-worker",
    approvedAt: "2026-05-13T00:00:00.000Z",
    expiresAt: "2026-05-20T00:00:00.000Z",
    evidenceIds: ["evidence-review"],
    decision: "approved",
    ...overrides,
  };
}

function validWorkflowState(overrides = {}) {
  return {
    id: "workflow-1",
    command: "/supervibe-loop",
    stage: "review",
    goals: [
      {
        id: "goal-1",
        title: "Ship reviewed workflow",
        acceptanceCriteria: [
          {
            id: "criterion-1",
            description: "Evidence is attached",
            evidenceIds: ["evidence-review"],
          },
        ],
      },
    ],
    currentQuestion: {
      id: "approve-plan",
      prompt: "Approve the reviewed plan?",
      resumeCursor: "question:approve-plan",
      choices: [{ id: "approve", label: "Approve" }],
    },
    answerHistory: [
      {
        questionId: "approve-plan",
        choiceId: "approve",
        actor: "user",
        answeredAt: "2026-05-14T00:00:00.000Z",
      },
    ],
    approvals: [validApproval()],
    waivers: [
      {
        id: "waiver-1",
        risk: "low",
        affectedGoals: ["goal-1"],
        evidenceIds: ["evidence-risk-review"],
        approval: validApproval({ id: "approval-waiver-1", targetId: "waiver-1", targetType: "waiver" }),
        revisitTrigger: "before ship stage",
        releaseImpact: "ship may proceed with documented follow-up",
      },
    ],
    evidence: {
      "evidence-review": {
        kind: "test-output",
        path: ".supervibe/evidence/review.txt",
        hash: "sha256:abc123",
      },
      "evidence-risk-review": {
        kind: "risk-review",
        path: ".supervibe/evidence/risk.txt",
        hash: "sha256:def456",
      },
    },
    artifactManifest: {
      id: "artifact-manifest-1",
      artifacts: [
        {
          id: "plan",
          path: ".supervibe/artifacts/plans/plan.md",
          hash: "sha256:feed123",
          evidenceIds: ["evidence-review"],
        },
      ],
    },
    summaries: [
      {
        id: "summary-review-pre",
        stage: "review",
        kind: "pre-action",
        summary: "Review gate is ready.",
        evidenceIds: ["evidence-review"],
        createdAt: "2026-05-14T00:00:00.000Z",
      },
    ],
    specialistEvidence: [
      {
        id: "specialist-reviewer-1",
        specialist: "quality-gate-reviewer",
        source: "codex-spawn-agent",
        invocationId: "agent-123",
        evidenceIds: ["evidence-review"],
        artifactIds: ["plan"],
      },
    ],
    events: [
      {
        id: "event-1",
        type: "stage-entered",
        stage: "review",
        createdAt: "2026-05-14T00:00:00.000Z",
        evidenceIds: ["evidence-review"],
      },
    ],
    ...overrides,
  };
}

test("workflow event records normalize and validate", () => {
  const event = normalizeWorkflowEvent({
    id: "event-1",
    type: "artifact-written",
    stage: "verify",
    createdAt: "2026-05-14T00:00:00.000Z",
    evidenceIds: ["evidence-verify"],
  });

  assert.equal(validateWorkflowEvent(event).pass, true);
  assert.deepEqual(event.evidenceIds, ["evidence-verify"]);
});

test("workflow state validates goals, question, approvals, waivers, evidence, artifacts, and summaries", () => {
  const state = normalizeWorkflowState(validWorkflowState());
  const result = validateWorkflowState(state, { now: NOW });

  assert.equal(result.pass, true);
  assert.equal(state.currentQuestion.resumeCursor, "question:approve-plan");
  assert.equal(state.summaries[0].kind, "pre-action");
});

test("workflow state fails stale approvals", () => {
  const result = validateWorkflowState(validWorkflowState({
    approvals: [validApproval({ expiresAt: "2026-05-13T00:00:00.000Z" })],
  }), { now: NOW });

  assert.equal(result.pass, false);
  assert.ok(codes(result).has("approval-record-stale"));
});

test("workflow state fails unsafe waivers", () => {
  const result = validateWorkflowState(validWorkflowState({
    waivers: [
      {
        id: "waiver-unsafe",
        risk: "critical",
        affectedGoals: [],
        evidenceIds: [],
        approval: null,
      },
    ],
  }), { now: NOW });

  assert.equal(result.pass, false);
  assert.ok(codes(result).has("waiver-record-affected-goals-missing"));
  assert.ok(codes(result).has("waiver-record-approval-missing"));
});

test("workflow state fails missing question resume cursor", () => {
  const result = validateWorkflowState(validWorkflowState({
    currentQuestion: {
      id: "approve-plan",
      prompt: "Approve the reviewed plan?",
      choices: [{ id: "approve", label: "Approve" }],
    },
  }), { now: NOW });

  assert.equal(result.pass, false);
  assert.ok(codes(result).has("question-record-resume-cursor-missing"));
});

test("workflow state fails missing artifact hashes", () => {
  const result = validateWorkflowState(validWorkflowState({
    artifactManifest: {
      id: "artifact-manifest-1",
      artifacts: [
        { id: "plan", path: ".supervibe/artifacts/plans/plan.md" },
      ],
    },
  }), { now: NOW });

  assert.equal(result.pass, false);
  assert.ok(codes(result).has("artifact-manifest-artifact-hash-missing"));
});


test("loop completion decision offers verify review continue revise-goals and stop-with-gaps choices", () => {
  const decision = buildLoopCompletionDecision({
    artifact: ".supervibe/memory/work-items/epic-1/graph.json",
  });

  assert.equal(decision.currentStage, "loop-completion");
  assert.equal(decision.nextCommand, "/supervibe-verify");
  assert.deepEqual(decision.choices.map((choice) => choice.command), [
    "/supervibe-verify",
    "/supervibe-review",
    "/supervibe-loop --resume-dispatch",
    "/supervibe-loop --revise-goals",
    "",
  ]);
  assert.deepEqual(decision.choices.map((choice) => choice.id), [
    "proceed-verify",
    "proceed-review",
    "continue-loop",
    "revise-goals",
    "stop-with-gaps",
  ]);
});

test("production release path enforces verify then review before ship unless explicit evidence waives a gate", () => {
  const blocked = validateProductionReleasePath(validWorkflowState({
    stage: "ship",
    events: [
      {
        id: "event-ship",
        type: "stage-completed",
        stage: "ship",
        createdAt: NOW,
        evidenceIds: ["evidence-review"],
      },
    ],
  }), { enforce: true, now: NOW });

  assert.equal(blocked.pass, false);
  assert.ok(codes(blocked).has("production-release-verify-missing"));
  assert.ok(codes(blocked).has("production-release-review-missing"));

  const waivedReview = validateProductionReleasePath(validWorkflowState({
    stage: "ship",
    events: [
      {
        id: "event-verify",
        type: "stage-completed",
        stage: "verify",
        createdAt: NOW,
        evidenceIds: ["evidence-review"],
      },
      {
        id: "event-ship",
        type: "stage-completed",
        stage: "ship",
        createdAt: NOW,
        evidenceIds: ["evidence-review"],
      },
    ],
    waivers: [
      {
        id: "waiver-review",
        risk: "medium",
        affectedGoals: ["review"],
        evidenceIds: ["evidence-risk-review"],
        approval: validApproval({ id: "approval-review-waiver", targetId: "waiver-review", targetType: "waiver" }),
        revisitTrigger: "before ship stage",
        releaseImpact: "review gate explicitly waived for this production handoff",
      },
    ],
  }), { enforce: true, now: NOW });

  assert.equal(waivedReview.pass, true);
});

test("production release path rejects ship completion before review completion", () => {
  const result = validateProductionReleasePath(validWorkflowState({
    stage: "ship",
    events: [
      {
        id: "event-verify",
        type: "stage-completed",
        stage: "verify",
        createdAt: "2026-05-14T00:00:00.000Z",
        evidenceIds: ["evidence-review"],
      },
      {
        id: "event-ship",
        type: "stage-completed",
        stage: "ship",
        createdAt: "2026-05-14T00:02:00.000Z",
        evidenceIds: ["evidence-review"],
      },
      {
        id: "event-review",
        type: "stage-completed",
        stage: "review",
        createdAt: "2026-05-14T00:03:00.000Z",
        evidenceIds: ["evidence-review"],
      },
    ],
  }), { enforce: true, now: NOW });

  assert.equal(result.pass, false);
  assert.ok(codes(result).has("production-release-ship-before-review"));
});

test("production release path accepts newer re-review after stale early review", () => {
  const result = validateProductionReleasePath(validWorkflowState({
    stage: "ship",
    events: [
      {
        id: "event-review-old",
        type: "stage-completed",
        stage: "review",
        createdAt: "2026-05-13T23:00:00.000Z",
        evidenceIds: ["evidence-review"],
      },
      {
        id: "event-verify",
        type: "stage-completed",
        stage: "verify",
        createdAt: "2026-05-14T00:00:00.000Z",
        evidenceIds: ["evidence-review"],
      },
      {
        id: "event-review-new",
        type: "stage-completed",
        stage: "review",
        createdAt: "2026-05-14T00:01:00.000Z",
        evidenceIds: ["evidence-review"],
      },
      {
        id: "event-ship",
        type: "stage-completed",
        stage: "ship",
        createdAt: "2026-05-14T00:02:00.000Z",
        evidenceIds: ["evidence-review"],
      },
    ],
  }), { enforce: true, now: NOW });

  assert.equal(result.pass, true);
});

test("production release path rejects bare stage-waived event without waiver approval", () => {
  const result = validateProductionReleasePath(validWorkflowState({
    stage: "ship",
    waivers: [],
    events: [
      {
        id: "event-verify",
        type: "stage-completed",
        stage: "verify",
        createdAt: NOW,
        evidenceIds: ["evidence-review"],
      },
      {
        id: "event-review-waived",
        type: "stage-waived",
        stage: "review",
        createdAt: NOW,
        evidenceIds: ["evidence-risk-review"],
      },
      {
        id: "event-ship",
        type: "stage-completed",
        stage: "ship",
        createdAt: NOW,
        evidenceIds: ["evidence-review"],
      },
    ],
  }), { enforce: true, now: NOW });

  assert.equal(result.pass, false);
  assert.ok(codes(result).has("production-release-review-missing"));
});