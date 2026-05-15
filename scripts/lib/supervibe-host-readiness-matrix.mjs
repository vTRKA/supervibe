import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { listFacadeOperations, validateFacadeCatalog } from "./supervibe-facade-contract.mjs";
import { getHostAdapterMatrix } from "./supervibe-host-adapters.mjs";
import { getHostNeutralCapabilityDefinitions } from "./supervibe-capability-registry.mjs";

export const HOST_READINESS_SCHEMA_VERSION = 1;
export const HOST_READINESS_HOST_IDS = Object.freeze(["claude", "codex", "gemini", "cursor", "opencode"]);

const REQUIRED_FACADE_OPERATIONS = Object.freeze([
  "status",
  "nextAction",
  "searchMemory",
  "searchCode",
  "queryGraph",
  "explainCommand",
  "receipts",
  "verify",
  "repair",
]);

const TRUSTED_RECEIPT_SOURCES = Object.freeze({
  claude: "runtime-issued-host-agent-receipt",
  codex: "codex-spawn-agent",
  gemini: "agent-invocations-jsonl",
  cursor: "manual-guided-receipt",
  opencode: "agent-invocations-jsonl",
});

const CURSOR_DEGRADED_ALLOWED_OPERATIONS = Object.freeze([
  "readiness-report",
  "manual-guided-agent-output",
  "runtime-issued-receipts-with-explicit-host-trace",
  "facade-read-only-operations",
]);

export function buildHostReadinessMatrix({
  rootDir = process.cwd(),
  hostIds = HOST_READINESS_HOST_IDS,
  requiredAgentIds = [],
  requiredSkillIds = [],
} = {}) {
  const root = resolve(rootDir);
  const adaptersById = new Map(getHostAdapterMatrix().map((adapter) => [adapter.id, adapter]));
  const facadeStatus = evaluateFacadeContract();
  const hostNeutralContract = evaluateHostNeutralContract(facadeStatus);
  const rows = hostIds.map((hostId) => {
    const adapter = adaptersById.get(hostId);
    if (!adapter) return unknownHostRow(hostId, hostNeutralContract);
    return buildHostReadinessRow({
      rootDir: root,
      adapter,
      requiredAgentIds,
      requiredSkillIds,
      facadeStatus,
      hostNeutralContract,
    });
  });
  return deepFreeze({
    schemaVersion: HOST_READINESS_SCHEMA_VERSION,
    kind: "supervibe-host-readiness-matrix",
    generatedAt: "deterministic-local",
    rootDir: root,
    requiredAgents: [...requiredAgentIds],
    requiredSkills: [...requiredSkillIds],
    hosts: rows,
    summary: summarizeRows(rows),
  });
}

export function buildHostReadinessRow({
  rootDir = process.cwd(),
  adapter,
  requiredAgentIds = [],
  requiredSkillIds = [],
  facadeStatus = evaluateFacadeContract(),
  hostNeutralContract = evaluateHostNeutralContract(facadeStatus),
} = {}) {
  if (!adapter?.id) throw new Error("buildHostReadinessRow requires a host adapter.");
  const localAgents = listDirectMarkdownIds(rootDir, adapter.agentsFolder);
  const sharedAgents = listDirectMarkdownIds(rootDir, "agents");
  const localSkills = listDirectSkillIds(rootDir, adapter.skillsFolder);
  const sharedSkills = listDirectSkillIds(rootDir, "skills");

  const callableAgents = evaluateCallableAgents({ adapter, localAgents, sharedAgents, requiredAgentIds });
  const trustedReceipts = evaluateTrustedReceipts(adapter);
  const facadeAvailable = evaluateFacadeAvailability(facadeStatus);
  const skillsLinked = evaluateSkillsLinked({ adapter, localSkills, sharedSkills, requiredSkillIds });
  const degradedMode = evaluateHostDegradedMode({ adapter, callableAgents, trustedReceipts, skillsLinked });
  const capabilities = { callableAgents, trustedReceipts, facadeAvailable, skillsLinked };
  const missingCapabilities = Object.entries(capabilities)
    .filter(([, value]) => value.status !== "ready")
    .map(([capability, value]) => normalizeMissingCapability(capability, value));
  const repairCommand = missingCapabilities.find((item) => item.repairCommand)?.repairCommand || null;
  return deepFreeze({
    schemaVersion: HOST_READINESS_SCHEMA_VERSION,
    hostId: adapter.id,
    displayName: adapter.displayName,
    adapterPaths: {
      instructionFiles: [...adapter.instructionFiles],
      agentsFolder: adapter.agentsFolder,
      skillsFolder: adapter.skillsFolder,
      settingsFile: adapter.settingsFile,
    },
    callableAgents,
    trustedReceipts,
    facadeAvailable,
    skillsLinked,
    degradedMode,
    missingCapabilities,
    repairCommand,
    hostNeutralContract,
    ready: missingCapabilities.length === 0,
  });
}

export function validateHostReadinessMatrix(matrix = buildHostReadinessMatrix()) {
  const issues = [];
  if (matrix.schemaVersion !== HOST_READINESS_SCHEMA_VERSION) {
    issues.push(issue("schema-version", "matrix", `schemaVersion must be ${HOST_READINESS_SCHEMA_VERSION}.`));
  }
  for (const row of matrix.hosts || []) {
    for (const missing of row.missingCapabilities || []) {
      const hasRepair = typeof missing.repairCommand === "string" && missing.repairCommand.trim().length > 0;
      const hasDegraded = typeof missing.degradedModeReason === "string" && missing.degradedModeReason.trim().length > 0;
      if (hasRepair === hasDegraded) {
        issues.push(issue(
          "missing-capability-remediation",
          `${row.hostId}.${missing.capability}`,
          "Each missing capability must have exactly one repairCommand or one degradedModeReason.",
        ));
      }
    }
  }
  return { schemaVersion: HOST_READINESS_SCHEMA_VERSION, pass: issues.length === 0, hostCount: matrix.hosts?.length || 0, issues };
}

export function formatHostReadinessMatrixMarkdown(matrix = buildHostReadinessMatrix()) {
  const lines = [
    "# Host Readiness Matrix",
    "",
    `Schema version: ${matrix.schemaVersion}`,
    `Generated: ${matrix.generatedAt}`,
    "",
    "| Host | Agents callable | Receipts trusted | Facade | Skills linked | Degraded mode | Repair |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const row of matrix.hosts || []) {
    lines.push([
      row.displayName || row.hostId,
      row.callableAgents.status,
      row.trustedReceipts.status,
      row.facadeAvailable.status,
      row.skillsLinked.status,
      row.degradedMode.enabled ? row.degradedMode.mode : "none",
      row.repairCommand || "none",
    ].map(escapeMarkdownCell).join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }
  lines.push("", "## Missing Capabilities");
  for (const row of matrix.hosts || []) {
    if (!row.missingCapabilities.length) {
      lines.push(`- ${row.hostId}: none`);
      continue;
    }
    for (const missing of row.missingCapabilities) {
      lines.push(`- ${row.hostId}.${missing.capability}: ${missing.repairCommand || missing.degradedModeReason}`);
    }
  }
  return lines.join("\n");
}

function evaluateCallableAgents({ adapter, localAgents, sharedAgents, requiredAgentIds }) {
  const missingRequired = requiredAgentIds.filter((agentId) => !localAgents.includes(agentId));
  const evidence = {
    hostFolder: adapter.agentsFolder,
    localCount: localAgents.length,
    sharedCount: sharedAgents.length,
    requiredCount: requiredAgentIds.length,
    missingRequired,
  };
  if (adapter.loopCapabilities.freshContextAdapter && missingRequired.length === 0) {
    return readyCapability("host agent dispatch is available through the Supervibe fresh-context adapter", evidence);
  }
  if (!adapter.loopCapabilities.freshContextAdapter) {
    return degradedCapability({
      reason: "no portable fresh-context execution adapter is available for this host; guided/manual dispatch remains allowed",
      evidence,
      allowedOperations: CURSOR_DEGRADED_ALLOWED_OPERATIONS,
    });
  }
  return repairableCapability({
    reason: `required host-callable agents are missing: ${missingRequired.join(", ")}`,
    repairCommand: provisionCommand(adapter.id, { agents: missingRequired }),
    evidence,
  });
}

function evaluateTrustedReceipts(adapter) {
  const source = TRUSTED_RECEIPT_SOURCES[adapter.id] || "runtime-issued-host-agent-receipt";
  const evidence = { expectedHostInvocationSource: source, receiptCommand: "node scripts/workflow-receipt.mjs issue --host <host> --host-invocation-id <id>" };
  if (adapter.id === "cursor") {
    return degradedCapability({
      reason: "Cursor background execution can be remote/manual; trust requires an explicit host trace instead of automatic local spawn proof",
      evidence,
      allowedOperations: CURSOR_DEGRADED_ALLOWED_OPERATIONS,
    });
  }
  return readyCapability("runtime-issued receipts with host invocation proof are supported", evidence);
}

function evaluateFacadeAvailability(facadeStatus) {
  if (facadeStatus.pass) {
    return readyCapability("facade catalog validates locally", { operationCount: facadeStatus.operationCount, operations: [...facadeStatus.operations] });
  }
  return repairableCapability({
    reason: `facade contract validation failed: ${facadeStatus.issues.map((item) => item.code).join(", ") || "unknown"}`,
    repairCommand: "node --check scripts/lib/supervibe-facade-contract.mjs",
    evidence: { operationCount: facadeStatus.operationCount, operations: [...facadeStatus.operations], issues: facadeStatus.issues },
  });
}

function evaluateSkillsLinked({ adapter, localSkills, sharedSkills, requiredSkillIds }) {
  const missingRequired = requiredSkillIds.filter((skillId) => !localSkills.includes(normalizeSkillId(skillId)));
  const evidence = {
    hostFolder: adapter.skillsFolder,
    localCount: localSkills.length,
    sharedCount: sharedSkills.length,
    requiredCount: requiredSkillIds.length,
    missingRequired,
  };
  if (missingRequired.length === 0 && (localSkills.length > 0 || requiredSkillIds.length === 0)) {
    return readyCapability("host skill folder is linkable and no required skill is missing", evidence);
  }
  if (missingRequired.length === 0 && sharedSkills.length > 0) {
    return readyCapability("shared skills exist; no host-specific skill request is pending", evidence);
  }
  return repairableCapability({
    reason: `required host-linked skills are missing: ${missingRequired.join(", ")}`,
    repairCommand: provisionCommand(adapter.id, { skills: missingRequired }),
    evidence,
  });
}

function evaluateHostDegradedMode({ adapter, callableAgents, trustedReceipts, skillsLinked }) {
  const degradedReasons = [callableAgents, trustedReceipts, skillsLinked]
    .filter((item) => item.status === "degraded")
    .map((item) => item.degradedModeReason);
  return {
    enabled: degradedReasons.length > 0,
    mode: degradedReasons.length > 0 ? adapter.loopCapabilities.fallbackMode || "guided" : "none",
    reason: degradedReasons.join("; ") || null,
    allowedOperations: degradedReasons.length > 0
      ? [...new Set([...(callableAgents.allowedOperations || []), ...(trustedReceipts.allowedOperations || []), ...(skillsLinked.allowedOperations || [])])]
      : [],
  };
}

function evaluateFacadeContract() {
  const operations = listFacadeOperations();
  const validation = validateFacadeCatalog(operations);
  return {
    pass: validation.pass === true,
    operationCount: operations.length,
    operations: operations.map((operation) => operation.id).sort(),
    requiredOperations: [...REQUIRED_FACADE_OPERATIONS],
    issues: validation.issues || [],
  };
}

function evaluateHostNeutralContract(facadeStatus = evaluateFacadeContract()) {
  const hostCapabilities = getHostNeutralCapabilityDefinitions();
  const capabilityIssues = hostCapabilities
    .filter((capability) => capability.providerNeutral !== true)
    .map((capability) => issue("host-capability-neutrality", capability.id, "host capability must be providerNeutral."));
  const missingFacadeOperations = REQUIRED_FACADE_OPERATIONS.filter((operationId) => !facadeStatus.operations.includes(operationId));
  const issues = [
    ...capabilityIssues,
    ...missingFacadeOperations.map((operationId) => issue("missing-facade-operation", operationId, "required facade operation is missing.")),
    ...facadeStatus.issues,
  ];
  return {
    status: issues.length === 0 ? "ready" : "repairable",
    facadeOperations: facadeStatus.operationCount,
    hostNeutralCapabilities: hostCapabilities.length,
    repairCommand: issues.length ? "node --check scripts/lib/supervibe-facade-contract.mjs" : null,
    issues,
  };
}

function unknownHostRow(hostId, hostNeutralContract) {
  const missing = normalizeMissingCapability("hostAdapter", repairableCapability({
    reason: `unknown host adapter: ${hostId}`,
    repairCommand: "node scripts/supervibe-status.mjs --host-doctor",
    evidence: {},
  }));
  return {
    schemaVersion: HOST_READINESS_SCHEMA_VERSION,
    hostId,
    displayName: hostId,
    adapterPaths: {},
    callableAgents: missing,
    trustedReceipts: missing,
    facadeAvailable: missing,
    skillsLinked: missing,
    degradedMode: { enabled: false, mode: "none", reason: null, allowedOperations: [] },
    missingCapabilities: [missing],
    repairCommand: missing.repairCommand,
    hostNeutralContract,
    ready: false,
  };
}

function readyCapability(reason, evidence = {}) {
  return { status: "ready", ready: true, reason, missing: false, repairCommand: null, degradedModeReason: null, allowedOperations: [], evidence };
}

function repairableCapability({ reason, repairCommand, evidence = {} }) {
  return { status: "repairable", ready: false, reason, missing: true, repairCommand, degradedModeReason: null, allowedOperations: [], evidence };
}

function degradedCapability({ reason, evidence = {}, allowedOperations = [] }) {
  return { status: "degraded", ready: false, reason, missing: true, repairCommand: null, degradedModeReason: reason, allowedOperations: [...allowedOperations], evidence };
}

function normalizeMissingCapability(capability, value) {
  return { capability, status: value.status, reason: value.reason, repairCommand: value.repairCommand || null, degradedModeReason: value.degradedModeReason || null, evidence: value.evidence || {} };
}

function provisionCommand(hostId, { agents = [], skills = [] } = {}) {
  return [
    "node scripts/provision-agents.mjs --project-root .",
    `--host ${hostId}`,
    agents.length ? `--agents ${agents.join(",")}` : null,
    skills.length ? `--skills ${skills.map(normalizeSkillId).join(",")}` : null,
  ].filter(Boolean).join(" ");
}

function listDirectMarkdownIds(rootDir, relFolder) {
  const folder = join(rootDir, ...String(relFolder || "").split("/").filter(Boolean));
  if (!existsSync(folder)) return [];
  return readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name.slice(0, -3))
    .sort((a, b) => a.localeCompare(b));
}

function listDirectSkillIds(rootDir, relFolder) {
  const folder = join(rootDir, ...String(relFolder || "").split("/").filter(Boolean));
  if (!existsSync(folder)) return [];
  return readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(folder, entry.name, "SKILL.md")))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

function normalizeSkillId(value) {
  const raw = String(value || "").trim();
  return raw.includes(":") ? raw.split(":").pop() : raw;
}

function summarizeRows(rows) {
  return {
    hosts: rows.length,
    ready: rows.filter((row) => row.ready).length,
    degraded: rows.filter((row) => row.degradedMode?.enabled).length,
    repairable: rows.filter((row) => row.repairCommand).length,
    missingCapabilities: rows.reduce((sum, row) => sum + (row.missingCapabilities?.length || 0), 0),
  };
}

function escapeMarkdownCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|");
}

function issue(code, field, message) {
  return { code, field, message };
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}
