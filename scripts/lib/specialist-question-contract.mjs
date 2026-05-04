import { createHash } from "node:crypto";

const CATALOG_COPY_PATTERN = /option a|option b|recommended\/alternative|template|generic choice|choice 1|choice 2/i;

export function buildSpecialistQuestionProposal({
  schemaVersion = 1,
  proposalId = null,
  stage,
  specialist,
  question,
  why,
  choices = [],
  blocks = [],
  artifactImpact,
  skipDefault,
  canAnswerFromEvidence = false,
  evidence = [],
  decisionUnlocked = null,
  currentContext = "",
} = {}) {
  return {
    schemaVersion,
    proposalId: proposalId || `${stage || "stage"}:${specialist || "specialist"}:${questionSlug(question || "question")}`,
    stage,
    specialist,
    question,
    why,
    choices: choices.map((choice) => ({
      id: choice.id,
      label: choice.label,
      tradeoff: choice.tradeoff || choice.description || "",
    })),
    blocks: [...blocks],
    artifactImpact,
    skipDefault,
    canAnswerFromEvidence,
    evidence: [...evidence],
    decisionUnlocked,
    currentContext,
  };
}

export function validateSpecialistQuestionProposal(proposal = {}, {
  file = "specialist-question",
  requireContext = true,
  requireEvidenceDecision = true,
} = {}) {
  const issues = [];
  const label = proposal.proposalId || "unknown-proposal";
  const text = [
    proposal.question,
    proposal.why,
    proposal.artifactImpact,
    ...(proposal.choices || []).map((choice) => `${choice.label} ${choice.tradeoff || ""}`),
  ].join(" ");

  if (!proposal.stage || !proposal.specialist || !proposal.question) {
    issues.push(issue(file, "invalid-specialist-question-proposal", `${label} missing stage, specialist, or question`));
  }
  if (!proposal.why || !proposal.why.trim()) {
    issues.push(issue(file, "missing-specialist-question-why", `${label} must explain why the answer matters`));
  }
  if (!Array.isArray(proposal.choices) || proposal.choices.length < 3) {
    issues.push(issue(file, "thin-specialist-question-proposal", `${label} must include at least 3 choices`));
  }
  for (const choice of proposal.choices || []) {
    if (!choice.id || !choice.label || !(choice.tradeoff || choice.description)) {
      issues.push(issue(file, "weak-specialist-question-choice", `${label}:${choice.id || "unknown"} missing id, label, or tradeoff`));
    }
  }
  if (!Array.isArray(proposal.blocks) || proposal.blocks.length === 0 || !proposal.artifactImpact) {
    issues.push(issue(file, "missing-specialist-question-impact", `${label} must name blocked artifacts and artifact impact`));
  }
  if (!proposal.skipDefault || proposal.canAnswerFromEvidence !== false) {
    issues.push(issue(file, "missing-specialist-question-default-policy", `${label} must define skip/default behavior and avoid already-answerable questions`));
  }
  if (CATALOG_COPY_PATTERN.test(text)) {
    issues.push(issue(file, "catalog-copy-specialist-question", `${label} looks like reusable catalog copy instead of a specialist proposal`));
  }
  if (requireContext && !hasContextSignal(proposal)) {
    issues.push(issue(file, "context-free-specialist-question", `${label} must cite current brief/domain/stage context`));
  }
  if (requireEvidenceDecision && !proposal.decisionUnlocked && !proposal.artifactImpact) {
    issues.push(issue(file, "missing-specialist-question-decision", `${label} must name the artifact or decision unlocked by the answer`));
  }
  return issues;
}

export function scoreSpecialistQuestionProposal(proposal = {}, options = {}) {
  const issues = validateSpecialistQuestionProposal(proposal, options);
  const penalty = Math.min(10, issues.length * 1.5);
  return {
    score: Math.max(0, Number((10 - penalty).toFixed(1))),
    issues,
  };
}

function hasContextSignal(proposal = {}) {
  if (proposal.currentContext && String(proposal.currentContext).trim().length >= 8) return true;
  const text = [
    proposal.question,
    proposal.why,
    proposal.artifactImpact,
    proposal.decisionUnlocked,
    ...(proposal.blocks || []),
  ].join(" ");
  return /brief|domain|screen|prototype|dashboard|brand|tokens|copy|a11y|ux|repo|rules|memory|security|audit|privacy|rag|codegraph|code graph/i.test(text);
}

function questionSlug(value = "") {
  const raw = String(value || "question");
  const slug = slugify(raw);
  const asciiLetters = raw.replace(/[^\p{L}\p{N}]+/gu, "").length;
  const asciiSafeLetters = raw.replace(/[^a-z0-9]+/gi, "").length;
  const lossy = asciiLetters > 0 && asciiSafeLetters / asciiLetters < 0.8;
  if (lossy || slug === "question") return `${slug}-${sha256(raw).slice(0, 8)}`;
  return slug;
}

function slugify(value = "") {
  const slug = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "question";
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function issue(file, code, message) {
  return { file, code, message };
}
