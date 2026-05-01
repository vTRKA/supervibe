import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

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
  choice("project-adaptation", "Explicit add-on for adapting project rules and agents when the user requests gap-closing."),
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
  "project-adaptation": ["rules-curator", "memory-curator", "repo-researcher"],
  "network-ops": ["network-router-engineer"],
});

const BASE_REQUIRED_SKILLS = Object.freeze([
  "genesis",
  "stack-discovery",
  "project-memory",
  "code-search",
  "systematic-debugging",
  "verification",
  "confidence-scoring",
  "adapt",
  "strengthen",
]);

const ADAPTATION_RULES = Object.freeze([
  "agent-excellence-baseline",
  "agent-install-profiles",
  "rule-maintenance",
]);

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
  const stackPack = resolveGenesisStackPack({ pluginRoot, fingerprint });
  const rulesPlan = resolveGenesisRules({ pluginRoot, fingerprint, stackPack, addOns });
  const skillsPlan = resolveGenesisSkills({ pluginRoot, selectedAgents: agentProfile.selectedAgents });
  const scaffoldPlan = resolveStackPackScaffoldArtifacts({ stackPack });
  const optionalAgents = unique(addOns.flatMap((id) => ADD_ON_AGENTS[id] || []));
  const recommendedAgents = agentProfile.selectedAgents.filter((agent) => !optionalAgents.includes(agent));
  const supervibeStateArtifacts = [
    { path: ".supervibe/memory/", reason: "Supervibe-owned project state root" },
    { path: ".supervibe/memory/genesis/state.json", reason: "genesis lifecycle state" },
  ];
  const managedInstruction = renderManagedInstruction({ hostSelection, fingerprint, agentProfile, recommendedAgents, optionalAgents });
  const contextMigration = planContextMigration({
    rootDir: targetRoot,
    adapterId: hostSelection.adapter.id,
    generatedContent: managedInstruction,
  });
  const adapter = hostSelection.adapter;
  const filesToCreate = [
    ...agentProfile.selectedAgents.map((agentId) => ({ path: `${adapter.agentsFolder}/${agentId}.md`, reason: "selected agent" })),
    ...rulesPlan.selectedRules.map((ruleId) => ({ path: `${adapter.rulesFolder}/${ruleId}.md`, reason: "selected rule" })),
    ...skillsPlan.selectedSkills.map((skillId) => ({ path: `${adapter.skillsFolder}/${skillId}/SKILL.md`, reason: "supporting skill" })),
    { path: adapter.settingsFile, reason: "host settings when supported" },
    ...supervibeStateArtifacts,
    ...scaffoldPlan.files.map((entry) => ({ path: entry.path, reason: entry.reason })),
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
    stackPack: {
      id: stackPack?.id || "composed",
      path: stackPack?.path || null,
      exact: Boolean(stackPack?.exact),
    },
    fingerprint,
    agentProfile,
    recommendedAgents,
    optionalAgents,
    selectedRules: rulesPlan.selectedRules,
    selectedSkills: skillsPlan.selectedSkills,
    supervibeStateArtifacts,
    scaffoldArtifacts: scaffoldPlan.files,
    postApplyCommands: [
      {
        command: "node $CLAUDE_PLUGIN_ROOT/scripts/build-code-index.mjs --root . --force --health",
        reason: "initialize Code RAG + Graph in .supervibe/memory/code.db before status verification",
      },
      {
        command: "node $CLAUDE_PLUGIN_ROOT/scripts/supervibe-status.mjs",
        reason: "verify Code RAG + Graph and memory status after genesis",
      },
    ],
    missingArtifacts: [
      ...agentProfile.missingSpecialists.map((entry) => ({ type: "agent", id: entry.agentId, reason: entry.reason })),
      ...rulesPlan.missingRules.map((id) => ({ type: "rule", id, reason: "referenced by stack pack or mandatory policy but missing from plugin rules" })),
      ...skillsPlan.missingSkills.map((id) => ({ type: "skill", id, reason: "referenced by selected agents or bootstrap flow but missing from plugin skills" })),
    ],
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
    `PACK: ${report.stackPack.id}`,
    `PROFILE: ${report.agentProfile.selectedProfile}`,
    `STACK: ${report.fingerprint.tags.join(", ") || "unknown"}`,
    `FILES_TO_CREATE: ${report.filesToCreate.length}`,
    `FILES_TO_MODIFY: ${report.filesToModify.length}`,
    `RECOMMENDED_AGENTS: ${report.recommendedAgents.join(", ") || "none"}`,
    `OPTIONAL_AGENTS: ${report.optionalAgents.join(", ") || "none"}`,
    `SELECTED_RULES: ${report.selectedRules.join(", ") || "none"}`,
    `SELECTED_SKILLS: ${report.selectedSkills.join(", ") || "none"}`,
    `MISSING_ARTIFACTS: ${report.missingArtifacts.length}`,
    `PRESERVED_SECTIONS: ${report.preservedSections.join(", ") || "none"}`,
    `SKIPPED_GENERATED_FOLDERS: ${report.skippedGeneratedFolders.map((entry) => entry.path).join(", ")}`,
    `POST_APPLY_COMMANDS: ${report.postApplyCommands.map((entry) => entry.command).join(" && ")}`,
  ];
  for (const entry of report.filesToModify) lines.push(`MODIFY: ${entry.path} - ${entry.reason}`);
  for (const entry of report.filesToCreate.slice(0, 10)) lines.push(`CREATE: ${entry.path} - ${entry.reason}`);
  return lines.join("\n");
}

function listAvailableAgents(rootDir) {
  return new Set(listAvailableAgentRecords(rootDir).map((agent) => agent.id));
}

function listAvailableAgentRecords(rootDir) {
  const agentsDir = join(rootDir, "agents");
  const records = [];
  if (!existsSync(agentsDir)) return records;
  for (const file of listMarkdownFiles(agentsDir)) {
    const id = file.replace(/\.md$/, "");
    records.push({
      id,
      path: findMarkdownFilePath(agentsDir, file),
    });
  }
  return records.filter((entry) => entry.path);
}

function listAvailableRules(rootDir) {
  const rulesDir = join(rootDir, "rules");
  const ids = new Set();
  if (!existsSync(rulesDir)) return ids;
  for (const file of listMarkdownFiles(rulesDir)) {
    ids.add(file.replace(/\.md$/, ""));
  }
  return ids;
}

function listMandatoryRules(rootDir) {
  const rulesDir = join(rootDir, "rules");
  if (!existsSync(rulesDir)) return [];
  return listMarkdownFiles(rulesDir)
    .map((file) => {
      const id = file.replace(/\.md$/, "");
      const path = findMarkdownFilePath(rulesDir, file);
      const frontmatter = path ? parseFrontmatter(readFileSync(path, "utf8")) : {};
      return { id, mandatory: Boolean(frontmatter.mandatory) };
    })
    .filter((entry) => entry.mandatory)
    .map((entry) => entry.id);
}

function listAvailableSkills(rootDir) {
  const skillsDir = join(rootDir, "skills");
  const ids = new Set();
  if (!existsSync(skillsDir)) return ids;
  for (const name of readdirSync(skillsDir)) {
    const path = join(skillsDir, name, "SKILL.md");
    if (existsSync(path)) ids.add(name);
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

function findMarkdownFilePath(dir, fileName) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      const found = findMarkdownFilePath(path, fileName);
      if (found) return found;
    } else if (name === fileName) {
      return path;
    }
  }
  return null;
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

function resolveGenesisStackPack({ pluginRoot, fingerprint }) {
  const tags = new Set(fingerprint.tags || []);
  const candidates = [
    { id: "tauri-react-rust-postgres", path: "stack-packs/tauri-react-rust-postgres/pack.yaml", requiredTags: ["tauri"], exactTags: ["tauri", "react", "rust", "postgres"] },
    { id: "laravel-nextjs-postgres-redis", path: "stack-packs/laravel-nextjs-postgres-redis/manifest.yaml", requiredTags: ["laravel", "nextjs", "postgres"], exactTags: ["laravel", "nextjs", "postgres"] },
    { id: "chrome-extension-mv3", path: "stack-packs/chrome-extension-mv3/manifest.yaml", requiredTags: ["chrome-extension"], exactTags: ["chrome-extension"] },
  ];
  const match = candidates.find((candidate) => candidate.requiredTags.every((tag) => tags.has(tag)))
    || candidates
      .map((candidate) => ({ ...candidate, overlap: candidate.exactTags.filter((tag) => tags.has(tag)).length }))
      .sort((a, b) => b.overlap - a.overlap)[0];
  if (!match || match.overlap === 0 && !match.requiredTags.every((tag) => tags.has(tag))) return null;
  const absolutePath = join(pluginRoot, match.path);
  if (!existsSync(absolutePath)) return null;
  const data = parseYaml(readFileSync(absolutePath, "utf8")) || {};
  return {
    id: data.id || match.id,
    path: match.path,
    exact: match.exactTags.every((tag) => tags.has(tag)),
    data,
  };
}

function resolveGenesisRules({ pluginRoot, stackPack, addOns = [] }) {
  const availableRules = listAvailableRules(pluginRoot);
  const packRules = asArray(stackPack?.data?.["rules-attach"]);
  const requestedAdaptationRules = addOns.includes("project-adaptation") ? ADAPTATION_RULES : [];
  const wantedRules = unique([
    ...listMandatoryRules(pluginRoot),
    ...packRules,
    ...requestedAdaptationRules,
  ]);
  return {
    selectedRules: wantedRules.filter((id) => availableRules.has(id)),
    missingRules: wantedRules.filter((id) => !availableRules.has(id)),
  };
}

function resolveGenesisSkills({ pluginRoot, selectedAgents }) {
  const availableSkills = listAvailableSkills(pluginRoot);
  const agentRecords = new Map(listAvailableAgentRecords(pluginRoot).map((agent) => [agent.id, agent]));
  const agentSkills = selectedAgents.flatMap((agentId) => {
    const path = agentRecords.get(agentId)?.path;
    if (!path) return [];
    return asArray(parseFrontmatter(readFileSync(path, "utf8")).skills)
      .map((skillId) => String(skillId).replace(/^supervibe:/, ""));
  });
  const wantedSkills = unique([...BASE_REQUIRED_SKILLS, ...agentSkills]);
  return {
    selectedSkills: wantedSkills.filter((id) => availableSkills.has(id)),
    missingSkills: wantedSkills.filter((id) => !availableSkills.has(id)),
  };
}

function resolveStackPackScaffoldArtifacts({ stackPack }) {
  const scaffold = stackPack?.data?.scaffold || {};
  const rootFiles = asArray(scaffold["root-files"]).map((entry) => ({ path: entry.path, reason: "stack-pack root file" }));
  const directories = asArray(scaffold.directories).map((entry) => ({ path: entry.path, reason: entry.purpose || "stack-pack directory" }));
  const husky = Object.keys(scaffold.husky || {}).map((name) => ({ path: `.husky/${name}`, reason: "stack-pack git hook" }));
  return {
    files: [...rootFiles, ...directories, ...husky].filter((entry) => entry.path),
  };
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

function parseFrontmatter(raw) {
  if (!String(raw).startsWith("---")) return {};
  const end = String(raw).indexOf("\n---", 3);
  if (end === -1) return {};
  const block = String(raw).slice(3, end).replace(/\r\n/g, "\n");
  const metadata = {};
  let currentKey = null;
  for (const line of block.split("\n")) {
    const keyMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (keyMatch) {
      currentKey = keyMatch[1];
      const value = keyMatch[2].trim();
      metadata[currentKey] = value === "" ? [] : parseScalar(value);
      continue;
    }
    const listMatch = line.match(/^\s*-\s*(.*)$/);
    if (listMatch && currentKey) {
      if (!Array.isArray(metadata[currentKey])) metadata[currentKey] = [];
      metadata[currentKey].push(parseScalar(listMatch[1].trim()));
    }
  }
  return metadata;
}

function parseScalar(value) {
  const trimmed = String(value).trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed.slice(1, -1).split(",").map((item) => stripQuotes(item.trim())).filter(Boolean);
  }
  return stripQuotes(trimmed);
}

function stripQuotes(value) {
  return String(value).replace(/^['"]|['"]$/g, "");
}

function asArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
