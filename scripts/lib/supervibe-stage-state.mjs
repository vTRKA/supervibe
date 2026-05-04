export const WORKFLOW_STAGE_STATES = Object.freeze([
  "not_started",
  "needs_questions",
  "questions_answered",
  "running",
  "outputs_ready",
  "review_required",
  "approved",
  "failed_recoverable",
  "failed_blocking",
]);

export function normalizeWorkflowStageState(value = "not_started") {
  const normalized = String(value || "not_started").trim().toLowerCase().replaceAll("-", "_");
  return WORKFLOW_STAGE_STATES.includes(normalized) ? normalized : "not_started";
}

export function buildStageState({
  workflow = "unknown",
  stage = "unknown",
  status = "not_started",
  owner = null,
  artifact = null,
  evidence = [],
  updatedAt = new Date().toISOString(),
  failure = null,
} = {}) {
  const state = normalizeWorkflowStageState(status);
  return {
    schemaVersion: 1,
    workflow,
    stage,
    status: state,
    owner,
    artifact,
    evidence: Array.isArray(evidence) ? evidence : [],
    updatedAt,
    failure,
    recoverable: state === "failed_recoverable",
    blocking: state === "failed_blocking",
  };
}

export function buildPostStageContinuation({
  workflow = "unknown",
  currentStage = "unknown",
  artifact = null,
  status = "review_required",
  mode = null,
  prototypeUnlocked = null,
  handoffBlockedReason = null,
} = {}) {
  const stageStatus = normalizeWorkflowStageState(status);
  const actions = [];
  const add = (action) => actions.push(action);

  if (stageStatus === "review_required" || stageStatus === "outputs_ready") {
    add({
      id: currentStage === "candidate_design_system" ? "approve_design_system" : "approve_stage",
      label: currentStage === "candidate_design_system" ? "Approve design system" : "Approve current stage",
      unlocks: currentStage === "candidate_design_system"
        ? ["ux-ui-designer", "copywriter", "prototype-builder"]
        : ["next-stage"],
      consequences: currentStage === "candidate_design_system"
        ? "Records the candidate design system as approved and unlocks screen spec/prototype stages when required sections pass."
        : "Moves this stage to approved and unlocks the next ready stage.",
    });
    add({
      id: currentStage === "candidate_design_system" ? "revise_styleboard" : "revise_stage",
      label: currentStage === "candidate_design_system" ? "Revise styleboard" : "Revise current stage",
      asks: ["what to change", "revision depth"],
      consequences: "Keeps the stage in review and runs one focused revision before approval.",
    });
    add({
      id: "compare_alternatives",
      label: "Compare alternatives",
      uses: ["specialist alternatives"],
      consequences: "Returns to the owner specialist for explicit tradeoffs before locking the artifact.",
    });
    add({
      id: "stop",
      label: "Stop here",
      consequences: "Leaves the artifact as candidate/draft and saves state without hidden continuation.",
    });
  } else if (stageStatus === "needs_questions" || stageStatus === "not_started" || stageStatus === "questions_answered") {
    add({
      id: "answer_next_question",
      label: "Answer next question",
      consequences: "Records the missing decision before any review or approval action is offered.",
    });
    add({
      id: "continue_dispatch",
      label: "Continue required specialists",
      consequences: "Runs the next required specialist or producer for the active stage when no user answer is blocking.",
    });
    add({
      id: "resume_last_trusted",
      label: "Resume trusted stage",
      consequences: "Shows the last trusted checkpoint and continues from there.",
    });
    add({
      id: "stop",
      label: "Stop here",
      consequences: "Saves current state without hidden continuation.",
    });
  } else if (stageStatus === "approved") {
    add({
      id: prototypeUnlocked === false ? "review_unlock_requirements" : "continue_next_stage",
      label: prototypeUnlocked === false
        ? "Review unlock requirements"
        : currentStage === "approved_design_system"
          ? "Build screen spec/prototype"
          : "Continue next stage",
      consequences: prototypeUnlocked === false
        ? "Shows which approval sections or artifacts are still blocking prototype work."
        : currentStage === "approved_design_system"
          ? "Starts the UX spec, copy, prototype, and review stages from the approved design system."
          : "Continues the workflow from the last approved stage.",
    });
    add({
      id: "revise_approved_artifact",
      label: currentStage === "approved_design_system" ? "Revise design system" : "Revise approved artifact",
      consequences: "Reopens the approved artifact as needs_revision and blocks downstream handoff until reapproved.",
    });
    add({
      id: "stop",
      label: "Stop here",
      consequences: "Keeps the approved artifact and does not start more stages.",
    });
  } else if (stageStatus === "failed_recoverable" || stageStatus === "failed_blocking") {
    add({
      id: "repair_ledger",
      label: "Repair ledger",
      consequences: "Runs receipt recovery before retrying the stage.",
    });
    add({
      id: "rerun_stage",
      label: "Rerun stage",
      consequences: "Repeats the failed stage with the same inputs after recovery.",
    });
    add({
      id: "resume_last_trusted",
      label: "Resume trusted stage",
      consequences: "Continues from the last trusted receipt or approved stage.",
    });
    add({
      id: "stop",
      label: "Stop here",
      consequences: "Leaves current state unchanged for manual inspection.",
    });
  }

  return {
    schemaVersion: 1,
    workflow,
    currentStage,
    artifact,
    status: stageStatus,
    mode,
    prototypeUnlocked,
    handoffBlockedReason,
    nextUserActions: actions,
  };
}

export function formatPostStageContinuation(continuation = {}) {
  const lines = [
    "SUPERVIBE_STAGE_CONTINUATION",
    `WORKFLOW: ${continuation.workflow || "unknown"}`,
    `CURRENT_STAGE: ${continuation.currentStage || "unknown"}`,
    `ARTIFACT: ${continuation.artifact || "none"}`,
    `STATUS: ${continuation.status || "unknown"}`,
    `PROTOTYPE_UNLOCKED: ${continuation.prototypeUnlocked === true}`,
    `HANDOFF_REASON: ${continuation.handoffBlockedReason || "none"}`,
    "NEXT_USER_ACTIONS:",
  ];
  for (const action of continuation.nextUserActions || []) {
    const detail = action.unlocks?.length
      ? ` unlocks=${action.unlocks.join(",")}`
      : action.asks?.length
        ? ` asks=${action.asks.join(",")}`
        : action.uses?.length
          ? ` uses=${action.uses.join(",")}`
          : "";
    lines.push(`- ${action.id}: ${action.label}${detail} :: ${action.consequences || ""}`);
  }
  return lines.join("\n");
}
