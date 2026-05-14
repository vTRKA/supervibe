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

export const WORKFLOW_LOGIC_GATE_PROFILES = Object.freeze({
  development: Object.freeze({
    id: "development",
    label: "Development Gate",
    scope: "task-local",
    activeGraphRequired: false,
    requireActiveReview: false,
    releaseFullCheckRequired: false,
    targetedOnly: false,
    fullSuiteAllowed: false,
    finalOnlyVerification: true,
    developmentTestsAllowed: false,
    developmentValidatorsAllowed: false,
    releaseFinalValidationRequired: false,
    verificationPolicy: PLAN_GRAPH_TASK_FINAL_ONLY_VERIFICATION_POLICY,
    minMemoryEntries: 1,
    minRelevantMemoryEntries: 1,
    minTrustedReceipts: 1,
    minHostAgentReceipts: 1,
    minAgentInvocations: 1,
    policy: "Plan, graph, and task development work must schedule no tests or validators; all verification is deferred to the final release gate.",
  }),
  release: Object.freeze({
    id: "release",
    label: "Release Gate",
    scope: "phase-or-release-gate",
    activeGraphRequired: true,
    requireActiveReview: true,
    releaseFullCheckRequired: true,
    targetedOnly: false,
    fullSuiteAllowed: true,
    finalOnlyVerification: true,
    developmentTestsAllowed: false,
    developmentValidatorsAllowed: false,
    releaseFinalValidationRequired: true,
    verificationPolicy: PLAN_GRAPH_TASK_FINAL_ONLY_VERIFICATION_POLICY,
    minMemoryEntries: 5,
    minRelevantMemoryEntries: 1,
    minTrustedReceipts: 1,
    minHostAgentReceipts: 1,
    minAgentInvocations: 1,
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
    collectIndexEvidence(resolvedRoot),
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
    return Number(entry.confidence || 0) >= 9 && MEMORY_TAG_RE.test(tags);
  });
  const pass = entries.length >= profile.minMemoryEntries && relevant.length >= profile.minRelevantMemoryEntries;
  return {
    pass,
    summary: `entries=${entries.length}/${profile.minMemoryEntries}, relevantHighConfidence=${relevant.length}/${profile.minRelevantMemoryEntries}`,
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

async function collectIndexEvidence(rootDir) {
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
    const noStale = missingOrStale === 0;
    return {
      rag: {
        pass: sourceReady && noStale,
        summary: `source=${gate.indexedSourceFiles || 0}/${gate.eligibleSourceFiles || 0}, missingOrStale=${missingOrStale ?? "unknown"}, failed=${workflowFailedCodes.join(",") || "none"}`,
        details: { gate, missing },
        nextAction: sourceReady && noStale ? null : "Refresh source RAG with build-code-index --source-only and confirm source health has no missing, stale, or content-changed source rows.",
      },
      codegraph: {
        pass: graphReady && noStale,
        summary: `ready=${graphReady}, missingOrStale=${missingOrStale ?? "unknown"}, warnings=${warningCodes.join(",") || "none"}`,
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
  const pass = workflowReceipts.pass === true
    && agentReceipts.pass === true
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
  const currentGraph = (taskGraph.dimensions || []).find((item) => item.id === "current-graph");
  const pass = taskGraph.pass === true
    && sourceSnapshot?.pass === true
    && strictEvidence?.pass === true
    && (!profile.activeGraphRequired || currentGraph?.pass === true);
  return {
    pass,
    summary: `taskGraph=${taskGraph.score}/10, activeRequired=${profile.activeGraphRequired}, sourceSnapshot=${sourceSnapshot?.pass === true}, strictEvidence=${strictEvidence?.pass === true}`,
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
  const fanoutPolicy = collectMandatoryFanoutPolicyEvidence(rootDir);
  const pass = commandAgent.pass === true
    && routing?.pass === true
    && commandShortcuts?.pass === true
    && fanoutPolicy.pass === true;
  return {
    pass,
    summary: `commandAgent=${commandAgent.pass === true}, routing=${routing?.pass === true}, commandShortcuts=${commandShortcuts?.pass === true}, mandatoryFanout=${fanoutPolicy.pass === true}`,
    details: { commandAgent, routing, commandShortcuts, fanoutPolicy },
    nextAction: pass
      ? null
      : fanoutPolicy.pass !== true
        ? fanoutPolicy.nextAction
        : "Repair command-agent enforcement, trigger routing, or command shortcut routing before 10/10 workflow-logic claims.",
  };
}

function collectMandatoryFanoutPolicyEvidence(rootDir) {
  const contractSource = readOptional(join(rootDir, "scripts", "lib", "command-agent-orchestration-contract.mjs"));
  const catalogSource = readOptional(join(rootDir, "scripts", "lib", "supervibe-command-catalog.mjs"));
  const workflowRouterSource = readOptional(join(rootDir, "scripts", "lib", "supervibe-workflow-router.mjs"));
  const triggerRouterSource = readOptional(join(rootDir, "scripts", "lib", "supervibe-trigger-router.mjs"));
  const checks = [
    ["contract-agent-fanout", /agentFanoutPolicy/.test(contractSource) && /minParallelAgents:\s*2/.test(contractSource)],
    ["compact-fanout", /requiredAfterContextCompaction:\s*true/.test(contractSource) && contractSource.includes("after compact/resume/context transition")],
    ["simple-task-fanout", /requiredForSimpleTasks:\s*true/.test(contractSource) && /simple or low-risk tasks still require/.test(contractSource)],
    ["catalog-parallel-policy", /COMMAND_PARALLEL_AGENT_LAUNCH_POLICY/.test(catalogSource) && /PARALLEL_AGENT_SIMPLE_TASKS/.test(catalogSource)],
    ["workflow-router-agent-wave", /agentWavePolicy/.test(workflowRouterSource) && /requiredForSimpleTasks/.test(workflowRouterSource)],
    ["resume-dispatch-route", /--resume-dispatch/.test(triggerRouterSource)],
  ];
  const failed = checks.filter(([, pass]) => !pass).map(([id]) => id);
  const pass = failed.length === 0;
  return {
    pass,
    summary: `fanoutChecks=${checks.length - failed.length}/${checks.length}, failed=${failed.join(",") || "none"}`,
    failed,
    evidencePaths: [
      "scripts/lib/command-agent-orchestration-contract.mjs",
      "scripts/lib/supervibe-command-catalog.mjs",
      "scripts/lib/supervibe-workflow-router.mjs",
      "scripts/lib/supervibe-trigger-router.mjs",
    ],
    nextAction: pass ? null : "Restore mandatory real parallel-agent fan-out for compact continuation and simple workflow tasks.",
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
  const releaseEvidence = findReleaseFullCheckEvidence(rootDir);
  const pass = finalOnlyPolicy.pass === true
    && schedulerReleaseBoundaryPresent
    && (!profile.releaseFullCheckRequired || releaseEvidence.length > 0);
  return {
    pass,
    summary: `profile=${profile.id}, finalOnlyPolicy=${finalOnlyPolicy.pass === true}, developmentTestsAllowed=${profile.developmentTestsAllowed === true}, developmentValidatorsAllowed=${profile.developmentValidatorsAllowed === true}, releaseFinalRequired=${profile.releaseFinalValidationRequired === true}, schedulerReleaseBoundary=${schedulerReleaseBoundaryPresent}, releaseFullCheckEvidence=${releaseEvidence.length}`,
    details: {
      profile,
      finalOnlyPolicy,
      releaseEvidence: releaseEvidence.slice(0, 8),
      evidencePaths: ["scripts/lib/supervibe-workflow-readiness-model.mjs", "scripts/command-agent-plan.mjs", "scripts/supervibe-loop.mjs"],
    },
    nextAction: pass
      ? null
      : finalOnlyPolicy.pass !== true
        ? finalOnlyPolicy.nextAction
        : profile.releaseFullCheckRequired
          ? "Run the release full-check gate once and record passing graph-level evidence before release readiness."
          : "Restore plan/graph/task final-only verification policy and release-bound scheduler signals.",
  };
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
