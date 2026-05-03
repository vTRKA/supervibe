#!/usr/bin/env node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildDesignWizardState,
} from "./lib/design-wizard-catalog.mjs";
import {
  buildPostDeliveryQuestion,
  buildTransparentStepQuestion,
  formatTransparentStepQuestion,
} from "./lib/supervibe-dialogue-contract.mjs";

const POST_DELIVERY_CONTEXTS = Object.freeze([
  "genesis_setup",
  "prototype_delivery",
  "requirements_delivery",
  "adaptation_delivery",
  "strengthening_delivery",
  "design_delivery",
]);

export function validateDynamicQuestionSystems() {
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
  }
  validateDesignWizardAdaptivity(issues);
  validateDesignWizardRuntimeCopy(issues);

  const postDeliveryFingerprints = [];
  for (const context of POST_DELIVERY_CONTEXTS) {
    const question = buildPostDeliveryQuestion({ command: "/supervibe" }, { context, locale: "en" });
    validateQuestionShape(question, `post-delivery:${context}`, issues, { minChoices: 5 });
    postDeliveryFingerprints.push(questionFingerprint(question));
  }
  if (new Set(postDeliveryFingerprints).size !== POST_DELIVERY_CONTEXTS.length) {
    issues.push(issue("scripts/lib/supervibe-dialogue-contract.mjs", "static-post-delivery-questions", "post-delivery contexts must render distinct prompts and action labels"));
  }
  validateCommandQuestionTemplates(issues);

  const transparent = buildTransparentStepQuestion({
    question: "Which execution mode should this workflow use?",
    why: "This decides whether durable outputs can claim agent work.",
    decision: "executionMode",
    choices: [
      { id: "real-agents", label: "Real agents", tradeoff: "Highest quality; requires host invocation proof." },
      { id: "skills-only", label: "Skills only", tradeoff: "Deterministic work only; no agent quality claims." },
      { id: "stop", label: "Stop", tradeoff: "No hidden progress." },
    ],
  });
  validateQuestionShape(transparent, "transparent-step", issues, { minChoices: 3 });

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
    checked: 8 + POST_DELIVERY_CONTEXTS.length,
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
  const density = state.questionQueue.find((question) => question.axis === "information_density");
  const rendered = [
    creative,
    density,
  ].filter(Boolean).map((question) => {
    const choices = (question.choices || []).map((choice) => choice.label).join(" | ");
    return `${question.prompt} | ${choices}`;
  }).join("\n");

  if (!creative || !density) {
    issues.push(issue("scripts/lib/design-wizard-catalog.mjs", "missing-contextual-design-axes", "agent-chat design brief must still ask creative alternatives and density when not answered"));
    return;
  }
  if (!/agent|агент|chat|чат/i.test(rendered)) {
    issues.push(issue("scripts/lib/design-wizard-catalog.mjs", "context-free-design-question-copy", "design wizard runtime questions must include brief/domain context"));
  }
  if (/(^|\n|\| )3 distinct directions\b|(^|\n|\| )3 разных направления\b|(^|\n|\| )Balanced\b/.test(rendered)) {
    issues.push(issue("scripts/lib/design-wizard-catalog.mjs", "static-design-choice-copy", "design wizard must not render reusable catalog labels as runtime choices for contextual briefs"));
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = validateDynamicQuestionSystems();
  console.log(formatDynamicQuestionSystemsReport(result));
  process.exit(result.pass ? 0 : 1);
}
