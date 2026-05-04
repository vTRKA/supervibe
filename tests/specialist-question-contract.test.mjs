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
    question: "For the agent workflow dashboard, should the next screen optimize review speed, dispatch control, or incident recovery?",
    why: "The answer changes the screen spec, navigation priority, and table density.",
    choices: [
      { id: "review-speed", label: "Review speed", tradeoff: "Fast scanning, fewer controls visible." },
      { id: "dispatch-control", label: "Dispatch control", tradeoff: "More commands visible, higher density." },
      { id: "incident-recovery", label: "Incident recovery", tradeoff: "Stronger alerting and audit trail, less calm." },
    ],
    blocks: ["spec.md", "prototype/index.html"],
    artifactImpact: "screen spec layout, navigation, and primary action hierarchy",
    skipDefault: "Stop at questions_answered=false and ask the orchestrator to choose a safe default explicitly.",
    canAnswerFromEvidence: false,
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
    question: "Какой риск важнее избежать в интерфейсе?",
    why: "Ответ меняет dashboard density and prototype structure.",
    choices: [
      { id: "generic", label: "Avoid generic admin", tradeoff: "More distinctive layout, higher design risk." },
      { id: "noise", label: "Reduce noise", tradeoff: "Calmer UI, less signal density." },
      { id: "signal", label: "Strengthen signal", tradeoff: "More technical affordances, denser screen." },
    ],
    blocks: ["styleboard.html"],
    artifactImpact: "dashboard prototype layout and visual hierarchy",
    skipDefault: "Use the lowest-risk calm density default and keep stage needs_questions.",
    canAnswerFromEvidence: false,
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
