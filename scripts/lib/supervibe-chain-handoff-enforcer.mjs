const HANDOFFS = {
  brainstorm: {
    phase: "brainstorm",
    nextPhase: "plan",
    command: "/supervibe-plan --from-brainstorm",
    skill: "supervibe:writing-plans",
    artifact: "approved-spec-or-brainstorm-summary",
    nextQuestion: "Шаг 1/1: написать план реализации по утвержденной спецификации?",
  },
  plan: {
    phase: "plan",
    nextPhase: "plan_review",
    command: "/supervibe-plan --review",
    skill: "supervibe:requesting-code-review",
    artifact: "implementation-plan",
    nextQuestion: "Шаг 1/1: запустить review loop по плану перед атомизацией или исполнением?",
  },
  plan_review_passed: {
    phase: "plan_review_passed",
    nextPhase: "atomize",
    command: "/supervibe-loop --atomize-plan",
    skill: "supervibe:writing-plans",
    artifact: "reviewed-plan",
    nextQuestion: "Шаг 1/1: разбить reviewed plan на атомарные work items и epic?",
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
    command: "/supervibe-loop --epic --worktree --max-duration 3h",
    skill: "supervibe:using-git-worktrees",
    artifact: "approved-preflight",
    nextQuestion: "Шаг 1/1: стартовать bounded run с stop/resume/status контролями?",
  },
};

export function getRequiredHandoff(phase) {
  const handoff = HANDOFFS[phase];
  if (!handoff) {
    throw new Error(`Unknown handoff phase: ${phase}`);
  }
  return {
    ...handoff,
    questionChoices: buildHandoffChoices(handoff),
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
  return [
    `Artifact: ${handoff.artifact}`,
    `Next command: ${handoff.command}`,
    `Next skill: ${handoff.skill}`,
    handoff.nextQuestion,
    "Choices:",
    ...((handoff.questionChoices || buildHandoffChoices(handoff)).map((choice) => {
      const recommended = choice.recommended ? " recommended" : "";
      return `- ${choice.label}${recommended} - ${choice.tradeoff}`;
    })),
  ].join("\n");
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

function buildHandoffChoices(handoff) {
  return [
    {
      id: "continue",
      label: `Продолжить ${handoff.artifact}`,
      tradeoff: `Запускает ${handoff.command} через ${handoff.skill}; gates остаются активными.`,
      recommended: true,
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
