import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { calculateReadyFront } from "./autonomous-loop-ready-front.mjs";
import { createTaskGraph } from "./autonomous-loop-task-graph.mjs";
import { attachExternalClaim, claimTask, releaseClaim } from "./autonomous-loop-claims.mjs";
import { createUnavailableTaskTrackerAdapter } from "./supervibe-durable-task-tracker-adapter.mjs";
import { createBlockerV1 } from "./supervibe-work-state.mjs";

export function defaultTrackerMappingPath(rootDir = process.cwd()) {
  return join(rootDir, ".supervibe", "memory", "loops", "task-tracker-map.json");
}

export async function readTrackerMapping(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return createEmptyMapping();
    throw error;
  }
}

export async function writeTrackerMapping(filePath, mapping) {
  await mkdir(dirname(filePath), { recursive: true });
  const normalized = normalizeMapping(mapping);
  await writeFile(filePath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}

export function validateTrackerMapping({ graph = {}, mapping = createEmptyMapping(), requireComplete = false } = {}) {
  const normalized = normalizeMapping(mapping);
  const items = trackerItemsForGraph(graph);
  const nativeIds = new Set(items.map((item) => item.itemId));
  const externalIds = new Map();
  const issues = [];
  const graphId = graph.graph_id || graph.epicId || graph.graphId || null;

  if (graphId && normalized.graphId && normalized.graphId !== graphId) {
    issues.push({
      code: "graph-id-mismatch",
      itemId: normalized.graphId,
      message: `Tracker mapping graphId ${normalized.graphId} does not match graph ${graphId}.`,
      repair: "run supervibe-loop --tracker-doctor --fix with the target work graph",
    });
  }

  for (const item of items) {
    const record = normalized.items[item.itemId];
    if (!record) {
      issues.push({
        code: "missing-mapping",
        itemId: item.itemId,
        message: `Tracker mapping is missing native item ${item.itemId}.`,
        repair: "rerun tracker sync push to materialize missing mapping records",
      });
      continue;
    }
    if (record.externalId) {
      const list = externalIds.get(record.externalId) || [];
      list.push(item.itemId);
      externalIds.set(record.externalId, list);
    }
  }

  for (const [nativeId, record] of Object.entries(normalized.items || {})) {
    if (!nativeIds.has(nativeId)) {
      issues.push({
        code: "orphan-mapping",
        itemId: nativeId,
        message: `Tracker mapping references native item not present in graph: ${nativeId}.`,
        repair: "run supervibe-loop --tracker-doctor --fix to prune orphan mappings",
      });
    }
    if (!record.nativeId || record.nativeId !== nativeId) {
      issues.push({
        code: "native-id-mismatch",
        itemId: nativeId,
        message: `Tracker mapping key ${nativeId} does not match record nativeId ${record.nativeId || "missing"}.`,
        repair: "rebuild tracker mapping from the canonical work graph",
      });
    }
    if (requireComplete && nativeIds.has(nativeId) && !record.itemHash) {
      issues.push({
        code: "missing-item-hash",
        itemId: nativeId,
        message: `Tracker mapping for ${nativeId} is missing an item hash.`,
        repair: "rerun tracker sync push to refresh item hashes",
      });
    }
  }

  for (const [externalId, nativeIdList] of externalIds.entries()) {
    if (nativeIdList.length > 1) {
      issues.push({
        code: "duplicate-external-task",
        itemId: nativeIdList[0],
        externalId,
        nativeIds: nativeIdList,
        message: `External task ${externalId} is mapped by multiple native items.`,
        repair: "inspect the external tracker and split or remap duplicate task links manually",
      });
    }
  }

  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? "valid" : "invalid",
    issues,
  };
}

export function diagnoseTrackerSyncConflicts({ graph = {}, mapping = createEmptyMapping(), externalState = {} } = {}) {
  const normalized = normalizeMapping(mapping);
  const externalById = new Map((externalState.tasks || [])
    .concat(externalState.epics || [])
    .filter((item) => item.externalId)
    .map((item) => [item.externalId, item]));
  const conflicts = [];

  for (const item of trackerItemsForGraph(graph)) {
    const record = normalized.items[item.itemId];
    if (!record) continue;
    const external = externalById.get(record.externalId);
    const nativeChanged = Boolean(record.itemHash && record.itemHash !== hashWorkItem(item));
    const externalHash = external?.itemHash || external?.hash || external?.sourceHash || null;
    const externalChanged = Boolean(externalHash && record.externalItemHash && externalHash !== record.externalItemHash);
    const nativeUpdatedAt = Date.parse(item.updatedAt || item.updated_at || item.modifiedAt || item.modified_at || 0);
    const externalUpdatedAt = Date.parse(external?.updatedAt || external?.updated_at || external?.modifiedAt || external?.modified_at || 0);
    const mappedAt = Date.parse(record.syncedAt || record.updatedAt || normalized.updatedAt || 0);
    const nativeNewer = Number.isFinite(nativeUpdatedAt) && Number.isFinite(mappedAt) && nativeUpdatedAt > mappedAt;
    const externalNewer = Number.isFinite(externalUpdatedAt) && Number.isFinite(mappedAt) && externalUpdatedAt > mappedAt;
    const nativeDirty = nativeChanged || nativeNewer;
    const externalDirty = externalChanged || externalNewer;

    if (!nativeDirty && !externalDirty) continue;
    conflicts.push({
      itemId: item.itemId,
      externalId: record.externalId || null,
      status: nativeDirty && externalDirty ? "both-changed" : nativeDirty ? "native-newer" : "external-newer",
      nativeChanged: nativeDirty,
      externalChanged: externalDirty,
      recommendation: nativeDirty && externalDirty
        ? "manual review required before sync overwrite"
        : nativeDirty
          ? "push native graph update to tracker"
          : "pull external tracker update into native graph review",
    });
  }

  return {
    ok: conflicts.length === 0,
    status: conflicts.length === 0 ? "clean" : "conflicts-found",
    conflicts,
  };
}

export function createTrackerSyncDiagnostics({
  graph = {},
  mapping = createEmptyMapping(),
  externalState = {},
  requireComplete = false,
  repairCommand = "node scripts/supervibe-loop.mjs --tracker-doctor --fix",
} = {}) {
  const validation = validateTrackerMapping({ graph, mapping, requireComplete });
  const conflicts = diagnoseTrackerSyncConflicts({ graph, mapping, externalState });
  const validationIssues = [...(validation.issues || [])].sort(compareTrackerIssue);
  const conflictItems = [...(conflicts.conflicts || [])].sort(compareTrackerConflict);
  const blockers = [
    ...blockersForTrackerMappingIssues(validationIssues, repairCommand),
    ...blockersForTrackerConflicts(conflictItems, repairCommand),
  ].sort(compareTrackerBlocker);
  const affectedTaskIds = uniqueSorted(blockers.flatMap((blocker) => blocker.affectedTaskIds || []));
  const status = blockers.length === 0 ? "clean" : "blocked";
  const firstBlocker = blockers[0] || null;

  return {
    schemaVersion: 1,
    kind: "tracker-sync-diagnostics",
    ok: blockers.length === 0,
    status,
    blockerCode: firstBlocker?.code || null,
    affectedTaskIds,
    blockers,
    blocker: firstBlocker,
    nextAction: firstBlocker?.nextAction || "tracker sync is clean; continue workflow execution",
    repairCommand: firstBlocker?.repairCommand || null,
    releaseImpact: firstBlocker?.releaseImpact || "Tracker sync has no release-blocking diagnostics.",
    validation,
    conflicts,
  };
}

export function redactTrackerSyncDiagnostics(value) {
  if (Array.isArray(value)) return value.map((item) => redactTrackerSyncDiagnostics(item));
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, nested] of Object.entries(value)) {
      out[key] = isSensitiveTrackerKey(key) ? "[REDACTED]" : redactTrackerSyncDiagnostics(nested);
    }
    return out;
  }
  if (typeof value !== "string") return value;
  return value
    .replace(/\b(?:sk|ghp|github_pat|xox[baprs])-?[A-Za-z0-9_=-]{12,}\b/g, "[REDACTED]")
    .replace(/\b(?:token|secret|password|api[_-]?key)=\S+/gi, (match) => match.replace(/=.*/, "=[REDACTED]"))
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/gi, "Bearer [REDACTED]");
}

export function createTrackerMapping({ graph = {}, adapterId = "native-json", existingMapping = createEmptyMapping() } = {}) {
  const mapping = normalizeMapping(existingMapping);
  const previousGraphId = mapping.graphId || null;
  const nextGraphId = graph.graph_id || graph.epicId || graph.graphId || mapping.graphId || "graph";
  const graphItems = trackerItemsForGraph(graph);
  const nativeIds = new Set(graphItems.map((item) => item.itemId));
  mapping.adapterId = adapterId;
  mapping.graphId = nextGraphId;
  mapping.updatedAt = new Date().toISOString();
  if (previousGraphId && previousGraphId !== nextGraphId) {
    for (const nativeId of Object.keys(mapping.items || {})) {
      if (!nativeIds.has(nativeId)) delete mapping.items[nativeId];
    }
  }
  for (const item of graphItems) {
    const existing = mapping.items[item.itemId];
    const base = {
      ...(existing || {}),
      nativeId: item.itemId,
      externalId: existing?.externalId || null,
      itemHash: hashWorkItem(item),
      type: item.type,
      title: item.title,
      sourcePlanPath: graph.source?.path || graph.planPath || null,
      nativeStatus: item.status || "open",
      status: existing?.externalId ? (existing.status || "mapped") : "unmapped",
    };
    mapping.items[item.itemId] = base;
  }
  return mapping;
}

export async function materializeEpicAndTasks(graph, adapter = createUnavailableTaskTrackerAdapter(), options = {}) {
  const mappingPath = options.mappingPath || defaultTrackerMappingPath(options.rootDir);
  const hasExplicitMapping = Object.prototype.hasOwnProperty.call(options, "mapping");
  const shouldReadMapping = !options.dryRun || options.mappingPath || options.rootDir || hasExplicitMapping;
  const existing = hasExplicitMapping
    ? options.mapping
    : shouldReadMapping
      ? await readTrackerMapping(mappingPath)
      : createEmptyMapping();
  let detection = adapter.detect ? await adapter.detect() : { available: false, status: "unavailable" };
  const adapterId = adapter.id || detection.adapterId || "native-json";
  let mapping = createTrackerMapping({ graph, adapterId, existingMapping: existing });
  const validation = validateTrackerMapping({ graph, mapping, requireComplete: true });
  if (!validation.ok) {
    mapping.status = "invalid-mapping";
    mapping.lastSync = {
      direction: "push",
      status: "invalid-mapping",
      at: new Date().toISOString(),
    };
    return {
      ok: false,
      status: "invalid-mapping",
      nativeGraphPreserved: true,
      mapping,
      detection: redactTrackerSyncDiagnostics(detection),
      issues: validation.issues,
      remediation: ["run supervibe-loop --tracker-doctor --fix", "rerun tracker sync push after mapping repair"],
    };
  }

  if (!detection.available) {
    mapping.status = "native-ready";
    mapping.lastSync = {
      direction: "push",
      status: "native-ready",
      reason: detection.reason || "tracker unavailable",
      at: new Date().toISOString(),
    };
    if (!options.dryRun) await writeTrackerMapping(mappingPath, mapping);
    return {
      ok: true,
      status: "native-ready",
      nativeGraphPreserved: true,
      mapping,
      detection: redactTrackerSyncDiagnostics(detection),
      remediation: ["continue with canonical native JSON graph", "configure tracker adapter only when external sync is required"],
    };
  }

  if (detection.status === "available-uninitialized" && adapter.init) {
    await adapter.init();
    detection = adapter.detect ? await adapter.detect() : { ...detection, status: "available-ready", initialized: true };
  }

  const trackerItems = trackerItemsForGraph(graph);
  const epic = trackerItems.find((item) => item.type === "epic");
  const created = { epic: null, tasks: [], dependencies: [] };
  try {
    if (epic) {
      const mapped = mapping.items[epic.itemId];
      if (!mapped.externalId) {
        const result = await adapter.createEpic(epic);
        mapped.externalId = result.externalId;
        mapped.status = "created";
        mapped.syncedAt = new Date().toISOString();
        created.epic = result;
      }
    }

    for (const item of trackerItems.filter((candidate) => candidate.type !== "epic")) {
      const mapped = mapping.items[item.itemId];
      if (!mapped.externalId) {
        const result = await adapter.createTask({
          ...item,
          parentExternalId: item.parentId ? mapping.items[item.parentId]?.externalId : null,
          sourcePlanPath: graph.source?.path || graph.planPath || null,
          itemHash: mapped.itemHash,
        });
        mapped.externalId = result.externalId;
        mapped.status = "created";
        mapped.syncedAt = new Date().toISOString();
        created.tasks.push(result);
      }
    }

    for (const item of trackerItems) {
      if (item.type === "epic") continue;
      const fromExternalId = mapping.items[item.itemId]?.externalId;
      for (const blocked of item.blocks || []) {
        const toExternalId = mapping.items[blocked]?.externalId;
        if (!fromExternalId || !toExternalId) continue;
        const result = await adapter.addDependency({ fromExternalId, toExternalId, type: "blocks", nativeFromId: item.itemId, nativeToId: blocked });
        created.dependencies.push(result);
      }
      for (const related of item.related || []) {
        const toExternalId = mapping.items[related]?.externalId;
        if (!fromExternalId || !toExternalId) continue;
        const result = await adapter.addDependency({ fromExternalId, toExternalId, type: "related", nativeFromId: item.itemId, nativeToId: related });
        created.dependencies.push(result);
      }
      for (const dependency of item.dependencies || []) {
        const dependencyExternalId = mapping.items[dependency]?.externalId;
        if (!dependencyExternalId || !fromExternalId) continue;
        const result = await adapter.addDependency({
          fromExternalId: dependencyExternalId,
          toExternalId: fromExternalId,
          type: "blocks",
          nativeFromId: dependency,
          nativeToId: item.itemId,
        });
        created.dependencies.push(result);
      }
    }
  } catch (error) {
    mapping.status = "partial-sync";
    mapping.lastSync = {
      direction: "push",
      status: "partial-sync",
      reason: redactTrackerSyncDiagnostics(error.message || String(error)),
      at: new Date().toISOString(),
    };
    if (!options.dryRun) mapping = await writeTrackerMapping(mappingPath, mapping);
    return {
      ok: false,
      status: "partial-sync",
      nativeGraphPreserved: true,
      detection: redactTrackerSyncDiagnostics(detection),
      mapping,
      created: redactTrackerSyncDiagnostics(created),
      recovery: {
        retrySafe: true,
        mappingPath,
        nextAction: "fix external tracker error, then rerun tracker sync push using the same mapping file",
      },
      error: redactTrackerSyncDiagnostics(error.message || String(error)),
    };
  }

  mapping.status = "synced";
  mapping.lastSync = { direction: "push", status: "synced", at: new Date().toISOString() };
  if (!options.dryRun) mapping = await writeTrackerMapping(mappingPath, mapping);
  return { ok: true, status: "synced", nativeGraphPreserved: true, detection: redactTrackerSyncDiagnostics(detection), mapping, created: redactTrackerSyncDiagnostics(created) };
}

export async function syncReadyFront(graph, adapter, mapping, options = {}) {
  const nativeFront = calculateReadyFront(createTaskGraph({ graph_id: graph.graph_id, tasks: graph.tasks || [] }), options);
  if (!adapter?.ready) return { ok: true, mode: "native-only", nativeReady: nativeFront.ready || [], externalReady: [] };
  const external = await adapter.ready({ graph, mapping });
  const externalIds = new Set((external.tasks || []).map((task) => task.externalId));
  const reconciled = (nativeFront.ready || []).filter((task) => {
    const externalId = mapping.items?.[task.id]?.externalId;
    return !externalId || externalIds.has(externalId);
  });
  return {
    ok: true,
    nativeReady: nativeFront.ready || [],
    externalReady: external.tasks || [],
    reconciledReady: reconciled,
    blockedByTracker: (nativeFront.ready || []).filter((task) => {
      const externalId = mapping.items?.[task.id]?.externalId;
      return externalId && !externalIds.has(externalId);
    }),
  };
}

export async function syncClaim({ claims = [], task, adapter, mapping, agentId, attemptId, session = null, approvalLease = null, ttlMinutes = null } = {}) {
  const native = claimTask({ claims, task, agentId, attemptId, approvalLease, ttlMinutes });
  if (!native.ok) return { ok: false, source: "native", ...native };
  const externalId = mapping?.items?.[task.id]?.externalId;
  if (adapter?.claim && externalId) {
    const external = await adapter.claim({
      externalId,
      owner: agentId,
      sessionId: session?.sessionId,
      worktreePath: session?.worktreePath,
    });
    if (!external.ok) {
      return {
        ok: false,
        source: "external",
        reason: external.status || "external_claim_failed",
        claims: releaseClaim(native.claims, native.claim.claimId, "failed"),
        external,
      };
    }
    const claimsWithExternal = attachExternalClaim(native.claims, native.claim.claimId, external.claim);
    return { ok: true, source: "both", native, external, claims: claimsWithExternal, claim: claimsWithExternal.find((claim) => claim.claimId === native.claim.claimId) };
  }
  return { ok: true, source: "native", native, external: null, claims: native.claims, claim: native.claim };
}

export async function syncClose({ task, adapter, mapping, evidence = [], reason = "completed" } = {}) {
  const externalId = mapping?.items?.[task.id]?.externalId;
  if (!externalId || !adapter?.close) {
    return { ok: true, source: "native", reason: "no external mapping" };
  }
  if (evidence.length === 0) {
    return { ok: false, source: "external", status: "verification_evidence_required" };
  }
  return adapter.close({ externalId, evidence, reason });
}

export async function syncPush(graph, adapter, options = {}) {
  const result = await materializeEpicAndTasks(graph, adapter, options);
  if (adapter?.syncPush && result.status === "synced") await adapter.syncPush({ items: graph.items, mapping: result.mapping });
  return result;
}

export async function syncPull(adapter, mapping = createEmptyMapping()) {
  if (!adapter?.syncPull) return { ok: true, status: "native-only", mapping, external: null };
  const external = redactTrackerSyncDiagnostics(await adapter.syncPull({ mapping }));
  return { ok: true, status: "pulled", mapping, external };
}

export function summarizeTrackerMappingForBundle(mapping = createEmptyMapping()) {
  const items = Object.values(mapping.items || {});
  return {
    schemaVersion: mapping.schemaVersion || 1,
    adapterId: mapping.adapterId || "native-json",
    graphId: mapping.graphId || null,
    status: mapping.status || "unknown",
    mapped: items.filter((item) => item.externalId).length,
    unmapped: items.filter((item) => !item.externalId).length,
    stale: items.filter((item) => item.status === "stale" || item.externalStatus === "stale").length,
    lastSync: mapping.lastSync || null,
  };
}

function blockersForTrackerMappingIssues(issues = [], repairCommand) {
  const groups = new Map();
  for (const issue of issues) {
    const code = blockerCodeForTrackerIssue(issue.code);
    const key = `${code}:${issue.code}`;
    const current = groups.get(key) || {
      issueCode: issue.code,
      blockerCode: code,
      affectedTaskIds: [],
      externalIds: [],
    };
    current.affectedTaskIds.push(...affectedTaskIdsForTrackerIssue(issue));
    if (issue.externalId) current.externalIds.push(issue.externalId);
    groups.set(key, current);
  }
  return [...groups.values()].map((group) => enrichTrackerBlocker(createBlockerV1({
    code: group.blockerCode,
    message: trackerMappingBlockerMessage(group),
    repairCommand,
    releaseImpact: "Release workflow readiness is blocked until the tracker mapping is deterministic and matches the active graph.",
  }), {
    affectedTaskIds: uniqueSorted(group.affectedTaskIds),
    nextAction: nextActionForTrackerIssue(group.issueCode),
  }));
}

function blockersForTrackerConflicts(conflicts = [], repairCommand) {
  const groups = new Map();
  for (const conflict of conflicts) {
    const key = conflict.status || "conflict";
    const current = groups.get(key) || { status: key, affectedTaskIds: [], externalIds: [] };
    current.affectedTaskIds.push(conflict.itemId);
    if (conflict.externalId) current.externalIds.push(conflict.externalId);
    groups.set(key, current);
  }
  return [...groups.values()].map((group) => enrichTrackerBlocker(createBlockerV1({
    code: "needs-human-input",
    message: `Tracker sync has ${group.affectedTaskIds.length} ${group.status} conflict(s).`,
    repairCommand,
    releaseImpact: "Release workflow readiness is blocked until native and external tracker changes are reconciled.",
  }), {
    affectedTaskIds: uniqueSorted(group.affectedTaskIds),
    nextAction: nextActionForTrackerConflict(group.status),
  }));
}

function enrichTrackerBlocker(blocker, { affectedTaskIds = [], nextAction }) {
  return {
    ...blocker,
    affectedTaskIds: uniqueSorted(affectedTaskIds),
    nextAction,
  };
}

function blockerCodeForTrackerIssue(code) {
  if (code === "duplicate-external-task") return "write-set-conflict";
  if (code === "missing-mapping" || code === "missing-item-hash") return "receipt-missing";
  return "policy-hard-stop";
}

function affectedTaskIdsForTrackerIssue(issue = {}) {
  return uniqueSorted([...(issue.nativeIds || []), issue.itemId].filter(Boolean));
}

function trackerMappingBlockerMessage(group) {
  const affected = uniqueSorted(group.affectedTaskIds);
  return `Tracker mapping issue ${group.issueCode} affects ${affected.length} task(s).`;
}

function nextActionForTrackerIssue(code) {
  if (code === "missing-mapping") return "rerun tracker sync push to materialize missing mapping records";
  if (code === "orphan-mapping") return "run tracker doctor repair to prune orphan mappings";
  if (code === "native-id-mismatch") return "rebuild tracker mapping from the canonical work graph";
  if (code === "missing-item-hash") return "rerun tracker sync push to refresh item hashes";
  if (code === "duplicate-external-task") return "inspect duplicate external tracker links and remap one native task";
  if (code === "graph-id-mismatch") return "repair tracker mapping graph id before sync";
  return "repair tracker mapping before sync";
}

function nextActionForTrackerConflict(status) {
  if (status === "both-changed") return "manually reconcile native and external tracker changes before overwrite";
  if (status === "native-newer") return "push native graph update to the external tracker";
  if (status === "external-newer") return "pull external tracker update into native graph review";
  return "inspect tracker sync conflict before continuing";
}

function compareTrackerIssue(left, right) {
  return String(left.code || "").localeCompare(String(right.code || ""))
    || String(left.itemId || "").localeCompare(String(right.itemId || ""))
    || String(left.externalId || "").localeCompare(String(right.externalId || ""));
}

function compareTrackerConflict(left, right) {
  return String(left.status || "").localeCompare(String(right.status || ""))
    || String(left.itemId || "").localeCompare(String(right.itemId || ""))
    || String(left.externalId || "").localeCompare(String(right.externalId || ""));
}

function compareTrackerBlocker(left, right) {
  return right.priority - left.priority
    || String(left.code || "").localeCompare(String(right.code || ""))
    || String(left.nextAction || "").localeCompare(String(right.nextAction || ""));
}

function uniqueSorted(values = []) {
  return [...new Set(values.filter(Boolean).map((value) => String(value)))].sort();
}

function createEmptyMapping() {
  return {
    schemaVersion: 1,
    adapterId: "native-json",
    graphId: null,
    status: "new",
    updatedAt: new Date().toISOString(),
    items: {},
    lastSync: null,
  };
}

function normalizeMapping(mapping = {}) {
  return {
    schemaVersion: mapping.schemaVersion || 1,
    adapterId: mapping.adapterId || "native-json",
    graphId: mapping.graphId || null,
    status: mapping.status || "new",
    updatedAt: mapping.updatedAt || new Date().toISOString(),
    items: { ...(mapping.items || {}) },
    lastSync: mapping.lastSync || null,
  };
}

function hashWorkItem(item) {
  return createHash("sha1").update(JSON.stringify({
    itemId: item.itemId,
    title: item.title,
    type: item.type,
    status: item.status || "open",
    acceptanceCriteria: item.acceptanceCriteria || [],
    verificationCommands: item.verificationCommands || [],
    writeScope: item.writeScope || [],
  })).digest("hex");
}

function isSensitiveTrackerKey(key = "") {
  return /token|secret|password|authorization|api[_-]?key|access[_-]?key/i.test(key);
}

function trackerItemsForGraph(graph = {}) {
  if (Array.isArray(graph.items) && graph.items.length > 0) {
    return graph.items.map((item, index) => ({
      ...item,
      itemId: item.itemId || item.id || `item-${index + 1}`,
      title: item.title || item.goal || item.summary || item.itemId || item.id || `Item ${index + 1}`,
      type: item.type || "task",
      dependencies: item.dependencies || item.blockedBy || [],
      blocks: item.blocks || [],
      related: item.related || [],
    }));
  }
  return (graph.tasks || []).map((task, index) => ({
    itemId: task.itemId || task.id,
    type: task.type || "task",
    title: task.title || task.goal || task.id,
    status: task.status || "open",
    parentId: task.parentId || graph.epicId || null,
    dependencies: task.dependencies || [],
    blocks: task.blocks || [],
    related: task.related || [],
    acceptanceCriteria: task.acceptanceCriteria || [],
    verificationCommands: task.verificationCommands || [],
    writeScope: task.writeScope || task.files || [],
    sourceOrder: task.sourceOrder ?? index,
  }));
}
