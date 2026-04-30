import { createHash } from "node:crypto";
import { evaluatePolicyProfileBoundary } from "./supervibe-policy-profile-manager.mjs";

export const DANGEROUS_PROVIDER_FLAGS = Object.freeze([
  "--dangerously-skip-permissions",
  "--skip-permissions",
  "--bypass-permissions",
  "--unsafe-shell",
  "--all-tools",
  "--allow-all-tools",
  "--allow-all",
  "--force-approve",
  "bypassPermissions",
  "skipPermissions",
]);

const DANGEROUS_PROVIDER_PATTERNS = [
  /--dangerously-skip-permissions(?:=|$)/i,
  /--skip-permissions(?:=|$)/i,
  /--bypass-permissions(?:=|$)/i,
  /--unsafe-shell(?:=|$)/i,
  /--all-tools(?:=|$)/i,
  /--allow-all-tools(?:=|$)/i,
  /--allow-all(?:=|$)/i,
  /--force-approve(?:=|$)/i,
  /\bbypassPermissions\b/i,
  /\bskipPermissions\b/i,
  /\bprovider\s+bypass\b/i,
  /\brate-limit\s+bypass\b/i,
  /\bsandbox\s+bypass\b/i,
];

const NEGATED_SAFETY_PATTERN = /\b(never|no|not|without|do not|does not|must not|forbid|forbidden|blocked|disable|disabled|reject|rejected)\b.{0,80}\b(bypass|skip permissions|all-tools|unsafe shell|raw secret|credential harvesting)\b/i;

const SENSITIVE_PATH_PATTERNS = [
  /(^|[\\/])\.env(\.|$|[\\/])/i,
  /(^|[\\/])\.env$/i,
  /(^|[\\/])secrets?($|[\\/])/i,
  /(^|[\\/])credentials?($|[\\/])/i,
  /(^|[\\/])tokens?($|[\\/])/i,
  /(^|[\\/])\.aws($|[\\/])/i,
  /(^|[\\/])\.ssh($|[\\/])/i,
  /(^|[\\/])\.config[\\/]gh($|[\\/])/i,
  /(^|[\\/])\.config[\\/]opencode($|[\\/])/i,
  /(^|[\\/])\.claude[\\/].*settings/i,
  /(^|[\\/])\.codex($|[\\/])/i,
];

const SECRET_VALUE_PATTERNS = [
  /\b(?:api[_-]?key|token|secret|password|passwd|private[_-]?key)\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{8,}/i,
  /\bsk-[A-Za-z0-9_-]{16,}/i,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}/i,
  /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/,
];

export function scanProviderCommand({
  command = "",
  args = [],
  approvalLease = null,
  safeSandbox = null,
  policyProfile = {},
} = {}) {
  const parts = flattenCommandParts(command, args);
  const blockedFlags = parts.filter((part) => isDangerousProviderFlag(part));
  if (blockedFlags.length === 0) {
    return {
      allowed: true,
      status: "provider_command_safe",
      blockedFlags: [],
      reason: "provider command does not request permission bypass",
    };
  }

  if (dangerousOverrideAllowed({ approvalLease, safeSandbox, policyProfile })) {
    return {
      allowed: true,
      status: "provider_command_approved_test_sandbox",
      blockedFlags,
      reason: "dangerous provider flag is limited to an approved local test sandbox",
    };
  }

  return {
    allowed: false,
    status: "provider_permission_bypass_blocked",
    blockedFlags,
    reason: `provider permission bypass flags are disabled by default: ${blockedFlags.join(", ")}`,
  };
}

export function evaluateProviderSafetyPolicy({
  executionMode = "dry-run",
  adapterId = "generic-shell-stub",
  command = "",
  args = [],
  allowSpawn = false,
  hiddenBackgroundAutomation = false,
  nonInteractive = true,
  permissionPromptBridge = false,
  approvalLease = null,
  safeSandbox = null,
  policyProfile = {},
  network = {},
  mcp = {},
  readPaths = [],
  writePaths = [],
  sensitivePaths = [],
  remoteMutation = false,
  rateLimit = {},
  budget = {},
  managedPolicy = {},
  projectPolicy = {},
  toolRules = {},
} = {}) {
  const blockers = [];
  const warnings = [];
  const remediation = [];
  const effectivePermissions = normalizeToolPermissionRules(toolRules);
  const adapter = adapterId || "generic-shell-stub";
  const externalAdapter = adapter !== "generic-shell-stub";
  const mode = String(executionMode || "dry-run");

  const commandScan = scanProviderCommand({ command: command || adapter, args, approvalLease, safeSandbox, policyProfile });
  if (!commandScan.allowed) {
    blockers.push(makeBlocker(commandScan.status, commandScan.reason, { flags: commandScan.blockedFlags }));
    remediation.push("remove provider bypass flags or provide exact approval for a local test-only sandbox");
  }

  const policyProfileState = evaluatePolicyProfileBoundary({
    policyProfile,
    executionMode: mode,
    network,
    mcp,
    writePaths,
    remoteMutation,
    nonInteractive,
  });
  if (!policyProfileState.pass) {
    blockers.push(...policyProfileState.blockers);
    remediation.push(...policyProfileState.remediation);
  }
  warnings.push(...policyProfileState.warnings);

  if (hiddenBackgroundAutomation) {
    blockers.push(makeBlocker("hidden_background_automation_blocked", "hidden background automation is not allowed"));
    remediation.push("run through the visible loop registry with status, stop, and side-effect ledger entries");
  }

  if (mode === "fresh-context" && externalAdapter && allowSpawn !== true) {
    blockers.push(makeBlocker("external_adapter_spawn_requires_allow_spawn", "external fresh-context adapters require allowSpawn=true"));
    remediation.push("use dry-run/manual/guided mode or pass an explicit spawn approval through the provider-safe preflight");
  }

  if (mode === "fresh-context" && externalAdapter && allowSpawn === true && nonInteractive && permissionPromptBridge !== true) {
    blockers.push(makeBlocker("permission_prompt_bridge_required", "non-interactive external execution requires a permission prompt bridge"));
    remediation.push("enable the local permission prompt bridge or run guided/manual mode");
  }

  const networkState = evaluateNetworkBoundary(network, approvalLease);
  if (!networkState.allowed) {
    blockers.push(makeBlocker(networkState.status, networkState.reason, { targets: networkState.targets }));
    remediation.push("approve the exact network target or configure an allow rule before execution");
  }

  const mcpState = evaluateMcpBoundary(mcp, approvalLease);
  if (!mcpState.allowed) {
    blockers.push(makeBlocker(mcpState.status, mcpState.reason, { servers: mcpState.servers }));
    remediation.push("approve the exact MCP server and tool scope before execution");
  }

  const secretState = evaluateSecretBoundary({ readPaths, writePaths, sensitivePaths, approvalLease });
  if (!secretState.allowed) {
    blockers.push(makeBlocker(secretState.status, secretState.reason, { paths: secretState.paths }));
    remediation.push("pass secret references by name instead of reading or logging raw sensitive files");
  }

  if (remoteMutation && !leaseCovers(approvalLease, "remote_mutation")) {
    blockers.push(makeBlocker("remote_mutation_approval_required", "remote mutation requires an exact approval lease"));
    remediation.push("provide an approval lease covering the exact remote target, action, and expiry");
  }

  const rateLimitState = evaluateRateLimitBoundary(rateLimit);
  if (!rateLimitState.allowed) {
    blockers.push(makeBlocker(rateLimitState.status, rateLimitState.reason));
    remediation.push("respect retry-after/backoff state or pause before retrying provider calls");
  }

  const managedPolicyState = evaluateManagedPolicyPrecedence({
    managedPolicy,
    projectPolicy: {
      ...projectPolicy,
      allow: unique([...asArray(projectPolicy.allow), ...asArray(policyProfile?.allowedTools)]),
    },
  });
  if (!managedPolicyState.allowed) {
    blockers.push(makeBlocker(managedPolicyState.status, managedPolicyState.reason, { conflicts: managedPolicyState.conflicts }));
    remediation.push("remove project policy entries that weaken managed deny rules");
  }

  if (budget.maxRuntimeMinutes && Number(budget.maxRuntimeMinutes) <= 0) {
    blockers.push(makeBlocker("budget_exhausted", "runtime budget is exhausted before execution"));
    remediation.push("increase the explicit timebox or resume after budget renewal");
  }

  if (mode === "dry-run" && blockers.length === 0) {
    warnings.push("dry-run performs no provider mutation");
  }

  const deniedToolClasses = unique([
    ...policyProfileState.deniedToolClasses,
    ...effectivePermissions.deny,
    ...blockers.map((blocker) => blocker.status),
    "provider-permission-bypass",
    "raw-secret-storage",
  ]);
  const promptRequiredToolClasses = unique([
    ...policyProfileState.promptRequiredToolClasses,
    ...effectivePermissions.ask,
    ...(networkState.requiresApproval ? ["network"] : []),
    ...(mcpState.requiresApproval ? ["mcp"] : []),
    ...(remoteMutation ? ["remote-mutation"] : []),
  ]);

  const pass = blockers.length === 0;
  return {
    pass,
    status: pass ? "provider_policy_passed" : blockers[0].status,
    permissionMode: pass ? "ask-preserving" : "blocked",
    bypassDisabled: !dangerousOverrideAllowed({ approvalLease, safeSandbox, policyProfile }),
    adapterId: adapter,
    executionMode: mode,
    blockers,
    warnings,
    remediation: unique(remediation),
    approvedToolClasses: effectivePermissions.allow,
    promptRequiredToolClasses,
    deniedToolClasses,
    commandScan,
    networkState,
    mcpState,
    secretState,
    rateLimitState,
    managedPolicyState,
    policyProfileState,
    effectivePermissions,
    nextSafeAction: pass ? "continue with visible provider-safe execution" : remediation[0] || "resolve permission blockers",
  };
}

export function normalizeToolPermissionRules(rules = {}) {
  return {
    allow: unique(asArray(rules.allow)),
    ask: unique(asArray(rules.ask)),
    deny: unique(asArray(rules.deny)),
  };
}

export function isDangerousProviderFlag(value = "") {
  const text = String(value || "").trim();
  if (!text) return false;
  return DANGEROUS_PROVIDER_FLAGS.includes(text) || DANGEROUS_PROVIDER_PATTERNS.some((pattern) => pattern.test(text));
}

export function isProviderBypassRequest(text = "") {
  const value = String(text || "");
  if (NEGATED_SAFETY_PATTERN.test(value)) return false;
  return DANGEROUS_PROVIDER_PATTERNS.some((pattern) => pattern.test(value));
}

export function isSensitivePath(path = "") {
  const value = String(path || "");
  return SENSITIVE_PATH_PATTERNS.some((pattern) => pattern.test(value));
}

export function containsRawSecret(text = "") {
  return SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(String(text || "")));
}

export function redactSensitiveText(text = "") {
  let output = String(text || "");
  for (const pattern of SECRET_VALUE_PATTERNS) {
    output = output.replace(pattern, "[REDACTED_SECRET]");
  }
  return output;
}

export function evaluateWebhookTarget({ url = "", allowlist = [], approvalLease = null } = {}) {
  if (!url) {
    return { allowed: false, status: "webhook_url_missing", reason: "webhook URL is not configured" };
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { allowed: false, status: "webhook_url_invalid", reason: "webhook URL is invalid" };
  }
  if (parsed.protocol !== "https:") {
    return { allowed: false, status: "webhook_https_required", reason: "webhook delivery requires https" };
  }
  const origin = parsed.origin;
  const allowedByList = asArray(allowlist).includes(origin) || asArray(allowlist).includes(url);
  const approvedByLease = leaseCovers(approvalLease, `webhook:${origin}`) || leaseCovers(approvalLease, "webhook_allowlist");
  const allowed = allowedByList && approvedByLease;
  return {
    allowed,
    status: allowed ? "webhook_allowed" : "webhook_allowlist_required",
    origin,
    reason: allowed ? "webhook target is allowlisted and approved" : "webhook delivery requires URL allowlist and approval lease",
  };
}

export function providerAuditId(seed = {}) {
  return `perm-${createHash("sha1").update(JSON.stringify(seed)).digest("hex").slice(0, 10)}`;
}

function evaluateNetworkBoundary(network = {}, approvalLease = null) {
  const requested = Boolean(network.requested || network.externalWebAccess || network.fetch || network.targets?.length);
  const targets = asArray(network.targets || network.allowlist);
  if (!requested) {
    return { allowed: true, status: "network_not_requested", requiresApproval: false, targets };
  }
  const approved = Boolean(network.approved || targets.every((target) => leaseCovers(approvalLease, `network:${target}`)));
  return {
    allowed: approved,
    status: approved ? "network_approved" : "network_approval_required",
    requiresApproval: !approved,
    targets,
    reason: approved ? "network access is approved" : "network access requires explicit approval or allowlist",
  };
}

function evaluateMcpBoundary(mcp = {}, approvalLease = null) {
  const servers = asArray(mcp.servers || mcp.server);
  const writeRequested = Boolean(mcp.write || mcp.mutation || mcp.tools?.some((tool) => /write|mutate|delete|create|update/i.test(tool)));
  const requested = Boolean(mcp.requested || servers.length || writeRequested);
  if (!requested) {
    return { allowed: true, status: "mcp_not_requested", requiresApproval: false, servers };
  }
  const approved = Boolean(mcp.approved || servers.every((server) => leaseCovers(approvalLease, `mcp:${server}`)));
  return {
    allowed: approved,
    status: approved ? "mcp_approved" : "mcp_approval_required",
    requiresApproval: !approved,
    servers,
    reason: approved ? "MCP access is approved" : "MCP access requires explicit server and tool approval",
  };
}

function evaluateSecretBoundary({ readPaths = [], writePaths = [], sensitivePaths = [], approvalLease = null } = {}) {
  const paths = unique([...asArray(readPaths), ...asArray(writePaths), ...asArray(sensitivePaths)]).filter(isSensitivePath);
  if (paths.length === 0) {
    return { allowed: true, status: "secret_boundary_clear", paths };
  }
  const approved = paths.every((path) => leaseCovers(approvalLease, `secret-ref:${path}`));
  return {
    allowed: approved,
    status: approved ? "secret_reference_approved" : "sensitive_file_access_blocked",
    paths,
    reason: approved ? "sensitive paths are covered by named references" : "raw sensitive file access is blocked",
  };
}

function evaluateRateLimitBoundary(rateLimit = {}) {
  if (!rateLimit || Object.keys(rateLimit).length === 0) {
    return { allowed: true, status: "rate_limit_clear" };
  }
  if (rateLimit.exhausted) {
    return { allowed: false, status: "provider_budget_exhausted", reason: "provider budget is exhausted" };
  }
  if (rateLimit.retryAfterMs && Number(rateLimit.retryAfterMs) > 0) {
    return { allowed: false, status: "provider_retry_after_active", reason: "provider retry-after is active" };
  }
  if (rateLimit.error429 && !rateLimit.backoffMs) {
    return { allowed: false, status: "provider_backoff_required", reason: "provider 429 requires a backoff before retry" };
  }
  return { allowed: true, status: "rate_limit_clear" };
}

function evaluateManagedPolicyPrecedence({ managedPolicy = {}, projectPolicy = {} } = {}) {
  const managedDeny = new Set(asArray(managedPolicy.deny));
  const projectAllow = new Set(asArray(projectPolicy.allow));
  const conflicts = [...projectAllow].filter((item) => managedDeny.has(item));
  if (conflicts.length > 0) {
    return {
      allowed: false,
      status: "managed_policy_precedence_violation",
      conflicts,
      reason: `project policy cannot allow managed-denied tools: ${conflicts.join(", ")}`,
    };
  }
  return { allowed: true, status: "managed_policy_precedence_enforced", conflicts: [] };
}

function dangerousOverrideAllowed({ approvalLease, safeSandbox, policyProfile } = {}) {
  return Boolean(
    policyProfile?.allowDangerousProviderFlags === true
    && approvalLease?.allowProviderBypass === true
    && leaseCovers(approvalLease, "provider-permission-bypass")
    && safeSandbox?.declared === true
    && safeSandbox?.scope === "local-test-only",
  );
}

function leaseCovers(lease, target) {
  if (!lease || lease.expired === true) return false;
  const scopes = new Set(asArray(lease.scopes || lease.scope || lease.tools || lease.targets));
  if (scopes.has(target)) return true;
  if (target === "remote_mutation" && (lease.actionClass === "remote mutation" || lease.actionClass === "remote_mutation")) return true;
  if (target === "provider-permission-bypass" && lease.actionClass === "provider-permission-bypass") return true;
  return false;
}

function makeBlocker(status, reason, extra = {}) {
  return { status, reason, ...extra };
}

function flattenCommandParts(command, args) {
  const values = [];
  if (Array.isArray(command)) values.push(...command);
  else values.push(command);
  values.push(...asArray(args));
  return values.map((item) => String(item || "")).filter(Boolean);
}

function asArray(value) {
  if (Array.isArray(value)) return value.filter((item) => item !== undefined && item !== null && item !== "");
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

function unique(values = []) {
  return [...new Set(values.filter((value) => value !== undefined && value !== null && value !== ""))];
}
