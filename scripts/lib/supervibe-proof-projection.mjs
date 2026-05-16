export const PROOF_PROJECTION_SCHEMA_VERSION = "ProofProjectionV1";

export const PROOF_PROJECTION_TRUST_STATUS = Object.freeze({
  TRUSTED: "trusted",
  MISSING: "missing",
  UNTRUSTED: "untrusted",
  STALE: "stale",
  SUPERSEDED: "superseded",
  MISSING_PROOF: "missing-proof",
});

export const ARTIFACT_LINK_PROJECTION_KIND = "artifact-link";
export const HOST_INVOCATION_PROJECTION_KIND = "host-invocation";

export const ARTIFACT_LINK_PROJECTION_OUTCOME = Object.freeze({
  TRUSTED: PROOF_PROJECTION_TRUST_STATUS.TRUSTED,
  MISSING: PROOF_PROJECTION_TRUST_STATUS.MISSING,
  UNTRUSTED: PROOF_PROJECTION_TRUST_STATUS.UNTRUSTED,
  STALE: PROOF_PROJECTION_TRUST_STATUS.STALE,
  SUPERSEDED: PROOF_PROJECTION_TRUST_STATUS.SUPERSEDED,
});

export const PROOF_PROJECTION_REQUIRED_FIELDS = Object.freeze([
  "schemaVersion",
  "artifactId",
  "artifactPath",
  "trustStatus",
  "provenance",
]);

export const PROOF_PROJECTION_OPTIONAL_FIELDS = Object.freeze([
  "receiptId",
  "ledgerHash",
  "producer",
  "hostInvocation",
  "evidence",
  "commandEvidence",
  "validatorEvidence",
  "memoryCandidate",
  "indexFreshness",
  "artifactLink",
  "proofStatus",
  "proofBundle",
  "cacheInvalidation",
  "verboseProof",
  "proofCloseRequirement",
  "migration",
  "notes",
]);

export const PROOF_PROJECTION_TRUST_STATUSES = Object.freeze(
  Object.values(PROOF_PROJECTION_TRUST_STATUS),
);

export const INDEX_FRESHNESS_SCHEMA_VERSION = "IndexFreshnessV1";

export const INDEX_FRESHNESS_MODES = Object.freeze([
  "strict",
  "dev",
  "repairable-stale",
  "missing",
]);

export const INDEX_FRESHNESS_WATCHER_STATES = Object.freeze([
  "running",
  "stale",
  "missing",
  "unknown",
]);

export const PROOF_STATUS_RENDERER_SCHEMA_VERSION = "ProofStatusRendererV1";
export const PROOF_BUNDLE_SCHEMA_VERSION = "ProofBundleV1";
export const PROOF_CACHE_INVALIDATION_SCHEMA_VERSION = "ProofCacheInvalidationV1";
export const VERBOSE_PROOF_EXPANSION_SCHEMA_VERSION = "VerboseProofExpansionV1";
export const PROOF_CLOSE_REQUIREMENT_SCHEMA_VERSION = "ProofCloseRequirementV1";

export const NULL_PROVENANCE_INVALID_EXAMPLE = Object.freeze({
  schemaVersion: PROOF_PROJECTION_SCHEMA_VERSION,
  artifactId: "invalid-null-provenance",
  artifactPath: "artifacts/evidence/example.md",
  trustStatus: PROOF_PROJECTION_TRUST_STATUS.UNTRUSTED,
  provenance: null,
});

export const VALID_PROOF_PROJECTION_FIXTURE = Object.freeze({
  schemaVersion: PROOF_PROJECTION_SCHEMA_VERSION,
  artifactId: "valid-runtime-proof",
  artifactPath: "artifacts/evidence/proof-projection-schema.md",
  trustStatus: PROOF_PROJECTION_TRUST_STATUS.TRUSTED,
  provenance: Object.freeze({
    source: "runtime-receipt",
    receiptId: "receipt-valid-runtime-proof",
    reason: "Runtime receipt binds artifact to host invocation.",
  }),
  receiptId: "receipt-valid-runtime-proof",
  producer: Object.freeze({
    type: "worker",
    id: "proof-projection-worker-fixture",
  }),
  hostInvocation: Object.freeze({
    source: "codex-worker",
    invocationId: "proof-projection-worker-fixture",
  }),
  evidence: Object.freeze([
    "node --check scripts/lib/supervibe-proof-projection.mjs",
    "projection validator smoke",
  ]),
});


export const KILL_SWITCH_REGISTRY_PROOF_PROJECTION_FIXTURE = Object.freeze({
  schemaVersion: PROOF_PROJECTION_SCHEMA_VERSION,
  artifactId: "kill-switch-registry-proof",
  artifactPath: "artifacts/evidence/kill-switch-registry.md",
  trustStatus: PROOF_PROJECTION_TRUST_STATUS.TRUSTED,
  provenance: Object.freeze({
    source: "runtime-receipt",
    receiptId: "receipt-kill-switch-registry-fixture",
    reason: "Kill switch registry artifact is bound to the worker implementation evidence.",
  }),
  receiptId: "receipt-kill-switch-registry-fixture",
  producer: Object.freeze({
    type: "worker",
    id: "kill-switch-registry-worker-fixture",
  }),
  hostInvocation: Object.freeze({
    source: "codex-worker",
    invocationId: "kill-switch-registry-worker-fixture",
  }),
  evidence: Object.freeze([
    "node --check scripts/lib/supervibe-work-state.mjs",
    "node --check scripts/lib/supervibe-proof-projection.mjs",
    "kill switch registry smoke",
  ]),
});

export const VALID_RUNTIME_RECEIPT_PROOF_FIXTURE = Object.freeze({
  schemaVersion: PROOF_PROJECTION_SCHEMA_VERSION,
  artifactId: "valid-runtime-receipt-proof",
  artifactPath: "artifacts/evidence/receipt-trust-invariants.md",
  trustStatus: PROOF_PROJECTION_TRUST_STATUS.TRUSTED,
  provenance: Object.freeze({
    source: "runtime-receipt",
    receiptId: "workflow-receipt-trust-invariants-fixture",
    reason: "Runtime receipt has ledger, host invocation, artifact, command, and validator proof.",
  }),
  receiptId: "workflow-receipt-trust-invariants-fixture",
  ledgerHash: "sha256:8a4f8d43c50489f4b38f2e1d3c14fd45f0d55a37e7cb571d2bc6c5938a0f31f8",
  hostInvocation: Object.freeze({
    source: "codex-spawn-agent",
    invocationId: "receipt-trust-invariants-invocation-fixture",
  }),
  evidence: Object.freeze([
    Object.freeze({
      kind: "artifact",
      artifactPath: "artifacts/evidence/receipt-trust-invariants.md",
      receiptId: "workflow-receipt-trust-invariants-fixture",
    }),
  ]),
  commandEvidence: Object.freeze({
    command: "node --check scripts/lib/supervibe-proof-projection.mjs",
    receiptId: "workflow-command-check-fixture",
  }),
  validatorEvidence: Object.freeze({
    validator: "proof-projection-smoke",
    receiptId: "workflow-validator-smoke-fixture",
  }),
});

export const INVALID_RUNTIME_RECEIPT_PROOF_FIXTURE = Object.freeze({
  ...VALID_RUNTIME_RECEIPT_PROOF_FIXTURE,
  artifactId: "invalid-runtime-receipt-proof",
  receiptId: "",
  ledgerHash: "",
  hostInvocation: Object.freeze({
    source: "",
    invocationId: "",
  }),
  commandEvidence: Object.freeze({
    command: "node --check scripts/lib/supervibe-proof-projection.mjs",
  }),
  validatorEvidence: Object.freeze({
    validator: "proof-projection-smoke",
  }),
});

export const MEMORY_AUTONOMY_POLICY_PROOF_FIXTURE = Object.freeze({
  schemaVersion: PROOF_PROJECTION_SCHEMA_VERSION,
  artifactId: "memory-autonomy-policy-proof",
  artifactPath: "artifacts/evidence/memory-autonomy-policy.md",
  trustStatus: PROOF_PROJECTION_TRUST_STATUS.TRUSTED,
  provenance: Object.freeze({
    source: "runtime-receipt",
    receiptId: "receipt-memory-autonomy-policy-fixture",
    reason: "Memory autonomy policy artifact is bound to the worker implementation evidence.",
  }),
  receiptId: "receipt-memory-autonomy-policy-fixture",
  producer: Object.freeze({
    type: "worker",
    id: "memory-autonomy-policy-worker-fixture",
  }),
  hostInvocation: Object.freeze({
    source: "codex-worker",
    invocationId: "memory-autonomy-policy-worker-fixture",
  }),
  evidence: Object.freeze([
    Object.freeze({
      kind: "artifact",
      artifactPath: "artifacts/evidence/memory-autonomy-policy.md",
      receiptId: "receipt-memory-autonomy-policy-fixture",
    }),
  ]),
  commandEvidence: Object.freeze({
    command: "node --check scripts/lib/supervibe-work-state.mjs && node --check scripts/lib/supervibe-proof-projection.mjs",
    receiptId: "receipt-memory-autonomy-policy-fixture-command-check",
  }),
  validatorEvidence: Object.freeze({
    validator: "memory-candidate-smoke",
    receiptId: "receipt-memory-autonomy-policy-fixture-smoke",
  }),
  memoryCandidate: Object.freeze({
    schemaVersion: "MemoryCandidateV1",
    candidateId: "memory-candidate-001",
    evidenceRefs: Object.freeze([
      "artifacts/evidence/memory-autonomy-policy.md",
    ]),
    redactionStatus: "clean",
    dedupeKey: "memory-autonomy:candidate-first-durable-write",
    decisionState: "candidate",
  }),
});
export const VALID_INDEX_FRESHNESS_FIXTURE = Object.freeze({
  schemaVersion: INDEX_FRESHNESS_SCHEMA_VERSION,
  mode: "strict",
  sourceCoverage: Object.freeze({
    status: "complete",
    indexedFiles: 96,
    totalFiles: 96,
    coverageRatio: 1,
  }),
  contentChangedRows: 0,
  staleRows: 0,
  watcherState: "running",
  indexSnapshotId: "snapshot-2026-05-15T00-00-00Z",
  repairCommand: "node scripts/build-code-index.mjs --root . --force --health --no-embeddings",
  structuralClaimAllowed: true,
});

export const STALE_INDEX_FRESHNESS_FIXTURE = Object.freeze({
  schemaVersion: INDEX_FRESHNESS_SCHEMA_VERSION,
  mode: "repairable-stale",
  sourceCoverage: Object.freeze({
    status: "partial",
    indexedFiles: 95,
    totalFiles: 96,
    coverageRatio: 0.9896,
  }),
  contentChangedRows: 1,
  staleRows: 0,
  watcherState: "stale",
  indexSnapshotId: "snapshot-2026-05-15T00-00-00Z",
  repairCommand: "node scripts/build-code-index.mjs --root . --force --health --no-embeddings",
  structuralClaimAllowed: false,
});

export const INVALID_INDEX_FRESHNESS_FIXTURE = Object.freeze({
  schemaVersion: INDEX_FRESHNESS_SCHEMA_VERSION,
  mode: "strict",
  sourceCoverage: Object.freeze({
    status: "complete",
  }),
  contentChangedRows: 2,
  staleRows: 0,
  watcherState: "running",
  indexSnapshotId: "snapshot-invalid",
  repairCommand: "",
  structuralClaimAllowed: true,
});

export const LEGACY_MISSING_PROOF_FIXTURE = Object.freeze({
  artifactId: "legacy-artifact-without-proof",
  artifactPath: "artifacts/evidence/legacy.md",
});

export const MIGRATED_LEGACY_MISSING_PROOF_FIXTURE = Object.freeze(
  migrateLegacyProofProjection(LEGACY_MISSING_PROOF_FIXTURE),
);


export const VALID_ARTIFACT_LINK_PROJECTION_FIXTURE = Object.freeze(
  createArtifactLinkProofProjectionV1({
    artifactId: "valid-artifact-link-proof",
    artifactPath: "artifacts/evidence/artifact-link-projection.md",
    receiptId: "receipt-artifact-link-fixture",
    ledgerHash: "sha256:5c29f22d4f6ed7f17e3f2098a6ed4e45a953a5fd02e0278f441ad06f6b470ad8",
    hostInvocation: Object.freeze({
      source: "codex-spawn-agent",
      invocationId: "artifact-link-projection-invocation-fixture",
    }),
    artifactLink: Object.freeze({
      artifactPath: "artifacts/evidence/artifact-link-projection.md",
      receiptId: "receipt-artifact-link-fixture",
      receiptPath: "artifacts/_workflow-invocations/proof/artifact-link-fixture.json",
      sha256: "sha256:4cf26d091b47eb85e8562f8d3fd50bc963cd29a3fc9026f5eb907e7e0b8a2f1f",
    }),
  }),
);

export const MISSING_ARTIFACT_LINK_PROJECTION_FIXTURE = Object.freeze(
  createArtifactLinkProofProjectionV1({
    artifactId: "missing-artifact-link-proof",
    artifactPath: "artifacts/evidence/missing-artifact-link.md",
    receiptId: "receipt-missing-artifact-link-fixture",
    missing: true,
  }),
);

export const UNTRUSTED_ARTIFACT_LINK_PROJECTION_FIXTURE = Object.freeze(
  createArtifactLinkProofProjectionV1({
    artifactId: "untrusted-artifact-link-proof",
    artifactPath: "artifacts/evidence/untrusted-artifact-link.md",
    receiptId: "receipt-untrusted-artifact-link-fixture",
    artifactLink: Object.freeze({
      artifactPath: "artifacts/evidence/untrusted-artifact-link.md",
      receiptId: "receipt-other-artifact-link-fixture",
      receiptPath: "artifacts/_workflow-invocations/proof/other.json",
      sha256: "sha256:d21f7ae449d5ca8ad228e68b20cf1d8c8464e6198ea0edbc36339fbda5f3be71",
    }),
  }),
);

export const STALE_ARTIFACT_LINK_PROJECTION_FIXTURE = Object.freeze(
  createArtifactLinkProofProjectionV1({
    artifactId: "stale-artifact-link-proof",
    artifactPath: "artifacts/evidence/stale-artifact-link.md",
    receiptId: "receipt-stale-artifact-link-fixture",
    expectedSha256: "sha256:expected",
    artifactLink: Object.freeze({
      artifactPath: "artifacts/evidence/stale-artifact-link.md",
      receiptId: "receipt-stale-artifact-link-fixture",
      receiptPath: "artifacts/_workflow-invocations/proof/stale.json",
      sha256: "sha256:actual",
    }),
  }),
);

export const SUPERSEDED_ARTIFACT_LINK_PROJECTION_FIXTURE = Object.freeze(
  createArtifactLinkProofProjectionV1({
    artifactId: "superseded-artifact-link-proof",
    artifactPath: "artifacts/evidence/superseded-artifact-link.md",
    receiptId: "receipt-superseded-artifact-link-fixture",
    artifactLink: Object.freeze({
      artifactPath: "artifacts/evidence/superseded-artifact-link.md",
      receiptId: "receipt-superseded-artifact-link-fixture",
      receiptPath: "artifacts/_workflow-invocations/proof/superseded.json",
      sha256: "sha256:801bb3b898bb416c8a5c852bbc89ecdb4e349a53438f764390c7ec860d84f4bd",
    }),
    supersededBy: Object.freeze({
      receiptId: "receipt-current-artifact-link-fixture",
      receiptPath: "artifacts/_workflow-invocations/proof/current.json",
    }),
  }),
);


export const VALID_PROOF_CLOSE_REQUIREMENT_FIXTURE = Object.freeze(
  evaluateProofCloseRequirementV1({
    workItemId: "close-ready-proof-fixture",
    projections: [VALID_RUNTIME_RECEIPT_PROOF_FIXTURE, VALID_ARTIFACT_LINK_PROJECTION_FIXTURE],
    proofBundle: exportProofBundleV1([VALID_ARTIFACT_LINK_PROJECTION_FIXTURE], {
      bundleId: "close-ready-proof-bundle-fixture",
      exportedAt: "2026-05-15T00:00:00.000Z",
    }),
  }),
);

export const PROOF_PROJECTION_CONTRACT_FIXTURE_PACK = Object.freeze({
  schemaVersion: "SupervibeProofProjectionContractFixturePackV1",
  exports: [
    "ProofProjectionV1",
    "IndexFreshnessV1",
    "RetrievalEvidenceV1",
    "MigrationRecordV1",
    "ReleaseEvidenceV1",
    "ArtifactLinkProjectionV1",
    "HostInvocationProjectionV1",
    "ProofStatusRendererV1",
    "ProofBundleV1",
    "ProofCacheInvalidationV1",
    "VerboseProofExpansionV1",
    "ProofCloseRequirementV1",
  ],
  ProofProjectionV1: Object.freeze({
    valid: VALID_PROOF_PROJECTION_FIXTURE,
    validRuntimeReceipt: VALID_RUNTIME_RECEIPT_PROOF_FIXTURE,
    invalid: NULL_PROVENANCE_INVALID_EXAMPLE,
    invalidRuntimeReceipt: INVALID_RUNTIME_RECEIPT_PROOF_FIXTURE,
    artifactLink: VALID_ARTIFACT_LINK_PROJECTION_FIXTURE,
  }),
  IndexFreshnessV1: Object.freeze({
    valid: VALID_INDEX_FRESHNESS_FIXTURE,
    stale: STALE_INDEX_FRESHNESS_FIXTURE,
    invalid: INVALID_INDEX_FRESHNESS_FIXTURE,
  }),
  RetrievalEvidenceV1: Object.freeze({
    valid: Object.freeze({
      schemaVersion: "RetrievalEvidenceV1",
      query: "contract fixture pack WorkStateV1 ProofProjectionV1",
      sources: Object.freeze([
        Object.freeze({
          kind: "code-rag",
          path: "scripts/lib/supervibe-work-state.mjs",
          match: "WORK_STATE_V1_FIXTURES",
          freshness: "current-session",
        }),
        Object.freeze({
          kind: "code-rag",
          path: "scripts/lib/supervibe-proof-projection.mjs",
          match: "VALID_PROOF_PROJECTION_FIXTURE",
          freshness: "current-session",
        }),
      ]),
      indexFreshness: VALID_INDEX_FRESHNESS_FIXTURE,
    }),
    invalid: Object.freeze({
      schemaVersion: "RetrievalEvidenceV1",
      query: "",
      sources: Object.freeze([]),
      indexFreshness: INVALID_INDEX_FRESHNESS_FIXTURE,
    }),
  }),
  MigrationRecordV1: Object.freeze({
    valid: Object.freeze({
      schemaVersion: "MigrationRecordV1",
      fromSchema: "legacy-missing-proof",
      toSchema: PROOF_PROJECTION_SCHEMA_VERSION,
      migratedAt: "2026-05-15T00:00:00.000Z",
      sourceArtifactId: LEGACY_MISSING_PROOF_FIXTURE.artifactId,
      resultArtifactId: MIGRATED_LEGACY_MISSING_PROOF_FIXTURE.artifactId,
      behavior: MIGRATED_LEGACY_MISSING_PROOF_FIXTURE.migration.behavior,
    }),
    invalid: Object.freeze({
      schemaVersion: "MigrationRecordV1",
      fromSchema: "",
      toSchema: PROOF_PROJECTION_SCHEMA_VERSION,
      migratedAt: "not-a-date",
      sourceArtifactId: "",
    }),
  }),
  ArtifactLinkProjectionV1: Object.freeze({
    valid: VALID_ARTIFACT_LINK_PROJECTION_FIXTURE,
    missing: MISSING_ARTIFACT_LINK_PROJECTION_FIXTURE,
    untrusted: UNTRUSTED_ARTIFACT_LINK_PROJECTION_FIXTURE,
    stale: STALE_ARTIFACT_LINK_PROJECTION_FIXTURE,
    superseded: SUPERSEDED_ARTIFACT_LINK_PROJECTION_FIXTURE,
  }),
  HostInvocationProjectionV1: Object.freeze({
    valid: createHostInvocationProofProjectionV1({
      artifactId: "valid-host-invocation-proof",
      artifactPath: "artifacts/_agent-outputs/host-invocation-fixture/agent-output.json",
      receiptId: "receipt-host-invocation-fixture",
      ledgerHash: "sha256:3b3fb76d7dc4e2c9954b0ef1c27d7d38ef76a3df82108c2d09369dcba35ae86d",
      hostInvocation: Object.freeze({
        source: "codex-spawn-agent",
        invocationId: "host-invocation-fixture",
        agentId: "host-invocation-agent-fixture",
        traceId: "trace-host-invocation-fixture",
        spanId: "span-host-invocation-fixture",
      }),
      producer: Object.freeze({
        type: "agent",
        id: "host-invocation-agent-fixture",
      }),
    }),
  }),
  ProofStatusRendererV1: Object.freeze({
    valid: renderProofStatusV1([VALID_RUNTIME_RECEIPT_PROOF_FIXTURE, VALID_ARTIFACT_LINK_PROJECTION_FIXTURE]),
    nullProvenanceGuardCode: "null-proof-projection-provenance",
  }),
  ProofCacheInvalidationV1: Object.freeze({
    valid: createProofCacheInvalidationMetadataV1({
      cacheKey: "proof-projection-fixture",
      projections: [VALID_ARTIFACT_LINK_PROJECTION_FIXTURE],
      previousSnapshotId: "snapshot-a",
      currentSnapshotId: "snapshot-b",
      changedPaths: ["artifacts/evidence/artifact-link-projection.md"],
      indexFreshness: STALE_INDEX_FRESHNESS_FIXTURE,
    }),
  }),
  VerboseProofExpansionV1: Object.freeze({
    valid: expandProofProjectionVerboseV1(VALID_ARTIFACT_LINK_PROJECTION_FIXTURE),
  }),
  ProofBundleV1: Object.freeze({
    valid: exportProofBundleV1([VALID_ARTIFACT_LINK_PROJECTION_FIXTURE], {
      bundleId: "proof-bundle-fixture",
      exportedAt: "2026-05-15T00:00:00.000Z",
    }),
  }),
  ProofCloseRequirementV1: Object.freeze({
    valid: VALID_PROOF_CLOSE_REQUIREMENT_FIXTURE,
  }),
  ReleaseEvidenceV1: Object.freeze({
    valid: Object.freeze({
      schemaVersion: "ReleaseEvidenceV1",
      releaseId: "contract-fixture-pack",
      artifactPath: "artifacts/evidence/contract-fixture-pack.md",
      verification: Object.freeze([
        "node --check scripts/lib/supervibe-work-state.mjs",
        "node --check scripts/lib/supervibe-proof-projection.mjs",
        "small module smoke importing aggregate fixture exports",
      ]),
      deferredValidation: Object.freeze([
        "node --test",
        "npm test",
        "npm run check",
        "npm run validate:*",
        "node scripts/validate-*",
      ]),
    }),
    invalid: Object.freeze({
      schemaVersion: "ReleaseEvidenceV1",
      releaseId: "",
      artifactPath: "",
      verification: Object.freeze([]),
      deferredValidation: Object.freeze([]),
    }),
  }),
});

export function validateProofProjectionV1(projection = {}, { allowMigration = false } = {}) {
  const issues = [];
  const label = projection?.artifactId || "proof-projection";

  if (!isPlainObject(projection)) {
    return [issue("invalid-proof-projection", label, "Projection must be an object.")];
  }

  for (const field of PROOF_PROJECTION_REQUIRED_FIELDS) {
    if (!(field in projection)) {
      issues.push(issue("missing-proof-projection-field", label, `Missing required field: ${field}.`));
    }
  }

  if (projection.schemaVersion !== PROOF_PROJECTION_SCHEMA_VERSION) {
    issues.push(issue("invalid-proof-projection-schema", label, `schemaVersion must be ${PROOF_PROJECTION_SCHEMA_VERSION}.`));
  }
  if (!nonEmptyString(projection.artifactId)) {
    issues.push(issue("invalid-proof-projection-artifact-id", label, "artifactId must be a non-empty string."));
  }
  if (!nonEmptyString(projection.artifactPath)) {
    issues.push(issue("invalid-proof-projection-artifact-path", label, "artifactPath must be a non-empty string."));
  }
  if (!PROOF_PROJECTION_TRUST_STATUSES.includes(projection.trustStatus)) {
    issues.push(issue("invalid-proof-projection-trust-status", label, `trustStatus must be one of: ${PROOF_PROJECTION_TRUST_STATUSES.join(", ")}.`));
  }
  if (projection.provenance === null) {
    issues.push(issue("null-proof-projection-provenance", label, "provenance must be an object; null provenance is invalid."));
  } else if (!isPlainObject(projection.provenance)) {
    issues.push(issue("invalid-proof-projection-provenance", label, "provenance must be an object."));
  } else {
    if (!nonEmptyString(projection.provenance.source)) {
      issues.push(issue("missing-proof-projection-provenance-source", label, "provenance.source must be a non-empty string."));
    }
    if (!nonEmptyString(projection.provenance.reason)) {
      issues.push(issue("missing-proof-projection-provenance-reason", label, "provenance.reason must be a non-empty string."));
    }
  }

  if (projection.trustStatus === PROOF_PROJECTION_TRUST_STATUS.TRUSTED) {
    if (!nonEmptyString(projection.receiptId)) {
      issues.push(issue("trusted-proof-projection-missing-receipt", label, "trusted projections must include receiptId."));
    }
    if (!isPlainObject(projection.hostInvocation) || !nonEmptyString(projection.hostInvocation.source) || !nonEmptyString(projection.hostInvocation.invocationId)) {
      issues.push(issue("trusted-proof-projection-missing-host-invocation", label, "trusted projections must include hostInvocation.source and hostInvocation.invocationId."));
    }
  }

  if (!allowMigration && projection.trustStatus === PROOF_PROJECTION_TRUST_STATUS.MISSING_PROOF) {
    const source = projection.provenance?.source;
    if (source !== "legacy-missing-proof") {
      issues.push(issue("missing-proof-projection-unmarked-legacy", label, "missing-proof projections must use provenance.source=legacy-missing-proof."));
    }
  }

  if (projection.indexFreshness !== undefined) {
    issues.push(...validateIndexFreshnessV1(projection.indexFreshness).map((freshnessIssue) => ({
      ...freshnessIssue,
      target: label + "." + freshnessIssue.target,
    })));
  }

  return issues;
}

export function isValidProofProjectionV1(projection = {}, options = {}) {
  return validateProofProjectionV1(projection, options).length === 0;
}

export function createIndexFreshnessV1(input = {}) {
  const record = normalizeIndexFreshnessV1(input);
  const issues = validateIndexFreshnessV1(record);
  if (issues.length) {
    const error = new Error(formatProjectionIssues(issues));
    error.name = "IndexFreshnessValidationError";
    error.issues = issues;
    throw error;
  }
  return record;
}

export function normalizeIndexFreshnessV1(input = {}) {
  const contentChangedRows = toNonNegativeInteger(input.contentChangedRows);
  const staleRows = toNonNegativeInteger(input.staleRows);
  const mode = normalizeToken(input.mode || (contentChangedRows || staleRows ? "repairable-stale" : "strict"));
  const watcherState = normalizeToken(input.watcherState || input.watcher?.state || "unknown");
  return {
    schemaVersion: input.schemaVersion || INDEX_FRESHNESS_SCHEMA_VERSION,
    mode,
    sourceCoverage: normalizeSourceCoverage(input.sourceCoverage || input.coverage),
    contentChangedRows,
    staleRows,
    watcherState,
    indexSnapshotId: String(input.indexSnapshotId || input.snapshotId || "").trim(),
    repairCommand: input.repairCommand === null ? null : String(input.repairCommand || "").trim(),
    structuralClaimAllowed: input.structuralClaimAllowed === undefined
      ? mode === "strict" && contentChangedRows === 0 && staleRows === 0
      : input.structuralClaimAllowed === true,
  };
}

export function validateIndexFreshnessV1(record = {}) {
  const issues = [];
  if (!isPlainObject(record)) return [issue("invalid-index-freshness", "indexFreshness", "IndexFreshnessV1 must be an object.")];

  if (record.schemaVersion !== INDEX_FRESHNESS_SCHEMA_VERSION) {
    issues.push(issue("invalid-index-freshness-schema", "indexFreshness.schemaVersion", "schemaVersion must be " + INDEX_FRESHNESS_SCHEMA_VERSION + "."));
  }
  if (!INDEX_FRESHNESS_MODES.includes(record.mode)) {
    issues.push(issue("invalid-index-freshness-mode", "indexFreshness.mode", "mode must be one of: " + INDEX_FRESHNESS_MODES.join(", ") + "."));
  }
  if (!isValidSourceCoverage(record.sourceCoverage)) {
    issues.push(issue("invalid-index-freshness-source-coverage", "indexFreshness.sourceCoverage", "sourceCoverage must include status plus non-negative indexedFiles and totalFiles."));
  }
  if (!Number.isInteger(record.contentChangedRows) || record.contentChangedRows < 0) {
    issues.push(issue("invalid-index-freshness-content-changed-rows", "indexFreshness.contentChangedRows", "contentChangedRows must be a non-negative integer."));
  }
  if (!Number.isInteger(record.staleRows) || record.staleRows < 0) {
    issues.push(issue("invalid-index-freshness-stale-rows", "indexFreshness.staleRows", "staleRows must be a non-negative integer."));
  }
  if (!INDEX_FRESHNESS_WATCHER_STATES.includes(record.watcherState)) {
    issues.push(issue("invalid-index-freshness-watcher-state", "indexFreshness.watcherState", "watcherState must be one of: " + INDEX_FRESHNESS_WATCHER_STATES.join(", ") + "."));
  }
  if (!nonEmptyString(record.indexSnapshotId)) {
    issues.push(issue("invalid-index-freshness-snapshot", "indexFreshness.indexSnapshotId", "indexSnapshotId must be a non-empty string."));
  }
  if (record.repairCommand !== null && !nonEmptyString(record.repairCommand)) {
    issues.push(issue("invalid-index-freshness-repair-command", "indexFreshness.repairCommand", "repairCommand must be null or a non-empty string."));
  }
  if (typeof record.structuralClaimAllowed !== "boolean") {
    issues.push(issue("invalid-index-freshness-structural-claim", "indexFreshness.structuralClaimAllowed", "structuralClaimAllowed must be a boolean."));
  }
  if (record.structuralClaimAllowed === true && (record.mode !== "strict" || record.contentChangedRows > 0 || record.staleRows > 0)) {
    issues.push(issue("unsafe-index-freshness-structural-claim", "indexFreshness.structuralClaimAllowed", "structural claims require mode=strict with zero changed and stale rows."));
  }

  return issues;
}

export function validateRuntimeReceiptProofProjection(projection = {}, options = {}) {
  const issues = validateProofProjectionV1(projection, options);
  const label = projection?.artifactId || "runtime-receipt-proof";

  if (!isPlainObject(projection)) {
    return issues;
  }

  if (projection.provenance?.source !== "runtime-receipt") {
    issues.push(issue("invalid-runtime-receipt-proof-source", label, "runtime receipt proof must use provenance.source=runtime-receipt."));
  }
  if (!nonEmptyString(projection.receiptId)) {
    issues.push(issue("missing-runtime-receipt-id", label, "runtime receipt proof requires receiptId."));
  }
  if (!nonEmptyString(projection.provenance?.receiptId)) {
    issues.push(issue("missing-runtime-provenance-receipt-id", label, "runtime receipt proof requires provenance.receiptId."));
  } else if (nonEmptyString(projection.receiptId) && projection.provenance.receiptId !== projection.receiptId) {
    issues.push(issue("runtime-receipt-id-mismatch", label, "provenance.receiptId must match receiptId."));
  }
  if (!nonEmptyString(projection.ledgerHash)) {
    issues.push(issue("missing-runtime-ledger-hash", label, "runtime receipt proof requires ledgerHash."));
  }
  if (!isPlainObject(projection.hostInvocation)) {
    issues.push(issue("missing-runtime-host-invocation", label, "runtime receipt proof requires hostInvocation."));
  } else {
    if (!nonEmptyString(projection.hostInvocation.source)) {
      issues.push(issue("missing-runtime-host-invocation-source", label, "runtime receipt proof requires hostInvocation.source."));
    }
    if (!nonEmptyString(projection.hostInvocation.invocationId)) {
      issues.push(issue("missing-runtime-host-invocation-id", label, "runtime receipt proof requires hostInvocation.invocationId."));
    }
  }
  if (!projectionEvidenceBindsArtifact(projection)) {
    issues.push(issue("missing-runtime-artifact-proof", label, "runtime receipt proof requires evidence binding artifactPath to receiptId."));
  }
  if (!nonEmptyString(projection.commandEvidence?.receiptId)) {
    issues.push(issue("missing-command-evidence-receipt-id", label, "command evidence must include receiptId."));
  }
  if (!nonEmptyString(projection.validatorEvidence?.receiptId)) {
    issues.push(issue("missing-validator-evidence-receipt-id", label, "validator evidence must include receiptId."));
  }

  return dedupeIssues(issues);
}

export function isValidRuntimeReceiptProofProjection(projection = {}, options = {}) {
  return validateRuntimeReceiptProofProjection(projection, options).length === 0;
}

export function validateMemoryCandidateProofProjection(projection = {}, options = {}) {
  const issues = validateRuntimeReceiptProofProjection(projection, options);
  const label = projection?.artifactId || "memory-candidate-proof";

  if (!isPlainObject(projection)) return issues;
  if (!isPlainObject(projection.memoryCandidate)) {
    issues.push(issue("missing-memory-candidate-proof", label, "memory candidate proof requires memoryCandidate metadata."));
    return dedupeIssues(issues);
  }

  const candidate = projection.memoryCandidate;
  if (candidate.schemaVersion !== "MemoryCandidateV1") {
    issues.push(issue("invalid-memory-candidate-proof-schema", label, "memoryCandidate.schemaVersion must be MemoryCandidateV1."));
  }
  if (!nonEmptyString(candidate.candidateId)) {
    issues.push(issue("missing-memory-candidate-proof-id", label, "memoryCandidate.candidateId is required."));
  }
  if (!Array.isArray(candidate.evidenceRefs) || !candidate.evidenceRefs.some((ref) => normalizeProofPath(ref) === normalizeProofPath(projection.artifactPath))) {
    issues.push(issue("memory-candidate-proof-evidence-mismatch", label, "memoryCandidate.evidenceRefs must include the projected artifactPath."));
  }
  if (!nonEmptyString(candidate.dedupeKey)) {
    issues.push(issue("missing-memory-candidate-proof-dedupe", label, "memoryCandidate.dedupeKey is required."));
  }

  return dedupeIssues(issues);
}

export function isValidMemoryCandidateProofProjection(projection = {}, options = {}) {
  return validateMemoryCandidateProofProjection(projection, options).length === 0;
}


export function createArtifactLinkProofProjectionV1(input = {}, {
  defaultArtifactId = "artifact-link-proof",
  defaultArtifactPath = "unknown",
} = {}) {
  if (!isPlainObject(input)) {
    throw new TypeError("Artifact link projection input must be an object.");
  }

  const link = normalizeArtifactLinkMetadata(input.artifactLink || input.link || input);
  const artifactPath = normalizeProofPath(input.artifactPath || input.expectedArtifactPath || link.artifactPath || defaultArtifactPath);
  const artifactId = nonEmptyString(input.artifactId) ? input.artifactId : defaultArtifactId;
  const receiptId = firstNonEmptyString(input.receiptId, input.expectedReceiptId, input.receipt?.receiptId, link.receiptId);
  const expectedReceiptId = firstNonEmptyString(input.expectedReceiptId, input.receiptId, input.receipt?.receiptId);
  const expectedSha256 = firstNonEmptyString(input.expectedSha256, input.outputHash?.sha256, input.sha256);
  const driftIssues = normalizeIssueTextList(input.driftIssues || input.issues);
  const supersededBy = compactOptionalObject(input.supersededBy || input.superseded || null);
  const missing = input.missing === true || !nonEmptyString(link.artifactPath);
  const trustPass = input.trust?.pass;

  let outcome = ARTIFACT_LINK_PROJECTION_OUTCOME.TRUSTED;
  let reason = "Artifact link metadata binds the artifact path, receipt id, and content hash without embedding artifact body content.";
  let migration = compactOptionalObject(input.migration || null);

  if (missing) {
    outcome = ARTIFACT_LINK_PROJECTION_OUTCOME.MISSING;
    reason = "Artifact link metadata is missing; projection is not trusted until a manifest link is attached.";
  } else if (nonEmptyString(supersededBy.receiptId || supersededBy.receiptPath)) {
    outcome = ARTIFACT_LINK_PROJECTION_OUTCOME.SUPERSEDED;
    reason = "Artifact link points at proof that has been superseded by a newer receipt.";
  } else if (normalizeProofPath(link.artifactPath) !== artifactPath) {
    outcome = ARTIFACT_LINK_PROJECTION_OUTCOME.UNTRUSTED;
    reason = "Artifact link path does not match the projected artifact path.";
  } else if (expectedReceiptId && link.receiptId && link.receiptId !== expectedReceiptId) {
    outcome = ARTIFACT_LINK_PROJECTION_OUTCOME.UNTRUSTED;
    reason = "Artifact link receipt id does not match the expected runtime receipt.";
  } else if (expectedSha256 && link.sha256 && link.sha256 !== expectedSha256) {
    outcome = ARTIFACT_LINK_PROJECTION_OUTCOME.STALE;
    reason = "Artifact link hash differs from the expected artifact hash.";
  } else if (driftIssues.length > 0) {
    outcome = ARTIFACT_LINK_PROJECTION_OUTCOME.STALE;
    reason = "Artifact link has drift diagnostics and must be refreshed before trusted use.";
  } else if (trustPass === false) {
    outcome = ARTIFACT_LINK_PROJECTION_OUTCOME.UNTRUSTED;
    reason = "Runtime trust validation rejected the receipt behind the artifact link.";
  } else if (!nonEmptyString(link.receiptId) || !nonEmptyString(receiptId)) {
    outcome = ARTIFACT_LINK_PROJECTION_OUTCOME.MISSING;
    reason = "Artifact link lacks receipt-bound proof metadata; projection is preserved for migration.";
    migration = compactOptionalObject({
      ...migration,
      from: migration.from || "legacy-artifact-link",
      behavior: migration.behavior || "preserve artifact path and hash metadata, mark trustStatus=missing, and require receipt-bound relink before trusted use",
    });
  }

  const artifactLink = compactOptionalObject({
    schemaVersion: "ArtifactLinkProjectionV1",
    kind: ARTIFACT_LINK_PROJECTION_KIND,
    outcome,
    artifactPath: link.artifactPath || artifactPath,
    receiptId: link.receiptId || null,
    receiptPath: link.receiptPath || null,
    sha256: link.sha256 || null,
    expectedReceiptId: expectedReceiptId || null,
    expectedSha256: expectedSha256 || null,
    manifestPath: normalizeProofPath(input.artifactLinksPath || input.manifestPath || ""),
    driftIssues,
    supersededBy,
  });

  return compactOptionalObject({
    schemaVersion: PROOF_PROJECTION_SCHEMA_VERSION,
    artifactId,
    artifactPath,
    trustStatus: outcome,
    provenance: compactOptionalObject({
      source: outcome === ARTIFACT_LINK_PROJECTION_OUTCOME.TRUSTED ? "artifact-link-manifest" : "artifact-link-" + outcome,
      receiptId: receiptId || null,
      reason,
    }),
    receiptId: receiptId || null,
    ledgerHash: firstNonEmptyString(input.ledgerHash, input.ledger?.entryHash, input.ledger?.canonicalHash) || null,
    hostInvocation: normalizeHostInvocation(input.hostInvocation || input.receipt?.hostInvocation),
    evidence: missing ? [] : [compactOptionalObject({
      kind: ARTIFACT_LINK_PROJECTION_KIND,
      artifactPath: artifactLink.artifactPath,
      receiptId: artifactLink.receiptId || null,
      receiptPath: artifactLink.receiptPath || null,
      sha256: artifactLink.sha256 || null,
    })],
    artifactLink,
    migration,
  });
}

export function createHostInvocationProofProjectionV1(input = {}, {
  defaultArtifactId = "host-invocation-proof",
  defaultArtifactPath = "unknown",
} = {}) {
  if (!isPlainObject(input)) {
    throw new TypeError("Host invocation projection input must be an object.");
  }

  const hostInvocation = normalizeHostInvocation(input.hostInvocation || input.receipt?.hostInvocation || input.invocation || input.record);
  const artifactPath = normalizeProofPath(input.artifactPath || input.expectedArtifactPath || input.outputArtifact || defaultArtifactPath);
  const artifactId = nonEmptyString(input.artifactId) ? input.artifactId : defaultArtifactId;
  const receiptId = firstNonEmptyString(input.receiptId, input.expectedReceiptId, input.receipt?.receiptId);
  const ledgerHash = firstNonEmptyString(input.ledgerHash, input.ledger?.entryHash, input.receipt?.ledger?.entryHash, input.receipt?.runtime?.canonicalHash);
  const source = hostInvocation?.source || "";
  const invocationId = hostInvocation?.invocationId || "";
  const trusted = source === "codex-spawn-agent" && nonEmptyString(invocationId) && nonEmptyString(receiptId);
  const missing = !nonEmptyString(source) || !nonEmptyString(invocationId);
  const trustStatus = trusted
    ? PROOF_PROJECTION_TRUST_STATUS.TRUSTED
    : missing
      ? PROOF_PROJECTION_TRUST_STATUS.MISSING
      : PROOF_PROJECTION_TRUST_STATUS.UNTRUSTED;
  const reason = trusted
    ? "Runtime host invocation metadata binds a Codex spawned agent id to this proof projection without embedding artifact body content."
    : missing
      ? "Host invocation metadata is missing; projection is not trusted until a spawned-agent invocation id is attached."
      : "Host invocation metadata exists but is not a trusted Codex spawned-agent binding.";

  return compactOptionalObject({
    schemaVersion: PROOF_PROJECTION_SCHEMA_VERSION,
    artifactId,
    artifactPath,
    trustStatus,
    provenance: compactOptionalObject({
      source: HOST_INVOCATION_PROJECTION_KIND,
      receiptId: receiptId || null,
      reason,
    }),
    receiptId: receiptId || null,
    ledgerHash: ledgerHash || null,
    producer: sanitizeProofMetadata(input.producer || null, { includeArtifactBodies: false }),
    hostInvocation,
    evidence: trusted ? [compactOptionalObject({
      kind: HOST_INVOCATION_PROJECTION_KIND,
      artifactPath,
      receiptId,
      source,
      invocationId,
      agentId: hostInvocation.agentId || input.agentId || input.record?.agent_id || null,
      traceId: hostInvocation.traceId || null,
      spanId: hostInvocation.spanId || null,
    })] : [],
    artifactLink: input.artifactLink
      ? sanitizeProofMetadata(normalizeArtifactLinkMetadata(input.artifactLink), { includeArtifactBodies: false })
      : null,
    notes: normalizeIssueTextList(input.notes),
  });
}

export function validateHostInvocationProofProjectionV1(projection = {}, options = {}) {
  const issues = validateProofProjectionV1(projection, { ...options, allowMigration: true });
  const label = projection?.artifactId || "host-invocation-proof";

  if (!isPlainObject(projection)) return dedupeIssues(issues);
  if (projection.provenance?.source !== HOST_INVOCATION_PROJECTION_KIND) {
    issues.push(issue("invalid-host-invocation-proof-source", label, "host invocation proof must use provenance.source=host-invocation."));
  }
  if (projection.trustStatus === PROOF_PROJECTION_TRUST_STATUS.TRUSTED) {
    if (projection.hostInvocation?.source !== "codex-spawn-agent") {
      issues.push(issue("invalid-host-invocation-source", label, "trusted host invocation projections require hostInvocation.source=codex-spawn-agent."));
    }
    if (!projectionEvidenceBindsArtifact(projection)) {
      issues.push(issue("missing-host-invocation-artifact-proof", label, "trusted host invocation projections require evidence binding artifactPath to receiptId."));
    }
  }
  if (hasEmbeddedArtifactBody(projection.hostInvocation) || (Array.isArray(projection.evidence) && projection.evidence.some(hasEmbeddedArtifactBody))) {
    issues.push(issue("host-invocation-embeds-body", label, "host invocation projections must keep compact metadata only and must not embed artifact bodies."));
  }

  return dedupeIssues(issues);
}

export function isValidHostInvocationProofProjectionV1(projection = {}, options = {}) {
  return validateHostInvocationProofProjectionV1(projection, options).length === 0;
}
export function migrateLegacyArtifactLinkProofProjection(input = {}, options = {}) {
  if (!isPlainObject(input)) {
    throw new TypeError("Legacy artifact link projection input must be an object.");
  }
  return createArtifactLinkProofProjectionV1({
    ...input,
    artifactLink: input.artifactLink || input.link || {
      artifactPath: input.artifactPath,
      sha256: input.sha256,
      receiptPath: input.receiptPath,
    },
    migration: {
      ...(isPlainObject(input.migration) ? input.migration : {}),
      from: input.migration?.from || "legacy-artifact-link",
      behavior: input.migration?.behavior || "preserve compact artifact link metadata without reading artifact bodies and require receipt-bound relink before trusted use",
    },
  }, options);
}

export function validateArtifactLinkProofProjectionV1(projection = {}, options = {}) {
  const issues = validateProofProjectionV1(projection, { ...options, allowMigration: true });
  const label = projection?.artifactId || "artifact-link-proof";

  if (!isPlainObject(projection)) return dedupeIssues(issues);
  if (!isPlainObject(projection.artifactLink)) {
    issues.push(issue("missing-artifact-link-projection", label, "artifact link projection requires artifactLink metadata."));
    return dedupeIssues(issues);
  }

  const link = projection.artifactLink;
  if (link.schemaVersion !== "ArtifactLinkProjectionV1") {
    issues.push(issue("invalid-artifact-link-projection-schema", label, "artifactLink.schemaVersion must be ArtifactLinkProjectionV1."));
  }
  if (link.kind !== ARTIFACT_LINK_PROJECTION_KIND) {
    issues.push(issue("invalid-artifact-link-projection-kind", label, "artifactLink.kind must be artifact-link."));
  }
  if (!Object.values(ARTIFACT_LINK_PROJECTION_OUTCOME).includes(link.outcome)) {
    issues.push(issue("invalid-artifact-link-projection-outcome", label, "artifactLink.outcome must be trusted, missing, untrusted, stale, or superseded."));
  }
  if (link.outcome !== projection.trustStatus) {
    issues.push(issue("artifact-link-status-mismatch", label, "artifactLink.outcome must match trustStatus."));
  }
  if (normalizeProofPath(link.artifactPath) !== normalizeProofPath(projection.artifactPath)) {
    issues.push(issue("artifact-link-path-mismatch", label, "artifactLink.artifactPath must match artifactPath."));
  }
  if (hasEmbeddedArtifactBody(link) || (Array.isArray(projection.evidence) && projection.evidence.some(hasEmbeddedArtifactBody))) {
    issues.push(issue("artifact-link-embeds-body", label, "artifact link projections must keep compact metadata only and must not embed artifact bodies."));
  }

  if (projection.trustStatus === ARTIFACT_LINK_PROJECTION_OUTCOME.TRUSTED) {
    if (!nonEmptyString(link.receiptId) || link.receiptId !== projection.receiptId) {
      issues.push(issue("trusted-artifact-link-receipt-mismatch", label, "trusted artifact links must include receiptId matching projection.receiptId."));
    }
    if (!nonEmptyString(link.receiptPath)) {
      issues.push(issue("trusted-artifact-link-missing-receipt-path", label, "trusted artifact links must include receiptPath."));
    }
    if (!nonEmptyString(link.sha256)) {
      issues.push(issue("trusted-artifact-link-missing-hash", label, "trusted artifact links must include sha256."));
    }
  }

  if (projection.trustStatus === ARTIFACT_LINK_PROJECTION_OUTCOME.MISSING && !isPlainObject(projection.migration) && !/missing/.test(String(projection.provenance?.source || ""))) {
    issues.push(issue("missing-artifact-link-without-migration", label, "missing artifact links need missing provenance or migration metadata."));
  }

  return dedupeIssues(issues);
}

export function isValidArtifactLinkProofProjectionV1(projection = {}, options = {}) {
  return validateArtifactLinkProofProjectionV1(projection, options).length === 0;
}


export function assertNoNullProvenanceProofProjectionV1(projectionOrList = {}, { label = "proof-projection" } = {}) {
  const projections = normalizeProjectionList(projectionOrList);
  const offenders = projections
    .map((projection, index) => ({ projection, index }))
    .filter(({ projection }) => isPlainObject(projection) && projection.provenance === null)
    .map(({ projection, index }) => projection.artifactId || projection.artifactPath || label + "[" + index + "]");

  if (offenders.length > 0) {
    const error = new Error("Null provenance is forbidden for ProofProjectionV1: " + offenders.join(", "));
    error.name = "NullProvenanceProofProjectionError";
    error.code = "null-proof-projection-provenance";
    error.offenders = offenders;
    throw error;
  }

  return true;
}

export function renderProofStatusV1(projectionOrList = [], {
  hardGuard = true,
  includeIssues = true,
  includeArtifactLink = true,
} = {}) {
  if (hardGuard) assertNoNullProvenanceProofProjectionV1(projectionOrList, { label: "proof-status" });
  const projections = normalizeProjectionList(projectionOrList);
  const items = projections.map((projection, index) => {
    const issues = validateProjectedProofByKind(projection);
    const trustStatus = projection?.trustStatus || PROOF_PROJECTION_TRUST_STATUS.MISSING_PROOF;
    const artifactLink = includeArtifactLink && isPlainObject(projection?.artifactLink)
      ? sanitizeProofMetadata(projection.artifactLink)
      : null;
    return compactOptionalObject({
      index,
      artifactId: projection?.artifactId || "unknown",
      artifactPath: normalizeProofPath(projection?.artifactPath || ""),
      trustStatus,
      status: issues.length === 0 && trustStatus === PROOF_PROJECTION_TRUST_STATUS.TRUSTED ? "pass" : "attention",
      receiptId: projection?.receiptId || null,
      ledgerHash: projection?.ledgerHash || null,
      provenanceSource: projection?.provenance?.source || null,
      hostInvocation: sanitizeProofMetadata(projection?.hostInvocation || null),
      artifactLink,
      issueCount: issues.length,
      issues: includeIssues ? issues : null,
    });
  });
  const counts = countProofStatuses(items);

  return compactOptionalObject({
    schemaVersion: PROOF_STATUS_RENDERER_SCHEMA_VERSION,
    projectionSchemaVersion: PROOF_PROJECTION_SCHEMA_VERSION,
    total: items.length,
    pass: items.length > 0 && items.every((item) => item.status === "pass"),
    counts,
    items,
  });
}

export function exportProofBundleV1(projectionOrList = [], {
  bundleId = "proof-bundle",
  exportedAt = new Date().toISOString(),
  includeArtifactBodies = false,
  artifactBodies = {},
  cacheInvalidation = null,
} = {}) {
  assertNoNullProvenanceProofProjectionV1(projectionOrList, { label: bundleId });
  const projections = normalizeProjectionList(projectionOrList);
  const proofStatus = renderProofStatusV1(projections, { hardGuard: false, includeIssues: true });
  const records = projections.map((projection) => expandProofProjectionVerboseV1(projection, {
    includeArtifactBodies,
    artifactBody: artifactBodies?.[projection?.artifactPath] ?? artifactBodies?.[normalizeProofPath(projection?.artifactPath || "")],
  }));

  return compactOptionalObject({
    schemaVersion: PROOF_BUNDLE_SCHEMA_VERSION,
    projectionSchemaVersion: PROOF_PROJECTION_SCHEMA_VERSION,
    bundleId,
    exportedAt,
    compactByDefault: includeArtifactBodies !== true,
    artifactBodiesIncluded: includeArtifactBodies === true,
    proofStatus,
    cacheInvalidation: cacheInvalidation ? sanitizeProofMetadata(cacheInvalidation, { includeArtifactBodies: false }) : null,
    records,
  });
}


export function evaluateProofCloseRequirementV1(input = {}, {
  label = "work-item",
  requireRuntimeReceipt = true,
  requireArtifactLink = true,
  requireProofBundle = false,
  requireMetadataOnly = true,
} = {}) {
  const source = isPlainObject(input) ? input : { projections: input };
  const workItemId = firstNonEmptyString(source.workItemId, source.itemId, source.id, label);
  const projections = normalizeProjectionList(source.projections ?? source.projection ?? []);
  const proofBundle = isPlainObject(source.proofBundle || source.bundle) ? source.proofBundle || source.bundle : null;
  const suppliedProofStatus = isPlainObject(source.proofStatus || proofBundle?.proofStatus) ? source.proofStatus || proofBundle.proofStatus : null;
  const issues = [];

  if (requireProofBundle && !proofBundle) {
    issues.push(issue("missing-close-proof-bundle", workItemId, "Closing requires a compact proof bundle."));
  }

  const nullProvenancePaths = findNullProvenancePaths(source);
  for (const path of nullProvenancePaths) {
    issues.push(issue("null-close-proof-provenance", path, "Closing proof cannot contain null provenance."));
  }

  if (projections.length === 0 && !suppliedProofStatus && !proofBundle) {
    issues.push(issue("missing-close-proof", workItemId, "Closing requires proof projection, status, or bundle metadata."));
  }

  if (projections.length > 0) {
    for (const projectionIssue of projections.flatMap((projection) => validateProjectedProofByKind(projection))) {
      issues.push(issue(projectionIssue.code, workItemId + "." + projectionIssue.target, projectionIssue.message));
    }
  }

  if (proofBundle) {
    for (const bundleIssue of validateProofBundleV1(proofBundle)) {
      issues.push(issue(bundleIssue.code, workItemId + "." + bundleIssue.target, bundleIssue.message));
    }
  }

  const renderedProofStatus = suppliedProofStatus || (projections.length > 0
    ? renderProofStatusV1(projections, { hardGuard: false, includeIssues: true })
    : null);
  const statusItems = Array.isArray(renderedProofStatus?.items) ? renderedProofStatus.items : [];

  if (!renderedProofStatus || renderedProofStatus.schemaVersion !== PROOF_STATUS_RENDERER_SCHEMA_VERSION) {
    issues.push(issue("missing-close-proof-status", workItemId, "Closing requires rendered proof status metadata."));
  } else if (renderedProofStatus.pass !== true) {
    issues.push(issue("close-proof-status-not-passing", workItemId, "Rendered proof status must pass before closing."));
  }

  if (statusItems.length === 0 && projections.length === 0) {
    issues.push(issue("empty-close-proof-status", workItemId, "Closing proof status must include at least one proof item."));
  }

  const nonTrustedStatusItems = statusItems.filter((item) => item?.status !== "pass" || item?.trustStatus !== PROOF_PROJECTION_TRUST_STATUS.TRUSTED);
  if (nonTrustedStatusItems.length > 0) {
    issues.push(issue("untrusted-close-proof-status", workItemId, "Every close proof status item must pass with trusted status."));
  }

  const runtimeReceiptTrusted = projections.some(isTrustedRuntimeReceiptProjection)
    || statusItems.some(isTrustedRuntimeReceiptStatusItem);
  const artifactLinkTrusted = projections.some(isTrustedArtifactLinkProjection)
    || statusItems.some(hasTrustedArtifactLinkMetadata)
    || (Array.isArray(proofBundle?.records) && proofBundle.records.some(hasTrustedArtifactLinkMetadata));
  const metadataOnly = requireMetadataOnly !== true
    || (proofBundle?.artifactBodiesIncluded !== true && !hasEmbeddedArtifactBody({ projections, proofBundle }));

  if (requireRuntimeReceipt && !runtimeReceiptTrusted) {
    issues.push(issue("missing-close-runtime-receipt", workItemId, "Closing requires trusted runtime receipt proof."));
  }
  if (requireArtifactLink && !artifactLinkTrusted) {
    issues.push(issue("missing-close-artifact-link", workItemId, "Closing requires trusted artifact link proof."));
  }
  if (!metadataOnly) {
    issues.push(issue("close-proof-not-metadata-only", workItemId, "Closing proof defaults to compact metadata and must not embed artifact bodies."));
  }

  const dedupedIssues = dedupeIssues(issues);
  return compactOptionalObject({
    schemaVersion: PROOF_CLOSE_REQUIREMENT_SCHEMA_VERSION,
    workItemId,
    closeAllowed: dedupedIssues.length === 0,
    metadataOnlyDefault: true,
    requirements: {
      runtimeReceipt: requireRuntimeReceipt === true,
      artifactLink: requireArtifactLink === true,
      proofBundle: requireProofBundle === true,
      metadataOnly: requireMetadataOnly === true,
      noNullProvenance: true,
    },
    checks: {
      proofStatusPass: renderedProofStatus?.pass === true,
      runtimeReceiptTrusted,
      artifactLinkTrusted,
      metadataOnly,
      noNullProvenance: nullProvenancePaths.length === 0,
      proofBundleValid: proofBundle ? validateProofBundleV1(proofBundle).length === 0 : requireProofBundle !== true,
    },
    proofStatus: renderedProofStatus ? sanitizeProofMetadata(renderedProofStatus, { includeArtifactBodies: false }) : null,
    issues: dedupedIssues,
  });
}

export function createProofCacheInvalidationMetadataV1({
  cacheKey = "proof-projection",
  projections = [],
  watchedFiles = [],
  changedPaths = [],
  previousSnapshotId = "",
  currentSnapshotId = "",
  indexFreshness = null,
  reason = "",
} = {}) {
  const projectionList = normalizeProjectionList(projections);
  const explicitWatchedFiles = normalizeStringList(watchedFiles);
  const normalizedWatchedFiles = explicitWatchedFiles.length ? explicitWatchedFiles : normalizeStringList(projectionList.map((item) => item?.artifactPath));
  const normalizedChangedPaths = normalizeStringList(changedPaths);
  const freshness = indexFreshness ? normalizeIndexFreshnessV1(indexFreshness) : null;
  const freshnessIssues = freshness ? validateIndexFreshnessV1(freshness) : [];
  const invalidationReasons = normalizeIssueTextList([
    reason,
    previousSnapshotId && currentSnapshotId && previousSnapshotId !== currentSnapshotId ? "snapshot-changed" : "",
    normalizedChangedPaths.length > 0 ? "watched-path-changed" : "",
    freshness && (freshness.contentChangedRows > 0 || freshness.staleRows > 0 || freshness.mode !== "strict") ? "index-not-strict" : "",
    freshnessIssues.length > 0 ? "index-freshness-invalid" : "",
  ]);

  return compactOptionalObject({
    schemaVersion: PROOF_CACHE_INVALIDATION_SCHEMA_VERSION,
    cacheKey,
    projectionSchemaVersion: PROOF_PROJECTION_SCHEMA_VERSION,
    previousSnapshotId: previousSnapshotId || null,
    currentSnapshotId: currentSnapshotId || null,
    invalidated: invalidationReasons.length > 0,
    reasons: invalidationReasons,
    watchedFiles: normalizedWatchedFiles,
    changedPaths: normalizedChangedPaths,
    indexFreshness: freshness,
    issues: freshnessIssues,
  });
}

export function expandProofProjectionVerboseV1(projection = {}, {
  includeArtifactBodies = false,
  artifactBody = null,
} = {}) {
  assertNoNullProvenanceProofProjectionV1(projection);
  const issues = validateProjectedProofByKind(projection);
  const body = includeArtifactBodies === true && artifactBody !== null && artifactBody !== undefined
    ? String(artifactBody)
    : null;

  return compactOptionalObject({
    schemaVersion: VERBOSE_PROOF_EXPANSION_SCHEMA_VERSION,
    projectionSchemaVersion: PROOF_PROJECTION_SCHEMA_VERSION,
    artifactId: projection?.artifactId || "unknown",
    artifactPath: normalizeProofPath(projection?.artifactPath || ""),
    trustStatus: projection?.trustStatus || PROOF_PROJECTION_TRUST_STATUS.MISSING_PROOF,
    compactByDefault: includeArtifactBodies !== true,
    artifactBodyIncluded: Boolean(body),
    receiptId: projection?.receiptId || null,
    ledgerHash: projection?.ledgerHash || null,
    provenance: sanitizeProofMetadata(projection?.provenance || null),
    producer: sanitizeProofMetadata(projection?.producer || null),
    hostInvocation: sanitizeProofMetadata(projection?.hostInvocation || null),
    evidence: normalizeVerboseEvidence(projection?.evidence || []),
    commandEvidence: sanitizeProofMetadata(projection?.commandEvidence || null),
    validatorEvidence: sanitizeProofMetadata(projection?.validatorEvidence || null),
    memoryCandidate: sanitizeProofMetadata(projection?.memoryCandidate || null),
    indexFreshness: sanitizeProofMetadata(projection?.indexFreshness || null),
    artifactLink: sanitizeProofMetadata(projection?.artifactLink || null),
    migration: sanitizeProofMetadata(projection?.migration || null),
    validation: {
      pass: issues.length === 0,
      issueCount: issues.length,
      issues,
    },
    artifactBody: body,
  });
}

export function validateProofBundleV1(bundle = {}) {
  const issues = [];
  if (!isPlainObject(bundle)) return [issue("invalid-proof-bundle", "proofBundle", "ProofBundleV1 must be an object.")];
  if (bundle.schemaVersion !== PROOF_BUNDLE_SCHEMA_VERSION) {
    issues.push(issue("invalid-proof-bundle-schema", "proofBundle.schemaVersion", "schemaVersion must be " + PROOF_BUNDLE_SCHEMA_VERSION + "."));
  }
  if (!nonEmptyString(bundle.bundleId)) {
    issues.push(issue("invalid-proof-bundle-id", "proofBundle.bundleId", "bundleId must be a non-empty string."));
  }
  if (bundle.artifactBodiesIncluded !== true && hasEmbeddedArtifactBody(bundle)) {
    issues.push(issue("proof-bundle-embeds-body", "proofBundle", "proof bundles must not embed artifact bodies unless artifactBodiesIncluded=true."));
  }
  if (!isPlainObject(bundle.proofStatus) || bundle.proofStatus.schemaVersion !== PROOF_STATUS_RENDERER_SCHEMA_VERSION) {
    issues.push(issue("missing-proof-bundle-status", "proofBundle.proofStatus", "proof bundle requires rendered proof status metadata."));
  }
  if (!Array.isArray(bundle.records)) {
    issues.push(issue("missing-proof-bundle-records", "proofBundle.records", "proof bundle requires records array."));
  }
  return dedupeIssues(issues);
}

export function migrateLegacyProofProjection(input = {}, {
  defaultArtifactId = "legacy-missing-proof",
  defaultArtifactPath = "unknown",
} = {}) {
  if (!isPlainObject(input)) {
    throw new TypeError("Legacy proof projection input must be an object.");
  }

  const artifactId = nonEmptyString(input.artifactId) ? input.artifactId : defaultArtifactId;
  const artifactPath = nonEmptyString(input.artifactPath) ? input.artifactPath : defaultArtifactPath;
  return {
    ...input,
    schemaVersion: PROOF_PROJECTION_SCHEMA_VERSION,
    artifactId,
    artifactPath,
    trustStatus: PROOF_PROJECTION_TRUST_STATUS.MISSING_PROOF,
    provenance: {
      source: "legacy-missing-proof",
      reason: "Legacy artifact did not carry runtime proof; projection is preserved as untrusted until a receipt-bound proof is attached.",
    },
    migration: {
      from: "legacy-missing-proof",
      behavior: "preserve artifact identity, mark trustStatus=missing-proof, and require future runtime receipt binding before trusted use",
    },
  };
}

export function projectionSchemaSummary() {
  return {
    schemaVersion: PROOF_PROJECTION_SCHEMA_VERSION,
    requiredFields: [...PROOF_PROJECTION_REQUIRED_FIELDS],
    optionalFields: [...PROOF_PROJECTION_OPTIONAL_FIELDS],
    trustStatus: [...PROOF_PROJECTION_TRUST_STATUSES],
    indexFreshness: {
      schemaVersion: INDEX_FRESHNESS_SCHEMA_VERSION,
      modes: [...INDEX_FRESHNESS_MODES],
      watcherStates: [...INDEX_FRESHNESS_WATCHER_STATES],
    },
    artifactLink: {
      schemaVersion: "ArtifactLinkProjectionV1",
      kind: ARTIFACT_LINK_PROJECTION_KIND,
      outcomes: Object.values(ARTIFACT_LINK_PROJECTION_OUTCOME),
    },
    proofStatus: {
      schemaVersion: PROOF_STATUS_RENDERER_SCHEMA_VERSION,
    },
    proofBundle: {
      schemaVersion: PROOF_BUNDLE_SCHEMA_VERSION,
      compactByDefault: true,
    },
    cacheInvalidation: {
      schemaVersion: PROOF_CACHE_INVALIDATION_SCHEMA_VERSION,
    },
    verboseProof: {
      schemaVersion: VERBOSE_PROOF_EXPANSION_SCHEMA_VERSION,
      compactByDefault: true,
    },
    proofCloseRequirement: {
      schemaVersion: PROOF_CLOSE_REQUIREMENT_SCHEMA_VERSION,
      metadataOnlyDefault: true,
    },
  };
}

export function formatProjectionIssues(issues = []) {
  if (!issues.length) return "Projection validation passed.";
  return issues.map((item) => item.code + ":" + item.target + " " + item.message).join("; ");
}



function normalizeProjectionList(value = []) {
  if (Array.isArray(value)) return value;
  return [value];
}

function validateProjectedProofByKind(projection = {}) {
  if (!isPlainObject(projection)) return validateProofProjectionV1(projection);
  if (projection.provenance?.source === HOST_INVOCATION_PROJECTION_KIND) {
    return validateHostInvocationProofProjectionV1(projection);
  }
  if (isPlainObject(projection.artifactLink)) {
    return validateArtifactLinkProofProjectionV1(projection);
  }
  if (projection.provenance?.source === "runtime-receipt") {
    return validateRuntimeReceiptProofProjection(projection);
  }
  return validateProofProjectionV1(projection, { allowMigration: true });
}

function countProofStatuses(items = []) {
  const counts = {
    pass: 0,
    attention: 0,
    trusted: 0,
    missing: 0,
    untrusted: 0,
    stale: 0,
    superseded: 0,
    missingProof: 0,
  };
  for (const item of items) {
    if (item.status === "pass") counts.pass += 1;
    else counts.attention += 1;
    if (item.trustStatus === PROOF_PROJECTION_TRUST_STATUS.TRUSTED) counts.trusted += 1;
    else if (item.trustStatus === PROOF_PROJECTION_TRUST_STATUS.MISSING) counts.missing += 1;
    else if (item.trustStatus === PROOF_PROJECTION_TRUST_STATUS.UNTRUSTED) counts.untrusted += 1;
    else if (item.trustStatus === PROOF_PROJECTION_TRUST_STATUS.STALE) counts.stale += 1;
    else if (item.trustStatus === PROOF_PROJECTION_TRUST_STATUS.SUPERSEDED) counts.superseded += 1;
    else if (item.trustStatus === PROOF_PROJECTION_TRUST_STATUS.MISSING_PROOF) counts.missingProof += 1;
  }
  return counts;
}

function normalizeVerboseEvidence(value = []) {
  const list = Array.isArray(value) ? value : [value];
  return list.map((entry) => {
    if (typeof entry === "string") {
      return compactOptionalObject({ kind: "reference", value: entry });
    }
    if (!isPlainObject(entry)) return null;
    return sanitizeProofMetadata(entry, { includeArtifactBodies: false });
  }).filter(Boolean);
}

function sanitizeProofMetadata(value, { includeArtifactBodies = false } = {}) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeProofMetadata(item, { includeArtifactBodies })).filter((item) => item !== undefined);
  }
  if (!isPlainObject(value)) return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (!includeArtifactBodies && isArtifactBodyKey(key)) continue;
    const sanitized = sanitizeProofMetadata(item, { includeArtifactBodies });
    if (sanitized === undefined || sanitized === null) continue;
    if (typeof sanitized === "string" && sanitized.trim() === "") continue;
    if (Array.isArray(sanitized) && sanitized.length === 0) continue;
    if (isPlainObject(sanitized) && Object.keys(sanitized).length === 0) continue;
    out[key] = sanitized;
  }
  return out;
}

function normalizeStringList(value = []) {
  const list = Array.isArray(value) ? value : [value];
  return [...new Set(list.map((item) => normalizeProofPath(String(item || ""))).filter(Boolean))];
}

function isArtifactBodyKey(key = "") {
  return ["body", "content", "text", "markdown", "artifactBody", "outputBody"].includes(key);
}

function projectionEvidenceBindsArtifact(projection = {}) {
  const expectedArtifactPath = normalizeProofPath(projection.artifactPath);
  const expectedReceiptId = projection.receiptId;
  if (!expectedArtifactPath || !nonEmptyString(expectedReceiptId)) return false;
  const evidence = Array.isArray(projection.evidence) ? projection.evidence : [];
  return evidence.some((entry) => {
    if (typeof entry === "string") return normalizeProofPath(entry) === expectedArtifactPath;
    if (!isPlainObject(entry)) return false;
    return normalizeProofPath(entry.artifactPath || entry.path) === expectedArtifactPath
      && entry.receiptId === expectedReceiptId;
  });
}


function isTrustedRuntimeReceiptProjection(projection = {}) {
  return isPlainObject(projection)
    && projection.trustStatus === PROOF_PROJECTION_TRUST_STATUS.TRUSTED
    && projection.provenance?.source === "runtime-receipt"
    && validateRuntimeReceiptProofProjection(projection).length === 0;
}

function isTrustedArtifactLinkProjection(projection = {}) {
  return isPlainObject(projection)
    && projection.trustStatus === PROOF_PROJECTION_TRUST_STATUS.TRUSTED
    && isPlainObject(projection.artifactLink)
    && validateArtifactLinkProofProjectionV1(projection).length === 0;
}

function isTrustedRuntimeReceiptStatusItem(item = {}) {
  return isPlainObject(item)
    && item.status === "pass"
    && item.trustStatus === PROOF_PROJECTION_TRUST_STATUS.TRUSTED
    && item.provenanceSource === "runtime-receipt"
    && nonEmptyString(item.receiptId)
    && nonEmptyString(item.ledgerHash)
    && nonEmptyString(item.hostInvocation?.source)
    && nonEmptyString(item.hostInvocation?.invocationId);
}

function hasTrustedArtifactLinkMetadata(value = {}) {
  if (!isPlainObject(value)) return false;
  const link = isPlainObject(value.artifactLink) ? value.artifactLink : value;
  return link.outcome === ARTIFACT_LINK_PROJECTION_OUTCOME.TRUSTED
    && nonEmptyString(link.receiptId)
    && nonEmptyString(link.receiptPath)
    && nonEmptyString(link.sha256);
}

function findNullProvenancePaths(value, path = "proofCloseRequirement") {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findNullProvenancePaths(item, path + "[" + index + "]"));
  }
  if (!isPlainObject(value)) return [];
  const paths = [];
  for (const [key, item] of Object.entries(value)) {
    const childPath = path + "." + key;
    if (key === "provenance" && item === null) paths.push(childPath);
    else paths.push(...findNullProvenancePaths(item, childPath));
  }
  return paths;
}

function dedupeIssues(issues = []) {
  const seen = new Set();
  return issues.filter((item) => {
    const key = `${item.code}\0${item.target}\0${item.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function issue(code, target, message) {
  return { code, target, message };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}


function normalizeArtifactLinkMetadata(value = {}) {
  if (!isPlainObject(value)) return {};
  return compactOptionalObject({
    artifactPath: normalizeProofPath(value.artifactPath || value.path || ""),
    receiptId: firstNonEmptyString(value.receiptId, value.receipt?.receiptId) || null,
    receiptPath: normalizeProofPath(value.receiptPath || value.receipt?.path || ""),
    sha256: firstNonEmptyString(value.sha256, value.hash, value.outputHash?.sha256) || null,
    workItemBinding: isPlainObject(value.workItemBinding) ? value.workItemBinding : null,
  });
}

function normalizeHostInvocation(value = {}) {
  if (!isPlainObject(value)) return null;
  return compactOptionalObject({
    source: firstNonEmptyString(value.source, value.hostInvocationSource, value.host_invocation_source) || null,
    invocationId: firstNonEmptyString(value.invocationId, value.hostInvocationId, value.host_invocation_id, value.invocation_id, value.id) || null,
    agentId: firstNonEmptyString(value.agentId, value.agent_id) || null,
    traceId: firstNonEmptyString(value.traceId, value.trace_id) || null,
    spanId: firstNonEmptyString(value.spanId, value.span_id) || null,
    evidencePath: normalizeProofPath(firstNonEmptyString(value.evidencePath, value.evidence_path, value.structured_output?.json)) || null,
  });
}

function normalizeIssueTextList(value = []) {
  const list = Array.isArray(value) ? value : [value];
  return list.map((item) => String(item || "").trim()).filter(Boolean);
}

function hasEmbeddedArtifactBody(value = {}) {
  if (Array.isArray(value)) return value.some((item) => hasEmbeddedArtifactBody(item));
  if (!isPlainObject(value)) return false;
  return Object.entries(value).some(([key, item]) => isArtifactBodyKey(key) || hasEmbeddedArtifactBody(item));
}

function compactOptionalObject(value) {
  if (!isPlainObject(value)) return {};
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === null || item === undefined) continue;
    if (typeof item === "string" && item.trim() === "") continue;
    if (Array.isArray(item) && item.length === 0) continue;
    if (isPlainObject(item)) {
      const compact = compactOptionalObject(item);
      if (Object.keys(compact).length === 0) continue;
      out[key] = compact;
      continue;
    }
    out[key] = item;
  }
  return out;
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    if (nonEmptyString(value)) return value.trim();
  }
  return "";
}

function normalizeSourceCoverage(value = {}) {
  const indexedFiles = toNonNegativeInteger(value.indexedFiles ?? value.indexed ?? value.coveredFiles);
  const totalFiles = toNonNegativeInteger(value.totalFiles ?? value.total ?? value.discoveredFiles);
  const coverageRatio = value.coverageRatio === undefined && totalFiles > 0
    ? Number((indexedFiles / totalFiles).toFixed(4))
    : Number(value.coverageRatio ?? 0);
  return {
    status: String(value.status || "unknown").trim(),
    indexedFiles,
    totalFiles,
    coverageRatio,
  };
}

function isValidSourceCoverage(value) {
  return isPlainObject(value)
    && nonEmptyString(value.status)
    && Number.isInteger(value.indexedFiles)
    && value.indexedFiles >= 0
    && Number.isInteger(value.totalFiles)
    && value.totalFiles >= 0
    && value.indexedFiles <= value.totalFiles
    && typeof value.coverageRatio === "number"
    && Number.isFinite(value.coverageRatio)
    && value.coverageRatio >= 0
    && value.coverageRatio <= 1;
}

function toNonNegativeInteger(value) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0) return -1;
  return Math.trunc(number);
}

function normalizeToken(value) {
  return String(value || "").trim().toLowerCase().replace(/_/g, "-");
}

function normalizeProofPath(value) {
  return nonEmptyString(value) ? value.replace(/\\/g, "/").replace(/^\.\//, "") : "";
}
