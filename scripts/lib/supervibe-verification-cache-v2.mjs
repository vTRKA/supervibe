export const VERIFICATION_CACHE_RECORD_V2_SCHEMA_VERSION = 2;

export const VERIFICATION_CACHE_RECORD_V2_SCHEMA_ID = "VerificationCacheRecordV2";

export const VERIFICATION_GATE_INPUT_DECLARATION_V2_SCHEMA_VERSION = 1;

export const VERIFICATION_GATE_INPUT_DECLARATION_V2_SCHEMA_ID = "VerificationGateInputDeclarationV2";

export const RELEASE_PROOF_METADATA_V2_SCHEMA_VERSION = 1;

export const RELEASE_PROOF_METADATA_V2_SCHEMA_ID = "ReleaseProofMetadataV2";

export const VERIFICATION_CACHE_RECORD_V2_REQUIRED_FIELDS = Object.freeze([
  "schemaVersion",
  "command",
  "args",
  "inputContentHashes",
  "gitHead",
  "scriptHash",
  "dependencyHash",
  "envFingerprint",
  "gateInputDeclaration",
  "invalidationInputs",
  "proofHashes",
  "result",
]);

export const VERIFICATION_CACHE_RECORD_V2_INVALIDATION_FIELDS = Object.freeze([
  "schemaVersion",
  "command",
  "args",
  "inputContentHashes",
  "gitHead",
  "scriptHash",
  "dependencyHash",
  "envFingerprint",
  "gateInputDeclaration",
  "invalidationInputs",
  "proofHashes",
]);

export class VerificationCacheRecordValidationError extends Error {
  constructor(message, issues = []) {
    super(message);
    this.name = "VerificationCacheRecordValidationError";
    this.issues = issues;
  }
}

export function createVerificationCacheRecordV2(record = {}) {
  const normalized = normalizeVerificationCacheRecordV2(record);
  const validation = validateVerificationCacheRecordV2(normalized);
  if (!validation.pass) {
    throw new VerificationCacheRecordValidationError("Invalid VerificationCacheRecordV2", validation.issues);
  }
  return deepFreeze(normalized);
}

export function createVerificationGateInputDeclarationV2(declaration = {}) {
  const normalized = normalizeVerificationGateInputDeclarationV2(declaration);
  const validation = validateVerificationGateInputDeclarationV2(normalized);
  if (!validation.pass) {
    throw new VerificationCacheRecordValidationError("Invalid VerificationGateInputDeclarationV2", validation.issues);
  }
  return deepFreeze(normalized);
}

export function normalizeVerificationCacheRecordV2(record = {}) {
  if (!isPlainObject(record)) return record;
  return {
    schemaVersion: record.schemaVersion,
    command: record.command,
    args: Array.isArray(record.args) ? record.args.slice() : record.args,
    inputContentHashes: sortObject(record.inputContentHashes),
    gitHead: record.gitHead,
    scriptHash: record.scriptHash,
    dependencyHash: record.dependencyHash,
    envFingerprint: record.envFingerprint,
    gateInputDeclaration: normalizeVerificationGateInputDeclarationV2(record.gateInputDeclaration),
    invalidationInputs: sortObject(record.invalidationInputs),
    proofHashes: sortObject(record.proofHashes),
    releaseProof: normalizeReleaseProofMetadataV2(record.releaseProof),
    result: sortObject(record.result),
  };
}

export function normalizeVerificationCacheReuseKeyV2(record = {}) {
  if (!isPlainObject(record)) return record;
  return {
    schemaVersion: record.schemaVersion,
    command: record.command,
    args: Array.isArray(record.args) ? record.args.slice() : record.args,
    inputContentHashes: sortObject(record.inputContentHashes),
    gitHead: record.gitHead,
    scriptHash: record.scriptHash,
    dependencyHash: record.dependencyHash,
    envFingerprint: record.envFingerprint,
    gateInputDeclaration: normalizeVerificationGateInputDeclarationV2(record.gateInputDeclaration),
    invalidationInputs: sortObject(record.invalidationInputs),
    proofHashes: sortObject(record.proofHashes),
  };
}

export function createReleaseProofMetadataV2(metadata = {}) {
  const normalized = normalizeReleaseProofMetadataV2(metadata);
  const validation = validateReleaseProofMetadataV2(normalized);
  if (!validation.pass) {
    throw new VerificationCacheRecordValidationError("Invalid ReleaseProofMetadataV2", validation.issues);
  }
  return deepFreeze(normalized);
}

export function normalizeReleaseProofMetadataV2(metadata = {}) {
  if (metadata === undefined) return metadata;
  if (!isPlainObject(metadata)) return metadata;
  return {
    schemaVersion: metadata.schemaVersion,
    eligible: metadata.eligible,
    status: metadata.status,
    reason: metadata.reason,
    proofMode: metadata.proofMode,
    nonReusable: metadata.nonReusable,
    bypasses: normalizeStringArray(metadata.bypasses),
  };
}

export function normalizeVerificationGateInputDeclarationV2(declaration = {}) {
  if (!isPlainObject(declaration)) return declaration;
  return {
    schemaVersion: declaration.schemaVersion,
    commandName: declaration.commandName,
    fileInputs: normalizeStringArray(declaration.fileInputs),
    environmentInputs: normalizeStringArray(declaration.environmentInputs),
    versionInputs: sortObject(declaration.versionInputs),
    bypassForceInputs: sortObject(declaration.bypassForceInputs),
  };
}

export function validateVerificationCacheRecordV2(record = {}) {
  const issues = [];
  if (!isPlainObject(record)) {
    return {
      pass: false,
      issues: [issue("record", "invalid-record", "VerificationCacheRecordV2 must be an object")],
    };
  }

  for (const field of VERIFICATION_CACHE_RECORD_V2_REQUIRED_FIELDS) {
    if (!Object.hasOwn(record, field)) {
      issues.push(issue(field, "missing-required-field", "VerificationCacheRecordV2 missing required field: " + field));
    }
  }

  if (record.schemaVersion !== VERIFICATION_CACHE_RECORD_V2_SCHEMA_VERSION) {
    issues.push(issue("schemaVersion", "invalid-schema-version", "schemaVersion must be " + VERIFICATION_CACHE_RECORD_V2_SCHEMA_VERSION));
  }
  if (!nonEmptyString(record.command)) issues.push(issue("command", "invalid-command", "command must be a non-empty string"));
  if (!Array.isArray(record.args) || !record.args.every((arg) => typeof arg === "string")) {
    issues.push(issue("args", "invalid-args", "args must be an array of strings"));
  }
  for (const field of ["inputContentHashes", "proofHashes"]) {
    if (!isStringMap(record[field])) issues.push(issue(field, "invalid-hash-map", field + " must be an object with string values"));
  }
  if (!isScalarMap(record.invalidationInputs)) {
    issues.push(issue("invalidationInputs", "invalid-invalidation-inputs", "invalidationInputs must be an object with string, number, or boolean values"));
  }
  for (const field of ["gitHead", "scriptHash", "dependencyHash", "envFingerprint"]) {
    if (!nonEmptyString(record[field])) issues.push(issue(field, "invalid-key-field", field + " must be a non-empty string"));
  }
  const declarationValidation = validateVerificationGateInputDeclarationV2(record.gateInputDeclaration);
  for (const item of declarationValidation.issues) {
    issues.push(issue("gateInputDeclaration." + item.id, item.code, item.message));
  }
  if (Object.hasOwn(record, "releaseProof") && record.releaseProof !== undefined) {
    const releaseProofValidation = validateReleaseProofMetadataV2(record.releaseProof);
    for (const item of releaseProofValidation.issues) {
      issues.push(issue("releaseProof." + item.id, item.code, item.message));
    }
  }
  if (!isPlainObject(record.result)) issues.push(issue("result", "invalid-result", "result must be an object"));

  return {
    pass: issues.length === 0,
    issues,
  };
}

export function validateVerificationGateInputDeclarationV2(declaration = {}) {
  const issues = [];
  if (!isPlainObject(declaration)) {
    return {
      pass: false,
      issues: [issue("record", "invalid-record", "VerificationGateInputDeclarationV2 must be an object")],
    };
  }

  if (declaration.schemaVersion !== VERIFICATION_GATE_INPUT_DECLARATION_V2_SCHEMA_VERSION) {
    issues.push(issue("schemaVersion", "invalid-schema-version", "schemaVersion must be " + VERIFICATION_GATE_INPUT_DECLARATION_V2_SCHEMA_VERSION));
  }
  if (!nonEmptyString(declaration.commandName)) {
    issues.push(issue("commandName", "invalid-command-name", "commandName must be a non-empty string"));
  }
  for (const field of ["fileInputs", "environmentInputs"]) {
    if (!isStringArray(declaration[field])) {
      issues.push(issue(field, "invalid-string-array", field + " must be an array of strings"));
    }
  }
  for (const field of ["versionInputs", "bypassForceInputs"]) {
    if (!isScalarMap(declaration[field])) {
      issues.push(issue(field, "invalid-scalar-map", field + " must be an object with string, number, or boolean values"));
    }
  }

  return {
    pass: issues.length === 0,
    issues,
  };
}

export function validateReleaseProofMetadataV2(metadata = {}) {
  const issues = [];
  if (!isPlainObject(metadata)) {
    return {
      pass: false,
      issues: [issue("record", "invalid-record", "ReleaseProofMetadataV2 must be an object")],
    };
  }

  if (metadata.schemaVersion !== RELEASE_PROOF_METADATA_V2_SCHEMA_VERSION) {
    issues.push(issue("schemaVersion", "invalid-schema-version", "schemaVersion must be " + RELEASE_PROOF_METADATA_V2_SCHEMA_VERSION));
  }
  if (typeof metadata.eligible !== "boolean") issues.push(issue("eligible", "invalid-eligible", "eligible must be a boolean"));
  if (typeof metadata.nonReusable !== "boolean") issues.push(issue("nonReusable", "invalid-non-reusable", "nonReusable must be a boolean"));
  for (const field of ["status", "reason", "proofMode"]) {
    if (!nonEmptyString(metadata[field])) issues.push(issue(field, "invalid-string", field + " must be a non-empty string"));
  }
  if (!isStringArray(metadata.bypasses)) {
    issues.push(issue("bypasses", "invalid-bypasses", "bypasses must be an array of strings"));
  }

  return {
    pass: issues.length === 0,
    issues,
  };
}

export function canReuseVerificationCacheRecordV2(cachedRecord = {}, requestedKey = {}) {
  const cachedValidation = validateVerificationCacheRecordV2(cachedRecord);
  const requestedValidation = validateVerificationCacheReuseKeyV2(requestedKey);
  const issues = [
    ...cachedValidation.issues.map((item) => ({ ...item, source: "cachedRecord" })),
    ...requestedValidation.issues.map((item) => ({ ...item, source: "requestedKey" })),
  ];

  if (cachedValidation.pass && requestedValidation.pass) {
    const releaseProofReuse = canReuseCachedReleaseProofV2(cachedRecord);
    for (const item of releaseProofReuse.issues) {
      issues.push({ ...item, source: "cachedRecord" });
    }
    const cachedKey = buildVerificationCacheReuseKeyV2(cachedRecord);
    const normalizedRequestedKey = normalizeVerificationCacheReuseKeyV2(requestedKey);
    for (const field of VERIFICATION_CACHE_RECORD_V2_INVALIDATION_FIELDS) {
      if (!stableEqual(cachedKey[field], normalizedRequestedKey[field])) {
        issues.push(issue(field, "reuse-key-mismatch", "reuse denied because invalidation input differs: " + field));
      }
    }
  }

  return {
    pass: issues.length === 0,
    reusable: issues.length === 0,
    issues,
  };
}

export function assertReusableVerificationCacheRecordV2(cachedRecord = {}, requestedKey = {}) {
  const reuse = canReuseVerificationCacheRecordV2(cachedRecord, requestedKey);
  if (!reuse.reusable) {
    throw new VerificationCacheRecordValidationError("VerificationCacheRecordV2 reuse denied", reuse.issues);
  }
  return true;
}

export function canReuseCachedReleaseProofV2(cachedRecord = {}) {
  const issues = [];
  const resultStatus = cachedRecord?.result?.status;
  if (resultStatus !== "pass") {
    issues.push(issue("result.status", "release-proof-not-passed", "reuse denied because cached proof is not a passed release proof"));
  }
  if (!isPlainObject(cachedRecord.releaseProof)) {
    issues.push(issue("releaseProof", "release-proof-metadata-missing", "reuse denied because release proof metadata is missing"));
  } else if (!cachedRecord.releaseProof.eligible || cachedRecord.releaseProof.nonReusable) {
    const reason = cachedRecord.releaseProof.reason || "release-proof-bypass";
    issues.push(issue("releaseProof", "release-proof-bypass-not-reusable", "reuse denied because cached proof is not reusable: " + reason));
  }
  if (!hasUsableProofHashes(cachedRecord.proofHashes)) {
    issues.push(issue("proofHashes", "release-proof-hashes-missing", "reuse denied because cached proof hashes are missing or degraded"));
  }
  return {
    pass: issues.length === 0,
    reusable: issues.length === 0,
    issues,
  };
}

export function buildVerificationCacheReuseKeyV2(record = {}) {
  return deepFreeze(normalizeVerificationCacheReuseKeyV2(record));
}

export function stableStringifyVerificationCacheRecordV2(record = {}) {
  return stableStringify(normalizeVerificationCacheRecordV2(record));
}

export const VERIFICATION_CACHE_RECORD_V2_FIXTURES = Object.freeze({
  valid: deepFreeze({
    schemaVersion: VERIFICATION_CACHE_RECORD_V2_SCHEMA_VERSION,
    command: "node",
    args: ["--check", "scripts/lib/supervibe-verification-cache-v2.mjs"],
    inputContentHashes: {
      "scripts/lib/supervibe-verification-cache-v2.mjs": "sha256:source",
    },
    gitHead: "abc123",
    scriptHash: "sha256:script",
    dependencyHash: "sha256:deps",
    envFingerprint: "node-v22.5.0-platform-win32-arch-x64",
    gateInputDeclaration: {
      schemaVersion: VERIFICATION_GATE_INPUT_DECLARATION_V2_SCHEMA_VERSION,
      commandName: "node --check scripts/lib/supervibe-verification-cache-v2.mjs",
      fileInputs: [
        "scripts/lib/supervibe-verification-cache-v2.mjs",
      ],
      environmentInputs: [
        "node",
        "platform",
        "arch",
      ],
      versionInputs: {
        cacheRecordSchemaVersion: VERIFICATION_CACHE_RECORD_V2_SCHEMA_VERSION,
        gateInputDeclarationSchemaVersion: VERIFICATION_GATE_INPUT_DECLARATION_V2_SCHEMA_VERSION,
      },
      bypassForceInputs: {
        cacheEnabled: true,
        clearCache: false,
        fromStart: false,
      },
    },
    invalidationInputs: {
      cachePolicy: "opt-in-resume-only",
      gitDirtyFingerprint: "sha256:worktree",
      scriptName: "check:full",
    },
    proofHashes: {
      stdout: "sha256:stdout",
    },
    releaseProof: {
      schemaVersion: RELEASE_PROOF_METADATA_V2_SCHEMA_VERSION,
      eligible: true,
      status: "eligible",
      reason: "executed-pass",
      proofMode: "executed-gate",
      nonReusable: false,
      bypasses: [],
    },
    result: {
      exitCode: 0,
      status: "pass",
    },
  }),
  dryRunPreview: deepFreeze({
    schemaVersion: VERIFICATION_CACHE_RECORD_V2_SCHEMA_VERSION,
    command: "node",
    args: ["scripts/run-release-check.mjs", "--dry-run", "--cache"],
    inputContentHashes: {
      "scripts/run-release-check.mjs": "sha256:runner",
      "scripts/lib/supervibe-verification-cache-v2.mjs": "sha256:schema",
    },
    gitHead: "abc123",
    scriptHash: "sha256:script",
    dependencyHash: "sha256:deps",
    envFingerprint: "node-v22.5.0-platform-win32-arch-x64",
    gateInputDeclaration: {
      schemaVersion: VERIFICATION_GATE_INPUT_DECLARATION_V2_SCHEMA_VERSION,
      commandName: "node scripts/run-release-check.mjs --dry-run --cache",
      fileInputs: [
        "scripts/lib/supervibe-verification-cache-v2.mjs",
        "scripts/run-release-check.mjs",
      ],
      environmentInputs: [
        "node",
        "platform",
        "arch",
      ],
      versionInputs: {
        cacheRecordSchemaVersion: VERIFICATION_CACHE_RECORD_V2_SCHEMA_VERSION,
        gateInputDeclarationSchemaVersion: VERIFICATION_GATE_INPUT_DECLARATION_V2_SCHEMA_VERSION,
      },
      bypassForceInputs: {
        cacheEnabled: true,
        clearCache: false,
        dryRun: true,
        fromStart: false,
      },
    },
    invalidationInputs: {
      cachePolicy: "opt-in-resume-only",
      gitDirtyFingerprint: "sha256:worktree",
      scriptName: "check:full",
    },
    proofHashes: {
      stdout: "sha256:stdout",
    },
    releaseProof: {
      schemaVersion: RELEASE_PROOF_METADATA_V2_SCHEMA_VERSION,
      eligible: false,
      status: "bypass",
      reason: "dry-run",
      proofMode: "not-executed",
      nonReusable: true,
      bypasses: ["dry-run"],
    },
    result: {
      cacheResult: "not-written",
      exitCode: 0,
      releaseResult: "not-executed",
      status: "dry-run-planned",
    },
  }),
  missingRequiredField: deepFreeze({
    schemaVersion: VERIFICATION_CACHE_RECORD_V2_SCHEMA_VERSION,
    command: "node",
    args: [],
    inputContentHashes: {},
    gitHead: "abc123",
    scriptHash: "sha256:script",
    dependencyHash: "sha256:deps",
    envFingerprint: "node-v22.5.0-platform-win32-arch-x64",
    gateInputDeclaration: {
      schemaVersion: VERIFICATION_GATE_INPUT_DECLARATION_V2_SCHEMA_VERSION,
      commandName: "node",
      fileInputs: [],
      environmentInputs: [],
      versionInputs: {
        cacheRecordSchemaVersion: VERIFICATION_CACHE_RECORD_V2_SCHEMA_VERSION,
      },
      bypassForceInputs: {
        cacheEnabled: true,
      },
    },
    invalidationInputs: {
      cachePolicy: "opt-in-resume-only",
    },
    proofHashes: {},
  }),
  reuseMismatch: deepFreeze({
    schemaVersion: VERIFICATION_CACHE_RECORD_V2_SCHEMA_VERSION,
    command: "node",
    args: ["--check", "scripts/lib/other.mjs"],
    inputContentHashes: {
      "scripts/lib/supervibe-verification-cache-v2.mjs": "sha256:source",
    },
    gitHead: "abc123",
    scriptHash: "sha256:script",
    dependencyHash: "sha256:deps",
    envFingerprint: "node-v22.5.0-platform-win32-arch-x64",
    gateInputDeclaration: {
      schemaVersion: VERIFICATION_GATE_INPUT_DECLARATION_V2_SCHEMA_VERSION,
      commandName: "node --check scripts/lib/other.mjs",
      fileInputs: [
        "scripts/lib/supervibe-verification-cache-v2.mjs",
      ],
      environmentInputs: [
        "node",
        "platform",
        "arch",
      ],
      versionInputs: {
        cacheRecordSchemaVersion: VERIFICATION_CACHE_RECORD_V2_SCHEMA_VERSION,
        gateInputDeclarationSchemaVersion: VERIFICATION_GATE_INPUT_DECLARATION_V2_SCHEMA_VERSION,
      },
      bypassForceInputs: {
        cacheEnabled: true,
        clearCache: false,
        fromStart: false,
      },
    },
    invalidationInputs: {
      cachePolicy: "opt-in-resume-only",
      gitDirtyFingerprint: "sha256:worktree",
      scriptName: "check:full",
    },
    proofHashes: {
      stdout: "sha256:stdout",
    },
    releaseProof: {
      schemaVersion: RELEASE_PROOF_METADATA_V2_SCHEMA_VERSION,
      eligible: true,
      status: "eligible",
      reason: "executed-pass",
      proofMode: "executed-gate",
      nonReusable: false,
      bypasses: [],
    },
    result: {
      exitCode: 0,
      status: "pass",
    },
  }),
});

function validateVerificationCacheReuseKeyV2(record = {}) {
  const issues = [];
  if (!isPlainObject(record)) {
    return {
      pass: false,
      issues: [issue("record", "invalid-record", "VerificationCacheRecordV2 reuse key must be an object")],
    };
  }
  const normalized = normalizeVerificationCacheReuseKeyV2(record);
  for (const field of VERIFICATION_CACHE_RECORD_V2_INVALIDATION_FIELDS) {
    if (!Object.hasOwn(normalized, field)) {
      issues.push(issue(field, "missing-required-field", "VerificationCacheRecordV2 reuse key missing required field: " + field));
    }
  }
  const validation = validateVerificationCacheRecordV2({
    ...normalized,
    result: {},
  });
  for (const item of validation.issues) {
    if (item.id !== "result") issues.push(item);
  }
  return {
    pass: issues.length === 0,
    issues,
  };
}

function stableEqual(left, right) {
  return stableStringify(left) === stableStringify(right);
}

function stableStringify(value) {
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  if (isPlainObject(value)) {
    return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + stableStringify(value[key])).join(",") + "}";
  }
  return JSON.stringify(value);
}

function cloneRecord(value) {
  if (Array.isArray(value)) return value.map(cloneRecord);
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneRecord(item)]));
  }
  return value;
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObject(value[key])]));
  }
  return value;
}

function normalizeStringArray(value) {
  return Array.isArray(value) ? value.slice().sort() : value;
}

function deepFreeze(value) {
  const cloned = cloneRecord(value);
  freezeInPlace(cloned);
  return cloned;
}

function freezeInPlace(value) {
  if (!value || typeof value !== "object") return value;
  Object.freeze(value);
  for (const item of Object.values(value)) freezeInPlace(item);
  return value;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStringMap(value) {
  return isPlainObject(value) && Object.values(value).every((item) => typeof item === "string");
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isScalarMap(value) {
  return isPlainObject(value) && Object.values(value).every((item) => ["boolean", "number", "string"].includes(typeof item));
}

function hasUsableProofHashes(value) {
  return isStringMap(value)
    && Object.keys(value).length > 0
    && Object.values(value).every((item) => item.startsWith("sha256:") && !["sha256:unknown", "sha256:unreadable"].includes(item));
}

function nonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function issue(id, code, message) {
  return { id, code, message };
}
