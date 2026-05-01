import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const DEFAULT_SCHEMA_VERSION = 1;

function defaultCheckpointDir(rootDir = process.cwd()) {
  return join(rootDir, ".supervibe", "memory", "checkpoints");
}

function checkpointPathForTask(taskId, { rootDir = process.cwd(), checkpointDir = defaultCheckpointDir(rootDir) } = {}) {
  return join(checkpointDir, `${sanitizeId(taskId)}.json`);
}

export function createAgentCheckpoint(input = {}) {
  const checkpoint = {
    schemaVersion: DEFAULT_SCHEMA_VERSION,
    checkpointId: input.checkpointId || `${input.taskId || "task"}:${input.stepId || "step"}:${input.ts || "local"}`,
    ts: input.ts || new Date().toISOString(),
    taskId: input.taskId || null,
    userIntent: input.userIntent || "",
    selectedAgent: input.selectedAgent || input.agentId || null,
    retrievalPolicy: input.retrievalPolicy || { memory: "optional", rag: "optional", codegraph: "optional", reason: "not specified" },
    memoryIds: unique(input.memoryIds),
    ragChunkIds: unique(input.ragChunkIds),
    graphSymbols: unique(input.graphSymbols),
    approvals: input.approvals || [],
    completedSideEffects: (input.completedSideEffects || []).map(normalizeSideEffect),
    verificationCommands: unique(input.verificationCommands),
    nextSafeAction: input.nextSafeAction || "",
    contextGeneratedAt: input.contextGeneratedAt || input.ts || new Date().toISOString(),
    redactionStatus: input.redactionStatus || "redacted",
  };
  return { ...checkpoint, validation: validateAgentCheckpoint(checkpoint) };
}

function validateAgentCheckpoint(checkpoint = {}) {
  const failures = [];
  if (!checkpoint.taskId) failures.push("checkpoint missing task ID");
  if (!checkpoint.selectedAgent) failures.push("checkpoint missing selected agent");
  if (!checkpoint.retrievalPolicy) failures.push("checkpoint missing retrieval policy, evidence IDs or next safe action");
  if (!checkpoint.memoryIds?.length && checkpoint.retrievalPolicy?.memory === "mandatory") failures.push("checkpoint missing retrieval policy, evidence IDs or next safe action");
  if (!checkpoint.ragChunkIds?.length && checkpoint.retrievalPolicy?.rag === "mandatory") failures.push("checkpoint missing retrieval policy, evidence IDs or next safe action");
  if (!checkpoint.graphSymbols?.length && checkpoint.retrievalPolicy?.codegraph === "mandatory") failures.push("checkpoint missing retrieval policy, evidence IDs or next safe action");
  if (!checkpoint.nextSafeAction) failures.push("checkpoint missing retrieval policy, evidence IDs or next safe action");
  if (!checkpoint.verificationCommands?.length) failures.push("checkpoint missing verification commands");
  return {
    pass: failures.length === 0,
    failures,
  };
}

export async function writeAgentCheckpoint(checkpointInput, { rootDir = process.cwd(), checkpointDir = defaultCheckpointDir(rootDir) } = {}) {
  const checkpoint = createAgentCheckpoint(checkpointInput);
  const path = checkpointPathForTask(checkpoint.taskId || checkpoint.checkpointId, { rootDir, checkpointDir });
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");
  return { ...checkpoint, path };
}

export async function readAgentCheckpoint(taskId, { rootDir = process.cwd(), checkpointDir = defaultCheckpointDir(rootDir) } = {}) {
  const path = checkpointPathForTask(taskId, { rootDir, checkpointDir });
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, "utf8"));
}

async function listAgentCheckpoints({ rootDir = process.cwd(), checkpointDir = defaultCheckpointDir(rootDir) } = {}) {
  if (!existsSync(checkpointDir)) return [];
  const files = await readdir(checkpointDir, { withFileTypes: true });
  const checkpoints = [];
  for (const file of files) {
    if (!file.isFile() || !file.name.endsWith(".json")) continue;
    try {
      const checkpoint = JSON.parse(await readFile(join(checkpointDir, file.name), "utf8"));
      checkpoints.push({ ...checkpoint, path: join(checkpointDir, file.name), validation: validateAgentCheckpoint(checkpoint) });
    } catch {}
  }
  return checkpoints.sort((a, b) => String(a.taskId).localeCompare(String(b.taskId)));
}

export function resumeAgentCheckpoint(checkpoint = {}, { now = new Date().toISOString(), maxContextAgeMinutes = 240, requestedSideEffect = null } = {}) {
  const validation = validateAgentCheckpoint(checkpoint);
  const ageMinutes = ageInMinutes(checkpoint.contextGeneratedAt, now);
  const contextFresh = ageMinutes <= maxContextAgeMinutes;
  const sideEffectAlreadyDone = requestedSideEffect
    ? (checkpoint.completedSideEffects || []).some((effect) => effect.id === requestedSideEffect || effect.command === requestedSideEffect)
    : false;
  return {
    pass: validation.pass && contextFresh && !sideEffectAlreadyDone,
    validation,
    contextFresh,
    ageMinutes,
    sideEffectAlreadyDone,
    nextSafeAction: contextFresh ? checkpoint.nextSafeAction : "revalidate stale context before continuing",
    replayGuard: sideEffectAlreadyDone ? "do not repeat write operation without side-effect ledger match" : "safe to continue read-only or approved next action",
  };
}

export async function checkpointDiagnostics({ rootDir = process.cwd() } = {}) {
  const checkpoints = await listAgentCheckpoints({ rootDir });
  const invalid = checkpoints.filter((checkpoint) => !checkpoint.validation.pass);
  return {
    pass: invalid.length === 0,
    total: checkpoints.length,
    invalid,
    checkpoints,
  };
}

export function formatCheckpointDiagnostics(report = {}) {
  const lines = [
    "SUPERVIBE_CHECKPOINT_DIAGNOSTICS",
    `PASS: ${Boolean(report.pass)}`,
    `CHECKPOINTS: ${report.total || 0}`,
    `INVALID: ${report.invalid?.length || 0}`,
  ];
  for (const checkpoint of report.invalid || []) {
    lines.push(`- ${checkpoint.taskId || checkpoint.checkpointId}: ${checkpoint.validation.failures.join("; ")}`);
  }
  for (const checkpoint of (report.checkpoints || []).filter((item) => item.validation?.pass).slice(0, 5)) {
    lines.push(`- ${checkpoint.taskId}: next=${checkpoint.nextSafeAction}`);
  }
  return lines.join("\n");
}

function normalizeSideEffect(effect = {}) {
  if (typeof effect === "string") return { id: effect, command: effect, approved: true };
  return {
    id: effect.id || effect.command || "side-effect",
    command: effect.command || "",
    approved: effect.approved !== false,
    ledgerId: effect.ledgerId || null,
  };
}

function sanitizeId(value = "task") {
  return String(value).replace(/[^A-Za-z0-9_.-]+/g, "-").slice(0, 120) || "task";
}

function unique(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(String).filter(Boolean))];
}

function ageInMinutes(date, now) {
  const start = Date.parse(date || "");
  const end = Date.parse(now || "");
  if (!Number.isFinite(start) || !Number.isFinite(end)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.round((end - start) / 60_000));
}
