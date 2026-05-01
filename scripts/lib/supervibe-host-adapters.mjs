const ANTHROPIC_FOLDER = [".", "claude"].join("");
const ANTHROPIC_INSTRUCTION_FILE = ["CLAUDE", ".md"].join("");
const ANTHROPIC_AGENTS_FOLDER = [ANTHROPIC_FOLDER, "agents"].join("/");
const ANTHROPIC_RULES_FOLDER = [ANTHROPIC_FOLDER, "rules"].join("/");
const ANTHROPIC_SKILLS_FOLDER = [ANTHROPIC_FOLDER, "skills"].join("/");
const ANTHROPIC_SETTINGS_FILE = [ANTHROPIC_FOLDER, "settings.json"].join("/");

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
  };
}
