import { existsSync, readFileSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";

const INDEX_RELATIVE_PATH = ".supervibe/memory/workflow-receipt-index.json";
const INDEX_SCHEMA_VERSION = 1;

export function defaultWorkflowReceiptIndexPath(rootDir = process.cwd()) {
  return join(rootDir, ...INDEX_RELATIVE_PATH.split("/"));
}

export function readWorkflowReceiptIndex(rootDir = process.cwd()) {
  const path = defaultWorkflowReceiptIndexPath(rootDir);
  if (!existsSync(path)) return null;
  try {
    const index = JSON.parse(readFileSync(path, "utf8"));
    if (index.schemaVersion !== INDEX_SCHEMA_VERSION || !Array.isArray(index.receipts)) return null;
    return index;
  } catch {
    return null;
  }
}

export async function upsertWorkflowReceiptIndex(rootDir = process.cwd(), receipt = {}, receiptPath = receipt.__file) {
  const current = readWorkflowReceiptIndex(rootDir) || { schemaVersion: INDEX_SCHEMA_VERSION, receipts: [] };
  const normalizedPath = normalizeRelPath(receiptPath || receipt.__file || "");
  const next = current.receipts.filter((entry) => normalizeRelPath(entry.receiptPath) !== normalizedPath);
  next.push(indexEntryFromReceipt(receipt, normalizedPath));
  await writeWorkflowReceiptIndex(rootDir, next);
  return { path: INDEX_RELATIVE_PATH, receipts: next.length };
}

export async function rebuildWorkflowReceiptIndex(rootDir = process.cwd(), receipts = []) {
  const entries = receipts
    .filter((receipt) => receipt && !receipt.__invalidJson)
    .map((receipt) => indexEntryFromReceipt(receipt, receipt.__file || receipt.receiptPath));
  await writeWorkflowReceiptIndex(rootDir, entries);
  return { path: INDEX_RELATIVE_PATH, receipts: entries.length };
}

export function findWorkflowReceiptIndexMatches(rootDir = process.cwd(), scope = {}) {
  const index = readWorkflowReceiptIndex(rootDir);
  if (!index) return { available: false, receiptPaths: [], totalReceipts: 0, reason: "index-missing" };
  const matches = index.receipts.filter((entry) => indexEntryMatchesScope(entry, scope));
  return {
    available: true,
    receiptPaths: matches.map((entry) => entry.receiptPath).filter(Boolean),
    totalReceipts: index.receipts.length,
    reason: "workflow-receipt-index",
  };
}

function indexEntryFromReceipt(receipt = {}, receiptPath = "") {
  return {
    receiptId: receipt.receiptId || null,
    command: normalizeCommand(receipt.command || ""),
    handoffId: receipt.handoffId || null,
    workflowRunId: receipt.workflowRunId || receipt.workflow_run_id || null,
    stage: receipt.stage || null,
    subjectIds: uniqueStrings([receipt.subjectId, receipt.agentId, receipt.skillId]),
    outputArtifacts: uniqueStrings([
      ...(Array.isArray(receipt.outputArtifacts) ? receipt.outputArtifacts : []),
      ...(Array.isArray(receipt.outputHashes) ? receipt.outputHashes.map((item) => item.path) : []),
    ]).map(normalizeRelPath),
    outputHashes: uniqueStrings((Array.isArray(receipt.outputHashes) ? receipt.outputHashes : []).map((item) => item.sha256).filter(Boolean).map((item) => String(item).toLowerCase())),
    hostInvocation: normalizeHostInvocation(receipt.hostInvocation),
    receiptPath: normalizeRelPath(receiptPath),
    canonicalHash: receipt.runtime?.canonicalHash || null,
    updatedAt: new Date().toISOString(),
  };
}

function indexEntryMatchesScope(entry = {}, scope = {}) {
  if (scope.command && normalizeCommand(entry.command) !== normalizeCommand(scope.command)) return false;
  if (scope.handoffId && entry.handoffId !== scope.handoffId) return false;
  if (scope.workflowRunId && entry.workflowRunId !== scope.workflowRunId) return false;
  if (scope.stages?.length && !scope.stages.includes(String(entry.stage || ""))) return false;
  if (scope.subjectIds?.length && !entry.subjectIds?.some((id) => scope.subjectIds.includes(id))) return false;
  if (scope.artifactPaths?.length && !entry.outputArtifacts?.some((path) => scope.artifactPaths.some((artifact) => sameArtifact(path, artifact)))) return false;
  if (scope.artifactHashes?.length && !entry.outputHashes?.some((hash) => scope.artifactHashes.includes(String(hash).toLowerCase()))) return false;
  if (scope.hostInvocation && !hostInvocationMatchesScope(entry.hostInvocation, scope.hostInvocation)) return false;
  return true;
}

async function writeWorkflowReceiptIndex(rootDir, receipts) {
  const path = defaultWorkflowReceiptIndexPath(rootDir);
  const tmpPath = path + ".tmp";
  const payload = {
    schemaVersion: INDEX_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    receipts: receipts.sort((left, right) => String(left.receiptPath).localeCompare(String(right.receiptPath))),
  };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(tmpPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  await rename(tmpPath, path);
}

function normalizeHostInvocation(value = null) {
  if (!value) return null;
  return {
    source: value.source || null,
    invocationId: value.invocationId || value.invocation_id || value.id || null,
    evidencePath: value.evidencePath || value.evidence_path || null,
    agentId: value.agentId || value.agent_id || null,
  };
}

function hostInvocationMatchesScope(proof = null, expected = null) {
  if (!expected) return true;
  if (!proof) return false;
  if (expected.source && proof.source !== expected.source) return false;
  if (expected.invocationId && proof.invocationId !== expected.invocationId) return false;
  if (expected.evidencePath && normalizeRelPath(proof.evidencePath) !== normalizeRelPath(expected.evidencePath)) return false;
  if (expected.agentId && proof.agentId !== expected.agentId) return false;
  return true;
}

function sameArtifact(left, right) {
  const a = normalizeRelPath(left);
  const b = normalizeRelPath(right);
  return a === b || a.endsWith("/" + b) || b.endsWith("/" + a);
}

function normalizeCommand(value = "") {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  return normalized.startsWith("/") ? normalized : "/" + normalized;
}

function normalizeRelPath(value = "") {
  const raw = String(value || "");
  const rel = isAbsolute(raw) ? relative(process.cwd(), raw) : raw;
  return rel.replace(/\\/g, "/").replace(/^\.\//, "");
}

function uniqueStrings(values = []) {
  return [...new Set(values.flatMap((value) => Array.isArray(value) ? value : [value]).map((value) => String(value || "").trim()).filter(Boolean))];
}
