import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { dirname, isAbsolute, join, relative, sep } from "node:path";

export const WORKFLOW_RECEIPT_ISSUER = "supervibe-workflow-receipt-runtime";

const ALGORITHM = "hmac-sha256";
const KEY_RELATIVE_PATH = ".supervibe/memory/workflow-receipt-runtime.key";
const LEDGER_RELATIVE_PATH = ".supervibe/memory/workflow-invocation-ledger.jsonl";
const DEFAULT_RECEIPT_DIR = ".supervibe/artifacts/_workflow-invocations";
const ARTIFACT_LINKS_FILE = "artifact-links.json";

export function defaultWorkflowReceiptKeyPath(rootDir = process.cwd()) {
  return join(rootDir, ...KEY_RELATIVE_PATH.split("/"));
}

export function defaultWorkflowReceiptLedgerPath(rootDir = process.cwd()) {
  return join(rootDir, ...LEDGER_RELATIVE_PATH.split("/"));
}

export async function issueWorkflowInvocationReceipt({
  rootDir = process.cwd(),
  command,
  subjectType = "command",
  subjectId,
  agentId = null,
  skillId = null,
  stage,
  invocationReason,
  inputEvidence = [],
  outputArtifacts = [],
  startedAt,
  completedAt = new Date().toISOString(),
  handoffId,
  receiptDir = null,
  receiptPrefix = "workflow",
  secret = null,
} = {}) {
  if (!command) throw new Error("command required");
  if (!subjectId) throw new Error("subjectId required");
  if (!stage) throw new Error("stage required");
  if (!invocationReason) throw new Error("invocationReason required");
  if (!handoffId) throw new Error("handoffId required");
  if (!outputArtifacts?.length) throw new Error("outputArtifacts required");

  const resolvedSecret = await ensureReceiptSecret(rootDir, secret);
  const absReceiptDir = receiptDir
    ? resolveReceiptDir(rootDir, receiptDir)
    : join(rootDir, ...DEFAULT_RECEIPT_DIR.split("/"), sanitizeId(command), sanitizeId(handoffId));
  const receiptPath = join(absReceiptDir, `${sanitizeId(subjectId)}-${sanitizeId(stage)}.json`);
  const relReceiptPath = normalizeRelPath(relative(rootDir, receiptPath));
  const issuedAt = new Date().toISOString();
  const keyId = keyIdForSecret(resolvedSecret);
  const inputHashes = inputEvidence.map((path) => hashEvidencePath(rootDir, path, { required: false }));
  const outputHashes = outputArtifacts.map((path) => hashEvidencePath(rootDir, path, { required: true }));
  const receiptId = `${sanitizeId(receiptPrefix)}-${createHash("sha1")
    .update(`${command}:${subjectType}:${subjectId}:${stage}:${handoffId}:${issuedAt}`)
    .digest("hex")
    .slice(0, 12)}`;

  const runtime = {
    issuer: WORKFLOW_RECEIPT_ISSUER,
    issuedAt,
    keyId,
    algorithm: ALGORITHM,
  };
  const canonical = {
    schemaVersion: 2,
    receiptId,
    command,
    invokedBy: command.replace(/^\//, ""),
    subjectType,
    subjectId,
    agentId,
    skillId,
    stage,
    status: "completed",
    invocationReason,
    inputEvidence: normalizePathList(inputEvidence, rootDir),
    outputArtifacts: normalizePathList(outputArtifacts, rootDir),
    inputHashes,
    outputHashes,
    startedAt,
    completedAt,
    handoffId,
    runtime,
  };
  const canonicalHash = sha256(stableStringify(canonical));
  const signature = signCanonical(canonical, resolvedSecret);
  const receipt = {
    ...canonical,
    runtime: {
      ...runtime,
      canonicalHash,
      signature,
    },
  };

  await mkdir(absReceiptDir, { recursive: true });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");

  const artifactLinksPath = join(absReceiptDir, ARTIFACT_LINKS_FILE);
  const relArtifactLinksPath = normalizeRelPath(relative(rootDir, artifactLinksPath));
  await upsertArtifactLinks(artifactLinksPath, receipt, relReceiptPath);

  const ledgerEntry = await appendReceiptLedger(rootDir, {
    receiptId,
    command,
    subjectType,
    subjectId,
    receiptPath: relReceiptPath,
    artifactLinksPath: relArtifactLinksPath,
    canonicalHash,
    signature,
    issuedAt,
  });

  return {
    receipt,
    receiptPath: relReceiptPath,
    artifactLinksPath: relArtifactLinksPath,
    ledgerEntry,
  };
}

export function validateWorkflowReceiptTrust(rootDir = process.cwd(), receipt = {}, options = {}) {
  const issues = [];
  const secret = options.secret ?? readReceiptSecretSync(rootDir);
  if (!receipt?.receiptId) {
    return { pass: false, issues: ["receiptId missing"] };
  }
  if (receipt.runtime?.issuer !== WORKFLOW_RECEIPT_ISSUER) {
    issues.push("runtime issuer missing or invalid");
  }
  if (receipt.runtime?.algorithm !== ALGORITHM) {
    issues.push("runtime signature algorithm missing or invalid");
  }
  if (!receipt.runtime?.canonicalHash || !receipt.runtime?.signature) {
    issues.push("runtime canonicalHash/signature missing");
  }
  if (!secret) {
    issues.push("receipt runtime secret missing");
  }

  if (secret && receipt.runtime?.signature) {
    const canonical = canonicalReceiptForVerification(receipt);
    const expectedHash = sha256(stableStringify(canonical));
    const expectedSignature = signCanonical(canonical, secret);
    if (receipt.runtime.canonicalHash !== expectedHash) {
      issues.push("receipt canonical hash mismatch");
    }
    if (receipt.runtime.signature !== expectedSignature) {
      issues.push("receipt signature mismatch");
    }
    if (receipt.runtime.keyId !== keyIdForSecret(secret)) {
      issues.push("receipt keyId mismatch");
    }
  }

  for (const output of receipt.outputHashes || []) {
    const current = hashEvidencePath(rootDir, output.path, { required: false });
    if (!current.exists) {
      issues.push(`output artifact missing: ${output.path}`);
      continue;
    }
    if (current.sha256 !== output.sha256) {
      issues.push(`output artifact hash mismatch: ${output.path}`);
    }
  }

  const ledgerCheck = validateReceiptLedgerEntry(rootDir, receipt, options);
  issues.push(...ledgerCheck.issues);

  const linkCheck = validateArtifactLinks(rootDir, receipt);
  issues.push(...linkCheck.issues);

  return { pass: issues.length === 0, issues };
}

export function validateWorkflowReceiptLedgerChain(rootDir = process.cwd(), options = {}) {
  const secret = options.secret ?? readReceiptSecretSync(rootDir);
  const entries = readReceiptLedgerSync(rootDir);
  const issues = [];
  let previousEntryHash = null;
  for (const [index, entry] of entries.entries()) {
    if (entry.__invalidJson) {
      issues.push(`ledger entry ${index} is not valid JSON`);
      continue;
    }
    if (entry.previousEntryHash !== previousEntryHash) {
      issues.push(`ledger entry ${index} previousEntryHash mismatch`);
    }
    const expectedEntryHash = ledgerEntryHash({ ...entry, entryHash: undefined });
    if (entry.entryHash !== expectedEntryHash) {
      issues.push(`ledger entry ${index} entryHash mismatch`);
    }
    if (secret && entry.signature) {
      const receipt = readJsonSync(join(rootDir, ...String(entry.receiptPath || "").split("/")));
      if (!receipt || receipt.runtime?.signature !== entry.signature) {
        issues.push(`ledger entry ${index} receipt signature mismatch`);
      }
    }
    previousEntryHash = entry.entryHash;
  }
  return { pass: issues.length === 0, entries: entries.length, issues };
}

export function readWorkflowReceipts(rootDir = process.cwd()) {
  return readAllWorkflowReceipts(rootDir);
}

export function validateWorkflowReceipts(rootDir = process.cwd(), options = {}) {
  const receipts = readAllWorkflowReceipts(rootDir);
  const issues = [];
  for (const receipt of receipts) {
    const trust = validateWorkflowReceiptTrust(rootDir, receipt, options);
    for (const message of trust.issues) {
      issues.push({
        code: /artifact link manifest missing|artifact link missing/i.test(message)
          ? "missing-workflow-artifact-receipt-link"
          : "untrusted-workflow-receipt",
        file: receipt.__file,
        message: `${receipt.__file}: ${message}`,
      });
    }
  }
  const ledger = validateWorkflowReceiptLedgerChain(rootDir, options);
  for (const message of ledger.issues) {
    issues.push({
      code: "invalid-workflow-receipt-ledger",
      file: LEDGER_RELATIVE_PATH,
      message,
    });
  }
  return {
    pass: issues.length === 0,
    checked: receipts.length,
    receipts: receipts.length,
    ledgerEntries: ledger.entries,
    issues,
  };
}

function validateReceiptLedgerEntry(rootDir, receipt, options = {}) {
  const entries = readReceiptLedgerSync(rootDir);
  const chain = validateWorkflowReceiptLedgerChain(rootDir, options);
  const issues = [...chain.issues];
  const match = entries.find((entry) => entry.receiptId === receipt.receiptId);
  if (!match) {
    issues.push(`ledger entry missing for receipt ${receipt.receiptId}`);
  } else {
    if (match.canonicalHash !== receipt.runtime?.canonicalHash) {
      issues.push(`ledger canonical hash mismatch for receipt ${receipt.receiptId}`);
    }
    if (match.signature !== receipt.runtime?.signature) {
      issues.push(`ledger signature mismatch for receipt ${receipt.receiptId}`);
    }
  }
  return { pass: issues.length === 0, issues };
}

function validateArtifactLinks(rootDir, receipt) {
  const issues = [];
  const receiptDir = receipt.__file
    ? join(rootDir, ...dirname(receipt.__file).split("/"))
    : null;
  if (!receiptDir) {
    return { pass: false, issues: ["receipt file path missing for artifact link validation"] };
  }
  const linksPath = join(receiptDir, ARTIFACT_LINKS_FILE);
  const manifest = readJsonSync(linksPath);
  if (!manifest) {
    return { pass: false, issues: [`artifact link manifest missing for receipt ${receipt.receiptId}`] };
  }
  for (const output of receipt.outputHashes || []) {
    const link = (manifest.links || []).find((candidate) => normalizeRelPath(candidate.artifactPath) === normalizeRelPath(output.path));
    if (!link) {
      issues.push(`artifact link missing for ${output.path}`);
      continue;
    }
    if (link.receiptId !== receipt.receiptId) {
      issues.push(`artifact link receipt mismatch for ${output.path}`);
    }
    if (link.sha256 !== output.sha256) {
      issues.push(`artifact link hash mismatch for ${output.path}`);
    }
  }
  return { pass: issues.length === 0, issues };
}

async function ensureReceiptSecret(rootDir, secret) {
  if (secret) return secret;
  const keyPath = defaultWorkflowReceiptKeyPath(rootDir);
  if (existsSync(keyPath)) {
    return (await readFile(keyPath, "utf8")).trim();
  }
  const generated = randomBytes(32).toString("hex");
  await mkdir(dirname(keyPath), { recursive: true });
  await writeFile(keyPath, `${generated}\n`, "utf8");
  return generated;
}

function readReceiptSecretSync(rootDir) {
  const keyPath = defaultWorkflowReceiptKeyPath(rootDir);
  if (!existsSync(keyPath)) return null;
  return readFileSync(keyPath, "utf8").trim();
}

async function upsertArtifactLinks(path, receipt, receiptPath) {
  let manifest = { schemaVersion: 1, links: [] };
  if (existsSync(path)) {
    try {
      manifest = JSON.parse(await readFile(path, "utf8"));
    } catch {
      manifest = { schemaVersion: 1, links: [] };
    }
  }
  const links = Array.isArray(manifest.links) ? manifest.links : [];
  const nextLinks = links.filter((link) => !receipt.outputHashes.some((output) => normalizeRelPath(output.path) === normalizeRelPath(link.artifactPath)));
  for (const output of receipt.outputHashes) {
    nextLinks.push({
      artifactPath: output.path,
      receiptId: receipt.receiptId,
      receiptPath,
      sha256: output.sha256,
    });
  }
  await writeFile(path, `${JSON.stringify({ schemaVersion: 1, links: nextLinks }, null, 2)}\n`, "utf8");
}

async function appendReceiptLedger(rootDir, entry) {
  const ledgerPath = defaultWorkflowReceiptLedgerPath(rootDir);
  const previous = readReceiptLedgerSync(rootDir);
  const previousEntryHash = previous.length ? previous[previous.length - 1].entryHash : null;
  const withChain = {
    schemaVersion: 1,
    ...entry,
    previousEntryHash,
  };
  const ledgerEntry = {
    ...withChain,
    entryHash: ledgerEntryHash(withChain),
  };
  await mkdir(dirname(ledgerPath), { recursive: true });
  await appendFile(ledgerPath, `${JSON.stringify(ledgerEntry)}\n`, "utf8");
  return ledgerEntry;
}

function readReceiptLedgerSync(rootDir) {
  const ledgerPath = defaultWorkflowReceiptLedgerPath(rootDir);
  if (!existsSync(ledgerPath)) return [];
  return readFileSync(ledgerPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { __invalidJson: true };
      }
    });
}

function readAllWorkflowReceipts(rootDir) {
  const root = join(rootDir, ".supervibe", "artifacts");
  if (!existsSync(root)) return [];
  const files = [];
  walk(root, files);
  return files
    .filter((file) => {
      const rel = normalizeRelPath(relative(rootDir, file));
      return file.endsWith(".json")
        && !file.endsWith(ARTIFACT_LINKS_FILE)
        && rel.includes("/_workflow-invocations/");
    })
    .map((file) => {
      try {
        return {
          ...JSON.parse(readFileSync(file, "utf8")),
          __file: normalizeRelPath(relative(rootDir, file)),
        };
      } catch {
        return { __file: normalizeRelPath(relative(rootDir, file)), __invalidJson: true };
      }
    });
}

function walk(dir, files) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
      continue;
    }
    if (!entry.isFile()) continue;
    if (statSync(full).size > 1_000_000) continue;
    files.push(full);
  }
}

function canonicalReceiptForVerification(receipt) {
  const runtime = { ...(receipt.runtime || {}) };
  delete runtime.canonicalHash;
  delete runtime.signature;
  return {
    schemaVersion: receipt.schemaVersion,
    receiptId: receipt.receiptId,
    command: receipt.command,
    invokedBy: receipt.invokedBy,
    subjectType: receipt.subjectType,
    subjectId: receipt.subjectId,
    agentId: receipt.agentId ?? null,
    skillId: receipt.skillId ?? null,
    stage: receipt.stage,
    status: receipt.status,
    invocationReason: receipt.invocationReason,
    inputEvidence: receipt.inputEvidence || [],
    outputArtifacts: receipt.outputArtifacts || [],
    inputHashes: receipt.inputHashes || [],
    outputHashes: receipt.outputHashes || [],
    startedAt: receipt.startedAt,
    completedAt: receipt.completedAt,
    handoffId: receipt.handoffId,
    runtime,
  };
}

function signCanonical(canonical, secret) {
  return createHmac("sha256", secret).update(stableStringify(canonical)).digest("hex");
}

function hashEvidencePath(rootDir, path, { required }) {
  const relPath = normalizeInputPath(path, rootDir);
  const absPath = join(rootDir, ...relPath.split("/"));
  if (!existsSync(absPath)) {
    if (required) throw new Error(`Required artifact missing: ${relPath}`);
    return { path: relPath, exists: false, sha256: null };
  }
  return {
    path: relPath,
    exists: true,
    sha256: sha256(readFileSync(absPath)),
  };
}

function normalizePathList(paths, rootDir) {
  return [...new Set((Array.isArray(paths) ? paths : []).map((path) => normalizeInputPath(path, rootDir)))];
}

function normalizeInputPath(path, rootDir) {
  const value = String(path ?? "");
  const rel = isAbsolute(value) ? relative(rootDir, value) : value;
  return normalizeRelPath(rel);
}

function resolveReceiptDir(rootDir, path) {
  return isAbsolute(path) ? path : join(rootDir, ...normalizeRelPath(path).split("/"));
}

function sanitizeId(value) {
  return String(value ?? "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";
}

function keyIdForSecret(secret) {
  return `key-${sha256(secret).slice(0, 12)}`;
}

function ledgerEntryHash(entry) {
  const copy = { ...entry };
  delete copy.entryHash;
  return sha256(stableStringify(copy));
}

function readJsonSync(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  if (value && typeof value === "object" && !Buffer.isBuffer(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalizeRelPath(path) {
  return String(path ?? "").split(sep).join("/").replace(/^\.\//, "");
}
