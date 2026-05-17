const SUMMARY_ROOT = ".supervibe/artifacts/summaries";

export const WORKFLOW_SUMMARY_CONTRACT_VERSION = "workflow-summary-v2";
export const WORKFLOW_SUMMARY_ARTIFACT_SCHEMA_VERSION = 1;
export const WORKFLOW_SUMMARY_ARTIFACT_SCHEMA_PATH = "docs/templates/workflow-summary-artifact.schema.json";
export const WORKFLOW_SUMMARY_ARTIFACT_ROOT = SUMMARY_ROOT;
export const WORKFLOW_SUMMARY_APPROVAL_SOURCE = "latest-user-gate";
export const WORKFLOW_SUMMARY_HASH_ALGORITHM = "sha256";

export const WORKFLOW_SUMMARY_STAGE_CONFIG = Object.freeze({
  "pre-spec": stage({
    order: 1,
    phase: "spec-summary",
    fileName: "pre-spec-summary.json",
    title: "Pre-spec summary",
    summaryKind: "pre-artifact",
    sourceArtifactKind: "prompt",
    command: "/supervibe-brainstorm --summary-gate --stage pre-spec",
    nextRecommendedCommand: "/supervibe-brainstorm",
    approveChoiceId: "approve-pre-spec-summary",
    reviseChoiceId: "revise-pre-spec-summary",
    stopChoiceId: "stop-before-spec",
    choices: [
      ["approve-pre-spec-summary", "Approve summary for spec", "Allows the workflow to create the spec from this current prompt and summary.", true],
      ["revise-pre-spec-summary", "Revise summary", "Keeps the workflow in summary review before any spec artifact is created.", false],
      ["stop-before-spec", "Stop before spec", "Stops without creating a spec or advancing the workflow.", false],
    ],
  }),
  "post-spec": stage({
    order: 2,
    phase: "spec-post-summary",
    fileName: "post-spec-summary.json",
    title: "Post-spec summary",
    summaryKind: "post-artifact",
    sourceArtifactKind: "spec",
    command: "/supervibe-brainstorm --summary-gate --stage post-spec",
    nextRecommendedCommand: "/supervibe-plan --loop-ready --from-brainstorm <spec-path>",
    approveChoiceId: "approve-post-spec-summary",
    reviseChoiceId: "revise-spec-before-plan",
    stopChoiceId: "stop-after-spec",
    choices: [
      ["approve-post-spec-summary", "Approve spec summary and plan", "Allows the workflow to use the current spec summary as the source for planning.", true],
      ["revise-spec-before-plan", "Revise spec first", "Keeps the workflow on the spec artifact before planning starts.", false],
      ["stop-after-spec", "Stop after spec", "Stops after preserving the spec summary and next-step context.", false],
    ],
  }),
  "pre-plan": stage({
    order: 3,
    phase: "plan-summary",
    fileName: "pre-plan-summary.json",
    title: "Pre-plan summary",
    summaryKind: "pre-artifact",
    sourceArtifactKind: "approved-scope-or-spec",
    command: "/supervibe-plan --summary-gate --stage pre-plan",
    nextRecommendedCommand: "/supervibe-plan",
    approveChoiceId: "approve-pre-plan-summary",
    reviseChoiceId: "revise-pre-plan-summary",
    stopChoiceId: "stop-before-plan",
    choices: [
      ["approve-pre-plan-summary", "Approve summary for plan", "Allows the workflow to create the plan from this approved scope and summary.", true],
      ["revise-pre-plan-summary", "Revise summary", "Keeps the workflow in summary review before any plan artifact is created.", false],
      ["stop-before-plan", "Stop before plan", "Stops without creating a plan or advancing the workflow.", false],
    ],
  }),
  "post-plan": stage({
    order: 4,
    phase: "plan-post-summary",
    fileName: "post-plan-summary.json",
    title: "Post-plan summary",
    summaryKind: "post-artifact",
    sourceArtifactKind: "plan",
    command: "/supervibe-plan --summary-gate --stage post-plan",
    nextRecommendedCommand: "/supervibe-loop --atomize-plan <plan-path> --user-approved-plan",
    approveChoiceId: "approve-post-plan-summary",
    reviseChoiceId: "revise-plan-before-graph",
    stopChoiceId: "stop-after-plan",
    choices: [
      ["approve-post-plan-summary", "Approve plan summary and create graph", "Allows the workflow to atomize the user-approved loop-ready plan into graph work items.", true],
      ["revise-plan-before-graph", "Revise plan first", "Keeps the workflow on the implementation plan before graph creation.", false],
      ["stop-after-plan", "Stop after plan", "Stops after preserving the plan summary and next-step context.", false],
    ],
  }),
});

export const WORKFLOW_SUMMARY_STAGES = Object.freeze(Object.keys(WORKFLOW_SUMMARY_STAGE_CONFIG));
export const WORKFLOW_SUMMARY_POST_STAGES = Object.freeze(WORKFLOW_SUMMARY_STAGES.filter((stageName) => WORKFLOW_SUMMARY_STAGE_CONFIG[stageName].summaryKind === "post-artifact"));
export const WORKFLOW_SUMMARY_PRE_STAGES = Object.freeze(WORKFLOW_SUMMARY_STAGES.filter((stageName) => WORKFLOW_SUMMARY_STAGE_CONFIG[stageName].summaryKind === "pre-artifact"));

export const WORKFLOW_SUMMARY_RECEIPT_CATEGORIES = Object.freeze([
  "command-route",
  "summary-producer",
  "artifact-producer",
  "worker",
  "reviewer",
  "validator",
  "approval-gate",
  "final-signoff",
]);

export const WORKFLOW_SUMMARY_REQUIRED_LAYERS = Object.freeze([
  "router",
  "command-catalog",
  "command-docs",
  "skills",
  "templates",
  "schema",
  "formatter",
  "validator",
  "tests",
  "receipts",
  "final-suite",
]);

export const WORKFLOW_SUMMARY_CONFIDENCE_CAPS = Object.freeze({
  missingProjectMemory: 8,
  staleProjectMemory: 8,
  missingCodeRag: 8,
  staleCodeRag: 8,
  missingCodeGraph: 8,
  staleCodeGraph: 8,
  missingSourceHash: 8,
  staleSourceArtifact: 8,
  missingReviewerReceipt: 8,
  missingWorkflowReceipt: 8,
  missingVisualTable: 8,
  missingAsciiMap: 8,
  missingNextUserAction: 8,
  missingFinalValidation: 7,
  manualReviewerSubstitute: 7,
});

export const WORKFLOW_SUMMARY_FINAL_VALIDATION_COMMANDS = Object.freeze([
  "node scripts/supervibe-status.mjs --index-health --strict-index-health --no-gc-hints --no-color",
  "npm run validate:workflow-summary-artifacts",
  "npm run validate:plan-review-artifacts",
  "npm run validate:agent-producer-receipts",
  "npm run validate:question-discipline",
  "npm run validate:agent-skill-coverage",
  "npm run validate:agent-content-quality",
  "npm run validate:agent-section-order",
  "npm run validate:agent-tool-use-matrix",
  "npm run validate:skill-operational-contracts",
  "npm run validate:skill-content-quality",
  "npm run validate:trigger-replay",
  "npm run validate:command-agent-enforcement",
  "npm run validate:workflow-receipts",
  "npm run validate:template-quality",
  "npm run validate:workflow-logic-10of10:dev",
  "npm run check",
]);

export function workflowSummaryStageConfig(stageName) {
  const normalized = normalizeWorkflowSummaryStage(stageName);
  return WORKFLOW_SUMMARY_STAGE_CONFIG[normalized];
}

export function normalizeWorkflowSummaryStage(stageName) {
  const value = String(stageName ?? "").trim().toLowerCase().replace(/_/g, "-");
  if (["spec", "pre-spec", "before-spec", "pre-requirements"].includes(value)) return "pre-spec";
  if (["post-spec", "after-spec", "spec-summary", "after-requirements"].includes(value)) return "post-spec";
  if (["plan", "pre-plan", "before-plan"].includes(value)) return "pre-plan";
  if (["post-plan", "after-plan", "plan-summary"].includes(value)) return "post-plan";
  throw new Error(`workflow summary stage must be one of: ${WORKFLOW_SUMMARY_STAGES.join(", ")}`);
}

export function workflowSummaryStageChoices(stageName) {
  const config = workflowSummaryStageConfig(stageName);
  return config.choices.map((choice, index) => ({ ...choice, ordinal: index + 1 }));
}

export function workflowSummaryArtifactFilePattern() {
  return `(${WORKFLOW_SUMMARY_STAGES.map((stageName) => escapeRegex(WORKFLOW_SUMMARY_STAGE_CONFIG[stageName].fileName.replace(/\.json$/, ""))).join("|")})\\.json`;
}

export function workflowSummaryStageFromIntent(intent) {
  const value = String(intent || "");
  if (value === "pre_spec_summary_gate") return "pre-spec";
  if (value === "post_spec_summary_gate") return "post-spec";
  if (value === "pre_plan_summary_gate") return "pre-plan";
  if (value === "post_plan_summary_gate") return "post-plan";
  return null;
}

export function workflowSummaryIntentFromStage(stageName) {
  const stageNameNormalized = normalizeWorkflowSummaryStage(stageName);
  return `${stageNameNormalized.replace("-", "_")}_summary_gate`;
}

export function buildWorkflowSummaryContractMatrix() {
  return WORKFLOW_SUMMARY_STAGES.map((stageName) => {
    const config = WORKFLOW_SUMMARY_STAGE_CONFIG[stageName];
    return {
      stage: stageName,
      phase: config.phase,
      command: config.command,
      skill: stageName.includes("spec") ? "supervibe:brainstorming" : "supervibe:writing-plans",
      template: WORKFLOW_SUMMARY_ARTIFACT_SCHEMA_PATH,
      artifactPathPattern: `${WORKFLOW_SUMMARY_ARTIFACT_ROOT}/<workflow-id>/${config.fileName}`,
      sourceArtifactKind: config.sourceArtifactKind,
      receiptCategories: WORKFLOW_SUMMARY_RECEIPT_CATEGORIES,
      finalValidators: WORKFLOW_SUMMARY_FINAL_VALIDATION_COMMANDS,
    };
  });
}

function stage(input) {
  return Object.freeze({
    order: input.order,
    phase: input.phase,
    fileName: input.fileName,
    title: input.title,
    summaryKind: input.summaryKind,
    sourceArtifactKind: input.sourceArtifactKind,
    command: input.command,
    nextRecommendedCommand: input.nextRecommendedCommand,
    approveChoiceId: input.approveChoiceId,
    reviseChoiceId: input.reviseChoiceId,
    stopChoiceId: input.stopChoiceId,
    choices: Object.freeze(input.choices.map(([id, label, description, recommended]) => Object.freeze({ id, label, description, recommended }))),
  });
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
