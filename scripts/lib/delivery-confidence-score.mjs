export const HARD_CAPS = Object.freeze({
  missingAcceptanceCriteria: 6,
  missingVerificationCommand: 7,
  verificationNotRun: 8,
  verificationFailed: 6,
  codeGraphMissing: 8,
  indexNotReady: 8,
  highRiskNoApproval: 6,
  mediumRiskNoIndependentReview: 8,
  rollbackMissing: 8,
  traceabilityMissing: 8,
  openCriticalFindings: 7,
  openMajorFindings: 8,
  halfFinished: 7,
  criticalSecurityPrivacyGap: 6,
  evidenceGateFailed: 8,
  inlineProducer: 8,
  untrustedReceiptEvidence: 8,
});

export const DEFAULT_DELIVERY_DIMENSIONS = Object.freeze([
  { id: "requirements-completeness", weight: 1.2 },
  { id: "specification-completeness", weight: 1.0 },
  { id: "traceability", weight: 1.2 },
  { id: "retrieval-evidence", weight: 1.0 },
  { id: "dependency-readiness", weight: 1.0 },
  { id: "implementation-confidence", weight: 1.0 },
  { id: "testability", weight: 1.3 },
  { id: "rollback-observability", weight: 0.8 },
  { id: "independent-review-provenance", weight: 0.8 },
  { id: "scope-safety", weight: 0.7 },
]);

const DEFAULT_MAX_SCORE = 10;
const DEFAULT_RISK_PENALTY_CAP = 4;

export function scoreDeliveryConfidence({
  dimensions = [],
  risks = [],
  caps = [],
  evidence = {},
  maxScore = DEFAULT_MAX_SCORE,
  riskPenaltyCap = DEFAULT_RISK_PENALTY_CAP,
} = {}) {
  const warnings = [];
  const normalizedDimensions = normalizeDimensions(
    dimensions.length > 0 ? dimensions : DEFAULT_DELIVERY_DIMENSIONS,
    warnings,
  );
  const readinessScore = calculateReadinessScore(normalizedDimensions, maxScore);
  const riskEvaluation = evaluateDeliveryRisks(risks, { maxScore, riskPenaltyCap, warnings });
  const inferredCaps = inferDeliveryHardCaps(evidence);
  const normalizedCaps = normalizeCaps([...caps, ...inferredCaps], warnings);
  const uncappedScore = roundScore(clamp(readinessScore - riskEvaluation.penalty, 0, maxScore));
  const capScore = normalizedCaps.length
    ? Math.min(...normalizedCaps.map((cap) => cap.score))
    : maxScore;
  const finalScore = roundScore(Math.min(uncappedScore, capScore));

  return {
    schemaVersion: 1,
    maxScore,
    readinessScore,
    riskPenalty: riskEvaluation.penalty,
    uncappedScore,
    finalScore,
    status: statusForScore(finalScore),
    complete: finalScore >= 9,
    dimensions: normalizedDimensions,
    risks: riskEvaluation.risks,
    caps: normalizedCaps,
    appliedCap: normalizedCaps.find((cap) => cap.score === capScore) || null,
    warnings,
  };
}

export function calculateReadinessScore(dimensions = [], maxScore = DEFAULT_MAX_SCORE) {
  const totalWeight = dimensions.reduce((sum, dimension) => sum + dimension.weight, 0);
  if (totalWeight <= 0) return 0;
  const earned = dimensions.reduce((sum, dimension) => sum + dimension.earned, 0);
  return roundScore(clamp((earned / totalWeight) * maxScore, 0, maxScore));
}

export function evaluateDeliveryRisks(risks = [], {
  maxScore = DEFAULT_MAX_SCORE,
  riskPenaltyCap = DEFAULT_RISK_PENALTY_CAP,
  warnings = [],
} = {}) {
  const normalized = (Array.isArray(risks) ? risks : [])
    .map((risk, index) => normalizeRisk(risk, index, warnings));
  const totalWeight = normalized.reduce((sum, risk) => sum + risk.weight, 0);
  if (totalWeight <= 0) {
    return { penalty: 0, risks: normalized };
  }
  const weightedResidual = normalized.reduce((sum, risk) => sum + risk.residual * risk.weight, 0) / totalWeight;
  const penalty = roundScore(Math.min(riskPenaltyCap, weightedResidual * maxScore));
  return {
    penalty,
    risks: normalized.map((risk) => ({
      ...risk,
      penaltyShare: roundScore(risk.residual * maxScore),
    })),
  };
}

export function inferDeliveryHardCaps(evidence = {}) {
  const caps = [];
  const add = (score, reason, code) => caps.push({ score, reason, code, inferred: true });

  if (evidence.acceptanceCriteriaPresent === false || evidence.missingAcceptanceCriteria === true) {
    add(HARD_CAPS.missingAcceptanceCriteria, "acceptance criteria are missing", "missing-acceptance-criteria");
  }
  if (evidence.missingVerificationCommand === true || evidence.verificationCommandPresent === false) {
    add(HARD_CAPS.missingVerificationCommand, "verification command is missing", "missing-verification-command");
  }
  if (evidence.requiredVerification === true && evidence.verificationRan !== true) {
    add(HARD_CAPS.verificationNotRun, "mandatory verification was not run", "verification-not-run");
  }
  if (evidence.verificationPassed === false || evidence.testsPassed === false) {
    add(HARD_CAPS.verificationFailed, "verification or tests failed", "verification-failed");
  }
  if (evidence.codeGraphRequired === true && evidence.codeGraphHandled !== true) {
    add(HARD_CAPS.codeGraphMissing, "required CodeGraph evidence is missing", "codegraph-missing");
  }
  if (evidence.retrievalRequired === true && evidence.indexReady === false) {
    add(HARD_CAPS.indexNotReady, "retrieval index is not ready", "index-not-ready");
  }
  if (evidence.policyRiskLevel === "high" && evidence.userApproval !== true) {
    add(HARD_CAPS.highRiskNoApproval, "high-risk action requires explicit approval", "high-risk-no-approval");
  }
  if (evidence.policyRiskLevel === "medium" && evidence.independentReview !== true) {
    add(HARD_CAPS.mediumRiskNoIndependentReview, "medium-risk task lacks independent review", "medium-risk-no-independent-review");
  }
  if (evidence.rollbackRequired === true && evidence.rollbackPresent !== true) {
    add(HARD_CAPS.rollbackMissing, "rollback plan is missing", "rollback-missing");
  }
  if (evidence.traceabilityRequired === true && evidence.traceabilityPresent !== true) {
    add(HARD_CAPS.traceabilityMissing, "traceability matrix is missing", "traceability-missing");
  }
  if (Number(evidence.openCriticalFindings || 0) > 0) {
    add(HARD_CAPS.openCriticalFindings, "critical findings remain open", "open-critical-findings");
  }
  if (Number(evidence.openMajorFindings || 0) > 0) {
    add(HARD_CAPS.openMajorFindings, "major findings remain open", "open-major-findings");
  }
  if (evidence.halfFinished === true) {
    add(HARD_CAPS.halfFinished, "half-finished production behavior is present", "half-finished");
  }
  if (evidence.criticalSecurityPrivacyGap === true) {
    add(HARD_CAPS.criticalSecurityPrivacyGap, "critical security or privacy gap is unresolved", "critical-security-privacy-gap");
  }
  if (evidence.evidenceGatePass === false) {
    add(HARD_CAPS.evidenceGateFailed, "required evidence gate failed", "evidence-gate-failed");
  }
  const producerMode = String(evidence.producerMode || evidence.agentProducerMode || "").trim().toLowerCase();
  if (evidence.inlineProducer === true || ["inline", "emulated", "manual-emulation", "controller-inline"].includes(producerMode)) {
    add(HARD_CAPS.inlineProducer, "producer output was inline or emulated instead of receipt-backed", "inline-producer");
  }
  if (evidence.trustedReceiptEvidence === false || evidence.receiptTrusted === false) {
    add(HARD_CAPS.untrustedReceiptEvidence, "receipt evidence is missing or untrusted", "untrusted-receipt-evidence");
  }

  return caps;
}

function normalizeDimensions(dimensions, warnings) {
  return dimensions.map((dimension, index) => {
    const id = String(dimension.id || `dimension-${index + 1}`);
    const weight = clampNumber(dimension.weight, 0, Number.POSITIVE_INFINITY, 1, warnings, `${id}.weight`);
    const rawScore = dimension.score ?? dimension.confidence ?? dimension.evidence ?? (dimension.pass === true ? 1 : 0);
    const confidence = clampNumber(rawScore, 0, 1, 0, warnings, `${id}.score`);
    return {
      id,
      weight,
      score: confidence,
      earned: roundScore(weight * confidence),
      evidence: dimension.evidenceFound || dimension.evidence || dimension.reason || null,
    };
  });
}

function normalizeRisk(risk = {}, index, warnings) {
  const id = String(risk.id || risk.name || `risk-${index + 1}`);
  const likelihood = clampNumber(risk.likelihood, 1, 5, 1, warnings, `${id}.likelihood`);
  const impact = clampNumber(risk.impact ?? risk.severity, 1, 5, 1, warnings, `${id}.impact`);
  const detectability = clampNumber(risk.detectability, 1, 5, 5, warnings, `${id}.detectability`);
  const mitigationCoverage = clampNumber(
    risk.mitigationCoverage ?? risk.mitigation ?? risk.mitigated,
    0,
    1,
    0,
    warnings,
    `${id}.mitigationCoverage`,
  );
  const weight = clampNumber(risk.weight, 0, Number.POSITIVE_INFINITY, 1, warnings, `${id}.weight`);
  const raw = likelihood * impact * (6 - detectability);
  const residual = clamp((raw / 125) * (1 - mitigationCoverage), 0, 1);
  return {
    id,
    likelihood,
    impact,
    detectability,
    mitigationCoverage,
    weight,
    residual: roundScore(residual),
    reason: risk.reason || risk.description || null,
    mitigation: typeof risk.mitigation === "string" ? risk.mitigation : null,
  };
}

function normalizeCaps(caps, warnings) {
  return (Array.isArray(caps) ? caps : [])
    .map((cap, index) => {
      const score = clampNumber(cap.score ?? cap.cap, 0, DEFAULT_MAX_SCORE, DEFAULT_MAX_SCORE, warnings, `cap-${index + 1}.score`);
      return {
        score,
        reason: String(cap.reason || cap.code || `cap-${index + 1}`),
        code: cap.code || null,
        inferred: cap.inferred === true,
      };
    })
    .sort((left, right) => left.score - right.score);
}

function statusForScore(score) {
  if (score >= 9) return "pass";
  if (score >= 6) return "review";
  return "block";
}

function clampNumber(value, min, max, fallback, warnings, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    warnings.push(`${label} was not finite; used ${fallback}`);
    return fallback;
  }
  const clamped = clamp(number, min, max);
  if (clamped !== number) warnings.push(`${label} was clamped from ${number} to ${clamped}`);
  return clamped;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundScore(value) {
  return Number((Math.round((Number(value) || 0) * 100) / 100).toFixed(2));
}
