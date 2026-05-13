#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

export const PLAN_LIFECYCLE_STATUSES = Object.freeze([
  "active",
  "reviewed",
  "atomized",
  "executing",
  "completed",
  "closed",
  "archived",
  "superseded",
]);

const ARCHIVE_STATUSES = new Set(["completed", "closed", "archived", "superseded"]);
const OPEN_STATUSES = new Set(["active", "reviewed", "atomized", "executing"]);
const SCHEMA_VERSION = 1;

export function defaultActivePlanPointerPath(rootDir = process.cwd()) {
  return join(rootDir, ".supervibe", "memory", "active-plan.json");
}

export function defaultPlanArchiveIndexPath(rootDir = process.cwd()) {
  return join(rootDir, ".supervibe", "artifacts", "plans", "_archive", "index.json");
}

export function readPlanArchiveIndex({ rootDir = process.cwd(), indexPath = defaultPlanArchiveIndexPath(rootDir) } = {}) {
  return normalizeArchiveIndex(readJsonSync(indexPath, { schemaVersion: SCHEMA_VERSION, plans: [] }));
}

export function readActivePlanPointer({ rootDir = process.cwd(), pointerPath = defaultActivePlanPointerPath(rootDir) } = {}) {
  const pointer = readJsonSync(pointerPath, null);
  if (!pointer) return null;
  const activePlanPath = pointer.activePlanPath || pointer.path || null;
  if (!activePlanPath) return null;
  return {
    schemaVersion: Number(pointer.schemaVersion || SCHEMA_VERSION),
    activePlanPath: normalizeProjectPath(rootDir, activePlanPath),
    status: normalizeLifecycleStatus(pointer.status || "active"),
    updatedAt: pointer.updatedAt || null,
    source: pointer.source || "active-plan-pointer",
    receiptId: pointer.receiptId || null,
  };
}

export function readPlanLifecycleState({ rootDir = process.cwd() } = {}) {
  const resolvedRoot = resolve(rootDir);
  const pointer = readActivePlanPointer({ rootDir: resolvedRoot });
  const registryPlans = collectRegistryPlanStatuses(resolvedRoot);
  const archiveIndex = readPlanArchiveIndex({ rootDir: resolvedRoot });
  const planFiles = listPlanMarkdownPaths(resolvedRoot);
  const archiveByKey = new Map();
  for (const entry of archiveIndex.plans) {
    archiveByKey.set(planKey(resolvedRoot, entry.path), entry);
  }
  const registryByKey = new Map();
  for (const entry of registryPlans) {
    if (!registryByKey.has(planKey(resolvedRoot, entry.path))) registryByKey.set(planKey(resolvedRoot, entry.path), entry);
  }

  const activePlan = pointer || inferActivePlanFromRegistry(resolvedRoot, registryPlans);
  const activeKey = activePlan?.activePlanPath ? planKey(resolvedRoot, activePlan.activePlanPath) : null;
  const seenKeys = new Set();
  const plans = [];

  for (const filePath of planFiles) {
    const path = normalizeProjectPath(resolvedRoot, filePath);
    const key = planKey(resolvedRoot, path);
    seenKeys.add(key);
    const archiveEntry = archiveByKey.get(key);
    const registryEntry = registryByKey.get(key);
    const status = archiveEntry?.status
      || registryEntry?.status
      || (activeKey === key ? activePlan.status : "untracked");
    plans.push({
      path,
      absolutePath: resolveProjectPath(resolvedRoot, path),
      status: normalizeLifecycleStatus(status),
      source: archiveEntry ? "archive-index" : registryEntry ? "work-item-registry" : activeKey === key ? activePlan.source : "filesystem",
      archivePath: archiveEntry?.archivePath || null,
      archivedAt: archiveEntry?.archivedAt || registryEntry?.archivedAt || null,
      receiptId: archiveEntry?.receiptId || null,
      exists: true,
    });
  }

  for (const entry of [...archiveIndex.plans, ...registryPlans]) {
    const key = planKey(resolvedRoot, entry.path);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    plans.push({
      path: normalizeProjectPath(resolvedRoot, entry.path),
      absolutePath: resolveProjectPath(resolvedRoot, entry.path),
      status: normalizeLifecycleStatus(entry.status),
      source: entry.source || "lifecycle-index",
      archivePath: entry.archivePath || null,
      archivedAt: entry.archivedAt || null,
      receiptId: entry.receiptId || null,
      exists: existsSync(resolveProjectPath(resolvedRoot, entry.path)),
    });
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    rootDir: resolvedRoot,
    pointer,
    activePlan,
    latestReviewedPlan: findLatestReviewedPlan(resolvedRoot),
    archiveIndex,
    plans: plans.sort((a, b) => a.path.localeCompare(b.path)),
  };
}

export function createPlanLifecycleReport({ rootDir = process.cwd(), planPath = null } = {}) {
  const state = readPlanLifecycleState({ rootDir });
  const activePlanPath = planPath
    ? normalizeProjectPath(state.rootDir, planPath)
    : state.activePlan?.activePlanPath || null;
  const activeEntry = activePlanPath ? findPlanEntry(state, activePlanPath) : null;
  const closedPlans = state.plans.filter((entry) => ARCHIVE_STATUSES.has(entry.status));
  const staleClosedPlans = state.plans.filter((entry) => (
    entry.exists
    && ARCHIVE_STATUSES.has(entry.status)
    && !isArchivePath(entry.path)
    && entry.source !== "archive-index"
    && !entry.archivedAt
    && (!activePlanPath || planKey(state.rootDir, entry.path) !== planKey(state.rootDir, activePlanPath))
  ));
  const activeSource = inspectActiveGraphSourceSync({ rootDir: state.rootDir });
  const sourceEvaluation = activeSource.sourcePath
    ? evaluatePlanSourceAgainstLifecycle({ rootDir: state.rootDir, sourcePath: activeSource.sourcePath })
    : { issues: [], warnings: [], status: "missing" };
  const staleActiveSource = sourceEvaluation.issues.length > 0;
  const archiveAction = staleClosedPlans.length > 0
    ? `index/archive stale closed plan(s): ${staleClosedPlans.length}`
    : "none";
  const nextAction = staleActiveSource
    ? "repair active graph source before atomization, review, or execution"
    : staleClosedPlans.length > 0
      ? "run node scripts/supervibe-plan-lifecycle.mjs --repair --apply --receipt-id <workflow-id>"
      : activePlanPath
        ? "use canonical active plan pointer or explicit --plan"
        : "set active plan pointer before atomization or review";

  return {
    schemaVersion: SCHEMA_VERSION,
    rootDir: state.rootDir,
    activePlanPath,
    activeStatus: activeEntry?.status || state.activePlan?.status || "missing",
    activePlanSource: state.pointer ? "active-plan-pointer" : state.activePlan?.source || "missing",
    latestReviewedPlan: state.latestReviewedPlan,
    closedPlanCount: closedPlans.length,
    archiveAction,
    staleActiveSource,
    activeSource,
    sourceEvaluation,
    staleClosedPlans,
    nextAction,
    state,
  };
}

export function formatPlanLifecycleReport(report = {}) {
  const lines = [
    "SUPERVIBE_PLAN_LIFECYCLE",
    `ACTIVE_PLAN: ${report.activePlanPath || "none"}`,
    `ACTIVE_STATUS: ${report.activeStatus || "missing"}`,
    `ACTIVE_SOURCE: ${report.activePlanSource || "missing"}`,
    `LATEST_REVIEWED_PLAN: ${report.latestReviewedPlan || "none"}`,
    `CLOSED_PLANS: ${report.closedPlanCount || 0}`,
    `ARCHIVE_ACTION: ${report.archiveAction || "none"}`,
    `STALE_ACTIVE_SOURCE: ${report.staleActiveSource ? "true" : "false"}`,
  ];
  if (report.activeSource?.sourcePath) lines.push(`ACTIVE_GRAPH_SOURCE: ${normalizeProjectPath(report.rootDir || process.cwd(), report.activeSource.sourcePath)}`);
  for (const warning of report.sourceEvaluation?.warnings || []) lines.push(`WARNING: ${warning}`);
  for (const issue of report.sourceEvaluation?.issues || []) lines.push(`ISSUE: ${issue}`);
  for (const plan of report.staleClosedPlans || []) lines.push(`ARCHIVE_CANDIDATE: ${plan.path} status=${plan.status}`);
  lines.push(`NEXT_ACTION: ${report.nextAction || "inspect plan lifecycle"}`);
  return lines.join("\n");
}

export function evaluatePlanSourceAgainstLifecycle({ rootDir = process.cwd(), sourcePath, explicitPlanPath = null } = {}) {
  const state = readPlanLifecycleState({ rootDir });
  const sourceRel = normalizeProjectPath(state.rootDir, sourcePath);
  const sourceEntry = findPlanEntry(state, sourceRel);
  const activePlanPath = explicitPlanPath
    ? normalizeProjectPath(state.rootDir, explicitPlanPath)
    : state.activePlan?.activePlanPath || null;
  const status = sourceEntry?.status || "untracked";
  const issues = [];
  const warnings = [];

  if (ARCHIVE_STATUSES.has(status)) {
    issues.push(`active graph source plan is ${status}: ${sourceRel}`);
  }
  if (activePlanPath && planKey(state.rootDir, sourceRel) !== planKey(state.rootDir, activePlanPath)) {
    issues.push(`active graph source does not match canonical active plan pointer: ${sourceRel} != ${activePlanPath}`);
  }
  if (!sourceEntry) {
    warnings.push(`active graph source is not indexed by plan lifecycle: ${sourceRel}`);
  }
  if (sourceEntry && !sourceEntry.exists && !sourceEntry.archivePath) {
    warnings.push(`active graph source lifecycle entry has no existing file or archive path: ${sourceRel}`);
  }

  return {
    sourcePath: sourceRel,
    activePlanPath,
    status,
    issues,
    warnings,
    excludedFromDefaultContext: isPlanLifecycleExcluded(status),
  };
}

export function isPlanLifecycleExcluded(status) {
  return ARCHIVE_STATUSES.has(normalizeLifecycleStatus(status));
}

export function assertPlanWriteTargetAllowed({ rootDir = process.cwd(), planPath } = {}) {
  if (!planPath) throw new Error("planPath is required");
  const state = readPlanLifecycleState({ rootDir });
  const relPath = normalizeProjectPath(state.rootDir, planPath);
  const entry = findPlanEntry(state, relPath);
  if (entry && ARCHIVE_STATUSES.has(entry.status)) {
    throw new Error(`Refusing to reuse ${entry.status} plan as active write target: ${relPath}`);
  }
  return {
    ok: true,
    planPath: relPath,
    status: entry?.status || "new",
  };
}

export async function writeActivePlanPointer({
  rootDir = process.cwd(),
  planPath,
  status = "active",
  receiptId = null,
  now = new Date().toISOString(),
  pointerPath = defaultActivePlanPointerPath(rootDir),
} = {}) {
  if (!planPath) throw new Error("planPath is required");
  const pointer = {
    schemaVersion: SCHEMA_VERSION,
    activePlanPath: normalizeProjectPath(rootDir, planPath),
    status: normalizeLifecycleStatus(status),
    updatedAt: now,
    source: "supervibe-plan-lifecycle",
    receiptId,
  };
  await mkdir(dirname(pointerPath), { recursive: true });
  await writeFile(pointerPath, `${JSON.stringify(pointer, null, 2)}\n`, "utf8");
  return pointer;
}

export async function repairPlanLifecycle({
  rootDir = process.cwd(),
  currentPlanPath = null,
  apply = false,
  receiptId = null,
  reason = "plan-lifecycle-repair",
  now = new Date().toISOString(),
} = {}) {
  const resolvedRoot = resolve(rootDir);
  const report = createPlanLifecycleReport({ rootDir: resolvedRoot, planPath: currentPlanPath });
  const currentPlan = currentPlanPath
    ? normalizeProjectPath(resolvedRoot, currentPlanPath)
    : report.activePlanPath;
  if (!currentPlan) throw new Error("current plan path is required; pass --plan <path> or create an active-plan pointer");
  if (apply && !receiptId) {
    throw new Error("--apply requires --receipt-id from node scripts/workflow-receipt.mjs issue ...");
  }

  const actions = [];
  for (const plan of report.staleClosedPlans) {
    actions.push({
      type: "index-archived-plan",
      path: plan.path,
      status: plan.status,
      archivePath: plan.archivePath || `.supervibe/artifacts/plans/_archive/${basename(plan.path)}`,
      mode: "index-only",
    });
  }

  const pointer = readActivePlanPointer({ rootDir: resolvedRoot });
  if (!pointer || planKey(resolvedRoot, pointer.activePlanPath) !== planKey(resolvedRoot, currentPlan) || pointer.status !== "executing") {
    actions.push({
      type: "set-active-plan-pointer",
      path: currentPlan,
      status: "executing",
    });
  }

  if (report.activeSource?.graphPath && report.sourceEvaluation?.issues?.length) {
    actions.push({
      type: "rewrite-active-graph-source",
      graphPath: normalizeProjectPath(resolvedRoot, report.activeSource.graphPath),
      from: report.activeSource.sourcePath ? normalizeProjectPath(resolvedRoot, report.activeSource.sourcePath) : null,
      to: currentPlan,
    });
  }

  const trackerMapPath = join(resolvedRoot, ".supervibe", "memory", "loops", "task-tracker-map.json");
  if (existsSync(trackerMapPath)) {
    actions.push({
      type: "refresh-tracker-map",
      path: normalizeProjectPath(resolvedRoot, trackerMapPath),
      activePlanPath: currentPlan,
      activeGraphPath: report.activeSource?.graphPath ? normalizeProjectPath(resolvedRoot, report.activeSource.graphPath) : null,
    });
  }

  if (apply) {
    const archiveIndexPath = defaultPlanArchiveIndexPath(resolvedRoot);
    const archiveIndex = readPlanArchiveIndex({ rootDir: resolvedRoot, indexPath: archiveIndexPath });
    const plansByKey = new Map(archiveIndex.plans.map((entry) => [planKey(resolvedRoot, entry.path), entry]));
    for (const action of actions.filter((item) => item.type === "index-archived-plan")) {
      plansByKey.set(planKey(resolvedRoot, action.path), {
        path: action.path,
        status: "closed",
        archivePath: action.archivePath,
        archivedAt: now,
        reason,
        receiptId,
        source: "supervibe-plan-lifecycle",
      });
    }
    await writeJsonFile(archiveIndexPath, {
      schemaVersion: SCHEMA_VERSION,
      updatedAt: now,
      plans: [...plansByKey.values()].sort((a, b) => a.path.localeCompare(b.path)),
    });

    if (actions.some((item) => item.type === "set-active-plan-pointer")) {
      await writeActivePlanPointer({
        rootDir: resolvedRoot,
        planPath: currentPlan,
        status: "executing",
        receiptId,
        now,
      });
    }

    for (const action of actions.filter((item) => item.type === "rewrite-active-graph-source")) {
      await rewriteActiveGraphSource({ rootDir: resolvedRoot, graphPath: action.graphPath, currentPlan, receiptId, now });
    }
    for (const action of actions.filter((item) => item.type === "refresh-tracker-map")) {
      await refreshTrackerMap({ rootDir: resolvedRoot, trackerMapPath: action.path, activePlanPath: currentPlan, activeGraphPath: action.activeGraphPath, receiptId, now });
    }
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    applied: Boolean(apply),
    receiptId: receiptId || null,
    currentPlanPath: currentPlan,
    actions,
    report,
  };
}

export function formatPlanLifecycleRepairResult(result = {}) {
  const lines = [
    "SUPERVIBE_PLAN_LIFECYCLE_REPAIR",
    `APPLIED: ${result.applied ? "true" : "false"}`,
    `RECEIPT_ID: ${result.receiptId || "none"}`,
    `CURRENT_PLAN: ${result.currentPlanPath || "none"}`,
    `ACTIONS: ${result.actions?.length || 0}`,
  ];
  for (const action of result.actions || []) {
    if (action.type === "index-archived-plan") lines.push(`ACTION: ${action.type} ${action.path} status=${action.status} mode=${action.mode}`);
    else if (action.type === "set-active-plan-pointer") lines.push(`ACTION: ${action.type} ${action.path} status=${action.status}`);
    else if (action.type === "rewrite-active-graph-source") lines.push(`ACTION: ${action.type} ${action.from || "missing"} -> ${action.to}`);
    else if (action.type === "refresh-tracker-map") lines.push(`ACTION: ${action.type} ${action.path}`);
    else lines.push(`ACTION: ${action.type}`);
  }
  lines.push(`NEXT_ACTION: ${result.applied ? "rerun status and validators" : "rerun with --apply --receipt-id <workflow-id> after issuing a receipt"}`);
  return lines.join("\n");
}

async function rewriteActiveGraphSource({ rootDir, graphPath, currentPlan, receiptId, now }) {
  const fullGraphPath = resolveProjectPath(rootDir, graphPath);
  const graph = JSON.parse(await readFile(fullGraphPath, "utf8"));
  graph.source = {
    ...(graph.source || {}),
    type: graph.source?.type || "plan",
    path: currentPlan,
    lifecycleRepairedAt: now,
    lifecycleRepairReceiptId: receiptId,
  };
  graph.metadata = {
    ...(graph.metadata || {}),
    planLifecycleRepairedAt: now,
    planLifecycleRepairReceiptId: receiptId,
  };
  if (graph.metadata.sourcePlanSnapshot) {
    graph.metadata.sourcePlanSnapshot.path = currentPlan;
  }
  await writeJsonFile(fullGraphPath, graph);
}

async function refreshTrackerMap({ rootDir, trackerMapPath, activePlanPath, activeGraphPath, receiptId, now }) {
  const fullPath = resolveProjectPath(rootDir, trackerMapPath);
  const mapping = readJsonSync(fullPath, {});
  await writeJsonFile(fullPath, {
    ...mapping,
    activePlanPath,
    activeGraphPath,
    planLifecycleRepairedAt: now,
    planLifecycleRepairReceiptId: receiptId,
  });
}

async function movePlanToArchive({ rootDir, planPath, archivePath }) {
  const from = resolveProjectPath(rootDir, planPath);
  const to = resolveProjectPath(rootDir, archivePath);
  await mkdir(dirname(to), { recursive: true });
  await rename(from, to);
  return { from, to };
}

function inspectActiveGraphSourceSync({ rootDir = process.cwd() } = {}) {
  const registry = readJsonSync(join(rootDir, ".supervibe", "memory", "work-items", "index.json"), null);
  const graphPath = registry?.activeGraphPath ? resolveProjectPath(rootDir, registry.activeGraphPath) : null;
  if (!graphPath || !existsSync(graphPath)) {
    return { status: "missing-active-graph", graphPath: null, sourcePath: null };
  }
  try {
    const graph = JSON.parse(readFileSync(graphPath, "utf8"));
    return {
      status: "active",
      graphPath,
      sourcePath: graph.source?.path || graph.metadata?.sourcePlanSnapshot?.path || graph.planPath || null,
    };
  } catch (error) {
    return { status: "unreadable-active-graph", graphPath, sourcePath: null, error: error.message };
  }
}

function collectRegistryPlanStatuses(rootDir) {
  const registry = readJsonSync(join(rootDir, ".supervibe", "memory", "work-items", "index.json"), null);
  const out = [];
  for (const epic of Object.values(registry?.epics || {})) {
    const path = epic.sourcePlanPath || null;
    if (!path) continue;
    out.push({
      path: normalizeProjectPath(rootDir, path),
      status: normalizeRegistryLifecycleStatus(epic.status),
      source: "work-item-registry",
      archivedAt: epic.archivedAt || null,
    });
  }
  return out;
}

function inferActivePlanFromRegistry(rootDir, registryPlans) {
  const registry = readJsonSync(join(rootDir, ".supervibe", "memory", "work-items", "index.json"), null);
  const activeEpic = registry?.activeEpicId ? registry.epics?.[registry.activeEpicId] : null;
  if (activeEpic?.sourcePlanPath) {
    return {
      schemaVersion: SCHEMA_VERSION,
      activePlanPath: normalizeProjectPath(rootDir, activeEpic.sourcePlanPath),
      status: normalizeRegistryLifecycleStatus(activeEpic.status) === "closed" ? "closed" : "executing",
      updatedAt: registry.updatedAt || null,
      source: "work-item-registry",
      receiptId: null,
    };
  }
  const activePlan = registryPlans.find((entry) => OPEN_STATUSES.has(entry.status));
  return activePlan ? {
    schemaVersion: SCHEMA_VERSION,
    activePlanPath: activePlan.path,
    status: activePlan.status,
    updatedAt: null,
    source: "work-item-registry",
    receiptId: null,
  } : null;
}

function findLatestReviewedPlan(rootDir) {
  const reviewDir = join(rootDir, ".supervibe", "artifacts", "plan-reviews");
  if (!existsSync(reviewDir)) return null;
  const files = listMarkdownPaths(reviewDir).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const match = /Artifact:\s*([^\s`]+\.md)/i.exec(text) || /(\.supervibe\/artifacts\/plans\/[^\s`]+\.md)/i.exec(text);
    if (match?.[1]) return normalizeProjectPath(rootDir, match[1]);
  }
  return null;
}

function listPlanMarkdownPaths(rootDir) {
  const planDir = join(rootDir, ".supervibe", "artifacts", "plans");
  if (!existsSync(planDir)) return [];
  return listMarkdownPaths(planDir).filter((filePath) => !normalizeProjectPath(rootDir, filePath).includes("/_archive/"));
}

function listMarkdownPaths(dir) {
  const out = [];
  function walk(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".md")) out.push(full);
    }
  }
  walk(dir);
  return out;
}

function findPlanEntry(state, planPath) {
  const key = planKey(state.rootDir, planPath);
  return state.plans.find((entry) => planKey(state.rootDir, entry.path) === key) || null;
}

function normalizeArchiveIndex(index = {}) {
  const rawPlans = Array.isArray(index.plans)
    ? index.plans
    : Object.entries(index.plans || {}).map(([path, value]) => ({ path, ...(value || {}) }));
  const plans = rawPlans
    .filter((entry) => entry && entry.path)
    .map((entry) => ({
      path: normalizeSlash(entry.path),
      status: normalizeLifecycleStatus(entry.status || "archived"),
      archivePath: entry.archivePath ? normalizeSlash(entry.archivePath) : null,
      archivedAt: entry.archivedAt || null,
      reason: entry.reason || null,
      receiptId: entry.receiptId || null,
      source: entry.source || "archive-index",
    }));
  return {
    schemaVersion: Number(index.schemaVersion || SCHEMA_VERSION),
    updatedAt: index.updatedAt || null,
    plans,
  };
}

function normalizeLifecycleStatus(status) {
  const value = String(status || "active").trim().toLowerCase().replace(/_/g, "-");
  if (value === "complete") return "completed";
  if (value === "running" || value === "in-progress") return "executing";
  if (value === "done") return "completed";
  if (PLAN_LIFECYCLE_STATUSES.includes(value)) return value;
  return "active";
}

function normalizeRegistryLifecycleStatus(status) {
  const value = String(status || "").toLowerCase();
  if (["closed", "done", "completed", "complete"].includes(value)) return "closed";
  if (["active", "claimed", "open", "ready", "blocked", "review"].includes(value)) return "executing";
  return normalizeLifecycleStatus(value || "active");
}

function readJsonSync(filePath, fallback) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    if (error.name === "SyntaxError") return fallback;
    throw error;
  }
}

async function writeJsonFile(filePath, value) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function resolveProjectPath(rootDir, filePath) {
  if (!filePath) return resolve(rootDir);
  return isAbsolute(filePath) ? resolve(filePath) : resolve(rootDir, filePath);
}

function normalizeProjectPath(rootDir, filePath) {
  if (!filePath) return null;
  const resolvedRoot = resolve(rootDir);
  const resolved = resolveProjectPath(resolvedRoot, filePath);
  const rel = relative(resolvedRoot, resolved);
  if (!rel.startsWith("..") && !isAbsolute(rel)) return normalizeSlash(rel);
  return normalizeSlash(resolved);
}

function normalizeSlash(value) {
  return String(value || "").replace(/\\/g, "/");
}

function planKey(rootDir, planPath) {
  return normalizeProjectPath(rootDir, planPath).toLowerCase();
}

function isArchivePath(planPath) {
  return normalizeSlash(planPath).includes("/_archive/");
}

function basename(planPath) {
  const normalized = normalizeSlash(planPath);
  return normalized.slice(normalized.lastIndexOf("/") + 1);
}

async function main() {
  const { values } = parseArgs({
    options: {
      root: { type: "string" },
      plan: { type: "string" },
      status: { type: "boolean", default: false },
      repair: { type: "boolean", default: false },
      apply: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      "receipt-id": { type: "string" },
      "delete-plan": { type: "string" },
      "move-archive": { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    console.log(`Usage:
  node scripts/supervibe-plan-lifecycle.mjs --status [--root <dir>]
  node scripts/supervibe-plan-lifecycle.mjs --repair --plan <plan.md> [--apply --receipt-id <workflow-id>]
  node scripts/supervibe-plan-lifecycle.mjs --delete-plan <plan.md> --receipt-id <workflow-id>`);
    return;
  }

  const rootDir = resolve(values.root || process.cwd());
  if (values["delete-plan"]) {
    if (!values["receipt-id"]) throw new Error("--delete-plan requires --receipt-id and explicit destructive operator approval");
    throw new Error("Plan deletion is intentionally not automatic; archive first, then remove manually with the cited receipt if still required");
  }

  if (values.repair) {
    const result = await repairPlanLifecycle({
      rootDir,
      currentPlanPath: values.plan || null,
      apply: values.apply,
      receiptId: values["receipt-id"] || null,
    });
    if (values.json) console.log(JSON.stringify(result, null, 2));
    else console.log(formatPlanLifecycleRepairResult(result));
    return;
  }

  const report = createPlanLifecycleReport({ rootDir, planPath: values.plan || null });
  if (values.json) console.log(JSON.stringify(report, null, 2));
  else console.log(formatPlanLifecycleReport(report));
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(2);
  });
}
