export const PRESET_NAMES = Object.freeze([
  "implementation worker",
  "integration worker",
  "UI worker",
  "refactor worker",
  "docs worker",
  "release-prep worker",
  "security reviewer",
  "architecture reviewer",
  "verification reviewer",
  "product reviewer",
]);

const WORKER_PRESETS = Object.freeze({
  implementation: worker("implementation worker", "stack-developer", ["task", "contracts", "targetFiles", "verification"], ["repository-local"], ["focused tests"], ["provider bypass", "raw secret logging"]),
  integration: worker("integration worker", "stack-developer", ["task", "contracts", "targetFiles", "accessGates", "verification"], ["repository-local", "integration fixtures"], ["integration evidence or blocked access gate"], ["provider bypass", "unapproved remote mutation"]),
  design: worker("UI worker", "ux-ui-designer", ["task", "designRefs", "targetFiles", "browserEvidence"], ["ui files", "prototype files"], ["browser or preview evidence"], ["unverified visual claims", "provider bypass"]),
  refactor: worker("refactor worker", "refactoring-specialist", ["task", "codeGraph", "semanticAnchors", "contracts", "verification"], ["declared write set only"], ["caller/callee or anchor drift evidence"], ["public API drift without evidence", "provider bypass"]),
  documentation: worker("docs worker", "stack-developer", ["task", "docs", "verification"], ["docs"], ["docs validation"], ["invented facts", "provider bypass"]),
  release: worker("release-prep worker", "devops-sre", ["task", "releaseAudits", "verification"], ["release docs", "audit artifacts"], ["npm run check", "release security audit"], ["production deploy", "credential mutation"]),
});

const REVIEWER_PRESETS = Object.freeze({
  security: reviewer("security reviewer", "security-auditor", ["security evidence", "policy boundaries"]),
  architecture: reviewer("architecture reviewer", "architect-reviewer", ["contract evidence", "blast radius"]),
  verification: reviewer("verification reviewer", "quality-gate-reviewer", ["test output", "score evidence"]),
  product: reviewer("product reviewer", "product-manager", ["acceptance criteria", "user impact"]),
});

export function selectWorkerPreset(task = {}) {
  const text = `${task.category || ""} ${task.goal || ""}`.toLowerCase();
  if (/release|package|publish/.test(text)) return WORKER_PRESETS.release;
  if (/refactor|rename|move/.test(text)) return WORKER_PRESETS.refactor;
  if (/ui|browser|component|design/.test(text)) return WORKER_PRESETS.design;
  if (/integration|api|mcp|external/.test(text)) return WORKER_PRESETS.integration;
  if (/doc|readme/.test(text)) return WORKER_PRESETS.documentation;
  return WORKER_PRESETS.implementation;
}

export function selectReviewerPreset({ task = {}, workerAgentId = null } = {}) {
  const text = `${task.category || ""} ${task.goal || ""}`.toLowerCase();
  let preset = /security|credential|policy/.test(text) || task.policyRiskLevel === "high"
    ? REVIEWER_PRESETS.security
    : /architecture|refactor|contract/.test(text)
      ? REVIEWER_PRESETS.architecture
      : /product|acceptance|docs/.test(text)
        ? REVIEWER_PRESETS.product
        : REVIEWER_PRESETS.verification;
  if (preset.agentId === workerAgentId) {
    preset = preset.name === "security reviewer" ? { ...preset, agentId: "quality-gate-reviewer" } : { ...REVIEWER_PRESETS.verification };
  }
  return { ...preset, independent: preset.agentId !== workerAgentId };
}

export function validatePresetHandoff({ preset = {}, handoff = {} } = {}) {
  const required = preset.reviewHandoffFormat || ["summary", "filesTouched", "verificationEvidence", "confidenceScore"];
  const missing = required.filter((field) => {
    const value = handoff[field];
    return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
  });
  return { ok: missing.length === 0, missing };
}

export function formatPresetSummary(preset = {}) {
  return [
    "SUPERVIBE_WORKER_REVIEWER_PRESET",
    `NAME: ${preset.name || "unknown"}`,
    `AGENT: ${preset.agentId || "unknown"}`,
    `CONTEXT: ${(preset.contextPacketShape || []).join(",") || "none"}`,
    `WRITE_SCOPE: ${(preset.allowedWriteScope || []).join(",") || "none"}`,
    `EVIDENCE: ${(preset.requiredEvidence || []).join(",") || "none"}`,
  ].join("\n");
}

function worker(name, agentId, contextPacketShape, allowedWriteScope, requiredEvidence, forbiddenBehavior) {
  return {
    name,
    agentId,
    role: "worker",
    contextPacketShape,
    allowedWriteScope,
    requiredEvidence,
    forbiddenBehavior,
    reviewHandoffFormat: ["summary", "filesTouched", "verificationEvidence", "confidenceScore"],
    portable: true,
  };
}

function reviewer(name, agentId, requiredEvidence) {
  return {
    name,
    agentId,
    role: "reviewer",
    contextPacketShape: ["workerOutput", "diff", "evidence", "policy"],
    allowedWriteScope: ["review notes"],
    requiredEvidence,
    forbiddenBehavior: ["reviewing own worker output", "claiming unverified pass"],
    reviewHandoffFormat: ["summary", "openRisks", "verificationEvidence", "confidenceScore"],
    portable: true,
  };
}
