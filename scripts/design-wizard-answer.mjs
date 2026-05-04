#!/usr/bin/env node
import { mkdir, open, readFile, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildDesignWizardState,
  recordDesignWizardAnswer,
} from "./lib/design-wizard-catalog.mjs";
import {
  designWizardRuntimeStatePath,
  designWizardStateLockPath,
  readDesignWizardRuntimeState,
  summarizeDesignWizardState,
  writeDesignWizardRuntimeState,
} from "./lib/design-wizard-runtime-state.mjs";

const VALUE_ARGS = new Map([
  ["--root", "root"],
  ["--slug", "slug"],
  ["--axis", "axis"],
  ["--choice", "choiceId"],
  ["--choice-id", "choiceId"],
  ["--choices", "choiceIds"],
  ["--value", "value"],
  ["--answer", "value"],
  ["--source", "source"],
  ["--timestamp", "timestamp"],
  ["--config", "configPath"],
  ["--runtime-state", "runtimeStatePath"],
  ["--quote", "quote"],
  ["--expected-revision", "expectedRevision"],
]);

const BOOLEAN_ARGS = new Map([
  ["--accept-recommended-remaining", "acceptRecommendedRemaining"],
  ["--wait-for-lock", "waitForLock"],
  ["--help", "help"],
]);

const CONFIG_LOCK_TIMEOUT_MS = 10_000;
const CONFIG_LOCK_RETRY_MS = 20;
const CONFIG_LOCK_STALE_MS = 120_000;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => fail(error.message));
}

async function main() {
  const options = parseArgs(process.argv);
  if (options.help) {
    console.log(usage());
    return;
  }

  const root = options.root || process.cwd();
  const slug = options.slug || "";
  const axis = options.axis || "";
  const source = options.source || "user";
  const timestamp = options.timestamp || new Date().toISOString();
  const acceptRecommendedRemaining = options.acceptRecommendedRemaining === true;
  const configPath = options.configPath || (slug
    ? join(root, ".supervibe", "artifacts", "prototypes", slug, "config.json")
    : "");
  const runtimeStatePath = options.runtimeStatePath || designWizardRuntimeStatePath(root, { slug, configPath });
  const lockPath = designWizardStateLockPath(root, { slug, configPath });

  if (!configPath) throw new Error("Missing --slug or --config");
  if (!axis && !acceptRecommendedRemaining) throw new Error("Missing --axis or --accept-recommended-remaining");

  let finalState = null;
  let finalRevision = 0;
  const updatedAxes = [];

  await withDesignWizardStateLock({
    root,
    slug,
    configPath,
    lockPath,
    waitForLock: options.waitForLock === true,
  }, async () => {
    const config = await readDesignConfig(configPath);
    const currentRevision = designConfigRevision(config);
    if (options.expectedRevision !== undefined && String(options.expectedRevision) !== String(currentRevision)) {
      throw new Error(`config revision mismatch: expected ${options.expectedRevision}, got ${currentRevision}`);
    }

    const runtimeState = readDesignWizardRuntimeState(root, config);
    const initialDecisions = extractPersistedDesignDecisions(config, runtimeState);
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
      const selectedChoiceIds = resolveChoiceIds({
        question: targetQuestion,
        choiceId: options.choiceId || "",
        choiceIds: options.choiceIds || "",
        value: options.value || "",
      });
      state = recordDesignWizardAnswer(state, {
        axis,
        choiceId: selectedChoiceIds[0] || "",
        choiceIds: selectedChoiceIds,
        value: options.value || "",
        source,
        timestamp,
        quote: options.quote || options.value || selectedChoiceIds.join(",") || "CLI-recorded design wizard answer",
      });
      updatedAxes.push(axis);
    }

    finalRevision = currentRevision + 1;
    await writeDesignWizardRuntimeState(root, runtimeStatePath, {
      ...state,
      configRevision: finalRevision,
      runtimeStatePath,
      updatedAt: timestamp,
    });
    const nextConfig = {
      ...config,
      mode: state.mode || config.mode || null,
      target: state.target || config.target || "unknown",
      configRevision: finalRevision,
      designWizardRuntimeStatePath: runtimeStatePath,
      designWizard: summarizeDesignWizardState(state, {
        configRevision: finalRevision,
        runtimeStatePath,
        updatedAt: timestamp,
      }),
      updatedAt: timestamp,
    };
    await writeDesignConfigAtomic(configPath, nextConfig);
    finalState = state;
  });

  console.log([
    "SUPERVIBE_DESIGN_WIZARD_ANSWER",
    `CONFIG: ${normalizePath(configPath)}`,
    `RUNTIME_STATE: ${normalizePath(runtimeStatePath)}`,
    `STATE_LOCK: ${normalizePath(lockPath)}`,
    `CONFIG_REVISION: ${finalRevision}`,
    `AXES_UPDATED: ${updatedAxes.join(",") || "none"}`,
    `SOURCE: ${source}`,
    `TOKENS_UNLOCKED: ${finalState?.gates?.tokensUnlocked === true}`,
    `DELEGATED_REVIEW_REQUIRED: ${finalState?.gates?.delegatedReviewRequired === true}`,
    `NEXT: ${finalState?.questionQueue?.[0]?.axis || "none"}`,
    `CONTINUE_COMMAND: node scripts/design-agent-plan.mjs --root ${quoteCli(root)} --slug ${quoteCli(slug || slugFromConfigPath(configPath))} --continue --dispatch --status --plan-writes`,
  ].join("\n"));
}

function parseArgs(argv) {
  const options = {
    root: process.cwd(),
    source: "user",
    timestamp: new Date().toISOString(),
  };
  for (let index = 2; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) throw new Error(`Unexpected positional argument: ${item}`);
    if (BOOLEAN_ARGS.has(item)) {
      options[BOOLEAN_ARGS.get(item)] = true;
      continue;
    }
    if (!VALUE_ARGS.has(item)) throw new Error(`Unknown argument: ${item}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`Missing value for ${item}`);
    const target = VALUE_ARGS.get(item);
    if ((target === "choiceId" || target === "choiceIds") && options[target]) {
      options[target] = `${options[target]},${value}`;
    } else {
      options[target] = value;
    }
    index += 1;
  }
  return options;
}

async function readDesignConfig(configPath) {
  let raw = "";
  try {
    raw = await readFile(configPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw error;
  }
  try {
    return JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new Error(`Could not parse ${configPath}: ${error.message}`);
  }
}

async function writeDesignConfigAtomic(configPath, config) {
  await mkdir(dirname(configPath), { recursive: true });
  const tempPath = `${configPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(tempPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    await rename(tempPath, configPath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}

async function withDesignWizardStateLock({
  root,
  slug = "",
  configPath,
  lockPath,
  waitForLock = false,
}, callback) {
  const absLockPath = join(root, ...normalizeRelPath(lockPath).split("/"));
  await mkdir(dirname(absLockPath), { recursive: true });
  const started = Date.now();
  let handle = null;
  while (!handle) {
    try {
      handle = await open(absLockPath, "wx");
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      await removeStaleLock(absLockPath);
      if (!waitForLock) {
        throw new Error(`wizard state is already locked for ${slug || slugFromConfigPath(configPath)}: ${normalizePath(lockPath)}; rerun after the current writer finishes or pass --wait-for-lock`);
      }
      if (Date.now() - started > CONFIG_LOCK_TIMEOUT_MS) {
        throw new Error(`Timed out waiting for config lock: ${normalizePath(lockPath)}`);
      }
      await sleep(CONFIG_LOCK_RETRY_MS);
    }
  }

  try {
    await handle.writeFile(`${JSON.stringify({
      pid: process.pid,
      slug: slug || slugFromConfigPath(configPath),
      configPath: normalizePath(configPath),
      startedAt: new Date().toISOString(),
    })}\n`, "utf8");
    return await callback();
  } finally {
    await handle.close();
    await unlink(absLockPath).catch((error) => {
      if (error?.code !== "ENOENT") throw error;
    });
  }
}

async function removeStaleLock(lockPath) {
  try {
    const info = await stat(lockPath);
    if (Date.now() - info.mtimeMs > CONFIG_LOCK_STALE_MS) await unlink(lockPath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function designConfigRevision(config = {}) {
  const raw = config.configRevision ?? config.designWizard?.configRevision ?? config.revision ?? 0;
  const number = Number(raw);
  return Number.isInteger(number) && number >= 0 ? number : 0;
}

function extractPersistedDesignDecisions(config = {}, runtimeState = null) {
  const decisions = {
    ...(runtimeState?.decisions || {}),
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

function resolveChoiceIds({ question = null, choiceId = "", choiceIds = "", value = "" } = {}) {
  const explicit = splitChoiceIds(choiceIds || choiceId);
  if (explicit.length > 0) return explicit;
  const inferred = inferChoiceIdsFromAnswer(question, value);
  if (inferred.length > 0) return inferred;
  return [question?.recommendedOption || question?.choices?.find((choice) => choice.recommended)?.id || ""].filter(Boolean);
}

function inferChoiceIdsFromAnswer(question = null, value = "") {
  const normalized = normalizeChoiceText(value);
  if (!question || !normalized) return [];
  const choices = question.choices || [];
  const numeric = numericChoiceIds(choices, value);
  if (numeric.length > 0) return numeric;
  const direct = splitChoiceIds(value);
  const exactMatches = direct
    .map((part) => choices.find((choice) => normalizeChoiceText(choice.id) === normalizeChoiceText(part)))
    .filter(Boolean)
    .map((choice) => choice.id);
  if (exactMatches.length > 0) return [...new Set(exactMatches)];
  const labelMatches = choices.filter((choice) => {
    const label = normalizeChoiceText(choice.label);
    return label === normalized || label.includes(normalized) || normalized.includes(label);
  }).map((choice) => choice.id);
  if (labelMatches.length > 0) return [...new Set(labelMatches)];
  if (question.axis === "viewport" && /\b\d{3,4}x\d{3,4}\b/.test(normalized)) {
    return choices.some((choice) => choice.id === "custom") ? ["custom"] : [];
  }
  return [];
}

function splitChoiceIds(value = "") {
  return String(value || "")
    .split(/[,+;]|\s+(?:and|\u0438)\s+/i)
    .map((item) => item.trim())
    .filter(Boolean);
}

function numericChoiceIds(choices = [], value = "") {
  const matches = String(value || "").match(/\b\d+\b/g) || [];
  const ids = [];
  for (const match of matches) {
    const index = Number(match) - 1;
    if (Number.isInteger(index) && index >= 0 && index < choices.length) {
      ids.push(choices[index].id);
    }
  }
  return [...new Set(ids)];
}

function normalizeChoiceText(value = "") {
  return String(value || "").trim().toLowerCase().replace(/\s*[x×]\s*/g, "x").replace(/\s+/g, " ");
}

function normalizePath(path = "") {
  return String(path || "").replace(/\\/g, "/");
}

function normalizeRelPath(path = "") {
  return normalizePath(path).replace(/^\.\//, "");
}

function slugFromConfigPath(configPath = "") {
  const normalized = normalizePath(configPath);
  const match = normalized.match(/\/prototypes\/([^/]+)\/config\.json$/);
  return match?.[1] || "design-run";
}

function quoteCli(value = "") {
  const raw = String(value || "");
  if (!raw) return "\"\"";
  return `"${raw.replace(/"/g, "\\\"")}"`;
}

function usage() {
  return [
    "SUPERVIBE_DESIGN_WIZARD_ANSWER_HELP",
    "USAGE:",
    "  node scripts/design-wizard-answer.mjs --slug <slug> --axis <axis> --choice <choice-id>",
    "  node scripts/design-wizard-answer.mjs --slug <slug> --axis <axis> --choices <choice-id-1,choice-id-2>",
    "  node scripts/design-wizard-answer.mjs --config <path> --axis viewport --answer 1920x1080",
    "",
    "NOTES:",
    "  --answer is an alias for --value; multi-choice axes accept --choices or answers like \"1 and 3\".",
    "  Unknown arguments fail fast.",
    "  Wizard runtime state is stored outside config.json; config.json keeps a compact pointer and decisions summary.",
    "  Writes use a slug-level command lock, atomic rename, and configRevision increment.",
    "  Use --wait-for-lock only when the caller intentionally wants to serialize behind an active writer.",
  ].join("\n");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fail(message) {
  console.error(`SUPERVIBE_DESIGN_WIZARD_ANSWER_ERROR: ${message}`);
  process.exit(1);
}
