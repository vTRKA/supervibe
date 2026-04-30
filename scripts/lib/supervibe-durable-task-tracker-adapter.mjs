import { createHash } from "node:crypto";

export const TASK_TRACKER_TRANSPORTS = Object.freeze(["native", "cli", "mcp"]);
export const TASK_TRACKER_CAPABILITY_STATES = Object.freeze([
  "unavailable",
  "available-uninitialized",
  "available-ready",
  "degraded",
  "blocked",
]);

export const TASK_TRACKER_METHODS = Object.freeze([
  "detect",
  "version",
  "init",
  "createEpic",
  "createTask",
  "addDependency",
  "ready",
  "claim",
  "update",
  "close",
  "show",
  "export",
  "import",
  "doctor",
  "syncPush",
  "syncPull",
]);

export function createUnavailableTaskTrackerAdapter(reason = "no external tracker configured") {
  return {
    id: "native-json",
    transport: "native",
    async detect() {
      return {
        adapterId: "native-json",
        transport: "native",
        status: "unavailable",
        available: false,
        initialized: false,
        capabilities: nativeCapabilities({ available: false }),
        reason,
      };
    },
    version() {
      return { ok: true, adapterId: "native-json", version: "native-fallback" };
    },
    async init() {
      return { ok: true, mode: "native-fallback", reason };
    },
    async createEpic() {
      return unavailableResult(reason);
    },
    async createTask() {
      return unavailableResult(reason);
    },
    async addDependency() {
      return unavailableResult(reason);
    },
    async ready() {
      return { ok: true, tasks: [], mode: "native-fallback" };
    },
    async claim() {
      return unavailableResult(reason);
    },
    async update() {
      return unavailableResult(reason);
    },
    async close() {
      return unavailableResult(reason);
    },
    async show() {
      return unavailableResult(reason);
    },
    async export() {
      return { ok: true, epics: [], tasks: [], dependencies: [], claims: [], mode: "native-fallback" };
    },
    async import(payload = {}) {
      return { ok: true, payload, mode: "native-fallback" };
    },
    async doctor() {
      return { ok: true, issues: [], mode: "native-fallback" };
    },
    async syncPush() {
      return unavailableResult(reason);
    },
    async syncPull() {
      return { ok: true, epics: [], tasks: [], dependencies: [], claims: [], mode: "native-fallback" };
    },
  };
}

export function createMemoryTaskTrackerAdapter(options = {}) {
  const state = options.state || {
    epics: new Map(),
    tasks: new Map(),
    dependencies: [],
    claims: new Map(),
    initialized: options.initialized !== false,
  };
  const adapterId = options.adapterId || "memory-tracker";

  return {
    id: adapterId,
    transport: "cli",
    async detect() {
      return {
        adapterId,
        transport: "cli",
        status: state.initialized ? "available-ready" : "available-uninitialized",
        available: true,
        initialized: state.initialized,
        capabilities: nativeCapabilities({ available: true, dependencySupport: true, syncSupport: true, worktreeSupport: true }),
        reason: state.initialized ? "memory tracker is initialized" : "memory tracker requires init",
      };
    },
    version() {
      return { ok: true, adapterId, version: options.version || "0.0.0-test" };
    },
    async init() {
      state.initialized = true;
      return { ok: true, adapterId, status: "initialized" };
    },
    async createEpic(epic = {}) {
      const externalId = options.externalIdFactory?.(epic.itemId || epic.epicId, "epic") || `EXT-${stableHash(epic.itemId || epic.epicId).slice(0, 8)}`;
      const record = { ...epic, externalId, type: "epic" };
      state.epics.set(externalId, record);
      return { ok: true, adapterId, externalId, record };
    },
    async createTask(task = {}) {
      const externalId = options.externalIdFactory?.(task.itemId || task.id, "task") || `EXT-${stableHash(task.itemId || task.id).slice(0, 8)}`;
      const record = { ...task, externalId, type: task.type || "task", status: task.status || "open" };
      state.tasks.set(externalId, record);
      return { ok: true, adapterId, externalId, record };
    },
    async addDependency(dependency = {}) {
      const record = {
        fromExternalId: dependency.fromExternalId,
        toExternalId: dependency.toExternalId,
        type: dependency.type || "blocks",
      };
      if (!state.dependencies.some((item) => item.fromExternalId === record.fromExternalId && item.toExternalId === record.toExternalId && item.type === record.type)) {
        state.dependencies.push(record);
      }
      return { ok: true, adapterId, record };
    },
    async ready() {
      const blocked = new Set(state.dependencies.map((dependency) => dependency.toExternalId));
      return {
        ok: true,
        adapterId,
        tasks: [...state.tasks.values()].filter((task) => !blocked.has(task.externalId) && !["complete", "closed"].includes(task.status)),
      };
    },
    async claim({ externalId, owner, sessionId, worktreePath } = {}) {
      if (state.claims.has(externalId)) {
        return { ok: false, adapterId, status: "already_claimed", claim: state.claims.get(externalId) };
      }
      const claim = { externalId, owner, sessionId, worktreePath, status: "active", claimedAt: new Date().toISOString() };
      state.claims.set(externalId, claim);
      return { ok: true, adapterId, claim };
    },
    async update({ externalId, patch = {} } = {}) {
      const target = state.tasks.get(externalId) || state.epics.get(externalId);
      if (!target) return { ok: false, adapterId, status: "not_found", externalId };
      Object.assign(target, patch);
      return { ok: true, adapterId, record: target };
    },
    async close({ externalId, evidence = [], reason = "completed" } = {}) {
      const target = state.tasks.get(externalId) || state.epics.get(externalId);
      if (!target) return { ok: false, adapterId, status: "not_found", externalId };
      target.status = "complete";
      target.closedAt = new Date().toISOString();
      target.closeReason = reason;
      target.evidence = evidence;
      state.claims.delete(externalId);
      return { ok: true, adapterId, record: target };
    },
    async show({ externalId } = {}) {
      return { ok: true, adapterId, record: state.tasks.get(externalId) || state.epics.get(externalId) || null };
    },
    async export() {
      return exportMemoryState(state, adapterId);
    },
    async import(payload = {}) {
      for (const epic of payload.epics || []) state.epics.set(epic.externalId, epic);
      for (const task of payload.tasks || []) state.tasks.set(task.externalId, task);
      state.dependencies = [...(payload.dependencies || [])];
      return { ok: true, adapterId, imported: { epics: payload.epics?.length || 0, tasks: payload.tasks?.length || 0 } };
    },
    async doctor() {
      return { ok: true, adapterId, issues: [] };
    },
    async syncPush(payload = {}) {
      return { ok: true, adapterId, pushed: payload.items?.length || payload.tasks?.length || 0 };
    },
    async syncPull() {
      return exportMemoryState(state, adapterId);
    },
    _state: state,
  };
}

export function detectTaskTrackerCapability({
  adapter = null,
  availableCommands = {},
  command = "supervibe-task",
  mcpServers = [],
  initialized = false,
  worktreePath = null,
  dependencySupport = true,
  syncSupport = true,
} = {}) {
  if (adapter?.detect) return adapter.detect();
  const cliAvailable = Boolean(availableCommands[command]);
  const mcpAvailable = mcpServers.length > 0;
  const available = cliAvailable || mcpAvailable;
  const status = !available
    ? "unavailable"
    : initialized
      ? "available-ready"
      : "available-uninitialized";
  return {
    adapterId: available ? (cliAvailable ? "cli" : "mcp") : "native-json",
    transport: cliAvailable ? "cli" : mcpAvailable ? "mcp" : "native",
    status,
    available,
    initialized,
    capabilities: nativeCapabilities({
      available,
      cliAvailable,
      mcpAvailable,
      worktreeSupport: Boolean(worktreePath),
      dependencySupport,
      syncSupport,
    }),
    reason: available ? "task tracker capability detected" : "native JSON graph fallback is active",
  };
}

export function assertTaskTrackerAdapter(adapter) {
  const missing = TASK_TRACKER_METHODS.filter((method) => typeof adapter?.[method] !== "function");
  if (missing.length > 0) {
    throw new Error(`Task tracker adapter is missing methods: ${missing.join(", ")}`);
  }
  return true;
}

export function parseJsonAdapterOutput(output = "") {
  if (typeof output !== "string") return { ok: true, value: output };
  try {
    return { ok: true, value: JSON.parse(output) };
  } catch (error) {
    return { ok: false, error: error.message, raw: output };
  }
}

function nativeCapabilities({
  available = true,
  cliAvailable = false,
  mcpAvailable = false,
  worktreeSupport = false,
  dependencySupport = false,
  syncSupport = false,
} = {}) {
  return {
    cli: cliAvailable,
    mcp: mcpAvailable,
    nativeGraphFallback: true,
    worktreeSupport: Boolean(worktreeSupport),
    dependencySupport: Boolean(dependencySupport && available),
    syncSupport: Boolean(syncSupport && available),
    jsonOutput: true,
  };
}

function unavailableResult(reason) {
  return {
    ok: false,
    mode: "native-fallback",
    status: "tracker_unavailable",
    reason,
    remediation: ["continue with native JSON graph", "configure a CLI or MCP tracker before enabling sync"],
  };
}

function exportMemoryState(state, adapterId) {
  return {
    ok: true,
    adapterId,
    epics: [...state.epics.values()],
    tasks: [...state.tasks.values()],
    dependencies: [...state.dependencies],
    claims: [...state.claims.values()],
  };
}

function stableHash(value) {
  return createHash("sha1").update(String(value)).digest("hex");
}
