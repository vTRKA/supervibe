const ANTHROPIC_FOLDER = [".", "claude"].join("");
const ANTHROPIC_INSTRUCTION_FILE = ["CLAUDE", ".md"].join("");
const ANTHROPIC_AGENTS_FOLDER = [ANTHROPIC_FOLDER, "agents"].join("/");
const ANTHROPIC_RULES_FOLDER = [ANTHROPIC_FOLDER, "rules"].join("/");
const ANTHROPIC_SKILLS_FOLDER = [ANTHROPIC_FOLDER, "skills"].join("/");
const ANTHROPIC_SETTINGS_FILE = [ANTHROPIC_FOLDER, "settings.json"].join("/");

const LOOP_CAPABILITIES = Object.freeze({
  claude: loopCapability({
    freshContextAdapter: true,
    nativeContinuation: "claude-stop-hook",
    nativeGoalWorkflows: false,
    stopHooks: true,
    teammateIdleHooks: true,
    contextForking: "claude-headless-task-packet",
    recommendedMode: "fresh-context",
    fallbackMode: "guided",
    stabilityScore: 10,
    qualityGateStrategy: "stop-hook-or-supervibe-quality-gate",
    notes: [
      "supports fresh-context adapter",
      "can use Stop/SubagentStop/TeammateIdle hooks for continuation and quality enforcement",
    ],
  }),
  codex: loopCapability({
    freshContextAdapter: true,
    nativeContinuation: "codex-goal-or-supervibe-state",
    nativeGoalWorkflows: true,
    stopHooks: false,
    teammateIdleHooks: false,
    contextForking: "codex-goal-task-packet",
    recommendedMode: "fresh-context",
    fallbackMode: "guided",
    stabilityScore: 10,
    qualityGateStrategy: "codex-goal-state-plus-supervibe-quality-gate",
    notes: [
      "supports fresh-context adapter",
      "uses Supervibe file state as the portable baseline and Codex goal workflows when available",
    ],
  }),
  cursor: loopCapability({
    freshContextAdapter: false,
    supportedExecutionModes: ["dry-run", "guided", "manual"],
    nativeContinuation: "manual-guided",
    nativeGoalWorkflows: false,
    stopHooks: false,
    teammateIdleHooks: false,
    headlessMode: false,
    contextForking: "manual-guided-only",
    permissionPromptBridgeRequired: false,
    spawnReceiptRequired: false,
    externalSpawnRequiresAllowSpawn: false,
    recommendedMode: "guided",
    fallbackMode: "manual",
    stabilityScore: 8,
    qualityGateStrategy: "supervibe-quality-gate",
    degradedWhen: ["fresh-context"],
    notes: [
      "package and rules are supported",
      "fresh-context execution must degrade to guided/manual until a portable adapter exists",
    ],
  }),
  gemini: loopCapability({
    freshContextAdapter: true,
    nativeContinuation: "supervibe-state",
    nativeGoalWorkflows: false,
    stopHooks: false,
    teammateIdleHooks: false,
    contextForking: "gemini-headless-task-packet",
    recommendedMode: "fresh-context",
    fallbackMode: "guided",
    stabilityScore: 9.5,
    qualityGateStrategy: "supervibe-quality-gate",
    notes: [
      "supports fresh-context adapter",
      "portable continuation depends on Supervibe state files",
    ],
  }),
  opencode: loopCapability({
    freshContextAdapter: true,
    nativeContinuation: "supervibe-state",
    nativeGoalWorkflows: false,
    stopHooks: false,
    teammateIdleHooks: false,
    contextForking: "opencode-headless-task-packet",
    recommendedMode: "fresh-context",
    fallbackMode: "guided",
    stabilityScore: 9.5,
    qualityGateStrategy: "supervibe-quality-gate",
    notes: [
      "supports fresh-context adapter",
      "portable continuation depends on Supervibe state files",
    ],
  }),
  copilot: loopCapability({
    freshContextAdapter: false,
    supportedExecutionModes: ["dry-run", "guided", "manual"],
    nativeContinuation: "manual-guided",
    nativeGoalWorkflows: false,
    stopHooks: false,
    teammateIdleHooks: false,
    headlessMode: false,
    contextForking: "manual-guided-only",
    permissionPromptBridgeRequired: false,
    spawnReceiptRequired: false,
    externalSpawnRequiresAllowSpawn: false,
    recommendedMode: "guided",
    fallbackMode: "manual",
    stabilityScore: 7.5,
    qualityGateStrategy: "supervibe-quality-gate",
    degradedWhen: ["fresh-context"],
    notes: [
      "command/docs support can exist independently of a fresh-context execution adapter",
      "fresh-context execution must degrade to guided/manual until a portable adapter exists",
    ],
  }),
});

const HOST_ADAPTERS = Object.freeze([
  adapter("claude", {
    displayName: "Claude Code",
    instructionFiles: [ANTHROPIC_INSTRUCTION_FILE],
    modelFolder: ANTHROPIC_FOLDER,
    agentsFolder: ANTHROPIC_AGENTS_FOLDER,
    rulesFolder: ANTHROPIC_RULES_FOLDER,
    skillsFolder: ANTHROPIC_SKILLS_FOLDER,
    settingsFile: ANTHROPIC_SETTINGS_FILE,
    importStrategy: "markdown-imports-and-managed-blocks",
    detectionMarkers: [ANTHROPIC_INSTRUCTION_FILE, ANTHROPIC_FOLDER],
    unsupportedFeatures: [],
    loopCapabilities: LOOP_CAPABILITIES.claude,
  }),
  adapter("codex", {
    displayName: "OpenAI Codex",
    instructionFiles: ["AGENTS.md"],
    modelFolder: ".codex",
    agentsFolder: ".codex/agents",
    rulesFolder: ".codex/rules",
    skillsFolder: ".codex/skills",
    settingsFile: ".codex/config.json",
    importStrategy: "agents-md-managed-section",
    detectionMarkers: ["AGENTS.md", ".codex"],
    unsupportedFeatures: ["claude-settings-hooks"],
    loopCapabilities: LOOP_CAPABILITIES.codex,
  }),
  adapter("cursor", {
    displayName: "Cursor",
    instructionFiles: [".cursor/rules/supervibe.mdc"],
    modelFolder: ".cursor",
    agentsFolder: ".cursor/agents",
    rulesFolder: ".cursor/rules",
    skillsFolder: ".cursor/skills",
    settingsFile: ".cursor/supervibe.json",
    importStrategy: "cursor-rule-files",
    detectionMarkers: [".cursor", ".cursor/rules"],
    unsupportedFeatures: ["claude-md-imports"],
    loopCapabilities: LOOP_CAPABILITIES.cursor,
  }),
  adapter("gemini", {
    displayName: "Gemini CLI",
    instructionFiles: ["GEMINI.md"],
    modelFolder: ".gemini",
    agentsFolder: ".gemini/agents",
    rulesFolder: ".gemini/rules",
    skillsFolder: ".gemini/skills",
    settingsFile: ".gemini/settings.json",
    importStrategy: "gemini-md-managed-section",
    detectionMarkers: ["GEMINI.md", ".gemini"],
    unsupportedFeatures: ["claude-settings-hooks"],
    loopCapabilities: LOOP_CAPABILITIES.gemini,
  }),
  adapter("opencode", {
    displayName: "OpenCode",
    instructionFiles: ["opencode.json", "AGENTS.md"],
    modelFolder: ".opencode",
    agentsFolder: ".opencode/agents",
    rulesFolder: ".opencode/rules",
    skillsFolder: ".opencode/skills",
    settingsFile: "opencode.json",
    importStrategy: "json-config-plus-agents-md",
    detectionMarkers: ["opencode.json", ".opencode"],
    unsupportedFeatures: ["claude-md-imports", "cursor-mdc-rules"],
    loopCapabilities: LOOP_CAPABILITIES.opencode,
  }),
]);

export function getHostAdapterMatrix() {
  return HOST_ADAPTERS.map(copyAdapter);
}

export function resolveHostAdapter(id) {
  const adapter = HOST_ADAPTERS.find((item) => item.id === id);
  if (!adapter) throw new Error(`Unknown host adapter: ${id}`);
  return copyAdapter(adapter);
}

export function getHostLoopCapabilityMatrix() {
  return Object.entries(LOOP_CAPABILITIES).map(([id, capabilities]) => ({
    id,
    ...copyLoopCapabilities(capabilities),
  }));
}

export function resolveHostLoopCapabilities(id) {
  const capabilities = LOOP_CAPABILITIES[id];
  if (!capabilities) throw new Error(`Unknown host loop capabilities: ${id}`);
  return copyLoopCapabilities(capabilities);
}

export function formatHostLoopCapabilitySummary(ids = Object.keys(LOOP_CAPABILITIES)) {
  return ids.map((id) => {
    const capabilities = resolveHostLoopCapabilities(id);
    return `${id}:${capabilities.freshContextAdapter ? "fresh-context" : "guided"}:${capabilities.nativeContinuation}`;
  }).join(",");
}

function adapter(id, config) {
  return {
    id,
    ...config,
    managedBlock: {
      begin: `<!-- SUPERVIBE:BEGIN managed-context ${id} -->`,
      end: `<!-- SUPERVIBE:END managed-context ${id} -->`,
    },
  };
}

function copyAdapter(adapterConfig) {
  return {
    ...adapterConfig,
    instructionFiles: [...adapterConfig.instructionFiles],
    detectionMarkers: [...adapterConfig.detectionMarkers],
    unsupportedFeatures: [...adapterConfig.unsupportedFeatures],
    managedBlock: { ...adapterConfig.managedBlock },
    loopCapabilities: copyLoopCapabilities(adapterConfig.loopCapabilities),
  };
}

function loopCapability(config = {}) {
  return Object.freeze({
    freshContextAdapter: Boolean(config.freshContextAdapter),
    supportedExecutionModes: [...(config.supportedExecutionModes || ["dry-run", "guided", "fresh-context", "manual"])],
    nativeContinuation: config.nativeContinuation || "supervibe-state",
    nativeGoalWorkflows: Boolean(config.nativeGoalWorkflows),
    stopHooks: Boolean(config.stopHooks),
    teammateIdleHooks: Boolean(config.teammateIdleHooks),
    headlessMode: config.headlessMode ?? Boolean(config.freshContextAdapter),
    contextForking: config.contextForking || (config.freshContextAdapter ? "fresh-context-task-packet" : "manual-guided-only"),
    permissionPromptBridgeRequired: config.permissionPromptBridgeRequired ?? Boolean(config.freshContextAdapter),
    spawnReceiptRequired: config.spawnReceiptRequired ?? Boolean(config.freshContextAdapter),
    externalSpawnRequiresAllowSpawn: config.externalSpawnRequiresAllowSpawn ?? Boolean(config.freshContextAdapter),
    controllerStopSupported: config.controllerStopSupported ?? Boolean(config.freshContextAdapter || config.stopHooks || config.teammateIdleHooks || config.nativeGoalWorkflows),
    worktreeIsolation: config.worktreeIsolation !== false,
    backgroundProcesses: config.backgroundProcesses !== false,
    recommendedMode: config.recommendedMode || "guided",
    fallbackMode: config.fallbackMode || "manual",
    stabilityScore: Number(config.stabilityScore || 8),
    qualityGateStrategy: config.qualityGateStrategy || "supervibe-quality-gate",
    degradedWhen: [...(config.degradedWhen || [])],
    notes: [...(config.notes || [])],
  });
}

function copyLoopCapabilities(capabilities = loopCapability()) {
  return {
    ...capabilities,
    supportedExecutionModes: [...capabilities.supportedExecutionModes],
    degradedWhen: [...capabilities.degradedWhen],
    notes: [...capabilities.notes],
  };
}
