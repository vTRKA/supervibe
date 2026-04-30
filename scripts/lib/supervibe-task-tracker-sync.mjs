import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { calculateReadyFront } from "./autonomous-loop-ready-front.mjs";
import { createTaskGraph } from "./autonomous-loop-task-graph.mjs";
import { attachExternalClaim, claimTask, releaseClaim } from "./autonomous-loop-claims.mjs";
import { createUnavailableTaskTrackerAdapter } from "./supervibe-durable-task-tracker-adapter.mjs";

export function defaultTrackerMappingPath(rootDir = process.cwd()) {
  return join(rootDir, ".claude", "memory", "loops", "task-tracker-map.json");
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

export function createTrackerMapping({ graph = {}, adapterId = "native-json", existingMapping = createEmptyMapping() } = {}) {
  const mapping = normalizeMapping(existingMapping);
  mapping.adapterId = adapterId;
  mapping.graphId = graph.graph_id || graph.epicId || mapping.graphId || "graph";
  mapping.updatedAt = new Date().toISOString();
  for (const item of graph.items || []) {
    const existing = mapping.items[item.itemId];
    mapping.items[item.itemId] = existing || {
      nativeId: item.itemId,
      externalId: null,
      itemHash: hashWorkItem(item),
      type: item.type,
      title: item.title,
      sourcePlanPath: graph.source?.path || graph.planPath || null,
      status: "unmapped",
    };
  }
  return mapping;
}

export async function materializeEpicAndTasks(graph, adapter = createUnavailableTaskTrackerAdapter(), options = {}) {
  const mappingPath = options.mappingPath || defaultTrackerMappingPath(options.rootDir);
  const existing = options.mapping || await readTrackerMapping(mappingPath);
  let detection = adapter.detect ? await adapter.detect() : { available: false, status: "unavailable" };
  const adapterId = adapter.id || detection.adapterId || "native-json";
  let mapping = createTrackerMapping({ graph, adapterId, existingMapping: existing });

  if (!detection.available) {
    mapping.status = "native-fallback";
    mapping.lastSync = {
      direction: "push",
      status: "native-fallback",
      reason: detection.reason || "tracker unavailable",
      at: new Date().toISOString(),
    };
    if (!options.dryRun) await writeTrackerMapping(mappingPath, mapping);
    return {
      ok: true,
      status: "native-fallback",
      nativeGraphPreserved: true,
      mapping,
      detection,
      remediation: ["continue with native JSON graph", "configure tracker adapter before external sync"],
    };
  }

  if (detection.status === "available-uninitialized" && adapter.init) {
    await adapter.init();
    detection = adapter.detect ? await adapter.detect() : { ...detection, status: "available-ready", initialized: true };
  }

  const epic = (graph.items || []).find((item) => item.type === "epic");
  const created = { epic: null, tasks: [], dependencies: [] };
  if (epic) {
    const mapped = mapping.items[epic.itemId];
    if (!mapped.externalId) {
      const result = await adapter.createEpic(epic);
      mapped.externalId = result.externalId;
      mapped.status = "created";
      created.epic = result;
    }
  }

  for (const item of (graph.items || []).filter((candidate) => candidate.type !== "epic")) {
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
      created.tasks.push(result);
    }
  }

  for (const item of graph.items || []) {
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
  }

  mapping.status = "synced";
  mapping.lastSync = { direction: "push", status: "synced", at: new Date().toISOString() };
  if (!options.dryRun) mapping = await writeTrackerMapping(mappingPath, mapping);
  return { ok: true, status: "synced", nativeGraphPreserved: true, detection, mapping, created };
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

export async function syncClaim({ claims = [], task, adapter, mapping, agentId, attemptId, session = null, approvalLease = null } = {}) {
  const native = claimTask({ claims, task, agentId, attemptId, approvalLease });
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
  const external = await adapter.syncPull({ mapping });
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
    acceptanceCriteria: item.acceptanceCriteria || [],
    verificationCommands: item.verificationCommands || [],
    writeScope: item.writeScope || [],
  })).digest("hex");
}
