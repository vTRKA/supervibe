#!/usr/bin/env node
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

  for (const context of POST_DELIVERY_CONTEXTS) {
    const question = buildPostDeliveryQuestion({ command: "/supervibe" }, { context, locale: "en" });
    validateQuestionShape(question, `post-delivery:${context}`, issues, { minChoices: 5 });
  }

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
    checked: 2 + POST_DELIVERY_CONTEXTS.length,
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
