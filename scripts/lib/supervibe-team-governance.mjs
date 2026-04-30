export const ROLE_NAMES = Object.freeze([
  "owner",
  "maintainer",
  "contributor",
  "reviewer",
  "worker",
  "CI",
  "read-only observer",
]);

const ROLE_DEFAULTS = Object.freeze({
  owner: {
    storageLocation: ".claude/memory/work-items",
    allowedSync: ["local-write", "metadata-branch", "federated-bundle"],
    reviewRequired: false,
    metadataVisibility: "full",
    mutation: "local-write",
  },
  maintainer: {
    storageLocation: ".claude/memory/work-items",
    allowedSync: ["local-write", "metadata-branch", "federated-bundle"],
    reviewRequired: false,
    metadataVisibility: "full",
    mutation: "local-write",
  },
  contributor: {
    storageLocation: ".claude/memory/work-items",
    allowedSync: ["metadata-branch", "federated-bundle", "local-preview"],
    reviewRequired: true,
    metadataVisibility: "limited",
    mutation: "review-gated-local-write",
  },
  reviewer: {
    storageLocation: ".claude/memory/work-items",
    allowedSync: ["review-notes", "federated-bundle"],
    reviewRequired: false,
    metadataVisibility: "review",
    mutation: "review-notes-only",
  },
  worker: {
    storageLocation: ".claude/memory/work-items",
    allowedSync: ["local-write", "local-preview"],
    reviewRequired: true,
    metadataVisibility: "limited",
    mutation: "local-write",
  },
  CI: {
    storageLocation: ".claude/memory/ci-artifacts",
    allowedSync: ["read-only-status", "local-artifact-output"],
    reviewRequired: false,
    metadataVisibility: "minimal",
    mutation: "artifact-output-only",
  },
  "read-only observer": {
    storageLocation: ".claude/memory/work-items",
    allowedSync: ["read-only-status"],
    reviewRequired: true,
    metadataVisibility: "minimal",
    mutation: "none",
  },
});

export function resolveTeamGovernance({
  role = "maintainer",
  branch = "",
  protectedBranches = ["main", "master"],
  explicitStorageLocation = null,
} = {}) {
  const normalizedRole = normalizeRole(role);
  const defaults = ROLE_DEFAULTS[normalizedRole];
  const protectedBranch = protectedBranches.includes(branch);
  const requiresMetadataBranch = protectedBranch && ["contributor", "worker", "reviewer"].includes(normalizedRole);
  return {
    role: normalizedRole,
    branch: branch || null,
    storage: {
      location: explicitStorageLocation || defaults.storageLocation,
      safeSyncAction: defaults.allowedSync[0],
      defaultStorageLocation: defaults.storageLocation,
    },
    branchPolicy: {
      protected: protectedBranch,
      protectedBranches,
      directWritesAllowed: ["owner", "maintainer"].includes(normalizedRole) && !["none", "artifact-output-only"].includes(defaults.mutation),
      requiresMetadataBranch,
      reason: protectedBranch ? "protected branch policy applies" : "feature branch policy applies",
    },
    allowedSync: defaults.allowedSync,
    review: {
      required: defaults.reviewRequired || requiresMetadataBranch,
      reason: defaults.reviewRequired || requiresMetadataBranch ? "role requires review before mutation or sync" : "role can proceed with local evidence",
    },
    metadataVisibility: defaults.metadataVisibility,
    mutation: defaults.mutation,
    orchestration: {
      canOwnWorkerAssignment: ["owner", "maintainer", "worker"].includes(normalizedRole),
      canReviewAssignment: ["owner", "maintainer", "reviewer"].includes(normalizedRole),
      requiresIndependentReviewer: ["contributor", "worker", "CI"].includes(normalizedRole),
      waveVisibility: defaults.metadataVisibility === "full" ? "full" : defaults.metadataVisibility === "minimal" ? "summary" : "limited",
    },
  };
}

export function evaluateGovernedAction({
  role = "maintainer",
  branch = "",
  action = "status",
  target = "",
  noTty = false,
  protectedBranches = ["main", "master"],
} = {}) {
  const governance = resolveTeamGovernance({ role, branch, protectedBranches });
  const mutationRequested = /write|mutate|delete|create|sync|push|commit/i.test(action);
  if (governance.mutation === "none" && mutationRequested) {
    return decision(false, governance, `${governance.role} is read-only for ${action}`, noTty);
  }
  if (governance.branchPolicy.protected && mutationRequested && !governance.branchPolicy.directWritesAllowed) {
    return decision(false, governance, `protected branch ${branch || "unknown"} requires metadata branch or maintainer review`, noTty);
  }
  if (governance.mutation === "artifact-output-only" && mutationRequested && !isArtifactTarget(target)) {
    return decision(false, governance, `${governance.role} can write only local artifacts`, noTty);
  }
  return decision(true, governance, "action is allowed by role governance", noTty);
}

export function formatGovernanceStatus(governanceOrInput = {}) {
  const governance = governanceOrInput.storage ? governanceOrInput : resolveTeamGovernance(governanceOrInput);
  return [
    "SUPERVIBE_TEAM_GOVERNANCE",
    `ROLE: ${governance.role}`,
    `BRANCH: ${governance.branch || "unknown"}`,
    `PROTECTED_BRANCH: ${governance.branchPolicy.protected}`,
    `STORAGE: ${governance.storage.location}`,
    `SAFE_SYNC: ${governance.storage.safeSyncAction}`,
    `ALLOWED_SYNC: ${governance.allowedSync.join(",") || "none"}`,
    `REVIEW_REQUIRED: ${governance.review.required}`,
    `WAVE_VISIBILITY: ${governance.orchestration?.waveVisibility || "summary"}`,
    `METADATA_VISIBILITY: ${governance.metadataVisibility}`,
    `MUTATION: ${governance.mutation}`,
    `REASON: ${governance.review.reason}`,
  ].join("\n");
}

function normalizeRole(role = "maintainer") {
  const text = String(role || "maintainer").trim();
  const exact = ROLE_NAMES.find((candidate) => candidate === text);
  if (exact) return exact;
  const lower = text.toLowerCase().replace(/_/g, "-");
  return ROLE_NAMES.find((candidate) => candidate.toLowerCase() === lower || candidate.toLowerCase().replace(/\s+/g, "-") === lower) || "maintainer";
}

function decision(allowed, governance, reason, noTty) {
  return {
    allowed,
    status: allowed ? "governance_allowed" : "governance_blocked",
    role: governance.role,
    reason,
    governance,
    promptEmitted: noTty ? false : !allowed && governance.review.required,
    nextAction: allowed ? "continue within role policy" : governance.allowedSync[0] || "request maintainer review",
  };
}

function isArtifactTarget(target = "") {
  const value = String(target || "").replace(/\\/g, "/");
  return value.startsWith(".claude/memory/") || value.startsWith("docs/audits/");
}
