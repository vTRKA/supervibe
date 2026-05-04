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
      { id: "review-speed", label: "Review speed", tradeoff: "Fast scanning, fewer controls visible.", unlocks: ["spec.md"], risk: "May hide dispatch controls.", recommended: true },
      { id: "dispatch-control", label: "Dispatch control", tradeoff: "More commands visible, higher density.", unlocks: ["prototype/index.html"], risk: "May increase cognitive load." },
      { id: "incident-recovery", label: "Incident recovery", tradeoff: "Stronger alerting and audit trail, less calm.", unlocks: ["error states"], risk: "May make the default screen feel too severe." },
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
