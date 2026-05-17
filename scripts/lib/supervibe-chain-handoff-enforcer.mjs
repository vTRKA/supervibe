import { buildStageDecisionCard, formatStageDecisionCard } from "./supervibe-post-stage-actions.mjs";

const HANDOFFS = {
  brainstorm: {
    phase: "brainstorm",
    nextPhase: "plan",
    command: "/supervibe-plan --loop-ready --from-brainstorm",
    skill: "supervibe:writing-plans",
    artifact: "approved-spec-or-brainstorm-summary",
    nextQuestion: "Шаг 1/1: написать план реализации по утвержденной спецификации?",
  },
  plan: {
    phase: "plan",
    nextPhase: "atomize",
    command: "/supervibe-loop --atomize-plan <plan-path> --user-approved-plan",
    skill: "supervibe:autonomous-agent-loop",
    artifact: "user-approved-loop-ready-plan",
    nextQuestion: "Step 1/1: create a work graph from this user-approved loop-ready plan, or revise/review first?",
    choices: planDecisionChoices(),
  },
  plan_review_passed: {
    phase: "plan_review_passed",
    nextPhase: "atomize",
    command: "/supervibe-loop --atomize-plan <plan-path> --user-approved-plan",
    skill: "supervibe:writing-plans",
    artifact: "user-approved-loop-ready-plan",
    nextQuestion: "Шаг 1/1: разбить user-approved loop-ready plan на атомарные work items и epic?",
  },
  atomized: {
    phase: "atomized",
    nextPhase: "execution_preflight",
    command: "/supervibe-loop --epic --worktree",
    skill: "supervibe:autonomous-agent-loop",
    artifact: "epic-with-atomic-work-items",
    nextQuestion: "Шаг 1/1: запустить provider-safe preflight перед worktree/autonomous run?",
  },
  execution_preflight: {
    phase: "execution_preflight",
    nextPhase: "execution",
    command: "/supervibe-loop --epic --worktree",
    skill: "supervibe:using-git-worktrees",
    artifact: "approved-preflight",
    nextQuestion: "Шаг 1/1: стартовать goal-until-complete run со stop/resume/status контролями?",
  },
  loop_completion: {
    phase: "loop_completion",
    nextPhase: "verify",
    command: "/supervibe-verify",
    skill: "supervibe:verification",
    artifact: "completed-loop",
    nextQuestion: "Step 1/1: choose the next action after loop completion?",
    choices: releaseDecisionChoices("/supervibe-verify"),
  },
  verify_passed: {
    phase: "verify_passed",
    nextPhase: "review",
    command: "/supervibe-review",
    skill: "supervibe:code-review",
    artifact: "verification-packet",
    nextQuestion: "Step 1/1: review the verified workflow before ship?",
    choices: releaseDecisionChoices("/supervibe-review"),
  },
  review_passed: {
    phase: "review_passed",
    nextPhase: "ship",
    command: "/supervibe-ship",
    skill: "supervibe:finishing-a-development-branch",
    artifact: "review-packet",
    nextQuestion: "Step 1/1: run ship readiness for the reviewed workflow?",
    choices: releaseDecisionChoices("/supervibe-ship"),
  },
};

export function getRequiredHandoff(phase) {
  const handoff = HANDOFFS[phase];
  if (!handoff) {
    throw new Error(`Unknown handoff phase: ${phase}`);
  }
  return {
    ...handoff,
    questionChoices: handoff.choices || buildHandoffChoices(handoff),
    questionEvidence: [
      `phase=${handoff.phase}`,
      `artifact=${handoff.artifact}`,
      `nextCommand=${handoff.command}`,
    ],
    questionSpecialist: handoff.skill,
    questionArtifactImpact: `Ответ решает, запускать ли ${handoff.command} для ${handoff.artifact}, сначала показать readiness или остановить handoff.`,
  };
}

export function formatHandoff(phaseOrHandoff) {
  const handoff = typeof phaseOrHandoff === "string" ? getRequiredHandoff(phaseOrHandoff) : phaseOrHandoff;
  const choices = handoff.questionChoices || handoff.choices || buildHandoffChoices(handoff);
  return formatStageDecisionCard(buildStageDecisionCard({
    workflow: "supervibe-chain",
    currentStage: handoff.phase,
    artifact: handoff.artifact,
    recommendation: `Continue with ${handoff.command} when the visible gate is accepted.`,
    why: `This handoff moves ${handoff.phase} to ${handoff.nextPhase} without hiding the user decision behind machine state.`,
    question: handoff.nextQuestion,
    resumeCursor: `chain:${handoff.phase}:${handoff.nextPhase}`,
    nextCommand: handoff.command,
    nextSkill: handoff.skill,
    choices: choices.map((choice) => ({
      id: choice.id,
      label: choice.label,
      description: choice.description || choice.tradeoff || "",
      recommended: Boolean(choice.recommended),
    })),
  }));
}

export function assertRequiredHandoff(phase, output, context = {}) {
  const handoff = getRequiredHandoff(phase);
  const text = String(output ?? "");
  const required = [
    { code: "artifact", value: context.artifactPath ?? handoff.artifact },
    { code: "command", value: handoff.command },
    { code: "skill", value: handoff.skill },
    { code: "next-question", value: handoff.nextQuestion },
  ];
  const missing = required.filter((item) => !text.includes(item.value));

  return {
    pass: missing.length === 0,
    phase,
    required,
    missing,
    handoff,
  };
}

export function getHandoffChain() {
  return Object.keys(HANDOFFS).map((phase) => getRequiredHandoff(phase));
}

function planDecisionChoices() {
  return [
    {
      id: "create-graph",
      label: "Create graph from this plan",
      command: "/supervibe-loop --atomize-plan <plan-path> --user-approved-plan",
      description: "Atomize the approved loop-ready plan into an epic and ready tasks without an extra review ritual.",
      recommended: true,
    },
    {
      id: "revise-plan",
      label: "Revise plan",
      command: "/supervibe-plan --loop-ready <plan-path>",
      description: "Change scope, tasks, dependencies, risks, or file ownership before graph creation.",
    },
    {
      id: "run-deeper-review",
      label: "Run deeper review",
      command: "/supervibe-plan --review <plan-path>",
      description: "Use explicit specialist review for high-risk or user-requested plan hardening.",
    },
    {
      id: "stop-with-plan",
      label: "Keep plan and stop",
      command: "",
      description: "Save the plan without creating a graph or starting execution.",
    },
  ];
}

function releaseDecisionChoices(recommendedCommand) {
  const canShip = recommendedCommand === "/supervibe-ship";
  return [
    {
      id: "proceed-verify",
      label: "Run /supervibe-verify",
      command: "/supervibe-verify",
      description: "Build Goal-to-evidence proof before review.",
      recommended: recommendedCommand === "/supervibe-verify",
    },
    {
      id: "proceed-review",
      label: "Run /supervibe-review",
      command: "/supervibe-review",
      description: "Review verified evidence and readiness.",
      recommended: recommendedCommand === "/supervibe-review",
    },
    canShip
      ? {
        id: "proceed-ship",
        label: "Run /supervibe-ship",
        command: "/supervibe-ship",
        description: "Check target-aware ship readiness after verify and review.",
        recommended: true,
      }
      : {
        id: "continue-loop",
        label: "Continue loop",
        command: "/supervibe-loop --resume-dispatch",
        description: "Resume implementation with the next ready task dispatch when completion evidence still has gaps.",
      },
    {
      id: "revise-goals",
      label: "Revise goals",
      command: "/supervibe-loop --revise-goals",
      description: "Repair, split, defer, or narrow goals before the next gate.",
    },
    {
      id: "stop-with-gaps",
      label: "Stop with gaps",
      command: "",
      description: "Persist the current state with explicit remaining gaps.",
    },
  ];
}

function buildHandoffChoices(handoff) {
  return [
    {
      id: "continue",
      label: `Продолжить ${handoff.artifact}`,
      tradeoff: `Запускает ${handoff.command} через ${handoff.skill}; gates остаются активными.`,
      recommended: true,
    },
    {
      id: "revise-scope",
      label: `Изменить scope для ${handoff.artifact}`,
      tradeoff: "Позволяет убрать, переписать, разделить или отложить пункты перед следующим этапом.",
    },
    {
      id: "exclude-or-defer",
      label: `Исключить или отложить пункты из ${handoff.artifact}`,
      tradeoff: "Фиксирует out-of-scope work, чтобы дальнейшее выполнение не включило его молча.",
    },
    {
      id: "inspect-readiness",
      label: `Проверить готовность ${handoff.artifact}`,
      tradeoff: "Покажет prerequisites и blockers без скрытого продолжения.",
    },
    {
      id: "stop",
      label: `Сохранить ${handoff.artifact} и остановиться`,
      tradeoff: "Фиксирует handoff и не запускает следующий этап.",
    },
  ];
}
