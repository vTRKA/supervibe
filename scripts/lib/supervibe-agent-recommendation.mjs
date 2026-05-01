import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { planContextMigration } from "./supervibe-context-migrator.mjs";
import { selectHostAdapter } from "./supervibe-host-detector.mjs";

const PROFILE_CHOICES = Object.freeze([
  choice("minimal", "Recommended default: core routing, review, debugging and detected stack specialists.", true),
  choice("product-design", "Adds product, UX, prototype, presentation and polish agents."),
  choice("full-stack", "Adds security, data, performance and ops coverage for larger systems."),
  choice("research-heavy", "Adds researcher-style agents for uncertain stacks and stale best practices."),
  choice("custom", "Lets the user add, remove or defer exact groups before writing files."),
]);

const ADD_ON_CHOICES = Object.freeze([
  choice("none", "Keep the selected profile only.", true),
  choice("security-audit", "Explicit add-on for vulnerability review and prioritized remediation."),
  choice("ai-prompting", "Explicit add-on for prompts, agent instructions, intent routing and evals."),
  choice("network-ops", "Explicit add-on for read-only router/network diagnostics; never selected by default."),
]);

const GROUPS = Object.freeze([
  group("core", "Core orchestration", ["supervibe-orchestrator", "repo-researcher", "code-reviewer", "quality-gate-reviewer", "root-cause-debugger"], ["minimal", "product-design", "full-stack", "research-heavy"]),
  group("react-frontend", "React frontend", ["react-implementer", "ux-ui-designer", "accessibility-reviewer"], ["minimal", "product-design", "full-stack"], ["react", "vite", "tanstack-router", "tailwind"]),
  group("tauri-desktop", "Tauri desktop", ["tauri-ui-designer", "tauri-rust-engineer"], ["minimal", "full-stack"], ["tauri"]),
  group("rust-backend", "Rust backend and IPC", ["tauri-rust-engineer", "ipc-contract-reviewer", "api-contract-reviewer"], ["minimal", "full-stack"], ["rust", "tauri"]),
  group("data-postgres", "Postgres data layer", ["data-modeler", "db-reviewer"], ["full-stack"], ["postgres", "sqlx"]),
  group("product-design", "Product and design", ["product-manager", "ux-ui-designer", "prototype-builder", "ui-polish-reviewer"], ["product-design", "full-stack"]),
  group("ops-security", "Operations and security", ["security-auditor", "performance-reviewer", "dependency-reviewer"], ["full-stack"]),
  group("research", "Research-heavy support", ["repo-researcher", "security-researcher", "dependency-reviewer"], ["research-heavy"]),
]);

const ADD_ON_AGENTS = Object.freeze({
  "security-audit": ["security-auditor"],
  "ai-prompting": ["prompt-ai-engineer"],
  "network-ops": ["network-router-engineer"],
});

export function discoverGenesisStackFingerprint({ rootDir = process.cwd() } = {}) {
  const facts = [];
  const tags = new Set();
  const packagePath = join(rootDir, "package.json");
  if (existsSync(packagePath)) {
    const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    for (const name of Object.keys(deps)) {
      const normalized = normalizeStackTag(name);
      if (normalized) {
        tags.add(normalized);
        facts.push({ source: "package.json", name, tag: normalized });
      }
    }
  }
  const cargoPath = join(rootDir, "src-tauri", "Cargo.toml");
  if (existsSync(cargoPath)) {
    const cargo = readFileSync(cargoPath, "utf8");
    tags.add("rust");
    facts.push({ source: "src-tauri/Cargo.toml", name: "cargo", tag: "rust" });
    if (/^\s*tauri\s*=/m.test(cargo)) {
      tags.add("tauri");
      facts.push({ source: "src-tauri/Cargo.toml", name: "tauri", tag: "tauri" });
    }
    if (/sqlx|postgres/i.test(cargo)) {
      tags.add("postgres");
      tags.add("sqlx");
      facts.push({ source: "src-tauri/Cargo.toml", name: "sqlx/postgres", tag: "postgres" });
    }
  }
  return {
    rootDir,
    tags: [...tags].sort(),
    facts,
  };
}

export function buildGenesisAgentRecommendation({
  rootDir = process.cwd(),
  fingerprint = discoverGenesisStackFingerprint({ rootDir }),
  selectedProfile = "minimal",
  addOns = [],
} = {}) {
  const availableAgents = listAvailableAgents(rootDir);
  const stackTags = new Set(fingerprint.tags || []);
  const selectedGroups = GROUPS
    .filter((entry) => groupApplies(entry, selectedProfile, stackTags))
    .map((entry) => materializeGroup(entry, availableAgents, stackTags));
  const selectedFromGroups = selectedGroups.flatMap((entry) => entry.agents.filter((agent) => agent.available).map((agent) => agent.id));
  const selectedAddOns = addOns.flatMap((id) => ADD_ON_AGENTS[id] || []);
  const selectedAgents = unique([...selectedFromGroups, ...selectedAddOns].filter((id) => availableAgents.has(id)));
  const missingSpecialists = selectedGroups.flatMap((entry) => entry.agents.filter((agent) => !agent.available).map((agent) => ({
    groupId: entry.id,
    agentId: agent.id,
    reason: agent.reason,
  })));
  const explanations = [
    ...selectedGroups.map((entry) => ({ groupId: entry.id, reason: entry.reason })),
    ...addOns.map((id) => ({ addOnId: id, reason: `${id} selected as explicit add-on` })),
  ];

  return {
    selectedProfile,
    profileChoices: PROFILE_CHOICES.map(copyChoice),
    addOnChoices: ADD_ON_CHOICES.map((item) => ({ ...copyChoice(item), defaultSelected: item.id === "none" })),
    customizationQuestion: {
      prompt: "Step 1/2: choose install profile or custom group selection before any files are written.",
      choices: PROFILE_CHOICES.map(copyChoice),
      stopCondition: "Stop keeps the dry-run recommendation and writes nothing.",
    },
    addOnQuestion: {
      prompt: "Step 2/2: choose optional add-ons; default is none.",
      choices: ADD_ON_CHOICES.map(copyChoice),
      stopCondition: "Stop keeps base profile only and writes nothing.",
    },
    stackTags: [...stackTags].sort(),
    agentGroups: selectedGroups,
    selectedAgents,
    missingSpecialists,
    explanations,
  };
}

export function formatGenesisAgentRecommendation(recommendation) {
  const lines = [
    "SUPERVIBE_GENESIS_AGENT_RECOMMENDATION",
    `PROFILE: ${recommendation.selectedProfile}`,
    `STACK: ${recommendation.stackTags.join(", ") || "unknown"}`,
    `SELECTED_AGENTS: ${recommendation.selectedAgents.join(", ") || "none"}`,
    "GROUPS:",
  ];
  for (const groupEntry of recommendation.agentGroups) {
    lines.push(`- ${groupEntry.id}: ${groupEntry.reason}`);
    for (const agent of groupEntry.agents) {
      lines.push(`  ${agent.available ? "available" : "missing"} ${agent.id}`);
    }
  }
  if (recommendation.missingSpecialists.length > 0) {
    lines.push("MISSING_SPECIALISTS:");
    for (const missing of recommendation.missingSpecialists) {
      lines.push(`- ${missing.groupId}: ${missing.agentId}`);
    }
  }
  return lines.join("\n");
}

export function buildGenesisDryRunReport({
  targetRoot = process.cwd(),
  pluginRoot = process.cwd(),
  env = process.env,
  selectedProfile = "minimal",
  addOns = [],
} = {}) {
  const hostSelection = selectHostAdapter({ rootDir: targetRoot, env });
  const fingerprint = discoverGenesisStackFingerprint({ rootDir: targetRoot });
  const agentProfile = buildGenesisAgentRecommendation({
    rootDir: pluginRoot,
    fingerprint,
    selectedProfile,
    addOns,
  });
  const optionalAgents = unique(addOns.flatMap((id) => ADD_ON_AGENTS[id] || []));
  const recommendedAgents = agentProfile.selectedAgents.filter((agent) => !optionalAgents.includes(agent));
  const managedInstruction = renderManagedInstruction({ hostSelection, fingerprint, agentProfile, recommendedAgents, optionalAgents });
  const contextMigration = planContextMigration({
    rootDir: targetRoot,
    adapterId: hostSelection.adapter.id,
    generatedContent: managedInstruction,
  });
  const adapter = hostSelection.adapter;
  const filesToCreate = [
    ...agentProfile.selectedAgents.map((agentId) => ({ path: `${adapter.agentsFolder}/${agentId}.md`, reason: "selected agent" })),
    { path: adapter.rulesFolder, reason: "selected rules folder" },
    { path: adapter.settingsFile, reason: "host settings when supported" },
  ].filter((entry) => !existsSync(join(targetRoot, entry.path)));
  const filesToModify = existsSync(contextMigration.absolutePath)
    ? [{ path: contextMigration.instructionPath, reason: "managed context block update" }]
    : [];
  if (!existsSync(contextMigration.absolutePath)) {
    filesToCreate.push({ path: contextMigration.instructionPath, reason: "host instruction file" });
  }

  return {
    dryRun: true,
    targetRoot,
    host: {
      adapterId: adapter.id,
      displayName: adapter.displayName,
      confidence: hostSelection.confidence,
      requiresSelection: hostSelection.requiresSelection,
      instructionFiles: adapter.instructionFiles,
      folders: {
        model: adapter.modelFolder,
        agents: adapter.agentsFolder,
        rules: adapter.rulesFolder,
        skills: adapter.skillsFolder,
      },
    },
    fingerprint,
    agentProfile,
    recommendedAgents,
    optionalAgents,
    contextMigration,
    filesToCreate,
    filesToModify,
    preservedSections: contextMigration.parsed.headings.map((heading) => heading.text),
    skippedGeneratedFolders: [
      { path: "dist", reason: "generated output" },
      { path: "dist-check", reason: "generated output" },
      { path: "target", reason: "Rust build output" },
      { path: "node_modules", reason: "dependency cache" },
    ],
  };
}

export function formatGenesisDryRunReport(report) {
  const lines = [
    "SUPERVIBE_GENESIS_DRY_RUN",
    `DRY_RUN: ${report.dryRun}`,
    `HOST: ${report.host.adapterId} (${report.host.confidence})`,
    `PROFILE: ${report.agentProfile.selectedProfile}`,
    `STACK: ${report.fingerprint.tags.join(", ") || "unknown"}`,
    `FILES_TO_CREATE: ${report.filesToCreate.length}`,
    `FILES_TO_MODIFY: ${report.filesToModify.length}`,
    `RECOMMENDED_AGENTS: ${report.recommendedAgents.join(", ") || "none"}`,
    `OPTIONAL_AGENTS: ${report.optionalAgents.join(", ") || "none"}`,
    `PRESERVED_SECTIONS: ${report.preservedSections.join(", ") || "none"}`,
    `SKIPPED_GENERATED_FOLDERS: ${report.skippedGeneratedFolders.map((entry) => entry.path).join(", ")}`,
  ];
  for (const entry of report.filesToModify) lines.push(`MODIFY: ${entry.path} - ${entry.reason}`);
  for (const entry of report.filesToCreate.slice(0, 10)) lines.push(`CREATE: ${entry.path} - ${entry.reason}`);
  return lines.join("\n");
}

function listAvailableAgents(rootDir) {
  const agentsDir = join(rootDir, "agents");
  const ids = new Set();
  if (!existsSync(agentsDir)) return ids;
  for (const file of listMarkdownFiles(agentsDir)) {
    ids.add(file.replace(/\.md$/, ""));
  }
  return ids;
}

function listMarkdownFiles(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) files.push(...listMarkdownFiles(path));
    else if (name.endsWith(".md")) files.push(name);
  }
  return files;
}

function groupApplies(groupEntry, selectedProfile, stackTags) {
  if (!groupEntry.profiles.includes(selectedProfile)) return false;
  if (groupEntry.stackTags.length === 0) return true;
  return groupEntry.stackTags.some((tag) => stackTags.has(tag));
}

function materializeGroup(groupEntry, availableAgents, stackTags) {
  return {
    id: groupEntry.id,
    label: groupEntry.label,
    reason: groupEntry.stackTags.length === 0
      ? `${groupEntry.label} included by ${groupEntry.profiles.join("/")} profile`
      : `${groupEntry.label} matched stack tags: ${groupEntry.stackTags.filter((tag) => stackTags.has(tag)).join(", ")}`,
    agents: groupEntry.agents.map((id) => ({
      id,
      available: availableAgents.has(id),
      reason: availableAgents.has(id) ? "available in plugin agents" : "selectable specialist not present yet",
    })),
  };
}

function normalizeStackTag(name) {
  const value = String(name).toLowerCase();
  if (value === "react") return "react";
  if (value.includes("vite")) return "vite";
  if (value.includes("tailwind")) return "tailwind";
  if (value.includes("tauri")) return "tauri";
  if (value.includes("tanstack") && value.includes("router")) return "tanstack-router";
  if (value.includes("playwright")) return "playwright";
  if (value.includes("postgres")) return "postgres";
  return null;
}

function renderManagedInstruction({ hostSelection, fingerprint, agentProfile, recommendedAgents, optionalAgents }) {
  return [
    `# Supervibe Managed Context (${hostSelection.adapter.displayName})`,
    "",
    `Stack tags: ${fingerprint.tags.join(", ") || "unknown"}`,
    `Install profile: ${agentProfile.selectedProfile}`,
    `Recommended agents: ${recommendedAgents.join(", ") || "none"}`,
    `Optional agents: ${optionalAgents.join(", ") || "none"}`,
    "",
    "Use the selected agents, rules and skills through the host adapter folders. Preserve user-owned instructions outside this managed block.",
  ].join("\n");
}

function group(id, label, agents, profiles, stackTags = []) {
  return { id, label, agents, profiles, stackTags };
}

function choice(id, description, recommended = false) {
  return { id, description, recommended };
}

function copyChoice(item) {
  return { ...item };
}

function unique(values) {
  return [...new Set(values)];
}
