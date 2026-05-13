#!/usr/bin/env node
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveActiveWorkItemGraph } from "./lib/supervibe-work-item-registry.mjs";

export const ARTIFACT_SNAPSHOT_ROOT = ".supervibe/memory/artifact-snapshots";
export const ARTIFACT_SNAPSHOT_LATEST = `${ARTIFACT_SNAPSHOT_ROOT}/latest.json`;
export const ARTIFACT_SNAPSHOT_CONFIRM = "restore-artifact-snapshot";

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

export async function collectArtifactSnapshotInventory({ rootDir = process.cwd() } = {}) {
  const root = resolve(rootDir);
  const candidates = [];
  const add = (kind, relPath) => addCandidate(candidates, root, kind, relPath);

  add("active-workflow", ".supervibe/memory/active-workflow.json");
  add("receipt-ledger", ".supervibe/memory/workflow-invocation-ledger.jsonl");
  add("evidence-ledger", ".supervibe/memory/evidence-ledger.jsonl");
  add("memory-index", ".supervibe/memory/memory.db");
  add("code-index", ".supervibe/memory/code.db");
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
} = {}) {
  const root = resolve(rootDir);
  const safeSnapshotRoot = resolveSnapshotRoot(root, snapshotRoot);
  const id = sanitizeSnapshotId(snapshotId || new Date().toISOString());
  const snapshotDir = join(safeSnapshotRoot, id);
  const filesDir = join(snapshotDir, "files");
  const inventory = await collectArtifactSnapshotInventory({ rootDir: root });
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
  const presentKinds = new Set((latest?.entries || []).map((entry) => entry.kind));
  const requiredKinds = ["active-workflow", "receipt-ledger", "memory-index", "code-index"];
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
  lines.push(`  CREATE_COMMAND: ${status.createCommand}`);
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
    });
    console.log("SUPERVIBE_ARTIFACT_SNAPSHOT_CREATED");
    console.log(`SNAPSHOT_ID: ${result.manifest.snapshotId}`);
    console.log(`SNAPSHOT_PATH: ${result.manifestPath}`);
    console.log(`ENTRIES: ${result.manifest.entries.length}`);
    console.log(`RESTORE_COMMAND: ${result.manifest.restoreCommand}`);
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
