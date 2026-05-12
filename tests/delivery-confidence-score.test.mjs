import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_DELIVERY_DIMENSIONS,
  HARD_CAPS,
  calculateReadinessScore,
  evaluateDeliveryRisks,
  inferDeliveryHardCaps,
  scoreDeliveryConfidence,
} from "../scripts/lib/delivery-confidence-score.mjs";

const fullDimensions = [
  { id: "requirements", weight: 1.2, score: 1 },
  { id: "specification", weight: 1.0, score: 1 },
  { id: "traceability", weight: 1.2, score: 1 },
  { id: "retrieval-evidence", weight: 1.0, score: 1 },
  { id: "dependencies", weight: 1.0, score: 1 },
  { id: "architecture-fit", weight: 1.0, score: 1 },
  { id: "testability", weight: 1.3, score: 1 },
  { id: "rollback-observability", weight: 0.8, score: 1 },
  { id: "independent-review", weight: 0.8, score: 1 },
  { id: "scope-safety", weight: 0.7, score: 1 },
];

test("delivery confidence returns 10 when readiness is complete and residual risk is zero", () => {
  const result = scoreDeliveryConfidence({
    dimensions: fullDimensions,
    risks: [],
    caps: [],
  });

  assert.equal(result.readinessScore, 10);
  assert.equal(result.riskPenalty, 0);
  assert.equal(result.finalScore, 10);
  assert.equal(result.status, "pass");
});

test("default delivery dimensions expose a complete 10 point readiness model", () => {
  const dimensions = DEFAULT_DELIVERY_DIMENSIONS.map((dimension) => ({
    ...dimension,
    score: 1,
    earned: dimension.weight,
  }));

  assert.equal(DEFAULT_DELIVERY_DIMENSIONS.length, 10);
  assert.equal(calculateReadinessScore(dimensions), 10);
});

test("residual risk reduces readiness before hard caps are applied", () => {
  const result = scoreDeliveryConfidence({
    dimensions: fullDimensions,
    risks: [
      {
        id: "schema-migration",
        likelihood: 5,
        impact: 5,
        detectability: 1,
        mitigationCoverage: 0,
      },
    ],
  });

  assert.equal(result.readinessScore, 10);
  assert.equal(result.riskPenalty, 4);
  assert.equal(result.finalScore, 6);
  assert.equal(result.status, "review");
});

test("mitigation coverage lowers residual risk penalty", () => {
  const withoutMitigation = evaluateDeliveryRisks([
    { id: "risk", likelihood: 4, impact: 4, detectability: 2, mitigationCoverage: 0 },
  ]);
  const withMitigation = evaluateDeliveryRisks([
    { id: "risk", likelihood: 4, impact: 4, detectability: 2, mitigationCoverage: 0.75 },
  ]);

  assert.ok(withMitigation.penalty < withoutMitigation.penalty);
});

test("hard caps prevent high scores despite complete readiness", () => {
  const result = scoreDeliveryConfidence({
    dimensions: fullDimensions,
    caps: [{ score: 8, reason: "mandatory verification was not run" }],
  });

  assert.equal(result.uncappedScore, 10);
  assert.equal(result.finalScore, 8);
  assert.equal(result.status, "review");
  assert.equal(result.caps[0].score, 8);
});

test("inferred caps cover missing evidence and policy blockers", () => {
  const caps = inferDeliveryHardCaps({
    requiredVerification: true,
    verificationRan: false,
    policyRiskLevel: "high",
    userApproval: false,
    indexReady: false,
    retrievalRequired: true,
  });

  assert.deepEqual(caps.map((cap) => cap.score), [
    HARD_CAPS.verificationNotRun,
    HARD_CAPS.indexNotReady,
    HARD_CAPS.highRiskNoApproval,
  ]);
});

test("inferred caps block high confidence when evidence gates or producer provenance are untrusted", () => {
  const caps = inferDeliveryHardCaps({
    evidenceGatePass: false,
    producerMode: "inline",
    trustedReceiptEvidence: false,
  });

  assert.deepEqual(caps.map((cap) => cap.code), [
    "evidence-gate-failed",
    "inline-producer",
    "untrusted-receipt-evidence",
  ]);
  assert.ok(caps.every((cap) => cap.score < 9));
});

test("inferred caps treat null evidence gate as failed instead of unknown-pass", () => {
  const caps = inferDeliveryHardCaps({
    evidenceGatePass: null,
  });

  assert.deepEqual(caps.map((cap) => cap.code), ["evidence-gate-failed"]);
});

test("invalid dimension and risk numbers are clamped and reported", () => {
  const result = scoreDeliveryConfidence({
    dimensions: [
      { id: "bad-low", weight: -1, score: -2 },
      { id: "bad-high", weight: 2, score: 12 },
    ],
    risks: [
      { id: "bad-risk", likelihood: 99, impact: -4, detectability: 0, mitigationCoverage: 2 },
    ],
  });

  assert.equal(result.dimensions.length, 2);
  assert.ok(result.warnings.length >= 3);
  assert.ok(result.finalScore >= 0);
  assert.ok(result.finalScore <= 10);
});
