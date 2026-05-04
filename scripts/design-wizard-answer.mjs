#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildDesignWizardState,
  recordDesignWizardAnswer,
} from "./lib/design-wizard-catalog.mjs";

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = arg("--root", process.cwd());
  const slug = arg("--slug", "");
  const axis = arg("--axis", "");
  const choiceId = arg("--choice", arg("--choice-id", ""));
  const value = arg("--value", "");
  const source = arg("--source", "user");
  const timestamp = arg("--timestamp", new Date().toISOString());
  const acceptRecommendedRemaining = hasFlag("--accept-recommended-remaining");
  const configPath = arg("--config", slug
    ? join(root, ".supervibe", "artifacts", "prototypes", slug, "config.json")
    : "");

  if (!configPath) fail("Missing --slug or --config");
  if (!axis && !acceptRecommendedRemaining) fail("Missing --axis or --accept-recommended-remaining");

  const config = await readDesignConfig(configPath);
  const initialDecisions = extractPersistedDesignDecisions(config);
  let state = buildDesignWizardState({
    brief: config.brief || config.userBrief || "",
    target: config.target || "unknown",
    designSystemStatus: config.designSystemStatus || config.designSystem?.status || "missing",
    mode: config.mode || config.designWizard?.mode || null,
    currentWindow: config.currentWindow || null,
    deviceScaleFactor: config.deviceScaleFactor ?? null,
    initialDecisions,
    locale: config.locale || config.designWizard?.locale || null,
    timestamp,
  });

  const updatedAxes = [];
  if (acceptRecommendedRemaining) {
    for (const question of [...state.questionQueue]) {
      const selected = recommendedChoiceFor(question);
      if (!selected) continue;
      state = recordDesignWizardAnswer(state, {
        axis: question.axis,
        choiceId: selected.id,
        value: selected.label,
        source,
        timestamp,
        quote: `Accepted specialist recommendation for ${question.axis}.`,
      });
      updatedAxes.push(question.axis);
    }
  } else {
    const targetQuestion = state.questionQueue.find((question) => question.axis === axis);
    const selectedChoiceId = choiceId || targetQuestion?.recommendedOption || targetQuestion?.choices?.find((choice) => choice.recommended)?.id || "";
    state = recordDesignWizardAnswer(state, {
      axis,
      choiceId: selectedChoiceId,
      value,
      source,
      timestamp,
      quote: arg("--quote", value || selectedChoiceId || "CLI-recorded design wizard answer"),
    });
    updatedAxes.push(axis);
  }

  const nextConfig = {
    ...config,
    mode: state.mode || config.mode || null,
    target: state.target || config.target || "unknown",
    designWizard: state,
    updatedAt: timestamp,
  };
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");

  console.log([
    "SUPERVIBE_DESIGN_WIZARD_ANSWER",
    `CONFIG: ${normalizePath(configPath)}`,
    `AXES_UPDATED: ${updatedAxes.join(",") || "none"}`,
    `SOURCE: ${source}`,
    `TOKENS_UNLOCKED: ${state.gates?.tokensUnlocked === true}`,
    `DELEGATED_REVIEW_REQUIRED: ${state.gates?.delegatedReviewRequired === true}`,
    `NEXT: ${state.questionQueue?.[0]?.axis || "none"}`,
  ].join("\n"));
}

async function readDesignConfig(configPath) {
  if (!existsSync(configPath)) return {};
  try {
    return JSON.parse(await readFile(configPath, "utf8"));
  } catch (error) {
    throw new Error(`Could not parse ${configPath}: ${error.message}`);
  }
}

function extractPersistedDesignDecisions(config = {}) {
  const decisions = {
    ...(config.designWizard?.decisions || {}),
    ...(config.decisions || {}),
  };
  if (!decisions.viewport && Array.isArray(config.viewports) && config.viewports.length > 0) {
    decisions.viewport = viewportDecisionFromConfig(config.viewports[0]);
  }
  return decisions;
}

function viewportDecisionFromConfig(viewport = {}) {
  const width = viewport.width || viewport.w || viewport[0] || "";
  const height = viewport.height || viewport.h || viewport[1] || "";
  return {
    axis: "viewport",
    answer: width && height ? `${width}x${height}` : JSON.stringify(viewport),
    choiceId: "custom",
    source: "user",
    confidence: 0.85,
    quote: "Persisted viewport config",
    prompt: "Viewport policy",
    decisionUnlocked: "config.json.viewports",
  };
}

function recommendedChoiceFor(question = {}) {
  const recommendedId = question.recommendedOption || question.choices?.find((choice) => choice.recommended)?.id;
  return (question.choices || []).find((choice) => choice.id === recommendedId) || question.choices?.[0] || null;
}

function normalizePath(path = "") {
  return String(path || "").replace(/\\/g, "/");
}

function fail(message) {
  console.error(`SUPERVIBE_DESIGN_WIZARD_ANSWER_ERROR: ${message}`);
  process.exit(1);
}
