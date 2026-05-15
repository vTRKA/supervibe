import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_STALE_SOURCE_DETAIL_LIMIT,
  buildCodeIndexStaleSourceExplanation,
  formatCodeIndexStaleSourceExplanation,
} from "../scripts/lib/code-index-health-status.mjs";
import {
  COMMAND_AGENT_ROUTING_EXPLANATION_FIELDS,
  COMMAND_AGENT_ROUTING_SIGNAL_FIELDS,
  COMMAND_AGENT_ROUTING_SIGNAL_INVENTORY,
  buildCommandAgentRoutingExplanation,
  formatCommandAgentRoutingExplanation,
  getCommandAgentRoutingSignal,
  listCommandAgentRoutingSignals,
  resolveCommandAgentRoutingSignalInventory,
} from "../scripts/lib/command-agent-orchestration-contract.mjs";
import {
  HOST_NEUTRAL_CAPABILITY_NAMES as AGENT_HOST_NEUTRAL_CAPABILITY_NAMES,
  normalizeCapabilityNames,
} from "../scripts/lib/supervibe-agent-capability-registry.mjs";
import {
  HOST_NEUTRAL_CAPABILITY_NAMES as HOST_CAPABILITY_NAMES,
  getHostNeutralCapabilityDefinitions,
  normalizeHostCapabilities,
  normalizeHostCapabilityName,
} from "../scripts/lib/supervibe-capability-registry.mjs";
import {
  formatCodeGraphImpactSummary,
  summarizeCodeGraphQueryOutput,
} from "../scripts/lib/supervibe-codegraph-context.mjs";
import {
  DEFAULT_PUBLIC_FIELD_ALLOWLIST as FACADE_DEFAULT_PUBLIC_FIELD_ALLOWLIST,
  DEFAULT_REDACTION_PATTERNS as FACADE_DEFAULT_REDACTION_PATTERNS,
  FACADE_OPERATION_IDS,
  SUPERVIBE_FACADE_OPERATIONS,
  SUPERVIBE_FACADE_REDACTION,
  classifyRedactionRisk as classifyFacadeRedactionRisk,
  redactFacadePayload as redactFacadeContractPayload,
  redactSensitiveValue as redactFacadeSensitiveValue,
} from "../scripts/lib/supervibe-facade-contract.mjs";
import {
  BLOCKER_PRIORITY,
  BLOCKER_PRIORITY_ORDER,
  compareBlockers,
  explainTopBlocker,
  getHiddenBlockers,
  getHiddenLowerPriorityBlockers,
  normalizeBlocker,
  normalizeBlockerClass,
  normalizeBlockers,
  resolveBlockerPriority,
  selectTopBlocker,
} from "../scripts/lib/supervibe-next-action-engine.mjs";
import {
  DEFAULT_PUBLIC_FIELD_ALLOWLIST,
  DEFAULT_REDACTION_PATTERNS,
  REDACTION_PLACEHOLDERS,
  classifyRedactionRisk,
  redactFacadePayload,
  redactSensitiveValue,
} from "../scripts/lib/supervibe-output-redaction.mjs";
import {
  TRIGGER_INTENT_NEGATIVE_CORPUS,
  getTriggerIntentNegativeCorpus,
  validateTriggerIntentNegativeCorpus,
} from "../scripts/lib/supervibe-trigger-intent-corpus.mjs";
import {
  buildBlastRadiusSummary,
  formatBlastRadiusReviewPacket,
  formatBlastRadiusSummary,
  summarizeBlastRadius,
} from "../scripts/lib/supervibe-blast-radius-summary.mjs";
import {
  HOST_READINESS_HOST_IDS,
  HOST_READINESS_SCHEMA_VERSION,
  buildHostReadinessMatrix,
  buildHostReadinessRow,
  formatHostReadinessMatrixMarkdown,
  validateHostReadinessMatrix,
} from "../scripts/lib/supervibe-host-readiness-matrix.mjs";
import {
  OUTCOME_LEARNING_SCHEMA_VERSION,
  OUTCOME_LOG_ALLOWLIST_FIELDS,
  OUTCOME_RECOMMENDATION_KIND,
  OUTCOME_RECORD_KIND,
  OUTCOME_STATUSES,
  OUTCOME_SUMMARY_KIND,
  buildOutcomeRecommendationSignals,
  createOutcomeRecord,
  normalizeOutcomeRecord,
  parseOutcomeRecordLine,
  redactOutcomeText,
  serializeOutcomeRecord,
  summarizeOutcomeRecords,
  validateOutcomeRecord,
} from "../scripts/lib/supervibe-outcome-learning.mjs";

test("public helper contract exports remain reachable", () => {
  const exportsUnderContract = [
    DEFAULT_STALE_SOURCE_DETAIL_LIMIT,
    buildCodeIndexStaleSourceExplanation,
    formatCodeIndexStaleSourceExplanation,
    COMMAND_AGENT_ROUTING_EXPLANATION_FIELDS,
    COMMAND_AGENT_ROUTING_SIGNAL_FIELDS,
    COMMAND_AGENT_ROUTING_SIGNAL_INVENTORY,
    buildCommandAgentRoutingExplanation,
    formatCommandAgentRoutingExplanation,
    getCommandAgentRoutingSignal,
    listCommandAgentRoutingSignals,
    resolveCommandAgentRoutingSignalInventory,
    AGENT_HOST_NEUTRAL_CAPABILITY_NAMES,
    normalizeCapabilityNames,
    HOST_CAPABILITY_NAMES,
    getHostNeutralCapabilityDefinitions,
    normalizeHostCapabilities,
    normalizeHostCapabilityName,
    formatCodeGraphImpactSummary,
    summarizeCodeGraphQueryOutput,
    FACADE_DEFAULT_PUBLIC_FIELD_ALLOWLIST,
    FACADE_DEFAULT_REDACTION_PATTERNS,
    FACADE_OPERATION_IDS,
    SUPERVIBE_FACADE_OPERATIONS,
    SUPERVIBE_FACADE_REDACTION,
    classifyFacadeRedactionRisk,
    redactFacadeContractPayload,
    redactFacadeSensitiveValue,
    BLOCKER_PRIORITY,
    BLOCKER_PRIORITY_ORDER,
    compareBlockers,
    explainTopBlocker,
    getHiddenBlockers,
    getHiddenLowerPriorityBlockers,
    normalizeBlocker,
    normalizeBlockerClass,
    normalizeBlockers,
    resolveBlockerPriority,
    selectTopBlocker,
    DEFAULT_PUBLIC_FIELD_ALLOWLIST,
    DEFAULT_REDACTION_PATTERNS,
    REDACTION_PLACEHOLDERS,
    classifyRedactionRisk,
    redactFacadePayload,
    redactSensitiveValue,
    TRIGGER_INTENT_NEGATIVE_CORPUS,
    getTriggerIntentNegativeCorpus,
    validateTriggerIntentNegativeCorpus,
    buildBlastRadiusSummary,
    formatBlastRadiusReviewPacket,
    formatBlastRadiusSummary,
    summarizeBlastRadius,
    HOST_READINESS_HOST_IDS,
    HOST_READINESS_SCHEMA_VERSION,
    buildHostReadinessMatrix,
    buildHostReadinessRow,
    formatHostReadinessMatrixMarkdown,
    validateHostReadinessMatrix,
    OUTCOME_LEARNING_SCHEMA_VERSION,
    OUTCOME_LOG_ALLOWLIST_FIELDS,
    OUTCOME_RECOMMENDATION_KIND,
    OUTCOME_RECORD_KIND,
    OUTCOME_STATUSES,
    OUTCOME_SUMMARY_KIND,
    buildOutcomeRecommendationSignals,
    createOutcomeRecord,
    normalizeOutcomeRecord,
    parseOutcomeRecordLine,
    redactOutcomeText,
    serializeOutcomeRecord,
    summarizeOutcomeRecords,
    validateOutcomeRecord,
  ];

  assert.equal(exportsUnderContract.some((item) => item === undefined), false);
});

test("public helper contracts keep deterministic smoke behavior", () => {
  const blocker = normalizeBlocker("missing receipt proof");
  assert.equal(blocker.blockerClass, "missing-receipt");
  assert.equal(selectTopBlocker(["optional cleanup", "broken state"]).blockerClass, "broken-state");
  assert.equal(getHiddenLowerPriorityBlockers(["broken state", "optional cleanup"]).length, 1);
  assert.equal(getHiddenBlockers(["broken state", "optional cleanup"]).length, 1);
  assert.match(explainTopBlocker(blocker, [blocker]), /missing-receipt/);
  assert.equal(resolveBlockerPriority(["stale index"]).topBlocker.blockerClass, "stale-index");
  assert.equal(normalizeBlockerClass("codegraph-stale"), "stale-index");

  const redacted = redactFacadePayload({ token: "sk-abcdef1234567890" });
  assert.equal(redacted.metadata.status, "redacted");
  assert.equal(redactSensitiveValue("Bearer abcdefghijklmnop"), "Bearer [REDACTED_SECRET]");
  assert.equal(classifyRedactionRisk("C:/Users/name/.codex/config.toml").riskClass, "provider-config-path");

  const blast = buildBlastRadiusSummary({ changedFiles: ["scripts/example.mjs"], confidence: 9 });
  assert.match(formatBlastRadiusSummary(blast), /SUPERVIBE_BLAST_RADIUS_SUMMARY/);
  assert.match(formatBlastRadiusReviewPacket(blast), /Blast radius:/);
  assert.equal(summarizeBlastRadius({ changedFiles: ["scripts/example.mjs"] }).kind, "supervibe-blast-radius-summary");

  const outcome = createOutcomeRecord({ commandId: "/supervibe-test", status: "success", outcome: "passed" }, { timestamp: "2026-05-15T00:00:00.000Z" });
  assert.equal(validateOutcomeRecord(outcome).valid, true);
  assert.equal(normalizeOutcomeRecord(outcome).kind, OUTCOME_RECORD_KIND);
  assert.equal(parseOutcomeRecordLine(serializeOutcomeRecord(outcome)).recordId, outcome.recordId);
  assert.equal(summarizeOutcomeRecords([outcome]).kind, OUTCOME_SUMMARY_KIND);
  assert.equal(buildOutcomeRecommendationSignals([outcome], { commandId: "/supervibe-test" }).kind, OUTCOME_RECOMMENDATION_KIND);
  assert.equal(redactOutcomeText("token=sk-abcdef1234567890"), "token=[redacted-secret]");

  assert.equal(validateTriggerIntentNegativeCorpus(getTriggerIntentNegativeCorpus()).pass, true);
  assert.equal(listCommandAgentRoutingSignals().length >= COMMAND_AGENT_ROUTING_SIGNAL_INVENTORY.length, true);
  assert.equal(getCommandAgentRoutingSignal(COMMAND_AGENT_ROUTING_SIGNAL_INVENTORY[0].signalId).signalId, COMMAND_AGENT_ROUTING_SIGNAL_INVENTORY[0].signalId);
  assert.equal(resolveCommandAgentRoutingSignalInventory({}).signals.length > 0, true);
  assert.match(formatCommandAgentRoutingExplanation(buildCommandAgentRoutingExplanation({ commandId: "/supervibe-test", signals: [] })), /SUPERVIBE_COMMAND_AGENT_ROUTING_EXPLANATION/);

  assert.equal(getHostNeutralCapabilityDefinitions().length > 0, true);
  assert.equal(Array.isArray(normalizeCapabilityNames(["planning"])), true);
  assert.equal(normalizeHostCapabilityName("context7-mcp"), "context7");
  assert.deepEqual(normalizeHostCapabilities(["context7-mcp"]), ["context7"]);
  assert.match(formatCodeGraphImpactSummary(summarizeCodeGraphQueryOutput({ rows: [{ path: "scripts/example.mjs", name: "example" }] })), /queryType=impact/);

  assert.equal(HOST_READINESS_SCHEMA_VERSION, 1);
  assert.equal(HOST_READINESS_HOST_IDS.includes("codex"), true);
  assert.equal(typeof buildHostReadinessMatrix, "function");
  assert.equal(typeof buildHostReadinessRow, "function");
  assert.equal(typeof formatHostReadinessMatrixMarkdown, "function");
  assert.equal(typeof validateHostReadinessMatrix, "function");
});
