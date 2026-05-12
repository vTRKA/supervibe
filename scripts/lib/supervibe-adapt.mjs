import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
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
import { clearAdaptPending, getCurrentPluginVersion, getLastSeenVersion, setLastSeenVersion } from "./version-tracker.mjs";
import { validateArtifactLinks } from "../validate-artifact-links.mjs";
import { validateAgentProducerReceipts } from "./agent-producer-contract.mjs";
import {
  buildAgentSmokeTestState,
  recordAgentRuntimeSmoke,
} from "./agent-runtime-smoke.mjs";
import {
  collectFrontendPackageEvidence,
  readGenesisFrontendDecision,
  resolveFrontendTarget,
} from "./frontend-target-resolver.mjs";
import { createAgentProvisioningContextMigration } from "./agent-provisioning.mjs";
import { writeContextMigrationPlan } from "./supervibe-context-migrator.mjs";

const BASELINE_PATH = [".supervibe", "memory", "adapt", "baseline.json"];
const STATE_PATH = [".supervibe", "memory", "adapt", "state.json"];
const DEFAULT_INDEX_REPAIR_COMMAND = SOURCE_RAG_INDEX_COMMAND;
const ADAPT_STATE_REL_PATH = ".supervibe/memory/adapt/state.json";
const ADAPT_APP_VERIFY_COMMAND = "node <resolved-supervibe-plugin-root>/scripts/supervibe-genesis.mjs --verify-apps";
const DOKPLOY_FULL_STACK_MIGRATION_COMMAND = "docker compose -f docker-compose.dokploy.yml run --rm backend php artisan migrate --force";
const DOCKER_LARAVEL_MIGRATION_COMMAND = "docker compose run --rm backend php artisan migrate --force";
const NEXT_HEALTHCHECK_TEST = `["CMD-SHELL", "node -e \\"fetch('http://127.0.0.1:' + (process.env.PORT || 3000)).then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))\\""]`;

function nextHealthcheckLines(indent = "    ") {
  return [
    `${indent}healthcheck:`,
    `${indent}  test: ${NEXT_HEALTHCHECK_TEST}`,
    `${indent}  interval: 30s`,
    `${indent}  timeout: 10s`,
    `${indent}  start_period: 30s`,
    `${indent}  retries: 3`,
  ];
}

function nextHealthcheckBlock(indent = "    ") {
  return nextHealthcheckLines(indent).join("\n");
}

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
  const hostContextItem = planHostContextRefresh({
    projectRoot,
    pluginRoot,
    adapter,
    projectArtifacts,
    env,
  });
  const items = dedupePlanItems([
    ...projectItems,
    ...closureItems,
    ...(hostContextItem ? [hostContextItem] : []),
  ]);
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
    if (item.type === "host-context" && item.contextMigration) {
      candidates.push(item);
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
    if (item.type === "host-context" && item.contextMigration) {
      await writeContextMigrationPlan(item.contextMigration, { approved: true });
      applied.push(item);
      mutatedPaths.push(item.projectRel);
      continue;
    }
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
    await clearAdaptPending(plan.projectRoot, plan.currentVersion);
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

export async function applyAdaptPlanFixedPoint(plan, {
  include = [],
  applyAll = false,
  refreshMemoryIndex = true,
  maxRounds = 5,
} = {}) {
  const rounds = [];
  let result = await applyAdaptPlan(plan, { include, applyAll, refreshMemoryIndex });
  rounds.push(fixedPointRoundSummary(1, result));
  if ((result.blocked || []).length > 0) {
    result.fixedPoint = {
      enabled: true,
      status: "blocked",
      rounds,
      nextApply: nextApplyForPostApply(result),
    };
    return result;
  }

  for (let round = 2; round <= maxRounds && result.postApply?.clean !== true; round += 1) {
    const nextPlan = await createAdaptPlan({
      projectRoot: plan.projectRoot,
      pluginRoot: plan.pluginRoot,
      adapterId: plan.host.adapterId,
      refreshMemoryIndex: false,
    });
    const candidates = (nextPlan.items || []).filter((item) => item.action === "add" || item.action === "update");
    if (candidates.length === 0) break;
    const nextResult = await applyAdaptPlan(nextPlan, {
      include: candidates.map((item) => item.projectRel),
      applyAll: true,
      refreshMemoryIndex,
    });
    rounds.push(fixedPointRoundSummary(round, nextResult));
    result = mergeAdaptApplyResults(result, nextResult);
    if ((nextResult.blocked || []).length > 0) break;
  }

  result.fixedPoint = {
    enabled: true,
    status: (result.blocked || []).length > 0
      ? "blocked"
      : result.postApply?.clean === true
        ? "clean"
        : "max-rounds-reached",
    rounds,
    nextApply: nextApplyForPostApply(result),
  };
  return result;
}

export function createDokployDeployPlan({
  projectRoot = process.cwd(),
  target = "dokploy",
} = {}) {
  const deployProfile = resolveDeployProfile(projectRoot, target);
  const artifacts = deployArtifacts(deployProfile);
  const items = artifacts.map((artifact) => {
    const primaryAbs = join(projectRoot, artifact.path);
    if (!existsSync(primaryAbs)) {
      const existingAlternate = findAcceptableDeployAlternate({ projectRoot, artifact, deployProfile });
      if (existingAlternate) return existingAlternate;
      return {
        ...artifact,
        projectAbs: primaryAbs,
        projectRel: artifact.path,
        canonicalRel: artifact.path,
        action: "create",
        classification: "deploy-addon-missing",
        projectHash: null,
        templateHash: hashContent(artifact.content),
        diff: summarizeLineDiff("", artifact.content),
      };
    }
    const current = readFileSync(primaryAbs, "utf8");
    const projectHash = hashContent(current);
    const templateHash = hashContent(artifact.content);
    const projectLayerPresent = projectHash !== templateHash && acceptsExistingDeployLayer({ artifact, current, deployProfile });
    const identical = projectHash === templateHash || projectLayerPresent;
    return {
      ...artifact,
      projectAbs: primaryAbs,
      projectRel: artifact.path,
      canonicalRel: artifact.path,
      action: identical ? "identical" : "update",
      classification: projectLayerPresent ? "deploy-addon-project-layer-present" : identical ? "deploy-addon-identical" : "deploy-addon-review-update",
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
    deployProfile,
    projectRoot,
    approvalRequired: counts.create > 0 || counts.update > 0,
    counts,
    items,
    migrationCommand: deployProfile.migrationCommand,
    dockerVerification: inspectDockerRuntime(),
  };
}

function findAcceptableDeployAlternate({ projectRoot, artifact, deployProfile }) {
  const templateHash = hashContent(artifact.content);
  for (const alternatePath of artifact.alternatePaths || []) {
    const alternateRel = normalizeRel(alternatePath);
    const alternateAbs = join(projectRoot, alternateRel);
    if (!existsSync(alternateAbs)) continue;
    const current = readFileSync(alternateAbs, "utf8");
    const projectHash = hashContent(current);
    const alternateArtifact = {
      ...artifact,
      path: alternateRel,
      canonicalPath: artifact.path,
    };
    const projectLayerPresent = projectHash !== templateHash
      && acceptsExistingDeployLayer({ artifact: alternateArtifact, current, deployProfile });
    const identical = projectHash === templateHash || projectLayerPresent;
    if (!identical) continue;
    return {
      ...artifact,
      projectAbs: alternateAbs,
      projectRel: alternateRel,
      canonicalRel: artifact.path,
      action: "identical",
      classification: projectLayerPresent ? "deploy-addon-project-layer-present" : "deploy-addon-identical",
      projectHash,
      templateHash,
      diff: { additions: 0, deletions: 0 },
    };
  }
  return null;
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
  const dockerVerification = inspectDockerRuntime();
  const composeFile = composeFileForDeployResult(plan, { created, updated, skipped });
  const composeConfigVerification = verifyComposeConfig({
    projectRoot: plan.projectRoot,
    composeFile,
    dockerVerification,
  });
  const result = {
    kind: "adapt-deploy-apply",
    scope: plan.scope,
    target: plan.target,
    deployProfile: plan.deployProfile,
    projectRoot: plan.projectRoot,
    created,
    updated,
    skipped,
    migrationCommand: plan.migrationCommand,
    dockerVerification,
    composeConfigVerification,
    mutatedPaths: [...created, ...updated].map((item) => item.projectRel),
  };
  result.lifecycleState = await writeDeployLifecycleState(plan, result);
  result.mutatedPaths.push(result.lifecycleState.path);
  if (result.lifecycleState.genesisReconciliation?.path) {
    result.mutatedPaths.push(result.lifecycleState.genesisReconciliation.path);
  }
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
      await clearAdaptPending(plan.projectRoot, plan.currentVersion);
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
    `AGENT_PLAN_EMBEDDED: ${Boolean(plan.commandAgentPlan)}`,
    `AGENT_PLAN_EXECUTION_MODE: ${plan.commandAgentPlan?.executionMode || "not-run"}`,
    `AGENT_PLAN_RECEIPT_GATE: ${plan.commandAgentPlan?.receiptGate || "not-run"}`,
    `AGENT_PLAN_REQUIRED_AGENTS: ${(plan.commandAgentPlan?.requiredAgentIds || []).join(",") || "none"}`,
    `COMMAND_AGENT_READINESS: ${plan.commandAgentReadiness?.ready === true ? "ready" : plan.commandAgentReadiness ? "gaps" : "not-run"}`,
    `COMMAND_AGENT_READY_COMMANDS: ${plan.commandAgentReadiness ? `${plan.commandAgentReadiness.readyCommands}/${plan.commandAgentReadiness.totalCommands}` : "not-run"}`,
    `COMMAND_AGENT_MISSING_CALLABLE_AGENTS: ${(plan.commandAgentReadiness?.missingCallableAgents || []).join(",") || "none"}`,
    `MEMORY_INDEX: ${plan.memoryIndex?.status || "unknown"}`,
    `MEMORY_INDEX_REFRESHED: ${plan.memoryIndex?.refreshed ? "true" : "false"}`,
    `APPROVAL_REQUIRED: ${plan.approvalRequired}`,
    `ADAPT_STATE: ${plan.driftState?.path || (adaptDriftReported(plan) ? ADAPT_STATE_REL_PATH : "not-written")}`,
    `ADAPT_STATE_LIFECYCLE: ${plan.driftState?.lifecycle || (adaptDriftReported(plan) ? "drift_reported" : "not-needed")}`,
  ];
  appendDirtyStateLines(lines, plan.driftState?.dirtyState);
  appendVerificationHookLines(lines, plan.driftState?.verification);
  if (diffSummary) lines.push("", formatAdaptDiffSummary(plan));
  for (const warning of plan.frontendTarget?.driftWarnings || []) {
    lines.push(`FRONTEND_DRIFT: ${warning.code} - ${warning.message}`);
    lines.push(`FRONTEND_CHOICES: ${(warning.options || []).map((choice) => choice.id).join(", ")}`);
  }
  for (const entry of plan.commandAgentReadiness?.blockedCommands || []) {
    const missing = [
      ...(entry.missingCallableAgents || []).map((agentId) => `callable:${agentId}`),
      ...(entry.missingAgents || []).map((agentId) => `missing:${agentId}`),
    ].join(",");
    lines.push(`COMMAND_AGENT_GAP: ${entry.command} ${missing || "unknown"}`);
  }
  if (plan.commandAgentReadiness?.repairCommand) {
    lines.push(`COMMAND_AGENT_REPAIR: ${plan.commandAgentReadiness.repairCommand}`);
  }
  for (const item of plan.items) {
    if (item.action === "add") {
      if (item.type === "host-context") {
        lines.push(`HOST_CONTEXT_ADD: ${item.projectRel} (${item.classification})`);
      } else {
        const mandatory = item.mandatory === undefined ? "unknown" : String(Boolean(item.mandatory));
        lines.push(`ADD: ${item.projectRel} <= ${item.upstreamRel} (${item.classification}; mandatory: ${mandatory})`);
      }
    } else if (item.action === "update") {
      if (item.type === "host-context") {
        lines.push(`HOST_CONTEXT_REFRESH: ${item.projectRel} (${item.classification})`);
      } else {
        lines.push(`UPDATE: ${item.projectRel} <= ${item.upstreamRel} (${item.classification})`);
      }
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
    `DEPLOY_PROFILE: ${plan.deployProfile?.id || "unknown"}`,
    `STACK_EVIDENCE: ${(plan.deployProfile?.evidence || []).join(",") || "none"}`,
    `ARTIFACTS: ${(plan.items || []).length}`,
    `CREATES: ${plan.counts?.create ?? 0}`,
    `UPDATES: ${plan.counts?.update ?? 0}`,
    `IDENTICAL: ${plan.counts?.identical ?? 0}`,
    `APPROVAL_REQUIRED: ${plan.approvalRequired === true}`,
    `MIGRATION_COMMAND: ${plan.migrationCommand || "none"}`,
    `DOCKER_INSTALLED: ${plan.dockerVerification?.dockerInstalled === true}`,
    `DOCKER_COMPOSE_AVAILABLE: ${plan.dockerVerification?.composeAvailable === true}`,
    `DOCKER_DAEMON_RUNNING: ${plan.dockerVerification?.daemonRunning === true}`,
    `AGENT_PLAN_EMBEDDED: ${Boolean(plan.commandAgentPlan)}`,
    `AGENT_PLAN_EXECUTION_MODE: ${plan.commandAgentPlan?.executionMode || "not-run"}`,
    `AGENT_PLAN_RECEIPT_GATE: ${plan.commandAgentPlan?.receiptGate || "not-run"}`,
  ];
  if (plan.deployProfile?.blockedReason) lines.push(`BLOCKED: ${plan.deployProfile.blockedReason}`);
  for (const item of plan.items || []) {
    if (item.action === "create") lines.push(`CREATE: ${item.projectRel} (${item.reason})`);
    else if (item.action === "update") lines.push(`UPDATE: ${item.projectRel} (${item.classification})`);
    else lines.push(`IDENTICAL: ${item.projectRel}`);
  }
  if (plan.approvalRequired) {
    lines.push(`NEXT_APPLY: node <resolved-supervibe-plugin-root>/scripts/supervibe-adapt.mjs --scope deploy --target ${plan.target || "dokploy"} --apply`);
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
    `ADAPT_BASELINE_COMPLETE: ${result.lifecycleState?.verification?.adaptBaselineComplete === true}`,
    `AGENT_RECEIPTS_REQUIRED: ${result.lifecycleState?.verification?.agentReceiptsRequired !== false}`,
    `AGENT_RECEIPTS_VERIFIED: ${result.lifecycleState?.verification?.agentReceiptsVerified === true}`,
    `APP_VERIFIED: ${result.lifecycleState?.verification?.appVerified === true}`,
    `APP_VERIFICATION_STATUS: ${result.lifecycleState?.verification?.appVerificationStatus || "not-run-by-adapt"}`,
    `APP_VERIFICATION_COMMAND: ${result.lifecycleState?.verification?.appVerificationCommand || "none"}`,
    `DEPLOY_VERIFIED: ${result.lifecycleState?.verification?.deployVerified === true}`,
    `DEPLOY_VERIFICATION_STATUS: ${result.lifecycleState?.verification?.deployVerificationStatus || "not-run-by-adapt"}`,
    `DEPLOY_VERIFICATION_COMMAND: ${result.lifecycleState?.verification?.deployVerificationCommand || "none"}`,
    `TRANSACTION_ARTIFACT: ${result.workflowTransaction?.path || "not-written"}`,
    `WORKFLOW_RECEIPT: ${result.workflowTransaction?.receiptPath || "not-issued"}`,
  ];
  appendDirtyStateLines(lines, result.lifecycleState?.validators ? result.lifecycleState?.recovery?.dirtyState || result.lifecycleState?.evidence?.dirtyState : null);
  appendVerificationHookLines(lines, result.lifecycleState?.verification);
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
  lines.push(`FIXED_POINT: ${result.fixedPoint?.enabled === true}`);
  lines.push(`FIXED_POINT_STATUS: ${result.fixedPoint?.status || "not-run"}`);
  lines.push(`FIXED_POINT_ROUNDS: ${result.fixedPoint?.rounds?.length || 0}`);
  lines.push(`NEXT_APPLY: ${result.fixedPoint?.nextApply ?? (result.postApply?.clean ? "null" : "rerun-dry-run")}`);
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
    `DEPLOY_PROFILE: ${result.deployProfile?.id || "unknown"}`,
    `CREATED: ${(result.created || []).length}`,
    `UPDATED: ${(result.updated || []).length}`,
    `SKIPPED: ${(result.skipped || []).length}`,
    `ADAPT_STATE: ${result.lifecycleState?.path || "not-written"}`,
    `ARTIFACT_VERIFIED: ${result.lifecycleState?.verification?.artifactVerified === true}`,
    `AGENT_RECEIPTS_VERIFIED: ${result.lifecycleState?.verification?.agentReceiptsVerified === true}`,
    `APP_VERIFIED: ${result.lifecycleState?.verification?.appVerified === true}`,
    `APP_VERIFICATION_STATUS: ${result.lifecycleState?.verification?.appVerificationStatus || "not-run-by-adapt"}`,
    `APP_VERIFICATION_COMMAND: ${result.lifecycleState?.verification?.appVerificationCommand || "none"}`,
    `DEPLOY_VERIFIED: ${result.lifecycleState?.verification?.deployVerified === true}`,
    `DEPLOY_VERIFICATION_STATUS: ${result.lifecycleState?.verification?.deployVerificationStatus || "not-run-by-adapt"}`,
    `DEPLOY_VERIFICATION_COMMAND: ${result.lifecycleState?.verification?.deployVerificationCommand || "none"}`,
    `DEPLOY_ARTIFACTS_VERIFIED: ${result.lifecycleState?.verification?.deployArtifactsVerified === true}`,
    `COMPOSE_CONFIG_VERIFIED: ${result.lifecycleState?.verification?.composeConfigVerified === true}`,
    `DEPLOY_RUNTIME_VERIFIED: ${result.lifecycleState?.verification?.deployRuntimeVerified === true}`,
    `MIGRATION_COMMAND: ${result.migrationCommand || "none"}`,
    `DOCKER_INSTALLED: ${result.dockerVerification?.dockerInstalled === true}`,
    `DOCKER_COMPOSE_AVAILABLE: ${result.dockerVerification?.composeAvailable === true}`,
    `DOCKER_DAEMON_RUNNING: ${result.dockerVerification?.daemonRunning === true}`,
    `COMPOSE_CONFIG_STATUS: ${result.composeConfigVerification?.status || "not-run"}`,
    `TRANSACTION_ARTIFACT: ${result.workflowTransaction?.path || "not-written"}`,
    `WORKFLOW_RECEIPT: ${result.workflowTransaction?.receiptPath || "not-issued"}`,
  ];
  appendDirtyStateLines(lines, result.lifecycleState?.recovery?.dirtyState || result.lifecycleState?.evidence?.dirtyState);
  appendVerificationHookLines(lines, result.lifecycleState?.verification);
  if (result.composeConfigVerification?.command) lines.push(`COMPOSE_CONFIG_COMMAND: ${result.composeConfigVerification.command}`);
  if (result.lifecycleState?.genesisReconciliation?.path) lines.push(`GENESIS_STATE_RECONCILED: ${result.lifecycleState.genesisReconciliation.path}`);
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
    commandAgentPlan: plan.commandAgentPlan || null,
    commandAgentPlanReport: plan.commandAgentPlanReport || null,
    commandAgentReadiness: plan.commandAgentReadiness || null,
    changeDetection: plan.changeDetection,
    frontendTarget: plan.frontendTarget,
    baselineRefreshRequired: plan.baselineRefreshRequired === true,
    approvalRequired: plan.approvalRequired === true,
    memoryIndex: plan.memoryIndex,
    driftState: plan.driftState || null,
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
    deployProfile: plan.deployProfile,
    counts: plan.counts,
    approvalRequired: plan.approvalRequired === true,
    migrationCommand: plan.migrationCommand,
    dockerVerification: plan.dockerVerification,
    commandAgentPlan: plan.commandAgentPlan || null,
    commandAgentPlanReport: plan.commandAgentPlanReport || null,
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
    workflowTransaction: result.workflowTransaction || null,
    fixedPoint: result.fixedPoint || null,
  };
}

export async function verifyAdaptAgentRuntime(projectRoot = process.cwd(), { pluginRoot = process.cwd(), host = "codex", options = {} } = {}) {
  const smokeRecord = options["record-smoke"]
    ? recordAgentRuntimeSmoke({
        projectRoot,
        pluginRoot,
        host,
        command: "/supervibe-adapt",
        agentId: options["smoke-agent"] || "repo-researcher",
        hostInvocationId: options["host-invocation-id"] || options["invocation-id"],
      })
    : null;
  const agentRuntime = inspectAgentRuntimeEvidence(projectRoot);
  const agentSmokeTest = {
    ...buildAgentSmokeTestState({ host, command: "/supervibe-adapt", agentId: options["smoke-agent"] || "repo-researcher" }),
    status: agentRuntime.verified ? "verified-real-host-agent" : "pending-real-host-agent",
    smokeRecord,
  };
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
        agentSmokeTest,
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
    agentSmokeTest,
    smokeRecord,
    stateUpdated,
    statePath: previous ? normalizeRel(relative(projectRoot, statePath)) : null,
    nextAction: agentRuntime.verified
      ? "Adapt agent runtime receipt gate is verified."
      : agentSmokeTest.commandTemplate,
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
    `TRANSACTION_ARTIFACT: ${result.workflowTransaction?.path || "not-written"}`,
    `WORKFLOW_RECEIPT: ${result.workflowTransaction?.receiptPath || "not-issued"}`,
  ];
  if (result.smokeRecord) lines.push(`SMOKE_RECORD: ${result.smokeRecord.status}`);
  for (const issue of result.agentRuntime.issues || []) lines.push(`ISSUE: ${issue}`);
  if (result.nextAction) lines.push(`NEXT_ACTION: ${result.nextAction}`);
  return lines.join("\n");
}

export function summarizeDokployDeployApply(result) {
  return {
    kind: "adapt-deploy-apply-summary",
    scope: result.scope,
    target: result.target,
    deployProfile: result.deployProfile,
    created: (result.created || []).map((item) => item.projectRel),
    updated: (result.updated || []).map((item) => item.projectRel),
    skipped: (result.skipped || []).map((item) => ({ path: item.projectRel, reason: item.reason || "skipped" })),
    mutatedPaths: result.mutatedPaths || [],
    migrationCommand: result.migrationCommand,
    dockerVerification: result.dockerVerification,
    composeConfigVerification: result.composeConfigVerification || null,
    lifecycleState: result.lifecycleState,
    workflowTransaction: result.workflowTransaction || null,
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

function appendVerificationHookLines(lines, verification = null) {
  if (!verification) return;
  const app = verification.appVerification || null;
  const deploy = verification.deployVerification || null;
  if (app?.nextCommand) lines.push(`NEXT_APP_VERIFICATION: ${app.nextCommand}`);
  if (deploy?.nextCommand) lines.push(`NEXT_DEPLOY_VERIFICATION: ${deploy.nextCommand}`);
}

function appendDirtyStateLines(lines, dirtyState = null) {
  if (!dirtyState) return;
  const counts = dirtyState.counts || {};
  lines.push(`DIRTY_STATE: ${dirtyState.status || "unknown"}`);
  lines.push(`DIRTY_TOTAL: ${counts.total ?? 0}`);
  lines.push(`DIRTY_EXPECTED_RECEIPTS: ${counts.expectedReceipts ?? 0}`);
  lines.push(`DIRTY_EXPECTED_MEMORY: ${counts.expectedMemory ?? 0}`);
  lines.push(`DIRTY_STALE_GARBAGE: ${counts.staleGarbage ?? 0}`);
  lines.push(`DIRTY_APPROVED_ARTIFACTS: ${counts.approvedArtifacts ?? 0}`);
  lines.push(`DIRTY_UNEXPECTED_MUTATIONS: ${counts.unexpectedMutations ?? 0}`);
  lines.push(`DIRTY_SAFE: ${dirtyState.safe === true}`);
}

function buildAdaptFastPath({ counts = {}, items = [], memoryWrites = false } = {}) {
  const changed = items.filter((item) => item.action === "add" || item.action === "update");
  const baselineOnly = Number(counts.add || 0) === 0
    && Number(counts.update || 0) === 0
    && Number(counts.projectOnly || 0) === 0
    && Number(counts.conflicts || 0) === 0
    && memoryWrites === false;
  const eligible = Number(counts.add || 0) === 0
    && Number(counts.update || 0) <= 1
    && Number(counts.projectOnly || 0) === 0
    && Number(counts.conflicts || 0) === 0
    && memoryWrites === false;
  return {
    eligible,
    baselineOnly,
    reason: eligible
      ? baselineOnly
        ? "baseline-only adapt can use CLI apply plus deterministic validators and quality gate"
        : "low-risk upstream-only adapt can use CLI apply plus quality gate"
      : "standard adapt workflow required by adds, conflicts, project-only files, memory writes, or multiple updates",
    criteria: {
      adds: Number(counts.add || 0),
      updates: Number(counts.update || 0),
      projectOnly: Number(counts.projectOnly || 0),
      conflicts: Number(counts.conflicts || 0),
      memoryWrites: memoryWrites === true,
    },
    requiredRoles: eligible
      ? baselineOnly
        ? ["quality-gate-reviewer"]
        : ["supervibe-orchestrator", "quality-gate-reviewer"]
      : ["supervibe-orchestrator", "repo-researcher", "rules-curator", "memory-curator", "quality-gate-reviewer"],
    allowedExecution: eligible
      ? baselineOnly
        ? "baseline-only-cli-apply-plus-quality-gate"
        : "cli-apply-plus-validators"
      : "standard-agent-plan",
    changedArtifacts: changed.map((item) => item.projectRel),
  };
}

function buildAdaptAgentPlanCommand({ counts = {}, memoryWrites = false } = {}) {
  const baselineOnly = Number(counts.add || 0) === 0
    && Number(counts.update || 0) === 0
    && Number(counts.projectOnly || 0) === 0
    && Number(counts.conflicts || 0) === 0
    && memoryWrites === false;
  return [
    "node <resolved-supervibe-plugin-root>/scripts/command-agent-plan.mjs",
    "--command /supervibe-adapt",
    baselineOnly ? "--apply" : "--dry-run",
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

export async function writeAdaptFileManifestSnapshot(projectRoot = process.cwd()) {
  return writeNoGitFileManifest(projectRoot);
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
    || rel === ".supervibe/memory/code-index-checkpoint.json"
    || rel === ".supervibe/memory/code-index-status.json"
    || rel === ".supervibe/memory/source-rag-status.json"
    || rel === ".supervibe/memory/codegraph-status.json"
    || /^\.supervibe\/memory\/.*checkpoint.*\.json$/.test(rel)
    || /^\.supervibe\/memory\/.*status.*\.json$/.test(rel)
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

function planHostContextRefresh({ projectRoot, pluginRoot, adapter, projectArtifacts = [], env = process.env } = {}) {
  const context = createAgentProvisioningContextMigration({
    projectRoot,
    pluginRoot,
    adapterId: adapter.id,
    env,
  });
  const migration = context.contextMigration;
  const hasManagedBlock = (migration.parsed?.managedBlocks || []).some((block) => block.adapterId === adapter.id);
  const hasProvisioningState = existsSync(join(projectRoot, ".supervibe", "memory", "agent-provisioning", "last-apply.json"));
  const hasRuntimeArtifacts = projectArtifacts.some((item) => item.type === "agent" || item.type === "skill");
  if (!hasManagedBlock && !(hasProvisioningState && hasRuntimeArtifacts)) return null;

  const beforeContent = migration.beforeContent || "";
  const afterContent = migration.afterContent || "";
  if (hashComparableContent(beforeContent) === hashComparableContent(afterContent)) return null;

  const projectRel = normalizeRel(relative(projectRoot, migration.absolutePath));
  const beforeExists = existsSync(migration.absolutePath);
  return {
    type: "host-context",
    id: `${adapter.id}-managed-context`,
    action: beforeExists ? "update" : "add",
    classification: hasManagedBlock
      ? "host-context-managed-block-refresh"
      : "host-context-managed-block-restore",
    projectAbs: migration.absolutePath,
    projectRel,
    upstreamAbs: null,
    upstreamRel: `generated:${adapter.id}-managed-context`,
    upstreamHash: hashContent(afterContent),
    projectHash: hashContent(beforeContent),
    baselineHash: null,
    baselineRefreshRequired: false,
    contextMigration: migration,
    generatedContent: afterContent,
    diff: summarizeLineDiff(beforeContent, afterContent),
  };
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

export async function writeAdaptDriftState(plan, { items = null } = {}) {
  if (!adaptDriftReported(plan)) return null;
  const path = join(plan.projectRoot, ...STATE_PATH);
  const now = new Date().toISOString();
  const changedItems = (items || plan.items || [])
    .filter((item) => item.action === "add" || item.action === "update" || item.action === "project-only")
    .map((item) => ({
      path: item.projectRel,
      action: item.action,
      classification: item.classification,
      upstream: item.upstreamRel || null,
    }));
  const appVerification = buildAdaptAppVerificationHook(plan.projectRoot, { plan });
  const deployVerification = buildAdaptDeployVerificationHook(plan.projectRoot, { plan });
  const dirtyState = classifyAdaptDirtyState(plan.projectRoot);
  const state = {
    schemaVersion: 2,
    command: "/supervibe-adapt",
    lifecycle: "drift_reported",
    currentStage: "drift_reported",
    host: plan.host,
    frontendTarget: plan.frontendTarget || null,
    changeDetection: plan.changeDetection || null,
    currentVersion: plan.currentVersion || null,
    previousVersion: plan.lastSeenVersion || null,
    approvedArtifacts: [],
    updatedArtifacts: [],
    skippedArtifacts: [],
    blockedArtifacts: [],
    drift: {
      reported: true,
      approvalRequired: plan.approvalRequired === true,
      metadataUpdateRequired: plan.metadataUpdateRequired === true,
      baselineRefreshRequired: plan.baselineRefreshRequired === true,
      counts: plan.counts,
      changedItems,
    },
    verification: {
      artifactVerified: false,
      adaptBaselineComplete: false,
      agentReceiptsRequired: true,
      agentReceiptsVerified: false,
      agentRuntimeVerified: false,
      appVerified: appVerification.verified === true,
      appVerificationStatus: appVerification.status,
      appVerificationCommand: appVerification.nextCommand,
      appVerification,
      deployVerified: deployVerification.verified === true,
      deployVerificationStatus: deployVerification.status,
      deployVerificationCommand: deployVerification.nextCommand,
      deployVerification,
      completionClaimAllowed: false,
      completionClaim: "Adapt drift was reported only; apply and verification gates must run before claiming completion.",
    },
    recovery: {
      dirtyState,
      nextApply: plan.approvalRequired
        ? `node <resolved-supervibe-plugin-root>/scripts/supervibe-adapt.mjs --apply --include "${changedItems.filter((item) => item.action !== "project-only").map((item) => item.path).join(",")}"`
        : plan.metadataUpdateRequired
          ? "node <resolved-supervibe-plugin-root>/scripts/supervibe-adapt.mjs --apply"
          : null,
      nextAppVerification: appVerification.nextCommand,
      nextDeployVerification: deployVerification.nextCommand,
    },
    evidence: {
      fastPath: plan.fastPath || null,
      agentPlanCommand: plan.agentPlanCommand || buildAdaptAgentPlanCommand({ counts: plan.counts, memoryWrites: plan.memoryWrites }),
      memoryIndex: plan.memoryIndex,
      dirtyState,
    },
    validators: {
      artifactVerified: false,
      agentReceiptsVerified: false,
      agentRuntimeVerified: false,
      appVerified: appVerification.verified === true,
      deployVerified: deployVerification.verified === true,
      dirtyUnexpectedMutations: dirtyState.counts.unexpectedMutations,
      blockedCount: 0,
    },
    history: [
      { state: "drift_reported", at: now, counts: plan.counts },
    ],
    updatedAt: now,
  };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  return {
    path: normalizeRel(relative(plan.projectRoot, path)),
    lifecycle: state.lifecycle,
    verification: state.verification,
    validators: state.validators,
    dirtyState,
  };
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
  const baselineOnlyFastPath = plan.fastPath?.baselineOnly === true;
  const agentReceiptsRequired = !baselineOnlyFastPath;
  const adaptBaselineComplete = artifactVerified && (result.metadataUpdated === true || result.baselineRefreshed === true || updatedArtifacts.length === 0);
  const appVerification = buildAdaptAppVerificationHook(plan.projectRoot, { plan, result });
  const deployVerification = buildAdaptDeployVerificationHook(plan.projectRoot, { plan, result });
  const appVerified = appVerification.verified === true;
  const deployVerified = deployVerification.verified === true;
  const dirtyState = classifyAdaptDirtyState(plan.projectRoot, {
    expectedPaths: [
      ...updatedArtifacts,
      ...skippedArtifacts,
      ...(result.mutatedPaths || []),
      ADAPT_STATE_REL_PATH,
    ],
  });
  const lifecycle = blockedArtifacts.length > 0
    ? "failed_recoverable"
    : adaptBaselineComplete && baselineOnlyFastPath
      ? "baseline_verified"
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
      adaptBaselineComplete,
      agentReceiptsRequired,
      agentReceiptsVerified,
      agentRuntimeVerified: agentReceiptsVerified,
      appVerified,
      appVerificationStatus: appVerification.status,
      appVerificationCommand: appVerification.nextCommand,
      appVerification,
      deployVerified,
      deployVerificationStatus: deployVerification.status,
      deployVerificationCommand: deployVerification.nextCommand,
      deployVerification,
      completionClaimAllowed: artifactVerified && (agentReceiptsVerified || !agentReceiptsRequired),
      completionClaim: agentReceiptsVerified
        ? "artifact adaptation verified with runtime agent receipt evidence"
        : !agentReceiptsRequired
          ? "baseline-only adapt verified by deterministic adapt validators and quality gate; real-agent dispatch was not required"
        : "artifact adaptation verified only; real agent completion is not claimed without agent invocation receipts",
    },
    recovery: buildAdaptRecoveryState(plan, result, { approvedArtifacts, updatedArtifacts, skippedArtifacts, blockedArtifacts, dirtyState, appVerification, deployVerification }),
    evidence: {
      fastPath: plan.fastPath || null,
      agentPlanCommand: plan.agentPlanCommand || buildAdaptAgentPlanCommand({ counts: plan.counts, memoryWrites: plan.memoryWrites }),
      metadataUpdated: result.metadataUpdated === true,
      memoryIndex: result.memoryIndex,
      postApply: result.postApply,
      indexGate: result.indexGate,
      agentRuntime,
      fileManifest: result.fileManifest || null,
      dirtyState,
    },
    validators: {
      artifactAdaptClean: result.postApply?.clean === true,
      artifactVerified,
      adaptBaselineComplete,
      agentReceiptsRequired,
      agentReceiptsVerified,
      agentRuntimeVerified: agentReceiptsVerified,
      appVerified,
      deployVerified,
      dirtyUnexpectedMutations: dirtyState.counts.unexpectedMutations,
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
          adaptBaselineComplete,
          agentReceiptsRequired,
          agentReceiptsVerified,
          agentRuntimeVerified: agentReceiptsVerified,
          appVerified,
          deployVerified,
          dirtyUnexpectedMutations: dirtyState.counts.unexpectedMutations,
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
    recovery: state.recovery,
    evidence: state.evidence,
  };
}

async function writeDeployLifecycleState(plan, result) {
  const path = join(plan.projectRoot, ...STATE_PATH);
  const now = new Date().toISOString();
  const createdArtifacts = (result.created || []).map((item) => item.projectRel);
  const updatedArtifacts = (result.updated || []).map((item) => item.projectRel);
  const skippedArtifacts = (result.skipped || []).map((item) => item.projectRel);
  const currentArtifacts = (result.skipped || []).filter((item) => item.reason === "already current");
  const materializedArtifacts = [...(result.created || []), ...(result.updated || []), ...currentArtifacts];
  const artifactVerified = materializedArtifacts.length > 0
    && materializedArtifacts.every((item) => existsSync(join(plan.projectRoot, item.projectRel)));
  const agentRuntime = inspectAgentRuntimeEvidence(plan.projectRoot);
  const agentReceiptsVerified = agentRuntime.verified;
  const composeConfigVerification = result.composeConfigVerification || null;
  const composeConfigVerified = composeConfigVerification?.pass === true;
  const deployArtifactsVerified = artifactVerified;
  const appVerification = buildAdaptAppVerificationHook(plan.projectRoot, { plan, result });
  const deployVerification = buildAdaptDeployVerificationHook(plan.projectRoot, { plan, result });
  const deployRuntimeVerified = deployVerification.status === "verified";
  const deployVerified = deployVerification.verified === true;
  const dirtyState = classifyAdaptDirtyState(plan.projectRoot, {
    expectedPaths: [
      ...createdArtifacts,
      ...updatedArtifacts,
      ...(result.mutatedPaths || []),
      ADAPT_STATE_REL_PATH,
    ],
  });
  const lifecycle = composeConfigVerified
    ? "compose_config_verified"
    : artifactVerified
      ? "artifact_verified"
      : "applied_unverified";
  const state = {
    schemaVersion: 2,
    command: "/supervibe-adapt",
    scope: "deploy",
    target: plan.target,
    deployProfile: plan.deployProfile || null,
    lifecycle,
    currentStage: lifecycle,
    approvedArtifacts: [...createdArtifacts, ...updatedArtifacts],
    updatedArtifacts: [...createdArtifacts, ...updatedArtifacts],
    skippedArtifacts,
    blockedArtifacts: [],
    verification: {
      artifactVerified,
      deployArtifactsVerified,
      composeConfigVerified,
      deployRuntimeVerified,
      agentReceiptsVerified,
      agentRuntimeVerified: agentReceiptsVerified,
      appVerified: appVerification.verified === true,
      appVerificationStatus: appVerification.status,
      appVerificationCommand: appVerification.nextCommand,
      appVerification,
      deployVerified,
      deployVerificationStatus: deployVerification.status,
      deployVerificationCommand: deployVerification.nextCommand,
      deployVerification,
      completionClaimAllowed: false,
      completionClaim: composeConfigVerified
        ? "Deploy artifacts and compose syntax are verified; runtime deployment is not verified until image build, container boot, HTTP health, and external health checks pass."
        : "Deploy artifacts were generated; deployment is not verified until compose syntax and runtime health checks pass.",
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
      manualRestoreNotes: "Dokploy environment variables can be provided by Dokploy UI values or an explicit .env file; generated Dokploy compose files do not require env_file to exist.",
      dirtyState,
      nextAppVerification: appVerification.nextCommand,
      nextDeployVerification: deployVerification.nextCommand,
    },
    evidence: {
      migrationCommand: plan.migrationCommand,
      envPolicy: plan.target === "dokploy"
        ? "Compose uses explicit environment keys with safe defaults; Dokploy UI values may override them without requiring a local .env file."
        : "Compose uses explicit environment keys with safe defaults so docker compose config can run in fresh projects.",
      dockerVerification: result.dockerVerification || plan.dockerVerification || null,
      composeConfigVerification,
      agentRuntime,
      dirtyState,
    },
    validators: {
      artifactVerified,
      deployArtifactsVerified,
      composeConfigVerified,
      deployRuntimeVerified,
      agentReceiptsVerified,
      agentRuntimeVerified: agentReceiptsVerified,
      appVerified: appVerification.verified === true,
      deployVerified,
      dirtyUnexpectedMutations: dirtyState.counts.unexpectedMutations,
      blockedCount: 0,
    },
    history: [
      { state: "approved", at: now, artifacts: [...createdArtifacts, ...updatedArtifacts] },
      { state: "applied", at: now, artifacts: [...createdArtifacts, ...updatedArtifacts] },
      { state: lifecycle, at: now, validators: { artifactVerified, deployArtifactsVerified, composeConfigVerified, deployVerified } },
    ],
    updatedAt: now,
  };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  const stateRel = normalizeRel(relative(plan.projectRoot, path));
  const genesisReconciliation = await reconcileGenesisDeployState(plan, state, stateRel);
  return {
    path: stateRel,
    lifecycle: state.lifecycle,
    updatedArtifacts: state.updatedArtifacts,
    verification: state.verification,
    validators: state.validators,
    recovery: state.recovery,
    evidence: state.evidence,
    genesisReconciliation,
  };
}

async function reconcileGenesisDeployState(plan, adaptState, adaptStatePath) {
  const genesisPath = join(plan.projectRoot, ".supervibe", "memory", "genesis", "state.json");
  if (!existsSync(genesisPath)) return null;
  const previous = readJsonOptional(genesisPath);
  if (!previous) return null;
  const now = new Date().toISOString();
  const verificationPatch = {
    deployArtifactsVerified: adaptState.verification?.deployArtifactsVerified === true,
    composeConfigVerified: adaptState.verification?.composeConfigVerified === true,
    deployRuntimeVerified: adaptState.verification?.deployRuntimeVerified === true,
    deployVerified: adaptState.verification?.deployVerified === true,
  };
  const state = {
    ...previous,
    updatedAt: now,
    verification: {
      ...(previous.verification || {}),
      ...verificationPatch,
    },
    deployAddOnPolicy: reconcileDeployAddOnPolicy(previous.deployAddOnPolicy, {
      target: plan.target,
      adaptStatePath,
      verification: verificationPatch,
    }),
    confidence: reconcileGenesisConfidenceAfterDeploy(previous.confidence, verificationPatch),
    evidence: {
      ...(previous.evidence || {}),
      adaptDeployState: {
        path: adaptStatePath,
        target: plan.target,
        deployProfile: plan.deployProfile?.id || null,
        verification: verificationPatch,
      },
    },
    validators: {
      ...(previous.validators || {}),
      deployArtifactsVerified: verificationPatch.deployArtifactsVerified,
      composeConfigVerified: verificationPatch.composeConfigVerified,
      deployRuntimeVerified: verificationPatch.deployRuntimeVerified,
      deployVerified: verificationPatch.deployVerified,
    },
    history: [
      ...(Array.isArray(previous.history) ? previous.history : []),
      {
        at: now,
        lifecycle: "adapt-deploy-reconciled",
        adaptStatePath,
        target: plan.target,
        validators: verificationPatch,
      },
    ],
  };
  await writeFile(genesisPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  return {
    path: normalizeRel(relative(plan.projectRoot, genesisPath)),
    verification: verificationPatch,
  };
}

function reconcileDeployAddOnPolicy(policy = null, { target, adaptStatePath, verification } = {}) {
  if (!policy) return policy;
  const targets = new Set(policy.targets || []);
  if (target) targets.add(target);
  return {
    ...policy,
    status: verification?.composeConfigVerified
      ? "adapt-compose-config-verified"
      : verification?.deployArtifactsVerified
        ? "adapt-deploy-artifacts-verified"
        : policy.status,
    targets: [...targets],
    adaptStatePath,
    deployArtifactsVerified: verification?.deployArtifactsVerified === true,
    composeConfigVerified: verification?.composeConfigVerified === true,
    deployRuntimeVerified: verification?.deployRuntimeVerified === true,
  };
}

function reconcileGenesisConfidenceAfterDeploy(confidence = null, verification = {}) {
  if (!confidence || typeof confidence !== "object") return confidence;
  const gaps = (confidence.gaps || []).filter((gap) => gap?.code !== "deploy-addon-pending");
  if (verification.deployRuntimeVerified !== true && verification.deployArtifactsVerified === true) {
    gaps.push({
      code: "deploy-runtime-pending",
      message: "Deploy artifacts are verified; runtime deploy health is still pending.",
    });
  }
  const score = verification.composeConfigVerified
    ? Math.max(Number(confidence.score || 0), 8)
    : Number(confidence.score || 0);
  return {
    ...confidence,
    score,
    label: `${score}/10`,
    status: gaps.length > 0 ? "WARN" : confidence.status,
    gaps,
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

function adaptDriftReported(plan = {}) {
  const counts = plan.counts || {};
  return plan.approvalRequired === true
    || plan.metadataUpdateRequired === true
    || plan.baselineRefreshRequired === true
    || Number(counts.add || 0) > 0
    || Number(counts.update || 0) > 0
    || Number(counts.projectOnly || 0) > 0
    || Number(counts.conflicts || 0) > 0
    || (plan.frontendTarget?.driftWarnings || []).length > 0;
}

function buildAdaptAppVerificationHook(projectRoot, { plan = null } = {}) {
  const genesisState = readGenesisDeployState(projectRoot);
  const genesisVerification = genesisState?.verification || {};
  const generateAppsStep = genesisState?.generateAppsStep || {};
  const generated = genesisVerification.appGenerated === true
    || generateAppsStep.appGenerated === true
    || Array.isArray(generateAppsStep.results) && generateAppsStep.results.length > 0
    || Array.isArray(generateAppsStep.commands) && generateAppsStep.commands.length > 0;
  const projectAppEvidence = collectFrontendPackageEvidence({ rootDir: projectRoot }).length > 0;
  const appChoice = genesisState?.frontendTarget?.id
    || genesisState?.appChoice?.id
    || generateAppsStep.appChoice?.id
    || plan?.frontendTarget?.id
    || null;
  if (genesisVerification.appVerified === true || generateAppsStep.appVerified === true) {
    return {
      hookId: "post-adapt-app-verification",
      required: true,
      verified: true,
      status: "verified",
      nextCommand: null,
      source: "genesis-state",
      appChoice,
      note: "Genesis app verification evidence is already marked verified.",
    };
  }
  if (generated || projectAppEvidence || appChoice) {
    return {
      hookId: "post-adapt-app-verification",
      required: true,
      verified: false,
      status: "not-run-app-verification",
      nextCommand: ADAPT_APP_VERIFY_COMMAND,
      source: generated ? "genesis-generated-app" : projectAppEvidence ? "project-package-evidence" : "frontend-target",
      appChoice,
      note: "Adapt does not claim app verification until declared app lint/build checks run.",
    };
  }
  return {
    hookId: "post-adapt-app-verification",
    required: false,
    verified: false,
    status: "not-applicable",
    nextCommand: null,
    source: "no-app-evidence",
    appChoice,
    note: "No generated app or frontend package evidence was found for Adapt to verify.",
  };
}

function buildAdaptDeployVerificationHook(projectRoot, { plan = null, result = null } = {}) {
  const genesisState = readGenesisDeployState(projectRoot);
  const policy = genesisState?.deployAddOnPolicy || null;
  const requestedTargets = Array.isArray(policy?.targets) ? policy.targets : [];
  const target = result?.target || plan?.target || requestedTargets[0] || "dokploy";
  const scope = result?.scope || plan?.scope || "artifacts";
  const existingDeployVerified = genesisState?.verification?.deployVerified === true;
  if (existingDeployVerified) {
    return {
      hookId: "post-adapt-deploy-verification",
      required: true,
      verified: true,
      status: "verified",
      nextCommand: null,
      target,
      source: "genesis-state",
      note: "Genesis deploy verification evidence is already marked verified.",
    };
  }
  if (scope === "deploy" || result?.kind === "adapt-deploy-apply") {
    const composeFile = composeFileForDeployResult(plan || {}, {
      created: result?.created || [],
      updated: result?.updated || [],
      skipped: result?.skipped || [],
    });
    const composeCommand = `docker compose -f ${composeFile} config`;
    const runtimeCommand = `docker compose -f ${composeFile} up -d && run the service HTTP health checks for target ${target}`;
    const composeVerified = result?.composeConfigVerification?.pass === true;
    return {
      hookId: "post-adapt-deploy-verification",
      required: true,
      verified: false,
      status: composeVerified ? "not-run-deploy-runtime-verification" : "not-run-compose-verification",
      nextCommand: composeVerified ? runtimeCommand : composeCommand,
      composeCommand,
      runtimeCommand,
      target,
      source: "adapt-deploy-scope",
      note: "Adapt does not claim deployVerified until compose and runtime health checks pass.",
    };
  }
  if (policy?.requested === true || requestedTargets.length > 0 || policy?.status === "requires-adapt-deploy-scope") {
    return {
      hookId: "post-adapt-deploy-verification",
      required: true,
      verified: false,
      status: "not-run-deploy-adapt",
      nextCommand: `node <resolved-supervibe-plugin-root>/scripts/supervibe-adapt.mjs --scope deploy --target ${target} --dry-run`,
      target,
      source: "genesis-deploy-policy",
      note: "Deploy add-on planning is pending; deployVerified remains false until deploy scope and health checks run.",
    };
  }
  return {
    hookId: "post-adapt-deploy-verification",
    required: false,
    verified: false,
    status: "not-applicable",
    nextCommand: null,
    target: null,
    source: "no-deploy-policy",
    note: "No deploy add-on request or deploy artifacts were found for Adapt to verify.",
  };
}

function classifyAdaptDirtyState(projectRoot = process.cwd(), { expectedPaths = [] } = {}) {
  if (!existsSync(join(projectRoot, ".git"))) {
    return classifyAdaptDirtyEntries([], {
      expectedPaths,
      mode: "snapshot",
      status: "no-git-snapshot",
      command: null,
    });
  }
  const result = spawnSync("git", ["status", "--porcelain=v1", "-uall"], {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 5000,
    windowsHide: true,
  });
  if (result.status !== 0) {
    return {
      kind: "adapt-dirty-state",
      mode: "git",
      status: "git-status-failed",
      command: "git status --porcelain=v1 -uall",
      clean: false,
      safe: false,
      counts: emptyDirtyCounts(),
      categories: emptyDirtyCategories(),
      issue: tailLines(result.stderr || result.stdout || "unknown git status error", 3),
      nextAction: "Run git status manually before claiming Adapt recovery state.",
    };
  }
  const entries = String(result.stdout || "")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => ({
      raw: line,
      status: line.slice(0, 2).trim() || "??",
      path: normalizeGitStatusPath(line.slice(3)),
    }));
  return classifyAdaptDirtyEntries(entries, {
    expectedPaths,
    mode: "git",
    status: "git-status-classified",
    command: "git status --porcelain=v1 -uall",
  });
}

export function classifyAdaptDirtyEntries(entries = [], {
  expectedPaths = [],
  mode = "manual",
  status = "classified",
  command = null,
} = {}) {
  const expected = expectedPaths.map(normalizeRel).filter(Boolean);
  const categories = emptyDirtyCategories();
  for (const entry of entries || []) {
    const value = typeof entry === "string" ? { path: entry, status: "" } : entry;
    const path = normalizeRel(value.path || "");
    const item = { path, status: value.status || "", raw: value.raw || path };
    const category = classifyAdaptDirtyPath(path, expected);
    categories[category].push(item);
  }
  const counts = {
    total: Object.values(categories).reduce((sum, list) => sum + list.length, 0),
    expectedReceipts: categories.expectedReceipts.length,
    expectedMemory: categories.expectedMemory.length,
    staleGarbage: categories.staleGarbage.length,
    approvedArtifacts: categories.approvedArtifacts.length,
    unexpectedMutations: categories.unexpectedMutations.length,
  };
  return {
    kind: "adapt-dirty-state",
    mode,
    status,
    command,
    clean: counts.total === 0,
    safe: counts.unexpectedMutations === 0,
    counts,
    categories,
    nextAction: counts.unexpectedMutations > 0
      ? "Review unexpected mutations before claiming Adapt completion."
      : counts.staleGarbage > 0
        ? "Run Supervibe cleanup or receipt prune before release."
        : counts.total > 0
          ? "Dirty state contains expected Adapt receipts, memory, or approved artifacts."
          : "No dirty paths reported.",
  };
}

function classifyAdaptDirtyPath(path, expectedPaths = []) {
  if (expectedPaths.some((expected) => path === expected || path.startsWith(`${expected.replace(/\/$/, "")}/`))) {
    return path.startsWith(".supervibe/") ? "expectedMemory" : "approvedArtifacts";
  }
  if (/^\.supervibe\/artifacts\/_workflow-[^/]+\//.test(path)
    || /^\.supervibe\/artifacts\/_workflow-invocations\//.test(path)
    || path === ".supervibe/memory/workflow-invocation-ledger.jsonl") {
    return "expectedReceipts";
  }
  if (/^\.supervibe\/memory\/workflow-receipts-stale\//.test(path)
    || /^\.supervibe\/artifacts\/_workflow-stale\//.test(path)
    || /^\.supervibe\/artifacts\/_stale\//.test(path)) {
    return "staleGarbage";
  }
  if (/^\.supervibe\/memory\//.test(path)
    || /^\.supervibe\/artifacts\/_agent-outputs\//.test(path)) {
    return "expectedMemory";
  }
  return "unexpectedMutations";
}

function normalizeGitStatusPath(value = "") {
  const normalized = normalizeRel(String(value || "").trim().replace(/^"|"$/g, ""));
  const renameIndex = normalized.lastIndexOf(" -> ");
  return renameIndex >= 0 ? normalized.slice(renameIndex + 4) : normalized;
}

function emptyDirtyCounts() {
  return {
    total: 0,
    expectedReceipts: 0,
    expectedMemory: 0,
    staleGarbage: 0,
    approvedArtifacts: 0,
    unexpectedMutations: 0,
  };
}

function emptyDirtyCategories() {
  return {
    expectedReceipts: [],
    expectedMemory: [],
    staleGarbage: [],
    approvedArtifacts: [],
    unexpectedMutations: [],
  };
}

function buildAdaptRecoveryState(plan, result, {
  approvedArtifacts = [],
  updatedArtifacts = [],
  skippedArtifacts = [],
  blockedArtifacts = [],
  dirtyState = null,
  appVerification = null,
  deployVerification = null,
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
    dirtyState,
    nextAppVerification: appVerification?.nextCommand || null,
    nextDeployVerification: deployVerification?.nextCommand || null,
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

function fixedPointRoundSummary(round, result = {}) {
  return {
    round,
    applied: (result.applied || []).map((item) => item.projectRel),
    blocked: (result.blocked || []).map((item) => ({ path: item.projectRel, reason: item.reason })),
    postApply: result.postApply || null,
    lifecycle: result.lifecycleState?.lifecycle || null,
  };
}

function mergeAdaptApplyResults(previous = {}, next = {}) {
  return {
    ...next,
    applied: dedupePlanItems([...(previous.applied || []), ...(next.applied || [])]),
    skipped: dedupePlanItems([...(previous.skipped || []), ...(next.skipped || [])]),
    blocked: dedupePlanItems([...(previous.blocked || []), ...(next.blocked || [])]),
    metadataUpdated: previous.metadataUpdated === true || next.metadataUpdated === true,
    baselineRefreshed: previous.baselineRefreshed === true || next.baselineRefreshed === true,
    mutatedPaths: [...new Set([...(previous.mutatedPaths || []), ...(next.mutatedPaths || [])])],
  };
}

function nextApplyForPostApply(result = {}) {
  if (result.postApply?.clean === true) return null;
  if ((result.blocked || []).length > 0) return "manual-merge-or-resolve-blocked-artifacts";
  return "node <resolved-supervibe-plugin-root>/scripts/supervibe-adapt.mjs --apply --all --fixed-point";
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

function resolveDeployProfile(projectRoot, target = "dokploy") {
  const genesisState = readGenesisDeployState(projectRoot);
  const genesisChoice = readGenesisFrontendDecision(projectRoot);
  const frontendEvidence = collectFrontendPackageEvidence({ rootDir: projectRoot });
  const nextServices = assignServiceNames(discoverNextServices(projectRoot, frontendEvidence), "frontend");
  const laravel = detectLaravelEvidence(projectRoot);
  const laravelServices = assignServiceNames(laravel.services, "backend");
  const services = [...laravelServices, ...nextServices];
  const migrationCommands = buildLaravelMigrationCommands({ target, services: laravelServices });
  const unsupportedServices = discoverUnsupportedDeployServices(projectRoot, frontendEvidence, services);
  if (nextServices.length === 0 && isGenesisNextAppWithoutPackageEvidence({ genesisState, genesisChoice, frontendEvidence })) {
    return {
      id: "needs-app-generation",
      target,
      appDir: null,
      backendDir: laravelServices[0]?.dir || null,
      services: laravelServices,
      nextServices: [],
      laravelServices,
      unsupportedServices,
      migrationCommand: laravelServices.length > 0 ? migrationCommands.join(" && ") || null : null,
      migrationCommands: laravelServices.length > 0 ? migrationCommands : [],
      evidence: [
        "genesis:next-app",
        ...laravelServices.flatMap((service) => service.evidence || []),
      ],
      blockedReason: `Genesis resolved next-app, but no Next.js package.json evidence exists. Run /supervibe-genesis --generate-apps or add a real Next service before generating ${target} Docker artifacts.`,
    };
  }
  if (laravelServices.length > 0) {
    const id = nextServices.length > 0 ? "laravel-next-postgres" : "laravel-postgres";
    return {
      id,
      target,
      appDir: nextServices[0]?.dir || null,
      backendDir: laravelServices[0]?.dir || null,
      services,
      nextServices,
      laravelServices,
      unsupportedServices,
      migrationCommand: migrationCommands.join(" && ") || null,
      migrationCommands,
      evidence: services.flatMap((service) => service.evidence || []),
    };
  }
  if (nextServices.length > 0) {
    return {
      id: "next-only",
      target,
      appDir: nextServices[0]?.dir || "frontend",
      backendDir: null,
      services,
      nextServices,
      laravelServices: [],
      unsupportedServices,
      migrationCommand: null,
      migrationCommands: [],
      evidence: services.flatMap((service) => service.evidence || []),
    };
  }
  const unsupportedOnlyServices = discoverUnsupportedDeployServices(projectRoot, frontendEvidence, []);
  return {
    id: "needs-stack-evidence",
    target,
    appDir: null,
    backendDir: null,
    services: [],
    nextServices: [],
    laravelServices: [],
    unsupportedServices: unsupportedOnlyServices,
    migrationCommand: null,
    migrationCommands: [],
    evidence: [],
    blockedReason: unsupportedOnlyServices.length > 0
      ? `Only unsupported deploy services were found (${unsupportedOnlyServices.map((service) => service.kind).join(",")}); refusing to generate a ${target} plan without an explicit supported stack pack.`
      : `No Laravel or Next.js evidence was found; refusing to generate a ${target} backend, frontend, or migration plan from directory names alone.`,
  };
}

function readGenesisDeployState(projectRoot) {
  return readJsonOptional(join(projectRoot, ".supervibe", "memory", "genesis", "state.json"));
}

function isGenesisNextAppWithoutPackageEvidence({ genesisState = null, genesisChoice = null, frontendEvidence = [] } = {}) {
  const choice = typeof genesisChoice === "object" ? genesisChoice?.id : genesisChoice;
  const stateChoice = genesisState?.frontendTarget?.id
    || genesisState?.appChoice?.id
    || genesisState?.generateAppsStep?.appChoice?.id
    || null;
  const resolvedNext = choice === "next-app" || stateChoice === "next-app";
  if (!resolvedNext) return false;
  return !(frontendEvidence || []).some((entry) => (entry.tags || []).includes("nextjs"));
}

function detectLaravelEvidence(projectRoot) {
  const candidates = findComposerJsonFiles(projectRoot).map((rel) => ({
    rel,
    backendDir: rel === "composer.json" ? "." : dirname(rel),
  }));
  const evidence = [];
  const services = [];
  for (const candidate of candidates) {
    const abs = join(projectRoot, candidate.rel);
    if (!existsSync(abs)) continue;
    const json = readJsonOptional(abs);
    const deps = { ...(json?.require || {}), ...(json?.["require-dev"] || {}) };
    if (deps["laravel/framework"] || existsSync(join(projectRoot, candidate.backendDir, "artisan"))) {
      const itemEvidence = [`laravel:${candidate.rel}`];
      evidence.push(...itemEvidence);
      services.push({
        kind: "laravel",
        dir: normalizeRel(candidate.backendDir),
        packagePath: normalizeRel(candidate.rel),
        port: 8000,
        evidence: itemEvidence,
      });
    }
  }
  return {
    present: services.length > 0,
    evidence,
    services,
    backendDir: services[0]?.dir || "backend",
  };
}

function discoverNextServices(projectRoot, frontendEvidence = []) {
  const services = [];
  for (const entry of frontendEvidence || []) {
    if (!(entry.tags || []).includes("nextjs")) continue;
    const dir = entry.path === "package.json" ? "." : dirname(entry.path);
    services.push({
      kind: "next",
      dir: normalizeRel(dir),
      packagePath: normalizeRel(entry.path),
      packageName: entry.packageName || "",
      port: 3000,
      evidence: [`next:${normalizeRel(dir)}`],
    });
  }
  return services;
}

function discoverUnsupportedDeployServices(projectRoot, frontendEvidence = [], supportedServices = []) {
  const supportedPackagePaths = new Set(supportedServices.map((service) => normalizeRel(service.packagePath || "")));
  const unsupported = [];
  for (const entry of frontendEvidence || []) {
    const rel = normalizeRel(entry.path || "");
    if (!rel || supportedPackagePaths.has(rel)) continue;
    const tags = entry.tags || [];
    if (tags.includes("nextjs")) continue;
    unsupported.push({
      kind: tags.join("+") || "frontend-package",
      dir: rel === "package.json" ? "." : dirname(rel),
      packagePath: rel,
      packageName: entry.packageName || "",
      reason: "No Docker deploy pack is registered for this service kind yet.",
    });
  }
  for (const composerPath of findComposerJsonFiles(projectRoot)) {
    const rel = normalizeRel(composerPath);
    if (supportedPackagePaths.has(rel)) continue;
    const json = readJsonOptional(join(projectRoot, rel));
    if (!json) continue;
    unsupported.push({
      kind: "php-composer",
      dir: rel === "composer.json" ? "." : dirname(rel),
      packagePath: rel,
      packageName: json.name || "",
      reason: "Composer project is not Laravel; no generic PHP Docker pack is inferred.",
    });
  }
  return dedupeUnsupportedServices(unsupported);
}

function findComposerJsonFiles(rootDir, { maxDepth = 4 } = {}) {
  const found = [];
  const skipDirs = new Set([
    "vendor",
    "node_modules",
    ".git",
    ".supervibe",
    ".claude",
    ".codex",
    ".cursor",
    ".gemini",
    ".opencode",
    "storage",
    "bootstrap",
    "public",
  ]);
  const visit = (dir, depth) => {
    if (depth > maxDepth) return;
    let entries = [];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name) || (entry.name.startsWith(".") && entry.name !== ".github")) continue;
        visit(abs, depth + 1);
        continue;
      }
      if (entry.isFile() && entry.name === "composer.json") found.push(normalizeRel(relative(rootDir, abs)));
    }
  };
  visit(rootDir, 0);
  return found.sort();
}

function assignServiceNames(services = [], singleFallback = "service") {
  const used = new Set();
  return services.map((service, index) => {
    const fallback = services.length === 1 ? singleFallback : service.kind || singleFallback;
    const base = services.length === 1
      ? fallback
      : `${service.kind || "service"}-${service.dir === "." ? "root" : service.dir}`;
    const name = uniqueServiceName(slugifyServiceName(base), used, index + 1);
    return {
      ...service,
      composeName: name,
      envPrefix: envPrefixForService(name),
      dockerfilePath: service.dir === "." ? "Dockerfile" : `${service.dir}/Dockerfile`,
    };
  });
}

function uniqueServiceName(base, used, suffix) {
  let name = base || `service-${suffix}`;
  let i = 2;
  while (used.has(name)) {
    name = `${base}-${i}`;
    i += 1;
  }
  used.add(name);
  return name;
}

function slugifyServiceName(value = "") {
  const slug = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "service";
}

function envPrefixForService(name = "service") {
  return slugifyServiceName(name).replace(/-/g, "_").toUpperCase();
}

function buildLaravelMigrationCommands({ target = "dokploy", services = [] } = {}) {
  const composeFile = target === "dokploy" ? " -f docker-compose.dokploy.yml" : "";
  return (services || []).map((service) => `docker compose${composeFile} run --rm ${service.composeName || "backend"} php artisan migrate --force`);
}

function dedupeUnsupportedServices(services = []) {
  const byPath = new Map();
  for (const service of services || []) {
    const key = normalizeRel(service.packagePath || `${service.kind}:${service.dir}`);
    if (!byPath.has(key)) byPath.set(key, service);
  }
  return [...byPath.values()];
}

function deployArtifacts(profile = {}) {
  if (profile.id === "needs-stack-evidence" || profile.id === "needs-app-generation") return [];
  if (profile.target === "docker") return dockerDeployArtifacts(profile);
  return dokployDeployArtifacts(profile);
}

function dokployDeployArtifacts(profile = {}) {
  if (profile.id === "next-only") return nextOnlyDokployDeployArtifacts(profile);
  if (profile.id === "laravel-postgres") return laravelOnlyDokployDeployArtifacts(profile);
  if (profile.id !== "laravel-next-postgres") return [];
  const nextServices = deployNextServices(profile);
  const laravelServices = deployLaravelServices(profile);
  return [
    fileArtifact(".dockerignore", "Docker build context ignore policy", dockerignoreTemplate()),
    fileArtifact("docker-compose.dokploy.yml", "Dokploy compose stack with explicit env propagation, healthchecks, Laravel services, Next services, and named Postgres volume", dokployComposeTemplate({ nextServices, laravelServices })),
    ...serviceDockerignoreArtifacts([...laravelServices, ...nextServices]),
    ...laravelServices.map((service) => fileArtifact(service.dockerfilePath, `Laravel runtime image for ${service.dir}`, backendDockerfileTemplate())),
    ...nextServices.map((service) => fileArtifact(service.dockerfilePath, `Next.js runtime image for ${service.dir}`, frontendDockerfileTemplate())),
    fileArtifact(".env.example", "Dokploy environment example; copy to .env or map keys explicitly in Dokploy", envExampleTemplate()),
    fileArtifact("docs/deploy/dokploy.md", "Dokploy deployment notes and migration policy", dokployReadmeTemplate({ nextServices, laravelServices })),
  ];
}

function nextOnlyDokployDeployArtifacts(profile = {}) {
  const nextServices = deployNextServices(profile);
  return [
    fileArtifact(".dockerignore", "Docker build context ignore policy", dockerignoreTemplate()),
    fileArtifact("docker-compose.dokploy.yml", "Next-only Dokploy compose stack with internal port 3000 and no backend service", nextOnlyDokployComposeTemplate({ services: nextServices }), {
      alternatePaths: ["docker-compose.yml"],
    }),
    ...serviceDockerignoreArtifacts(nextServices),
    ...nextServices.map((service) => fileArtifact(service.dockerfilePath, `Next.js runtime image for ${service.dir}`, nextOnlyDockerfileTemplate())),
    fileArtifact(".env.example", "Next-only Dokploy environment example", nextOnlyEnvExampleTemplate()),
    fileArtifact("docs/deploy/dokploy.md", "Next-only Dokploy deployment notes", nextOnlyDokployReadmeTemplate({ services: nextServices }), {
      alternatePaths: ["docs/dokploy-deploy.md"],
    }),
  ];
}

function laravelOnlyDokployDeployArtifacts(profile = {}) {
  const laravelServices = deployLaravelServices(profile);
  return [
    fileArtifact(".dockerignore", "Docker build context ignore policy", dockerignoreTemplate()),
    fileArtifact("docker-compose.dokploy.yml", "Laravel-only Dokploy compose stack with backend and Postgres services", laravelOnlyDokployComposeTemplate({ services: laravelServices })),
    ...serviceDockerignoreArtifacts(laravelServices),
    ...laravelServices.map((service) => fileArtifact(service.dockerfilePath, `Laravel runtime image for ${service.dir}`, backendDockerfileTemplate())),
    fileArtifact(".env.example", "Laravel-only Dokploy environment example", laravelOnlyEnvExampleTemplate()),
    fileArtifact("docs/deploy/dokploy.md", "Laravel-only Dokploy deployment notes", laravelOnlyDokployReadmeTemplate({ services: laravelServices })),
  ];
}

function dockerDeployArtifacts(profile = {}) {
  if (profile.id === "next-only") return nextOnlyDockerDeployArtifacts(profile);
  if (profile.id === "laravel-postgres") return laravelOnlyDockerDeployArtifacts(profile);
  if (profile.id === "laravel-next-postgres") return fullStackDockerDeployArtifacts(profile);
  return [];
}

function nextOnlyDockerDeployArtifacts(profile = {}) {
  const nextServices = deployNextServices(profile);
  return [
    fileArtifact(".dockerignore", "Docker build context ignore policy", dockerignoreTemplate()),
    fileArtifact("docker-compose.yml", "Next-only Docker Compose stack for local/container deployment", nextOnlyDockerComposeTemplate({ services: nextServices })),
    ...serviceDockerignoreArtifacts(nextServices),
    ...nextServices.map((service) => fileArtifact(service.dockerfilePath, `Next.js runtime image for ${service.dir}`, nextOnlyDockerfileTemplate())),
    fileArtifact(".env.example", "Next-only Docker environment example", nextOnlyEnvExampleTemplate()),
    fileArtifact("docs/deploy/docker.md", "Next-only Docker deployment notes", nextOnlyDockerReadmeTemplate({ services: nextServices })),
  ];
}

function laravelOnlyDockerDeployArtifacts(profile = {}) {
  const laravelServices = deployLaravelServices(profile);
  return [
    fileArtifact(".dockerignore", "Docker build context ignore policy", dockerignoreTemplate()),
    fileArtifact("docker-compose.yml", "Laravel-only Docker Compose stack with backend and Postgres services", laravelOnlyDockerComposeTemplate({ services: laravelServices })),
    ...serviceDockerignoreArtifacts(laravelServices),
    ...laravelServices.map((service) => fileArtifact(service.dockerfilePath, `Laravel runtime image for ${service.dir}`, backendDockerfileTemplate())),
    fileArtifact(".env.example", "Laravel-only Docker environment example", laravelOnlyEnvExampleTemplate()),
    fileArtifact("docs/deploy/docker.md", "Laravel-only Docker deployment notes", laravelOnlyDockerReadmeTemplate({ services: laravelServices })),
  ];
}

function fullStackDockerDeployArtifacts(profile = {}) {
  const nextServices = deployNextServices(profile);
  const laravelServices = deployLaravelServices(profile);
  return [
    fileArtifact(".dockerignore", "Docker build context ignore policy", dockerignoreTemplate()),
    fileArtifact("docker-compose.yml", "Laravel + Next.js Docker Compose stack with Postgres", fullStackDockerComposeTemplate({ nextServices, laravelServices })),
    ...serviceDockerignoreArtifacts([...laravelServices, ...nextServices]),
    ...laravelServices.map((service) => fileArtifact(service.dockerfilePath, `Laravel runtime image for ${service.dir}`, backendDockerfileTemplate())),
    ...nextServices.map((service) => fileArtifact(service.dockerfilePath, `Next.js runtime image for ${service.dir}`, frontendDockerfileTemplate())),
    fileArtifact(".env.example", "Laravel + Next.js Docker environment example", envExampleTemplate()),
    fileArtifact("docs/deploy/docker.md", "Laravel + Next.js Docker deployment notes", fullStackDockerReadmeTemplate({ nextServices, laravelServices })),
  ];
}

function deployNextServices(profile = {}) {
  if (Array.isArray(profile.nextServices) && profile.nextServices.length > 0) return profile.nextServices;
  const dir = normalizeRel(profile.appDir || "frontend");
  return assignServiceNames([{ kind: "next", dir, port: 3000, evidence: [`next:${dir}`] }], "frontend");
}

function deployLaravelServices(profile = {}) {
  if (Array.isArray(profile.laravelServices) && profile.laravelServices.length > 0) return profile.laravelServices;
  const dir = normalizeRel(profile.backendDir || "backend");
  return assignServiceNames([{ kind: "laravel", dir, port: 8000, evidence: [`laravel:${dir}`] }], "backend");
}

function serviceDockerignoreArtifacts(services = []) {
  const dirs = new Map();
  for (const service of services || []) {
    const dir = normalizeRel(service.dir || ".");
    if (dir === ".") continue;
    if (!dirs.has(dir)) dirs.set(dir, service.kind || "service");
  }
  return [...dirs.entries()].map(([dir, kind]) => fileArtifact(
    `${dir}/.dockerignore`,
    `Docker build context ignore policy for ${dir}`,
    serviceDockerignoreTemplate(kind),
  ));
}

function fileArtifact(path, reason, content, options = {}) {
  return { path, reason, content: ensureLf(content), type: "file", ...options };
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

function serviceDockerignoreTemplate(kind = "service") {
  const common = [
    ".git",
    ".env",
    ".env.*",
    "!.env.example",
    "coverage",
    "*.log",
  ];
  if (kind === "next") {
    return [
      ...common,
      "node_modules",
      ".next",
      "out",
      "dist",
      "build",
    ].join("\n");
  }
  if (kind === "laravel") {
    return [
      ...common,
      "vendor",
      "node_modules",
      "storage/logs",
      "storage/framework/cache",
      "storage/framework/sessions",
      "storage/framework/views",
    ].join("\n");
  }
  return [
    ...common,
    "node_modules",
    "vendor",
    "dist",
    "build",
  ].join("\n");
}

function nextOnlyDokployComposeTemplate({ services = null, appDir = "frontend" } = {}) {
  if (Array.isArray(services) && services.length > 0) {
    return [
      "services:",
      ...services.map((service) => nextComposeServiceBlock(service, { dokploy: true })),
      "",
      "networks:",
      "  dokploy-network:",
      "    external: true",
      "",
    ].join("\n");
  }
  const context = appDir === "." ? "." : `./${appDir}`;
  return `
services:
  frontend:
    build:
      context: ${context}
      dockerfile: Dockerfile
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PORT: 3000
      HOSTNAME: 0.0.0.0
      NEXT_PUBLIC_APP_URL: \${NEXT_PUBLIC_APP_URL:-}
    expose:
      - "3000"
    networks:
      - dokploy-network
${nextHealthcheckBlock()}

networks:
  dokploy-network:
    external: true
`;
}

function nextOnlyDockerComposeTemplate({ services = null, appDir = "frontend" } = {}) {
  if (Array.isArray(services) && services.length > 0) {
    return [
      "services:",
      ...services.map((service) => nextComposeServiceBlock(service, { dokploy: false })),
      "",
    ].join("\n");
  }
  const context = appDir === "." ? "." : `./${appDir}`;
  return `
services:
  frontend:
    build:
      context: ${context}
      dockerfile: Dockerfile
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PORT: 3000
      HOSTNAME: 0.0.0.0
      NEXT_PUBLIC_APP_URL: \${NEXT_PUBLIC_APP_URL:-}
    ports:
      - "\${FRONTEND_PORT:-3000}:3000"
${nextHealthcheckBlock()}
`;
}

function laravelOnlyDokployComposeTemplate({ services = null, backendDir = "backend" } = {}) {
  if (Array.isArray(services) && services.length > 0) {
    return [
      "services:",
      postgresComposeServiceBlock({ dokploy: true }),
      ...services.map((service) => laravelComposeServiceBlock(service, { dokploy: true })),
      "",
      postgresVolumeBlock(),
      "",
      "networks:",
      "  dokploy-network:",
      "    external: true",
      "",
    ].join("\n");
  }
  const context = backendDir === "." ? "." : `./${backendDir}`;
  return `
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: \${POSTGRES_DB:-app}
      POSTGRES_USER: \${POSTGRES_USER:-app}
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD:-change-me}
    volumes:
      - postgres-data:/var/lib/postgresql/data
    networks:
      - dokploy-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U \${POSTGRES_USER:-app} -d \${POSTGRES_DB:-app}"]
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: ${context}
      dockerfile: Dockerfile
    restart: unless-stopped
    environment:
      APP_ENV: \${APP_ENV:-production}
      APP_DEBUG: \${APP_DEBUG:-false}
      APP_URL: \${APP_URL:-http://localhost:8000}
      DB_CONNECTION: pgsql
      DB_HOST: postgres
      DB_PORT: 5432
      DB_DATABASE: \${POSTGRES_DB:-app}
      DB_USERNAME: \${POSTGRES_USER:-app}
      DB_PASSWORD: \${POSTGRES_PASSWORD:-change-me}
    expose:
      - "8000"
    networks:
      - dokploy-network
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "php artisan about --only=environment >/dev/null 2>&1 || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  postgres-data:
    name: \${COMPOSE_PROJECT_NAME:-supervibe}-postgres-data

networks:
  dokploy-network:
    external: true
`;
}

function laravelOnlyDockerComposeTemplate({ services = null, backendDir = "backend" } = {}) {
  if (Array.isArray(services) && services.length > 0) {
    return [
      "services:",
      postgresComposeServiceBlock({ dokploy: false }),
      ...services.map((service) => laravelComposeServiceBlock(service, { dokploy: false })),
      "",
      postgresVolumeBlock(),
      "",
    ].join("\n");
  }
  const context = backendDir === "." ? "." : `./${backendDir}`;
  return `
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: \${POSTGRES_DB:-app}
      POSTGRES_USER: \${POSTGRES_USER:-app}
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD:-change-me}
    ports:
      - "\${POSTGRES_PORT:-5432}:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U \${POSTGRES_USER:-app} -d \${POSTGRES_DB:-app}"]
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: ${context}
      dockerfile: Dockerfile
    restart: unless-stopped
    environment:
      APP_ENV: \${APP_ENV:-production}
      APP_DEBUG: \${APP_DEBUG:-false}
      APP_URL: \${APP_URL:-http://localhost:8000}
      DB_CONNECTION: pgsql
      DB_HOST: postgres
      DB_PORT: 5432
      DB_DATABASE: \${POSTGRES_DB:-app}
      DB_USERNAME: \${POSTGRES_USER:-app}
      DB_PASSWORD: \${POSTGRES_PASSWORD:-change-me}
    ports:
      - "\${BACKEND_PORT:-8000}:8000"
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "php artisan about --only=environment >/dev/null 2>&1 || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  postgres-data:
    name: \${COMPOSE_PROJECT_NAME:-supervibe}-postgres-data
`;
}

function fullStackDockerComposeTemplate({ nextServices = null, laravelServices = null, appDir = "frontend", backendDir = "backend" } = {}) {
  if (Array.isArray(nextServices) && nextServices.length > 0 && Array.isArray(laravelServices) && laravelServices.length > 0) {
    return [
      "services:",
      postgresComposeServiceBlock({ dokploy: false }),
      ...laravelServices.map((service) => laravelComposeServiceBlock(service, { dokploy: false })),
      ...nextServices.map((service) => nextComposeServiceBlock(service, { dokploy: false, apiService: laravelServices[0]?.composeName })),
      "",
      postgresVolumeBlock(),
      "",
    ].join("\n");
  }
  const frontendContext = appDir === "." ? "." : `./${appDir}`;
  const backendContext = backendDir === "." ? "." : `./${backendDir}`;
  return `
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: \${POSTGRES_DB:-app}
      POSTGRES_USER: \${POSTGRES_USER:-app}
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD:-change-me}
    ports:
      - "\${POSTGRES_PORT:-5432}:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U \${POSTGRES_USER:-app} -d \${POSTGRES_DB:-app}"]
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: ${backendContext}
      dockerfile: Dockerfile
    restart: unless-stopped
    environment:
      APP_ENV: \${APP_ENV:-production}
      APP_DEBUG: \${APP_DEBUG:-false}
      APP_URL: \${APP_URL:-http://localhost:8000}
      DB_CONNECTION: pgsql
      DB_HOST: postgres
      DB_PORT: 5432
      DB_DATABASE: \${POSTGRES_DB:-app}
      DB_USERNAME: \${POSTGRES_USER:-app}
      DB_PASSWORD: \${POSTGRES_PASSWORD:-change-me}
    ports:
      - "\${BACKEND_PORT:-8000}:8000"
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "php artisan about --only=environment >/dev/null 2>&1 || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3

  frontend:
    build:
      context: ${frontendContext}
      dockerfile: Dockerfile
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PORT: 3000
      HOSTNAME: 0.0.0.0
      NEXT_PUBLIC_API_URL: \${NEXT_PUBLIC_API_URL:-}
    ports:
      - "\${FRONTEND_PORT:-3000}:3000"
    depends_on:
      backend:
        condition: service_healthy
${nextHealthcheckBlock()}

volumes:
  postgres-data:
    name: \${COMPOSE_PROJECT_NAME:-supervibe}-postgres-data
`;
}

function postgresComposeServiceBlock({ dokploy = false } = {}) {
  const networks = dokploy ? ["    networks:", "      - dokploy-network"] : [];
  const ports = dokploy ? [] : ["    ports:", '      - "${POSTGRES_PORT:-5432}:5432"'];
  return [
    "  postgres:",
    "    image: postgres:16-alpine",
    "    restart: unless-stopped",
    "    environment:",
    "      POSTGRES_DB: ${POSTGRES_DB:-app}",
    "      POSTGRES_USER: ${POSTGRES_USER:-app}",
    "      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-change-me}",
    ...ports,
    "    volumes:",
    "      - postgres-data:/var/lib/postgresql/data",
    ...networks,
    "    healthcheck:",
    '      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-app} -d ${POSTGRES_DB:-app}"]',
    "      interval: 10s",
    "      timeout: 5s",
    "      retries: 5",
    "",
  ].join("\n");
}

function laravelComposeServiceBlock(service = {}, { dokploy = false } = {}) {
  const context = service.dir === "." ? "." : `./${service.dir}`;
  const name = service.composeName || "backend";
  const portKey = `${service.envPrefix || envPrefixForService(name)}_PORT`;
  const networkLines = dokploy ? ["    networks:", "      - dokploy-network"] : [];
  const exposureLines = dokploy
    ? ["    expose:", '      - "8000"']
    : ["    ports:", `      - "\${${portKey}:-8000}:8000"`];
  return [
    `  ${name}:`,
    "    build:",
    `      context: ${context}`,
    "      dockerfile: Dockerfile",
    "    restart: unless-stopped",
    "    environment:",
    "      APP_ENV: ${APP_ENV:-production}",
    "      APP_DEBUG: ${APP_DEBUG:-false}",
    "      APP_URL: ${APP_URL:-http://localhost:8000}",
    "      DB_CONNECTION: pgsql",
    "      DB_HOST: postgres",
    "      DB_PORT: 5432",
    "      DB_DATABASE: ${POSTGRES_DB:-app}",
    "      DB_USERNAME: ${POSTGRES_USER:-app}",
    "      DB_PASSWORD: ${POSTGRES_PASSWORD:-change-me}",
    ...exposureLines,
    ...networkLines,
    "    depends_on:",
    "      postgres:",
    "        condition: service_healthy",
    "    healthcheck:",
    '      test: ["CMD-SHELL", "php artisan about --only=environment >/dev/null 2>&1 || exit 1"]',
    "      interval: 30s",
    "      timeout: 10s",
    "      retries: 3",
    "",
  ].join("\n");
}

function laravelQueueSchedulerBlocks(service = {}) {
  const context = service.dir === "." ? "." : `./${service.dir}`;
  const baseName = service.composeName || "backend";
  const queueName = baseName === "backend" ? "queue" : `${baseName}-queue`;
  const schedulerName = baseName === "backend" ? "scheduler" : `${baseName}-scheduler`;
  const shared = [
    "    build:",
    `      context: ${context}`,
    "      dockerfile: Dockerfile",
    "    restart: unless-stopped",
    "    environment:",
    "      APP_ENV: ${APP_ENV:-production}",
    "      DB_HOST: postgres",
    "      DB_DATABASE: ${POSTGRES_DB:-app}",
    "      DB_USERNAME: ${POSTGRES_USER:-app}",
    "      DB_PASSWORD: ${POSTGRES_PASSWORD:-change-me}",
    "    networks:",
    "      - dokploy-network",
    "    depends_on:",
    `      ${baseName}:`,
    "        condition: service_healthy",
  ];
  return [
    [
      `  ${queueName}:`,
      ...shared,
      '    command: ["php", "artisan", "queue:work", "--sleep=3", "--tries=3", "--timeout=90"]',
      "",
    ].join("\n"),
    [
      `  ${schedulerName}:`,
      ...shared,
      '    command: ["sh", "-lc", "while true; do php artisan schedule:run --verbose --no-interaction; sleep 60; done"]',
      "",
    ].join("\n"),
  ];
}

function nextComposeServiceBlock(service = {}, { dokploy = false, apiService = "" } = {}) {
  const context = service.dir === "." ? "." : `./${service.dir}`;
  const name = service.composeName || "frontend";
  const portKey = `${service.envPrefix || envPrefixForService(name)}_PORT`;
  const networkLines = dokploy ? ["    networks:", "      - dokploy-network"] : [];
  const exposureLines = dokploy
    ? ["    expose:", '      - "3000"']
    : ["    ports:", `      - "\${${portKey}:-3000}:3000"`];
  const apiLines = apiService ? ["      NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL:-}"] : ["      NEXT_PUBLIC_APP_URL: ${NEXT_PUBLIC_APP_URL:-}"];
  const dependencyLines = apiService
    ? ["    depends_on:", `      ${apiService}:`, "        condition: service_healthy"]
    : [];
  return [
    `  ${name}:`,
    "    build:",
    `      context: ${context}`,
    "      dockerfile: Dockerfile",
    "    restart: unless-stopped",
    "    environment:",
    "      NODE_ENV: production",
    "      PORT: 3000",
    "      HOSTNAME: 0.0.0.0",
    ...apiLines,
    ...exposureLines,
    ...networkLines,
    ...dependencyLines,
    ...nextHealthcheckLines(),
    "",
  ].join("\n");
}

function postgresVolumeBlock() {
  return [
    "volumes:",
    "  postgres-data:",
    "    name: ${COMPOSE_PROJECT_NAME:-supervibe}-postgres-data",
  ].join("\n");
}

function nextOnlyDockerfileTemplate() {
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
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=build /app ./
EXPOSE 3000
CMD ["npm", "run", "start", "--", "--hostname", "0.0.0.0"]
`;
}

function nextOnlyEnvExampleTemplate() {
  return `
COMPOSE_PROJECT_NAME=supervibe-next
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://example.com
`;
}

function nextOnlyDokployReadmeTemplate({ services = null, appDir = "frontend", dockerfilePath = "frontend/Dockerfile" } = {}) {
  if (Array.isArray(services) && services.length > 0) {
    return [
      "# Dokploy Deploy Notes",
      "",
      "This is a Next-only Dokploy layer. It intentionally does not create backend, Laravel, Postgres, queue, scheduler, or migration artifacts.",
      "",
      "## Services",
      "",
      ...services.map((service) => `- ${service.composeName}: builds from \`${service.dir}\` using \`${service.dockerfilePath}\` and exposes internal port \`3000\`.`),
      "",
      "The compose file does not publish host ports. Route traffic through Dokploy using each service name and port 3000.",
      "",
      "## Docker Verification",
      "",
      "```bash",
      `docker compose -f docker-compose.dokploy.yml build ${services.map((service) => service.composeName).join(" ")}`,
      "docker compose -f docker-compose.dokploy.yml config",
      "```",
      "",
    ].join("\n");
  }
  return [
    "# Dokploy Deploy Notes",
    "",
    "This is a Next-only Dokploy layer. It intentionally does not create backend, Laravel, Postgres, queue, scheduler, or migration artifacts.",
    "",
    "## Services",
    "",
    `The Next.js app builds from \`${appDir}\` using \`${dockerfilePath}\` and exposes internal port \`3000\` for Dokploy routing.`,
    "",
    "The compose file does not publish a host port. Route traffic through Dokploy using the frontend service and port 3000.",
    "",
    "## Docker Verification",
    "",
    "Before claiming deploy readiness, verify Docker is installed and the daemon is running. A local build can be checked with:",
    "",
    "```bash",
    "docker compose build frontend",
    "docker compose config",
    "```",
    "",
    "## Domains",
    "",
    "Set NEXT_PUBLIC_APP_URL to the public URL Dokploy routes to the frontend service.",
    "",
    "## Traefik Labels",
    "",
    "Add Traefik labels only after the domain is known. Keep them commented or omitted in the generated baseline.",
    "",
  ].join("\n");
}

function nextOnlyDockerReadmeTemplate({ services = null, appDir = "frontend", dockerfilePath = "frontend/Dockerfile" } = {}) {
  if (Array.isArray(services) && services.length > 0) {
    return [
      "# Docker Deploy Notes",
      "",
      "This is a Next-only Docker layer. It intentionally does not create backend, Laravel, Postgres, queue, scheduler, or migration artifacts.",
      "",
      "## Services",
      "",
      ...services.map((service) => `- ${service.composeName}: builds from \`${service.dir}\` using \`${service.dockerfilePath}\` and publishes \`${"${" + service.envPrefix + "_PORT:-3000}"}:3000\`.`),
      "",
      "## Verification",
      "",
      "```bash",
      "docker compose config",
      `docker compose build ${services.map((service) => service.composeName).join(" ")}`,
      "docker compose up -d",
      "```",
      "",
      "Use `--target dokploy` when you need Dokploy-specific compose networking without host port publishing.",
      "",
    ].join("\n");
  }
  return [
    "# Docker Deploy Notes",
    "",
    "This is a Next-only Docker layer. It intentionally does not create backend, Laravel, Postgres, queue, scheduler, or migration artifacts.",
    "",
    "## Services",
    "",
    `The Next.js app builds from \`${appDir}\` using \`${dockerfilePath}\`, exposes container port \`3000\`, and publishes \`${"${FRONTEND_PORT:-3000}"}:3000\` for local/container deployment.`,
    "",
    "## Verification",
    "",
    "```bash",
    "docker compose config",
    "docker compose build frontend",
    "docker compose up -d frontend",
    "```",
    "",
    "Use `--target dokploy` when you need Dokploy-specific compose networking without host port publishing.",
    "",
  ].join("\n");
}

function laravelOnlyEnvExampleTemplate() {
  return `
COMPOSE_PROJECT_NAME=supervibe-laravel

APP_ENV=production
APP_DEBUG=false
APP_URL=https://api.example.com
APP_KEY=

POSTGRES_DB=app
POSTGRES_USER=app
POSTGRES_PASSWORD=change-me
`;
}

function laravelOnlyDokployReadmeTemplate({ services = null, backendDir = "backend", dockerfilePath = "backend/Dockerfile" } = {}) {
  if (Array.isArray(services) && services.length > 0) {
    return [
      "# Dokploy Deploy Notes",
      "",
      "This is a Laravel-only Dokploy layer. It intentionally does not create Next.js, frontend, or Node runtime artifacts.",
      "",
      "## Services",
      "",
      ...services.map((service) => `- ${service.composeName}: builds from \`${service.dir}\` using \`${service.dockerfilePath}\`, exposes internal port \`8000\`, and connects to Postgres.`),
      "",
      "## Migrations",
      "",
      "Run migrations explicitly after reviewing the release:",
      "",
      "```bash",
      ...services.map((service) => `docker compose -f docker-compose.dokploy.yml run --rm ${service.composeName} php artisan migrate --force`),
      "```",
      "",
      "Do not auto-migrate on container start without an approved rollout and rollback policy.",
      "",
    ].join("\n");
  }
  return [
    "# Dokploy Deploy Notes",
    "",
    "This is a Laravel-only Dokploy layer. It intentionally does not create Next.js, frontend, or Node runtime artifacts.",
    "",
    "## Services",
    "",
    `The Laravel backend builds from \`${backendDir}\` using \`${dockerfilePath}\`, exposes internal port \`8000\`, and connects to the Postgres service.`,
    "",
    "Route API traffic through Dokploy using the backend service and port 8000.",
    "",
    "## Migrations",
    "",
    "Run migrations explicitly after reviewing the release:",
    "",
    "```bash",
    DOKPLOY_FULL_STACK_MIGRATION_COMMAND,
    "```",
    "",
    "Do not auto-migrate on container start without an approved rollout and rollback policy.",
    "",
  ].join("\n");
}

function laravelOnlyDockerReadmeTemplate({ services = null, backendDir = "backend", dockerfilePath = "backend/Dockerfile" } = {}) {
  if (Array.isArray(services) && services.length > 0) {
    return [
      "# Docker Deploy Notes",
      "",
      "This is a Laravel-only Docker layer. It intentionally does not create Next.js, frontend, or Node runtime artifacts.",
      "",
      "## Services",
      "",
      ...services.map((service) => `- ${service.composeName}: builds from \`${service.dir}\` using \`${service.dockerfilePath}\`, publishes \`${"${" + service.envPrefix + "_PORT:-8000}"}:8000\`, and connects to Postgres.`),
      "",
      "## Verification",
      "",
      "```bash",
      "docker compose config",
      `docker compose build ${services.map((service) => service.composeName).join(" ")}`,
      "docker compose up -d postgres",
      ...services.map((service) => `docker compose run --rm ${service.composeName} php artisan migrate --force`),
      "```",
      "",
    ].join("\n");
  }
  return [
    "# Docker Deploy Notes",
    "",
    "This is a Laravel-only Docker layer. It intentionally does not create Next.js, frontend, or Node runtime artifacts.",
    "",
    "## Services",
    "",
    `The Laravel backend builds from \`${backendDir}\` using \`${dockerfilePath}\`, publishes \`${"${BACKEND_PORT:-8000}"}:8000\`, and connects to Postgres.`,
    "",
    "## Verification",
    "",
    "```bash",
    "docker compose config",
    "docker compose build backend",
    "docker compose up -d postgres backend",
    DOCKER_LARAVEL_MIGRATION_COMMAND,
    "```",
    "",
  ].join("\n");
}

function fullStackDockerReadmeTemplate({ nextServices = null, laravelServices = null, appDir = "frontend", backendDir = "backend" } = {}) {
  if (Array.isArray(nextServices) && Array.isArray(laravelServices) && nextServices.length > 0 && laravelServices.length > 0) {
    return [
      "# Docker Deploy Notes",
      "",
      "This is a Laravel + Next.js Docker layer. Use `--target dokploy` when you need Dokploy-specific compose networking without host port publishing.",
      "",
      "## Services",
      "",
      ...laravelServices.map((service) => `- ${service.composeName}: Laravel service from \`${service.dir}\`, publishes \`${"${" + service.envPrefix + "_PORT:-8000}"}:8000\`.`),
      ...nextServices.map((service) => `- ${service.composeName}: Next.js service from \`${service.dir}\`, publishes \`${"${" + service.envPrefix + "_PORT:-3000}"}:3000\`.`),
      "Postgres uses a named volume.",
      "",
      "## Verification",
      "",
      "```bash",
      "docker compose config",
      `docker compose build ${[...laravelServices, ...nextServices].map((service) => service.composeName).join(" ")}`,
      "docker compose up -d",
      ...laravelServices.map((service) => `docker compose run --rm ${service.composeName} php artisan migrate --force`),
      "```",
      "",
    ].join("\n");
  }
  return [
    "# Docker Deploy Notes",
    "",
    "This is a Laravel + Next.js Docker layer. Use `--target dokploy` when you need Dokploy-specific compose networking without host port publishing.",
    "",
    "## Services",
    "",
    `The Laravel backend builds from \`${backendDir}\` and publishes \`${"${BACKEND_PORT:-8000}"}:8000\`.`,
    `The Next.js frontend builds from \`${appDir}\` and publishes \`${"${FRONTEND_PORT:-3000}"}:3000\`.`,
    "Postgres uses a named volume.",
    "",
    "## Verification",
    "",
    "```bash",
    "docker compose config",
    "docker compose build backend frontend",
    "docker compose up -d postgres backend frontend",
    DOCKER_LARAVEL_MIGRATION_COMMAND,
    "```",
    "",
  ].join("\n");
}

function dokployComposeTemplate({ nextServices = null, laravelServices = null, appDir = "frontend", backendDir = "backend" } = {}) {
  if (Array.isArray(nextServices) && nextServices.length > 0 && Array.isArray(laravelServices) && laravelServices.length > 0) {
    return [
      "services:",
      postgresComposeServiceBlock({ dokploy: true }),
      ...laravelServices.map((service) => laravelComposeServiceBlock(service, { dokploy: true })),
      ...laravelServices.flatMap((service) => laravelQueueSchedulerBlocks(service)),
      ...nextServices.map((service) => nextComposeServiceBlock(service, { dokploy: true, apiService: laravelServices[0]?.composeName })),
      "",
      postgresVolumeBlock(),
      "",
      "networks:",
      "  dokploy-network:",
      "    external: true",
      "",
    ].join("\n");
  }
  const frontendContext = appDir === "." ? "." : `./${appDir}`;
  const backendContext = backendDir === "." ? "." : `./${backendDir}`;
  return `
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: \${POSTGRES_DB:-app}
      POSTGRES_USER: \${POSTGRES_USER:-app}
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD:-change-me}
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U \${POSTGRES_USER:-app} -d \${POSTGRES_DB:-app}"]
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: ${backendContext}
      dockerfile: Dockerfile
    restart: unless-stopped
    environment:
      APP_ENV: \${APP_ENV:-production}
      APP_DEBUG: \${APP_DEBUG:-false}
      APP_URL: \${APP_URL:-http://localhost:8000}
      DB_CONNECTION: pgsql
      DB_HOST: postgres
      DB_PORT: 5432
      DB_DATABASE: \${POSTGRES_DB:-app}
      DB_USERNAME: \${POSTGRES_USER:-app}
      DB_PASSWORD: \${POSTGRES_PASSWORD:-change-me}
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
      context: ${backendContext}
      dockerfile: Dockerfile
    restart: unless-stopped
    command: ["php", "artisan", "queue:work", "--sleep=3", "--tries=3", "--timeout=90"]
    environment:
      APP_ENV: \${APP_ENV:-production}
      DB_HOST: postgres
      DB_DATABASE: \${POSTGRES_DB:-app}
      DB_USERNAME: \${POSTGRES_USER:-app}
      DB_PASSWORD: \${POSTGRES_PASSWORD:-change-me}
      QUEUE_CONNECTION: \${QUEUE_CONNECTION:-database}
    depends_on:
      backend:
        condition: service_healthy

  scheduler:
    build:
      context: ${backendContext}
      dockerfile: Dockerfile
    restart: unless-stopped
    command: ["sh", "-lc", "while true; do php artisan schedule:run --verbose --no-interaction; sleep 60; done"]
    environment:
      APP_ENV: \${APP_ENV:-production}
      DB_HOST: postgres
      DB_DATABASE: \${POSTGRES_DB:-app}
      DB_USERNAME: \${POSTGRES_USER:-app}
      DB_PASSWORD: \${POSTGRES_PASSWORD:-change-me}
    depends_on:
      backend:
        condition: service_healthy

  frontend:
    build:
      context: ${frontendContext}
      dockerfile: Dockerfile
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PORT: 3000
      HOSTNAME: 0.0.0.0
      NEXT_PUBLIC_API_URL: \${NEXT_PUBLIC_API_URL:-}
    expose:
      - "3000"
    networks:
      - dokploy-network
    depends_on:
      backend:
        condition: service_healthy
${nextHealthcheckBlock()}

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

function dokployReadmeTemplate({ nextServices = null, laravelServices = null, appDir = "frontend", backendDir = "backend" } = {}) {
  if (Array.isArray(nextServices) && Array.isArray(laravelServices) && nextServices.length > 0 && laravelServices.length > 0) {
    return [
      "# Dokploy Deploy Notes",
      "",
      "This add-on creates deploy artifacts only. It does not run a deployment, migrate the database, or assume Dokploy UI variables appear inside containers automatically.",
      "",
      "## Services",
      "",
      ...laravelServices.map((service) => `- ${service.composeName}: Laravel service from \`${service.dir}\`, internal port \`8000\`.`),
      ...nextServices.map((service) => `- ${service.composeName}: Next.js service from \`${service.dir}\`, internal port \`3000\`.`),
      "",
      "## Environment",
      "",
      "Use .env.example as the contract. In Dokploy, set the same keys in the UI or provide an optional .env file; docker-compose.dokploy.yml does not require env_file to exist.",
      "",
      "## Migrations",
      "",
      "Run migrations explicitly after reviewing the release:",
      "",
      "```bash",
      ...laravelServices.map((service) => `docker compose -f docker-compose.dokploy.yml run --rm ${service.composeName} php artisan migrate --force`),
      "```",
      "",
      "Do not auto-migrate on container start without an approved rollout and rollback policy.",
      "",
    ].join("\n");
  }
  return [
    "# Dokploy Deploy Notes",
    "",
    "This add-on creates deploy artifacts only. It does not run a deployment, migrate the database, or assume Dokploy UI variables appear inside containers automatically.",
    "",
    "## Environment",
    "",
    "Use .env.example as the contract. In Dokploy, set the same keys in the UI or provide an optional .env file. docker-compose.dokploy.yml uses explicit environment keys with safe defaults so compose syntax checks work in a fresh project.",
    "",
    "## Domains",
    "",
    `Point the frontend domain at the frontend service on port 3000 from \`${appDir}\`. Point the API domain at the backend service on port 8000 from \`${backendDir}\`. Set APP_URL and NEXT_PUBLIC_API_URL to the public URLs that Dokploy routes.`,
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
    DOKPLOY_FULL_STACK_MIGRATION_COMMAND,
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

function acceptsExistingDeployLayer({ artifact, current, deployProfile = {} } = {}) {
  if (deployProfile.target !== "dokploy" || deployProfile.id !== "next-only") return false;
  const rel = normalizeRel(artifact?.path || "");
  const canonicalRel = normalizeRel(artifact?.canonicalPath || artifact?.path || "");
  const text = String(current || "");
  if (rel === "docker-compose.yml" || canonicalRel === "docker-compose.dokploy.yml") {
    return /services:/i.test(text)
      && /3000/.test(text)
      && /dokploy/i.test(text)
      && !/\bbackend:/i.test(text)
      && !/php artisan/i.test(text);
  }
  if (rel.endsWith("/Dockerfile") || rel === "Dockerfile") {
    return /FROM\s+node:/i.test(text) && /3000/.test(text) && !/php artisan/i.test(text);
  }
  if (rel === "docs/dokploy-deploy.md" || canonicalRel === "docs/deploy/dokploy.md") {
    return /dokploy/i.test(text) && /3000/.test(text) && !/php artisan/i.test(text);
  }
  return false;
}

function inspectDockerRuntime() {
  if (process.env.SUPERVIBE_SKIP_DOCKER_PROBE === "1") {
    return {
      dockerInstalled: false,
      composeAvailable: false,
      daemonRunning: false,
      status: "docker-probe-skipped",
      version: "",
      daemonError: "",
    };
  }
  const version = spawnSync("docker", ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 3000,
    windowsHide: true,
  });
  const dockerInstalled = version.status === 0;
  const compose = dockerInstalled
    ? spawnSync("docker", ["compose", "version"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 3000,
        windowsHide: true,
      })
    : null;
  const info = dockerInstalled
    ? spawnSync("docker", ["info", "--format", "{{json .ServerVersion}}"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 3000,
        windowsHide: true,
      })
    : null;
  return {
    dockerInstalled,
    composeAvailable: compose?.status === 0,
    daemonRunning: info?.status === 0,
    status: !dockerInstalled
      ? "docker-not-installed"
      : info?.status === 0
        ? "docker-daemon-running"
        : "docker-daemon-not-running",
    version: dockerInstalled ? tailLines(version.stdout || "", 1).trim() : "",
    daemonError: dockerInstalled && info?.status !== 0 ? tailLines(info?.stderr || info?.stdout || "", 3) : "",
  };
}

function composeFileForTarget(target = "dokploy") {
  return target === "docker" ? "docker-compose.yml" : "docker-compose.dokploy.yml";
}

function composeFileForDeployResult(plan, { created = [], updated = [], skipped = [] } = {}) {
  const composeArtifact = [...created, ...updated, ...skipped, ...(plan.items || [])].find((item) => {
    const rel = normalizeRel(item?.projectRel || item?.path || "");
    const canonical = normalizeRel(item?.canonicalRel || item?.canonicalPath || item?.path || "");
    return rel === "docker-compose.yml"
      || rel === "docker-compose.dokploy.yml"
      || canonical === "docker-compose.yml"
      || canonical === "docker-compose.dokploy.yml";
  });
  return normalizeRel(composeArtifact?.projectRel || composeArtifact?.path || composeFileForTarget(plan.target));
}

function verifyComposeConfig({ projectRoot, composeFile, dockerVerification = null } = {}) {
  const normalizedComposeFile = normalizeRel(composeFile || composeFileForTarget());
  const command = `docker compose -f ${normalizedComposeFile} config`;
  if (process.env.SUPERVIBE_SKIP_DOCKER_PROBE === "1") {
    return {
      pass: false,
      status: "compose-config-skipped",
      command,
      composeFile: normalizedComposeFile,
      reason: "docker probe skipped",
    };
  }
  if (!existsSync(join(projectRoot, normalizedComposeFile))) {
    return {
      pass: false,
      status: "compose-file-missing",
      command,
      composeFile: normalizedComposeFile,
      reason: "compose file was not generated",
    };
  }
  if (dockerVerification?.dockerInstalled !== true) {
    return {
      pass: false,
      status: "docker-not-installed",
      command,
      composeFile: normalizedComposeFile,
      reason: "docker CLI is not available",
    };
  }
  if (dockerVerification?.composeAvailable !== true) {
    return {
      pass: false,
      status: "docker-compose-unavailable",
      command,
      composeFile: normalizedComposeFile,
      reason: "docker compose plugin is not available",
    };
  }
  const result = spawnSync("docker", ["compose", "-f", normalizedComposeFile, "config"], {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 10_000,
    windowsHide: true,
    env: {
      ...process.env,
      COMPOSE_PROJECT_NAME: process.env.COMPOSE_PROJECT_NAME || "supervibe-config-check",
    },
  });
  return {
    pass: result.status === 0,
    status: result.status === 0 ? "compose-config-pass" : "compose-config-fail",
    command,
    composeFile: normalizedComposeFile,
    exitCode: result.status,
    stdoutTail: tailLines(result.stdout || "", 5),
    stderrTail: tailLines(result.stderr || "", 5),
  };
}

function ensureLf(value) {
  return String(value || "").replace(/\r\n/g, "\n").replace(/^\n+/, "").replace(/\s+$/g, "") + "\n";
}

function tailLines(value, maxLines = 5) {
  return String(value || "")
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-maxLines)
    .join("\n");
}

function normalizeRel(value) {
  return String(value || "").replace(/\\/g, "/");
}
