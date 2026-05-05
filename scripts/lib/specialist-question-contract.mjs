import { createHash } from "node:crypto";

const CATALOG_COPY_PATTERN = /option a|option b|recommended\/alternative|template|generic choice|choice 1|choice 2/i;

export const SPECIALIST_QUESTION_SOURCES = Object.freeze({
  REAL_SPECIALIST_PROPOSAL: "real-specialist-proposal",
  FALLBACK_SEED: "fallback-seed",
  CONTROLLER_RUNTIME: "controller-runtime",
  FALLBACK_SCRATCH: "fallback-scratch",
});

export function buildSpecialistQuestionProposal({
  schemaVersion = 1,
  proposalId = null,
  axis = null,
  locale = "en",
  stage,
  specialist,
  ownerAgent = null,
  question,
  why,
  whyNow = null,
  choices = [],
  blocks = [],
  artifactImpact,
  skipDefault,
  canAnswerFromEvidence = false,
  evidence = [],
  decisionUnlocked = null,
  currentContext = "",
  multiChoice = false,
  freeformAllowed = true,
  proposalSource = SPECIALIST_QUESTION_SOURCES.CONTROLLER_RUNTIME,
  producer = null,
  visibility = "visible",
} = {}) {
  const resolvedOwnerAgent = ownerAgent || specialist;
  const normalizedChoices = choices.map((choice) => ({
    id: choice.id,
    label: choice.label,
    tradeoff: choice.tradeoff || choice.description || "",
    unlocks: Array.isArray(choice.unlocks) ? choice.unlocks : [],
    risk: choice.risk || "",
    evidence: Array.isArray(choice.evidence) ? choice.evidence : [],
    artifactImpact: choice.artifactImpact || artifactImpact || "",
    recommended: choice.recommended === true,
  }));
  const recommended = normalizedChoices.find((choice) => choice.recommended) || normalizedChoices[0] || null;
  return {
    schemaVersion,
    proposalId: proposalId || `${stage || "stage"}:${resolvedOwnerAgent || "specialist"}:${questionSlug(question || "question")}`,
    axis,
    stage,
    specialist,
    locale: normalizeLocale(locale),
    ownerAgent: resolvedOwnerAgent,
    question,
    why,
    whyNow: whyNow || why,
    choices: normalizedChoices.map(({ recommended: _recommended, ...choice }) => choice),
    options: normalizedChoices.map(({ id, label, tradeoff, unlocks, risk, evidence, artifactImpact, recommended }) => ({
      id,
      label,
      tradeoff,
      unlocks,
      risk,
      evidence,
      artifactImpact,
      recommended,
    })),
    recommendedOption: recommended?.id || null,
    freeformAllowed: freeformAllowed !== false,
    blocks: [...blocks],
    artifactImpact,
    skipDefault,
    canAnswerFromEvidence,
    evidence: [...evidence],
    decisionUnlocked,
    currentContext,
    multiChoice: multiChoice === true,
    proposalSource,
    producer: normalizeQuestionProducer(producer, { ownerAgent: resolvedOwnerAgent, proposalSource }),
    visibility,
  };
}

export function validateSpecialistQuestionProposal(proposal = {}, {
  file = "specialist-question",
  requireContext = true,
  requireEvidenceDecision = true,
  requireRealSpecialistProposal = false,
  requireDecisionUnlocked = false,
} = {}) {
  const issues = [];
  const label = proposal.proposalId || "unknown-proposal";
  const text = [
    proposal.question,
    proposal.why,
    proposal.whyNow,
    proposal.artifactImpact,
    ...(proposal.choices || []).map((choice) => `${choice.label} ${choice.tradeoff || ""}`),
  ].join(" ");

  if (!proposal.stage || !proposal.specialist || !proposal.question) {
    issues.push(issue(file, "invalid-specialist-question-proposal", `${label} missing stage, specialist, or question`));
  }
  if (!proposal.ownerAgent) {
    issues.push(issue(file, "missing-specialist-question-owner", `${label} must name ownerAgent for specialist voice and routing`));
  }
  if (!proposal.why || !proposal.why.trim()) {
    issues.push(issue(file, "missing-specialist-question-why", `${label} must explain why the answer matters`));
  }
  if (!proposal.whyNow || !proposal.whyNow.trim()) {
    issues.push(issue(file, "missing-specialist-question-why-now", `${label} must explain why this question is being asked now`));
  }
  if (!Array.isArray(proposal.choices) || proposal.choices.length < 3) {
    issues.push(issue(file, "thin-specialist-question-proposal", `${label} must include at least 3 choices`));
  }
  for (const choice of proposal.choices || []) {
    if (!choice.id || !choice.label || !(choice.tradeoff || choice.description)) {
      issues.push(issue(file, "weak-specialist-question-choice", `${label}:${choice.id || "unknown"} missing id, label, or tradeoff`));
    }
  }
  if (!Array.isArray(proposal.options) || proposal.options.length !== (proposal.choices || []).length) {
    issues.push(issue(file, "missing-specialist-question-options", `${label} must expose structured options matching choices`));
  }
  for (const option of proposal.options || []) {
    if (!Array.isArray(option.unlocks) || option.unlocks.length === 0 || !option.risk) {
      issues.push(issue(file, "weak-specialist-question-option-impact", `${label}:${option.id || "unknown"} must name unlocks and risk`));
    }
    if (!Array.isArray(option.evidence) || option.evidence.length < 2 || !option.artifactImpact) {
      issues.push(issue(file, "missing-specialist-question-option-evidence", `${label}:${option.id || "unknown"} must bind option evidence and artifact impact`));
    }
  }
  if (!proposal.recommendedOption || !(proposal.options || []).some((option) => option.id === proposal.recommendedOption)) {
    issues.push(issue(file, "missing-specialist-question-recommendation", `${label} must name a recommendedOption from options`));
  }
  if (proposal.freeformAllowed !== true) {
    issues.push(issue(file, "missing-specialist-question-freeform", `${label} must allow free-form answers unless a hard policy forbids it`));
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
  if (/current\s+\w+\s+profile\s+risk|questionnaire slot|referenceRefresh profile risk/i.test(String(proposal.whyNow || ""))) {
    issues.push(issue(file, "generic-specialist-question-why-now", `${label} whyNow must explain the user's concrete design risk, not internal profile metadata`));
  }
  if (hasRepeatedOptionSuffix(proposal.options || proposal.choices || [])) {
    issues.push(issue(file, "repeated-specialist-question-option-suffix", `${label} options repeat the same visible suffix instead of distinct specialist tradeoffs`));
  }
  if (normalizeLocale(proposal.locale) === "ru" && visibleRussianShare(proposal) < 0.15) {
    issues.push(issue(file, "mixed-language-specialist-question", `${label} locale=ru but visible question copy is mostly non-Russian`));
  }
  if (!Array.isArray(proposal.evidence) || proposal.evidence.length < 2) {
    issues.push(issue(file, "thin-specialist-question-evidence", `${label} must cite at least two current evidence signals`));
  }
  if (requireContext && !hasContextSignal(proposal)) {
    issues.push(issue(file, "context-free-specialist-question", `${label} must cite current brief/domain/stage context`));
  }
  if (requireEvidenceDecision && !proposal.decisionUnlocked && !proposal.artifactImpact) {
    issues.push(issue(file, "missing-specialist-question-decision", `${label} must name the artifact or decision unlocked by the answer`));
  }
  if (requireDecisionUnlocked && !proposal.decisionUnlocked) {
    issues.push(issue(file, "missing-specialist-question-decision", `${label} must include decisionUnlocked for receipt-bound specialist question output`));
  }
  if (requireRealSpecialistProposal) {
    issues.push(...validateSpecialistQuestionProvenance(proposal, { file }));
  }
  return issues;
}

export function validateSpecialistQuestionProvenance(proposal = {}, {
  file = "specialist-question",
} = {}) {
  const issues = [];
  const label = proposal.proposalId || "unknown-proposal";
  const source = proposal.proposalSource || null;
  const producer = proposal.producer || {};
  const trusted = producer.receiptTrusted === true || producer.trusted === true;
  const hostInvocation = producer.hostInvocation || {};

  if (source !== SPECIALIST_QUESTION_SOURCES.REAL_SPECIALIST_PROPOSAL) {
    issues.push(issue(file, "untrusted-specialist-question-source", `${label} must come from real-specialist-proposal before it is shown as specialist output; got ${source || "missing"}`));
  }
  if (!producer.type || !producer.id) {
    issues.push(issue(file, "missing-specialist-question-producer", `${label} must bind the question to a producer type and id`));
  }
  if (producer.type && !["agent", "worker", "reviewer"].includes(String(producer.type))) {
    issues.push(issue(file, "non-agent-specialist-question-producer", `${label} specialist questions require an agent/worker/reviewer producer, got ${producer.type}`));
  }
  if (!trusted) {
    issues.push(issue(file, "untrusted-specialist-question-producer", `${label} producer receipt must be trusted before visible specialist output`));
  }
  if (!hostInvocation.source || !hostInvocation.invocationId) {
    issues.push(issue(file, "missing-specialist-question-host-proof", `${label} producer must include hostInvocation.source and hostInvocation.invocationId`));
  }
  return issues;
}

export function isTrustedSpecialistQuestionProposal(proposal = {}) {
  return validateSpecialistQuestionProvenance(proposal).length === 0;
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
  return /brief|domain|screen|prototype|dashboard|brand|tokens|copy|a11y|ux|repo|rules|memory|security|audit|privacy|rag|codegraph|code graph|route|command|workflow/i.test(text);
}

function hasRepeatedOptionSuffix(options = []) {
  const tradeoffs = options
    .map((option) => String(option.tradeoff || option.description || "").trim())
    .filter(Boolean);
  if (tradeoffs.some((text) => /apply it specifically|reusable questionnaire default/i.test(text))) return true;
  const counts = new Map();
  for (const text of tradeoffs) {
    const normalized = text.toLowerCase().replace(/[^a-z0-9а-яё\s-]+/giu, "").replace(/\s+/g, " ").trim();
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  }
  return [...counts.values()].some((count) => count >= 2);
}

function visibleRussianShare(proposal = {}) {
  const visible = [
    proposal.question,
    proposal.why,
    proposal.whyNow,
    ...(proposal.options || proposal.choices || []).flatMap((option) => [option.label, option.tradeoff || option.description]),
  ].join(" ");
  const letters = visible.match(/\p{L}/gu) || [];
  if (!letters.length) return 0;
  const cyrillic = visible.match(/\p{Script=Cyrillic}/gu) || [];
  return cyrillic.length / letters.length;
}

function normalizeLocale(locale = "en") {
  return String(locale || "en").toLowerCase().startsWith("ru") ? "ru" : "en";
}

function normalizeQuestionProducer(producer = null, { ownerAgent = null, proposalSource = null } = {}) {
  if (producer && typeof producer === "object") {
    const hostInvocation = producer.hostInvocation || {};
    return {
      type: producer.type || producer.producerType || null,
      id: producer.id || producer.producerId || ownerAgent || null,
      stageId: producer.stageId || producer.stage || null,
      outputArtifact: producer.outputArtifact || null,
      receiptTrusted: producer.receiptTrusted === true || producer.trusted === true,
      receiptPresent: producer.receiptPresent === true,
      hostInvocation: hostInvocation.source || hostInvocation.invocationId
        ? {
            source: hostInvocation.source || null,
            invocationId: hostInvocation.invocationId || null,
          }
        : null,
      source: producer.source || proposalSource || null,
    };
  }
  return {
    type: proposalSource === SPECIALIST_QUESTION_SOURCES.REAL_SPECIALIST_PROPOSAL ? "agent" : "runtime",
    id: ownerAgent || null,
    stageId: null,
    outputArtifact: null,
    receiptTrusted: false,
    receiptPresent: false,
    hostInvocation: null,
    source: proposalSource || null,
  };
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
