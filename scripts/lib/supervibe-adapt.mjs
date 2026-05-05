import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import matter from "gray-matter";

import { CodeStore } from "./code-store.mjs";
import { hasNodeSqliteSupport, SQLITE_NODE_MIN_VERSION } from "./node-sqlite-runtime.mjs";
import { selectHostAdapter } from "./supervibe-host-detector.mjs";
import { collectIndexHealthFromStore, evaluateIndexHealthGate } from "./supervibe-index-health.mjs";
import { curateProjectMemory } from "./supervibe-memory-curator.mjs";
import { SOURCE_RAG_INDEX_COMMAND } from "./supervibe-command-catalog.mjs";
import { getCurrentPluginVersion, getLastSeenVersion, setLastSeenVersion } from "./version-tracker.mjs";
import { validateArtifactLinks } from "../validate-artifact-links.mjs";
import { validateAgentProducerReceipts } from "./agent-producer-contract.mjs";
import {
  collectFrontendPackageEvidence,
  readGenesisFrontendDecision,
  resolveFrontendTarget,
} from "./frontend-target-resolver.mjs";

const BASELINE_PATH = [".supervibe", "memory", "adapt", "baseline.json"];
const STATE_PATH = [".supervibe", "memory", "adapt", "state.json"];
const DEFAULT_INDEX_REPAIR_COMMAND = SOURCE_RAG_INDEX_COMMAND;
const DOKPLOY_MIGRATION_COMMAND = "docker compose -f docker-compose.dokploy.yml run --rm backend php artisan migrate --force";

export async function createAdaptPlan({
  projectRoot = process.cwd(),
  pluginRoot = process.cwd(),
  env = process.env,
  adapterId = null,
  refreshMemoryIndex = false,
} = {}) {
  const hostSelection = selectHostAdapter({
    rootDir: projectRoot,
    env: adapterId ? { ...env, SUPERVIBE_HOST: adapterId } : env,
  });
  const adapter = hostSelection.adapter;
  const baseline = readBaseline(projectRoot);
  const currentVersion = await getCurrentPluginVersion(pluginRoot);
  const lastSeenVersion = await getLastSeenVersion(projectRoot);
  const memoryIndex = refreshMemoryIndex
    ? await ensureMemoryIndex(projectRoot)
    : readMemoryIndexStatus(projectRoot);
  const changeDetection = buildAdaptChangeDetection(projectRoot);
  const frontendEvidence = collectFrontendPackageEvidence({ rootDir: projectRoot });
  const frontendTags = unique(frontendEvidence.flatMap((entry) => entry.tags || []));
  const frontendTarget = resolveFrontendTarget({
    tags: frontendTags,
    facts: frontendEvidence,
    previousChoice: readGenesisFrontendDecision(projectRoot),
    source: "adapt",
  });
  const upstream = buildUpstreamIndex(pluginRoot);
  const projectArtifacts = listProjectArtifacts(projectRoot, adapter);
  const projectItems = projectArtifacts.map((artifact) => classifyArtifact({
    artifact,
    upstream: upstream[artifact.type].get(artifact.id) || null,
    baselineHash: baseline.artifacts?.[artifact.projectRel]?.hash || null,
  }));
  const closureItems = await planRelatedRuleClosure({
    projectRoot,
    pluginRoot,
    adapter,
    upstream,
    projectArtifacts,
  });
  const items = dedupePlanItems([...projectItems, ...closureItems]);
  const counts = countPlanItems(items);
  const memoryWrites = memoryIndex?.refreshed === true;
  const versionDrift = Boolean(currentVersion && lastSeenVersion !== currentVersion);
  const baselineVersionDrift = Boolean(currentVersion && baseline.pluginVersion !== currentVersion);
  const baselineRefreshRequired = counts.baselineRefresh > 0;
  const metadataUpdateRequired = versionDrift || baselineVersionDrift || baselineRefreshRequired;

  return {
    kind: "adapt-plan",
    projectRoot,
    pluginRoot,
    host: {
      adapterId: adapter.id,
      displayName: adapter.displayName,
      confidence: hostSelection.confidence,
    },
    currentVersion,
    lastSeenVersion,
    baselineVersion: baseline.pluginVersion || null,
    versionDrift,
    baselineVersionDrift,
    baselineRefreshRequired,
    metadataUpdateRequired,
    changeDetection,
    frontendTarget,
    memoryWrites,
    memoryIndex,
    approvalRequired: items.some((item) => item.action === "update" || item.action === "add"),
    counts,
    fastPath: buildAdaptFastPath({ counts, items, memoryWrites }),
    agentPlanCommand: buildAdaptAgentPlanCommand({ counts, memoryWrites }),
    items,
  };
}

export async function applyAdaptPlan(plan, {
  include = [],
  applyAll = false,
  refreshMemoryIndex = true,
} = {}) {
  const approved = new Set(include.map(normalizeRel));
  const skipped = [];
  const blocked = [];
  const candidates = [];

  for (const item of plan.items) {
    if (item.action !== "update" && item.action !== "add") continue;
    const approvedFile = applyAll || approved.has(item.projectRel);
    if (!approvedFile) {
      skipped.push(item);
      continue;
    }
    if (!item.upstreamAbs) {
      blocked.push({ ...item, reason: "missing upstream file" });
      continue;
    }
    if (item.classification === "both-changed") {
      blocked.push({ ...item, reason: "conflict requires manual merge" });
      continue;
    }
    if (item.action === "add" && existsSync(item.projectAbs)) {
      blocked.push({ ...item, reason: "target already exists" });
      continue;
    }
    candidates.push(item);
  }

  if (blocked.length > 0) {
    return buildBlockedApplyResult(plan, { skipped, blocked });
  }

  const applied = [];
  const mutatedPaths = [];
  for (const item of candidates) {
    const content = await readFile(item.upstreamAbs, "utf8");
    await mkdir(dirname(item.projectAbs), { recursive: true });
    await writeFile(item.projectAbs, content, "utf8");
    applied.push(item);
    mutatedPaths.push(item.projectRel);
  }

  const baselineRefreshItems = baselineRefreshCandidates(plan);
  const baselineItems = dedupeBaselineItems([...applied, ...baselineRefreshItems]);
  const baselineRefreshed = baselineRefreshItems.length > 0;
  const metadataOnlyUpdate = plan.counts.update === 0 && plan.counts.add === 0 && plan.metadataUpdateRequired;
  const metadataUpdated = Boolean(plan.currentVersion && (applied.length > 0 || metadataOnlyUpdate || baselineItems.length > 0));
  if (metadataUpdated) {
    const baselinePath = await writeBaseline(plan, baselineItems);
    mutatedPaths.push(baselinePath);
    await setLastSeenVersion(plan.projectRoot, plan.currentVersion);
    mutatedPaths.push(".supervibe/memory/.supervibe-version");
  }

  const postApplyPlan = await createAdaptPlan({
    projectRoot: plan.projectRoot,
    pluginRoot: plan.pluginRoot,
    adapterId: plan.host.adapterId,
    refreshMemoryIndex,
  });
  const indexGate = await inspectIndexGate(plan.projectRoot);
  const fileManifest = plan.changeDetection?.mode === "snapshot"
    ? await writeNoGitFileManifest(plan.projectRoot)
    : null;
  const result = {
    kind: "adapt-apply",
    projectRoot: plan.projectRoot,
    pluginRoot: plan.pluginRoot,
    host: plan.host,
    frontendTarget: plan.frontendTarget,
    currentVersion: plan.currentVersion,
    lastSeenVersion: plan.lastSeenVersion,
    applied,
    skipped,
    blocked,
    metadataUpdated,
    baselineRefreshed,
    mutatedPaths: [...new Set(mutatedPaths)],
    postApply: {
      updates: postApplyPlan.counts.update,
      adds: postApplyPlan.counts.add,
      identical: postApplyPlan.counts.identical,
      projectOnly: postApplyPlan.counts.projectOnly,
      clean: postApplyPlan.counts.update === 0 && postApplyPlan.counts.add === 0,
    },
    memoryIndex: postApplyPlan.memoryIndex,
    indexGate,
    fileManifest,
  };
  result.lifecycleState = await writeAdaptLifecycleState(plan, result, {
    include,
    applyAll,
  });
  result.mutatedPaths.push(result.lifecycleState.path);
  if (result.memoryIndex?.refreshed && result.memoryIndex?.path) result.mutatedPaths.push(result.memoryIndex.path);
  if (result.fileManifest?.path) result.mutatedPaths.push(result.fileManifest.path);
  result.mutatedPaths = [...new Set(result.mutatedPaths)];
  return result;
}

export function createDokployDeployPlan({
  projectRoot = process.cwd(),
  target = "dokploy",
} = {}) {
  const artifacts = dokployDeployArtifacts();
  const items = artifacts.map((artifact) => {
    const projectAbs = join(projectRoot, artifact.path);
    if (!existsSync(projectAbs)) {
      return {
        ...artifact,
        projectAbs,
        projectRel: artifact.path,
        action: "create",
        classification: "deploy-addon-missing",
        projectHash: null,
        templateHash: hashContent(artifact.content),
        diff: summarizeLineDiff("", artifact.content),
      };
    }
    const current = readFileSync(projectAbs, "utf8");
    const projectHash = hashContent(current);
    const templateHash = hashContent(artifact.content);
    const identical = projectHash === templateHash;
    return {
      ...artifact,
      projectAbs,
      projectRel: artifact.path,
      action: identical ? "identical" : "update",
      classification: identical ? "deploy-addon-identical" : "deploy-addon-review-update",
      projectHash,
      templateHash,
      diff: identical ? { additions: 0, deletions: 0 } : summarizeLineDiff(current, artifact.content),
    };
  });
  const counts = {
    create: items.filter((item) => item.action === "create").length,
    update: items.filter((item) => item.action === "update").length,
    identical: items.filter((item) => item.action === "identical").length,
  };
  return {
    kind: "adapt-deploy-plan",
    scope: "deploy",
    target,
    projectRoot,
    approvalRequired: counts.create > 0 || counts.update > 0,
    counts,
    items,
    migrationCommand: DOKPLOY_MIGRATION_COMMAND,
  };
}

export async function applyDokployDeployPlan(plan, {
  include = [],
  applyAll = false,
} = {}) {
  const approved = new Set(include.map(normalizeRel));
  const created = [];
  const updated = [];
  const skipped = [];
  for (const item of plan.items || []) {
    if (item.action === "identical") {
      skipped.push({ ...item, reason: "already current" });
      continue;
    }
    const approvedUpdate = applyAll || approved.has(item.projectRel);
    const approvedCreate = item.action === "create" && (include.length === 0 || approvedUpdate);
    if (!approvedCreate && !approvedUpdate) {
      skipped.push({ ...item, reason: "not approved" });
      continue;
    }
    await mkdir(dirname(item.projectAbs), { recursive: true });
    await writeFile(item.projectAbs, item.content, "utf8");
    if (item.action === "create") created.push(item);
    else updated.push(item);
  }
  const result = {
    kind: "adapt-deploy-apply",
    scope: plan.scope,
    target: plan.target,
    projectRoot: plan.projectRoot,
    created,
    updated,
    skipped,
    migrationCommand: plan.migrationCommand,
    mutatedPaths: [...created, ...updated].map((item) => item.projectRel),
  };
  result.lifecycleState = await writeDeployLifecycleState(plan, result);
  result.mutatedPaths.push(result.lifecycleState.path);
  result.mutatedPaths = [...new Set(result.mutatedPaths)];
  return result;
}

export async function resolveAdaptPlanItems(plan, paths = []) {
  const requested = new Set((Array.isArray(paths) ? paths : [paths]).map(normalizeRel).filter(Boolean));
  const resolved = [];
  const blocked = [];
  for (const path of requested) {
    const item = (plan.items || []).find((candidate) => normalizeRel(candidate.projectRel) === path);
    if (!item) {
      blocked.push({ projectRel: path, reason: "artifact not found in adapt plan" });
      continue;
    }
    if (!item.upstreamAbs) {
      blocked.push({ ...item, reason: "missing upstream file" });
      continue;
    }
    const projectContent = readFileSync(item.projectAbs, "utf8");
    const upstreamContent = readFileSync(item.upstreamAbs, "utf8");
    if (hashComparableContent(projectContent) !== hashComparableContent(upstreamContent)) {
      blocked.push({ ...item, reason: "manual merge differs from upstream" });
      continue;
    }
    resolved.push({
      ...item,
      upstreamHash: hashContent(upstreamContent),
      lineEndingOnly: hashContent(projectContent) !== hashContent(upstreamContent),
    });
  }

  const mutatedPaths = [];
  let baselineUpdated = false;
  if (resolved.length > 0 && blocked.length === 0) {
    const baselinePath = await writeBaseline(plan, resolved);
    mutatedPaths.push(baselinePath);
    baselineUpdated = true;
    if (plan.currentVersion) {
      await setLastSeenVersion(plan.projectRoot, plan.currentVersion);
      mutatedPaths.push(".supervibe/memory/.supervibe-version");
    }
  }

  return {
    kind: "adapt-resolve",
    projectRoot: plan.projectRoot,
    pluginRoot: plan.pluginRoot,
    host: plan.host,
    currentVersion: plan.currentVersion,
    resolved,
    blocked,
    baselineUpdated,
    mutatedPaths: [...new Set(mutatedPaths)],
  };
}

export function formatAdaptPlan(plan, { diffSummary = false } = {}) {
  const lines = [
    "SUPERVIBE_ADAPT_DRY_RUN",
    `HOST: ${plan.host.adapterId}`,
    `VERSION: ${plan.lastSeenVersion || "none"} -> ${plan.currentVersion || "unknown"}`,
    `VERSION_DRIFT: ${plan.versionDrift ? "true" : "false"}`,
    `BASELINE_REFRESH_REQUIRED: ${plan.baselineRefreshRequired ? "true" : "false"}`,
    `METADATA_UPDATE_REQUIRED: ${plan.metadataUpdateRequired ? "true" : "false"}`,
    `CHANGE_DETECTION: ${plan.changeDetection?.mode || "unknown"}`,
    `GIT_PRESENT: ${plan.changeDetection?.gitPresent === true}`,
    `NO_GIT_SNAPSHOT: ${plan.changeDetection?.mode === "snapshot" ? plan.changeDetection.status : "not-needed"}`,
    `FRONTEND_TARGET: ${plan.frontendTarget?.id || "none"}`,
    `FRONTEND_BUNDLER: ${plan.frontendTarget?.bundler || "none"}`,
    `ARTIFACTS: ${plan.items.length}`,
    `ADDS: ${plan.counts.add}`,
    `UPDATES: ${plan.counts.update}`,
    `CONFLICTS: ${plan.counts.conflicts}`,
    `LINE_ENDING_ONLY_DRIFT: ${plan.counts.lineEndingOnly}`,
    `IDENTICAL: ${plan.counts.identical}`,
    `PROJECT_ONLY: ${plan.counts.projectOnly}`,
    `MEMORY_WRITES: ${plan.memoryWrites === true}`,
    `FAST_PATH_ELIGIBLE: ${plan.fastPath?.eligible === true}`,
    `FAST_PATH_ROLES: ${(plan.fastPath?.requiredRoles || []).join(",") || "none"}`,
    `FAST_PATH_EXECUTION: ${plan.fastPath?.allowedExecution || "unknown"}`,
    `AGENT_PLAN_COMMAND: ${plan.agentPlanCommand || buildAdaptAgentPlanCommand({ counts: plan.counts, memoryWrites: plan.memoryWrites })}`,
    `MEMORY_INDEX: ${plan.memoryIndex?.status || "unknown"}`,
    `MEMORY_INDEX_REFRESHED: ${plan.memoryIndex?.refreshed ? "true" : "false"}`,
    `APPROVAL_REQUIRED: ${plan.approvalRequired}`,
  ];
  if (diffSummary) lines.push("", formatAdaptDiffSummary(plan));
  for (const warning of plan.frontendTarget?.driftWarnings || []) {
    lines.push(`FRONTEND_DRIFT: ${warning.code} - ${warning.message}`);
    lines.push(`FRONTEND_CHOICES: ${(warning.options || []).map((choice) => choice.id).join(", ")}`);
  }
  for (const item of plan.items) {
    if (item.action === "add") {
      const mandatory = item.mandatory === undefined ? "unknown" : String(Boolean(item.mandatory));
      lines.push(`ADD: ${item.projectRel} <= ${item.upstreamRel} (${item.classification}; mandatory: ${mandatory})`);
    } else if (item.action === "update") {
      lines.push(`UPDATE: ${item.projectRel} <= ${item.upstreamRel} (${item.classification})`);
    } else if (item.classification === "line-ending-only-drift") {
      lines.push(`LINE_ENDING_ONLY: ${item.projectRel} <= ${item.upstreamRel} (baseline refresh only)`);
    } else if (item.action === "project-only") {
      lines.push(`PROJECT_ONLY: ${item.projectRel} (no upstream match; keep unless explicitly archived)`);
    }
  }
  if (plan.approvalRequired) {
    const candidates = plan.items.filter((item) => item.action === "update" || item.action === "add").map((item) => item.projectRel).join(",");
    lines.push(`NEXT_APPLY: node <resolved-supervibe-plugin-root>/scripts/supervibe-adapt.mjs --apply --include "${candidates}"`);
  } else if (plan.metadataUpdateRequired) {
    lines.push("NEXT_APPLY_METADATA: node <resolved-supervibe-plugin-root>/scripts/supervibe-adapt.mjs --apply");
  }
  return lines.join("\n");
}

export function formatDokployDeployPlan(plan) {
  const lines = [
    "SUPERVIBE_ADAPT_DEPLOY_DRY_RUN",
    `SCOPE: ${plan.scope}`,
    `TARGET: ${plan.target}`,
    `ARTIFACTS: ${(plan.items || []).length}`,
    `CREATES: ${plan.counts?.create ?? 0}`,
    `UPDATES: ${plan.counts?.update ?? 0}`,
    `IDENTICAL: ${plan.counts?.identical ?? 0}`,
    `APPROVAL_REQUIRED: ${plan.approvalRequired === true}`,
    `MIGRATION_COMMAND: ${plan.migrationCommand}`,
  ];
  for (const item of plan.items || []) {
    if (item.action === "create") lines.push(`CREATE: ${item.projectRel} (${item.reason})`);
    else if (item.action === "update") lines.push(`UPDATE: ${item.projectRel} (${item.classification})`);
    else lines.push(`IDENTICAL: ${item.projectRel}`);
  }
  if (plan.approvalRequired) {
    lines.push("NEXT_APPLY: node <resolved-supervibe-plugin-root>/scripts/supervibe-adapt.mjs --scope deploy --target dokploy --apply");
  }
  return lines.join("\n");
}

export function formatAdaptApply(result, { diffSummary = false } = {}) {
  const lines = [
    "SUPERVIBE_ADAPT_APPLY",
    `HOST: ${result.host.adapterId}`,
    `VERSION: ${result.lastSeenVersion || "none"} -> ${result.currentVersion || "unknown"}`,
    `APPLIED: ${result.applied.length}`,
    `SKIPPED: ${result.skipped.length}`,
    `BLOCKED: ${result.blocked.length}`,
    `METADATA_UPDATED: ${result.metadataUpdated ? "true" : "false"}`,
    `BASELINE_REFRESHED: ${result.baselineRefreshed ? "true" : "false"}`,
    `CHANGE_DETECTION: ${result.fileManifest?.mode || "git-or-not-written"}`,
    `FRONTEND_TARGET: ${result.lifecycleState?.frontendTarget?.id || result.frontendTarget?.id || "none"}`,
    `ADAPT_STATE: ${result.lifecycleState?.path || "not-written"}`,
    `ADAPT_STATE_LIFECYCLE: ${result.lifecycleState?.lifecycle || "unknown"}`,
    `ARTIFACT_VERIFIED: ${result.lifecycleState?.verification?.artifactVerified === true}`,
    `AGENT_RECEIPTS_VERIFIED: ${result.lifecycleState?.verification?.agentReceiptsVerified === true}`,
    `APP_VERIFIED: ${result.lifecycleState?.verification?.appVerified === true}`,
    `DEPLOY_VERIFIED: ${result.lifecycleState?.verification?.deployVerified === true}`,
  ];
  if (diffSummary) lines.push("", formatAdaptDiffSummary({ items: result.applied }));
  for (const item of result.applied) lines.push(`APPLIED_FILE: ${item.projectRel}`);
  for (const item of result.skipped) lines.push(`SKIPPED_FILE: ${item.projectRel}`);
  for (const item of result.blocked) lines.push(`BLOCKED_FILE: ${item.projectRel} - ${item.reason}`);
  if (result.metadataUpdated) {
    lines.push("VERSION_MARKER: updated");
  }
  if ((result.mutatedPaths || []).length === 0) {
    lines.push("MUTATED: none");
  } else {
    for (const path of result.mutatedPaths || []) lines.push(`MUTATED: ${path}`);
  }
  lines.push(`MEMORY_INDEX: ${result.memoryIndex?.status || "unknown"}`);
  lines.push(`MEMORY_INDEX_REFRESHED: ${result.memoryIndex?.refreshed ? "true" : "false"}`);
  lines.push(`ARTIFACT_ADAPT_CLEAN: ${result.postApply?.clean ? "true" : "false"}`);
  lines.push(`POST_APPLY_ADDS: ${result.postApply?.adds ?? "unknown"}`);
  lines.push(`POST_APPLY_UPDATES: ${result.postApply?.updates ?? "unknown"}`);
  lines.push(`CODE_INDEX_READY: ${result.indexGate?.ready === true ? "true" : "false"}`);
  if (result.indexGate?.ready === false) {
    lines.push(`INDEX_REASON: ${result.indexGate.reason || result.indexGate.failed || "unknown"}`);
    lines.push(`NEXT_INDEX_REPAIR: ${result.indexGate.repairCommand || DEFAULT_INDEX_REPAIR_COMMAND}`);
  }
  return lines.join("\n");
}

export function formatDokployDeployApply(result) {
  const lines = [
    "SUPERVIBE_ADAPT_DEPLOY_APPLY",
    `SCOPE: ${result.scope}`,
    `TARGET: ${result.target}`,
    `CREATED: ${(result.created || []).length}`,
    `UPDATED: ${(result.updated || []).length}`,
    `SKIPPED: ${(result.skipped || []).length}`,
    `ADAPT_STATE: ${result.lifecycleState?.path || "not-written"}`,
    `ARTIFACT_VERIFIED: ${result.lifecycleState?.verification?.artifactVerified === true}`,
    `AGENT_RECEIPTS_VERIFIED: ${result.lifecycleState?.verification?.agentReceiptsVerified === true}`,
    `APP_VERIFIED: ${result.lifecycleState?.verification?.appVerified === true}`,
    `DEPLOY_VERIFIED: ${result.lifecycleState?.verification?.deployVerified === true}`,
    `MIGRATION_COMMAND: ${result.migrationCommand}`,
  ];
  for (const item of result.created || []) lines.push(`CREATED_FILE: ${item.projectRel}`);
  for (const item of result.updated || []) lines.push(`UPDATED_FILE: ${item.projectRel}`);
  for (const item of result.skipped || []) lines.push(`SKIPPED_FILE: ${item.projectRel} - ${item.reason || "skipped"}`);
  for (const path of result.mutatedPaths || []) lines.push(`MUTATED: ${path}`);
  return lines.join("\n");
}

export function formatAdaptResolve(result) {
  const lines = [
    "SUPERVIBE_ADAPT_RESOLVE",
    `HOST: ${result.host?.adapterId || "unknown"}`,
    `VERSION: ${result.currentVersion || "unknown"}`,
    `RESOLVED: ${result.resolved.length}`,
    `BLOCKED: ${result.blocked.length}`,
    `BASELINE_UPDATED: ${result.baselineUpdated ? "true" : "false"}`,
  ];
  for (const item of result.resolved) {
    lines.push(`RESOLVED_FILE: ${item.projectRel} (${item.lineEndingOnly ? "line-ending-only" : "content-equal"})`);
  }
  for (const item of result.blocked) lines.push(`BLOCKED_FILE: ${item.projectRel} - ${item.reason}`);
  if ((result.mutatedPaths || []).length === 0) lines.push("MUTATED: none");
  else for (const path of result.mutatedPaths || []) lines.push(`MUTATED: ${path}`);
  return lines.join("\n");
}

export function filterAdaptPlanItems(plan, { changedOnly = false, quietIdentical = false } = {}) {
  const keep = (item) => {
    if (changedOnly) return item.action === "add" || item.action === "update" || item.action === "project-only";
    if (quietIdentical) return item.action !== "identical";
    return true;
  };
  return {
    ...plan,
    items: (plan.items || []).filter(keep),
  };
}

export function summarizeAdaptPlan(plan) {
  const changed = (plan.items || []).filter((item) => item.action === "add" || item.action === "update" || item.action === "project-only");
  return {
    kind: "adapt-summary",
    host: plan.host,
    version: {
      from: plan.lastSeenVersion || null,
      to: plan.currentVersion || null,
      drift: plan.versionDrift === true,
    },
    counts: plan.counts,
    memoryWrites: plan.memoryWrites === true,
    fastPath: plan.fastPath,
    agentPlanCommand: plan.agentPlanCommand || buildAdaptAgentPlanCommand({ counts: plan.counts, memoryWrites: plan.memoryWrites }),
    changeDetection: plan.changeDetection,
    frontendTarget: plan.frontendTarget,
    baselineRefreshRequired: plan.baselineRefreshRequired === true,
    approvalRequired: plan.approvalRequired === true,
    memoryIndex: plan.memoryIndex,
    changedItems: changed.map((item) => ({
      path: item.projectRel,
      action: item.action,
      classification: item.classification,
      upstream: item.upstreamRel,
      diff: item.diff || null,
    })),
    nextApply: plan.approvalRequired
      ? `node <resolved-supervibe-plugin-root>/scripts/supervibe-adapt.mjs --apply --include "${changed.filter((item) => item.action !== "project-only").map((item) => item.projectRel).join(",")}"`
      : plan.metadataUpdateRequired
        ? "node <resolved-supervibe-plugin-root>/scripts/supervibe-adapt.mjs --apply"
        : null,
  };
}

export function summarizeDokployDeployPlan(plan) {
  return {
    kind: "adapt-deploy-summary",
    scope: plan.scope,
    target: plan.target,
    counts: plan.counts,
    approvalRequired: plan.approvalRequired === true,
    migrationCommand: plan.migrationCommand,
    changedItems: (plan.items || [])
      .filter((item) => item.action === "create" || item.action === "update")
      .map((item) => ({
        path: item.projectRel,
        action: item.action,
        classification: item.classification,
        diff: item.diff || null,
      })),
  };
}

export function summarizeAdaptApply(result) {
  return {
    kind: "adapt-apply-summary",
    host: result.host,
    version: {
      from: result.lastSeenVersion || null,
      to: result.currentVersion || null,
    },
    applied: (result.applied || []).map((item) => item.projectRel),
    skipped: (result.skipped || []).map((item) => item.projectRel),
    blocked: (result.blocked || []).map((item) => ({ path: item.projectRel, reason: item.reason })),
    metadataUpdated: result.metadataUpdated === true,
    baselineRefreshed: result.baselineRefreshed === true,
    mutatedPaths: result.mutatedPaths || [],
    lifecycleState: result.lifecycleState,
    postApply: result.postApply,
    memoryIndex: result.memoryIndex,
    indexGate: result.indexGate,
    fileManifest: result.fileManifest || null,
  };
}

export async function verifyAdaptAgentRuntime(projectRoot = process.cwd()) {
  const agentRuntime = inspectAgentRuntimeEvidence(projectRoot);
  const statePath = join(projectRoot, ...STATE_PATH);
  const previous = readJsonOptional(statePath);
  const now = new Date().toISOString();
  let stateUpdated = false;
  if (previous) {
    const verification = {
      ...(previous.verification || {}),
      agentReceiptsVerified: agentRuntime.verified,
      agentRuntimeVerified: agentRuntime.verified,
      completionClaimAllowed: previous.verification?.artifactVerified === true && agentRuntime.verified,
      completionClaim: agentRuntime.verified
        ? "artifact adaptation and runtime agent receipt evidence are verified"
        : "artifact adaptation may be verified, but real agent completion is not claimed without receipt-bound host-agent telemetry",
    };
    const state = {
      ...previous,
      updatedAt: now,
      currentStage: agentRuntime.verified ? "agent-runtime-verified" : previous.currentStage,
      verification,
      evidence: {
        ...(previous.evidence || {}),
        agentRuntime,
      },
      validators: {
        ...(previous.validators || {}),
        agentReceiptsVerified: agentRuntime.verified,
        agentRuntimeVerified: agentRuntime.verified,
      },
      history: [
        ...(Array.isArray(previous.history) ? previous.history : []),
        {
          state: "agent-runtime-verification",
          at: now,
          validators: { agentReceiptsVerified: agentRuntime.verified },
        },
      ],
    };
    await mkdir(dirname(statePath), { recursive: true });
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    stateUpdated = true;
  }
  return {
    kind: "adapt-agent-runtime-verification",
    command: "/supervibe-adapt",
    agentRuntime,
    stateUpdated,
    statePath: previous ? normalizeRel(relative(projectRoot, statePath)) : null,
    nextAction: agentRuntime.verified
      ? "Adapt agent runtime receipt gate is verified."
      : "Run real host-agent stages, then log each with `node scripts/agent-invocation.mjs log ... --issue-receipt --command /supervibe-adapt --stage agent-smoke-test`.",
  };
}

export function formatAdaptAgentRuntimeVerification(result) {
  const lines = [
    "SUPERVIBE_ADAPT_VERIFY_AGENTS",
    `AGENT_RUNTIME_VERIFIED: ${result.agentRuntime.verified === true}`,
    `STATUS: ${result.agentRuntime.status}`,
    `TRUSTED_HOST_AGENT_RECEIPTS: ${result.agentRuntime.trustedHostAgentReceipts}`,
    `RECEIPT_BOUND_AGENT_INVOCATIONS: ${result.agentRuntime.receiptBoundAgentInvocations}`,
    `LOGGED_AGENT_INVOCATIONS: ${result.agentRuntime.loggedAgentInvocations}`,
    `STATE_UPDATED: ${result.stateUpdated ? result.statePath : "not-written-no-adapt-state"}`,
  ];
  for (const issue of result.agentRuntime.issues || []) lines.push(`ISSUE: ${issue}`);
  if (result.nextAction) lines.push(`NEXT_ACTION: ${result.nextAction}`);
  return lines.join("\n");
}

export function summarizeDokployDeployApply(result) {
  return {
    kind: "adapt-deploy-apply-summary",
    scope: result.scope,
    target: result.target,
    created: (result.created || []).map((item) => item.projectRel),
    updated: (result.updated || []).map((item) => item.projectRel),
    skipped: (result.skipped || []).map((item) => ({ path: item.projectRel, reason: item.reason || "skipped" })),
    mutatedPaths: result.mutatedPaths || [],
    migrationCommand: result.migrationCommand,
    lifecycleState: result.lifecycleState,
  };
}

export function summarizeAdaptResolve(result) {
  return {
    kind: "adapt-resolve-summary",
    host: result.host,
    version: result.currentVersion || null,
    resolved: (result.resolved || []).map((item) => ({
      path: item.projectRel,
      lineEndingOnly: item.lineEndingOnly === true,
    })),
    blocked: (result.blocked || []).map((item) => ({ path: item.projectRel, reason: item.reason })),
    baselineUpdated: result.baselineUpdated === true,
    mutatedPaths: result.mutatedPaths || [],
  };
}

function formatAdaptDiffSummary(plan) {
  const updates = (plan.items || []).filter((item) => {
    const diff = item.diff || {};
    return item.action === "update"
      || item.action === "add"
      || item.classification === "both-changed"
      || Number(diff.additions || 0) > 0
      || Number(diff.deletions || 0) > 0;
  });
  const lines = [
    "SUPERVIBE_ADAPT_DIFF_SUMMARY",
    `FILES: ${updates.length}`,
  ];
  for (const item of updates) {
    const diff = item.diff || {};
    lines.push(`DIFF: ${item.projectRel} +${diff.additions || 0} -${diff.deletions || 0} (${item.classification})`);
  }
  return lines.join("\n");
}

function buildAdaptFastPath({ counts = {}, items = [], memoryWrites = false } = {}) {
  const changed = items.filter((item) => item.action === "add" || item.action === "update");
  const eligible = Number(counts.add || 0) === 0
    && Number(counts.update || 0) <= 1
    && Number(counts.projectOnly || 0) === 0
    && Number(counts.conflicts || 0) === 0
    && memoryWrites === false;
  return {
    eligible,
    reason: eligible
      ? "low-risk upstream-only adapt can use CLI apply plus quality gate"
      : "standard adapt workflow required by adds, conflicts, project-only files, memory writes, or multiple updates",
    criteria: {
      adds: Number(counts.add || 0),
      updates: Number(counts.update || 0),
      projectOnly: Number(counts.projectOnly || 0),
      conflicts: Number(counts.conflicts || 0),
      memoryWrites: memoryWrites === true,
    },
    requiredRoles: eligible
      ? ["supervibe-orchestrator", "quality-gate-reviewer"]
      : ["supervibe-orchestrator", "repo-researcher", "rules-curator", "memory-curator", "quality-gate-reviewer"],
    allowedExecution: eligible ? "cli-apply-plus-validators" : "standard-agent-plan",
    changedArtifacts: changed.map((item) => item.projectRel),
  };
}

function buildAdaptAgentPlanCommand({ counts = {}, memoryWrites = false } = {}) {
  return [
    "node <resolved-supervibe-plugin-root>/scripts/command-agent-plan.mjs",
    "--command /supervibe-adapt",
    "--dry-run",
    `--adds ${Number(counts.add || 0)}`,
    `--updates ${Number(counts.update || 0)}`,
    `--project-only ${Number(counts.projectOnly || 0)}`,
    `--conflicts ${Number(counts.conflicts || 0)}`,
    `--memory-writes ${memoryWrites === true ? "true" : "false"}`,
  ].join(" ");
}

function buildAdaptChangeDetection(projectRoot) {
  const gitPath = join(projectRoot, ".git");
  if (existsSync(gitPath)) {
    return {
      mode: "git",
      gitPresent: true,
      status: "git-diff-available",
      command: "git diff <verified-against>..HEAD --stat",
    };
  }

  const manifestPath = join(projectRoot, ".supervibe", "memory", "adapt", "file-manifest.json");
  const current = buildNoGitFileManifest(projectRoot);
  const previous = readJsonOptional(manifestPath);
  const diff = diffFileManifest(previous, current);
  return {
    mode: "snapshot",
    gitPresent: false,
    status: previous ? "snapshot-diff-ready" : "initial-snapshot-missing",
    path: normalizeRel(relative(projectRoot, manifestPath)),
    previousExists: Boolean(previous),
    currentHash: current.manifestHash,
    counts: diff.counts,
    changedFiles: diff.changedFiles.slice(0, 50),
    note: previous
      ? "No .git directory found; Adapt compared the current file manifest with the last saved snapshot."
      : "No .git directory found and no Adapt snapshot exists yet; this is not fatal. Adapt will write the first snapshot after apply.",
  };
}

async function writeNoGitFileManifest(projectRoot) {
  const manifestPath = join(projectRoot, ".supervibe", "memory", "adapt", "file-manifest.json");
  const manifest = buildNoGitFileManifest(projectRoot);
  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return {
    mode: "snapshot",
    path: normalizeRel(relative(projectRoot, manifestPath)),
    files: manifest.files.length,
    manifestHash: manifest.manifestHash,
  };
}

function buildNoGitFileManifest(projectRoot) {
  const files = listSnapshotFiles(projectRoot).map((path) => {
    const rel = normalizeRel(relative(projectRoot, path));
    const content = readFileSync(path);
    return {
      path: rel,
      hash: createHash("sha256").update(content).digest("hex"),
      bytes: content.length,
    };
  });
  const manifestHash = hashContent(JSON.stringify(files.map((entry) => [entry.path, entry.hash, entry.bytes])));
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    root: "<project-root>",
    strategy: "no-git-snapshot",
    files,
    summary: {
      files: files.length,
      bytes: files.reduce((sum, entry) => sum + entry.bytes, 0),
    },
    manifestHash,
  };
}

function diffFileManifest(previous, current) {
  if (!previous?.files) {
    return {
      counts: { added: current.files.length, changed: 0, deleted: 0 },
      changedFiles: current.files.map((entry) => ({ path: entry.path, status: "added" })),
    };
  }
  const previousByPath = new Map((previous.files || []).map((entry) => [entry.path, entry]));
  const currentByPath = new Map((current.files || []).map((entry) => [entry.path, entry]));
  const changedFiles = [];
  for (const entry of current.files) {
    const old = previousByPath.get(entry.path);
    if (!old) changedFiles.push({ path: entry.path, status: "added" });
    else if (old.hash !== entry.hash || old.bytes !== entry.bytes) changedFiles.push({ path: entry.path, status: "changed" });
  }
  for (const entry of previous.files || []) {
    if (!currentByPath.has(entry.path)) changedFiles.push({ path: entry.path, status: "deleted" });
  }
  return {
    counts: {
      added: changedFiles.filter((entry) => entry.status === "added").length,
      changed: changedFiles.filter((entry) => entry.status === "changed").length,
      deleted: changedFiles.filter((entry) => entry.status === "deleted").length,
    },
    changedFiles: changedFiles.sort((a, b) => a.path.localeCompare(b.path)),
  };
}

function listSnapshotFiles(projectRoot) {
  const out = [];
  const visit = (dir) => {
    let entries = [];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      const rel = normalizeRel(relative(projectRoot, path));
      if (entry.isDirectory()) {
        if (snapshotDirectoryExcluded(entry.name, rel)) continue;
        visit(path);
      } else if (entry.isFile() && !snapshotFileExcluded(rel)) {
        out.push(path);
      }
    }
  };
  visit(projectRoot);
  return out.sort((a, b) => normalizeRel(relative(projectRoot, a)).localeCompare(normalizeRel(relative(projectRoot, b))));
}

function snapshotDirectoryExcluded(name, rel) {
  return [
    ".git",
    "node_modules",
    "bower_components",
    "jspm_packages",
    "dist",
    "build",
    "out",
    "coverage",
    ".next",
    ".nuxt",
    ".svelte-kit",
    ".turbo",
    ".cache",
  ].includes(name) || rel === ".supervibe/memory/workflow-receipts-stale";
}

function snapshotFileExcluded(rel) {
  return /^\.supervibe\/memory\/code\.db/.test(rel)
    || /^\.supervibe\/memory\/.*\.jsonl$/.test(rel)
    || /^\.supervibe\/memory\/.*\.(lock|key)$/.test(rel)
    || rel === ".supervibe/memory/adapt/file-manifest.json";
}

function readJsonOptional(path) {
  try {
    return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
  } catch {
    return null;
  }
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function classifyArtifact({ artifact, upstream, baselineHash }) {
  if (!upstream) {
    return {
      ...artifact,
      action: "project-only",
      classification: "project-only",
      upstreamAbs: null,
      upstreamRel: null,
    };
  }
  const projectContent = readFileSync(artifact.projectAbs, "utf8");
  const upstreamContent = readFileSync(upstream.upstreamAbs, "utf8");
  const projectHash = hashContent(projectContent);
  const upstreamHash = hashContent(upstreamContent);
  const comparableIdentical = hashComparableContent(projectContent) === hashComparableContent(upstreamContent);
  const lineEndingOnly = projectHash !== upstreamHash && comparableIdentical;
  const identical = projectHash === upstreamHash || lineEndingOnly;
  const classification = lineEndingOnly
    ? "line-ending-only-drift"
    : classifyHashes({ projectHash, upstreamHash, baselineHash });
  const diff = identical ? { additions: 0, deletions: 0 } : summarizeLineDiff(projectContent, upstreamContent);

  return {
    ...artifact,
    action: identical || classification === "project-local-edit" ? "identical" : "update",
    classification,
    upstreamAbs: upstream.upstreamAbs,
    upstreamRel: upstream.upstreamRel,
    projectHash,
    upstreamHash,
    baselineHash,
    lineEndingOnly,
    baselineRefreshRequired: identical && baselineHash !== upstreamHash,
    diff,
  };
}

async function planRelatedRuleClosure({ projectRoot, pluginRoot, adapter, upstream, projectArtifacts }) {
  const existingRuleNames = new Set();
  const plannedRuleNames = new Set();
  for (const artifact of projectArtifacts.filter((item) => item.type === "rule")) {
    existingRuleNames.add(artifact.id);
    const data = readArtifactMatter(artifact.projectAbs);
    if (data.name) existingRuleNames.add(String(data.name));
  }

  const closureItems = [];
  const queue = collectProjectRelatedRuleNames(projectArtifacts);
  const validatorResult = await validateArtifactLinks(projectRoot, {
    adapterId: adapter.id,
    pluginRoot,
  }).catch(() => null);
  for (const item of validatorResult?.issues || []) {
    if (item.code === "missing-related-rule" && item.upstreamAvailable && item.relatedRule) {
      queue.push(String(item.relatedRule));
    }
  }

  while (queue.length > 0) {
    const related = queue.shift();
    if (!related || existingRuleNames.has(related) || plannedRuleNames.has(related)) continue;
    const upstreamRule = upstream.rule.get(related);
    if (!upstreamRule) continue;

    const fileName = basename(upstreamRule.upstreamAbs);
    const projectAbs = join(projectRoot, adapter.rulesFolder, fileName);
    const projectRel = normalizeRel(relative(projectRoot, projectAbs));
    if (existsSync(projectAbs)) {
      existingRuleNames.add(related);
      continue;
    }

    const upstreamContent = readFileSync(upstreamRule.upstreamAbs, "utf8");
    const upstreamHash = hashContent(upstreamContent);
    const item = {
      type: "rule",
      id: upstreamRule.id,
      ruleName: related,
      action: "add",
      classification: "related-rule-closure",
      projectAbs,
      projectRel,
      upstreamAbs: upstreamRule.upstreamAbs,
      upstreamRel: upstreamRule.upstreamRel,
      upstreamHash,
      projectHash: null,
      baselineHash: null,
      mandatory: upstreamRule.mandatory,
      relatedRules: upstreamRule.relatedRules,
      diff: summarizeLineDiff("", upstreamContent),
    };
    closureItems.push(item);
    plannedRuleNames.add(related);
    existingRuleNames.add(related);
    for (const next of upstreamRule.relatedRules || []) {
      if (typeof next === "string" && next.trim()) queue.push(next.trim());
    }
  }

  return closureItems;
}

function collectProjectRelatedRuleNames(projectArtifacts) {
  const out = [];
  for (const artifact of projectArtifacts.filter((item) => item.type === "rule")) {
    const data = readArtifactMatter(artifact.projectAbs);
    for (const related of data["related-rules"] || []) {
      if (typeof related === "string" && related.trim()) out.push(related.trim());
    }
  }
  return out;
}

function dedupePlanItems(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = `${item.action}:${item.projectRel}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out.sort((a, b) => a.projectRel.localeCompare(b.projectRel) || a.action.localeCompare(b.action));
}

function classifyHashes({ projectHash, upstreamHash, baselineHash }) {
  if (projectHash === upstreamHash) return "identical";
  if (!baselineHash) return "review-update";
  if (projectHash === baselineHash && upstreamHash !== baselineHash) return "upstream-only-change";
  if (projectHash !== baselineHash && upstreamHash !== baselineHash) return "both-changed";
  if (projectHash !== baselineHash && upstreamHash === baselineHash) return "project-local-edit";
  return "review-update";
}

function buildUpstreamIndex(pluginRoot) {
  return {
    agent: new Map(listFiles(join(pluginRoot, "agents"), { recursive: true, suffix: ".md" })
      .map((path) => [basename(path, ".md"), {
        id: basename(path, ".md"),
        upstreamAbs: path,
        upstreamRel: normalizeRel(relative(pluginRoot, path)),
      }])),
    rule: buildRuleIndex(pluginRoot),
    skill: new Map(listFiles(join(pluginRoot, "skills"), { recursive: true, fileName: "SKILL.md" })
      .map((path) => {
        const id = basename(dirname(path));
        return [id, {
          id,
          upstreamAbs: path,
          upstreamRel: normalizeRel(relative(pluginRoot, path)),
        }];
      })),
  };
}

function buildRuleIndex(pluginRoot) {
  const index = new Map();
  for (const path of listFiles(join(pluginRoot, "rules"), { recursive: false, suffix: ".md" })) {
    const id = basename(path, ".md");
    const data = readArtifactMatter(path);
    const name = String(data.name || id).trim();
    const entry = {
      id,
      name,
      upstreamAbs: path,
      upstreamRel: normalizeRel(relative(pluginRoot, path)),
      mandatory: Boolean(data.mandatory),
      relatedRules: Array.isArray(data["related-rules"]) ? data["related-rules"].filter((item) => typeof item === "string") : [],
    };
    index.set(id, entry);
    if (name) index.set(name, entry);
  }
  return index;
}

function listProjectArtifacts(projectRoot, adapter) {
  return [
    ...listFiles(join(projectRoot, adapter.agentsFolder), { recursive: true, suffix: ".md" })
      .map((path) => projectArtifact(projectRoot, path, "agent", basename(path, ".md"))),
    ...listFiles(join(projectRoot, adapter.rulesFolder), { recursive: false, suffix: ".md" })
      .map((path) => projectArtifact(projectRoot, path, "rule", basename(path, ".md"))),
    ...listFiles(join(projectRoot, adapter.skillsFolder), { recursive: true, fileName: "SKILL.md" })
      .map((path) => projectArtifact(projectRoot, path, "skill", basename(dirname(path)))),
  ].sort((a, b) => a.projectRel.localeCompare(b.projectRel));
}

function projectArtifact(projectRoot, path, type, id) {
  return {
    type,
    id,
    projectAbs: path,
    projectRel: normalizeRel(relative(projectRoot, path)),
  };
}

function listFiles(dir, { recursive, suffix = null, fileName = null }) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (recursive) out.push(...listFiles(path, { recursive, suffix, fileName }));
      continue;
    }
    if (fileName && name !== fileName) continue;
    if (suffix && !name.endsWith(suffix)) continue;
    out.push(path);
  }
  return out;
}

function countPlanItems(items) {
  return {
    add: items.filter((item) => item.action === "add").length,
    update: items.filter((item) => item.action === "update").length,
    conflicts: items.filter((item) => item.classification === "both-changed").length,
    lineEndingOnly: items.filter((item) => item.classification === "line-ending-only-drift").length,
    baselineRefresh: items.filter((item) => item.baselineRefreshRequired === true).length,
    identical: items.filter((item) => item.action === "identical").length,
    projectOnly: items.filter((item) => item.action === "project-only").length,
  };
}

function readArtifactMatter(path) {
  try {
    return matter(readFileSync(path, "utf8")).data || {};
  } catch {
    return {};
  }
}

function readBaseline(projectRoot) {
  const path = join(projectRoot, ...BASELINE_PATH);
  if (!existsSync(path)) return { artifacts: {} };
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return { artifacts: {} };
  }
}

async function writeBaseline(plan, applied) {
  const path = join(plan.projectRoot, ...BASELINE_PATH);
  const current = readBaseline(plan.projectRoot);
  const artifacts = { ...(current.artifacts || {}) };
  const updatedAt = new Date().toISOString();
  for (const item of dedupeBaselineItems(applied)) {
    artifacts[item.projectRel] = {
      hash: item.upstreamHash,
      upstream: item.upstreamRel,
      updatedAt,
    };
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify({
    schemaVersion: 1,
    pluginVersion: plan.currentVersion || null,
    hostAdapter: plan.host.adapterId,
    artifacts,
  }, null, 2) + "\n");
  return normalizeRel(relative(plan.projectRoot, path));
}

async function writeAdaptLifecycleState(plan, result, { include = [], applyAll = false } = {}) {
  const path = join(plan.projectRoot, ...STATE_PATH);
  const now = new Date().toISOString();
  const approvedArtifacts = applyAll
    ? (plan.items || []).filter((item) => item.action === "add" || item.action === "update").map((item) => item.projectRel)
    : include.map(normalizeRel);
  const updatedArtifacts = (result.applied || []).map((item) => item.projectRel);
  const skippedArtifacts = (result.skipped || []).map((item) => item.projectRel);
  const blockedArtifacts = (result.blocked || []).map((item) => ({ path: item.projectRel, reason: item.reason }));
  const artifactVerified = blockedArtifacts.length === 0 && result.postApply?.clean === true;
  const agentRuntime = inspectAgentRuntimeEvidence(plan.projectRoot);
  const agentReceiptsVerified = agentRuntime.verified;
  const appVerified = false;
  const deployVerified = false;
  const lifecycle = blockedArtifacts.length > 0
    ? "failed_recoverable"
    : artifactVerified
      ? "artifact_verified"
      : "applied_unverified";
  const state = {
    schemaVersion: 2,
    command: "/supervibe-adapt",
    lifecycle,
    currentStage: lifecycle,
    host: result.host,
    frontendTarget: plan.frontendTarget || null,
    changeDetection: plan.changeDetection || null,
    currentVersion: result.currentVersion,
    previousVersion: result.lastSeenVersion || null,
    approvedArtifacts,
    updatedArtifacts,
    skippedArtifacts,
    blockedArtifacts,
    verification: {
      artifactVerified,
      agentReceiptsVerified,
      agentRuntimeVerified: agentReceiptsVerified,
      appVerified,
      deployVerified,
      completionClaimAllowed: artifactVerified && agentReceiptsVerified,
      completionClaim: agentReceiptsVerified
        ? "artifact adaptation verified with runtime agent receipt evidence"
        : "artifact adaptation verified only; real agent completion is not claimed without agent invocation receipts",
    },
    recovery: buildAdaptRecoveryState(plan, result, { approvedArtifacts, updatedArtifacts, skippedArtifacts, blockedArtifacts }),
    evidence: {
      fastPath: plan.fastPath || null,
      agentPlanCommand: plan.agentPlanCommand || buildAdaptAgentPlanCommand({ counts: plan.counts, memoryWrites: plan.memoryWrites }),
      metadataUpdated: result.metadataUpdated === true,
      memoryIndex: result.memoryIndex,
      postApply: result.postApply,
      indexGate: result.indexGate,
      agentRuntime,
      fileManifest: result.fileManifest || null,
    },
    validators: {
      artifactAdaptClean: result.postApply?.clean === true,
      artifactVerified,
      agentReceiptsVerified,
      agentRuntimeVerified: agentReceiptsVerified,
      appVerified,
      deployVerified,
      codeIndexReady: result.indexGate?.ready === true,
      blockedCount: blockedArtifacts.length,
    },
    history: [
      { state: "approved", at: now, artifacts: approvedArtifacts },
      { state: "applied", at: now, artifacts: updatedArtifacts },
      {
        state: lifecycle,
        at: now,
        validators: {
          artifactAdaptClean: result.postApply?.clean === true,
          artifactVerified,
          agentReceiptsVerified,
          agentRuntimeVerified: agentReceiptsVerified,
          appVerified,
          deployVerified,
          codeIndexReady: result.indexGate?.ready === true,
          blockedCount: blockedArtifacts.length,
        },
      },
    ],
    updatedAt: now,
  };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  return {
    path: normalizeRel(relative(plan.projectRoot, path)),
    lifecycle,
    updatedArtifacts,
    frontendTarget: state.frontendTarget,
    verification: state.verification,
    validators: state.validators,
  };
}

async function writeDeployLifecycleState(plan, result) {
  const path = join(plan.projectRoot, ...STATE_PATH);
  const now = new Date().toISOString();
  const createdArtifacts = (result.created || []).map((item) => item.projectRel);
  const updatedArtifacts = (result.updated || []).map((item) => item.projectRel);
  const skippedArtifacts = (result.skipped || []).map((item) => item.projectRel);
  const artifactVerified = (result.created || []).length + (result.updated || []).length > 0
    && (result.created || []).every((item) => existsSync(join(plan.projectRoot, item.projectRel)))
    && (result.updated || []).every((item) => existsSync(join(plan.projectRoot, item.projectRel)));
  const agentRuntime = inspectAgentRuntimeEvidence(plan.projectRoot);
  const agentReceiptsVerified = agentRuntime.verified;
  const state = {
    schemaVersion: 2,
    command: "/supervibe-adapt",
    scope: "deploy",
    target: plan.target,
    lifecycle: artifactVerified ? "artifact_verified" : "applied_unverified",
    currentStage: artifactVerified ? "artifact_verified" : "applied_unverified",
    approvedArtifacts: [...createdArtifacts, ...updatedArtifacts],
    updatedArtifacts: [...createdArtifacts, ...updatedArtifacts],
    skippedArtifacts,
    blockedArtifacts: [],
    verification: {
      artifactVerified,
      agentReceiptsVerified,
      agentRuntimeVerified: agentReceiptsVerified,
      appVerified: false,
      deployVerified: false,
      completionClaimAllowed: false,
      completionClaim: "Dokploy deploy artifacts were generated; deployment is not verified until Dokploy health checks pass.",
    },
    recovery: {
      beforeSnapshotHash: hashContent(JSON.stringify((plan.items || []).map((item) => ({
        path: item.projectRel,
        action: item.action,
        beforeHash: item.projectHash || null,
        templateHash: item.templateHash || null,
      })))),
      appliedFiles: [...createdArtifacts, ...updatedArtifacts],
      skippedFiles: skippedArtifacts,
      failedFile: null,
      rollbackCommand: "Restore generated deploy files from VCS or remove the listed applied files, then rerun supervibe-adapt --scope deploy --target dokploy --dry-run.",
      manualRestoreNotes: "Dokploy environment variables must be configured explicitly via .env.example/.env or Dokploy UI values rendered into env_file/environment.",
    },
    evidence: {
      migrationCommand: plan.migrationCommand,
      envPolicy: "Compose uses env_file and explicit environment keys; Dokploy UI env is not assumed to appear magically in containers.",
      agentRuntime,
    },
    validators: {
      artifactVerified,
      agentReceiptsVerified,
      agentRuntimeVerified: agentReceiptsVerified,
      appVerified: false,
      deployVerified: false,
      blockedCount: 0,
    },
    history: [
      { state: "approved", at: now, artifacts: [...createdArtifacts, ...updatedArtifacts] },
      { state: "applied", at: now, artifacts: [...createdArtifacts, ...updatedArtifacts] },
      { state: artifactVerified ? "artifact_verified" : "applied_unverified", at: now, validators: { artifactVerified, deployVerified: false } },
    ],
    updatedAt: now,
  };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  return {
    path: normalizeRel(relative(plan.projectRoot, path)),
    lifecycle: state.lifecycle,
    updatedArtifacts: state.updatedArtifacts,
    verification: state.verification,
    validators: state.validators,
  };
}

function inspectAgentRuntimeEvidence(projectRoot) {
  const result = validateAgentProducerReceipts(projectRoot, {
    requireHostAgentReceipts: true,
    minHostAgentReceipts: 1,
    minAgentInvocations: 1,
  });
  return {
    verified: result.pass === true,
    status: result.pass ? "verified-real-host-agent" : "awaiting-real-host-agent",
    trustedHostAgentReceipts: result.trustedHostAgentReceipts || 0,
    receiptBoundAgentInvocations: result.agentInvocations || 0,
    loggedAgentInvocations: result.loggedAgentInvocations || 0,
    issues: (result.issues || []).map((issue) => issue.code),
    evidencePath: ".supervibe/memory/agent-invocations.jsonl",
  };
}

function buildAdaptRecoveryState(plan, result, {
  approvedArtifacts = [],
  updatedArtifacts = [],
  skippedArtifacts = [],
  blockedArtifacts = [],
} = {}) {
  const beforeArtifacts = (plan.items || [])
    .filter((item) => approvedArtifacts.includes(item.projectRel) || updatedArtifacts.includes(item.projectRel) || skippedArtifacts.includes(item.projectRel))
    .map((item) => ({
      path: item.projectRel,
      action: item.action,
      classification: item.classification,
      beforeHash: item.projectHash || null,
      upstreamHash: item.upstreamHash || null,
    }));
  const failedFile = blockedArtifacts[0]?.path || null;
  return {
    beforeSnapshotHash: hashContent(JSON.stringify(beforeArtifacts)),
    beforeArtifacts,
    appliedFiles: updatedArtifacts,
    skippedFiles: skippedArtifacts,
    failedFile,
    rollbackCommand: updatedArtifacts.length
      ? "Restore the listed files from VCS or backups, then rerun supervibe-adapt --dry-run --summary-json --changed-only."
      : "No files were applied; rerun dry-run after resolving the blocked artifact.",
    manualRestoreNotes: "State stores relative paths and hashes only. It does not include absolute local filesystem paths.",
  };
}

async function ensureMemoryIndex(projectRoot) {
  const result = await curateProjectMemory({
    rootDir: projectRoot,
    rebuildSqlite: false,
    now: new Date().toISOString(),
  });
  return {
    status: result.pass ? "ready" : "needs-review",
    path: normalizeRel(relative(projectRoot, result.indexPath)),
    refreshed: true,
    markdownEntries: result.markdownEntries,
    warnings: result.validation?.warnings || [],
    errors: result.validation?.errors || [],
  };
}

function readMemoryIndexStatus(projectRoot) {
  const indexPath = join(projectRoot, ".supervibe", "memory", "index.json");
  if (!existsSync(indexPath)) {
    return {
      status: "not-refreshed",
      path: normalizeRel(relative(projectRoot, indexPath)),
      refreshed: false,
      reason: "read-only-adapt-plan",
    };
  }
  try {
    const data = JSON.parse(readFileSync(indexPath, "utf8"));
    return {
      status: "existing",
      path: normalizeRel(relative(projectRoot, indexPath)),
      refreshed: false,
      entries: Array.isArray(data.entries) ? data.entries.length : undefined,
      updatedAt: data.updatedAt || data.generatedAt || null,
    };
  } catch {
    return {
      status: "needs-review",
      path: normalizeRel(relative(projectRoot, indexPath)),
      refreshed: false,
      reason: "unreadable-index",
    };
  }
}

async function inspectIndexGate(projectRoot) {
  const codeDbPath = join(projectRoot, ".supervibe", "memory", "code.db");
  if (!existsSync(codeDbPath)) {
    return {
      ready: false,
      reason: "missing-code-index",
      repairCommand: DEFAULT_INDEX_REPAIR_COMMAND,
    };
  }
  if (!hasNodeSqliteSupport()) {
    return {
      ready: false,
      reason: `node-sqlite-unavailable-${SQLITE_NODE_MIN_VERSION}`,
      repairCommand: DEFAULT_INDEX_REPAIR_COMMAND,
    };
  }
  const store = new CodeStore(projectRoot, { useEmbeddings: false });
  await store.init();
  try {
    const health = await collectIndexHealthFromStore(store, { rootDir: projectRoot });
    const gate = evaluateIndexHealthGate(health);
    return {
      ready: gate.ready,
      reason: gate.ready ? "ready" : "index-health-gate",
      failed: (gate.failedGates || []).map((item) => item.code).join(",") || "none",
      indexedSourceFiles: gate.indexedSourceFiles,
      eligibleSourceFiles: gate.eligibleSourceFiles,
      sourceCoverage: gate.sourceCoverage,
      repairCommand: gate.repairCommand || DEFAULT_INDEX_REPAIR_COMMAND,
    };
  } finally {
    store.close();
  }
}

function summarizeLineDiff(before, after) {
  const beforeLines = splitLines(before);
  const afterLines = splitLines(after);
  if (beforeLines.length * afterLines.length > 1_000_000) {
    return summarizeLineDiffFast(beforeLines, afterLines);
  }
  const lcs = lcsLength(beforeLines, afterLines);
  return {
    additions: afterLines.length - lcs,
    deletions: beforeLines.length - lcs,
  };
}

function summarizeLineDiffFast(beforeLines, afterLines) {
  let prefix = 0;
  while (prefix < beforeLines.length && prefix < afterLines.length && beforeLines[prefix] === afterLines[prefix]) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix + prefix < beforeLines.length &&
    suffix + prefix < afterLines.length &&
    beforeLines[beforeLines.length - 1 - suffix] === afterLines[afterLines.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  return {
    additions: Math.max(0, afterLines.length - prefix - suffix),
    deletions: Math.max(0, beforeLines.length - prefix - suffix),
  };
}

function lcsLength(a, b) {
  let previous = new Array(b.length + 1).fill(0);
  let current = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = a[i - 1] === b[j - 1] ? previous[j - 1] + 1 : Math.max(previous[j], current[j - 1]);
    }
    [previous, current] = [current, previous.fill(0)];
  }
  return previous[b.length];
}

function splitLines(value) {
  const normalized = String(value || "").replace(/\r\n/g, "\n");
  if (!normalized) return [];
  return normalized.endsWith("\n") ? normalized.slice(0, -1).split("\n") : normalized.split("\n");
}

function hashComparableContent(value) {
  return hashContent(String(value || "").replace(/\r\n/g, "\n"));
}

function hashContent(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

function baselineRefreshCandidates(plan) {
  return (plan.items || []).filter((item) => item.baselineRefreshRequired === true);
}

function dedupeBaselineItems(items = []) {
  const byPath = new Map();
  for (const item of items || []) {
    if (!item?.projectRel || !item.upstreamHash) continue;
    byPath.set(item.projectRel, item);
  }
  return [...byPath.values()].sort((a, b) => a.projectRel.localeCompare(b.projectRel));
}

async function buildBlockedApplyResult(plan, { skipped = [], blocked = [] } = {}) {
  const postApplyPlan = await createAdaptPlan({
    projectRoot: plan.projectRoot,
    pluginRoot: plan.pluginRoot,
    adapterId: plan.host.adapterId,
    refreshMemoryIndex: false,
  });
  const indexGate = await inspectIndexGate(plan.projectRoot);
  return {
    kind: "adapt-apply",
    projectRoot: plan.projectRoot,
    pluginRoot: plan.pluginRoot,
    host: plan.host,
    currentVersion: plan.currentVersion,
    lastSeenVersion: plan.lastSeenVersion,
    applied: [],
    skipped,
    blocked,
    metadataUpdated: false,
    baselineRefreshed: false,
    mutatedPaths: [],
    postApply: {
      updates: postApplyPlan.counts.update,
      adds: postApplyPlan.counts.add,
      identical: postApplyPlan.counts.identical,
      projectOnly: postApplyPlan.counts.projectOnly,
      clean: postApplyPlan.counts.update === 0 && postApplyPlan.counts.add === 0,
    },
    memoryIndex: postApplyPlan.memoryIndex,
    indexGate,
    lifecycleState: {
      path: "not-written",
      lifecycle: "blocked_no_mutation",
      updatedArtifacts: [],
      validators: {
        artifactAdaptClean: false,
        codeIndexReady: indexGate?.ready === true,
        blockedCount: blocked.length,
      },
    },
  };
}

function dokployDeployArtifacts() {
  return [
    fileArtifact(".dockerignore", "Docker build context ignore policy", dockerignoreTemplate()),
    fileArtifact("docker-compose.dokploy.yml", "Dokploy compose stack with explicit env propagation, healthchecks, queue, scheduler, and named Postgres volume", dokployComposeTemplate()),
    fileArtifact("backend/Dockerfile", "Laravel backend runtime image", backendDockerfileTemplate()),
    fileArtifact("frontend/Dockerfile", "Next.js frontend runtime image", frontendDockerfileTemplate()),
    fileArtifact(".env.example", "Dokploy environment example; copy to .env or map keys explicitly in Dokploy", envExampleTemplate()),
    fileArtifact("docs/deploy/dokploy.md", "Dokploy deployment notes and migration policy", dokployReadmeTemplate()),
  ];
}

function fileArtifact(path, reason, content) {
  return { path, reason, content: ensureLf(content), type: "file" };
}

function dockerignoreTemplate() {
  return `
.git
.github
.supervibe/memory/code.db*
.supervibe/memory/code-index-checkpoint.json
.supervibe/memory/code-index.lock
.supervibe/research-cache/
node_modules
vendor
backend/vendor
frontend/node_modules
frontend/.next
frontend/out
coverage
.env
.env.*
!.env.example
postgres-data
.docker/volumes
*.sql
*.dump
`;
}

function dokployComposeTemplate() {
  return `
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    env_file:
      - .env
    environment:
      POSTGRES_DB: \${POSTGRES_DB}
      POSTGRES_USER: \${POSTGRES_USER}
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U \${POSTGRES_USER} -d \${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    restart: unless-stopped
    env_file:
      - .env
    environment:
      APP_ENV: \${APP_ENV:-production}
      APP_DEBUG: \${APP_DEBUG:-false}
      APP_URL: \${APP_URL}
      DB_CONNECTION: pgsql
      DB_HOST: postgres
      DB_PORT: 5432
      DB_DATABASE: \${POSTGRES_DB}
      DB_USERNAME: \${POSTGRES_USER}
      DB_PASSWORD: \${POSTGRES_PASSWORD}
      QUEUE_CONNECTION: \${QUEUE_CONNECTION:-database}
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "php artisan about --only=environment >/dev/null 2>&1 || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3

  queue:
    build:
      context: ./backend
      dockerfile: Dockerfile
    restart: unless-stopped
    command: ["php", "artisan", "queue:work", "--sleep=3", "--tries=3", "--timeout=90"]
    env_file:
      - .env
    environment:
      APP_ENV: \${APP_ENV:-production}
      DB_HOST: postgres
      DB_DATABASE: \${POSTGRES_DB}
      DB_USERNAME: \${POSTGRES_USER}
      DB_PASSWORD: \${POSTGRES_PASSWORD}
      QUEUE_CONNECTION: \${QUEUE_CONNECTION:-database}
    depends_on:
      backend:
        condition: service_healthy

  scheduler:
    build:
      context: ./backend
      dockerfile: Dockerfile
    restart: unless-stopped
    command: ["sh", "-lc", "while true; do php artisan schedule:run --verbose --no-interaction; sleep 60; done"]
    env_file:
      - .env
    environment:
      APP_ENV: \${APP_ENV:-production}
      DB_HOST: postgres
      DB_DATABASE: \${POSTGRES_DB}
      DB_USERNAME: \${POSTGRES_USER}
      DB_PASSWORD: \${POSTGRES_PASSWORD}
    depends_on:
      backend:
        condition: service_healthy

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    restart: unless-stopped
    env_file:
      - .env
    environment:
      NODE_ENV: production
      NEXT_PUBLIC_API_URL: \${NEXT_PUBLIC_API_URL}
    depends_on:
      backend:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:3000 >/dev/null 2>&1 || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  postgres-data:
    name: \${COMPOSE_PROJECT_NAME:-supervibe}-postgres-data
`;
}

function backendDockerfileTemplate() {
  return `
FROM php:8.3-cli-alpine

RUN apk add --no-cache bash curl git icu-dev libzip-dev oniguruma-dev postgresql-dev zip \\
  && docker-php-ext-install intl mbstring pdo_pgsql zip

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /app
COPY . .

RUN if [ -f composer.json ]; then composer install --no-dev --prefer-dist --optimize-autoloader --no-interaction; fi

EXPOSE 8000
CMD ["sh", "-lc", "php artisan config:cache && php artisan route:cache && php artisan serve --host=0.0.0.0 --port=8000"]
`;
}

function frontendDockerfileTemplate() {
  return `
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
CMD ["npm", "run", "start", "--", "--hostname", "0.0.0.0"]
`;
}

function envExampleTemplate() {
  return `
COMPOSE_PROJECT_NAME=supervibe

APP_ENV=production
APP_DEBUG=false
APP_URL=https://api.example.com
APP_KEY=

POSTGRES_DB=app
POSTGRES_USER=app
POSTGRES_PASSWORD=change-me

QUEUE_CONNECTION=database
NEXT_PUBLIC_API_URL=https://api.example.com
`;
}

function dokployReadmeTemplate() {
  return [
    "# Dokploy Deploy Notes",
    "",
    "This add-on creates deploy artifacts only. It does not run a deployment, migrate the database, or assume Dokploy UI variables appear inside containers automatically.",
    "",
    "## Environment",
    "",
    "Use .env.example as the contract. In Dokploy, either mount an .env file through the compose project or map the same keys explicitly. docker-compose.dokploy.yml uses both env_file and explicit environment keys so required Laravel, Next.js, and Postgres values are visible to containers.",
    "",
    "## Domains",
    "",
    "Point the frontend domain at the frontend service on port 3000. Point the API domain at the backend service on port 8000. Set APP_URL and NEXT_PUBLIC_API_URL to the public URLs that Dokploy routes.",
    "",
    "## Volumes",
    "",
    "Postgres uses the named volume postgres-data. Do not replace it with an anonymous bind mount unless you also define backup and restore ownership.",
    "",
    "## Migrations",
    "",
    "Run migrations explicitly after reviewing the release:",
    "",
    "```bash",
    DOKPLOY_MIGRATION_COMMAND,
    "```",
    "",
    "Do not auto-migrate on container start without an approved rollout and rollback policy.",
    "",
    "## Healthchecks",
    "",
    "Postgres uses pg_isready. Laravel uses php artisan about --only=environment. Next.js uses an HTTP check against port 3000.",
    "",
  ].join("\n");
}

function ensureLf(value) {
  return String(value || "").replace(/\r\n/g, "\n").replace(/^\n+/, "").replace(/\s+$/g, "") + "\n";
}

function normalizeRel(value) {
  return String(value || "").replace(/\\/g, "/");
}
