import { existsSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import {
  evaluatePrototypeTransition,
} from "./design-flow-state.mjs";
import {
  evaluateDesignQualityGate,
} from "./design-quality-gate-aggregator.mjs";
import {
  artifactRoot,
} from "./supervibe-artifact-roots.mjs";
import {
  buildPostStageContinuation,
} from "./supervibe-stage-state.mjs";
import {
  validateWorkflowReceipts,
} from "./supervibe-workflow-receipt-runtime.mjs";

const READY_PROTOTYPE_STAGES = Object.freeze([
  "stage-3-screen-spec",
  "stage-4-copy",
  "stage-5-prototype-build",
  "stage-6-polish-review",
  "stage-6-a11y-review",
  "stage-7-quality-gate",
]);

export function buildDesignPrototypeStageTriage(existing = {}, {
  mode = "full-prototype-pipeline",
  reason = "design-system approved; prototype phase ready",
} = {}) {
  const next = { ...(existing || {}) };
  for (const stage of READY_PROTOTYPE_STAGES) {
    const current = next[stage];
    if (current && typeof current === "object" && !["skipped", "N/A", "n/a"].includes(String(current.status || ""))) {
      continue;
    }
    next[stage] = {
      status: mode === "design-system-only" ? "available" : "ready",
      reason,
    };
  }
  return next;
}

export function readDesignWorkflowStatus(rootDir = process.cwd(), {
  slug = "",
} = {}) {
  const prototypesRoot = artifactRoot(rootDir, "prototypes");
  const designSystemRoot = join(prototypesRoot, "_design-system");
  const prototypeRoot = slug ? join(prototypesRoot, slug) : null;
  const config = prototypeRoot ? readJson(join(prototypeRoot, "config.json")) : null;
  const flow = readJson(join(designSystemRoot, "design-flow-state.json"));
  const transition = evaluatePrototypeTransition(rootDir);
  const prototypeArtifacts = prototypeRoot ? {
    index: existsSync(join(prototypeRoot, "index.html")),
    spec: existsSync(join(prototypeRoot, "spec.md")),
    copy: existsSync(join(prototypeRoot, "content", "copy.md")),
    approval: existsSync(join(prototypeRoot, ".approval.json")),
    handoff: existsSync(join(prototypeRoot, "handoff")),
  } : {};
  const prototypeExists = Boolean(prototypeArtifacts.index);
  const prototypeApproval = prototypeRoot ? readJson(join(prototypeRoot, ".approval.json")) : null;
  const prototypeApproved = normalizeStatus(prototypeApproval?.status) === "approved";
  const receiptValidation = validateWorkflowReceipts(rootDir);
  const qualityGate = prototypeRoot
    ? evaluateDesignQualityGate(rootDir, { slug, requireReviews: prototypeApproved, receiptValidation })
    : null;
  const stateConsistency = validateDesignWorkflowStateConsistency(rootDir, { slug, config, flow, prototypeArtifacts, prototypeApproval });
  const designSystemStatus = normalizeStatus(flow?.design_system?.status || readJson(join(designSystemRoot, "manifest.json"))?.status);
  const mode = config?.mode || config?.executionMode || null;
  const prototypeUnlocked = transition.allowed === true;
  const handoffBlocked = !prototypeApproved || qualityGate?.approvalAllowed === false || stateConsistency.pass === false;
  const blockedReason = handoffBlocked
    ? handoffBlockedReason({ prototypeApproved, qualityGate, stateConsistency })
    : null;
  const lifecycleStage = !designSystemStatus || designSystemStatus !== "approved"
    ? "candidate DS"
    : !prototypeExists
      ? "prototype missing"
      : !prototypeApproved
        ? "prototype draft"
        : "handoff ready";
  const nextAction = designSystemStatus === "approved" && !prototypeExists
    ? "Build prototype / revise DS / stop"
    : prototypeExists && !prototypeApproved
      ? "Review prototype / revise prototype / approve / stop"
      : prototypeApproved
        ? "Package handoff"
        : "Review design system";
  const continuation = buildDesignContinuation({
    designSystemStatus,
    mode,
    prototypeUnlocked,
    prototypeExists,
    prototypeApproved,
    handoffReason: blockedReason,
  });

  return {
    schemaVersion: 1,
    slug: slug || null,
    mode,
    lifecycleStage,
    designSystem: {
      status: designSystemStatus || "missing",
      approved: designSystemStatus === "approved",
      path: rel(rootDir, designSystemRoot),
    },
    prototype: {
      unlocked: prototypeUnlocked,
      exists: prototypeExists,
      approved: prototypeApproved,
      artifacts: prototypeArtifacts,
      transitionCode: transition.code,
      transitionReason: transition.reason,
      path: prototypeRoot ? rel(rootDir, prototypeRoot) : null,
      nextQuestion: prototypeUnlocked && !prototypeExists ? prototypeInteractionDepthQuestion() : null,
    },
    handoff: {
      blocked: handoffBlocked,
      reason: blockedReason,
    },
    qualityGate,
    stateConsistency,
    receipts: {
      pass: receiptValidation.pass === true,
      checked: receiptValidation.checked,
      receipts: receiptValidation.receipts,
      issues: receiptValidation.issues,
    },
    nextAction,
    nextUserActions: continuation.nextUserActions,
    continuation,
    stageTriage: config?.stageTriage || {},
    recommendedStageTriage: prototypeUnlocked && !prototypeExists
      ? buildDesignPrototypeStageTriage(config?.stageTriage, { mode: mode || "full-prototype-pipeline" })
      : null,
  };
}

function validateDesignWorkflowStateConsistency(rootDir = process.cwd(), {
  slug = "",
  config = null,
  flow = null,
  prototypeArtifacts = null,
  prototypeApproval = null,
} = {}) {
  const issues = [];
  const prototypesRoot = artifactRoot(rootDir, "prototypes");
  const prototypeRoot = slug ? join(prototypesRoot, slug) : null;
  const actualArtifacts = prototypeArtifacts || (prototypeRoot ? {
    index: existsSync(join(prototypeRoot, "index.html")),
    approval: existsSync(join(prototypeRoot, ".approval.json")),
  } : {});
  const actualPrototypeExists = Boolean(actualArtifacts.index);
  const approval = prototypeApproval || (prototypeRoot ? readJson(join(prototypeRoot, ".approval.json")) : null);
  const approved = normalizeStatus(approval?.status) === "approved";
  const mode = config?.mode || config?.executionMode || null;

  if (config && actualPrototypeExists && config.prototypeExists === false) {
    issues.push(stateIssue("config-prototype-exists-drift", "blocker", "config.json prototypeExists=false but index.html exists"));
  }
  if (config && !actualPrototypeExists && config.prototypeExists === true) {
    issues.push(stateIssue("config-prototype-missing-drift", "high", "config.json prototypeExists=true but index.html is missing"));
  }
  if (actualPrototypeExists && mode === "design-system-only") {
    issues.push(stateIssue("config-mode-prototype-drift", "high", "config.json mode=design-system-only but prototype index.html exists"));
  }
  if (actualPrototypeExists && config?.stageTriage?.["stage-5-prototype-build"]?.status === "skipped") {
    issues.push(stateIssue("config-stage-triage-prototype-drift", "high", "stage-5-prototype-build is skipped while index.html exists"));
  }
  if (approved && normalizeStatus(config?.status) !== "approved") {
    issues.push(stateIssue("config-approval-status-drift", "high", ".approval.json is approved but config.json status is not approved"));
  }
  if (actualPrototypeExists && normalizeStatus(flow?.prototype?.requested) === "blocked") {
    issues.push(stateIssue("flow-prototype-requested-drift", "high", "design-flow-state prototype.requested=BLOCKED while index.html exists"));
  }

  return {
    schemaVersion: 1,
    pass: !issues.some((issue) => issue.severity === "blocker" || issue.severity === "high"),
    stale: issues.length > 0,
    issues,
  };
}

export function formatDesignWorkflowStatus(status = {}) {
  const lines = [
    "SUPERVIBE_DESIGN_STATUS",
    `SLUG: ${status.slug || "none"}`,
    `MODE: ${status.mode || "unknown"}`,
    `LIFECYCLE_STAGE: ${status.lifecycleStage || "unknown"}`,
    `DESIGN_SYSTEM: ${status.designSystem?.status || "missing"}`,
    `PROTOTYPE_UNLOCKED: ${status.prototype?.unlocked === true}`,
    `PROTOTYPE_EXISTS: ${status.prototype?.exists === true}`,
    `PROTOTYPE_APPROVED: ${status.prototype?.approved === true}`,
    `HANDOFF_BLOCKED: ${status.handoff?.blocked === true}`,
    `HANDOFF_REASON: ${status.handoff?.reason || "none"}`,
    `STATE_CONSISTENCY_PASS: ${status.stateConsistency?.pass !== false}`,
    `STALE_STATE: ${status.stateConsistency?.stale === true}`,
    `RECEIPTS_PASS: ${status.receipts?.pass === true}`,
    `TRUSTED_RECEIPTS: ${status.receipts?.receipts ?? 0}`,
    `QUALITY_GATE_PASS: ${status.qualityGate?.pass !== false}`,
    `QUALITY_BLOCKERS: ${status.qualityGate?.blockerCount ?? 0}`,
    `QUALITY_HIGH: ${status.qualityGate?.highCount ?? 0}`,
    `QUALITY_CONFIDENCE: ${status.qualityGate?.confidence?.score ?? "unknown"}`,
    `NEXT_ACTION: ${status.nextAction || "none"}`,
    `NEXT_QUESTION: ${status.prototype?.nextQuestion?.id || "none"}`,
  ];
  for (const issue of status.stateConsistency?.issues || []) {
    lines.push(`STATE_ISSUE: ${issue.severity} ${issue.code} - ${issue.message}`);
  }
  for (const issue of status.qualityGate?.issues || []) {
    lines.push(`QUALITY_ISSUE: ${issue.severity} ${issue.file}:${issue.line || 0} ${issue.message}`);
  }
  if (status.nextUserActions?.length) {
    lines.push("NEXT_USER_ACTIONS:");
    for (const action of status.nextUserActions) {
      const detail = action.unlocks?.length
        ? ` unlocks=${action.unlocks.join(",")}`
        : action.asks?.length
          ? ` asks=${action.asks.join(",")}`
          : action.uses?.length
            ? ` uses=${action.uses.join(",")}`
            : "";
      lines.push(`- ${action.id}: ${action.label}${detail}`);
    }
  }
  if (status.recommendedStageTriage) {
    lines.push("READY_STAGES:");
    for (const [stage, value] of Object.entries(status.recommendedStageTriage)) {
      lines.push(`- ${stage}: ${typeof value === "object" ? value.status : value}`);
    }
  }
  return lines.join("\n");
}

function buildDesignContinuation({
  designSystemStatus,
  mode,
  prototypeUnlocked,
  prototypeExists,
  prototypeApproved,
  handoffReason,
} = {}) {
  if (designSystemStatus !== "approved") {
    return buildPostStageContinuation({
      workflow: "/supervibe-design",
      currentStage: "candidate_design_system",
      artifact: ".supervibe/artifacts/prototypes/_design-system/styleboard.html",
      status: "review_required",
      mode,
      prototypeUnlocked: false,
      handoffBlockedReason: "prototype unlock requires approved design system and required section approvals",
    });
  }
  if (!prototypeExists) {
    return buildPostStageContinuation({
      workflow: "/supervibe-design",
      currentStage: "approved_design_system",
      artifact: ".supervibe/artifacts/prototypes/_design-system/design-flow-state.json",
      status: "approved",
      mode,
      prototypeUnlocked,
      handoffBlockedReason: handoffReason,
    });
  }
  if (!prototypeApproved) {
    return buildPostStageContinuation({
      workflow: "/supervibe-design",
      currentStage: "prototype_review",
      artifact: ".supervibe/artifacts/prototypes/<slug>/index.html",
      status: "review_required",
      mode,
      prototypeUnlocked,
      handoffBlockedReason: handoffReason,
    });
  }
  return buildPostStageContinuation({
    workflow: "/supervibe-design",
    currentStage: "prototype_approved",
    artifact: ".supervibe/artifacts/prototypes/<slug>/.approval.json",
    status: prototypeApproved ? "approved" : "review_required",
    mode,
    prototypeUnlocked,
    handoffBlockedReason: handoffReason,
  });
}

function handoffBlockedReason({ prototypeApproved, qualityGate, stateConsistency } = {}) {
  if (stateConsistency?.pass === false) return "workflow state is stale; sync config.json/design-flow-state before approval or handoff";
  if (qualityGate?.approvalAllowed === false) return "quality gate blocks prototype approval because reviews contain BLOCKER/high findings";
  if (!prototypeApproved) return "handoff requires approved prototype, not only approved design system";
  return null;
}

function stateIssue(code, severity, message) {
  return { code, severity, message };
}

function prototypeInteractionDepthQuestion() {
  return {
    id: "prototype_interaction_depth",
    prompt: "Choose prototype interaction depth before build.",
    choices: [
      { id: "static-key-screens", label: "Static key screens", tradeoff: "Fastest visual proof; limited interaction coverage." },
      { id: "clickable-flow", label: "Clickable flow", tradeoff: "Best default for approval; covers navigation and primary actions." },
      { id: "stateful-demo", label: "Stateful demo", tradeoff: "Highest confidence for desktop apps; takes longer to implement and review." },
    ],
  };
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function normalizeStatus(value) {
  return String(value ?? "").trim().toLowerCase().replaceAll("_", "-");
}

function rel(rootDir, path) {
  return String(relative(rootDir, path)).split(sep).join("/");
}
