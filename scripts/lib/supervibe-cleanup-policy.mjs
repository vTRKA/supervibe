const DAY_MS = 24 * 60 * 60 * 1000;

export const CLEANUP_POLICY_VERSION = "cleanup-lifecycle-v1";

export const CLEANUP_MODES = Object.freeze([
  "disabled",
  "dry-run",
  "review",
  "auto-safe",
  "manual-apply",
]);

export const CLEANUP_NAMESPACES = Object.freeze([
  "memory",
  "artifacts",
  "workflow-invocations",
  "work-items",
  "plans",
  "graphs",
  "snapshots",
  "logs",
  "archives",
  "runtime",
  "unknown",
]);

const DEFAULT_NAMESPACE_POLICY = Object.freeze({
  memory: { retentionDays: 90, action: "review", autoSafe: false, owner: "memory" },
  artifacts: { retentionDays: 14, action: "review", autoSafe: false, owner: "artifacts" },
  "workflow-invocations": { retentionDays: 90, action: "protect", autoSafe: false, owner: "receipts" },
  "work-items": { retentionDays: 14, action: "archive", autoSafe: false, owner: "workflow" },
  plans: { retentionDays: 30, action: "archive", autoSafe: false, owner: "planning" },
  graphs: { retentionDays: 1, action: "archive", autoSafe: false, owner: "workflow" },
  snapshots: { retentionDays: 14, action: "review", autoSafe: false, owner: "runtime" },
  logs: { retentionDays: 14, action: "delete", autoSafe: true, owner: "runtime" },
  archives: { retentionDays: 90, action: "budget", autoSafe: false, owner: "runtime" },
  runtime: { retentionDays: 0, action: "delete", autoSafe: true, owner: "runtime" },
  unknown: { retentionDays: 0, action: "review", autoSafe: false, owner: "runtime" },
});

const DEFAULT_ARCHIVE_BUDGET = Object.freeze({
  maxAgeDays: 90,
  maxBytes: 0,
  keepLast: 5,
  protectedProvenanceWins: true,
});

export function createDefaultCleanupPolicy({ mode = "dry-run", now = new Date().toISOString() } = {}) {
  return resolveCleanupPolicy({ mode, now });
}

export function resolveCleanupPolicy({
  mode = "dry-run",
  now = new Date().toISOString(),
  overrides = {},
} = {}) {
  const resolvedMode = normalizeCleanupMode(mode);
  const policy = {
    schemaVersion: 1,
    policyVersion: CLEANUP_POLICY_VERSION,
    generatedAt: now,
    mode: resolvedMode,
    destructiveApply: resolvedMode === "manual-apply",
    twoPhaseApplyRequired: true,
    requireActionManifest: resolvedMode === "manual-apply",
    pathContainmentRoot: ".supervibe",
    redaction: {
      rootRelativePathsOnly: true,
      persistRawCommandLines: false,
      persistPrivatePayloads: false,
      persistSecretsOrPii: false,
    },
    archiveBudget: { ...DEFAULT_ARCHIVE_BUDGET, ...(overrides.archiveBudget || {}) },
    namespaces: mergeNamespacePolicy(overrides.namespaces || {}),
  };
  const issues = validateCleanupPolicy(policy);
  if (issues.length) {
    throw new Error(`invalid cleanup policy: ${issues.join("; ")}`);
  }
  return policy;
}

export function validateCleanupPolicy(policy = {}) {
  const issues = [];
  if (!CLEANUP_MODES.includes(policy.mode)) {
    issues.push(`unsupported mode ${policy.mode || "unknown"}`);
  }
  if (!policy.namespaces || typeof policy.namespaces !== "object") {
    issues.push("missing namespace policies");
    return issues;
  }
  for (const namespace of CLEANUP_NAMESPACES) {
    const item = policy.namespaces[namespace];
    if (!item) {
      issues.push(`missing namespace ${namespace}`);
      continue;
    }
    if (!item.owner) issues.push(`namespace ${namespace} missing owner`);
    if (!Number.isFinite(Number(item.retentionDays))) {
      issues.push(`namespace ${namespace} has invalid retentionDays`);
    }
    if (item.autoSafe && ["workflow-invocations", "plans", "graphs", "snapshots", "archives", "memory", "unknown"].includes(namespace)) {
      issues.push(`namespace ${namespace} cannot be auto-safe`);
    }
  }
  if (policy.mode === "auto-safe") {
    const unsafeAuto = Object.entries(policy.namespaces)
      .filter(([, item]) => item.autoSafe && item.action !== "delete")
      .map(([namespace]) => namespace);
    if (unsafeAuto.length) issues.push(`auto-safe namespaces must use delete action only: ${unsafeAuto.join(",")}`);
  }
  if (policy.mode === "manual-apply" && policy.requireActionManifest !== true) {
    issues.push("manual-apply requires action manifest");
  }
  if (policy.archiveBudget?.protectedProvenanceWins !== true) {
    issues.push("archive budget must preserve protected provenance");
  }
  return issues;
}

export function namespaceForCleanupPath(relPath = "") {
  const path = normalizeRelPath(relPath);
  if (!path.startsWith(".supervibe/")) return "unknown";
  if (path.includes("/_workflow-invocations/") || path.startsWith(".supervibe/artifacts/_workflow-invocations/")) return "workflow-invocations";
  if (path.includes("/work-items/")) return path.includes("/graph.json") ? "graphs" : "work-items";
  if (path.includes("/artifact-snapshots/") || path.includes("/_workflow-receipt-snapshots/")) return "snapshots";
  if (path.startsWith(".supervibe/.archive/") || path.includes("/.archive/")) return "archives";
  if (path.startsWith(".supervibe/artifacts/plans/") || path.includes("/plans/")) return "plans";
  if (path.startsWith(".supervibe/memory/")) return "memory";
  if (path.startsWith(".supervibe/artifacts/")) return "artifacts";
  if (path.endsWith(".log") || path.endsWith(".jsonl")) return "logs";
  if (path.includes("/servers/") || path.includes("runtime-cleanup")) return "runtime";
  return "unknown";
}

export function decideCleanupAction({
  policy,
  relPath,
  lifecycleClass = "unclassified",
  reason = "",
  receiptLinked = false,
  protectedProvenance = false,
} = {}) {
  const resolvedPolicy = policy || resolveCleanupPolicy();
  const namespace = namespaceForCleanupPath(relPath);
  const namespacePolicy = resolvedPolicy.namespaces[namespace] || resolvedPolicy.namespaces.unknown;
  if (resolvedPolicy.mode === "disabled") return decision("none", "cleanup disabled", namespace, namespacePolicy);
  if (protectedProvenance || receiptLinked || lifecycleClass === "protected" || lifecycleClass === "hot") {
    return decision("protect", "protected provenance or active root", namespace, namespacePolicy);
  }
  if (lifecycleClass === "unclassified" || namespace === "unknown") {
    return decision("review", "unclassified cleanup target requires review", namespace, namespacePolicy);
  }
  if (resolvedPolicy.mode === "dry-run") return decision("report", `dry-run ${reason || lifecycleClass}`, namespace, namespacePolicy);
  if (resolvedPolicy.mode === "review") return decision("review", `review ${reason || lifecycleClass}`, namespace, namespacePolicy);
  if (resolvedPolicy.mode === "auto-safe") {
    if (namespacePolicy.autoSafe && ["trash", "deletable"].includes(lifecycleClass)) {
      return decision("delete", `auto-safe ${reason || lifecycleClass}`, namespace, namespacePolicy);
    }
    return decision("review", "not on hard auto-safe allowlist", namespace, namespacePolicy);
  }
  if (resolvedPolicy.mode === "manual-apply") {
    return decision(namespacePolicy.action === "delete" ? "delete" : namespacePolicy.action, `manual apply ${reason || lifecycleClass}`, namespace, namespacePolicy);
  }
  return decision("review", "fallback review", namespace, namespacePolicy);
}

export function isOlderThanRetention({ mtimeMs, now = new Date().toISOString(), retentionDays = 0 } = {}) {
  const timestamp = Number(mtimeMs || 0);
  const cutoff = Date.parse(now) - Number(retentionDays) * DAY_MS;
  return Number.isFinite(timestamp) && Number.isFinite(cutoff) && timestamp <= cutoff;
}

export function normalizeRelPath(value = "") {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function mergeNamespacePolicy(overrides) {
  const merged = {};
  for (const namespace of CLEANUP_NAMESPACES) {
    merged[namespace] = {
      ...DEFAULT_NAMESPACE_POLICY[namespace],
      ...(overrides[namespace] || {}),
    };
  }
  return merged;
}

function normalizeCleanupMode(mode) {
  const value = String(mode || "dry-run").toLowerCase();
  if (value === "dryrun") return "dry-run";
  if (value === "manual") return "manual-apply";
  if (value === "auto") return "auto-safe";
  return value;
}

function decision(action, reason, namespace, namespacePolicy) {
  return {
    action,
    reason,
    namespace,
    namespacePolicy,
    applyAllowed: ["delete", "archive", "compact", "budget"].includes(action),
  };
}
