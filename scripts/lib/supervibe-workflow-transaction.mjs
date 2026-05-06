import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";

import {
  issueWorkflowInvocationReceipt,
} from "./supervibe-workflow-receipt-runtime.mjs";

export async function writeWorkflowTransactionAndReceipt({
  rootDir = process.cwd(),
  command,
  stage,
  subjectId,
  kind,
  reason,
  summary = {},
  handoffId = null,
  runTimestamp = null,
} = {}) {
  if (!command) throw new Error("command required");
  if (!stage) throw new Error("stage required");
  if (!subjectId) throw new Error("subjectId required");
  if (!kind) throw new Error("kind required");
  const timestamp = runTimestamp || new Date().toISOString();
  const resolvedHandoffId = handoffId || `${sanitizeId(kind)}-${sanitizeId(timestamp)}`;
  const relPath = [
    ".supervibe",
    "artifacts",
    "_workflow-transactions",
    sanitizeId(command),
    sanitizeId(resolvedHandoffId),
    "summary.json",
  ].join("/");
  const absPath = join(rootDir, ...relPath.split("/"));
  await mkdir(dirname(absPath), { recursive: true });
  const payload = {
    schemaVersion: 1,
    type: "supervibe-workflow-transaction-summary",
    command,
    stage,
    subjectId,
    kind,
    createdAt: timestamp,
    summary,
  };
  await writeFile(absPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  const receipt = await issueWorkflowInvocationReceipt({
    rootDir,
    command,
    subjectType: "command",
    subjectId,
    stage,
    invocationReason: reason || `${command} ${kind} transaction completed`,
    outputArtifacts: [relPath],
    startedAt: timestamp,
    completedAt: timestamp,
    runTimestamp: timestamp,
    handoffId: resolvedHandoffId,
  });
  return {
    path: normalizeRelPath(relative(rootDir, absPath)),
    receiptPath: receipt.receiptPath,
    artifactLinksPath: receipt.artifactLinksPath,
    ledgerEntry: receipt.ledgerEntry,
    handoffId: resolvedHandoffId,
  };
}

function sanitizeId(value) {
  return String(value ?? "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";
}

function normalizeRelPath(path) {
  return String(path ?? "").split(sep).join("/").replace(/^\.\//, "");
}
