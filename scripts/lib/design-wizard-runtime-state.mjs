import { existsSync, readFileSync } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";

export function designWizardRuntimeStatePath(rootDir = process.cwd(), {
  slug = "",
  configPath = "",
} = {}) {
  const id = sanitizeStateId(slug || configPath || "design-run");
  return normalizeRelPath(`.supervibe/memory/design-wizard/${id}.runtime.json`);
}

export function designWizardStateLockPath(rootDir = process.cwd(), {
  slug = "",
  configPath = "",
} = {}) {
  const id = sanitizeStateId(slug || configPath || "design-run");
  return normalizeRelPath(`.supervibe/memory/locks/design-wizard/${id}.lock`);
}

export function readDesignWizardRuntimeState(rootDir = process.cwd(), config = {}) {
  const relPath = config?.designWizard?.runtimeStatePath
    || config?.designWizardRuntimeStatePath
    || null;
  if (!relPath) return null;
  const absPath = join(rootDir, ...normalizeRelPath(relPath).split("/"));
  if (!existsSync(absPath)) return null;
  try {
    return JSON.parse(readFileSync(absPath, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
}

export async function writeDesignWizardRuntimeState(rootDir = process.cwd(), relPath, state = {}) {
  if (!relPath) throw new Error("design wizard runtime state path required");
  const absPath = join(rootDir, ...normalizeRelPath(relPath).split("/"));
  await mkdir(dirname(absPath), { recursive: true });
  const tempPath = `${absPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    await rename(tempPath, absPath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
  return normalizeRelPath(relative(rootDir, absPath));
}

export function summarizeDesignWizardState(state = {}, {
  configRevision = 0,
  runtimeStatePath = "",
  updatedAt = null,
} = {}) {
  return {
    schemaVersion: state.schemaVersion || 1,
    storage: "external-runtime-state",
    runtimeStatePath: normalizeRelPath(runtimeStatePath),
    configRevision,
    locale: state.locale || "en",
    mode: state.mode || null,
    target: state.target || "unknown",
    designSystemStatus: state.designSystemStatus || "missing",
    decisions: state.decisions || {},
    coverage: state.coverage || {},
    gates: state.gates || {},
    runtimeStatus: state.runtimeStatus || {},
    resumeToken: state.resumeToken || state.runtimeStatus?.resumeToken || null,
    nextQuestionAxis: state.runtimeStatus?.nextQuestionAxis || state.questionQueue?.[0]?.axis || null,
    queuedQuestions: Array.isArray(state.questionQueue) ? state.questionQueue.length : 0,
    questionProposals: Array.isArray(state.questionProposals) ? state.questionProposals.length : 0,
    updatedAt,
  };
}

export function mergeRuntimeDesignWizardConfig(rootDir = process.cwd(), config = {}) {
  const runtime = readDesignWizardRuntimeState(rootDir, config);
  if (!runtime) return config;
  return {
    ...config,
    designWizard: {
      ...(config.designWizard || {}),
      ...runtime,
      runtimeStatePath: config.designWizard?.runtimeStatePath || config.designWizardRuntimeStatePath || null,
    },
  };
}

function sanitizeStateId(value = "") {
  return String(value || "design-run")
    .toLowerCase()
    .replace(/[\\/]+/g, "-")
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || "design-run";
}

function normalizeRelPath(path = "") {
  return String(path || "").split(sep).join("/").replace(/^\.\//, "");
}
