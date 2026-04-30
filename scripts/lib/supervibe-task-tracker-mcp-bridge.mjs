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
