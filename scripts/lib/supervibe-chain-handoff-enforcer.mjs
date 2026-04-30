const HANDOFFS = {
  brainstorm: {
    phase: "brainstorm",
    nextPhase: "plan",
    command: "/supervibe-plan",
    skill: "supervibe:writing-plans",
    artifact: "approved-spec-or-brainstorm-summary",
    nextQuestion: "Следующий шаг - написать план. Переходим?",
  },
  plan: {
    phase: "plan",
    nextPhase: "plan_review",
    command: "/supervibe-plan --review",
    skill: "supervibe:requesting-code-review",
    artifact: "implementation-plan",
    nextQuestion: "Следующий шаг - review loop по плану. Переходим?",
  },
  plan_review_passed: {
    phase: "plan_review_passed",
    nextPhase: "atomize",
    command: "/supervibe-loop --from-plan --atomize",
    skill: "supervibe:writing-plans",
    artifact: "reviewed-plan",
    nextQuestion: "Следующий шаг - разбить план на атомарные work items и epic. Переходим?",
  },
  atomized: {
    phase: "atomized",
    nextPhase: "execution_preflight",
    command: "/supervibe-loop --epic --worktree",
    skill: "supervibe:autonomous-agent-loop",
    artifact: "epic-with-atomic-work-items",
    nextQuestion: "Следующий шаг - provider-safe preflight перед worktree/autonomous run. Переходим?",
  },
  execution_preflight: {
    phase: "execution_preflight",
    nextPhase: "execution",
    command: "/supervibe-loop --epic --worktree --max-duration 3h",
    skill: "supervibe:using-git-worktrees",
    artifact: "approved-preflight",
    nextQuestion: "Следующий шаг - стартовать bounded run с stop/resume/status контролями. Переходим?",
  },
};

export function getRequiredHandoff(phase) {
  const handoff = HANDOFFS[phase];
  if (!handoff) {
    throw new Error(`Unknown handoff phase: ${phase}`);
  }
  return { ...handoff };
}

export function formatHandoff(phaseOrHandoff) {
  const handoff = typeof phaseOrHandoff === "string" ? getRequiredHandoff(phaseOrHandoff) : phaseOrHandoff;
  return [
    `Artifact: ${handoff.artifact}`,
    `Next command: ${handoff.command}`,
    `Next skill: ${handoff.skill}`,
    handoff.nextQuestion,
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
