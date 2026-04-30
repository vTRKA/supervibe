import { access, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export const BUILT_IN_POLICY_PROFILE_NAMES = Object.freeze([
  "solo-local",
  "guided",
  "contributor",
  "maintainer",
  "CI-readonly",
  "CI-verify",
  "release-prep",
  "enterprise-restricted",
]);

const SECRET_FIELD_PATTERN = /(?:api[_-]?key|token|secret|password|passwd|credential|private[_-]?key)/i;
const SECRET_VALUE_PATTERN = /\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|(?:api[_-]?key|token|secret|password|passwd)\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{8,}|-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----)/i;

const DEFAULT_PROFILE_PATHS = Object.freeze([
  ".supervibe/policy-profile.json",
  ".supervibe/policy.json",
  ".claude/memory/policy/profile.json",
  "supervibe.policy.json",
]);

const BUILT_IN_POLICY_PROFILES = Object.freeze({
  "solo-local": makeProfile({
    name: "solo-local",
    role: "owner",
    allowedTools: ["read", "local-write", "tests", "git-status", "worktree"],
    deniedTools: ["provider-permission-bypass", "raw-secret-storage", "production-deploy", "credential-mutation", "billing", "dns"],
    networkPolicy: { mode: "ask", allowlist: [] },
    mcpPolicy: { mode: "ask", servers: [] },
    writePolicy: { mode: "local-only", allowedRoots: ["."], outputDirectory: ".claude/memory" },
    gitPolicy: { protectedBranches: ["main", "master"], commits: "manual", pushes: "deny" },
    worktreePolicy: { mode: "optional", defaultRoot: ".worktrees", cleanup: "review-required" },
    approvalLeaseDurationMinutes: 60,
    maxRuntimeMinutes: 180,
    maxSpendHint: "local-only",
    reviewRequirements: ["independent-review-for-high-risk"],
    evidenceRequirements: ["tests-or-explicit-gap", "side-effect-ledger"],
  }),
  guided: makeProfile({
    name: "guided",
    role: "worker",
    allowedTools: ["read", "local-write", "tests", "git-status"],
    deniedTools: ["provider-permission-bypass", "raw-secret-storage", "remote-mutation", "production-deploy", "credential-mutation", "billing", "dns"],
    networkPolicy: { mode: "ask", allowlist: [] },
    mcpPolicy: { mode: "ask", servers: [] },
    writePolicy: { mode: "local-only", allowedRoots: ["."], outputDirectory: ".claude/memory" },
    gitPolicy: { protectedBranches: ["main", "master"], commits: "manual", pushes: "deny" },
    worktreePolicy: { mode: "recommended", defaultRoot: ".worktrees", cleanup: "review-required" },
    approvalLeaseDurationMinutes: 30,
    maxRuntimeMinutes: 120,
    maxSpendHint: "bounded-local",
    reviewRequirements: ["review-before-commit", "approval-for-high-risk"],
    evidenceRequirements: ["focused-tests", "policy-audit", "final-report"],
  }),
  contributor: makeProfile({
    name: "contributor",
    role: "contributor",
    allowedTools: ["read", "local-write", "tests", "git-status", "metadata-branch"],
    deniedTools: ["provider-permission-bypass", "raw-secret-storage", "remote-mutation", "production-deploy", "credential-mutation", "billing", "dns", "direct-main-write"],
    networkPolicy: { mode: "ask", allowlist: [] },
    mcpPolicy: { mode: "ask", servers: [] },
    writePolicy: { mode: "local-only", allowedRoots: ["."], outputDirectory: ".claude/memory" },
    gitPolicy: { protectedBranches: ["main", "master"], commits: "manual", pushes: "metadata-branch-only" },
    worktreePolicy: { mode: "required", defaultRoot: ".worktrees", cleanup: "review-required" },
    approvalLeaseDurationMinutes: 30,
    maxRuntimeMinutes: 120,
    maxSpendHint: "bounded-local",
    reviewRequirements: ["maintainer-review", "no-direct-protected-branch-write"],
    evidenceRequirements: ["focused-tests", "review-notes", "side-effect-ledger"],
  }),
  maintainer: makeProfile({
    name: "maintainer",
    role: "maintainer",
    allowedTools: ["read", "local-write", "tests", "git-status", "metadata-branch", "release-audit"],
    deniedTools: ["provider-permission-bypass", "raw-secret-storage", "production-deploy", "credential-mutation", "billing", "dns"],
    networkPolicy: { mode: "ask", allowlist: [] },
    mcpPolicy: { mode: "ask", servers: [] },
    writePolicy: { mode: "local-only", allowedRoots: ["."], outputDirectory: ".claude/memory" },
    gitPolicy: { protectedBranches: ["main", "master"], commits: "manual", pushes: "manual-only" },
    worktreePolicy: { mode: "recommended", defaultRoot: ".worktrees", cleanup: "review-required" },
    approvalLeaseDurationMinutes: 45,
    maxRuntimeMinutes: 180,
    maxSpendHint: "bounded-local",
    reviewRequirements: ["independent-review-for-release-or-security"],
    evidenceRequirements: ["npm-run-check", "release-security-audit", "side-effect-ledger"],
  }),
  "CI-readonly": makeProfile({
    name: "CI-readonly",
    role: "CI",
    allowedTools: ["read", "status", "lint", "replay-eval", "docs-validation", "release-security-audit"],
    deniedTools: ["provider-permission-bypass", "raw-secret-storage", "local-write", "remote-mutation", "network", "mcp-write", "production-deploy", "credential-mutation", "billing", "dns"],
    networkPolicy: { mode: "deny", allowlist: [] },
    mcpPolicy: { mode: "deny", servers: [] },
    writePolicy: { mode: "read-only", allowedRoots: [], outputDirectory: null },
    gitPolicy: { protectedBranches: ["main", "master"], commits: "deny", pushes: "deny" },
    worktreePolicy: { mode: "deny", defaultRoot: null, cleanup: "none" },
    approvalLeaseDurationMinutes: 0,
    maxRuntimeMinutes: 30,
    maxSpendHint: "zero-provider-spend",
    reviewRequirements: ["none"],
    evidenceRequirements: ["read-only-status", "replay-eval-report"],
    noTty: true,
  }),
  "CI-verify": makeProfile({
    name: "CI-verify",
    role: "CI",
    allowedTools: ["read", "status", "lint", "tests", "replay-eval", "docs-validation", "release-security-audit", "local-artifact-write"],
    deniedTools: ["provider-permission-bypass", "raw-secret-storage", "remote-mutation", "network", "mcp-write", "production-deploy", "credential-mutation", "billing", "dns"],
    networkPolicy: { mode: "deny", allowlist: [] },
    mcpPolicy: { mode: "deny", servers: [] },
    writePolicy: { mode: "artifact-output-only", allowedRoots: [".claude/memory", "docs/audits"], outputDirectory: ".claude/memory/ci-artifacts" },
    gitPolicy: { protectedBranches: ["main", "master"], commits: "deny", pushes: "deny" },
    worktreePolicy: { mode: "deny", defaultRoot: null, cleanup: "none" },
    approvalLeaseDurationMinutes: 0,
    maxRuntimeMinutes: 45,
    maxSpendHint: "zero-provider-spend",
    reviewRequirements: ["none"],
    evidenceRequirements: ["test-output", "audit-report"],
    noTty: true,
  }),
  "release-prep": makeProfile({
    name: "release-prep",
    role: "maintainer",
    allowedTools: ["read", "local-write", "tests", "git-status", "release-audit", "package-audit"],
    deniedTools: ["provider-permission-bypass", "raw-secret-storage", "production-deploy", "credential-mutation", "billing", "dns", "remote-mutation"],
    networkPolicy: { mode: "ask", allowlist: [] },
    mcpPolicy: { mode: "ask", servers: [] },
    writePolicy: { mode: "local-only", allowedRoots: ["."], outputDirectory: "docs/audits" },
    gitPolicy: { protectedBranches: ["main", "master"], commits: "manual", pushes: "deny" },
    worktreePolicy: { mode: "recommended", defaultRoot: ".worktrees", cleanup: "review-required" },
    approvalLeaseDurationMinutes: 45,
    maxRuntimeMinutes: 120,
    maxSpendHint: "bounded-local",
    reviewRequirements: ["release-review", "security-review"],
    evidenceRequirements: ["npm-run-check", "release-security-audit", "install-integrity-audit"],
  }),
  "enterprise-restricted": makeProfile({
    name: "enterprise-restricted",
    role: "read-only observer",
    allowedTools: ["read", "status", "docs-validation"],
    deniedTools: ["provider-permission-bypass", "raw-secret-storage", "local-write", "remote-mutation", "network", "mcp-write", "production-deploy", "credential-mutation", "billing", "dns", "shell:unsafe"],
    networkPolicy: { mode: "deny", allowlist: [] },
    mcpPolicy: { mode: "deny", servers: [] },
    writePolicy: { mode: "read-only", allowedRoots: [], outputDirectory: null },
    gitPolicy: { protectedBranches: ["main", "master"], commits: "deny", pushes: "deny" },
    worktreePolicy: { mode: "deny", defaultRoot: null, cleanup: "none" },
    approvalLeaseDurationMinutes: 0,
    maxRuntimeMinutes: 30,
    maxSpendHint: "zero-provider-spend",
    reviewRequirements: ["owner-approval-for-any-mutation"],
    evidenceRequirements: ["read-only-status"],
    noTty: true,
  }),
});

export async function loadPolicyProfile({
  rootDir = process.cwd(),
  profileName = "guided",
  filePath = null,
  managedPolicy = {},
} = {}) {
  const requestedName = normalizeProfileName(profileName);
  const explicitPath = filePath ? resolve(rootDir, filePath) : null;
  const localPath = explicitPath || await firstExistingPolicyPath(rootDir);
  const localProfile = localPath ? await readJsonOrNull(localPath) : null;
  const baseName = normalizeProfileName(localProfile?.extends || localProfile?.base || localProfile?.name || requestedName);
  const base = BUILT_IN_POLICY_PROFILES[baseName] || BUILT_IN_POLICY_PROFILES[requestedName] || BUILT_IN_POLICY_PROFILES.guided;
  const merged = localProfile
    ? mergePolicyProfiles(base, { ...localProfile, name: localProfile.name || base.name }, { managedPolicy })
    : mergePolicyProfiles(base, {}, { managedPolicy });
  const validation = validatePolicyProfile(merged, { managedPolicy });
  return {
    ...merged,
    source: localPath ? "local" : "built-in",
    sourcePath: localPath,
    validation: {
      valid: validation.valid && merged.validation.valid,
      issues: [...(merged.validation.issues || []), ...validation.issues],
    },
  };
}

export function validatePolicyProfile(profile = {}, { managedPolicy = {} } = {}) {
  const issues = [];
  const required = [
    "name",
    "allowedTools",
    "deniedTools",
    "networkPolicy",
    "mcpPolicy",
    "writePolicy",
    "gitPolicy",
    "worktreePolicy",
    "approvalLeaseDurationMinutes",
    "maxRuntimeMinutes",
    "maxSpendHint",
    "reviewRequirements",
    "evidenceRequirements",
  ];
  for (const field of required) {
    if (profile[field] === undefined || profile[field] === null || profile[field] === "") {
      issues.push({ code: "missing_field", field, severity: "error" });
    }
  }
  for (const field of collectFieldPaths(profile)) {
    if (SECRET_FIELD_PATTERN.test(field.path)) {
      issues.push({ code: "secret_field_forbidden", field: field.path, severity: "error" });
    }
    if (typeof field.value === "string" && SECRET_VALUE_PATTERN.test(field.value)) {
      issues.push({ code: "raw_secret_value", field: field.path, severity: "error" });
    }
  }
  const denied = new Set([...asArray(profile.deniedTools), ...asArray(managedPolicy.deny)]);
  for (const tool of asArray(profile.allowedTools)) {
    if (denied.has(tool)) {
      issues.push({ code: "deny_precedence", tool, severity: "error" });
    }
  }
  if (profile.allowDangerousProviderFlags === true && !profile.reviewedOverrideAllowed) {
    issues.push({ code: "dangerous_override_requires_review", field: "allowDangerousProviderFlags", severity: "error" });
  }
  return {
    valid: issues.filter((issue) => issue.severity !== "warning").length === 0,
    issues,
  };
}

function mergePolicyProfiles(baseProfile = {}, overrideProfile = {}, { managedPolicy = {} } = {}) {
  const base = clone(baseProfile);
  const override = clone(overrideProfile);
  const validationIssues = [];
  const denied = unique([
    ...asArray(base.deniedTools),
    ...asArray(override.deniedTools),
    ...asArray(managedPolicy.deny),
  ]);
  const requestedAllowed = unique([
    ...asArray(base.allowedTools),
    ...asArray(override.allowedTools),
  ]);
  const allowed = requestedAllowed.filter((tool) => !denied.includes(tool));
  for (const removed of requestedAllowed.filter((tool) => denied.includes(tool))) {
    validationIssues.push({ code: "deny_precedence", tool: removed, severity: "error" });
  }

  return makeProfile({
    ...base,
    ...override,
    name: override.name || base.name,
    role: override.role || base.role,
    allowedTools: allowed,
    deniedTools: denied,
    networkPolicy: { ...(base.networkPolicy || {}), ...(override.networkPolicy || {}) },
    mcpPolicy: { ...(base.mcpPolicy || {}), ...(override.mcpPolicy || {}) },
    writePolicy: { ...(base.writePolicy || {}), ...(override.writePolicy || {}) },
    gitPolicy: { ...(base.gitPolicy || {}), ...(override.gitPolicy || {}) },
    worktreePolicy: { ...(base.worktreePolicy || {}), ...(override.worktreePolicy || {}) },
    reviewRequirements: unique([...asArray(base.reviewRequirements), ...asArray(override.reviewRequirements)]),
    evidenceRequirements: unique([...asArray(base.evidenceRequirements), ...asArray(override.evidenceRequirements)]),
    validation: {
      valid: validationIssues.length === 0,
      issues: validationIssues,
    },
  });
}

export function applyPolicyProfileToProviderInput(input = {}) {
  const policyProfile = normalizeRuntimePolicyProfile(input.policyProfile);
  return {
    ...input,
    policyProfile,
    toolRules: {
      ...(input.toolRules || {}),
      allow: unique([...asArray(input.toolRules?.allow), ...asArray(policyProfile.allowedTools)]),
      deny: unique([...asArray(input.toolRules?.deny), ...asArray(policyProfile.deniedTools)]),
    },
    projectPolicy: {
      ...(input.projectPolicy || {}),
      allow: unique([...asArray(input.projectPolicy?.allow), ...asArray(policyProfile.allowedTools)]),
      deny: unique([...asArray(input.projectPolicy?.deny), ...asArray(policyProfile.deniedTools)]),
    },
  };
}

export function evaluatePolicyProfileBoundary(input = {}) {
  const profile = normalizeRuntimePolicyProfile(input.policyProfile);
  if (!profile?.name) {
    return {
      pass: true,
      status: "policy_profile_not_configured",
      blockers: [],
      warnings: [],
      remediation: [],
      approvedToolClasses: [],
      deniedToolClasses: [],
      promptRequiredToolClasses: [],
    };
  }

  const blockers = [];
  const warnings = [];
  const remediation = [];
  const writePaths = asArray(input.writePaths);
  const writeMode = profile.writePolicy?.mode || "local-only";
  const networkRequested = Boolean(input.network?.requested || input.network?.externalWebAccess || input.network?.fetch || input.network?.targets?.length);
  const mcpRequested = Boolean(input.mcp?.requested || input.mcp?.servers?.length || input.mcp?.write || input.mcp?.mutation);

  if (writePaths.length > 0 && writeMode === "read-only") {
    blockers.push(makeBlocker("policy_profile_write_blocked", `${profile.name} profile is read-only`, { paths: writePaths }));
    remediation.push("switch to CI-verify with an output directory or request a scoped approval receipt");
  }
  if (writePaths.length > 0 && writeMode === "artifact-output-only" && !writePaths.every((path) => pathWithinAllowedRoots(path, profile.writePolicy.allowedRoots))) {
    blockers.push(makeBlocker("policy_profile_write_scope_blocked", `${profile.name} can write only configured local artifact outputs`, { paths: writePaths }));
    remediation.push(`write only under ${asArray(profile.writePolicy.allowedRoots).join(", ") || profile.writePolicy.outputDirectory}`);
  }
  if (input.remoteMutation && (profile.deniedTools || []).includes("remote-mutation")) {
    blockers.push(makeBlocker("policy_profile_remote_mutation_blocked", `${profile.name} denies remote mutation`));
    remediation.push("use a maintainer profile plus an exact approval receipt for the remote target");
  }
  if (networkRequested && profile.networkPolicy?.mode === "deny") {
    blockers.push(makeBlocker("policy_profile_network_blocked", `${profile.name} denies network access`, { targets: asArray(input.network?.targets) }));
    remediation.push("use a profile with an explicit network allowlist and approval receipt");
  }
  if (mcpRequested && profile.mcpPolicy?.mode === "deny") {
    blockers.push(makeBlocker("policy_profile_mcp_blocked", `${profile.name} denies MCP access`, { servers: asArray(input.mcp?.servers) }));
    remediation.push("use a profile with an explicit MCP allowlist and approval receipt");
  }
  if (input.nonInteractive && (profile.approvalLeaseDurationMinutes || 0) === 0) {
    warnings.push("no interactive approval prompts are emitted for this policy profile");
  }

  return {
    pass: blockers.length === 0,
    status: blockers[0]?.status || "policy_profile_passed",
    profileName: profile.name,
    role: profile.role,
    blockers,
    warnings,
    remediation: unique(remediation),
    approvedToolClasses: asArray(profile.allowedTools),
    deniedToolClasses: asArray(profile.deniedTools),
    promptRequiredToolClasses: profile.noTty ? [] : profile.networkPolicy?.mode === "ask" || profile.mcpPolicy?.mode === "ask" ? ["policy-approval"] : [],
  };
}

export function formatPolicyProfileSummary(profile = {}) {
  const validation = profile.validation || validatePolicyProfile(profile);
  return [
    "SUPERVIBE_POLICY_PROFILE",
    `PROFILE: ${profile.name || "unknown"}`,
    `ROLE: ${profile.role || "unknown"}`,
    `SOURCE: ${profile.source || "built-in"}`,
    `VALID: ${validation.valid}`,
    `ALLOWED_TOOLS: ${asArray(profile.allowedTools).join(",") || "none"}`,
    `DENIED_TOOLS: ${asArray(profile.deniedTools).join(",") || "none"}`,
    `NETWORK: ${profile.networkPolicy?.mode || "unknown"}`,
    `MCP: ${profile.mcpPolicy?.mode || "unknown"}`,
    `WRITE: ${profile.writePolicy?.mode || "unknown"}`,
    `GIT: commits=${profile.gitPolicy?.commits || "unknown"} pushes=${profile.gitPolicy?.pushes || "unknown"}`,
    `WORKTREE: ${profile.worktreePolicy?.mode || "unknown"}`,
    `MAX_RUNTIME_MINUTES: ${profile.maxRuntimeMinutes ?? "unknown"}`,
    `APPROVAL_LEASE_MINUTES: ${profile.approvalLeaseDurationMinutes ?? "unknown"}`,
    `ISSUES: ${(validation.issues || []).map((issue) => issue.code).join(",") || "none"}`,
  ].join("\n");
}

function normalizeRuntimePolicyProfile(profile = {}) {
  if (!profile) return {};
  if (typeof profile === "string") return clone(BUILT_IN_POLICY_PROFILES[normalizeProfileName(profile)] || BUILT_IN_POLICY_PROFILES.guided);
  const name = normalizeProfileName(profile.name || profile.profile || "guided");
  const base = BUILT_IN_POLICY_PROFILES[name] || {};
  return mergePolicyProfiles(base, profile, { managedPolicy: {} });
}

function makeProfile(fields = {}) {
  return {
    schemaVersion: 1,
    allowDangerousProviderFlags: false,
    reviewedOverrideAllowed: false,
    validation: { valid: true, issues: [] },
    ...fields,
  };
}

async function firstExistingPolicyPath(rootDir) {
  for (const relative of DEFAULT_PROFILE_PATHS) {
    const candidate = join(rootDir, relative);
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Continue through known project-local policy locations.
    }
  }
  return null;
}

async function readJsonOrNull(path) {
  if (!path) return null;
  const content = await readFile(path, "utf8");
  return JSON.parse(content);
}

function normalizeProfileName(name = "guided") {
  const text = String(name || "guided").trim();
  const exact = BUILT_IN_POLICY_PROFILE_NAMES.find((candidate) => candidate === text);
  if (exact) return exact;
  const lower = text.toLowerCase();
  return BUILT_IN_POLICY_PROFILE_NAMES.find((candidate) => candidate.toLowerCase() === lower) || "guided";
}

function collectFieldPaths(value, prefix = "") {
  const fields = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => fields.push(...collectFieldPaths(item, `${prefix}[${index}]`)));
    return fields;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      const next = prefix ? `${prefix}.${key}` : key;
      fields.push({ path: next, value: child });
      fields.push(...collectFieldPaths(child, next));
    }
  }
  return fields;
}

function pathWithinAllowedRoots(path, roots = []) {
  const normalized = String(path || "").replace(/\\/g, "/").replace(/^\.\//, "");
  return asArray(roots).some((root) => {
    const allowed = String(root || "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "");
    return normalized === allowed || normalized.startsWith(`${allowed}/`);
  });
}

function makeBlocker(status, reason, extra = {}) {
  return { status, reason, ...extra };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function asArray(value) {
  if (Array.isArray(value)) return value.filter((item) => item !== undefined && item !== null && item !== "");
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

function unique(values = []) {
  return [...new Set(values.filter((value) => value !== undefined && value !== null && value !== ""))];
}
