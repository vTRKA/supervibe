import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const AGENT_INVOCATIONS_RELATIVE_PATH = ".supervibe/memory/agent-invocations.jsonl";
const HOST_MANAGED_COMPLETED_STATUSES = new Set(["completed", "complete", "done", "closed"]);
const HOST_MANAGED_SOURCE = "codex-spawn-agent";

export function defaultAgentLeaseRegistryPath(rootDir = process.cwd()) {
  return join(rootDir, ".supervibe", "memory", "agent-lease-registry.json");
}

export async function readAgentLeaseRegistry(path = defaultAgentLeaseRegistryPath()) {
  if (!existsSync(path)) return emptyRegistry();
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    return normalizeAgentLeaseRegistry(parsed);
  } catch {
    return emptyRegistry();
  }
}

export function readAgentLeaseRegistrySync(path = defaultAgentLeaseRegistryPath()) {
  if (!existsSync(path)) return emptyRegistry();
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return normalizeAgentLeaseRegistry(parsed);
  } catch {
    return emptyRegistry();
  }
}

export async function writeAgentLeaseRegistry(path, registry) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(normalizeAgentLeaseRegistry(registry), null, 2)}\n`, "utf8");
}

export function writeAgentLeaseRegistrySync(path, registry) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(normalizeAgentLeaseRegistry(registry), null, 2)}\n`, "utf8");
}

export async function upsertAgentLease(lease = {}, {
  path = defaultAgentLeaseRegistryPath(),
  now = new Date(),
} = {}) {
  const registry = await readAgentLeaseRegistry(path);
  const nextLease = normalizeAgentLease({ ...lease, heartbeatAt: lease.heartbeatAt || now.toISOString() });
  registry.leases = registry.leases.filter((item) => agentLeaseKey(item) !== agentLeaseKey(nextLease));
  registry.leases.push(nextLease);
  await writeAgentLeaseRegistry(path, registry);
  return nextLease;
}

export function upsertAgentLeaseSync(lease = {}, {
  path = defaultAgentLeaseRegistryPath(),
  now = new Date(),
} = {}) {
  const registry = readAgentLeaseRegistrySync(path);
  const nextLease = normalizeAgentLease({ ...lease, heartbeatAt: lease.heartbeatAt || now.toISOString() });
  registry.leases = registry.leases.filter((item) => agentLeaseKey(item) !== agentLeaseKey(nextLease));
  registry.leases.push(nextLease);
  writeAgentLeaseRegistrySync(path, registry);
  return nextLease;
}

export async function upsertAgentLeaseFromInvocation({
  rootDir = process.cwd(),
  record = {},
  owner = {},
  scope = {},
  path = defaultAgentLeaseRegistryPath(rootDir),
  now = new Date(),
} = {}) {
  return upsertAgentLease(createAgentLeaseFromInvocation({ record, owner, scope, now }), { path, now });
}

export function createAgentLeaseFromInvocation({
  record = {},
  owner = {},
  scope = {},
  now = new Date(),
} = {}) {
  const normalizedScope = normalizeLeaseScope({
    command: scope.command || record.command || record.workflow || null,
    stage: scope.stage || record.stage || record.stage_id || null,
    handoffId: scope.handoffId || record.handoffId || record.handoff_id || record.handoff || null,
    workflowRunId: scope.workflowRunId || record.workflowRunId || record.workflow_run_id || null,
    taskId: scope.taskId || record.task_id || record.taskId || null,
    subjectType: scope.subjectType || record.subject_type || record.subjectType || "agent",
    subjectId: scope.subjectId || record.subject_id || record.subjectId || record.agent_id || null,
    outputArtifacts: scope.outputArtifacts || record.output_artifacts || record.outputArtifacts || [],
    allowedOutputScope: scope.allowedOutputScope || scope.allowed_output_scope || [],
  });
  const status = normalizeStatus(record.status || "completed");
  const hostInvocationSource = record.host_invocation_source || record.hostInvocationSource || record.source || owner.hostInvocationSource || null;
  const hostInvocationId = record.host_invocation_id || record.hostInvocationId || record.invocation_id || record.invocationId || owner.hostInvocationId || null;
  const agentId = record.agent_id || record.agentId || owner.agentId || normalizedScope.subjectId || null;
  const cleanup = classifyCleanupDebt({
    hostInvocationSource,
    hostInvocationId,
    status,
    closedAt: record.closedAt || record.closed_at || null,
    scope: normalizedScope,
  }, { scope: normalizedScope });
  const openedAt = record.ts || record.startedAt || record.started_at || now.toISOString();
  const completedAt = record.completedAt || record.completed_at || (HOST_MANAGED_COMPLETED_STATUSES.has(status) ? record.ts || now.toISOString() : null);
  return normalizeAgentLease({
    id: agentLeaseId(hostInvocationSource, hostInvocationId),
    agentId,
    role: owner.role || record.role || agentId,
    owner: {
      agentId,
      command: normalizedScope.command || null,
      task: owner.task || record.task_summary || record.taskSummary || null,
      host: owner.host || record.host || null,
      hostInvocationSource,
      hostInvocationId,
    },
    host: owner.host || record.host || null,
    hostInvocationSource,
    hostInvocationId,
    invocationId: record.invocation_id || record.invocationId || hostInvocationId,
    status,
    openedAt,
    heartbeatAt: record.heartbeatAt || record.heartbeat_at || record.ts || now.toISOString(),
    completedAt,
    closedAt: record.closedAt || record.closed_at || null,
    closeStatus: cleanup.blocks ? "host-close-pending" : HOST_MANAGED_COMPLETED_STATUSES.has(status) ? "closed-or-not-required" : "open",
    scope: normalizedScope,
    cleanup,
    diagnostics: buildLeaseDiagnostics({
      agentId,
      hostInvocationSource,
      hostInvocationId,
      scope: normalizedScope,
      cleanup,
    }),
  });
}

export async function closeAgentLease({
  rootDir = process.cwd(),
  path = defaultAgentLeaseRegistryPath(rootDir),
  hostInvocationSource = HOST_MANAGED_SOURCE,
  hostInvocationId,
  closedAt = new Date().toISOString(),
  closeReason = "host-close-confirmed",
} = {}) {
  if (!hostInvocationId) return null;
  const registry = await readAgentLeaseRegistry(path);
  let closedLease = null;
  registry.leases = registry.leases.map((lease) => {
    if (lease.hostInvocationId !== hostInvocationId || lease.hostInvocationSource !== hostInvocationSource) return lease;
    closedLease = normalizeAgentLease({
      ...lease,
      closedAt,
      closeStatus: "closed",
      cleanup: {
        ...lease.cleanup,
        classification: "resolved",
        blocks: false,
        closeRequired: false,
        closedAt,
        closeReason,
      },
    });
    return closedLease;
  });
  if (closedLease) await writeAgentLeaseRegistry(path, registry);
  return closedLease;
}

export async function removeAgentLeaseForInvocation({
  rootDir = process.cwd(),
  path = defaultAgentLeaseRegistryPath(rootDir),
  hostInvocationSource = HOST_MANAGED_SOURCE,
  hostInvocationId,
} = {}) {
  if (!hostInvocationId) return false;
  const registry = await readAgentLeaseRegistry(path);
  const before = registry.leases.length;
  registry.leases = registry.leases.filter((lease) => {
    return lease.hostInvocationId !== hostInvocationId || lease.hostInvocationSource !== hostInvocationSource;
  });
  if (registry.leases.length === before) return false;
  await writeAgentLeaseRegistry(path, registry);
  return true;
}

export function summarizeAgentLeaseDebtSync({
  rootDir = process.cwd(),
  path = defaultAgentLeaseRegistryPath(rootDir),
  invocationLogPath = join(rootDir, ...AGENT_INVOCATIONS_RELATIVE_PATH.split("/")),
  includeInvocationLog = true,
  scope = {},
  strictRelease = false,
} = {}) {
  const scoped = hasScope(scope);
  const registry = readAgentLeaseRegistrySync(path);
  const registryLeases = registry.leases;
  const discoveredLeases = includeInvocationLog
    ? discoverAgentLeasesFromInvocationLogSync({ invocationLogPath })
    : [];
  const leases = dedupeLeases([...registryLeases, ...discoveredLeases]);
  const debt = [];
  const diagnostics = [];
  for (const lease of leases) {
    const classification = classifyCleanupDebt(lease, { scope, strictRelease });
    const row = {
      id: lease.id,
      agentId: lease.agentId,
      hostInvocationSource: lease.hostInvocationSource,
      hostInvocationId: lease.hostInvocationId,
      command: lease.scope?.command || null,
      handoffId: lease.scope?.handoffId || null,
      workflowRunId: lease.scope?.workflowRunId || null,
      classification: classification.classification,
      blocks: classification.blocks,
      reason: classification.reason,
    };
    if (classification.closeRequired) debt.push(row);
    if (!classification.blocks && classification.closeRequired) diagnostics.push(row);
  }
  const blocking = debt.filter((item) => item.blocks);
  return {
    schemaVersion: 1,
    strictRelease: strictRelease === true,
    scoped,
    scope: normalizeLeaseScope(scope),
    count: blocking.length,
    blockingCount: blocking.length,
    diagnosticCount: diagnostics.length,
    globalCount: debt.length,
    closeRequired: blocking,
    diagnostics,
    discovered: discoveredLeases.length,
    checked: leases.length,
  };
}

export function summarizeAgentLeaseCoverageSync({
  rootDir = process.cwd(),
  path = defaultAgentLeaseRegistryPath(rootDir),
  invocationLogPath = join(rootDir, ...AGENT_INVOCATIONS_RELATIVE_PATH.split("/")),
  requiredAgentIds = [],
  scope = {},
  includeInvocationLog = true,
} = {}) {
  const registry = readAgentLeaseRegistrySync(path);
  const discoveredLeases = includeInvocationLog
    ? discoverAgentLeasesFromInvocationLogSync({ invocationLogPath })
    : [];
  const leases = dedupeLeases([...registry.leases, ...discoveredLeases]);
  const normalizedRequired = unique(requiredAgentIds);
  const trusted = new Set();
  const rejected = [];
  for (const lease of leases) {
    if (!leaseMatchesScope(lease, scope, { strictRelease: false })) continue;
    const source = String(lease.hostInvocationSource || "");
    if (source !== HOST_MANAGED_SOURCE) {
      rejected.push({
        agentId: lease.agentId,
        hostInvocationId: lease.hostInvocationId,
        source,
        reason: "generic or inline proof is diagnostic only and cannot satisfy named specialist ownership",
      });
      continue;
    }
    if (normalizedRequired.includes(lease.agentId)) trusted.add(lease.agentId);
  }
  return {
    schemaVersion: 1,
    pass: normalizedRequired.every((agentId) => trusted.has(agentId)),
    requiredAgentIds: normalizedRequired,
    trustedAgentIds: [...trusted],
    missingAgentIds: normalizedRequired.filter((agentId) => !trusted.has(agentId)),
    rejectedGenericProof: rejected,
    checked: leases.length,
  };
}

export function discoverAgentLeasesFromInvocationLogSync({
  invocationLogPath,
  now = new Date(),
} = {}) {
  if (!invocationLogPath || !existsSync(invocationLogPath)) return [];
  const raw = readFileSync(invocationLogPath, "utf8");
  const leases = [];
  for (const line of raw.split(/\r?\n/).filter(Boolean)) {
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    leases.push(createAgentLeaseFromInvocation({ record, now }));
  }
  return leases;
}

export function normalizeLeaseScope(scope = {}) {
  return {
    command: normalizeOptional(scope.command || scope.workflow),
    stage: normalizeOptional(scope.stage || scope.phase || scope.stageId || scope.stage_id),
    handoffId: normalizeOptional(scope.handoffId || scope.handoff || scope.handoff_id),
    workflowRunId: normalizeOptional(scope.workflowRunId || scope.workflow_run_id),
    taskId: normalizeOptional(scope.taskId || scope.task_id || scope.workItemId || scope.work_item_id),
    subjectType: normalizeOptional(scope.subjectType || scope.subject_type) || "agent",
    subjectId: normalizeOptional(scope.subjectId || scope.subject_id || scope.agentId || scope.agent_id),
    outputArtifacts: normalizeList(scope.outputArtifacts || scope.output_artifacts),
    allowedOutputScope: normalizeList(scope.allowedOutputScope || scope.allowed_output_scope),
  };
}

export function leaseMatchesScope(lease = {}, scope = {}, { strictRelease = false } = {}) {
  if (strictRelease) return true;
  const desired = normalizeLeaseScope(scope);
  if (!hasScope(desired)) return true;
  const actual = normalizeLeaseScope(lease.scope || lease);
  if (desired.handoffId) return actual.handoffId === desired.handoffId;
  if (desired.workflowRunId) return actual.workflowRunId === desired.workflowRunId;
  if (desired.command) return actual.command === desired.command;
  return false;
}

export function classifyCleanupDebt(lease = {}, { scope = {}, strictRelease = false } = {}) {
  const source = lease.hostInvocationSource || lease.host_invocation_source;
  const invocationId = lease.hostInvocationId || lease.host_invocation_id || lease.invocationId || lease.invocation_id;
  const status = normalizeStatus(lease.status || "completed");
  const closeRequired = source === HOST_MANAGED_SOURCE
    && Boolean(invocationId)
    && HOST_MANAGED_COMPLETED_STATUSES.has(status)
    && !lease.closedAt
    && lease.closeStatus !== "closed";
  if (!closeRequired) {
    return {
      classification: "none",
      blocks: false,
      closeRequired: false,
      reason: "lease is active, closed, or not host-managed cleanup debt",
    };
  }
  const scoped = hasScope(scope);
  if (strictRelease) {
    return {
      classification: "strict-global-cleanup-debt",
      blocks: true,
      closeRequired: true,
      reason: "strict release checks inspect global host-managed cleanup debt",
    };
  }
  if (!scoped) {
    return {
      classification: "global-cleanup-debt",
      blocks: true,
      closeRequired: true,
      reason: "no command or handoff scope supplied",
    };
  }
  const actual = normalizeLeaseScope(lease.scope || lease);
  if (!hasScope(actual)) {
    return {
      classification: "diagnostic-unscoped-cleanup-debt",
      blocks: false,
      closeRequired: true,
      reason: "legacy cleanup debt has no command or handoff scope; it is diagnostic outside strict release",
    };
  }
  if (leaseMatchesScope(lease, scope)) {
    return {
      classification: "scoped-cleanup-debt",
      blocks: true,
      closeRequired: true,
      reason: "cleanup debt belongs to the current command or handoff scope",
    };
  }
  return {
    classification: "other-scope-cleanup-debt",
    blocks: false,
    closeRequired: true,
    reason: "cleanup debt belongs to another command or handoff scope",
  };
}

function normalizeAgentLeaseRegistry(registry = {}) {
  return {
    schemaVersion: 1,
    leases: Array.isArray(registry.leases) ? registry.leases.map(normalizeAgentLease) : [],
  };
}

function normalizeAgentLease(lease = {}) {
  const hostInvocationSource = lease.hostInvocationSource || lease.host_invocation_source || null;
  const hostInvocationId = lease.hostInvocationId || lease.host_invocation_id || lease.invocationId || lease.invocation_id || null;
  const scope = normalizeLeaseScope(lease.scope || lease);
  const status = normalizeStatus(lease.status || "completed");
  const cleanup = lease.cleanup && typeof lease.cleanup === "object"
    ? { ...lease.cleanup }
    : classifyCleanupDebt({ ...lease, hostInvocationSource, hostInvocationId, status, scope }, { scope });
  return {
    schemaVersion: 1,
    id: lease.id || agentLeaseId(hostInvocationSource, hostInvocationId),
    agentId: lease.agentId || lease.agent_id || scope.subjectId || null,
    role: lease.role || lease.agentId || lease.agent_id || scope.subjectId || null,
    owner: normalizeLeaseOwner(lease.owner, {
      agentId: lease.agentId || lease.agent_id || scope.subjectId || null,
      command: scope.command || null,
      host: lease.host || null,
      hostInvocationSource,
      hostInvocationId,
    }),
    host: lease.host || lease.owner?.host || null,
    hostInvocationSource,
    hostInvocationId,
    invocationId: lease.invocationId || lease.invocation_id || hostInvocationId,
    status,
    openedAt: lease.openedAt || lease.opened_at || lease.registeredAt || lease.ts || null,
    heartbeatAt: lease.heartbeatAt || lease.heartbeat_at || lease.lastSeenAt || lease.ts || null,
    completedAt: lease.completedAt || lease.completed_at || null,
    closedAt: lease.closedAt || lease.closed_at || null,
    closeStatus: lease.closeStatus || lease.close_status || null,
    scope,
    cleanup,
    diagnostics: Array.isArray(lease.diagnostics) ? lease.diagnostics : buildLeaseDiagnostics({
      agentId: lease.agentId || lease.agent_id || scope.subjectId || null,
      hostInvocationSource,
      hostInvocationId,
      scope,
      cleanup,
    }),
  };
}

function normalizeLeaseOwner(owner = {}, fallback = {}) {
  return {
    agentId: owner?.agentId || owner?.agent_id || fallback.agentId || null,
    command: owner?.command || fallback.command || null,
    task: owner?.task || owner?.taskSummary || owner?.task_summary || null,
    host: owner?.host || fallback.host || null,
    hostInvocationSource: owner?.hostInvocationSource || owner?.host_invocation_source || fallback.hostInvocationSource || null,
    hostInvocationId: owner?.hostInvocationId || owner?.host_invocation_id || fallback.hostInvocationId || null,
  };
}

function buildLeaseDiagnostics({
  agentId = null,
  hostInvocationSource = null,
  hostInvocationId = null,
  scope = {},
  cleanup = {},
} = {}) {
  const diagnostics = [];
  if (!agentId) diagnostics.push(diagnostic("missing-agent-id", "lease has no named specialist agent id"));
  if (!hostInvocationId) diagnostics.push(diagnostic("missing-host-invocation-id", "lease has no host invocation id"));
  if (hostInvocationSource !== HOST_MANAGED_SOURCE) {
    diagnostics.push(diagnostic("generic-inline-proof-rejected", "only codex-spawn-agent proof can satisfy named Codex specialist ownership"));
  }
  if (!hasScope(scope)) diagnostics.push(diagnostic("unscoped-lease", "lease has no command, handoff, or workflow run scope"));
  if (cleanup.blocks) diagnostics.push(diagnostic(cleanup.classification, cleanup.reason));
  return diagnostics;
}

function diagnostic(code, message) {
  return { code, message };
}

function dedupeLeases(leases = []) {
  const seen = new Set();
  const out = [];
  for (const lease of leases.map(normalizeAgentLease)) {
    const key = agentLeaseKey(lease);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(lease);
  }
  return out;
}

function agentLeaseKey(lease = {}) {
  return `${lease.hostInvocationSource || ""}\u0000${lease.hostInvocationId || lease.id || ""}`;
}

function agentLeaseId(source, invocationId) {
  const safeSource = sanitizeSegment(source || "host");
  const safeInvocation = sanitizeSegment(invocationId || "unknown");
  return `lease:${safeSource}:${safeInvocation}`;
}

function hasScope(scope = {}) {
  const normalized = normalizeLeaseScope(scope);
  return Boolean(normalized.command || normalized.handoffId || normalized.workflowRunId);
}

function normalizeOptional(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function normalizeStatus(value) {
  return String(value || "completed").trim().toLowerCase() || "completed";
}

function normalizeList(value) {
  if (Array.isArray(value)) return unique(value.map(String));
  if (value === undefined || value === null || value === "") return [];
  return unique(String(value).split(",").map((item) => item.trim()).filter(Boolean));
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean).map(String))];
}

function sanitizeSegment(value) {
  return String(value || "unknown").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-|-$/g, "") || "unknown";
}

function emptyRegistry() {
  return { schemaVersion: 1, leases: [] };
}
