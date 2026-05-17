const AUTOREPAIR_PLAN_VERSION = "SupervibeIndexAutorepairPlanV1";
const DEFAULT_SMALL_DELTA_LIMIT = 50;
const DEFAULT_SOURCE_SECONDS = 120;

function cleanRelPath(value = "") {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
}

function normalizePositiveInt(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.trunc(num) : fallback;
}

function shQuote(value) {
  const text = String(value ?? "");
  if (/^[A-Za-z0-9_./:=@-]+$/.test(text)) return text;
  return JSON.stringify(text);
}

function commandLine(args) {
  return args.map(shQuote).join(" ");
}

function selectRepairFiles(files = [], limit = DEFAULT_SMALL_DELTA_LIMIT) {
  return [...files]
    .map((file) => ({
      relPath: cleanRelPath(file.relPath || file.path || ""),
      reason: String(file.reason || "unknown"),
      language: String(file.language || "unknown"),
    }))
    .filter((file) => file.relPath)
    .sort((a, b) => a.relPath.localeCompare(b.relPath) || a.reason.localeCompare(b.reason))
    .slice(0, limit);
}

export function createIndexRepairLockOwner({
  owner = "",
  invocation = "",
  source = "build-code-index",
  pid = process.pid,
} = {}) {
  return {
    owner: String(owner || process.env.SUPERVIBE_INDEX_LOCK_OWNER || source || "build-code-index"),
    invocation: String(invocation || process.env.SUPERVIBE_INDEX_LOCK_INVOCATION || `pid-${pid}`),
    source: String(source || "build-code-index"),
  };
}

export function buildSmallDeltaAutorepairPlan({
  report,
  lockStatus = null,
  rootArg = ".",
  includeStructure = false,
  sourceOnly = false,
  maxFiles = 0,
  maxSeconds = DEFAULT_SOURCE_SECONDS,
  smallDeltaLimit = DEFAULT_SMALL_DELTA_LIMIT,
  jsonProgress = true,
} = {}) {
  const limit = normalizePositiveInt(maxFiles || smallDeltaLimit, DEFAULT_SMALL_DELTA_LIMIT);
  const deltaLimit = normalizePositiveInt(smallDeltaLimit, DEFAULT_SMALL_DELTA_LIMIT);
  const total = Math.max(Number(report?.files?.length || 0), Number(report?.knownMissing || 0));
  const knownFailedSkipped = Number(report?.knownFailedSkipped?.length || 0);
  const selected = selectRepairFiles(report?.files || [], Math.min(limit, deltaLimit));
  const liveLock = lockStatus?.present && lockStatus.status === "live";
  const tooLarge = total > deltaLimit;
  const baseArgs = ["node", "scripts/build-code-index.mjs", "--root", rootArg, "--resume"];
  const commonArgs = ["--max-files", String(selected.length || Math.min(total, deltaLimit)), "--health"];
  if (maxSeconds > 0) commonArgs.push("--max-seconds", String(normalizePositiveInt(maxSeconds, DEFAULT_SOURCE_SECONDS)));
  if (jsonProgress) commonArgs.push("--json-progress");
  const needsEmbeddingRepair = selected.some((file) => /embedding/i.test(file.reason));
  const needsSourceRepair = selected.some((file) => !/embedding/i.test(file.reason));

  const commands = [];
  if (selected.length > 0 && !liveLock && !tooLarge) {
    if (needsSourceRepair) {
      commands.push({
        id: "source-readiness",
        mode: "explicit-run",
        command: commandLine([...baseArgs, "--source-only", ...commonArgs]),
      });
    }
    if (includeStructure && !sourceOnly && needsSourceRepair) {
      commands.push({
        id: "structure-readiness",
        mode: "explicit-run",
        command: commandLine([...baseArgs, "--graph", "--max-files", String(selected.length), "--health"]),
      });
    }
    if (!sourceOnly && needsEmbeddingRepair) {
      commands.push({
        id: "semantic-embeddings",
        mode: "explicit-run",
        command: commandLine([...baseArgs, "--embeddings-only", "--max-files", String(selected.length), "--health"]),
      });
    }
  }

  let status = "planned";
  let reason = "small-delta";
  if (total === 0) {
    status = "noop";
    reason = "no-missing-or-stale-files";
  } else if (liveLock) {
    status = "blocked";
    reason = "live-lock-present";
  } else if (tooLarge) {
    status = "manual";
    reason = "delta-exceeds-small-limit";
  }

  return {
    schemaVersion: AUTOREPAIR_PLAN_VERSION,
    status,
    safeToRun: status === "planned",
    reason,
    deterministic: true,
    destructiveWrites: false,
    daemon: false,
    rootArg,
    counts: {
      eligibleSourceFiles: Number(report?.inventory?.files?.length || 0),
      indexedRows: Number(report?.indexedRows || 0),
      missingOrStale: total,
      selected: selected.length,
      smallDeltaLimit: deltaLimit,
      knownFailedSkipped,
    },
    lock: lockStatus ? {
      status: lockStatus.status || "unknown",
      pid: lockStatus.pid || null,
      owner: lockStatus.owner || null,
      invocation: lockStatus.invocation || null,
      safeToResume: lockStatus.safeToResume === true,
    } : null,
    selectedFiles: selected,
    commands,
    exits: {
      noop: 0,
      planned: 0,
      blocked: 2,
      manual: 3,
    },
  };
}

export function formatSmallDeltaAutorepairPlan(plan = {}) {
  const lines = [
    "SUPERVIBE_INDEX_AUTOREPAIR_PLAN",
    `SCHEMA: ${plan.schemaVersion || AUTOREPAIR_PLAN_VERSION}`,
    `STATUS: ${plan.status || "unknown"}`,
    `SAFE_TO_RUN: ${plan.safeToRun ? "true" : "false"}`,
    `REASON: ${plan.reason || "unknown"}`,
    `DETERMINISTIC: ${plan.deterministic ? "true" : "false"}`,
    `DESTRUCTIVE_WRITES: ${plan.destructiveWrites ? "true" : "false"}`,
    `DAEMON: ${plan.daemon ? "true" : "false"}`,
    `MISSING_OR_STALE: ${plan.counts?.missingOrStale ?? 0}`,
    `SELECTED: ${plan.counts?.selected ?? 0}`,
    `SMALL_DELTA_LIMIT: ${plan.counts?.smallDeltaLimit ?? DEFAULT_SMALL_DELTA_LIMIT}`,
    `KNOWN_FAILED_SKIPPED: ${plan.counts?.knownFailedSkipped ?? 0}`,
    `LOCK_STATUS: ${plan.lock?.status || "none"}`,
    `LOCK_OWNER: ${plan.lock?.owner || "none"}`,
    `LOCK_INVOCATION: ${plan.lock?.invocation || "none"}`,
  ];
  for (const file of plan.selectedFiles || []) {
    lines.push(`- ${file.relPath} (${file.reason})`);
  }
  for (const item of plan.commands || []) {
    lines.push(`COMMAND ${item.id}: ${item.command}`);
  }
  return lines.join("\n");
}

export function exitCodeForAutorepairPlan(plan = {}) {
  return Number(plan.exits?.[plan.status] ?? (plan.safeToRun ? 0 : 1));
}
