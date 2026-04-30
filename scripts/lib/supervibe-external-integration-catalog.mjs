export const INTEGRATION_CAPABILITY_LEVELS = Object.freeze([
  "unavailable",
  "local-read",
  "local-write",
  "network-read",
  "network-write",
  "degraded",
  "blocked",
]);

const DEFAULT_INTEGRATIONS = [
  { id: "native-json", name: "Native graph", command: null, level: "local-write", mutation: "local", defaultSafe: true },
  { id: "git", name: "Git", command: "git", level: "local-read", mutation: "local" },
  { id: "gh", name: "GitHub CLI", command: "gh", level: "network-write", mutation: "remote", approval: "network:github + remote_mutation" },
  { id: "jira", name: "Jira CLI", command: "jira", level: "network-write", mutation: "remote", approval: "network:jira + remote_mutation" },
  { id: "linear", name: "Linear CLI", command: "linear", level: "network-write", mutation: "remote", approval: "network:linear + remote_mutation" },
  { id: "notion", name: "Notion helpers", command: "notion", level: "network-write", mutation: "remote", approval: "network:notion + remote_mutation" },
  { id: "slack", name: "Slack webhook", command: null, level: "network-write", mutation: "remote", approval: "network:slack + webhook_allowlist" },
  { id: "ci", name: "CI helpers", command: "gh", level: "network-read", mutation: "remote", approval: "network:ci" },
  { id: "mcp", name: "MCP bridge", command: null, level: "network-read", mutation: "provider", approval: "mcp server approval" },
];

export function createIntegrationCatalog({
  availableCommands = [],
  mcpRegistry = { mcps: [] },
  env = {},
  policy = {},
  adapters = DEFAULT_INTEGRATIONS,
} = {}) {
  const commandSet = new Set(availableCommands);
  const integrations = adapters.map((adapter) => {
    const available = adapter.defaultSafe
      || (adapter.command ? commandSet.has(adapter.command) : false)
      || (adapter.id === "mcp" && (mcpRegistry.mcps || []).length > 0)
      || (adapter.id === "slack" && Boolean(env.SUPERVIBE_WEBHOOK_URL));
    const blocked = isBlocked(adapter, policy);
    const level = blocked ? "blocked" : available ? adapter.level : "unavailable";
    return {
      id: adapter.id,
      name: adapter.name,
      available,
      level,
      command: adapter.command,
      readOnlyByDefault: adapter.mutation !== "remote",
      remoteMutation: adapter.mutation === "remote",
      approvalRequired: adapter.mutation === "remote" ? adapter.approval : null,
      nextSafeAction: nextSafeAction({ adapter, available, blocked }),
    };
  });
  return {
    schemaVersion: 1,
    nativeGraphFallback: "native-json",
    integrations,
    safestAdapter: chooseSafestAdapter(integrations),
    approvalNeeded: integrations.filter((item) => item.available && item.remoteMutation).map((item) => ({
      id: item.id,
      approval: item.approvalRequired,
    })),
  };
}

export function formatIntegrationCatalog(catalog = {}) {
  const lines = [
    "SUPERVIBE_INTEGRATION_CATALOG",
    `NATIVE_FALLBACK: ${catalog.nativeGraphFallback || "native-json"}`,
    `SAFEST_ADAPTER: ${catalog.safestAdapter?.id || "native-json"}`,
  ];
  for (const item of catalog.integrations || []) {
    lines.push(`- ${item.id}: ${item.level} approval=${item.approvalRequired || "none"} next=${item.nextSafeAction}`);
  }
  return lines.join("\n");
}

export function summarizeIntegrationCatalog(catalog = {}) {
  const counts = Object.fromEntries(INTEGRATION_CAPABILITY_LEVELS.map((level) => [level, 0]));
  for (const item of catalog.integrations || []) counts[item.level] = (counts[item.level] || 0) + 1;
  return {
    counts,
    safestAdapter: catalog.safestAdapter?.id || "native-json",
    networkWriteAvailable: (catalog.integrations || []).some((item) => item.level === "network-write"),
    approvals: catalog.approvalNeeded || [],
  };
}

function chooseSafestAdapter(integrations = []) {
  return integrations.find((item) => item.id === "native-json")
    || integrations.find((item) => item.available && item.level === "local-write")
    || integrations.find((item) => item.available && item.level === "local-read")
    || { id: "native-json", level: "local-write" };
}

function isBlocked(adapter, policy) {
  if (policy.blockNetwork && adapter.mutation === "remote") return true;
  if ((policy.blockedIntegrations || []).includes(adapter.id)) return true;
  return false;
}

function nextSafeAction({ adapter, available, blocked }) {
  if (blocked) return "resolve policy block";
  if (!available) return adapter.defaultSafe ? "use native graph" : "install or configure integration";
  if (adapter.mutation === "remote") return `request approval: ${adapter.approval}`;
  return "safe to inspect locally";
}
