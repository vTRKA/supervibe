import assert from "node:assert/strict";
import test from "node:test";

import {
  DESIGN_STYLEBOARD_REQUIRED_AXES,
  DESIGN_WIZARD_AXES,
  buildDesignReviewCheckPlan,
  buildDesignWizardState,
  evaluateDesignStyleboardReadiness,
  formatDesignWizardStatus,
  formatDesignWizardQuestion,
  parseDesignBriefPreferences,
  recordDesignWizardAnswer,
  resolveDesignViewportPolicy,
  transitionDesignWizardState,
} from "../scripts/lib/design-wizard-catalog.mjs";

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

  const markdown = formatDesignWizardQuestion(state.questionQueue.find((question) => question.axis === "visual_direction_tone"));
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

  const markdown = formatDesignWizardQuestion(state.questionQueue[0]);
  assert.match(markdown, /Шаг 1\//);
  assert.match(markdown, /Зачем:/);
  assert.match(markdown, /Что изменится:/);
  assert.match(markdown, /Если пропустить:/);
  assert.doesNotMatch(markdown, /Why:|Decision unlocked:|If skipped:|Free-form answer:|Stop condition:|\(recommended\)/);
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
