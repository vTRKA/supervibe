#!/usr/bin/env node
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveActiveWorkItemGraph } from "./lib/supervibe-work-item-registry.mjs";

export const ARTIFACT_SNAPSHOT_ROOT = ".supervibe/memory/artifact-snapshots";
export const ARTIFACT_SNAPSHOT_LATEST = `${ARTIFACT_SNAPSHOT_ROOT}/latest.json`;
export const ARTIFACT_SNAPSHOT_CONFIRM = "restore-artifact-snapshot";
export const ARTIFACT_SNAPSHOT_RETENTION_LOG = ".supervibe/memory/artifact-snapshot-retention-log.jsonl";
export const DEFAULT_ARTIFACT_SNAPSHOT_RETENTION = Object.freeze({
  keepLast: 1,
  maxBytes: 50 * 1024 * 1024,
  maxAgeDays: 30,
});

const SECRET_FILE_PATTERNS = Object.freeze([
  /(^|\/)\.env(?:\.|$)/i,
  /\.key$/i,
  /\.pem$/i,
  /\.p12$/i,
  /(^|\/)id_rsa$/i,
  /(^|\/)id_ed25519$/i,
]);

const LOCK_HEARTBEAT_PATTERNS = Object.freeze([
  /\.lock$/i,
  /heartbeat/i,
  /daemon.*\.json$/i,
  /watch.*\.json$/i,
]);

export async function collectArtifactSnapshotInventory({ rootDir = process.cwd(), includeRebuildableCaches = false } = {}) {
  const root = resolve(rootDir);
  const candidates = [];
  const add = (kind, relPath) => addCandidate(candidates, root, kind, relPath);

  add("active-workflow", ".supervibe/memory/active-workflow.json");
  add("receipt-ledger", ".supervibe/memory/workflow-invocation-ledger.jsonl");
  add("evidence-ledger", ".supervibe/memory/evidence-ledger.jsonl");
  if (includeRebuildableCaches) {
    add("memory-index", ".supervibe/memory/memory.db");
    add("code-index", ".supervibe/memory/code.db");
  }
  add("code-index-metadata", ".supervibe/memory/code-index-checkpoint.json");

  const active = await resolveActiveWorkItemGraph({ rootDir: root }).catch(() => null);
  if (active?.graphPath) add("active-work-graph", normalizeRel(root, active.graphPath));
  for (const graphFile of await findFiles(join(root, ".supervibe", "memory", "work-items"), (relPath) => /(^|\/)graph\.json$/i.test(relPath))) {
    add("work-graph", normalizeRel(root, graphFile));
  }
  for (const stateFile of await findFiles(join(root, ".supervibe", "memory", "loops"), (relPath) => /(^|\/)state\.json$/i.test(relPath))) {
    add("loop-state", normalizeRel(root, stateFile));
  }
  for (const runtimeFile of await findFiles(join(root, ".supervibe", "memory"), (relPath) => {
    if (relPath.startsWith(`${ARTIFACT_SNAPSHOT_ROOT}/`)) return false;
    return LOCK_HEARTBEAT_PATTERNS.some((pattern) => pattern.test(relPath));
  })) {
    add("lock-or-heartbeat", normalizeRel(root, runtimeFile));
  }

  const unique = new Map();
  for (const item of candidates) {
    if (!item.exists) continue;
    unique.set(`${item.kind}:${item.path}`, item);
  }
  return [...unique.values()];
}

export async function createArtifactSnapshot({
  rootDir = process.cwd(),
  reason = "pre-mutation snapshot",
  snapshotId = null,
  snapshotRoot = ARTIFACT_SNAPSHOT_ROOT,
  includeRebuildableCaches = false,
} = {}) {
  const root = resolve(rootDir);
  const safeSnapshotRoot = resolveSnapshotRoot(root, snapshotRoot);
  const id = sanitizeSnapshotId(snapshotId || new Date().toISOString());
  const snapshotDir = join(safeSnapshotRoot, id);
  const filesDir = join(snapshotDir, "files");
  const inventory = await collectArtifactSnapshotInventory({ rootDir: root, includeRebuildableCaches });
  const entries = [];
  await mkdir(filesDir, { recursive: true });

  for (const item of inventory) {
    if (isSecretPath(item.path)) continue;
    const source = resolveSafe(root, item.path);
    const destination = join(filesDir, ...item.path.split("/"));
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(source, destination);
    const sourceStat = await stat(source);
    entries.push({
      kind: item.kind,
      path: item.path,
      snapshotPath: normalizeRel(root, destination),
      exists: true,
      bytes: sourceStat.size,
      sha256: await sha256File(source),
    });
  }

  const manifest = {
    schemaVersion: 1,
    snapshotId: id,
    createdAt: new Date().toISOString(),
    reason,
    rootDir: ".",
    entries,
    excludedRebuildableCaches: includeRebuildableCaches ? [] : [".supervibe/memory/memory.db", ".supervibe/memory/code.db"],
    rebuildCommands: [
      "node scripts/build-code-index.mjs --root . --force --health --no-embeddings",
      "npm run supervibe:status -- --index-health",
    ],
    restoreCommand: `node scripts/supervibe-artifact-snapshot.mjs --restore ${id} --confirm ${ARTIFACT_SNAPSHOT_CONFIRM}`,
  };
  const manifestPath = join(snapshotDir, "snapshot.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(join(safeSnapshotRoot, "latest.json"), `${JSON.stringify({
    schemaVersion: 1,
    snapshotId: id,
    snapshotPath: normalizeRel(root, manifestPath),
    createdAt: manifest.createdAt,
  }, null, 2)}\n`, "utf8");
  return { manifest, manifestPath: normalizeRel(root, manifestPath) };
}

export async function readLatestArtifactSnapshot({ rootDir = process.cwd(), snapshotRoot = ARTIFACT_SNAPSHOT_ROOT } = {}) {
  const root = resolve(rootDir);
  const safeSnapshotRoot = resolveSnapshotRoot(root, snapshotRoot);
  const latestPath = join(safeSnapshotRoot, "latest.json");
  if (!existsSync(latestPath)) return null;
  const latest = JSON.parse(await readFile(latestPath, "utf8"));
  const manifestPath = resolveSafe(root, latest.snapshotPath);
  if (!existsSync(manifestPath)) return { ...latest, missingManifest: true };
  return JSON.parse(await readFile(manifestPath, "utf8"));
}

export async function buildArtifactSnapshotStatus({ rootDir = process.cwd() } = {}) {
  const latest = await readLatestArtifactSnapshot({ rootDir });
  const inventory = await collectArtifactSnapshotInventory({ rootDir });
  const retention = await scanArtifactSnapshotRetention({ rootDir });
  const presentKinds = new Set((latest?.entries || []).map((entry) => entry.kind));
  const requiredKinds = ["active-workflow", "receipt-ledger"];
  const missingKinds = requiredKinds.filter((kind) => !presentKinds.has(kind));
  if (!presentKinds.has("active-work-graph") && !presentKinds.has("work-graph")) missingKinds.push("work-graph");
  const mutationBlocked = !latest || missingKinds.includes("work-graph") || missingKinds.includes("receipt-ledger");
  return {
    status: latest ? "snapshot-present" : "missing-snapshot",
    latest,
    inventoryCount: inventory.length,
    missingKinds,
    mutationBlocked,
    createCommand: "node scripts/supervibe-artifact-snapshot.mjs --create --reason \"before mutating workflow artifacts\"",
    restoreCommand: latest?.restoreCommand || null,
    retention,
  };
}

export function formatArtifactSnapshotStatus(status = {}) {
  const lines = ["SUPERVIBE_ARTIFACT_SNAPSHOT_STATUS"];
  lines.push(`  STATUS: ${status.status || "unknown"}`);
  lines.push(`  MUTATION_BLOCKED_BY_MISSING_SNAPSHOT: ${status.mutationBlocked === true}`);
  lines.push(`  INVENTORY_FILES: ${status.inventoryCount ?? 0}`);
  if (status.latest) {
    lines.push(`  LATEST_SNAPSHOT: ${status.latest.snapshotId}`);
    lines.push(`  CREATED_AT: ${status.latest.createdAt}`);
    lines.push(`  ENTRIES: ${(status.latest.entries || []).length}`);
    lines.push(`  RESTORE_COMMAND: ${status.latest.restoreCommand}`);
  } else {
    lines.push("  LATEST_SNAPSHOT: none");
  }
  if (status.missingKinds?.length) lines.push(`  MISSING_KINDS: ${status.missingKinds.join(",")}`);
  if (status.retention) {
    lines.push("  RETENTION_BYTES: " + (status.retention.summary?.bytes || 0) + "/" + (status.retention.policy?.maxBytes || 0));
    lines.push("  RETENTION_CANDIDATES: " + (status.retention.summary?.candidates || 0));
    lines.push("  RETENTION_PROJECTED_BYTES: " + (status.retention.summary?.projectedBytesAfterCleanup || 0));
  }
  lines.push(`  CREATE_COMMAND: ${status.createCommand}`);
  return lines.join("\n");
}

export async function scanArtifactSnapshotRetention({
  rootDir = process.cwd(),
  now = new Date().toISOString(),
  snapshotRoot = ARTIFACT_SNAPSHOT_ROOT,
  keepLast = DEFAULT_ARTIFACT_SNAPSHOT_RETENTION.keepLast,
  maxBytes = DEFAULT_ARTIFACT_SNAPSHOT_RETENTION.maxBytes,
  maxAgeDays = DEFAULT_ARTIFACT_SNAPSHOT_RETENTION.maxAgeDays,
} = {}) {
  const root = resolve(rootDir);
  const safeSnapshotRoot = resolveSnapshotRoot(root, snapshotRoot);
  const policy = {
    keepLast: Math.max(0, Number(keepLast || 0)),
    maxBytes: Math.max(0, Number(maxBytes || 0)),
    maxAgeDays: Math.max(0, Number(maxAgeDays || 0)),
  };
  const latestPointer = await readLatestSnapshotPointer({ root, safeSnapshotRoot });
  const entries = await listSnapshotRetentionEntries({ root, safeSnapshotRoot, now });
  const newest = [...entries].sort(compareSnapshotNewestFirst);
  const protectedIds = new Set();
  if (latestPointer?.snapshotId && entries.some((entry) => entry.snapshotId === latestPointer.snapshotId)) {
    protectedIds.add(latestPointer.snapshotId);
  }
  for (const entry of newest) {
    if (protectedIds.size >= policy.keepLast) break;
    protectedIds.add(entry.snapshotId);
  }
  if (protectedIds.size === 0 && newest[0]) protectedIds.add(newest[0].snapshotId);

  const candidateMap = new Map();
  const addCandidate = (entry, reason) => {
    if (protectedIds.has(entry.snapshotId)) return;
    const existing = candidateMap.get(entry.snapshotId) || { ...entry, reasons: [] };
    if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
    candidateMap.set(entry.snapshotId, existing);
  };

  if (entries.length > protectedIds.size) {
    for (const entry of entries) addCandidate(entry, "snapshot-count-cap");
  }
  if (policy.maxAgeDays > 0) {
    for (const entry of entries) {
      if (entry.ageDays >= policy.maxAgeDays) addCandidate(entry, "snapshot-age-retention");
    }
  }
  const totalBytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
  if (policy.maxBytes > 0 && totalBytes > policy.maxBytes) {
    let projected = totalBytes - [...candidateMap.values()].reduce((sum, entry) => sum + entry.bytes, 0);
    const oldest = [...entries].sort(compareSnapshotOldestFirst);
    for (const entry of oldest) {
      if (projected <= policy.maxBytes) break;
      if (protectedIds.has(entry.snapshotId)) continue;
      if (!candidateMap.has(entry.snapshotId)) projected -= entry.bytes;
      addCandidate(entry, "snapshot-size-cap");
    }
  }

  const candidates = [...candidateMap.values()]
    .map((entry) => ({
      ...entry,
      reason: entry.reasons[0] || "snapshot-retention",
    }))
    .sort(compareSnapshotOldestFirst);
  const candidateBytes = candidates.reduce((sum, entry) => sum + entry.bytes, 0);
  return {
    schemaVersion: 1,
    snapshotRoot: normalizeRel(root, safeSnapshotRoot),
    generatedAt: now,
    latestSnapshotId: latestPointer?.snapshotId || null,
    policy,
    entries,
    protectedSnapshots: entries.filter((entry) => protectedIds.has(entry.snapshotId)),
    candidates,
    summary: {
      snapshots: entries.length,
      bytes: totalBytes,
      protected: protectedIds.size,
      candidates: candidates.length,
      candidateBytes,
      projectedBytesAfterCleanup: Math.max(0, totalBytes - candidateBytes),
      overBudget: policy.maxBytes > 0 && totalBytes > policy.maxBytes,
    },
  };
}

export async function applyArtifactSnapshotRetention(scan, {
  rootDir = process.cwd(),
  dryRun = true,
  now = scan?.generatedAt || new Date().toISOString(),
} = {}) {
  const root = resolve(rootDir);
  const removed = [];
  const errors = [];
  for (const candidate of scan?.candidates || []) {
    const absPath = resolveSafe(root, candidate.relPath);
    if (dryRun) {
      removed.push({ ...candidate, status: "preview" });
      continue;
    }
    try {
      await rm(absPath, { recursive: true, force: true });
      removed.push({ ...candidate, status: "removed" });
    } catch (error) {
      errors.push(candidate.relPath + ": " + error.message);
    }
  }
  if (!dryRun && (removed.length > 0 || errors.length > 0)) {
    await appendSnapshotRetentionLog({ rootDir: root, now, removed, errors });
  }
  return {
    dryRun,
    removed: removed.filter((entry) => entry.status === "removed").length,
    previewed: removed.filter((entry) => entry.status === "preview").length,
    bytes: removed.reduce((sum, entry) => sum + (entry.bytes || 0), 0),
    errors,
    results: removed,
  };
}

export function formatArtifactSnapshotRetentionReport(scan = {}, applyResult = null) {
  const lines = ["SUPERVIBE_ARTIFACT_SNAPSHOT_RETENTION"];
  lines.push("SNAPSHOTS: " + (scan.summary?.snapshots || 0));
  lines.push("BYTES: " + (scan.summary?.bytes || 0));
  lines.push("MAX_BYTES: " + (scan.policy?.maxBytes || 0));
  lines.push("KEEP_LAST: " + (scan.policy?.keepLast ?? 0));
  lines.push("CANDIDATES: " + (scan.summary?.candidates || 0));
  lines.push("CANDIDATE_BYTES: " + (scan.summary?.candidateBytes || 0));
  lines.push("PROJECTED_BYTES: " + (scan.summary?.projectedBytesAfterCleanup || 0));
  lines.push("LATEST_SNAPSHOT: " + (scan.latestSnapshotId || "none"));
  for (const candidate of scan.candidates || []) {
    lines.push("- " + candidate.snapshotId + ": " + candidate.reason + " bytes=" + candidate.bytes + " age=" + candidate.ageDays + "d");
  }
  if (applyResult) {
    lines.push("APPLY: " + (applyResult.dryRun ? "dry-run" : "written"));
    lines.push("REMOVED: " + (applyResult.removed || 0));
    lines.push("PREVIEWED: " + (applyResult.previewed || 0));
    if (applyResult.errors?.length) lines.push("ERRORS: " + applyResult.errors.length);
  } else {
    lines.push("NEXT: re-run with --retention-apply to remove candidates.");
  }
  return lines.join("\n");
}

export async function restoreArtifactSnapshot({
  rootDir = process.cwd(),
  snapshotId,
  confirm,
  snapshotRoot = ARTIFACT_SNAPSHOT_ROOT,
} = {}) {
  if (confirm !== ARTIFACT_SNAPSHOT_CONFIRM) {
    throw new Error(`restore requires --confirm ${ARTIFACT_SNAPSHOT_CONFIRM}`);
  }
  if (!snapshotId) throw new Error("--restore <snapshot-id> required");
  const root = resolve(rootDir);
  const safeSnapshotRoot = resolveSnapshotRoot(root, snapshotRoot);
  const manifestPath = join(safeSnapshotRoot, sanitizeSnapshotId(snapshotId), "snapshot.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const restored = [];
  for (const entry of manifest.entries || []) {
    if (isSecretPath(entry.path)) continue;
    const source = resolveSafe(root, entry.snapshotPath);
    const destination = resolveSafe(root, entry.path);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(source, destination);
    restored.push(entry.path);
  }
  return { snapshotId, restored };
}

async function readLatestSnapshotPointer({ root, safeSnapshotRoot }) {
  const latestPath = join(safeSnapshotRoot, "latest.json");
  if (!existsSync(latestPath)) return null;
  try {
    const latest = JSON.parse(await readFile(latestPath, "utf8"));
    return {
      snapshotId: latest.snapshotId || null,
      snapshotPath: latest.snapshotPath || null,
      createdAt: latest.createdAt || null,
      relPath: normalizeRel(root, latestPath),
    };
  } catch {
    return null;
  }
}

async function listSnapshotRetentionEntries({ root, safeSnapshotRoot, now }) {
  if (!existsSync(safeSnapshotRoot)) return [];
  const entries = [];
  for (const entry of await readdir(safeSnapshotRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const absPath = join(safeSnapshotRoot, entry.name);
    const fileStat = await stat(absPath);
    const manifest = await readSnapshotManifest(join(absPath, "snapshot.json"));
    const createdAt = manifest?.createdAt || fileStat.mtime.toISOString();
    const bytes = await directorySize(absPath);
    entries.push({
      snapshotId: entry.name,
      relPath: normalizeRel(root, absPath),
      manifestPath: existsSync(join(absPath, "snapshot.json")) ? normalizeRel(root, join(absPath, "snapshot.json")) : null,
      createdAt,
      mtime: fileStat.mtime.toISOString(),
      ageDays: ageInDays(createdAt, now),
      bytes,
      entryCount: await directoryFileCount(absPath),
      hasManifest: Boolean(manifest),
    });
  }
  return entries;
}

async function readSnapshotManifest(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function directorySize(dir) {
  let bytes = 0;
  if (!existsSync(dir)) return bytes;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const absPath = join(dir, entry.name);
    if (entry.isDirectory()) bytes += await directorySize(absPath);
    else {
      try {
        bytes += (await stat(absPath)).size;
      } catch {}
    }
  }
  return bytes;
}

async function directoryFileCount(dir) {
  let count = 0;
  if (!existsSync(dir)) return count;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const absPath = join(dir, entry.name);
    if (entry.isDirectory()) count += await directoryFileCount(absPath);
    else count += 1;
  }
  return count;
}

function compareSnapshotNewestFirst(left, right) {
  return Date.parse(right.createdAt || right.mtime || 0) - Date.parse(left.createdAt || left.mtime || 0)
    || String(left.snapshotId).localeCompare(String(right.snapshotId));
}

function compareSnapshotOldestFirst(left, right) {
  return Date.parse(left.createdAt || left.mtime || 0) - Date.parse(right.createdAt || right.mtime || 0)
    || String(left.snapshotId).localeCompare(String(right.snapshotId));
}

function ageInDays(date, now) {
  const start = Date.parse(date || "");
  const end = Date.parse(now || "");
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

async function appendSnapshotRetentionLog({ rootDir, now, removed, errors }) {
  const logPath = resolveSafe(rootDir, ARTIFACT_SNAPSHOT_RETENTION_LOG);
  await mkdir(dirname(logPath), { recursive: true });
  const previous = existsSync(logPath) ? await readFile(logPath, "utf8") : "";
  const records = [];
  for (const entry of removed || []) {
    records.push(JSON.stringify({
      schemaVersion: 1,
      type: "artifact-snapshot-retention",
      removedAt: now,
      snapshotId: entry.snapshotId,
      relPath: entry.relPath,
      reason: entry.reason,
      reasons: entry.reasons || [],
      bytes: entry.bytes || 0,
      status: entry.status,
    }));
  }
  for (const error of errors || []) {
    records.push(JSON.stringify({
      schemaVersion: 1,
      type: "artifact-snapshot-retention-error",
      at: now,
      error,
    }));
  }
  if (records.length > 0) await writeFile(logPath, previous + records.join("\n") + "\n", "utf8");
}

function addCandidate(candidates, root, kind, relPath) {
  const relPathNormalized = normalizeRelPath(relPath);
  if (!relPathNormalized || isSecretPath(relPathNormalized)) return;
  const absPath = resolveSafe(root, relPathNormalized);
  candidates.push({
    kind,
    path: relPathNormalized,
    exists: existsSync(absPath),
  });
}

async function findFiles(dir, includeRel) {
  const out = [];
  if (!existsSync(dir)) return out;
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const absPath = join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(absPath);
      } else {
        const relPath = normalizeRel(dir, absPath);
        if (includeRel(relPath, absPath)) out.push(absPath);
      }
    }
  }
  await walk(dir);
  return out;
}

function resolveSnapshotRoot(root, requested) {
  const abs = resolve(root, requested || ARTIFACT_SNAPSHOT_ROOT);
  const allowed = resolve(root, ARTIFACT_SNAPSHOT_ROOT);
  if (abs !== allowed && !abs.startsWith(`${allowed}${sep}`)) {
    throw new Error(`snapshot root must stay under ${ARTIFACT_SNAPSHOT_ROOT}`);
  }
  return abs;
}

function resolveSafe(root, relPath) {
  const absPath = resolve(root, relPath);
  if (absPath !== root && !absPath.startsWith(`${root}${sep}`)) {
    throw new Error(`path escapes workspace: ${relPath}`);
  }
  return absPath;
}

function normalizeRel(root, absPath) {
  return relative(root, resolve(absPath)).split(sep).join("/");
}

function normalizeRelPath(value = "") {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function isSecretPath(relPath = "") {
  const normalized = normalizeRelPath(relPath);
  return SECRET_FILE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function sanitizeSnapshotId(value = "") {
  return String(value || "snapshot").replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "") || "snapshot";
}

async function sha256File(file) {
  const bytes = await readFile(file);
  return createHash("sha256").update(bytes).digest("hex");
}

function parseArgs(argv) {
  const parsed = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) {
      parsed._.push(item);
      continue;
    }
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rootDir = args.root || process.cwd();
  if (args.create) {
    const result = await createArtifactSnapshot({
      rootDir,
      reason: typeof args.reason === "string" ? args.reason : "pre-mutation snapshot",
      snapshotId: typeof args.id === "string" ? args.id : null,
      snapshotRoot: typeof args["snapshot-root"] === "string" ? args["snapshot-root"] : ARTIFACT_SNAPSHOT_ROOT,
      includeRebuildableCaches: args["include-rebuildable-caches"] === true,
    });
    console.log("SUPERVIBE_ARTIFACT_SNAPSHOT_CREATED");
    console.log(`SNAPSHOT_ID: ${result.manifest.snapshotId}`);
    console.log(`SNAPSHOT_PATH: ${result.manifestPath}`);
    console.log(`ENTRIES: ${result.manifest.entries.length}`);
    console.log(`RESTORE_COMMAND: ${result.manifest.restoreCommand}`);
    return;
  }
  if (args["retention-status"] || args["retention-apply"] || args["retention-dry-run"]) {
    const scan = await scanArtifactSnapshotRetention({
      rootDir,
      keepLast: args["keep-last"] === undefined ? DEFAULT_ARTIFACT_SNAPSHOT_RETENTION.keepLast : args["keep-last"],
      maxBytes: args["max-bytes"] === undefined ? DEFAULT_ARTIFACT_SNAPSHOT_RETENTION.maxBytes : args["max-bytes"],
      maxAgeDays: args["max-age-days"] === undefined ? DEFAULT_ARTIFACT_SNAPSHOT_RETENTION.maxAgeDays : args["max-age-days"],
    });
    const applyResult = args["retention-apply"]
      ? await applyArtifactSnapshotRetention(scan, { rootDir, dryRun: false })
      : args["retention-dry-run"]
        ? await applyArtifactSnapshotRetention(scan, { rootDir, dryRun: true })
        : null;
    console.log(formatArtifactSnapshotRetentionReport(scan, applyResult));
    return;
  }

  if (args.restore) {
    const result = await restoreArtifactSnapshot({
      rootDir,
      snapshotId: args.restore,
      confirm: args.confirm,
      snapshotRoot: typeof args["snapshot-root"] === "string" ? args["snapshot-root"] : ARTIFACT_SNAPSHOT_ROOT,
    });
    console.log("SUPERVIBE_ARTIFACT_SNAPSHOT_RESTORED");
    console.log(`SNAPSHOT_ID: ${result.snapshotId}`);
    console.log(`RESTORED: ${result.restored.length}`);
    return;
  }
  console.log(formatArtifactSnapshotStatus(await buildArtifactSnapshotStatus({ rootDir })));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error("SUPERVIBE_ARTIFACT_SNAPSHOT_ERROR");
    console.error(`ERROR: ${error.message}`);
    process.exit(2);
  });
}
