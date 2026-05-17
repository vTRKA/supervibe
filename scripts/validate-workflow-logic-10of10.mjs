#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { validateAgentProducerReceipts } from "./lib/agent-producer-contract.mjs";
import { CodeStore } from "./lib/code-store.mjs";
import {
  collectIndexHealthFromStore,
  evaluateIndexHealthGate,
} from "./lib/supervibe-index-health.mjs";
import { buildTaskGraphMaturityReport } from "./lib/supervibe-task-graph-maturity.mjs";
import {
  evaluateFinalOnlyVerificationPolicy,
  PLAN_GRAPH_TASK_FINAL_ONLY_VERIFICATION_POLICY,
} from "./lib/supervibe-workflow-readiness-model.mjs";
import {
  readWorkflowReceipts,
  validateWorkflowReceiptTrust,
  validateWorkflowReceipts,
} from "./lib/supervibe-workflow-receipt-runtime.mjs";
import { validateCommandAgentEnforcement } from "./validate-command-agent-enforcement.mjs";
import { validatePlanReviewGateForPlan } from "./validate-plan-review-artifacts.mjs";

const REQUIRED_EVIDENCE = Object.freeze([
  "memory",
  "rag",
  "codegraph",
  "receipts",
  "graph-proof",
  "agent-lease",
  "routing",
  "review",
  "verification-policy",
]);

export const WORKFLOW_LOGIC_10OF10_RUBRIC_THRESHOLDS = Object.freeze({
  development: Object.freeze({
    id: "development",
    graph: Object.freeze({
      minTaskGraphScore: 10,
      requireActiveGraph: false,
      requireSourcePlanSnapshots: true,
      requireStrictCompletionEvidence: true,
    }),
    receipts: Object.freeze({
      minTrustedReceipts: 1,
      minTrustedHostAgentReceipts: 1,
      requireReceiptRuntimePass: true,
      requireAgentProducerReceiptPass: true,
    }),
    multiAgent: Object.freeze({
      minAgentInvocations: 1,
      minParallelAgents: 1,
      requireCompactResumePrimeDispatch: true,
      requireSingleReadyTaskDispatch: true,
    }),
    retrievalMemoryFreshness: Object.freeze({
      minMemoryEntries: 1,
      minRelevantMemoryEntries: 1,
      minRelevantMemoryConfidence: 9,
      maxMissingOrStaleRows: 0,
      maxSourceStaleRows: 0,
      maxContentChangedRows: 0,
      requireCodeRagFresh: true,
      requireCodeGraphFresh: true,
      requireSourceReadinessSignals: true,
      requireStalenessPolicySignals: true,
      requireAutorefreshOrFallbackSignals: true,
      requireMemoryAutonomySignals: true,
    }),
    verificationCache: Object.freeze({
      finalOnlyVerification: true,
      developmentTestsAllowed: false,
      developmentValidatorsAllowed: false,
      releaseCacheRequired: false,
      releaseCachePassStatus: "pass",
      requireCacheKeyInputDeclarations: true,
      requireDryRunNotWrittenSemantics: true,
      requireBypassForceNonReuse: true,
      requireProofBinding: true,
      requireFinalReleaseFullCheckPolicy: true,
    }),
    releaseGates: Object.freeze({
      requireActiveReview: false,
      releaseFullCheckRequired: false,
      releaseFinalValidationRequired: false,
      fullSuiteAllowed: false,
      minReleaseFullCheckEvidence: 0,
    }),
    devLoopMaturity: Object.freeze({
      requireReadyClaimClosePath: true,
      requireScopedVerificationDiscipline: true,
      requireHonestFinalGatePolicy: true,
    }),
    dispatchMaturity: Object.freeze({
      requireHostInvocationProof: true,
      requireWriteSetSeparation: true,
      requireReceiptBinding: true,
      requireFinalSweepSeparation: true,
      forbidControllerOnlySpecialistProof: true,
    }),
    docsConsistency: Object.freeze({
      requireDocsConsistencySignals: true,
      forbidInternalInitiativeLabels: true,
    }),
  }),
  release: Object.freeze({
    id: "release",
    graph: Object.freeze({
      minTaskGraphScore: 10,
      requireActiveGraph: true,
      requireSourcePlanSnapshots: true,
      requireStrictCompletionEvidence: true,
    }),
    receipts: Object.freeze({
      minTrustedReceipts: 1,
      minTrustedHostAgentReceipts: 1,
      requireReceiptRuntimePass: true,
      requireAgentProducerReceiptPass: true,
    }),
    multiAgent: Object.freeze({
      minAgentInvocations: 1,
      minParallelAgents: 1,
      requireCompactResumePrimeDispatch: true,
      requireSingleReadyTaskDispatch: true,
    }),
    retrievalMemoryFreshness: Object.freeze({
      minMemoryEntries: 5,
      minRelevantMemoryEntries: 1,
      minRelevantMemoryConfidence: 9,
      maxMissingOrStaleRows: 0,
      maxSourceStaleRows: 0,
      maxContentChangedRows: 0,
      requireCodeRagFresh: true,
      requireCodeGraphFresh: true,
      requireSourceReadinessSignals: true,
      requireStalenessPolicySignals: true,
      requireAutorefreshOrFallbackSignals: true,
      requireMemoryAutonomySignals: true,
    }),
    verificationCache: Object.freeze({
      finalOnlyVerification: true,
      developmentTestsAllowed: false,
      developmentValidatorsAllowed: false,
      releaseCacheRequired: true,
      releaseCachePassStatus: "pass",
      requireCacheKeyInputDeclarations: true,
      requireDryRunNotWrittenSemantics: true,
      requireBypassForceNonReuse: true,
      requireProofBinding: true,
      requireFinalReleaseFullCheckPolicy: true,
    }),
    releaseGates: Object.freeze({
      requireActiveReview: true,
      releaseFullCheckRequired: true,
      releaseFinalValidationRequired: true,
      fullSuiteAllowed: true,
      minReleaseFullCheckEvidence: 1,
    }),
    devLoopMaturity: Object.freeze({
      requireReadyClaimClosePath: true,
      requireScopedVerificationDiscipline: true,
      requireHonestFinalGatePolicy: true,
    }),
    dispatchMaturity: Object.freeze({
      requireHostInvocationProof: true,
      requireWriteSetSeparation: true,
      requireReceiptBinding: true,
      requireFinalSweepSeparation: true,
      forbidControllerOnlySpecialistProof: true,
    }),
    docsConsistency: Object.freeze({
      requireDocsConsistencySignals: true,
      forbidInternalInitiativeLabels: true,
    }),
  }),
});

export const WORKFLOW_LOGIC_GATE_PROFILES = Object.freeze({
  development: Object.freeze({
    id: "development",
    label: "Development Gate",
    scope: "task-local",
    thresholds: WORKFLOW_LOGIC_10OF10_RUBRIC_THRESHOLDS.development,
    activeGraphRequired: WORKFLOW_LOGIC_10OF10_RUBRIC_THRESHOLDS.development.graph.requireActiveGraph,
    requireActiveReview: WORKFLOW_LOGIC_10OF10_RUBRIC_THRESHOLDS.development.releaseGates.requireActiveReview,
    releaseFullCheckRequired: WORKFLOW_LOGIC_10OF10_RUBRIC_THRESHOLDS.development.releaseGates.releaseFullCheckRequired,
    targetedOnly: false,
    fullSuiteAllowed: WORKFLOW_LOGIC_10OF10_RUBRIC_THRESHOLDS.development.releaseGates.fullSuiteAllowed,
    finalOnlyVerification: WORKFLOW_LOGIC_10OF10_RUBRIC_THRESHOLDS.development.verificationCache.finalOnlyVerification,
    developmentTestsAllowed: WORKFLOW_LOGIC_10OF10_RUBRIC_THRESHOLDS.development.verificationCache.developmentTestsAllowed,
    developmentValidatorsAllowed: WORKFLOW_LOGIC_10OF10_RUBRIC_THRESHOLDS.development.verificationCache.developmentValidatorsAllowed,
    releaseFinalValidationRequired: WORKFLOW_LOGIC_10OF10_RUBRIC_THRESHOLDS.development.releaseGates.releaseFinalValidationRequired,
    verificationPolicy: PLAN_GRAPH_TASK_FINAL_ONLY_VERIFICATION_POLICY,
    minMemoryEntries: WORKFLOW_LOGIC_10OF10_RUBRIC_THRESHOLDS.development.retrievalMemoryFreshness.minMemoryEntries,
    minRelevantMemoryEntries: WORKFLOW_LOGIC_10OF10_RUBRIC_THRESHOLDS.development.retrievalMemoryFreshness.minRelevantMemoryEntries,
    minTrustedReceipts: WORKFLOW_LOGIC_10OF10_RUBRIC_THRESHOLDS.development.receipts.minTrustedReceipts,
    minHostAgentReceipts: WORKFLOW_LOGIC_10OF10_RUBRIC_THRESHOLDS.development.receipts.minTrustedHostAgentReceipts,
    minAgentInvocations: WORKFLOW_LOGIC_10OF10_RUBRIC_THRESHOLDS.development.multiAgent.minAgentInvocations,
    policy: "Plan, graph, and task development work must schedule no tests or validators; all verification is deferred to the final release gate.",
  }),
  release: Object.freeze({
    id: "release",
    label: "Release Gate",
    scope: "phase-or-release-gate",
    thresholds: WORKFLOW_LOGIC_10OF10_RUBRIC_THRESHOLDS.release,
    activeGraphRequired: WORKFLOW_LOGIC_10OF10_RUBRIC_THRESHOLDS.release.graph.requireActiveGraph,
    requireActiveReview: WORKFLOW_LOGIC_10OF10_RUBRIC_THRESHOLDS.release.releaseGates.requireActiveReview,
    releaseFullCheckRequired: WORKFLOW_LOGIC_10OF10_RUBRIC_THRESHOLDS.release.releaseGates.releaseFullCheckRequired,
    targetedOnly: false,
    fullSuiteAllowed: WORKFLOW_LOGIC_10OF10_RUBRIC_THRESHOLDS.release.releaseGates.fullSuiteAllowed,
    finalOnlyVerification: WORKFLOW_LOGIC_10OF10_RUBRIC_THRESHOLDS.release.verificationCache.finalOnlyVerification,
    developmentTestsAllowed: WORKFLOW_LOGIC_10OF10_RUBRIC_THRESHOLDS.release.verificationCache.developmentTestsAllowed,
    developmentValidatorsAllowed: WORKFLOW_LOGIC_10OF10_RUBRIC_THRESHOLDS.release.verificationCache.developmentValidatorsAllowed,
    releaseFinalValidationRequired: WORKFLOW_LOGIC_10OF10_RUBRIC_THRESHOLDS.release.releaseGates.releaseFinalValidationRequired,
    verificationPolicy: PLAN_GRAPH_TASK_FINAL_ONLY_VERIFICATION_POLICY,
    minMemoryEntries: WORKFLOW_LOGIC_10OF10_RUBRIC_THRESHOLDS.release.retrievalMemoryFreshness.minMemoryEntries,
    minRelevantMemoryEntries: WORKFLOW_LOGIC_10OF10_RUBRIC_THRESHOLDS.release.retrievalMemoryFreshness.minRelevantMemoryEntries,
    minTrustedReceipts: WORKFLOW_LOGIC_10OF10_RUBRIC_THRESHOLDS.release.receipts.minTrustedReceipts,
    minHostAgentReceipts: WORKFLOW_LOGIC_10OF10_RUBRIC_THRESHOLDS.release.receipts.minTrustedHostAgentReceipts,
    minAgentInvocations: WORKFLOW_LOGIC_10OF10_RUBRIC_THRESHOLDS.release.multiAgent.minAgentInvocations,
    policy: "Release work must run the deferred final validation gate with active graph proof, trusted review evidence, and a recorded full-check evidence entry.",
  }),
});

export const WORKFLOW_LOGIC_10OF10_DIMENSIONS = Object.freeze([
  { id: "memory", max: 1.0 },
  { id: "rag", max: 1.0 },
  { id: "codegraph", max: 1.25 },
  { id: "receipts", max: 1.25 },
  { id: "graph-proof", max: 1.25 },
  { id: "agent-lease", max: 1.0 },
  { id: "routing", max: 1.25 },
  { id: "review", max: 1.0 },
  { id: "gate-profile", max: 1.0 },
]);

const MEMORY_TAG_RE = /\b(workflow|rag|codegraph|receipts?|routing|agents?|review|loop|memory)\b/i;
const HOST_AGENT_SUBJECT_TYPES = new Set(["agent", "worker", "reviewer"]);
const RELEASE_FULL_CHECK_RE = /^(npm\s+run\s+check|npm\s+run\s+check:release|npm\s+run\s+check:release-strict)$/i;
const RELEASE_SCOPES = new Set(["graph", "epic", "pending-close", "release", "final", "final-close", "release-gate", "graph-release-gate"]);
const SOURCE_HEALTH_BLOCKERS = new Set(["source-coverage", "generated-leakage", "content-stale"]);
const RUNTIME_ARTIFACT_DIRS = new Set([".claude", ".codex", ".supervibe", ".worktrees", "worktrees", "node_modules"]);

export async function buildWorkflowLogicTenOfTenReport(rootDir = process.cwd(), options = {}) {
  const resolvedRoot = resolve(rootDir);
  const profile = resolveProfile(options.profile || (options.release ? "release" : "development"));
  const [
    memory,
    index,
    receipts,
    graphProof,
    agentLease,
    routing,
    review,
    gateProfile,
  ] = await Promise.all([
    Promise.resolve(collectMemoryEvidence(resolvedRoot, profile)),
    collectIndexEvidence(resolvedRoot, profile),
    Promise.resolve(collectReceiptEvidence(resolvedRoot, profile)),
    Promise.resolve(collectGraphProofEvidence(resolvedRoot, profile)),
    Promise.resolve(collectAgentLeaseEvidence(resolvedRoot, profile, { now: options.now })),
    Promise.resolve(collectRoutingEvidence(resolvedRoot, options)),
    collectReviewEvidence(resolvedRoot, profile, options),
    Promise.resolve(collectGateProfileEvidence(resolvedRoot, profile)),
  ]);

  return scoreWorkflowLogicTenOfTen({
    profile: profile.id,
    evidence: {
      memory,
      rag: index.rag,
      codegraph: index.codegraph,
      receipts,
      graphProof,
      agentLease,
      routing,
      review,
      gateProfile,
    },
  });
}

export function scoreWorkflowLogicTenOfTen({ profile = "development", evidence = {} } = {}) {
  const gateProfile = resolveProfile(profile);
  const finalOnlyPolicy = evaluateFinalOnlyVerificationPolicy(gateProfile.verificationPolicy);
  const dimensions = WORKFLOW_LOGIC_10OF10_DIMENSIONS.map((dimension) => {
    let observed = normalizeEvidenceForDimension(dimension.id, evidence[camelDimensionId(dimension.id)] ?? evidence[dimension.id]);
    if (dimension.id === "gate-profile") observed = mergeGateProfilePolicyEvidence(observed, finalOnlyPolicy);
    const pass = observed.pass === true;
    return {
      id: dimension.id,
      max: dimension.max,
      score: pass ? dimension.max : 0,
      pass,
      required: true,
      evidence: observed.summary || observed.evidence || "no evidence reported",
      nextAction: observed.nextAction || nextActionForDimension(dimension.id, gateProfile),
      details: observed.details || observed,
    };
  });
  const score = Number(dimensions.reduce((sum, dimension) => sum + dimension.score, 0).toFixed(2));
  const blockers = dimensions
    .filter((dimension) => dimension.pass !== true)
    .map((dimension) => ({
      id: dimension.id,
      evidence: dimension.evidence,
      nextAction: dimension.nextAction,
    }));
  return {
    schemaVersion: 1,
    kind: "supervibe-workflow-logic-10of10",
    profile: gateProfile.id,
    profileLabel: gateProfile.label,
    score,
    maxScore: 10,
    pass: score === 10 && blockers.length === 0,
    status: score === 10 && blockers.length === 0 ? "10-of-10-ready" : score >= 8 ? "near-10-evidence-gaps" : "hardening-required",
    strictTenOfTenReady: score === 10 && blockers.length === 0,
    requiredEvidence: REQUIRED_EVIDENCE,
    rubricThresholds: gateProfile.thresholds,
    availableRubricModes: Object.keys(WORKFLOW_LOGIC_10OF10_RUBRIC_THRESHOLDS),
    gateProfile: {
      id: gateProfile.id,
      scope: gateProfile.scope,
      targetedOnly: gateProfile.targetedOnly,
      fullSuiteAllowed: gateProfile.fullSuiteAllowed,
      releaseFullCheckRequired: gateProfile.releaseFullCheckRequired,
      activeGraphRequired: gateProfile.activeGraphRequired,
      requireActiveReview: gateProfile.requireActiveReview,
      finalOnlyVerification: finalOnlyPolicy.pass === true,
      finalOnlyWorkflowTypes: finalOnlyPolicy.details?.policy?.appliesTo || [],
      developmentTestsAllowed: gateProfile.developmentTestsAllowed === true,
      developmentValidatorsAllowed: gateProfile.developmentValidatorsAllowed === true,
      releaseFinalValidationRequired: gateProfile.releaseFinalValidationRequired === true,
      verificationPolicyId: finalOnlyPolicy.details?.policy?.id || "unknown",
      verificationPolicySummary: finalOnlyPolicy.summary,
      policy: gateProfile.policy,
    },
    dimensions,
    blockers,
  };
}

export function formatWorkflowLogicTenOfTenReport(report = {}) {
  const lines = [
    "SUPERVIBE_WORKFLOW_LOGIC_10OF10",
    `PROFILE: ${report.profile || "development"}`,
    `PASS: ${report.pass === true}`,
    `STRICT_10_OF_10_READY: ${report.strictTenOfTenReady === true}`,
    `SCORE: ${report.score ?? 0}/${report.maxScore || 10}`,
    `STATUS: ${report.status || "unknown"}`,
    `REQUIRED_EVIDENCE: ${(report.requiredEvidence || REQUIRED_EVIDENCE).join(",")}`,
    `RUBRIC_MODE: ${report.rubricThresholds?.id || report.profile || "development"}`,
    `RUBRIC_MODES: ${(report.availableRubricModes || Object.keys(WORKFLOW_LOGIC_10OF10_RUBRIC_THRESHOLDS)).join(",")}`,
    `RUBRIC_THRESHOLDS: ${formatRubricThresholdSummary(report.rubricThresholds || WORKFLOW_LOGIC_10OF10_RUBRIC_THRESHOLDS.development)}`,
    `GATE_SCOPE: ${report.gateProfile?.scope || "unknown"}`,
    `TARGETED_ONLY: ${report.gateProfile?.targetedOnly === true}`,
    `FULL_SUITE_ALLOWED: ${report.gateProfile?.fullSuiteAllowed === true}`,
    `RELEASE_FULL_CHECK_REQUIRED: ${report.gateProfile?.releaseFullCheckRequired === true}`,
    `FINAL_ONLY_VERIFICATION: ${report.gateProfile?.finalOnlyVerification === true}`,
    `FINAL_ONLY_WORKFLOW_TYPES: ${(report.gateProfile?.finalOnlyWorkflowTypes || []).join(",") || "none"}`,
    `DEVELOPMENT_TESTS_ALLOWED: ${report.gateProfile?.developmentTestsAllowed === true}`,
    `DEVELOPMENT_VALIDATORS_ALLOWED: ${report.gateProfile?.developmentValidatorsAllowed === true}`,
    `RELEASE_FINAL_VALIDATION_REQUIRED: ${report.gateProfile?.releaseFinalValidationRequired === true}`,
    `VERIFICATION_POLICY: ${report.gateProfile?.verificationPolicyId || "unknown"}`,
    `ACTIVE_GRAPH_REQUIRED: ${report.gateProfile?.activeGraphRequired === true}`,
    `ACTIVE_REVIEW_REQUIRED: ${report.gateProfile?.requireActiveReview === true}`,
    `GATE_POLICY: ${report.gateProfile?.policy || "unknown"}`,
    "DIMENSIONS:",
  ];
  for (const dimension of report.dimensions || []) {
    lines.push(`- ${dimension.id}: ${dimension.score}/${dimension.max} pass=${dimension.pass === true} evidence="${dimension.evidence || "none"}"`);
  }
  lines.push(`BLOCKERS: ${(report.blockers || []).length}`);
  for (const blocker of report.blockers || []) {
    lines.push(`BLOCKER: ${blocker.id} - ${blocker.evidence}`);
    lines.push(`NEXT_ACTION: ${blocker.nextAction}`);
  }
  return lines.join("\n");
}

function collectMemoryEvidence(rootDir, profile) {
  const indexPath = join(rootDir, ".supervibe", "memory", "index.json");
  if (!existsSync(indexPath)) {
    return {
      pass: false,
      summary: "memory index missing",
      nextAction: "Build or repair .supervibe/memory/index.json before a 10/10 workflow-logic claim.",
    };
  }
  const index = readJson(indexPath, { entries: [] });
  const entries = Array.isArray(index.entries) ? index.entries : [];
  const relevant = entries.filter((entry) => {
    const tags = Array.isArray(entry.tags) ? entry.tags.join(" ") : "";
    const threshold = profile.thresholds?.retrievalMemoryFreshness?.minRelevantMemoryConfidence ?? 9;
    return Number(entry.confidence || 0) >= threshold && MEMORY_TAG_RE.test(tags);
  });
  const pass = entries.length >= profile.minMemoryEntries && relevant.length >= profile.minRelevantMemoryEntries;
  return {
    pass,
    summary: `entries=${entries.length}/${profile.minMemoryEntries}, relevantHighConfidence=${relevant.length}/${profile.minRelevantMemoryEntries}, confidence>=${profile.thresholds?.retrievalMemoryFreshness?.minRelevantMemoryConfidence ?? 9}`,
    details: {
      indexPath: toRel(rootDir, indexPath),
      generatedAt: index.generatedAt || null,
      relevantIds: relevant.slice(0, 8).map((entry) => entry.id || entry.file).filter(Boolean),
    },
    nextAction: pass
      ? null
      : "Run project-memory retrieval and rebuild/backfill memory entries with workflow, RAG, CodeGraph, receipt, routing, or review tags.",
  };
}

async function collectIndexEvidence(rootDir, profile = WORKFLOW_LOGIC_GATE_PROFILES.development) {
  const codeDbPath = join(rootDir, ".supervibe", "memory", "code.db");
  if (!existsSync(codeDbPath)) {
    return {
      rag: {
        pass: false,
        summary: "code.db missing",
        nextAction: "Run node scripts/build-code-index.mjs --root . --resume --source-only --health --json-progress.",
      },
      codegraph: {
        pass: false,
        summary: "code.db missing",
        nextAction: "Run node scripts/build-code-index.mjs --root . --resume --graph --max-files 200 --health.",
      },
    };
  }

  const store = new CodeStore(rootDir, { useEmbeddings: false, useGraph: true });
  try {
    await store.init();
    const health = await collectIndexHealthFromStore(store, { rootDir });
    const gate = evaluateIndexHealthGate(health, { strictGraph: true });
    const missing = collectMissingOrStaleFromHealth(health);
    const failedCodes = (gate.failedGates || []).map((item) => item.code);
    const warningCodes = (gate.warnings || []).map((item) => item.code);
    const missingOrStale = missing.count;
    const workflowFailedCodes = failedCodes.filter((code) => code !== "stale-rows" || missing.sourceStaleRows.length > 0);
    const sourceReady = workflowFailedCodes.every((code) => !SOURCE_HEALTH_BLOCKERS.has(code));
    const graphReady = workflowFailedCodes.length === 0;
    const freshness = profile.thresholds?.retrievalMemoryFreshness || WORKFLOW_LOGIC_10OF10_RUBRIC_THRESHOLDS.development.retrievalMemoryFreshness;
    const noStale = missingOrStale <= freshness.maxMissingOrStaleRows
      && missing.sourceStaleRows.length <= freshness.maxSourceStaleRows
      && missing.contentChangedRows.length <= freshness.maxContentChangedRows;
    return {
      rag: {
        pass: sourceReady && noStale,
        summary: `source=${gate.indexedSourceFiles || 0}/${gate.eligibleSourceFiles || 0}, missingOrStale=${missingOrStale ?? "unknown"}/${freshness.maxMissingOrStaleRows}, sourceStale=${missing.sourceStaleRows.length}/${freshness.maxSourceStaleRows}, contentChanged=${missing.contentChangedRows.length}/${freshness.maxContentChangedRows}, failed=${workflowFailedCodes.join(",") || "none"}`,
        details: { gate, missing },
        nextAction: sourceReady && noStale ? null : "Refresh source RAG with build-code-index --source-only and confirm source health has no missing, stale, or content-changed source rows.",
      },
      codegraph: {
        pass: graphReady && noStale,
        summary: `ready=${graphReady}, missingOrStale=${missingOrStale ?? "unknown"}/${freshness.maxMissingOrStaleRows}, sourceStale=${missing.sourceStaleRows.length}/${freshness.maxSourceStaleRows}, contentChanged=${missing.contentChangedRows.length}/${freshness.maxContentChangedRows}, warnings=${warningCodes.join(",") || "none"}`,
        details: { gate, missing },
        nextAction: graphReady && noStale ? null : "Refresh CodeGraph with build-code-index --graph and rerun index health before 10/10 claims.",
      },
    };
  } catch (error) {
    return {
      rag: {
        pass: false,
        summary: `index health error: ${error.message}`,
        nextAction: "Repair Code RAG index health before using workflow-logic 10/10 readiness.",
      },
      codegraph: {
        pass: false,
        summary: `index health error: ${error.message}`,
        nextAction: "Repair CodeGraph index health before using workflow-logic 10/10 readiness.",
      },
    };
  } finally {
    store.close();
  }
}

function collectReceiptEvidence(rootDir, profile) {
  const workflowReceipts = validateWorkflowReceipts(rootDir, {});
  const agentReceipts = validateAgentProducerReceipts(rootDir, {
    requireHostAgentReceipts: true,
    minHostAgentReceipts: profile.minHostAgentReceipts,
    minAgentInvocations: profile.minAgentInvocations,
  });
  let trustedReceipts = 0;
  let trustedHostAgentReceipts = 0;
  for (const receipt of readWorkflowReceipts(rootDir)) {
    if (!receipt?.receiptId || receipt.__invalidJson) continue;
    const trust = validateWorkflowReceiptTrust(rootDir, receipt, { skipLedgerChain: true });
    if (!trust.pass) continue;
    trustedReceipts += 1;
    if (HOST_AGENT_SUBJECT_TYPES.has(String(receipt.subjectType || "").toLowerCase())) {
      trustedHostAgentReceipts += 1;
    }
  }
  const agentInvocations = Number(agentReceipts.agentInvocations ?? agentReceipts.loggedAgentInvocations ?? 0);
  const receiptThresholds = profile.thresholds?.receipts || WORKFLOW_LOGIC_10OF10_RUBRIC_THRESHOLDS.development.receipts;
  const receiptRuntimePass = !receiptThresholds.requireReceiptRuntimePass || workflowReceipts.pass === true;
  const agentProducerPass = !receiptThresholds.requireAgentProducerReceiptPass || agentReceipts.pass === true;
  const pass = receiptRuntimePass
    && agentProducerPass
    && trustedReceipts >= profile.minTrustedReceipts
    && trustedHostAgentReceipts >= profile.minHostAgentReceipts
    && agentInvocations >= profile.minAgentInvocations;
  return {
    pass,
    summary: `workflowPass=${workflowReceipts.pass === true}, producerPass=${agentReceipts.pass === true}, trustedReceipts=${trustedReceipts}/${profile.minTrustedReceipts}, trustedHostAgentReceipts=${trustedHostAgentReceipts}/${profile.minHostAgentReceipts}, agentInvocations=${agentInvocations}/${profile.minAgentInvocations}`,
    details: { workflowReceipts, agentReceipts, trustedReceipts, trustedHostAgentReceipts, agentInvocations },
    nextAction: pass
      ? null
      : "Run workflow receipt recovery and issue scoped host-agent producer receipts with hostInvocation proof.",
  };
}

function collectGraphProofEvidence(rootDir, profile) {
  const taskGraph = buildTaskGraphMaturityReport(rootDir, {
    requireActiveGraph: profile.activeGraphRequired,
  });
  const sourceSnapshot = (taskGraph.dimensions || []).find((item) => item.id === "source-plan-snapshots");
  const strictEvidence = (taskGraph.dimensions || []).find((item) => item.id === "strict-completion-evidence");
  const currentGraph = (taskGraph.dimensions || []).find((item) => item.id === "current-active-graph" || item.id === "current-graph");
  const graphThresholds = profile.thresholds?.graph || WORKFLOW_LOGIC_10OF10_RUBRIC_THRESHOLDS.development.graph;
  const graphScorePass = Number(taskGraph.score || 0) >= graphThresholds.minTaskGraphScore;
  const pass = taskGraph.pass === true
    && graphScorePass
    && sourceSnapshot?.pass === true
    && strictEvidence?.pass === true
    && (!profile.activeGraphRequired || currentGraph?.pass === true);
  return {
    pass,
    summary: `taskGraph=${taskGraph.score}/${graphThresholds.minTaskGraphScore}, activeRequired=${profile.activeGraphRequired}, sourceSnapshot=${sourceSnapshot?.pass === true}, strictEvidence=${strictEvidence?.pass === true}`,
    details: {
      taskGraph,
      sourceSnapshot: sourceSnapshot || null,
      strictEvidence: strictEvidence || null,
      currentGraph: currentGraph || null,
    },
    nextAction: pass
      ? null
      : "Atomize or repair the reviewed work graph, require source snapshots, and record strict trusted completion evidence.",
  };
}

function collectAgentLeaseEvidence(rootDir, profile, { now = new Date().toISOString() } = {}) {
  const claimsSource = readOptional(join(rootDir, "scripts", "lib", "autonomous-loop-claims.mjs"));
  const loopSource = readOptional(join(rootDir, "scripts", "supervibe-loop.mjs"));
  const testsSource = readOptional(join(rootDir, "tests", "autonomous-loop-claims.test.mjs"));
  const sourceChecks = [
    ["claim TTL", /expiresAt/.test(claimsSource) && /ttlMinutes/.test(claimsSource)],
    ["approval lease", /approvalLeaseAllows/.test(claimsSource) && /exact_approval_lease_required/.test(claimsSource)],
    ["heartbeat host proof", /--heartbeat requires --host-invocation-id/.test(loopSource) || /runtime invocation proof/.test(loopSource)],
    ["stale recovery", /recover-stale/.test(loopSource) && /heartbeatAgeMinutes/.test(loopSource)],
    ["write-set lock", /activeClaimWriteSetLocks/.test(loopSource)],
    ["lease tests", /high-risk claims require exact approval lease/.test(testsSource) && /expired claims are visible/.test(testsSource)],
  ];
  const failed = sourceChecks.filter(([, pass]) => !pass).map(([label]) => label);
  const graphScan = scanGraphClaims(rootDir, { now });
  const stalePass = !profile.releaseFullCheckRequired || graphScan.staleActiveClaims === 0;
  const pass = failed.length === 0 && stalePass;
  return {
    pass,
    summary: `sourceChecks=${sourceChecks.length - failed.length}/${sourceChecks.length}, staleActiveClaims=${graphScan.staleActiveClaims}`,
    details: {
      failed,
      graphScan,
      evidencePaths: [
        "scripts/lib/autonomous-loop-claims.mjs",
        "scripts/supervibe-loop.mjs",
        "tests/autonomous-loop-claims.test.mjs",
      ],
    },
    nextAction: pass
      ? null
      : "Repair claim TTL, heartbeat proof, stale recovery, write-set locking, or stale active graph claims before 10/10 readiness.",
  };
}

function collectRoutingEvidence(rootDir, options = {}) {
  const commandAgent = validateCommandAgentEnforcement(rootDir, {
    pluginRoot: options.pluginRoot || rootDir,
    host: options.host || "codex",
  });
  const taskGraph = buildTaskGraphMaturityReport(rootDir, { requireActiveGraph: false });
  const routing = (taskGraph.dimensions || []).find((item) => item.id === "routing");
  const commandShortcuts = (taskGraph.dimensions || []).find((item) => item.id === "command-shortcuts");
  const fanoutPolicy = collectReadyTaskDispatchPolicyEvidence(rootDir);
  const pass = commandAgent.pass === true
    && routing?.pass === true
    && commandShortcuts?.pass === true
    && fanoutPolicy.pass === true;
  return {
    pass,
    summary: `commandAgent=${commandAgent.pass === true}, routing=${routing?.pass === true}, commandShortcuts=${commandShortcuts?.pass === true}, readyTaskDispatch=${fanoutPolicy.pass === true}`,
    details: { commandAgent, routing, commandShortcuts, fanoutPolicy },
    nextAction: pass
      ? null
      : fanoutPolicy.pass !== true
        ? fanoutPolicy.nextAction
        : "Repair command-agent enforcement, trigger routing, or command shortcut routing before 10/10 workflow-logic claims.",
  };
}

function collectReadyTaskDispatchPolicyEvidence(rootDir) {
  const contractSource = readOptional(join(rootDir, "scripts", "lib", "command-agent-orchestration-contract.mjs"));
  const catalogSource = readOptional(join(rootDir, "scripts", "lib", "supervibe-command-catalog.mjs"));
  const workflowRouterSource = readOptional(join(rootDir, "scripts", "lib", "supervibe-workflow-router.mjs"));
  const triggerRouterSource = readOptional(join(rootDir, "scripts", "lib", "supervibe-trigger-router.mjs"));
  const checks = [
    ["contract-ready-task-dispatch", /agentFanoutPolicy/.test(contractSource) && /minParallelAgents:\s*1/.test(contractSource)],
    ["compact-prime-continuation", /requiredAfterContextCompaction:\s*false/.test(contractSource) && /resume-from-prime-context/.test(contractSource)],
    ["simple-task-single-agent", /requiredForSimpleTasks:\s*false/.test(contractSource) && /single-ready-agent/.test(contractSource)],
    ["catalog-ready-task-policy", /COMMAND_PARALLEL_AGENT_LAUNCH_POLICY/.test(catalogSource) && /single-or-parallel-real-agents/.test(catalogSource)],
    ["workflow-router-ready-task", /agentWavePolicy/.test(workflowRouterSource) && /ready-task-agent-dispatch/.test(workflowRouterSource)],
    ["resume-dispatch-route", /--resume-dispatch/.test(triggerRouterSource)],
  ];
  const failed = checks.filter(([, pass]) => !pass).map(([id]) => id);
  const pass = failed.length === 0;
  return {
    pass,
    summary: `readyTaskDispatchChecks=${checks.length - failed.length}/${checks.length}, failed=${failed.join(",") || "none"}`,
    failed,
    evidencePaths: [
      "scripts/lib/command-agent-orchestration-contract.mjs",
      "scripts/lib/supervibe-command-catalog.mjs",
      "scripts/lib/supervibe-workflow-router.mjs",
      "scripts/lib/supervibe-trigger-router.mjs",
    ],
    nextAction: pass ? null : "Restore ready-task dispatch policy: minParallelAgents=1, compact resume primes context, and simple tasks may run as one agent.",
  };
}

async function collectReviewEvidence(rootDir, profile, options = {}) {
  const planPath = options.plan || options.planPath || null;
  const reviewGate = await validatePlanReviewGateForPlan({
    rootDir,
    planPath,
    requireActiveReview: profile.requireActiveReview || Boolean(planPath),
  });
  const validatorExists = existsSync(join(rootDir, "scripts", "validate-plan-review-artifacts.mjs"));
  const templateExists = existsSync(join(rootDir, "docs", "templates", "plan-review-template.md"));
  const reviewArtifactCount = walkFiles(join(rootDir, ".supervibe", "artifacts", "plan-reviews"))
    .filter((file) => file.endsWith(".md")).length;
  const capabilityPass = validatorExists && (templateExists || reviewArtifactCount > 0);
  const pass = profile.requireActiveReview || planPath
    ? reviewGate.pass === true
    : capabilityPass && reviewGate.pass !== false;
  return {
    pass,
    summary: `reviewGate=${reviewGate.pass === true}, requireActiveReview=${profile.requireActiveReview || Boolean(planPath)}, artifacts=${reviewArtifactCount}, validator=${validatorExists}`,
    details: { reviewGate, validatorExists, templateExists, reviewArtifactCount },
    nextAction: pass
      ? null
      : "Create or repair a plan review artifact and trusted reviewer receipts for the active/release plan.",
  };
}

function collectGateProfileEvidence(rootDir, profile) {
  const commandPlan = readOptional(join(rootDir, "scripts", "command-agent-plan.mjs"));
  const loop = readOptional(join(rootDir, "scripts", "supervibe-loop.mjs"));
  const finalOnlyPolicy = evaluateFinalOnlyVerificationPolicy(profile.verificationPolicy);
  const schedulerReleaseBoundaryPresent = /Full verification commands.*release gates/i.test(commandPlan)
    && /FULL_SUITE_ALLOWED/.test(commandPlan)
    && /Full checks run once at final phase\/release handoff/i.test(loop);
  const releaseGateThresholds = profile.thresholds?.releaseGates || WORKFLOW_LOGIC_10OF10_RUBRIC_THRESHOLDS.development.releaseGates;
  const verificationCacheThresholds = profile.thresholds?.verificationCache || WORKFLOW_LOGIC_10OF10_RUBRIC_THRESHOLDS.development.verificationCache;
  const devLoopMaturity = collectDevLoopMaturityEvidence(rootDir, profile);
  const retrievalFreshnessGate = collectRetrievalFreshnessGateEvidence(rootDir, profile);
  const dispatchMaturityGate = collectDispatchMaturityGateEvidence(rootDir, profile);
  const verificationCacheSafety = collectVerificationCacheSafetyEvidence(rootDir, profile);
  const docsConsistencyGate = collectDocsConsistencyEvidence(rootDir, profile);
  const releaseEvidence = findReleaseFullCheckEvidence(rootDir);
  const requiredReleaseEvidence = releaseGateThresholds.minReleaseFullCheckEvidence ?? 0;
  const releaseEvidencePass = releaseEvidence.length >= requiredReleaseEvidence;
  const pass = finalOnlyPolicy.pass === true
    && schedulerReleaseBoundaryPresent
    && devLoopMaturity.pass === true
    && retrievalFreshnessGate.pass === true
    && dispatchMaturityGate.pass === true
    && verificationCacheSafety.pass === true
    && docsConsistencyGate.pass === true
    && (!profile.releaseFullCheckRequired || releaseEvidencePass);
  return {
    pass,
    summary: `profile=${profile.id}, finalOnlyPolicy=${finalOnlyPolicy.pass === true}, developmentTestsAllowed=${profile.developmentTestsAllowed === true}, developmentValidatorsAllowed=${profile.developmentValidatorsAllowed === true}, releaseFinalRequired=${profile.releaseFinalValidationRequired === true}, schedulerReleaseBoundary=${schedulerReleaseBoundaryPresent}, devLoopMaturity=${devLoopMaturity.pass === true}, retrievalFreshness=${retrievalFreshnessGate.pass === true}, dispatchMaturity=${dispatchMaturityGate.pass === true}, docsConsistency=${docsConsistencyGate.pass === true}, releaseFullCheckEvidence=${releaseEvidence.length}/${requiredReleaseEvidence}, releaseCacheRequired=${verificationCacheThresholds.releaseCacheRequired === true}, cacheSafety=${verificationCacheSafety.pass === true}`,
    details: {
      profile,
      finalOnlyPolicy,
      devLoopMaturity,
      retrievalFreshnessGate,
      dispatchMaturityGate,
      verificationCacheSafety,
      docsConsistencyGate,
      releaseGateThresholds,
      verificationCacheThresholds,
      releaseEvidence: releaseEvidence.slice(0, 8),
      evidencePaths: [
        "scripts/lib/supervibe-workflow-readiness-model.mjs",
        "scripts/command-agent-plan.mjs",
        "scripts/supervibe-loop.mjs",
        "scripts/lib/supervibe-work-state.mjs",
        "scripts/lib/supervibe-wave-controller.mjs",
        "scripts/lib/supervibe-agent-run-bridge.mjs",
        "scripts/lib/supervibe-final-review-sweep.mjs",
        "scripts/lib/agent-producer-contract.mjs",
        "scripts/run-release-check.mjs",
        "scripts/lib/supervibe-verification-cache-v2.mjs",
        "README.md",
        "AGENTS.md",
        "CLAUDE.md",
        "GEMINI.md",
        "docs/supervibe-workflow-hardening.md",
        "docs/supervibe-workflow-logic-10of10.md",
        "docs/provider-configs/",
      ],
    },
    nextAction: pass
      ? null
      : finalOnlyPolicy.pass !== true
        ? finalOnlyPolicy.nextAction
        : devLoopMaturity.pass !== true
          ? devLoopMaturity.nextAction
        : retrievalFreshnessGate.pass !== true
          ? retrievalFreshnessGate.nextAction
        : dispatchMaturityGate.pass !== true
          ? dispatchMaturityGate.nextAction
        : verificationCacheSafety.pass !== true
          ? verificationCacheSafety.nextAction
        : docsConsistencyGate.pass !== true
          ? docsConsistencyGate.nextAction
        : profile.releaseFullCheckRequired
          ? "Run the release full-check gate once and record passing graph-level evidence before release readiness."
          : "Restore plan/graph/task final-only verification policy and release-bound scheduler signals.",
  };
}

function collectDocsConsistencyEvidence(rootDir, profile) {
  const thresholds = profile.thresholds?.docsConsistency || WORKFLOW_LOGIC_10OF10_RUBRIC_THRESHOLDS.development.docsConsistency;
  const docFiles = collectProductionGuidanceFiles(rootDir);
  const docs = docFiles.map((file) => ({
    file,
    rel: toRel(rootDir, file),
    text: readOptional(file),
  }));
  const allText = docs.map((doc) => doc.text).join("\n\n");
  const providerText = docs
    .filter((doc) => doc.rel.startsWith("docs/provider-configs/") || ["AGENTS.md", "CLAUDE.md", "GEMINI.md"].includes(doc.rel))
    .map((doc) => doc.text)
    .join("\n\n");
  const commandRouting = /supervibe-commands\.mjs\s+--match/i.test(allText)
    && /missing_slash_command/i.test(allText)
    && /HARD_STOP/i.test(allText);
  const receiptProvenance = /runtime-issued workflow receipts?/i.test(allText)
    && /hostInvocation\.(?:source|invocationId)/.test(allText)
    && /provenance/i.test(allText);
  const graphTaskUx = /task graph/i.test(allText)
    && /ready\/claim\/close|ready, claim, and close|status must prefer the active graph|visible task graph/i.test(allText);
  const cacheSemantics = /verification cache|release cache/i.test(allText)
    && /previous all-pass cache never converts into a fresh release pass|previous-pass-cache-ignored|force\/bypass non-reuse|force.*non-reuse/i.test(allText);
  const finalReleaseValidation = /do not run tests or (?:global )?validators during development/i.test(allText)
    && /final release or merge gate|final release\/merge gate|final validation block/i.test(allText);
  const providerGuidance = /user-provider-home scoped|selected user provider config|provider runtime config/i.test(providerText)
    && /project runtime configs/i.test(providerText);
  const leakFindings = thresholds.forbidInternalInitiativeLabels === false
    ? []
    : scanInternalInitiativeLabelLeaks(docs);
  const checks = [
    ["command-routing", !thresholds.requireDocsConsistencySignals || commandRouting],
    ["real-receipts-provenance", !thresholds.requireDocsConsistencySignals || receiptProvenance],
    ["graph-task-ux", !thresholds.requireDocsConsistencySignals || graphTaskUx],
    ["cache-semantics", !thresholds.requireDocsConsistencySignals || cacheSemantics],
    ["final-release-validation-policy", !thresholds.requireDocsConsistencySignals || finalReleaseValidation],
    ["provider-guidance-boundaries", !thresholds.requireDocsConsistencySignals || providerGuidance],
    ["no-internal-initiative-labels", leakFindings.length === 0],
  ];
  const failed = checks.filter(([, passed]) => !passed).map(([id]) => id);
  const pass = failed.length === 0;
  return {
    pass,
    summary: `checks=${checks.length - failed.length}/${checks.length}, failed=${failed.join(",") || "none"}, files=${docs.length}, leaks=${leakFindings.length}`,
    details: {
      failed,
      checks: Object.fromEntries(checks.map(([id, passed]) => [id, passed])),
      leakFindings: leakFindings.slice(0, 12),
      thresholds,
      evidencePaths: docs.map((doc) => doc.rel),
    },
    nextAction: pass
      ? null
      : "Restore production docs and provider guidance for command routing, runtime receipt provenance, graph/task UX, verification cache semantics, final release validation policy, provider config boundaries, and removal of internal initiative labels.",
  };
}

function collectVerificationCacheSafetyEvidence(rootDir, profile) {
  const thresholds = profile.thresholds?.verificationCache || WORKFLOW_LOGIC_10OF10_RUBRIC_THRESHOLDS.development.verificationCache;
  const sources = {
    releaseCheck: readOptional(join(rootDir, "scripts", "run-release-check.mjs")),
    cacheSchema: readOptional(join(rootDir, "scripts", "lib", "supervibe-verification-cache-v2.mjs")),
    validator: readOptional(join(rootDir, "scripts", "validate-workflow-logic-10of10.mjs")),
  };
  const checks = [
    [
      "cache-key-input-declarations",
      !thresholds.requireCacheKeyInputDeclarations
        || (/RELEASE_CHECK_CACHE_SAFETY_SIGNALS/.test(sources.releaseCheck)
          && /createVerificationGateInputDeclarationV2/.test(sources.releaseCheck)
          && /function buildGateInputDeclaration/.test(sources.releaseCheck)
          && /fileInputs/.test(sources.releaseCheck)
          && /environmentInputs/.test(sources.releaseCheck)
          && /versionInputs/.test(sources.releaseCheck)
          && /bypassForceInputs/.test(sources.releaseCheck)
          && /inputContentHashes/.test(sources.releaseCheck)
          && /invalidationInputs/.test(sources.releaseCheck)),
    ],
    [
      "dry-run-not-written",
      !thresholds.requireDryRunNotWrittenSemantics
        || (/not-written-dry-run/.test(sources.releaseCheck)
          && /DRY_RUN_PASS/.test(sources.releaseCheck)
          && /PASS: not-applicable-dry-run/.test(sources.releaseCheck)
          && /CACHE_RESULT:/.test(sources.releaseCheck)
          && /RELEASE_RESULT: not-executed/.test(sources.releaseCheck)
          && /if \(options\.dryRun\)/.test(sources.releaseCheck)),
    ],
    [
      "bypass-force-non-reuse",
      !thresholds.requireBypassForceNonReuse
        || (/bypassForceInputs/.test(sources.releaseCheck)
          && /clearCache/.test(sources.releaseCheck)
          && /fromStart/.test(sources.releaseCheck)
          && /previous-pass-cache-ignored/.test(sources.releaseCheck)
          && /failed.*interrupted.*running/.test(sources.releaseCheck)
          && /canReuseVerificationCacheRecordV2/.test(sources.releaseCheck)),
    ],
    [
      "proof-binding",
      !thresholds.requireProofBinding
        || (/function buildGateProofHashes/.test(sources.releaseCheck)
          && /receiptDependencyHash/.test(sources.releaseCheck)
          && /proofHashes/.test(sources.releaseCheck)
          && /VERIFICATION_CACHE_RECORD_V2_INVALIDATION_FIELDS/.test(sources.cacheSchema)
          && /proofHashes/.test(sources.cacheSchema)),
    ],
    [
      "final-release-full-check-policy",
      !thresholds.requireFinalReleaseFullCheckPolicy
        || (/previous all-pass cache never converts into a fresh release pass/.test(sources.releaseCheck)
          && /previous-pass-cache-ignored/.test(sources.releaseCheck)
          && /ReleaseEvidenceV1/.test(sources.releaseCheck)
          && /stdoutPath/.test(sources.releaseCheck)
          && /stderrPath/.test(sources.releaseCheck)
          && /artifactPath/.test(sources.releaseCheck)
          && /receiptId/.test(sources.releaseCheck)
          && /ledgerHash/.test(sources.releaseCheck)
          && /proofHash/.test(sources.releaseCheck)
          && /hostInvocationSource/.test(sources.releaseCheck)
          && /findReleaseFullCheckEvidence/.test(sources.validator)
          && /RELEASE_FULL_CHECK_RE/.test(sources.validator)
          && /minReleaseFullCheckEvidence/.test(sources.validator)),
    ],
  ];
  const failed = checks.filter(([, pass]) => !pass).map(([id]) => id);
  const pass = failed.length === 0;
  return {
    pass,
    summary: `checks=${checks.length - failed.length}/${checks.length}, failed=${failed.join(",") || "none"}`,
    details: {
      failed,
      thresholds,
      checks: Object.fromEntries(checks.map(([id, passed]) => [id, passed])),
      evidencePaths: [
        "scripts/run-release-check.mjs",
        "scripts/lib/supervibe-verification-cache-v2.mjs",
        "scripts/validate-workflow-logic-10of10.mjs",
      ],
    },
    nextAction: pass
      ? null
      : "Restore release verification cache safety signals for input declarations, dry-run non-writes, force/bypass non-reuse, proof-bound reuse keys, and final release full-check policy.",
  };
}

function collectDispatchMaturityGateEvidence(rootDir, profile) {
  const thresholds = profile.thresholds?.dispatchMaturity || WORKFLOW_LOGIC_10OF10_RUBRIC_THRESHOLDS.development.dispatchMaturity;
  const sources = {
    waveController: readOptional(join(rootDir, "scripts", "lib", "supervibe-wave-controller.mjs")),
    agentRunBridge: readOptional(join(rootDir, "scripts", "lib", "supervibe-agent-run-bridge.mjs")),
    agentInvocation: readOptional(join(rootDir, "scripts", "agent-invocation.mjs")),
    agentProducerContract: readOptional(join(rootDir, "scripts", "lib", "agent-producer-contract.mjs")),
    finalReviewSweep: readOptional(join(rootDir, "scripts", "lib", "supervibe-final-review-sweep.mjs")),
    workflowReceipt: readOptional(join(rootDir, "scripts", "workflow-receipt.mjs")),
  };
  const checks = [
    [
      "host-invocation-proof",
      !thresholds.requireHostInvocationProof
        || ((/codex-spawn-agent/.test(sources.agentInvocation) || /codex-spawn-agent/.test(sources.agentRunBridge))
          && /hostInvocation\.source/.test(sources.agentProducerContract)
          && /hostInvocation\.invocationId/.test(sources.agentProducerContract)
          && /planned dry-run invocation id cannot/.test(sources.agentRunBridge)
          && /spawnExecutor is required for dispatch apply/.test(sources.waveController)),
    ],
    [
      "write-set-separation",
      !thresholds.requireWriteSetSeparation
        || (/requireWriteSet/.test(sources.waveController)
          && /detectWriteSetConflicts/.test(sources.waveController)
          && /writeSetLocks/.test(sources.waveController)
          && /createReservedWriteSetLock/.test(sources.waveController)
          && /write-set lock conflict/.test(sources.waveController)),
    ],
    [
      "receipt-binding",
      !thresholds.requireReceiptBinding
        || (/createSpawnInvocationLogBinding/.test(sources.agentRunBridge)
          && /receiptId required for spawn invocation log binding/.test(sources.agentRunBridge)
          && /ledgerHash required for spawn invocation log binding/.test(sources.agentRunBridge)
          && /proofHash required for spawn invocation log binding/.test(sources.agentRunBridge)
          && /issueWorkflowInvocationReceipt/.test(sources.agentInvocation)
          && /validateHostInvocationProof/.test(sources.agentProducerContract)),
    ],
    [
      "final-sweep-separation",
      !thresholds.requireFinalSweepSeparation
        || (/reviewMode = "final-sweep"/.test(sources.waveController)
          && /deferredUntil:\s*finalSweepReview \? "graph-release-gate"/.test(sources.waveController)
          && /finalSweepWork/.test(sources.waveController)
          && /requiredAt:\s*"graph-release-gate"/.test(sources.finalReviewSweep)
          && /midGraphBlocking:\s*false/.test(sources.finalReviewSweep)),
    ],
    [
      "no-controller-only-specialist-emulation",
      !thresholds.forbidControllerOnlySpecialistProof
        || (/command-subject receipts are controller\/diagnostic evidence only/.test(sources.workflowReceipt)
          && /cannot satisfy required producer, reviewer, worker, validator, or task-completion proof/.test(sources.workflowReceipt)
          && /skill-only receipts cannot complete/.test(sources.agentProducerContract)
          && /recovery\/reissue receipt is repair evidence only/.test(sources.agentProducerContract)
          && /planned dry-run invocation id cannot issue a receipt/.test(sources.agentRunBridge)),
    ],
  ];
  const failed = checks.filter(([, pass]) => !pass).map(([id]) => id);
  const pass = failed.length === 0;
  return {
    pass,
    summary: `checks=${checks.length - failed.length}/${checks.length}, failed=${failed.join(",") || "none"}`,
    details: {
      failed,
      checks: Object.fromEntries(checks.map(([id, passed]) => [id, passed])),
      thresholds,
      evidencePaths: [
        "scripts/lib/supervibe-wave-controller.mjs",
        "scripts/lib/supervibe-agent-run-bridge.mjs",
        "scripts/agent-invocation.mjs",
        "scripts/lib/agent-producer-contract.mjs",
        "scripts/lib/supervibe-final-review-sweep.mjs",
        "scripts/workflow-receipt.mjs",
      ],
    },
    nextAction: pass
      ? null
      : "Restore dispatch maturity signals for real host-agent invocation proof, write-set ownership/separation, receipt-bound output proof, final-sweep review separation, and rejection of controller-only specialist emulation.",
  };
}

function collectRetrievalFreshnessGateEvidence(rootDir, profile) {
  const thresholds = profile.thresholds?.retrievalMemoryFreshness || WORKFLOW_LOGIC_10OF10_RUBRIC_THRESHOLDS.development.retrievalMemoryFreshness;
  const sources = {
    validator: readOptional(join(rootDir, "scripts", "validate-workflow-logic-10of10.mjs")),
    status: readOptional(join(rootDir, "scripts", "supervibe-status.mjs")),
    buildIndex: readOptional(join(rootDir, "scripts", "build-code-index.mjs")),
    watcher: readOptional(join(rootDir, "scripts", "lib", "code-watcher.mjs")),
    autorepair: readOptional(join(rootDir, "scripts", "lib", "supervibe-index-autorepair.mjs")),
    retrievalPolicy: readOptional(join(rootDir, "scripts", "lib", "supervibe-retrieval-decision-policy.mjs")),
    searchCode: readOptional(join(rootDir, "scripts", "search-code.mjs")),
    memoryBackfill: readOptional(join(rootDir, "scripts", "supervibe-memory-backfill.mjs")),
    memoryGc: readOptional(join(rootDir, "scripts", "supervibe-memory-gc.mjs")),
    memoryHealth: readOptional(join(rootDir, "scripts", "lib", "supervibe-memory-health.mjs")),
    memoryAutonomy: readOptional(join(rootDir, "scripts", "lib", "supervibe-memory-autonomy.mjs")),
    memoryWatch: readOptional(join(rootDir, "scripts", "watch-memory.mjs")),
  };
  const memoryAutonomyChecks = {
    backfill: /scheduleMemoryBackfill/.test(sources.memoryBackfill)
      && /review-memory-backfill-candidate/.test(sources.memoryBackfill)
      && /intrusiveWrites:\s*false/.test(sources.memoryBackfill),
    watcher: /Auto-reindexes memory entries/i.test(sources.memoryWatch)
      && /startWatcher/.test(sources.memoryWatch)
      && /heartbeat/i.test(sources.memoryWatch),
    gc: /evaluateMemoryGcSchedule/.test(sources.memoryGc)
      && /filterMemoryGcAutoCandidates/.test(sources.memoryGc)
      && /writeMemoryGcScheduleRun/.test(sources.memoryGc),
    degradedFallback: /largeProjectMode\s*=\s*"auto"/.test(sources.memoryHealth)
      && /shouldEnforceMemoryMaturityGate/.test(sources.memoryHealth)
      && /repairCommand/.test(sources.memoryHealth),
    candidateOnlyPolicy: /candidateFirst:\s*true/.test(sources.memoryAutonomy)
      && /durableWriteDefault:\s*false/.test(sources.memoryAutonomy)
      && /explicitApprovalRequired:\s*true/.test(sources.memoryAutonomy),
  };
  const memoryAutonomyPass = (
    memoryAutonomyChecks.backfill
    && memoryAutonomyChecks.watcher
    && memoryAutonomyChecks.gc
    && memoryAutonomyChecks.candidateOnlyPolicy
  ) || memoryAutonomyChecks.degradedFallback;
  const checks = [
    ["memory-readiness-signal", /collectMemoryEvidence/.test(sources.validator) && /buildMemoryHealthReport/.test(sources.status)],
    ["rag-readiness-signal", /collectIndexHealthFromStore/.test(sources.validator) && /evaluateIndexHealthGate/.test(sources.validator) && /sourceReady/.test(sources.validator)],
    ["codegraph-readiness-signal", /strictGraph:\s*true/.test(sources.validator) && /graphReady/.test(sources.validator)],
    ["staleness-policy-signal", /collectMissingOrStaleFromHealth/.test(sources.validator) && /sourceStaleRows/.test(sources.validator) && /contentChangedRows/.test(sources.validator)],
    ["bounded-refresh-signal", /--resume/.test(sources.buildIndex) && /--source-only/.test(sources.buildIndex) && /--graph/.test(sources.buildIndex) && /--max-files/.test(sources.buildIndex)],
    ["auto-refresh-signal", (/auto-reindexes|periodic .*scan|heartbeat/i.test(sources.watcher) && /memory.*code|code.*memory/i.test(sources.watcher)) || (/plan-autorepair/.test(sources.buildIndex) && /buildSmallDeltaAutorepairPlan/.test(sources.autorepair))],
    ["explicit-fallback-signal", /fallbackRequired:\s*true/.test(sources.retrievalPolicy) && /skipReason/.test(sources.retrievalPolicy) && /fallback=/.test(sources.searchCode)],
    ["memory-autonomy-signal", memoryAutonomyPass],
  ];
  const requiredIds = new Set();
  if (thresholds.requireSourceReadinessSignals !== false) {
    requiredIds.add("memory-readiness-signal");
    requiredIds.add("rag-readiness-signal");
    requiredIds.add("codegraph-readiness-signal");
  }
  if (thresholds.requireStalenessPolicySignals !== false) {
    requiredIds.add("staleness-policy-signal");
    requiredIds.add("bounded-refresh-signal");
  }
  if (thresholds.requireAutorefreshOrFallbackSignals !== false) {
    requiredIds.add("auto-refresh-signal");
    requiredIds.add("explicit-fallback-signal");
  }
  if (thresholds.requireMemoryAutonomySignals !== false) {
    requiredIds.add("memory-autonomy-signal");
  }
  const requiredChecks = checks.filter(([id]) => requiredIds.has(id));
  const failed = requiredChecks
    .filter(([, pass]) => !pass)
    .map(([id]) => id);
  const passedRequired = requiredChecks.length - failed.length;
  const pass = failed.length === 0;
  return {
    pass,
    summary: `checks=${passedRequired}/${requiredChecks.length}, failed=${failed.join(",") || "none"}`,
    details: {
      failed,
      checks: Object.fromEntries(checks.map(([id, passed]) => [id, passed])),
      memoryAutonomyChecks,
      thresholds,
      evidencePaths: [
        "scripts/validate-workflow-logic-10of10.mjs",
        "scripts/supervibe-status.mjs",
        "scripts/build-code-index.mjs",
        "scripts/lib/code-watcher.mjs",
        "scripts/lib/supervibe-index-autorepair.mjs",
        "scripts/lib/supervibe-retrieval-decision-policy.mjs",
        "scripts/search-code.mjs",
        "scripts/supervibe-memory-backfill.mjs",
        "scripts/supervibe-memory-gc.mjs",
        "scripts/lib/supervibe-memory-health.mjs",
        "scripts/lib/supervibe-memory-autonomy.mjs",
        "scripts/watch-memory.mjs",
      ],
    },
    nextAction: pass
      ? null
      : "Restore retrieval freshness source signals: memory/RAG/CodeGraph readiness, stale-row policy, bounded refresh or watcher auto-refresh, explicit retrieval fallback, and autonomous memory backfill/watch/GC or degraded fallback.",
  };
}

function collectDevLoopMaturityEvidence(rootDir, profile) {
  const loop = readOptional(join(rootDir, "scripts", "supervibe-loop.mjs"));
  const commandPlan = readOptional(join(rootDir, "scripts", "command-agent-plan.mjs"));
  const workState = readOptional(join(rootDir, "scripts", "lib", "supervibe-work-state.mjs"));
  const thresholds = profile.thresholds?.devLoopMaturity || WORKFLOW_LOGIC_10OF10_RUBRIC_THRESHOLDS.development.devLoopMaturity;
  const checks = [
    [
      "ready-path",
      !thresholds.requireReadyClaimClosePath
        || (/ready-list/.test(loop) && /tasksReadyForAssignment/.test(loop) && /open:\s*\["ready"/.test(workState)),
    ],
    [
      "claim-path",
      !thresholds.requireReadyClaimClosePath
        || (/claim-ready/.test(loop) && /type:\s*"claim"/.test(loop) && /ready:\s*\["claimed"/.test(workState)),
    ],
    [
      "close-path",
      !thresholds.requireReadyClaimClosePath
        || (/close-eligible/.test(loop) && /workItemAction\.type === "close"/.test(loop) && /claimed:\s*\[[^\]]*"closed"/.test(workState)),
    ],
    [
      "scoped-verification-discipline",
      !thresholds.requireScopedVerificationDiscipline
        || (/createTaskLocalVerificationPolicy/.test(loop)
          && /targetedCommands/.test(loop)
          && /deferredFullVerificationCommands/.test(loop)
          && /Do not run tests or validators during development/.test(loop)),
    ],
    [
      "honest-final-gate-policy",
      !thresholds.requireHonestFinalGatePolicy
        || (/createReleaseFullCheckGate/.test(loop)
          && /allow-missing-release-full-check/.test(loop)
          && /require-release-full-check/.test(loop)
          && /Full verification commands.*release gates/i.test(commandPlan)),
    ],
  ];
  const failed = checks.filter(([, pass]) => !pass).map(([id]) => id);
  const pass = failed.length === 0;
  return {
    pass,
    summary: `checks=${checks.length - failed.length}/${checks.length}, failed=${failed.join(",") || "none"}`,
    details: {
      failed,
      thresholds,
      evidencePaths: [
        "scripts/supervibe-loop.mjs",
        "scripts/command-agent-plan.mjs",
        "scripts/lib/supervibe-work-state.mjs",
      ],
    },
    nextAction: pass
      ? null
      : "Restore ready/claim/close loop paths, scoped task-local verification discipline, and explicit final-gate policy before 10/10 workflow-logic claims.",
  };
}

function formatRubricThresholdSummary(thresholds = {}) {
  return [
    `graph.minTaskGraphScore=${thresholds.graph?.minTaskGraphScore ?? "unknown"}`,
    `graph.requireActiveGraph=${thresholds.graph?.requireActiveGraph === true}`,
    `receipts.minTrusted=${thresholds.receipts?.minTrustedReceipts ?? "unknown"}`,
    `receipts.minHostAgent=${thresholds.receipts?.minTrustedHostAgentReceipts ?? "unknown"}`,
    `multiAgent.minInvocations=${thresholds.multiAgent?.minAgentInvocations ?? "unknown"}`,
    `multiAgent.minReadyAgents=${thresholds.multiAgent?.minParallelAgents ?? "unknown"}`,
    `retrieval.minMemory=${thresholds.retrievalMemoryFreshness?.minMemoryEntries ?? "unknown"}`,
    `retrieval.maxMissingOrStale=${thresholds.retrievalMemoryFreshness?.maxMissingOrStaleRows ?? "unknown"}`,
    `retrieval.sourceSignals=${thresholds.retrievalMemoryFreshness?.requireSourceReadinessSignals === true}`,
    `retrieval.stalenessPolicy=${thresholds.retrievalMemoryFreshness?.requireStalenessPolicySignals === true}`,
    `retrieval.autorefreshOrFallback=${thresholds.retrievalMemoryFreshness?.requireAutorefreshOrFallbackSignals === true}`,
    `retrieval.memoryAutonomy=${thresholds.retrievalMemoryFreshness?.requireMemoryAutonomySignals === true}`,
    `verificationCache.releaseRequired=${thresholds.verificationCache?.releaseCacheRequired === true}`,
    `verificationCache.cacheSafetySignals=${thresholds.verificationCache?.requireCacheKeyInputDeclarations === true && thresholds.verificationCache?.requireDryRunNotWrittenSemantics === true && thresholds.verificationCache?.requireBypassForceNonReuse === true && thresholds.verificationCache?.requireProofBinding === true && thresholds.verificationCache?.requireFinalReleaseFullCheckPolicy === true}`,
    `releaseGates.minFullCheckEvidence=${thresholds.releaseGates?.minReleaseFullCheckEvidence ?? "unknown"}`,
    `devLoop.readyClaimClose=${thresholds.devLoopMaturity?.requireReadyClaimClosePath === true}`,
    `dispatch.hostInvocationProof=${thresholds.dispatchMaturity?.requireHostInvocationProof === true}`,
    `dispatch.writeSetSeparation=${thresholds.dispatchMaturity?.requireWriteSetSeparation === true}`,
    `dispatch.receiptBinding=${thresholds.dispatchMaturity?.requireReceiptBinding === true}`,
    `dispatch.finalSweepSeparation=${thresholds.dispatchMaturity?.requireFinalSweepSeparation === true}`,
    `dispatch.noControllerOnlyEmulation=${thresholds.dispatchMaturity?.forbidControllerOnlySpecialistProof === true}`,
    `docs.consistencySignals=${thresholds.docsConsistency?.requireDocsConsistencySignals === true}`,
    `docs.noInternalInitiativeLabels=${thresholds.docsConsistency?.forbidInternalInitiativeLabels === true}`,
  ].join(", ");
}

function resolveProfile(profile) {
  const id = String(profile || "development").toLowerCase();
  if (id === "dev") return WORKFLOW_LOGIC_GATE_PROFILES.development;
  if (id === "release" || id === "prod" || id === "production") return WORKFLOW_LOGIC_GATE_PROFILES.release;
  return WORKFLOW_LOGIC_GATE_PROFILES[id] || WORKFLOW_LOGIC_GATE_PROFILES.development;
}

function mergeGateProfilePolicyEvidence(observed = {}, finalOnlyPolicy = {}) {
  const observedSummary = observed.summary || observed.evidence || "no evidence reported";
  const summary = [observedSummary, finalOnlyPolicy.summary].filter(Boolean).join("; ");
  const pass = observed.pass === true && finalOnlyPolicy.pass === true;
  return {
    ...observed,
    pass,
    summary,
    evidence: summary,
    nextAction: pass ? observed.nextAction : finalOnlyPolicy.pass === true ? observed.nextAction : finalOnlyPolicy.nextAction,
    details: {
      observed,
      finalOnlyPolicy,
    },
  };
}

function normalizeEvidenceForDimension(id, evidence = {}) {
  if (evidence && typeof evidence === "object") return evidence;
  return {
    pass: false,
    summary: `${id} evidence missing`,
  };
}

function camelDimensionId(id) {
  return String(id).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

function nextActionForDimension(id, profile) {
  const byId = {
    memory: "Search project memory and rebuild/backfill .supervibe/memory/index.json with high-confidence workflow evidence.",
    rag: "Refresh Code RAG and prove indexed source coverage is current.",
    codegraph: "Refresh CodeGraph and prove graph readiness without stale source.",
    receipts: "Run receipt recovery and issue trusted scoped host-agent receipts.",
    "graph-proof": profile.activeGraphRequired
      ? "Repair the active work graph, source snapshot, and trusted completion proof."
      : "Repair task graph maturity and strict graph proof capability.",
    "agent-lease": "Repair claim TTL, heartbeat proof, stale recovery, and write-set lock evidence.",
    routing: "Repair command, trigger, and command-agent routing gates.",
    review: profile.requireActiveReview
      ? "Bind the active/release plan review to trusted reviewer receipts."
      : "Restore plan-review validator/template capability.",
    "gate-profile": profile.releaseFullCheckRequired
      ? "Record final release validation evidence at graph or release scope."
      : "Restore plan/graph/task final-only verification scheduling with no development tests or validators.",
  };
  return byId[id] || "Repair missing workflow-logic evidence.";
}

function collectMissingOrStaleFromHealth(health = {}) {
  const staleRows = Array.isArray(health.staleRows) ? health.staleRows : [];
  const generatedRows = new Set(Array.isArray(health.generatedIndexedFiles) ? health.generatedIndexedFiles : []);
  const ignoredStaleRows = staleRows.filter((row) => generatedRows.has(row) || isRuntimeArtifactPath(row));
  const sourceStaleRows = staleRows.filter((row) => !ignoredStaleRows.includes(row));
  const contentChangedRows = Array.isArray(health.contentChangedRows) ? health.contentChangedRows : [];
  const missingSourceRows = Math.max(0, Number(health.eligibleSourceFiles || 0) - Number(health.indexedSourceFiles || 0));
  const count = missingSourceRows + sourceStaleRows.length + contentChangedRows.length;
  return {
    count,
    status: "from-index-health",
    output: `missingSourceRows=${missingSourceRows}, sourceStaleRows=${sourceStaleRows.length}, contentChangedRows=${contentChangedRows.length}, ignoredRuntimeStaleRows=${ignoredStaleRows.length}`,
    missingSourceRows,
    sourceStaleRows,
    contentChangedRows,
    ignoredStaleRows,
  };
}

function isRuntimeArtifactPath(filePath = "") {
  const segments = String(filePath).replace(/\\/g, "/").split("/").filter(Boolean);
  return segments.some((segment) => RUNTIME_ARTIFACT_DIRS.has(segment));
}

function scanGraphClaims(rootDir, { now = new Date().toISOString() } = {}) {
  const nowMs = Date.parse(now);
  const graphFiles = walkFiles(join(rootDir, ".supervibe", "memory", "work-items"))
    .filter((file) => file.endsWith("graph.json") || file.endsWith(".work-item-graph.json"))
    .filter((file) => !normalizePath(file).includes("/.archive/"));
  let activeClaims = 0;
  let staleActiveClaims = 0;
  const stale = [];
  for (const file of graphFiles) {
    const graph = readJson(file, {});
    for (const claim of Array.isArray(graph.claims) ? graph.claims : []) {
      const status = String(claim.status || "").toLowerCase();
      if (!["active", "claimed", "in_progress", "running"].includes(status)) continue;
      activeClaims += 1;
      if (claim.expiresAt && Date.parse(claim.expiresAt) <= nowMs) {
        staleActiveClaims += 1;
        stale.push(`${toRel(rootDir, file)}:${claim.taskId || claim.itemId || claim.claimId || "claim"}`);
      }
    }
  }
  return { graphFiles: graphFiles.length, activeClaims, staleActiveClaims, stale };
}

function findReleaseFullCheckEvidence(rootDir) {
  const graphFiles = walkFiles(join(rootDir, ".supervibe", "memory", "work-items"))
    .filter((file) => file.endsWith("graph.json") || file.endsWith(".work-item-graph.json"))
    .filter((file) => !normalizePath(file).includes("/.archive/"));
  const matches = [];
  for (const file of graphFiles) {
    const graph = readJson(file, {});
    for (const entry of collectGraphEvidence(graph)) {
      const command = String(entry.command || "").trim();
      const scope = String(entry.scope || "").toLowerCase();
      const status = String(entry.status || entry.verdict || entry.result || "").toLowerCase();
      const releaseScope = RELEASE_SCOPES.has(scope);
      const graphScopedTask = scope === "graph" && (entry.taskId || entry.workItemId) && !entry.releaseGate && !entry.phaseGate && !entry.finalGate;
      if (RELEASE_FULL_CHECK_RE.test(command) && releaseScope && !graphScopedTask && /^(pass|passed|ok|success|succeeded|true)$/.test(status)) {
        matches.push({
          graph: toRel(rootDir, file),
          command,
          scope,
          status,
        });
      }
    }
  }
  return matches;
}

function collectGraphEvidence(graph = {}) {
  const out = [];
  const add = (entry, scope) => {
    if (!entry) return;
    if (Array.isArray(entry)) {
      for (const item of entry) add(item, scope);
      return;
    }
    if (typeof entry === "object") out.push({ ...entry, scope: entry.scope || scope });
  };
  add(graph.verificationEvidence, "graph");
  add(graph.evidence, "graph");
  for (const item of graph.items || []) {
    add(item.verificationEvidence, "item");
    add(item.evidence, "item");
  }
  for (const task of graph.tasks || []) {
    add(task.verificationEvidence, "task");
    add(task.evidence, "task");
  }
  return out;
}

function collectProductionGuidanceFiles(rootDir) {
  const explicitFiles = [
    "README.md",
    "AGENTS.md",
    "CLAUDE.md",
    "GEMINI.md",
    "docs/supervibe-workflow-hardening.md",
    "docs/supervibe-workflow-logic-10of10.md",
    "docs/supervibe-workflow-ux.md",
  ];
  const files = explicitFiles.map((file) => join(rootDir, ...file.split("/"))).filter((file) => existsSync(file));
  for (const dir of [join(rootDir, "docs", "provider-configs"), join(rootDir, "commands")]) {
    files.push(...walkFiles(dir).filter((file) => file.endsWith(".md")));
  }
  for (const dir of [join(rootDir, "skills", "writing-plans"), join(rootDir, "skills", "executing-plans")]) {
    files.push(...walkFiles(dir).filter((file) => file.endsWith(".md")));
  }
  return Array.from(new Set(files)).filter((file) => !isRuntimeArtifactPath(relative(rootDir, file)) && !normalizePath(file).includes("/node_modules/"));
}

function scanInternalInitiativeLabelLeaks(docs = []) {
  const leakPatterns = [
    /\.supervibe\/artifacts\/evidence\/[A-Za-z0-9][A-Za-z0-9_-]+\//g,
    /\bepic-[a-z0-9]+(?:-[a-z0-9]+){3,}\b/g,
  ];
  const findings = [];
  for (const doc of docs) {
    const lines = String(doc.text || "").split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      for (const pattern of leakPatterns) {
        pattern.lastIndex = 0;
        if (pattern.test(lines[index])) findings.push(`${doc.rel}:${index + 1}`);
      }
    }
  }
  return findings;
}

function readJson(path, fallback = null) {
  try {
    return JSON.parse(String(readFileSync(path, "utf8")).replace(/^\uFEFF/, ""));
  } catch {
    return fallback;
  }
}

function readOptional(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function walkFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) out.push(...walkFiles(path));
    else out.push(path);
  }
  return out;
}

function normalizePath(value = "") {
  return String(value).replace(/\\/g, "/");
}

function toRel(rootDir, path) {
  return normalizePath(relative(rootDir, path)).split(sep).join("/");
}

function parseArgs(argv = []) {
  const options = {};
  for (let index = 2; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      options[key] = true;
      continue;
    }
    options[key] = next;
    index += 1;
  }
  return options;
}

function usage() {
  return [
    "SUPERVIBE_WORKFLOW_LOGIC_10OF10_HELP",
    "USAGE:",
    "  node scripts/validate-workflow-logic-10of10.mjs [--root .] [--profile development|release] [--json] [--plan <path>]",
    "",
    "Checks workflow-logic maturity across memory, Code RAG, CodeGraph, receipts, graph proof, agent lease, routing, review evidence, and development/release gate policy.",
  ].join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv);
  if (options.help || options.h) {
    console.log(usage());
    process.exit(0);
  }
  const report = await buildWorkflowLogicTenOfTenReport(resolve(options.root || process.cwd()), {
    profile: options.profile || (options.release ? "release" : "development"),
    pluginRoot: options["plugin-root"] || options.pluginRoot,
    host: options.host,
    plan: options.plan,
    now: options.now,
  });
  console.log(options.json ? JSON.stringify(report, null, 2) : formatWorkflowLogicTenOfTenReport(report));
  process.exit(report.pass ? 0 : 1);
}
