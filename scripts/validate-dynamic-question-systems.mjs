#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildDesignWizardState,
  formatDesignWizardQuestion,
} from "./lib/design-wizard-catalog.mjs";
import {
  validateSpecialistQuestionProposal as validateSpecialistQuestionContract,
} from "./lib/specialist-question-contract.mjs";
import {
  buildPostDeliveryQuestion,
  buildTransparentStepQuestion,
  formatTransparentStepQuestion,
  validateAgenticQuestion,
} from "./lib/supervibe-dialogue-contract.mjs";
import {
  goldenAntiTemplateQuestions,
  validateAllCommandQuestionSurfaces,
  validateQuestionSurface,
  validateStaticQuestionSurfaceBypasses,
} from "./lib/question-surface-contract.mjs";
import { routeTriggerRequest } from "./lib/supervibe-trigger-router.mjs";
import { routeWorkflowIntent } from "./lib/supervibe-workflow-router.mjs";

const POST_DELIVERY_CONTEXTS = Object.freeze([
  "genesis_setup",
  "prototype_delivery",
  "requirements_delivery",
  "adaptation_delivery",
  "strengthening_delivery",
  "design_delivery",
]);

export function validateDynamicQuestionSystems(options = {}) {
  const issues = [];
  const wizard = buildDesignWizardState({
    brief: "Tauri desktop app with compact density, subtle motion, graphite cyan palette",
    target: "tauri",
  });
  if (!Array.isArray(wizard.questionQueue) || wizard.questionQueue.length < 2) {
    issues.push(issue("scripts/lib/design-wizard-catalog.mjs", "missing-question-queue", "design wizard must expose a stateful questionQueue"));
  }
  for (const question of wizard.questionQueue || []) {
    if (!question.axis || !question.prompt || !question.decisionUnlocked) {
      issues.push(issue("scripts/lib/design-wizard-catalog.mjs", "weak-wizard-question", `${question.axis || "unknown"} missing axis, prompt, or decisionUnlocked`));
    }
    if ((question.choices || []).length < 3) {
      issues.push(issue("scripts/lib/design-wizard-catalog.mjs", "thin-wizard-choice-set", `${question.axis || "unknown"} must expose at least 3 choices`));
    }
    if (!question.freeFormPath || !question.stopCondition) {
      issues.push(issue("scripts/lib/design-wizard-catalog.mjs", "missing-freeform-or-stop", `${question.axis || "unknown"} missing free-form path or stop condition`));
    }
    if (!question.stage || !question.specialist || !Array.isArray(question.blocks) || question.blocks.length === 0) {
      issues.push(issue("scripts/lib/design-wizard-catalog.mjs", "missing-specialist-question-provenance", `${question.axis || "unknown"} missing stage, specialist, or blocked artifact provenance`));
    }
    if (!question.ownerAgent || !question.whyNow || !Array.isArray(question.evidence) || question.evidence.length < 2) {
      issues.push(issue("scripts/lib/design-wizard-catalog.mjs", "weak-specialist-question-engine", `${question.axis || "unknown"} missing ownerAgent, whyNow, or current evidence signals`));
    }
    if (!(question.choices || []).every((choice) => Array.isArray(choice.unlocks) && choice.unlocks.length > 0 && choice.risk)) {
      issues.push(issue("scripts/lib/design-wizard-catalog.mjs", "weak-specialist-question-options", `${question.axis || "unknown"} choices must expose unlocks and risk`));
    }
    if (!question.artifactImpact || question.canAnswerFromEvidence !== false) {
      issues.push(issue("scripts/lib/design-wizard-catalog.mjs", "weak-specialist-question-impact", `${question.axis || "unknown"} must state artifact impact and whether evidence already answers it`));
    }
  }
  if (!Array.isArray(wizard.questionProposals) || wizard.questionProposals.length !== wizard.questionQueue.length) {
    issues.push(issue("scripts/lib/design-wizard-catalog.mjs", "missing-specialist-question-contract", "design wizard must expose SpecialistQuestionContract questionProposals for every queued question"));
  }
  for (const proposal of wizard.questionProposals || []) {
    issues.push(...validateSpecialistQuestionContract(proposal, {
      file: "scripts/lib/design-wizard-catalog.mjs",
    }));
  }
  validateDesignWizardAdaptivity(issues);
  validateDesignWizardRuntimeCopy(issues);

  const postDeliveryFingerprints = [];
  for (const context of POST_DELIVERY_CONTEXTS) {
    const question = buildPostDeliveryQuestion({ command: "/supervibe" }, { context, locale: "en" });
    validateQuestionShape(question, `post-delivery:${context}`, issues, { minChoices: 5 });
    pushAgenticIssues(question, `post-delivery:${context}`, issues, { minChoices: 5, disallowGenericChoiceSet: context !== "delivery_control" });
    postDeliveryFingerprints.push(questionFingerprint(question));
  }
  if (new Set(postDeliveryFingerprints).size !== POST_DELIVERY_CONTEXTS.length) {
    issues.push(issue("scripts/lib/supervibe-dialogue-contract.mjs", "static-post-delivery-questions", "post-delivery contexts must render distinct prompts and action labels"));
  }
  validatePostDeliveryRuntimeAdaptivity(issues);
  validateRuntimeRouteQuestions(issues);
  validateUniversalQuestionSurfaces(issues);
  validateAntiTemplateGoldenCorpus(issues);
  validateStaticBypassScan(issues);
  validateCommandQuestionTemplates(issues);
  const runtimeChecked = validateRuntimeDesignRunQuestions(options, issues);

  const transparent = buildTransparentStepQuestion({
    question: "Which execution mode should this workflow use?",
    why: "This decides whether durable outputs can claim agent work.",
    decision: "executionMode",
    choices: [
      { id: "real-agents", label: "Real agents", tradeoff: "Highest quality; requires host invocation proof." },
      { id: "skills-only", label: "Skills only", tradeoff: "Deterministic work only; no agent quality claims." },
      { id: "stop", label: "Stop workflow", tradeoff: "No hidden progress." },
    ],
  });
  validateQuestionShape(transparent, "transparent-step", issues, { minChoices: 3 });
  pushAgenticIssues(transparent, "transparent-step", issues, { minChoices: 3 });

  const localizedTransparent = buildTransparentStepQuestion({
    locale: "ru",
    question: "Какой режим запускаем?",
    why: "Это влияет на следующий шаг.",
    decision: "executionMode",
    assumption: "Если пропустить, остановимся.",
    choices: [
      { id: "real-agents", label: "Реальные агенты", tradeoff: "Нужны receipts." },
      { id: "inline", label: "Черновик", tradeoff: "Без agent claims." },
      { id: "stop", label: "Остановиться", tradeoff: "Без скрытого продолжения." },
    ],
  });
  const localizedMarkdown = formatTransparentStepQuestion(localizedTransparent);
  if (/Why:|Decision unlocked:|If skipped:|\(recommended\)/.test(localizedMarkdown)) {
    issues.push(issue("scripts/lib/supervibe-dialogue-contract.mjs", "mixed-language-transparent-step", "localized transparent question leaked English scaffolding labels"));
  }

  return {
    pass: issues.length === 0,
    checked: 11 + POST_DELIVERY_CONTEXTS.length + runtimeChecked,
    issues,
  };
}

export function formatDynamicQuestionSystemsReport(result) {
  const lines = [
    "SUPERVIBE_DYNAMIC_QUESTION_SYSTEMS",
    `PASS: ${result.pass}`,
    `CHECKED: ${result.checked}`,
    `ISSUES: ${result.issues.length}`,
  ];
  for (const item of result.issues) {
    lines.push(`ISSUE: ${item.code} ${item.file} - ${item.message}`);
  }
  return lines.join("\n");
}

function validateDesignWizardAdaptivity(issues) {
  const cases = [
    {
      label: "desktop-ops",
      input: {
        brief: "Dense Tauri desktop support dashboard with compact tables, queues, and operator workflows.",
        target: "tauri",
      },
    },
    {
      label: "brand-launch",
      input: {
        brief: "Bold marketing landing page for an AI launch, hero section, conversion path, and waitlist.",
        target: "web",
      },
    },
    {
      label: "regulated-trust",
      input: {
        brief: "Compliance banking admin with audit logs, risk review, privacy, and high trust requirements.",
        target: "web",
      },
    },
    {
      label: "developer-tool",
      input: {
        brief: "Developer console for agent workflow, API logs, terminal output, code review, and debugging.",
        target: "web",
      },
    },
  ];
  const states = cases.map((item) => ({ label: item.label, state: buildDesignWizardState(item.input) }));
  const fingerprints = states.map((item) => designWizardFingerprint(item.state));
  if (new Set(fingerprints).size !== states.length) {
    issues.push(issue("scripts/lib/design-wizard-catalog.mjs", "static-design-wizard-queue", "different design briefs must not produce identical question queues and recommendations"));
  }

  const profiles = new Set(states.map((item) => item.state.questionStrategy?.profile).filter(Boolean));
  if (profiles.size < 3) {
    issues.push(issue("scripts/lib/design-wizard-catalog.mjs", "weak-design-profile-routing", "design wizard must infer multiple question profiles across different brief intents"));
  }

  const firstDesignAxes = new Set(states
    .map((item) => item.state.questionQueue.find((question) => !["mode", "viewport"].includes(question.axis))?.axis)
    .filter(Boolean));
  if (firstDesignAxes.size < 3) {
    issues.push(issue("scripts/lib/design-wizard-catalog.mjs", "static-first-design-axis", "different design briefs must prioritize different first design axes"));
  }

  const visualQuestions = states
    .map((item) => ({
      label: item.label,
      question: item.state.questionQueue.find((question) => question.axis === "visual_direction_tone"),
    }))
    .filter((item) => item.question);
  const visualIdSets = visualQuestions.map((item) => item.question.choices.map((choice) => choice.id).join("|"));
  if (new Set(visualIdSets).size < 3) {
    issues.push(issue("scripts/lib/design-wizard-catalog.mjs", "static-creative-direction-option-set", "creative-direction questions must vary visible option sets across specialist brief profiles"));
  }
  for (const item of visualQuestions) {
    const catalogLabels = new Set([
      "operational clarity",
      "technical command center",
      "premium editorial",
      "warm product utility",
      "bold launch energy",
    ]);
    const leakedCatalogLabels = (item.question.choices || []).filter((choice) => {
      const core = String(choice.label || "").toLowerCase().replace(/\s+for\s+.+$/i, "").trim();
      return catalogLabels.has(core);
    });
    if (leakedCatalogLabels.length > 0) {
      issues.push(issue("scripts/lib/design-wizard-catalog.mjs", "catalog-creative-direction-options", `${item.label} creative-direction options expose base catalog labels instead of specialist-authored choices`));
    }
  }
}

function validateDesignWizardRuntimeCopy(issues) {
  const state = buildDesignWizardState({
    brief: "Новая дизайн система десктопного приложения под агентскую систему чатов, без generic SaaS admin, code-first typography, graphite cyan, subtle motion.",
    target: "tauri",
    mode: "full-prototype-pipeline",
    initialDecisions: {
      viewport: { axis: "viewport", answer: "1440x900", source: "user" },
    },
  });
  const creative = state.questionQueue.find((question) => question.axis === "creative_alternatives");
  const visualDirection = state.questionQueue.find((question) => question.axis === "visual_direction_tone");
  const density = state.questionQueue.find((question) => question.axis === "information_density");
  const rendered = [
    creative,
    visualDirection,
    density,
  ].filter(Boolean).map((question) => {
    const choices = (question.choices || []).map((choice) => choice.label).join(" | ");
    return `${question.prompt} | ${choices}`;
  }).join("\n");

  if (!creative || !visualDirection || !density) {
    issues.push(issue("scripts/lib/design-wizard-catalog.mjs", "missing-contextual-design-axes", "agent-chat design brief must still ask creative alternatives, visual direction, and density when not answered"));
    return;
  }
  if (!/agent|агент|chat|чат/i.test(rendered)) {
    issues.push(issue("scripts/lib/design-wizard-catalog.mjs", "context-free-design-question-copy", "design wizard runtime questions must include brief/domain context"));
  }
  if (/(^|\n|\| )3 distinct directions\b|(^|\n|\| )3 разных направления\b|(^|\n|\| )Balanced\b/.test(rendered)) {
    issues.push(issue("scripts/lib/design-wizard-catalog.mjs", "static-design-choice-copy", "design wizard must not render reusable catalog labels as runtime choices for contextual briefs"));
  }
  if (/Operational clarity|Technical command center|Premium editorial|Warm product utility|Bold launch energy/i.test(rendered)) {
    issues.push(issue("scripts/lib/design-wizard-catalog.mjs", "catalog-visual-direction-runtime-copy", "agent-chat creative-direction question must not render the base catalog option list"));
  }
  const userFacingMarkdown = [creative, visualDirection, density].filter(Boolean).map((question) => formatDesignWizardQuestion(question)).join("\n");
  if (/Why:|Decision unlocked:|If skipped:|Free-form answer:|Stop condition:|\(recommended\)|\bStep\s+\d+\/\d+:|Шаг\s+\d+\/\d+:|Зачем:|Что изменится:|Если пропустить:/i.test(userFacingMarkdown)) {
    issues.push(issue("scripts/lib/design-wizard-catalog.mjs", "protocol-design-question-copy", "user-facing design questions must hide protocol scaffolding behind planner state instead of rendering it inline"));
  }
}

function validatePostDeliveryRuntimeAdaptivity(issues) {
  const agentWorkspace = buildPostDeliveryQuestion({ intent: "prototype_delivery" }, {
    locale: "en",
    subject: "agent chat approval console prototype",
    specialist: "prototype-builder",
    evidence: [
      "old prototype shows pending approvals drawer",
      "browser feedback mentions subagent/tool-call visibility",
    ],
    artifactImpact: "Controls approval state and handoff scope for the agent chat prototype.",
  });
  const billingFlow = buildPostDeliveryQuestion({ intent: "prototype_delivery" }, {
    locale: "en",
    subject: "billing recovery settings prototype",
    specialist: "prototype-builder",
    evidence: [
      "settings flow includes retry and invoice states",
      "handoff bundle targets billing admin screens",
    ],
    artifactImpact: "Controls approval state and handoff scope for the billing recovery prototype.",
  });
  pushAgenticIssues(agentWorkspace, "post-delivery:scoped-agent-workspace", issues, { minChoices: 5 });
  pushAgenticIssues(billingFlow, "post-delivery:scoped-billing-flow", issues, { minChoices: 5 });
  if (questionFingerprint(agentWorkspace) === questionFingerprint(billingFlow)) {
    issues.push(issue("scripts/lib/supervibe-dialogue-contract.mjs", "static-scoped-post-delivery-question", "same post-delivery context must adapt visible prompt/options to the concrete artifact subject"));
  }
  if (!/agent chat approval console/i.test(agentWorkspace.prompt) || !agentWorkspace.choices.some((choice) => /agent chat approval console/i.test(choice.label))) {
    issues.push(issue("scripts/lib/supervibe-dialogue-contract.mjs", "subject-missing-from-scoped-question", "scoped post-delivery questions must include the artifact subject in prompt and choices"));
  }
}

function validateRuntimeRouteQuestions(issues) {
  const designRoute = routeTriggerRequest("make a new design system for an agent chat workspace with approvals drawer", {
    artifacts: {
      designBrief: "agent chat workspace with approvals drawer",
      confirmedMutation: true,
    },
  });
  const memoryRoute = routeTriggerRequest("audit memory and codegraph health", {
    artifacts: {
      confirmedMutation: true,
    },
  });
  const workflowRoute = routeWorkflowIntent({
    userPhrase: "run it",
    lastCompletedPhase: "plan",
    artifacts: { plan: true },
  });
  const topicDriftRoute = routeWorkflowIntent({
    userPhrase: "also build a dashboard",
    recentAssistantOutput: [
      "NEXT_STEP_HANDOFF",
      "Current phase: brainstorm",
      "Artifact: .supervibe/artifacts/specs/agent-chat.md",
      "Next phase: plan",
      "Next command: /supervibe-plan",
      "Next skill: supervibe:writing-plans",
      "Stop condition: ask-before-plan",
      "Why: A brainstorm is not executable until it becomes a plan.",
      "Question: Step 1/1: write the implementation plan from the approved spec?",
      "END_NEXT_STEP_HANDOFF",
    ].join("\n"),
  });

  for (const [label, route] of [
    ["trigger:design", designRoute],
    ["trigger:memory", memoryRoute],
    ["workflow:plan-review", workflowRoute],
    ["workflow:topic-drift", topicDriftRoute],
  ]) {
    pushAgenticIssues(routeQuestionAdapter(route), label, issues, { minChoices: label.includes("topic-drift") ? 4 : 3 });
  }

  const fingerprints = [designRoute, memoryRoute, workflowRoute, topicDriftRoute]
    .map((route) => routeChoiceFingerprint(route));
  if (new Set(fingerprints).size !== fingerprints.length) {
    issues.push(issue("scripts/lib/supervibe-workflow-router.mjs", "static-runtime-route-choice-set", "runtime route questions must expose context-specific visible option lists across commands and workflow states"));
  }
  if ((topicDriftRoute.questionChoices || []).some((choice) => choice.label === choice.id)) {
    issues.push(issue("scripts/lib/supervibe-workflow-router.mjs", "raw-topic-drift-choice-id", "topic drift resume choices must not expose raw ids as visible labels"));
  }
}

function validateUniversalQuestionSurfaces(issues) {
  const commandSurfaces = validateAllCommandQuestionSurfaces();
  for (const item of commandSurfaces.issues) {
    issues.push(issue(item.file, item.code, item.message));
  }

  const commandsRoot = fileURLToPath(new URL("../commands/", import.meta.url));
  let files = [];
  try {
    files = readdirSync(commandsRoot).filter((file) => file.endsWith(".md")).sort();
  } catch {
    issues.push(issue("commands", "missing-command-directory", "could not read commands directory for universal question surface validation"));
    return;
  }

  for (const file of files) {
    const commandId = `/${file.replace(/\.md$/, "")}`;
    for (const locale of ["en", "ru"]) {
      const route = routeTriggerRequest(`${commandId} ${locale === "ru" ? "пользовательский запрос" : "user request"}`, {
        pluginRoot: fileURLToPath(new URL("../", import.meta.url)),
        projectRoot: fileURLToPath(new URL("../", import.meta.url)),
        artifacts: {
          userRequest: true,
          request: true,
          confirmedMutation: true,
        },
      });
      if (!route.questionSurface) {
        issues.push(issue("scripts/lib/supervibe-trigger-router.mjs", "missing-route-question-surface", `${commandId}:${locale} route missing questionSurface`));
        continue;
      }
      const surfaceIssues = validateQuestionSurface(route.questionSurface, {
        surface: `${commandId}:${locale}:route`,
      });
      for (const item of surfaceIssues) {
        issues.push(issue("scripts/lib/question-surface-contract.mjs", item.code, item.message));
      }
      if (!route.visibleQuestionPrompt || route.visibleQuestionPrompt !== route.questionSurface.prompt) {
        issues.push(issue("scripts/lib/supervibe-trigger-router.mjs", "missing-visible-question-prompt", `${commandId}:${locale} must expose questionSurface.prompt as visibleQuestionPrompt`));
      }
    }
  }
}

function validateAntiTemplateGoldenCorpus(issues) {
  for (const bad of goldenAntiTemplateQuestions()) {
    const result = validateAgenticQuestion(bad, {
      surface: `golden:${bad.id}`,
      minChoices: 3,
    });
    if (result.length === 0) {
      issues.push(issue("scripts/lib/question-surface-contract.mjs", "anti-template-fixture-passed", `${bad.id} bad question fixture unexpectedly passed validation`));
    }
  }
}

function validateStaticBypassScan(issues) {
  const result = validateStaticQuestionSurfaceBypasses(fileURLToPath(new URL("../", import.meta.url)));
  for (const item of result.issues) {
    issues.push(issue(item.file, item.code, item.message));
  }
}

function designWizardFingerprint(state = {}) {
  const queue = (state.questionQueue || []).slice(0, 6).map((question) => {
    const recommended = (question.choices || []).find((choice) => choice.recommended)?.id || "none";
    return `${question.axis}:${recommended}:${question.prompt}`;
  });
  return [
    state.questionStrategy?.profile || "none",
    ...queue,
  ].join("|");
}

function routeQuestionAdapter(route = {}) {
  return {
    prompt: route.nextQuestion || route.nextPromptText,
    choices: route.questionChoices || route.nextQuestionChoices || [],
    locale: /[а-яё]/i.test(route.nextQuestion || route.nextPromptText || "") ? "ru" : "en",
    specialist: route.questionSpecialist || route.agentProfile?.ownerAgentId || route.skill,
    evidence: route.questionEvidence || route.routingEvidence || [],
    artifactImpact: route.questionArtifactImpact,
  };
}

function routeChoiceFingerprint(route = {}) {
  return (route.questionChoices || route.nextQuestionChoices || [])
    .map((choice) => `${choice.id}:${choice.label}:${choice.tradeoff}`)
    .join("|");
}

function pushAgenticIssues(question, label, issues, options = {}) {
  for (const item of validateAgenticQuestion(question, {
    surface: label,
    ...options,
  })) {
    issues.push(issue("scripts/lib/supervibe-dialogue-contract.mjs", item.code, `${label}: ${item.message}`));
  }
}

function questionFingerprint(question = {}) {
  const choices = (question.choices || []).map((choice) => {
    return `${choice.id}:${choice.label}:${choice.tradeoff || choice.description || ""}`;
  }).join("|");
  return `${question.context || ""}:${question.prompt || ""}:${question.recommendation || ""}:${choices}`;
}

function validateCommandQuestionTemplates(issues) {
  const commandsRoot = fileURLToPath(new URL("../commands/", import.meta.url));
  let files = [];
  try {
    files = readdirSync(commandsRoot).filter((file) => file.endsWith(".md")).sort();
  } catch {
    issues.push(issue("commands", "missing-command-directory", "command question template audit could not read commands directory"));
    return;
  }

  for (const file of files) {
    const path = join(commandsRoot, file);
    const content = readFileSync(path, "utf8");
    const literalStepMatches = [...content.matchAll(/\bStep\s+(?!0(?:b)?\/N\b)(\d+)\/(\d+)\s*:/gi)];
    for (const match of literalStepMatches) {
      issues.push(issue(`commands/${file}`, "static-command-step-template", `use adaptive Step N/M instead of literal ${match[0]}`));
    }
  }
}

function validateRuntimeDesignRunQuestions({
  rootDir = process.cwd(),
  slug = "",
  requireTrustedSpecialistProposal = false,
} = {}, issues = []) {
  if (!slug) return 0;
  const configPath = join(rootDir, ".supervibe", "artifacts", "prototypes", slug, "config.json");
  if (!existsSync(configPath)) {
    issues.push(issue(normalizePath(configPath), "missing-design-run-config", `slug ${slug} has no prototype config.json`));
    return 1;
  }

  let config = null;
  try {
    config = JSON.parse(readFileSync(configPath, "utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    issues.push(issue(normalizePath(configPath), "invalid-design-run-config", `could not parse config.json: ${error.message}`));
    return 1;
  }

  const queue = Array.isArray(config.designWizard?.questionQueue)
    ? config.designWizard.questionQueue
    : [];
  const trusted = queue.filter((question) => question.trustedSpecialistProposal === true && question.source === "real-specialist-proposal");
  if (requireTrustedSpecialistProposal && queue.length > 0 && trusted.length === 0) {
    issues.push(issue(
      normalizePath(configPath),
      "missing-trusted-runtime-specialist-question",
      `slug ${slug} has ${queue.length} queued questions but 0 trusted real-specialist-proposal questions; show the specialist proposal gate instead of agent-authored wording`,
    ));
  }

  for (const question of queue) {
    const label = `${slug}:${question.axis || question.id || "unknown"}`;
    if (!question.ownerAgent || !Array.isArray(question.evidence) || question.evidence.length < 2 || !question.artifactImpact || !question.whyNow) {
      issues.push(issue(normalizePath(configPath), "weak-runtime-question-provenance", `${label} missing ownerAgent, evidence, artifactImpact, or whyNow`));
    }
    if (question.source === "real-specialist-proposal" || question.trustedSpecialistProposal === true) {
      issues.push(...validateSpecialistQuestionContract(question, {
        file: normalizePath(configPath),
        requireRealSpecialistProposal: true,
      }));
      continue;
    }
    if (question.source !== "fallback-scratch-question") {
      issues.push(issue(normalizePath(configPath), "ambiguous-runtime-question-source", `${label} must use real-specialist-proposal or explicit fallback-scratch-question source`));
    }
    if (question.visibleOnlyWhenTrusted !== true) {
      issues.push(issue(normalizePath(configPath), "fallback-question-presented-as-specialist", `${label} is fallback but is not hidden behind visibleOnlyWhenTrusted=true`));
    }
  }

  return Math.max(1, queue.length);
}

function validateQuestionShape(question, label, issues, { minChoices }) {
  if (!question?.prompt) {
    issues.push(issue("scripts/lib/supervibe-dialogue-contract.mjs", "missing-question-prompt", `${label} missing prompt`));
  }
  if ((question?.choices || []).length < minChoices) {
    issues.push(issue("scripts/lib/supervibe-dialogue-contract.mjs", "thin-choice-set", `${label} requires at least ${minChoices} choices`));
  }
  for (const choice of question?.choices || []) {
    if (!choice.id || !choice.label || !(choice.tradeoff || choice.description)) {
      issues.push(issue("scripts/lib/supervibe-dialogue-contract.mjs", "weak-choice", `${label}:${choice.id || "unknown"} missing id, label, or tradeoff`));
    }
  }
}

function issue(file, code, message) {
  return { file, code, message };
}

function cliArg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function normalizePath(path = "") {
  return String(path || "").replace(/\\/g, "/");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = validateDynamicQuestionSystems({
    rootDir: cliArg("--root", process.cwd()),
    slug: cliArg("--slug", ""),
    requireTrustedSpecialistProposal: process.argv.includes("--require-trusted-specialist-proposal"),
  });
  console.log(formatDynamicQuestionSystemsReport(result));
  process.exit(result.pass ? 0 : 1);
}
