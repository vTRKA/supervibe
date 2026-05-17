import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import {
  readWorkflowReceipts,
  validateWorkflowReceiptTrust,
} from "./supervibe-workflow-receipt-runtime.mjs";
import {
  validateWorkflowReceiptEvidenceSnapshot,
} from "./supervibe-receipt-snapshot-store.mjs";
import { normalizeRelPath, namespaceForCleanupPath } from "./supervibe-cleanup-policy.mjs";

export const CLEANUP_LIFECYCLE_CLASSES = Object.freeze([
  "hot",
  "warm",
  "cold",
  "trash",
  "protected",
  "compactable",
  "archivable",
  "deletable",
  "blocked",
  "unclassified",
]);

const COMPACT_MANIFEST_TYPE = "supervibe-agent-output-compact-manifest";

export function buildCleanupReachability({ rootDir = process.cwd(), now = new Date().toISOString() } = {}) {
  const roots = collectCleanupRoots({ rootDir, now });
  const inventory = collectCleanupInventory(rootDir, now);
  const classifications = inventory.map((item) => classifyCleanupPath({ ...item, roots, rootDir, now }));
  const byPath = new Map(classifications.map((item) => [item.relPath, item]));
  return {
    schemaVersion: 1,
    generatedAt: now,
    roots: serializeRoots(roots),
    inventory: classifications,
    byPath,
    summary: summarizeClassifications(classifications),
  };
}

export function collectCleanupRoots({ rootDir = process.cwd(), now = new Date().toISOString() } = {}) {
  const activeRoots = new Map();
  const protectedRoots = new Map();
  const receiptLinked = new Map();
  const compactManifests = new Map();
  const compactArchiveBlobs = new Map();
  addIfExists(activeRoots, rootDir, ".supervibe/memory/active-workflow.json", "active-workflow-state");
  addIfExists(activeRoots, rootDir, ".supervibe/memory/active-plan.json", "active-plan-pointer");
  addIfExists(protectedRoots, rootDir, ".supervibe/memory/workflow-invocation-ledger.jsonl", "workflow-receipt-ledger");
  addIfExists(protectedRoots, rootDir, ".supervibe/memory/workflow-receipt-index.json", "workflow-receipt-index");
  addIfExists(protectedRoots, rootDir, ".supervibe/memory/agent-invocations.jsonl", "agent-invocation-ledger");
  addIfExists(protectedRoots, rootDir, ".supervibe/memory/workflow-receipt-runtime.key", "receipt-runtime-key");

  for (const graph of listFiles(rootDir, ".supervibe/memory/work-items")) {
    if (!graph.relPath.endsWith("/graph.json")) continue;
    if (graph.relPath.includes("/.archive/")) continue;
    const parsedGraph = readJson(join(rootDir, ...normalizeRelPath(graph.relPath).split("/")));
    if (isTerminalWorkGraph(parsedGraph)) continue;
    setReason(activeRoots, normalizeRelPath(graph.relPath), "active-work-graph");
  }

  for (const item of listFiles(rootDir, ".supervibe/artifacts/_workflow-invocations")) {
    if (item.relPath.endsWith("artifact-links.json")) {
      for (const linked of readArtifactLinks(rootDir, item.relPath)) {
        if (!isArchivePath(linked)) setReason(receiptLinked, linked, "artifact-link");
      }
    }
  }

  for (const receipt of readTrustedReceipts(rootDir)) {
    const receiptPath = normalizeRelPath(receipt.__file || "");
    const snapshot = validateWorkflowReceiptEvidenceSnapshot(rootDir, receipt);
    const liveRequired = snapshot.legacy === true || snapshot.pass !== true;
    if (receiptPath) setReason(protectedRoots, receiptPath, "trusted-workflow-receipt");
    for (const output of receipt.outputArtifacts || []) {
      const normalized = normalizeRelPath(output);
      if (isArchivePath(normalized) && !liveRequired) continue;
      setReason(receiptLinked, normalized, "trusted-receipt-output");
      setReason(protectedRoots, normalized, "trusted-receipt-output");
    }
  }

  for (const manifest of collectCompactManifests(rootDir, now)) {
    setReason(compactManifests, manifest.manifestPath, "compact-manifest");
    setReason(protectedRoots, manifest.manifestPath, "compact-manifest");
    if (manifest.archivePath) {
      setReason(compactArchiveBlobs, manifest.archivePath, "live-compact-archive-blob");
      setReason(protectedRoots, manifest.archivePath, "live-compact-archive-blob");
    }
  }

  return { activeRoots, protectedRoots, receiptLinked, compactManifests, compactArchiveBlobs };
}

export function classifyCleanupPath({
  relPath,
  ageDays = 0,
  roots = collectCleanupRoots(),
  rootDir = process.cwd(),
  reason = "",
} = {}) {
  const normalized = normalizeRelPath(relPath);
  const namespace = namespaceForCleanupPath(normalized);
  const activeReason = findReason(roots.activeRoots, normalized);
  const protectedReason = findReason(roots.protectedRoots, normalized);
  const receiptReason = findReason(roots.receiptLinked, normalized);
  const compactReason = findReason(roots.compactManifests, normalized);
  const compactBlobReason = findReason(roots.compactArchiveBlobs, normalized);
  if (protectedReason || receiptReason || compactBlobReason) {
    return classification(normalized, "protected", namespace, protectedReason || receiptReason || compactBlobReason, ageDays, { protectedByReceipt: Boolean(receiptReason), protectedProvenance: true });
  }
  if (activeReason) return classification(normalized, "hot", namespace, activeReason, ageDays);
  if (compactReason) return classification(normalized, "compactable", namespace, compactReason, ageDays);
  if (namespace === "archives") return classification(normalized, "cold", namespace, reason || "archive", ageDays);
  if (namespace === "workflow-invocations") {
    const lifecycleClass = ageDays >= 90 ? "archivable" : ageDays > 0 ? "warm" : "hot";
    return classification(normalized, lifecycleClass, namespace, reason || "workflow-invocation-retention", ageDays);
  }
  if (namespace === "logs" || /\.bak$/i.test(normalized)) return classification(normalized, "trash", namespace, reason || "generated-runtime-noise", ageDays);
  if (namespace === "runtime") return classification(normalized, "deletable", namespace, reason || "runtime-temp", ageDays);
  if (namespace === "graphs" && normalized.endsWith("/graph.json") && isTerminalWorkGraphPath(rootDir, normalized)) {
    return classification(normalized, "archivable", namespace, reason || "completed-work-graph", ageDays);
  }
  if (["plans", "graphs", "work-items", "snapshots", "artifacts"].includes(namespace)) {
    return classification(normalized, ageDays > 0 ? "warm" : "hot", namespace, reason || namespace, ageDays);
  }
  return classification(normalized, "unclassified", namespace, reason || "no-reachability-rule", ageDays);
}

export function collectCleanupInventory(rootDir = process.cwd(), now = new Date().toISOString()) {
  return listFiles(rootDir, ".supervibe", { includeArchive: true }).map((item) => ({
    relPath: normalizeRelPath(item.relPath),
    ageDays: ageInDays(item.stat.mtime.toISOString(), now),
    bytes: Number(item.stat.size || 0),
  })).sort((left, right) => left.relPath.localeCompare(right.relPath));
}

export function summarizeClassifications(items = []) {
  const summary = Object.fromEntries(CLEANUP_LIFECYCLE_CLASSES.map((item) => [item, 0]));
  for (const item of items) summary[item.lifecycleClass] = (summary[item.lifecycleClass] || 0) + 1;
  return summary;
}

export function collectCompactManifests(rootDir = process.cwd(), now = new Date().toISOString()) {
  return listFiles(rootDir, ".supervibe/artifacts/_agent-outputs")
    .filter((item) => item.relPath.endsWith("/agent-output.json"))
    .flatMap((item) => {
      const parsed = readJson(join(rootDir, ...normalizeRelPath(item.relPath).split("/")));
      if (parsed?.type !== COMPACT_MANIFEST_TYPE) return [];
      return [{
        manifestPath: normalizeRelPath(item.relPath),
        archivePath: normalizeRelPath(parsed.archivePath || ""),
        originalPath: normalizeRelPath(parsed.originalPath || ""),
        archiveSha256: parsed.archiveSha256 || null,
        ageDays: ageInDays(item.stat.mtime.toISOString(), now),
      }];
    });
}

function isTerminalWorkGraphPath(rootDir, relPath) {
  return isTerminalWorkGraph(readJson(join(rootDir, ...normalizeRelPath(relPath).split("/"))));
}

function isTerminalWorkGraph(graph) {
  if (!graph || typeof graph !== "object") return false;
  const items = Array.isArray(graph.items) ? graph.items : [];
  const tasks = Array.isArray(graph.tasks) ? graph.tasks : [];
  const children = items.filter((item) => String(item.type || "task") !== "epic");
  const candidates = children.length ? children : tasks;
  if (candidates.length === 0) return false;
  return candidates.every((item) => isTerminalStatus(item.status || item.effectiveStatus || item.task?.status));
}

function isTerminalStatus(status) {
  return ["done", "complete", "completed", "closed", "verified", "skipped", "skip", "cancelled", "canceled"].includes(String(status || "").trim().toLowerCase());
}
function readTrustedReceipts(rootDir) {
  return readWorkflowReceipts(rootDir).filter((receipt) => validateWorkflowReceiptTrust(rootDir, receipt).pass === true);
}

function readArtifactLinks(rootDir, relPath) {
  const parsed = readJson(join(rootDir, ...normalizeRelPath(relPath).split("/")));
  const values = [];
  for (const value of Object.values(parsed || {})) {
    if (typeof value === "string") values.push(normalizeRelPath(value));
    else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string") values.push(normalizeRelPath(item));
        else if (item?.path) values.push(normalizeRelPath(item.path));
      }
    } else if (value?.path) values.push(normalizeRelPath(value.path));
  }
  return values.filter(Boolean);
}

function serializeRoots(roots) {
  return Object.fromEntries(Object.entries(roots).map(([name, map]) => [name, [...map.entries()].map(([relPath, reasons]) => ({ relPath, reasons: [...reasons] }))]));
}

function addIfExists(map, rootDir, relPath, reason) {
  const normalized = normalizeRelPath(relPath);
  if (existsSync(join(rootDir, ...normalized.split("/")))) setReason(map, normalized, reason);
}

function setReason(map, relPath, reason) {
  const normalized = normalizeRelPath(relPath);
  if (!normalized) return;
  if (!map.has(normalized)) map.set(normalized, new Set());
  map.get(normalized).add(reason);
}

function isArchivePath(relPath) {
  return normalizeRelPath(relPath).startsWith(".supervibe/.archive/");
}

function findReason(map, relPath) {
  const normalized = normalizeRelPath(relPath);
  for (const [candidate, reasons] of map.entries()) {
    if (normalized === candidate || normalized.startsWith(`${candidate}/`) || candidate.startsWith(`${normalized}/`)) {
      return [...reasons].join(",");
    }
  }
  return null;
}

function classification(relPath, lifecycleClass, namespace, reason, ageDays, extra = {}) {
  return { relPath, lifecycleClass, namespace, reason, ageDays, ...extra };
}

function listFiles(rootDir, relDir, { includeArchive = false } = {}) {
  const start = join(rootDir, ...normalizeRelPath(relDir).split("/"));
  const out = [];
  if (!existsSync(start)) return out;
  walk(start, out, rootDir, includeArchive);
  return out;
}

function walk(dir, out, rootDir, includeArchive) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    const relPath = normalizeRelPath(relative(rootDir, full).split(sep).join("/"));
    if (!includeArchive && relPath.includes("/.archive/")) continue;
    if (entry.isDirectory()) walk(full, out, rootDir, includeArchive);
    else if (entry.isFile()) out.push({ relPath, stat: statSync(full) });
  }
}

function readJson(path) {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function ageInDays(date, now) {
  const start = Date.parse(date || "");
  const end = Date.parse(now || "");
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}
