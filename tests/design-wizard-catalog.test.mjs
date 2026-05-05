import assert from "node:assert/strict";
import test from "node:test";

import {
  DESIGN_STYLEBOARD_REQUIRED_AXES,
  DESIGN_WIZARD_AXES,
  bindDesignWizardQuestionProposals,
  buildDesignReviewCheckPlan,
  buildDesignWizardState,
  evaluateDesignStyleboardReadiness,
  formatDesignWizardStatus,
  formatDesignWizardQuestion,
  formatDesignWizardProtocolQuestion,
  parseDesignBriefPreferences,
  recordDesignWizardAnswer,
  resolveDesignViewportPolicy,
  transitionDesignWizardState,
} from "../scripts/lib/design-wizard-catalog.mjs";
import {
  buildSpecialistQuestionProposal,
  SPECIALIST_QUESTION_SOURCES,
} from "../scripts/lib/specialist-question-contract.mjs";

function trustedQuestionForAxis(state, axis) {
  const scratch = state.questionQueue.find((question) => question.axis === axis);
  assert.ok(scratch, `${axis} scratch question should exist`);
  const proposal = buildSpecialistQuestionProposal({
    proposalId: `${scratch.stage}:${scratch.ownerAgent}:${scratch.axis}:trusted-test`,
    axis: scratch.axis,
    stage: scratch.stage,
    specialist: scratch.specialist,
    ownerAgent: scratch.ownerAgent,
    question: scratch.prompt,
    why: scratch.why || "The answer changes the next design artifact.",
    whyNow: scratch.whyNow || "The owner specialist must resolve this before visible user dialogue.",
    choices: scratch.choices.map((choice) => ({
      id: choice.id,
      label: choice.label,
      tradeoff: choice.tradeoff || "Tradeoff recorded by the owner specialist.",
      unlocks: choice.unlocks?.length ? choice.unlocks : scratch.blocks,
      risk: choice.risk || "Risk reviewed by the owner specialist.",
      evidence: choice.evidence?.length ? choice.evidence : scratch.evidence,
      artifactImpact: choice.artifactImpact || scratch.artifactImpact,
      recommended: choice.recommended === true,
    })),
    blocks: scratch.blocks,
    artifactImpact: scratch.artifactImpact,
    skipDefault: "Stop and ask the owner specialist for another proposal if the user skips.",
    canAnswerFromEvidence: false,
    evidence: scratch.evidence?.length >= 2 ? scratch.evidence : ["current design brief", "trusted specialist receipt"],
    currentContext: `${scratch.axis} ${scratch.stage} ${scratch.ownerAgent}`,
    proposalSource: SPECIALIST_QUESTION_SOURCES.REAL_SPECIALIST_PROPOSAL,
    producer: {
      type: "agent",
      id: scratch.ownerAgent,
      stageId: scratch.stage,
      receiptTrusted: true,
      receiptPresent: true,
      hostInvocation: {
        source: "codex-spawn-agent",
        invocationId: `${scratch.ownerAgent}-${scratch.axis}-test`,
      },
    },
  });
  const bound = bindDesignWizardQuestionProposals(state, [proposal]);
  return bound.questionQueue.find((question) => question.axis === axis);
}

test("design wizard parses brief coverage and keeps missing axes in the queue", () => {
  const parsed = parseDesignBriefPreferences("Use graphite cyan, compact density, Radix, subtle motion, and 1440x900.");
  assert.equal(parsed.decisions.palette_mood.choiceId, "graphite-cyan");
  assert.equal(parsed.decisions.information_density.choiceId, "compact");
  assert.equal(parsed.decisions.component_feel.choiceId, "radix-headless");
  assert.equal(parsed.decisions.motion_intensity.choiceId, "subtle");
  assert.equal(parsed.decisions.viewport.answer, "1440x900");

  const state = buildDesignWizardState({
    brief: "Use graphite cyan, compact density, Radix, subtle motion.",
    target: "web",
    mode: "design-system-only",
  });

  assert.equal(state.coverage.score, `4/${DESIGN_WIZARD_AXES.length}`);
  assert.equal(state.gates.tokensUnlocked, false);
  assert.ok(state.questionQueue.some((question) => question.axis === "typography_personality"));
  assert.ok(state.questionQueue.every((question) => question.axis === "viewport" || (question.choices || []).length >= 3));
});

test("wizard prioritizes questions and recommendations by brief profile", () => {
  const marketing = buildDesignWizardState({
    brief: "Build a bold marketing landing page for an AI launch with a strong hero and conversion path.",
    target: "web",
  });
  const regulated = buildDesignWizardState({
    brief: "Compliance banking admin with audit logs, risk review, and high trust requirements.",
    target: "web",
  });
  const developer = buildDesignWizardState({
    brief: "Tauri developer console for agent workflow, code review, terminal output, and dense logs.",
    target: "tauri",
    initialDecisions: {
      viewport: { axis: "viewport", answer: "1440x900", source: "user" },
    },
  });

  assert.equal(marketing.questionStrategy.profile, "brandLaunch");
  assert.equal(marketing.questionQueue[1].axis, "visual_direction_tone");
  assert.equal(marketing.questionQueue[2].axis, "creative_alternatives");
  assert.match(marketing.questionQueue[1].prompt, /first-impression direction/);
  assert.equal(marketing.questionQueue[0].choices.find((choiceItem) => choiceItem.recommended).id, "full-prototype-pipeline");

  assert.equal(regulated.questionStrategy.profile, "regulatedTrust");
  assert.equal(regulated.questionQueue[1].axis, "audience_trust_posture");
  assert.equal(regulated.questionQueue[1].choices.find((choiceItem) => choiceItem.recommended).id, "regulated-assurance");

  assert.equal(developer.questionStrategy.profile, "developerTool");
  assert.equal(developer.questionQueue[1].axis, "component_feel");
  assert.equal(developer.questionQueue[1].choices.find((choiceItem) => choiceItem.recommended).id, "platform-native");

  assert.notDeepEqual(
    marketing.questionQueue.slice(1, 5).map((question) => question.axis),
    regulated.questionQueue.slice(1, 5).map((question) => question.axis),
  );
});

test("wizard resolves multilingual legal landing intent before design artifacts", () => {
  const brief = "\u043b\u0435\u043d\u0434\u0438\u043d\u0433 \u044e\u0440\u0438\u0434\u0438\u0447\u0435\u0441\u043a\u043e\u0433\u043e \u0441\u0430\u0439\u0442\u0430";
  const state = buildDesignWizardState({
    brief,
    target: "unknown",
    mode: "full-prototype-pipeline",
  });

  assert.equal(state.locale, "ru");
  assert.equal(state.target, "web");
  assert.equal(state.questionStrategy.profile, "regulatedTrust");
  assert.equal(state.questionStrategy.signals.brandLaunch, true);
  assert.equal(state.questionStrategy.signals.regulatedTrust, true);
  assert.equal(state.questionQueue[0].axis, "audience_trust_posture");
  assert.deepEqual(state.reviewChecks.screenshotViewports.map((viewport) => viewport.width), [375, 1440, 1920]);
  assert.equal(state.gates.viewportPolicyRecorded, false);
});

test("wizard emits specialist question proposals with artifact impact", () => {
  const state = buildDesignWizardState({
    brief: "Developer console for agent workflow with compact data and command center behavior.",
    target: "tauri",
    mode: "full-prototype-pipeline",
    initialDecisions: {
      viewport: { axis: "viewport", answer: "1440x900", source: "user" },
    },
  });
  const proposal = state.questionProposals.find((item) => item.specialist === "creative-director");

  assert.ok(proposal);
  assert.equal(proposal.stage, "stage-1-brand-direction");
  assert.ok(proposal.blocks.includes("direction.md"));
  assert.ok(proposal.artifactImpact);
  assert.equal(proposal.ownerAgent, "creative-director");
  assert.ok(proposal.whyNow);
  assert.ok(proposal.evidence.length >= 2);
  assert.ok(proposal.options.every((option) => option.unlocks.length > 0 && option.risk));
  assert.ok(proposal.options.every((option) => Array.isArray(option.evidence) && option.evidence.length >= 2));
  assert.ok(proposal.options.every((option) => option.artifactImpact));
  assert.ok(proposal.recommendedOption);
  assert.equal(proposal.canAnswerFromEvidence, false);
  assert.ok(proposal.choices.length >= 3);
});

test("wizard renders questions from SpecialistQuestionContract proposals", () => {
  const state = buildDesignWizardState({
    brief: "Agent chat workspace with approvals, tool calls, subagents, trace review, and desktop inspector panels.",
    target: "tauri",
    mode: "full-prototype-pipeline",
    initialDecisions: {
      viewport: { axis: "viewport", answer: "1440x900", source: "user" },
    },
  });
  const density = state.questionQueue.find((question) => question.axis === "information_density");
  const proposal = state.questionProposals.find((item) => item.proposalId.endsWith(":information_density"));

  assert.ok(density);
  assert.ok(proposal);
  assert.equal(density.source, "fallback-scratch-question");
  assert.equal(density.proposalSource, "fallback-seed");
  assert.equal(density.trustedSpecialistProposal, false);
  assert.equal(density.proposalId, proposal.proposalId);
  assert.equal(density.ownerAgent, proposal.ownerAgent);
  assert.equal(density.prompt, proposal.question);
  assert.deepEqual(
    density.choices.map((choice) => choice.label),
    proposal.options.map((option) => option.label),
  );
  assert.ok(density.choices.every((choice) => choice.risk && choice.unlocks.length > 0));
  assert.ok(density.artifactImpact);
  assert.equal(density.canAnswerFromEvidence, false);
});

test("wizard keeps delegated specialist defaults behind a review gate", () => {
  const state = buildDesignWizardState({
    brief: "Agent chat workspace with tool traces.",
    target: "web",
    mode: "design-system-only",
  });
  const next = recordDesignWizardAnswer(state, {
    axis: "information_density",
    choiceId: "compact",
    source: "delegated-to-agent",
    timestamp: "2026-05-04T00:00:00.000Z",
  });

  assert.equal(next.decisions.information_density.source, "delegated-to-agent");
  assert.equal(next.decisions.information_density.requiresReview, true);
  assert.ok(next.coverage.delegatedAxes.includes("information_density"));
  assert.equal(next.gates.delegatedReviewRequired, true);
  assert.equal(next.gates.tokensUnlocked, false);
  assert.match(next.gates.blockedReason, /delegated decisions require review packet/);
});

test("wizard stores multi-select axis choices as structured choiceIds", () => {
  const state = buildDesignWizardState({
    brief: "Agent chat workspace with tool traces.",
    target: "web",
    mode: "design-system-only",
  });
  const question = state.questionQueue.find((item) => item.axis === "anti_generic_guardrail");
  assert.equal(question.multiChoice, true);

  const next = recordDesignWizardAnswer(state, {
    axis: "anti_generic_guardrail",
    choiceIds: ["avoid-generic-admin", "brand-distinct-but-usable"],
    source: "user",
    timestamp: "2026-05-04T00:00:00.000Z",
  });

  assert.deepEqual(next.decisions.anti_generic_guardrail.choiceIds, ["avoid-generic-admin", "brand-distinct-but-usable"]);
  assert.equal(next.decisions.anti_generic_guardrail.choiceId, "avoid-generic-admin+brand-distinct-but-usable");
  assert.equal(next.decisions.anti_generic_guardrail.multiChoice, true);
  assert.ok(!next.questionQueue.some((item) => item.axis === "anti_generic_guardrail"));
});

test("wizard rejects multiple choices on single-select axes", () => {
  const state = buildDesignWizardState({
    brief: "Agent chat workspace with tool traces.",
    target: "web",
    mode: "design-system-only",
  });

  assert.throws(
    () => recordDesignWizardAnswer(state, {
      axis: "information_density",
      choiceIds: ["balanced", "compact"],
      source: "user",
    }),
    /accepts one choice/,
  );
});

test("wizard renderer escapes untrusted markdown markers in visible copy", () => {
  const markdown = formatDesignWizardQuestion({
    locale: "en",
    ownerAgent: "ux-ui-designer",
    prompt: "**Balance chat and trace panels",
    whyNow: "The screen spec needs one density mode before layout.",
    decisionUnlocked: "screen spec density",
    choices: [
      { id: "balanced", label: "**Balanced", tradeoff: "Good scan speed.", recommended: true },
      { id: "compact", label: "Compact", tradeoff: "More state visible." },
      { id: "comfortable", label: "Comfortable", tradeoff: "Calmer reading." },
    ],
  });

  assert.doesNotMatch(markdown, /\*\*Balance chat and trace panels/);
  assert.doesNotMatch(markdown, /- \*\*\*\*Balanced\*\*/);
  assert.equal((markdown.match(/\*\*/g) || []).length % 2, 0);
});

test("wizard renderer refuses fallback scratch questions as visible copy", () => {
  const state = buildDesignWizardState({
    brief: "Agent chat workspace with approvals and trace panels.",
    target: "tauri",
    mode: "full-prototype-pipeline",
  });

  assert.throws(
    () => formatDesignWizardQuestion(state.questionQueue[0]),
    /fallback-scratch-question cannot be rendered/,
  );
  assert.throws(
    () => formatDesignWizardProtocolQuestion(state.questionQueue[0]),
    /fallback-scratch-question cannot be rendered/,
  );
});

test("wizard renders context-specific choice labels instead of reusable templates", () => {
  const state = buildDesignWizardState({
    brief: "Новая дизайн система для десктопного приложения под агентскую систему чатов. Нужен креативный UI, не generic SaaS admin, graphite cyan, code-first typography, subtle motion.",
    target: "tauri",
    mode: "full-prototype-pipeline",
    initialDecisions: {
      viewport: { axis: "viewport", answer: "1440x900", source: "user" },
    },
  });
  const creative = state.questionQueue.find((question) => question.axis === "creative_alternatives");
  const density = state.questionQueue.find((question) => question.axis === "information_density");

  assert.ok(creative);
  assert.ok(density);
  assert.match(creative.prompt, /агентского чат-пространства|agent/i);
  assert.match(density.prompt, /агентское чат-пространство|agent/i);
  assert.deepEqual(
    creative.choices.map((choiceItem) => choiceItem.label),
    [
      "Сравнить cockpit, editorial workspace и command center",
      "Сравнить консоль и редакторский чат",
      "Зафиксировать выбранный agent-chat cockpit",
    ],
  );
  assert.deepEqual(
    density.choices.map((choiceItem) => choiceItem.label),
    [
      "Сбалансировать чат, трассы и инспектор",
      "Плотный cockpit для agent traces",
      "Фокус на диалоге с деталями по запросу",
    ],
  );

  const markdown = `${formatDesignWizardQuestion(trustedQuestionForAxis(state, "creative_alternatives"))}\n${formatDesignWizardQuestion(trustedQuestionForAxis(state, "information_density"))}`;
  assert.doesNotMatch(markdown, /- 3 разных направления(?:\s|\()/);
  assert.doesNotMatch(markdown, /- Balanced(?:\s|\()/);
  assert.match(markdown, /Креативный директор:/);
  assert.match(markdown, /UX\/UI дизайнер:/);
  assert.match(markdown, /agent-chat|trace|cockpit/i);
  assert.doesNotMatch(markdown, /Apply it specifically|reusable questionnaire default/);
});

test("creative direction options are specialist-specific instead of the catalog template list", () => {
  const cases = [
    {
      label: "agent",
      input: {
        brief: "Agent operations workspace with approvals, tool calls, subagents, memory proposals, terminal output, and trace review.",
        target: "tauri",
        mode: "full-prototype-pipeline",
      },
      expected: /tool calls, approvals, subagents, and memory proposals/i,
    },
    {
      label: "brand",
      input: {
        brief: "Marketing launch page for AI product with hero, conversion path, waitlist, and proof.",
        target: "web",
        mode: "full-prototype-pipeline",
      },
      expected: /Signature launch moment|Proof-led editorial launch|Guided product trial/,
    },
    {
      label: "regulated",
      input: {
        brief: "Banking compliance workflow with audit logs, privacy review, and risk queue.",
        target: "web",
        mode: "full-prototype-pipeline",
      },
      expected: /Audit-first clarity|Evidence control room|Guided compliance utility/,
    },
    {
      label: "desktop",
      input: {
        brief: "Tauri desktop support dashboard with queues, panels, and compact tables.",
        target: "tauri",
        mode: "full-prototype-pipeline",
      },
      expected: /Resize-first operations surface|Dense desktop control room|overflow and resize proof/,
    },
  ];
  const catalogLabels = new Set([
    "Operational clarity",
    "Technical command center",
    "Premium editorial",
    "Warm product utility",
    "Bold launch energy",
  ].map((label) => label.toLowerCase()));
  const states = cases.map((item) => ({
    ...item,
    state: buildDesignWizardState(item.input),
  }));

  for (const item of states) {
    const question = item.state.questionQueue.find((entry) => entry.axis === "visual_direction_tone");
    assert.ok(question, `${item.label} should ask visual_direction_tone`);
    const visible = question.choices.map((choiceItem) => `${choiceItem.label} ${choiceItem.tradeoff}`).join("\n");
    assert.match(visible, item.expected, `${item.label} should use evidence-bound creative options`);
    assert.ok(
      question.choices.every((choiceItem) => !catalogLabels.has(String(choiceItem.label).toLowerCase())),
      `${item.label} must not expose the base catalog labels`,
    );
  }

  const idSets = states.map((item) => {
    const question = item.state.questionQueue.find((entry) => entry.axis === "visual_direction_tone");
    return question.choices.map((choiceItem) => choiceItem.id).join("|");
  });
  assert.ok(new Set(idSets).size >= 3, "brief profiles should receive different creative-direction option sets");

  const agentProposal = states[0].state.questionProposals.find((entry) => entry.proposalId.endsWith(":visual_direction_tone"));
  assert.ok(agentProposal);
  assert.match(
    agentProposal.options.map((option) => `${option.label} ${option.tradeoff}`).join("\n"),
    /tool calls, approvals, subagents, and memory proposals/i,
  );

  const ruState = buildDesignWizardState({
    brief: "Новая дизайн система для десктопного приложения под агентскую систему чатов: approvals, tool calls, subagents, memory proposals и trace review.",
    target: "tauri",
    mode: "full-prototype-pipeline",
  });
  const ruVisual = ruState.questionQueue.find((entry) => entry.axis === "visual_direction_tone");
  assert.ok(ruVisual);
  const ruMarkdown = formatDesignWizardQuestion(trustedQuestionForAxis(ruState, "visual_direction_tone"));
  assert.doesNotMatch(ruMarkdown, /Operational clarity|Technical command center|Premium editorial|Warm product utility|Bold launch energy/);
  assert.match(ruMarkdown, /Командный центр с первым слоем trace|Операционный cockpit с закрепленным evidence/);
  assert.ok(ruVisual.choices.every((choiceItem) => /[А-Яа-яЁё]/u.test(choiceItem.label)));
});

test("wizard contextualizes palette and typography choices for runtime copy", () => {
  const state = buildDesignWizardState({
    brief: "Agent chat workspace for operators with traces, logs, review queue, and command center behavior.",
    target: "tauri",
    mode: "full-prototype-pipeline",
    initialDecisions: {
      viewport: { axis: "viewport", answer: "1440x900", source: "user" },
    },
  });
  const palette = state.questionQueue.find((question) => question.axis === "palette_mood");
  const typography = state.questionQueue.find((question) => question.axis === "typography_personality");

  assert.ok(palette);
  assert.ok(typography);
  assert.match(palette.choices[0].label, /technical signal|daily work|control-room|operational emphasis/i);
  assert.match(typography.choices[0].label, /agent traces|calm shell|trustful reading|product precision/i);

  const markdown = `${formatDesignWizardQuestion(trustedQuestionForAxis(state, "palette_mood"))}\n${formatDesignWizardQuestion(trustedQuestionForAxis(state, "typography_personality"))}`;
  assert.doesNotMatch(markdown, /Graphite \+ cyan \(recommended\)|System native \(recommended\)/);
  assert.match(markdown, /starting hypothesis/);
  assert.doesNotMatch(markdown, /This is the current .*profile risk/);
});

test("multilingual functional-only reference scope closes only the borrow/avoid axis", () => {
  const parsed = parseDesignBriefPreferences("Сохранить только функционал, не скелет старых прототипов.");

  assert.equal(parsed.decisions.reference_borrow_avoid.choiceId, "functional-only");
  assert.deepEqual(parsed.coveredAxes, ["reference_borrow_avoid"]);

  const state = buildDesignWizardState({
    brief: "Сохранить только функционал, не скелет старых прототипов.",
    target: "web",
    mode: "design-system-only",
  });

  assert.equal(state.coverage.score, `1/${DESIGN_WIZARD_AXES.length}`);
  assert.equal(state.gates.tokensUnlocked, false);
  assert.ok(state.questionQueue.some((question) => question.axis === "visual_direction_tone"));
  assert.ok(!state.questionQueue.some((question) => question.axis === "reference_borrow_avoid"));
});

test("explicit defaults create editable guided checklist instead of silent collapse", () => {
  const state = buildDesignWizardState({
    brief: "Use safe defaults for a new design system.",
    target: "web",
    mode: "design-system-only",
    timestamp: "2026-05-03T00:00:00.000Z",
  });

  assert.equal(state.explicitDefaults, true);
  assert.equal(state.coverage.score, `${DESIGN_WIZARD_AXES.length}/${DESIGN_WIZARD_AXES.length}`);
  assert.equal(state.gates.tokensUnlocked, true);
  assert.equal(state.gates.reviewStyleboardUnlocked, false);
  assert.equal(state.gates.viewportPolicyRecorded, false);
  assert.ok(state.questionQueue.some((question) => question.axis === "viewport"));
  assert.equal(state.guidedDefaultsChecklist.length, DESIGN_WIZARD_AXES.length);
  assert.ok(state.guidedDefaultsChecklist.every((item) => {
    return item.actions.map((action) => action.id).join(",") === "accept-default,compare-alternatives,customize";
  }));
});

test("review styleboard is blocked until required preference axes are recorded", () => {
  const partial = buildDesignWizardState({
    brief: "Use graphite cyan and compact density.",
    target: "web",
    mode: "design-system-only",
  });

  assert.equal(partial.styleboard.phase, "diagnostic-scratch");
  assert.equal(partial.gates.reviewStyleboardUnlocked, false);
  assert.ok(partial.styleboard.missingAxes.includes("typography_personality"));

  const complete = evaluateDesignStyleboardReadiness({
    mode: "design-system-only",
    target: "web",
    decisions: {
      ...Object.fromEntries(DESIGN_STYLEBOARD_REQUIRED_AXES.map((axis) => [axis, { axis, source: "user" }])),
      viewport: { axis: "viewport", answer: "1440x900", source: "user" },
    },
  });

  assert.equal(complete.pass, true);
  assert.deepEqual(complete.missingAxes, []);
});

test("desktop viewport policy prefers actual window metadata over web defaults", () => {
  const tauri = resolveDesignViewportPolicy({
    target: "tauri",
    currentWindow: { width: 1366, height: 768 },
    deviceScaleFactor: 1.25,
  });

  assert.equal(tauri.requiresActualWindowQuestion, true);
  assert.equal(tauri.defaultViewports[0].exactWindow, true);
  assert.equal(tauri.defaultViewports[0].deviceScaleFactor, 1.25);
  assert.ok(tauri.requiredMetadata.includes("mainWindow"));
  assert.ok(tauri.requiredMetadata.includes("secondaryWindow"));
  assert.ok(tauri.choices.some((choice) => choice.id === "actual-window"));

  const web = resolveDesignViewportPolicy({ target: "web" });
  assert.deepEqual(web.defaultViewports.map((viewport) => viewport.width), [375, 1440]);
});

test("wizard answers update state and formatted questions include decision context", () => {
  const state = buildDesignWizardState({ brief: "", target: "web", mode: "design-system-only" });
  const updated = recordDesignWizardAnswer(state, {
    axis: "typography_personality",
    choiceId: "humanist",
    source: "user",
    timestamp: "2026-05-03T00:00:00.000Z",
  });
  assert.equal(updated.decisions.typography_personality.choiceId, "humanist");
  assert.ok(!updated.questionQueue.some((question) => question.axis === "typography_personality"));
  assert.equal(updated.runtimeStatus.progress, `1/${DESIGN_WIZARD_AXES.length}`);
  assert.ok(updated.resumeToken);

  const markdown = formatDesignWizardProtocolQuestion(trustedQuestionForAxis(state, "visual_direction_tone"));
  assert.match(markdown, /Why:/);
  assert.match(markdown, /Decision unlocked:/);
  assert.match(markdown, /Free-form answer:/);
  assert.match(markdown, /Stop condition:/);
});

test("wizard transition exposes status and resume token", () => {
  const state = buildDesignWizardState({ brief: "", target: "web", mode: "design-system-only" });
  const next = transitionDesignWizardState(state, {
    type: "answer",
    axis: "palette_mood",
    choiceId: "light-first",
    timestamp: "2026-05-03T00:00:00.000Z",
  });
  const report = formatDesignWizardStatus(next);

  assert.equal(next.decisions.palette_mood.choiceId, "light-first");
  assert.ok(next.runtimeStatus.queued < state.runtimeStatus.queued);
  assert.match(report, /SUPERVIBE_DESIGN_WIZARD_STATUS/);
  assert.match(report, /RESUME_TOKEN:/);
  assert.match(report, /TOKENS_UNLOCKED: false/);
});

test("wizard localizes Russian questions and adds anti-generic creative gates", () => {
  const state = buildDesignWizardState({
    brief: "Нужен уникальный Tauri интерфейс, не generic SaaS, не старый sidebar admin, FullHD 1920x1080.",
    target: "tauri",
  });

  assert.equal(state.locale, "ru");
  assert.ok(state.coverage.requiredAxes.includes("creative_alternatives"));
  assert.ok(state.coverage.requiredAxes.includes("anti_generic_guardrail"));
  assert.ok(state.questionQueue.some((question) => question.axis === "creative_alternatives"));
  assert.ok(state.questionQueue.some((question) => question.axis === "anti_generic_guardrail"));

  const markdown = formatDesignWizardQuestion(trustedQuestionForAxis(state, state.questionQueue[0].axis));
  assert.doesNotMatch(markdown, /Шаг 1\/|Зачем:|Что изменится:|Если пропустить:/);
  assert.doesNotMatch(markdown, /Why:|Decision unlocked:|If skipped:|Free-form answer:|Stop condition:|\(recommended\)/);
  assert.match(markdown, /Креативный директор:|UX\/UI дизайнер:|Оркестратор:/);
  assert.match(markdown, /Можно выбрать вариант выше/);
});

test("viewport decisions are captured before styleboard and drive visual checks", () => {
  const state = buildDesignWizardState({
    brief: "FullHD-first review at 1920x1080 for a desktop shell.",
    target: "tauri",
    mode: "full-prototype-pipeline",
  });

  assert.equal(state.decisions.viewport.answer, "1920x1080");
  assert.ok(!state.questionQueue.some((question) => question.axis === "viewport"));
  assert.equal(state.gates.viewportPolicyRecorded, true);

  const plan = buildDesignReviewCheckPlan({
    target: "tauri",
    viewportDecision: state.decisions.viewport,
  });

  assert.deepEqual(
    plan.screenshotViewports.map((viewport) => `${viewport.width}x${viewport.height}`),
    ["1920x1080", "1440x900", "1280x800"],
  );
  assert.ok(plan.checks.includes("dom-overflow"));
  assert.ok(plan.checks.includes("contrast-audit"));
  assert.ok(plan.checks.includes("tauri-webview-smoke"));
});
