import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT_MS = 10_000;

export function createCliTaskTrackerAdapter(options = {}) {
  const command = options.command || process.env.SUPERVIBE_TASK_TRACKER_COMMAND || "supervibe-task";
  const baseArgs = Array.isArray(options.baseArgs) ? options.baseArgs : [];
  const adapterId = options.adapterId || "external-cli";
  const cwd = options.cwd || process.cwd();
  const env = { ...process.env, ...(options.env || {}) };
  const timeout = Number(options.timeoutMs || options.timeout || DEFAULT_TIMEOUT_MS);

  async function run(args = [], payload = null) {
    const renderedArgs = [...baseArgs, ...args, "--json"];
    if (payload) renderedArgs.push("--payload", JSON.stringify(redactTrackerPayload(payload)));
    try {
      const result = await execFileAsync(command, renderedArgs, {
        cwd,
        env,
        timeout,
        windowsHide: true,
        maxBuffer: options.maxBuffer || 1024 * 1024,
      });
      return normalizeCliOutput(result.stdout, { adapterId, command, args });
    } catch (error) {
      return {
        ok: false,
        adapterId,
        status: error.code === "ENOENT" ? "unavailable" : "command_failed",
        reason: error.message,
        stderr: String(error.stderr || "").slice(0, 2000),
        args: redactTrackerPayload(args),
      };
    }
  }

  return {
    id: adapterId,
    transport: "cli",
    async detect() {
      const version = await run(["--version"]);
      if (!version.ok) {
        return {
          adapterId,
          transport: "cli",
          status: "unavailable",
          available: false,
          initialized: false,
          reason: version.reason || "external CLI tracker unavailable",
          capabilities: cliCapabilities({ available: false }),
        };
      }
      const initialized = version.initialized !== false;
      return {
        adapterId,
        transport: "cli",
        status: initialized ? "available-ready" : "available-uninitialized",
        available: true,
        initialized,
        version: version.version || version.record?.version || options.version || "unknown",
        reason: initialized ? "external CLI tracker ready" : "external CLI tracker requires init",
        capabilities: cliCapabilities({ available: true }),
      };
    },
    version() {
      return { ok: true, adapterId, version: options.version || "external-cli" };
    },
    init() {
      return run(["init"]);
    },
    createEpic(epic = {}) {
      return run(buildCreateArgs({ ...epic, type: "epic" }), epic);
    },
    createTask(task = {}) {
      return run(buildCreateArgs({ ...task, type: task.type || "task" }), task);
    },
    addDependency(dependency = {}) {
      return run([
        "dep",
        dependency.fromExternalId,
        dependency.toExternalId,
        "--type",
        dependency.type || "blocks",
      ].filter(Boolean), dependency);
    },
    ready() {
      return run(["ready"]);
    },
    claim({ externalId, owner, sessionId, worktreePath } = {}) {
      return run([
        "update",
        externalId,
        "--claim",
        owner,
        sessionId ? "--session" : null,
        sessionId,
        worktreePath ? "--worktree" : null,
        worktreePath,
      ].filter(Boolean), { externalId, owner, sessionId, worktreePath });
    },
    update({ externalId, patch = {} } = {}) {
      return run(["update", externalId, "--patch", JSON.stringify(redactTrackerPayload(patch))].filter(Boolean), { externalId, patch });
    },
    close({ externalId, evidence = [], reason = "completed" } = {}) {
      return run([
        "close",
        externalId,
        "--reason",
        reason,
        "--evidence",
        JSON.stringify(evidence),
      ].filter(Boolean), { externalId, evidence, reason });
    },
    show({ externalId } = {}) {
      return run(["show", externalId].filter(Boolean));
    },
    export() {
      return run(["export"]);
    },
    import(payload = {}) {
      return run(["import"], payload);
    },
    doctor() {
      return run(["doctor"]);
    },
    syncPush(payload = {}) {
      return run(["sync", "push"], payload);
    },
    syncPull() {
      return run(["sync", "pull"]);
    },
  };
}

export function redactTrackerPayload(value) {
  if (Array.isArray(value)) return value.map(redactTrackerPayload);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
    key,
    /token|secret|password|credential/i.test(key) ? "[REDACTED_SECRET]" : redactTrackerPayload(entry),
  ]));
}

function buildCreateArgs(item = {}) {
  return [
    "create",
    "--type",
    item.type || "task",
    "--title",
    item.title || item.goal || item.itemId || item.id || "task",
    "--id",
    item.itemId || item.id,
    item.parentExternalId ? "--parent" : null,
    item.parentExternalId,
    item.sourcePlanPath ? "--source-plan" : null,
    item.sourcePlanPath,
  ].filter(Boolean);
}

function normalizeCliOutput(stdout, context = {}) {
  const raw = String(stdout || "").trim();
  if (!raw) return { ok: true, adapterId: context.adapterId, status: "empty" };
  try {
    const parsed = JSON.parse(raw);
    return normalizeEnvelope(parsed, context);
  } catch (error) {
    return {
      ok: false,
      adapterId: context.adapterId,
      status: "invalid_json",
      reason: error.message,
      raw: raw.slice(0, 2000),
    };
  }
}

function normalizeEnvelope(value, context = {}) {
  if (!value || typeof value !== "object") {
    return { ok: true, adapterId: context.adapterId, value };
  }
  const externalId = value.externalId || value.id || value.record?.externalId || value.record?.id || null;
  return {
    adapterId: context.adapterId,
    ...value,
    ok: value.ok !== false,
    externalId,
    tasks: value.tasks || value.ready || [],
  };
}

function cliCapabilities({ available = false } = {}) {
  return {
    cli: available,
    mcp: false,
    nativeGraphFallback: true,
    worktreeSupport: available,
    dependencySupport: available,
    syncSupport: available,
    jsonOutput: available,
  };
}
