import { createHash } from "node:crypto";
import { hashContent } from "./file-hash.mjs";

const SECRET_PATTERN = /\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|(?:api[_-]?key|token|secret|password|passwd)\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{8,})/gi;

export function extractFileLocalContracts(content = "", { filePath = "unknown", anchors = [] } = {}) {
  const contracts = [];
  const text = String(content || "");
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!/@supervibe-contract\b/.test(line)) continue;
    const attrs = parseAttributes(line);
    contracts.push(normalizeFileLocalContract({
      contractId: attrs.id || attrs.contractId || stableContractId({ filePath, line: index + 1, purpose: attrs.purpose }),
      filePath,
      purpose: attrs.purpose || attrs.responsibility || "File-local contract",
      inputs: splitList(attrs.inputs || attrs.input),
      outputs: splitList(attrs.outputs || attrs.output),
      sideEffects: splitList(attrs.sideEffects || attrs.sideeffects || attrs.effects),
      invariants: splitList(attrs.invariant || attrs.invariants),
      dependencies: splitList(attrs.depends || attrs.dependencies),
      forbiddenChanges: splitList(attrs.forbidden || attrs.forbiddenChanges),
      verificationRefs: splitList(attrs.verify || attrs.verificationRefs),
      anchorRefs: anchors.filter((anchor) => anchor.filePath === filePath).map((anchor) => anchor.anchorId),
      contentHash: hashContent(text),
      startLine: index + 1,
      endLine: index + 1,
    }));
  }
  if (contracts.length === 0 && anchors.length > 0) {
    for (const anchor of anchors.filter((item) => item.filePath === filePath)) {
      contracts.push(normalizeFileLocalContract({
        contractId: `flc-${anchor.anchorId}`,
        filePath,
        purpose: anchor.responsibility || `Preserve ${anchor.anchorId}`,
        invariants: anchor.invariants || [],
        verificationRefs: anchor.verificationRefs || [],
        anchorRefs: [anchor.anchorId],
        contentHash: hashContent(text),
        startLine: anchor.startLine,
        endLine: anchor.endLine,
      }));
    }
  }
  return contracts;
}

export function buildFileLocalContractContext({ task = {}, contracts = [], maxContracts = 8 } = {}) {
  const targetFiles = new Set((task.targetFiles || task.filesTouched || task.fileImpact || []).map(normalizePath));
  const relevant = contracts
    .filter((contract) => targetFiles.size === 0 || targetFiles.has(normalizePath(contract.filePath)))
    .slice(0, maxContracts)
    .map(normalizeFileLocalContract);
  return {
    taskId: task.id || null,
    contracts: relevant,
    sharedProjectContractsRemainAuthoritative: true,
    source: "file-local-context",
  };
}

export function fileLocalContractsToTaskPatch(context = {}) {
  return {
    fileLocalContractRefs: (context.contracts || []).map((contract) => contract.contractId),
    fileLocalContracts: context.contracts || [],
    sharedProjectContractsRemainAuthoritative: context.sharedProjectContractsRemainAuthoritative !== false,
  };
}

export function detectFileLocalContractDrift({ contracts = [], fileSnapshots = {} } = {}) {
  const issues = [];
  for (const contract of contracts) {
    const snapshot = fileSnapshots[contract.filePath];
    if (!snapshot) {
      issues.push({ code: "file-contract-missing-file", contractId: contract.contractId, filePath: contract.filePath });
      continue;
    }
    if (contract.contentHash && snapshot.contentHash && contract.contentHash !== snapshot.contentHash) {
      issues.push({ code: "file-contract-hash-drift", contractId: contract.contractId, filePath: contract.filePath });
    }
  }
  return {
    ok: issues.length === 0,
    issues,
  };
}

export function formatFileLocalContractSummary({ contracts = [], drift = null } = {}) {
  const issues = drift?.issues || [];
  return [
    "SUPERVIBE_FILE_LOCAL_CONTRACTS",
    `CONTRACTS: ${contracts.length}`,
    `DRIFT: ${issues.length}`,
    `FILES: ${new Set(contracts.map((contract) => contract.filePath)).size}`,
    `CONTRACT_IDS: ${contracts.map((contract) => contract.contractId).join(",") || "none"}`,
  ].join("\n");
}

function normalizeFileLocalContract(contract = {}) {
  return {
    contractId: redact(contract.contractId || stableContractId(contract)),
    filePath: normalizePath(contract.filePath || contract.path || "unknown"),
    purpose: redact(contract.purpose || "File-local contract"),
    inputs: splitList(contract.inputs).map(redact),
    outputs: splitList(contract.outputs).map(redact),
    sideEffects: splitList(contract.sideEffects).map(redact),
    invariants: splitList(contract.invariants || contract.invariant).map(redact),
    dependencies: splitList(contract.dependencies || contract.depends).map(redact),
    forbiddenChanges: splitList(contract.forbiddenChanges || contract.forbidden).map(redact),
    verificationRefs: splitList(contract.verificationRefs || contract.verify).map(redact),
    anchorRefs: splitList(contract.anchorRefs || contract.anchorRef),
    contentHash: contract.contentHash || null,
    startLine: Number(contract.startLine || contract.line || 1),
    endLine: Number(contract.endLine || contract.startLine || contract.line || 1),
    overridesSharedContracts: false,
  };
}

function parseAttributes(line = "") {
  const attrs = {};
  const regex = /([A-Za-z][A-Za-z0-9_-]*)=(?:"([^"]*)"|'([^']*)'|([^\s]+))/g;
  let match;
  while ((match = regex.exec(line))) attrs[match[1]] = match[2] ?? match[3] ?? match[4] ?? "";
  return attrs;
}

function stableContractId({ filePath = "unknown", line = "", purpose = "" } = {}) {
  return `flc-${createHash("sha1").update(`${normalizePath(filePath)}:${line}:${purpose}`).digest("hex").slice(0, 10)}`;
}

function splitList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value === undefined || value === null || value === "") return [];
  return String(value).split(/[;,]/).map((item) => item.trim()).filter(Boolean);
}

function normalizePath(path = "") {
  return String(path || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function redact(value = "") {
  return String(value || "").replace(SECRET_PATTERN, "[REDACTED_SECRET]");
}
