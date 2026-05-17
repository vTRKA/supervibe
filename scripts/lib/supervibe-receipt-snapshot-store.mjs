import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, join, relative } from "node:path";

const SNAPSHOT_ROOT = ".supervibe/artifacts/_workflow-receipt-snapshots";
const SNAPSHOT_TYPE = "supervibe-workflow-receipt-evidence-snapshot";

export function defaultWorkflowReceiptSnapshotRoot(rootDir = process.cwd()) {
  return join(rootDir, ...SNAPSHOT_ROOT.split("/"));
}

export async function createWorkflowReceiptEvidenceSnapshot({
  rootDir = process.cwd(),
  receiptId,
  command,
  subjectType,
  subjectId,
  stage,
  handoffId,
  createdAt,
  inputHashes = [],
  outputHashes = [],
  workItemBinding = null,
} = {}) {
  if (!receiptId) throw new Error("receiptId required for receipt evidence snapshot");
  const relPath = normalizeRelPath(SNAPSHOT_ROOT + "/" + sanitizeId(command) + "/" + sanitizeId(handoffId || "default") + "/" + sanitizeId(receiptId) + ".json");
  const absPath = join(rootDir, ...relPath.split("/"));
  const snapshot = {
    schemaVersion: 1,
    type: SNAPSHOT_TYPE,
    receiptId,
    command,
    subjectType,
    subjectId,
    stage,
    handoffId,
    createdAt,
    inputHashes: normalizeHashRecords(inputHashes),
    outputHashes: normalizeHashRecords(outputHashes),
    ...(workItemBinding ? { workItemBinding } : {}),
  };
  const bytes = JSON.stringify(snapshot, null, 2) + "\n";
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, bytes, "utf8");
  return {
    schemaVersion: 1,
    type: SNAPSHOT_TYPE,
    path: relPath,
    sha256: sha256(bytes),
    bytes: Buffer.byteLength(bytes),
    createdAt,
  };
}

export function validateWorkflowReceiptEvidenceSnapshot(rootDir = process.cwd(), receipt = {}) {
  const ref = receipt.evidenceSnapshot || null;
  if (!ref) return { pass: true, legacy: true, issues: [], snapshot: null };
  const issues = [];
  if (ref.type !== SNAPSHOT_TYPE) issues.push("evidence snapshot type missing or invalid");
  const relPath = normalizeInputPath(ref.path, rootDir);
  if (!relPath) {
    issues.push("evidence snapshot path missing");
    return { pass: false, legacy: false, issues, snapshot: null };
  }
  const absPath = join(rootDir, ...relPath.split("/"));
  if (!existsSync(absPath)) {
    issues.push("evidence snapshot missing: " + relPath);
    return { pass: false, legacy: false, issues, snapshot: null };
  }
  const bytes = readFileSync(absPath);
  const actualSha = sha256(bytes);
  if (ref.sha256 !== actualSha) issues.push("evidence snapshot hash mismatch: " + relPath);
  if (ref.bytes !== undefined && Number(ref.bytes) !== bytes.length) issues.push("evidence snapshot byte length mismatch: " + relPath);
  let snapshot = null;
  try {
    snapshot = JSON.parse(bytes.toString("utf8"));
  } catch {
    issues.push("evidence snapshot invalid JSON: " + relPath);
    return { pass: false, legacy: false, issues, snapshot: null };
  }
  if (snapshot.type !== SNAPSHOT_TYPE) issues.push("evidence snapshot payload type invalid: " + relPath);
  for (const field of ["receiptId", "command", "subjectType", "subjectId", "stage", "handoffId"]) {
    if ((snapshot[field] || null) !== (receipt[field] || null)) issues.push("evidence snapshot " + field + " mismatch: " + relPath);
  }
  if (!sameHashRecords(snapshot.inputHashes, receipt.inputHashes)) issues.push("evidence snapshot input hashes mismatch: " + relPath);
  if (!sameHashRecords(snapshot.outputHashes, receipt.outputHashes)) issues.push("evidence snapshot output hashes mismatch: " + relPath);
  if (receipt.workItemBinding && stableStringify(snapshot.workItemBinding || null) !== stableStringify(receipt.workItemBinding)) {
    issues.push("evidence snapshot work item binding mismatch: " + relPath);
  }
  return { pass: issues.length === 0, legacy: false, issues, snapshot };
}

export async function readWorkflowReceiptEvidenceSnapshot(rootDir = process.cwd(), receipt = {}) {
  const relPath = normalizeInputPath(receipt.evidenceSnapshot?.path || "", rootDir);
  if (!relPath) return null;
  const absPath = join(rootDir, ...relPath.split("/"));
  return JSON.parse(await readFile(absPath, "utf8"));
}

export function workflowReceiptLiveOutputDiagnostics(rootDir = process.cwd(), receipt = {}) {
  return (receipt.outputHashes || []).flatMap((output) => {
    const current = hashExistingPath(rootDir, output.path);
    if (!current.exists) {
      if (isEphemeralDeletedOutput(output.path, receipt)) return [];
      return ["live-output-missing: " + output.path];
    }
    if (current.sha256 !== output.sha256) return ["live-output-changed: " + output.path];
    return [];
  });
}

function isEphemeralDeletedOutput(path, receipt = {}) {
  const relPath = normalizeRelPath(path).toLowerCase();
  const context = [
    receipt.command,
    receipt.stage,
    receipt.handoffId,
    receipt.subjectId,
    receipt.invocationReason,
  ].map((item) => String(item || "").toLowerCase()).join(" ");
  if (!relPath.startsWith(".supervibe/artifacts/plans/")) return false;
  if (!/(?:^|[-_/\s])temp(?:orary)?(?:[-_/\s]|$)/i.test(relPath + " " + context)) return false;
  return /\bdeleted-after-completion\b|\bephemeral\b|\btemporary\b|(?:^|[-_/\s])temp(?:[-_/\s]|$)/i.test(context + " " + relPath);
}

function normalizeHashRecords(records = []) {
  return (records || []).map((record) => ({
    path: normalizeRelPath(record.path || ""),
    exists: record.exists !== false,
    sha256: record.sha256 || null,
    ...(record.compactManifest ? { compactManifest: true } : {}),
  }));
}

function sameHashRecords(left = [], right = []) {
  return stableStringify(normalizeHashRecords(left)) === stableStringify(normalizeHashRecords(right));
}

function hashExistingPath(rootDir, value) {
  const relPath = normalizeInputPath(value, rootDir);
  const absPath = join(rootDir, ...relPath.split("/"));
  if (!existsSync(absPath)) return { path: relPath, exists: false, sha256: null };
  return { path: relPath, exists: true, sha256: sha256(readFileSync(absPath)) };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeInputPath(value, rootDir) {
  const raw = String(value ?? "");
  if (!raw) return "";
  const rel = isAbsolute(raw) ? relative(rootDir, raw) : raw;
  return normalizeRelPath(rel);
}

function normalizeRelPath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function sanitizeId(value) {
  return String(value || "default")
    .replace(/^\//, "")
    .replace(/[^a-zA-Z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "default";
}

function stableStringify(value) {
  if (Array.isArray(value)) return "[" + value.map((item) => stableStringify(item)).join(",") + "]";
  if (value && typeof value === "object" && !Buffer.isBuffer(value)) {
    return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + stableStringify(value[key])).join(",") + "}";
  }
  return JSON.stringify(value);
}
