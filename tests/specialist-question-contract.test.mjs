import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSpecialistQuestionProposal,
  scoreSpecialistQuestionProposal,
  validateSpecialistQuestionProposal,
} from "../scripts/lib/specialist-question-contract.mjs";

test("specialist question contract accepts contextual artifact-changing questions", () => {
  const proposal = buildSpecialistQuestionProposal({
    stage: "stage-3-screen-spec",
    specialist: "ux-ui-designer",
    ownerAgent: "ux-ui-designer",
    question: "For the agent workflow dashboard, should the next screen optimize review speed, dispatch control, or incident recovery?",
    why: "The answer changes the screen spec, navigation priority, and table density.",
    whyNow: "The screen spec cannot lock navigation or density until the workflow priority is explicit.",
    choices: [
      { id: "review-speed", label: "Review speed", tradeoff: "Fast scanning, fewer controls visible.", unlocks: ["spec.md"], risk: "May hide dispatch controls.", evidence: ["review queue signal", "screen spec impact"], artifactImpact: "review table density", recommended: true },
      { id: "dispatch-control", label: "Dispatch control", tradeoff: "More commands visible, higher density.", unlocks: ["prototype/index.html"], risk: "May increase cognitive load.", evidence: ["tool-call controls", "prototype command bar"], artifactImpact: "dispatch action hierarchy" },
      { id: "incident-recovery", label: "Incident recovery", tradeoff: "Stronger alerting and audit trail, less calm.", unlocks: ["error states"], risk: "May make the default screen feel too severe.", evidence: ["incident state risk", "audit trail copy"], artifactImpact: "recovery state model" },
    ],
    blocks: ["spec.md", "prototype/index.html"],
    artifactImpact: "screen spec layout, navigation, and primary action hierarchy",
    skipDefault: "Stop at questions_answered=false and ask the orchestrator to choose a safe default explicitly.",
    canAnswerFromEvidence: false,
    evidence: ["agent workflow dashboard brief", "screen spec stage", "review queue risk"],
    currentContext: "agent workflow dashboard",
  });

  assert.deepEqual(validateSpecialistQuestionProposal(proposal), []);
  assert.equal(scoreSpecialistQuestionProposal(proposal).score, 10);
});

test("specialist question contract rejects catalog-copy and context-free prompts", () => {
  const proposal = buildSpecialistQuestionProposal({
    stage: "stage-1",
    specialist: "creative-director",
    question: "Choose option A, option B, or option C.",
    why: "",
    choices: [
      { id: "a", label: "Option A", tradeoff: "Template choice." },
      { id: "b", label: "Option B", tradeoff: "Template choice." },
      { id: "c", label: "Option C", tradeoff: "Template choice." },
    ],
    blocks: [],
    artifactImpact: "",
    skipDefault: "",
    canAnswerFromEvidence: true,
  });

  const issues = validateSpecialistQuestionProposal(proposal);
  assert.ok(issues.some((issue) => issue.code === "catalog-copy-specialist-question"));
  assert.ok(issues.some((issue) => issue.code === "context-free-specialist-question"));
  assert.ok(issues.some((issue) => issue.code === "missing-specialist-question-default-policy"));
  assert.ok(scoreSpecialistQuestionProposal(proposal).score < 8);
});

test("specialist question contract rejects generic whyNow, missing option evidence, and repeated suffixes", () => {
  const proposal = buildSpecialistQuestionProposal({
    stage: "stage-1-brand-direction",
    specialist: "creative-director",
    ownerAgent: "creative-director",
    question: "Which direction should the agent chat workspace use?",
    why: "The answer changes direction.md and styleboard.html.",
    whyNow: "This is the current referenceRefresh profile risk.",
    choices: [
      { id: "a", label: "Trace-first command center", tradeoff: "Apply it specifically to agent chat workspace.", unlocks: ["direction.md"], risk: "May feel dense.", recommended: true },
      { id: "b", label: "Chat-first command center", tradeoff: "Apply it specifically to agent chat workspace.", unlocks: ["direction.md"], risk: "May hide traces." },
      { id: "c", label: "Approval-first command center", tradeoff: "Apply it specifically to agent chat workspace.", unlocks: ["direction.md"], risk: "May slow chat." },
    ],
    blocks: ["direction.md", "styleboard.html"],
    artifactImpact: "brand direction, styleboard, and token candidates",
    skipDefault: "Stop and ask for a creative direction.",
    canAnswerFromEvidence: false,
    evidence: ["agent chat workspace brief", "pending approvals scenario"],
    currentContext: "agent chat workspace",
  });

  const issues = validateSpecialistQuestionProposal(proposal);
  assert.ok(issues.some((issue) => issue.code === "generic-specialist-question-why-now"));
  assert.ok(issues.some((issue) => issue.code === "missing-specialist-question-option-evidence"));
  assert.ok(issues.some((issue) => issue.code === "repeated-specialist-question-option-suffix"));
});

test("specialist question contract rejects visible locale mismatch", () => {
  const proposal = buildSpecialistQuestionProposal({
    locale: "ru",
    stage: "stage-2-design-system",
    specialist: "ux-ui-designer",
    ownerAgent: "ux-ui-designer",
    question: "Which layout density should we use?",
    why: "The answer changes UX spec density.",
    whyNow: "Density must be chosen before screen spec.",
    choices: [
      { id: "balanced", label: "Balanced", tradeoff: "Moderate density.", unlocks: ["spec.md"], risk: "May hide details.", evidence: ["brief", "artifact impact"], artifactImpact: "density model", recommended: true },
      { id: "compact", label: "Compact", tradeoff: "More state visible.", unlocks: ["spec.md"], risk: "May overload.", evidence: ["trace panel", "artifact impact"], artifactImpact: "trace density" },
      { id: "comfortable", label: "Comfortable", tradeoff: "More readable.", unlocks: ["spec.md"], risk: "May reduce throughput.", evidence: ["chat panel", "artifact impact"], artifactImpact: "reading rhythm" },
    ],
    blocks: ["spec.md"],
    artifactImpact: "screen spec density",
    skipDefault: "Ask in Russian before using a default.",
    canAnswerFromEvidence: false,
    evidence: ["русский brief", "screen spec"],
    currentContext: "agent chat dashboard",
  });

  const issues = validateSpecialistQuestionProposal(proposal);
  assert.ok(issues.some((issue) => issue.code === "mixed-language-specialist-question"));
});

test("specialist question contract keeps non-English proposal ids unique and context scoring strict", () => {
  const first = buildSpecialistQuestionProposal({
    stage: "stage-1",
    specialist: "ux-ui-designer",
    ownerAgent: "ux-ui-designer",
    question: "Какой риск важнее избежать в интерфейсе?",
    why: "Ответ меняет dashboard density and prototype structure.",
    whyNow: "Prototype layout cannot proceed until the main UX risk is explicit.",
    choices: [
      { id: "generic", label: "Avoid generic admin", tradeoff: "More distinctive layout, higher design risk.", unlocks: ["styleboard.html"], risk: "Higher design risk.", recommended: true },
      { id: "noise", label: "Reduce noise", tradeoff: "Calmer UI, less signal density.", unlocks: ["density"], risk: "May hide evidence." },
      { id: "signal", label: "Strengthen signal", tradeoff: "More technical affordances, denser screen.", unlocks: ["prototype structure"], risk: "May increase density." },
    ],
    blocks: ["styleboard.html"],
    artifactImpact: "dashboard prototype layout and visual hierarchy",
    skipDefault: "Use the lowest-risk calm density default and keep stage needs_questions.",
    canAnswerFromEvidence: false,
    evidence: ["agent workflow dashboard", "prototype structure stage", "density risk"],
    currentContext: "agent workflow dashboard",
  });
  const second = buildSpecialistQuestionProposal({
    ...first,
    proposalId: null,
    question: "Какой риск важнее избежать в панели?",
  });

  assert.notEqual(first.proposalId, second.proposalId);

  const contextFree = {
    ...first,
    currentContext: "",
    question: "Which option should we choose?",
    why: "Answer changes the output.",
    artifactImpact: "output artifact",
  };
  assert.ok(validateSpecialistQuestionProposal(contextFree).some((issue) => issue.code === "context-free-specialist-question"));
  assert.ok(scoreSpecialistQuestionProposal(contextFree).score < 10);
});
