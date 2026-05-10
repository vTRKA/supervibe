export function createTaskTrackerMcpBridge(options = {}) {
  const servers = options.servers || [];
  const approved = Boolean(options.approved);
  const allowedTools = options.allowedTools || [];
  return {
    id: "task-tracker-mcp-bridge",
    transport: "mcp",
    detect() {
      if (servers.length === 0) {
        return {
          available: false,
          status: "unavailable",
          reason: "no MCP servers configured for task tracking",
          servers: [],
          capabilities: { create: false, sync: false, dependencySupport: false },
        };
      }
      return {
        available: approved,
        status: approved ? "available-ready" : "blocked",
        reason: approved ? "MCP task tracker bridge approved" : "MCP task tracker bridge requires explicit approval",
        servers,
        allowedTools,
        capabilities: {
          create: approved && allowedTools.some((tool) => /create|write|issue|task/i.test(tool)),
          sync: approved,
          dependencySupport: approved && allowedTools.some((tool) => /dependency|link|block/i.test(tool)),
        },
      };
    },
    async call(method, payload = {}) {
      const detection = this.detect();
      if (!detection.available) {
        return {
          ok: false,
          status: detection.status,
          reason: detection.reason,
          method,
          payload: redactPayload(payload),
        };
      }
      return {
        ok: true,
        method,
        server: servers[0],
        payload: redactPayload(payload),
      };
    },
  };
}

export function createTaskTrackerMcpAdapter(options = {}) {
  const bridge = createTaskTrackerMcpBridge(options);
  const call = async (method, payload = {}) => {
    const result = await bridge.call(method, payload);
    if (!result.ok) throw new Error(result.reason || `MCP task tracker ${method} failed`);
    return {
      ok: true,
      externalId: payload.externalId || payload.itemId || payload.id || `${method}:${stableId(payload.title || payload.itemId || payload.id || method)}`,
      method,
      transport: "mcp",
      bridge: bridge.id,
      result,
    };
  };
  return {
    id: "task-tracker-mcp",
    transport: "mcp",
    detect: () => bridge.detect(),
    createEpic: (epic) => call("createEpic", epic),
    createTask: (task) => call("createTask", task),
    addDependency: (dependency) => call("addDependency", dependency),
    ready: (query = {}) => call("ready", query),
    claim: (claim = {}) => call("claim", claim),
    update: (update = {}) => call("update", update),
    close: (close = {}) => call("close", close),
    syncPush: (payload = {}) => call("syncPush", payload),
    syncPull: (payload = {}) => call("syncPull", payload),
  };
}

export function assertMcpTaskTrackerApproved(bridge) {
  const detection = bridge.detect();
  if (detection.available) return true;
  throw new Error(`MCP task tracker bridge is not approved: ${detection.reason}`);
}

export function detectMcpTaskTrackerCapability(registry = {}) {
  const mcps = registry.mcps || registry.servers || [];
  const servers = mcps
    .filter((server) => (server.tools || []).some((tool) => /task|issue|epic|dependency/i.test(tool.name || tool)))
    .map((server) => server.name || server.id);
  return createTaskTrackerMcpBridge({
    servers,
    approved: Boolean(registry.approved),
    allowedTools: mcps.flatMap((server) => server.tools || []),
  }).detect();
}

function redactPayload(payload) {
  return JSON.parse(JSON.stringify(payload, (key, value) => {
    if (/token|secret|password|credential/i.test(key)) return "[REDACTED_SECRET]";
    return value;
  }));
}

function stableId(value) {
  return String(value || "item").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "item";
}
