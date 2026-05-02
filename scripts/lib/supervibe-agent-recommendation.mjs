import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { parse as parseYaml } from "yaml";

import { planContextMigration } from "./supervibe-context-migrator.mjs";
import { formatAgentRoleSummaries, loadAgentRosterSync, pickAgentRoleSummaries } from "./supervibe-agent-roster.mjs";
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
  choice("product-design-extended", "Legacy-compatible add-on for creative direction, copy, accessibility, presentation and target-specific UI designers."),
  choice("network-ops", "Explicit add-on for read-only router/network diagnostics; never selected by default."),
]);

const GROUPS = Object.freeze([
  group("core", "Core orchestration", ["supervibe-orchestrator", "repo-researcher", "code-reviewer", "quality-gate-reviewer", "root-cause-debugger"], ["minimal", "product-design", "full-stack", "research-heavy"]),
  group("react-frontend", "React frontend", ["react-implementer", "ux-ui-designer", "accessibility-reviewer"], ["minimal", "product-design", "full-stack"], ["react", "vite", "tanstack-router", "tailwind"]),
  group("nextjs-web", "Next.js web app", ["nextjs-architect", "nextjs-developer", "server-actions-specialist"], ["minimal", "product-design", "full-stack"], ["nextjs"]),
  group("vue-web", "Vue frontend", ["vue-implementer", "ux-ui-designer", "accessibility-reviewer"], ["minimal", "product-design", "full-stack"], ["vue"]),
  group("nuxt-web", "Nuxt web app", ["nuxt-architect", "nuxt-developer"], ["minimal", "product-design", "full-stack"], ["nuxt"]),
  group("sveltekit-web", "SvelteKit web app", ["sveltekit-developer", "ux-ui-designer", "accessibility-reviewer"], ["minimal", "product-design", "full-stack"], ["sveltekit"]),
  group("chrome-extension", "Chrome extension", ["chrome-extension-architect", "chrome-extension-developer", "extension-ui-designer"], ["minimal", "product-design", "full-stack"], ["chrome-extension"]),
  group("django-backend", "Django backend", ["django-architect", "django-developer"], ["minimal", "full-stack"], ["django"]),
  group("fastapi-backend", "FastAPI backend", ["fastapi-architect", "fastapi-developer"], ["minimal", "full-stack"], ["fastapi"]),
  group("express-backend", "Express backend", ["express-developer", "api-designer"], ["minimal", "full-stack"], ["express"]),
  group("nestjs-backend", "NestJS backend", ["nestjs-developer", "api-designer"], ["minimal", "full-stack"], ["nestjs"]),
  group("laravel-backend", "Laravel backend", ["laravel-architect", "laravel-developer", "eloquent-modeler"], ["minimal", "full-stack"], ["laravel"]),
  group("rails-backend", "Rails backend", ["rails-architect", "rails-developer"], ["minimal", "full-stack"], ["rails"]),
  group("go-backend", "Go backend", ["go-service-developer", "api-designer"], ["minimal", "full-stack"], ["go"]),
  group("spring-backend", "Spring backend", ["spring-architect", "spring-developer"], ["minimal", "full-stack"], ["spring"]),
  group("aspnet-backend", "ASP.NET backend", ["aspnet-developer", "api-designer"], ["minimal", "full-stack"], ["aspnet"]),
  group("tauri-desktop", "Tauri desktop", ["tauri-ui-designer", "tauri-rust-engineer"], ["minimal", "full-stack"], ["tauri"]),
  group("rust-backend", "Rust backend and IPC", ["tauri-rust-engineer", "ipc-contract-reviewer", "api-contract-reviewer"], ["minimal", "full-stack"], ["rust", "tauri"]),
  group("mobile-android", "Android app", ["android-developer", "mobile-ui-designer"], ["minimal", "product-design", "full-stack"], ["android"]),
  group("mobile-ios", "iOS app", ["ios-developer", "mobile-ui-designer"], ["minimal", "product-design", "full-stack"], ["ios"]),
  group("mobile-flutter", "Flutter app", ["flutter-developer", "mobile-ui-designer"], ["minimal", "product-design", "full-stack"], ["flutter"]),
  group("data-postgres", "Postgres data layer", ["postgres-architect", "data-modeler", "db-reviewer"], ["minimal", "full-stack"], ["postgres", "sqlx"]),
  group("data-mysql", "MySQL data layer", ["mysql-architect", "data-modeler", "db-reviewer"], ["minimal", "full-stack"], ["mysql"]),
  group("data-mongodb", "MongoDB data layer", ["mongo-architect", "data-modeler", "db-reviewer"], ["minimal", "full-stack"], ["mongodb"]),
  group("cache-redis", "Redis cache and queues", ["redis-architect", "job-scheduler-architect"], ["minimal", "full-stack"], ["redis"]),
  group("search-elasticsearch", "Elasticsearch search", ["elasticsearch-architect"], ["minimal", "full-stack"], ["elasticsearch"]),
  group("graphql-api", "GraphQL API", ["graphql-schema-designer", "api-contract-reviewer"], ["minimal", "full-stack"], ["graphql"]),
  group("product-design", "Product and design", ["product-manager", "ux-ui-designer", "prototype-builder", "ui-polish-reviewer"], ["product-design", "full-stack"]),
  group("ops-security", "Operations and security", ["security-auditor", "performance-reviewer", "dependency-reviewer"], ["full-stack"]),
  group("research", "Research-heavy support", ["repo-researcher", "security-researcher", "dependency-reviewer"], ["research-heavy"]),
]);

const ADD_ON_AGENTS = Object.freeze({
  "security-audit": ["security-auditor"],
  "ai-prompting": ["prompt-ai-engineer"],
  "project-adaptation": ["rules-curator", "memory-curator", "repo-researcher"],
  "product-design-extended": [
    "creative-director",
    "copywriter",
    "accessibility-reviewer",
    "extension-ui-designer",
    "electron-ui-designer",
    "tauri-ui-designer",
    "mobile-ui-designer",
    "presentation-director",
    "presentation-deck-builder",
    "competitive-design-researcher",
  ],
  "network-ops": ["network-router-engineer"],
});

const LEGACY_PROFILE_COMPATIBILITY = Object.freeze({
  "custom-minimal-product-design": ["minimal", "product-design"],
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

  const addTag = (tag, source, name = tag) => {
    if (!tag) return;
    tags.add(tag);
    facts.push({ source: toRel(rootDir, source), name, tag });
  };

  for (const packagePath of findManifestFiles(rootDir, "package.json")) {
    const pkg = readJson(packagePath);
    if (!pkg) continue;
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    for (const name of Object.keys(deps)) {
      const normalized = normalizeStackTag(name);
      if (normalized) addTag(normalized, packagePath, name);
    }
    detectPackageStack(deps, packagePath, addTag);
  }

  for (const cargoPath of findManifestFiles(rootDir, "Cargo.toml")) {
    const cargo = readFileSync(cargoPath, "utf8");
    addTag("rust", cargoPath, "cargo");
    if (/^\s*tauri\s*=/m.test(cargo)) {
      addTag("tauri", cargoPath, "tauri");
    }
    if (/sqlx|postgres/i.test(cargo)) {
      addTag("postgres", cargoPath, "sqlx/postgres");
      addTag("sqlx", cargoPath, "sqlx");
    }
  }

  for (const pyprojectPath of findManifestFiles(rootDir, "pyproject.toml")) {
    addTag("python", pyprojectPath, "pyproject.toml");
    detectPythonStack(readFileSync(pyprojectPath, "utf8"), pyprojectPath, addTag);
  }
  for (const requirementsPath of findManifestFiles(rootDir, "requirements.txt")) {
    addTag("python", requirementsPath, "requirements.txt");
    detectPythonStack(readFileSync(requirementsPath, "utf8"), requirementsPath, addTag);
  }
  for (const composerPath of findManifestFiles(rootDir, "composer.json")) {
    const composer = readJson(composerPath);
    const deps = { ...(composer?.require || {}), ...(composer?.["require-dev"] || {}) };
    addTag("php", composerPath, "composer");
    detectComposerStack(deps, composerPath, addTag);
  }
  for (const goModPath of findManifestFiles(rootDir, "go.mod")) {
    addTag("go", goModPath, "go.mod");
    detectGoStack(readFileSync(goModPath, "utf8"), goModPath, addTag);
  }
  for (const gemfilePath of findManifestFiles(rootDir, "Gemfile")) {
    addTag("ruby", gemfilePath, "Gemfile");
    detectRubyStack(readFileSync(gemfilePath, "utf8"), gemfilePath, addTag);
  }
  for (const pubspecPath of findManifestFiles(rootDir, "pubspec.yaml")) {
    addTag("dart", pubspecPath, "pubspec.yaml");
    if (/^\s*flutter\s*:/m.test(readFileSync(pubspecPath, "utf8"))) addTag("flutter", pubspecPath, "flutter");
  }
  for (const pomPath of findManifestFiles(rootDir, "pom.xml")) {
    const text = readFileSync(pomPath, "utf8");
    addTag("java", pomPath, "pom.xml");
    if (/spring-boot|org\.springframework/i.test(text)) addTag("spring", pomPath, "spring");
  }
  for (const gradlePath of [...findManifestFiles(rootDir, "build.gradle"), ...findManifestFiles(rootDir, "build.gradle.kts")]) {
    const text = readFileSync(gradlePath, "utf8");
    addTag(/com\.android|android\s*\{/i.test(text) ? "android" : "java", gradlePath, "gradle");
    if (/spring-boot|org\.springframework/i.test(text)) addTag("spring", gradlePath, "spring");
  }
  for (const csprojPath of findManifestFiles(rootDir, ".csproj", { suffix: true })) {
    const text = readFileSync(csprojPath, "utf8");
    addTag("dotnet", csprojPath, ".csproj");
    if (/Microsoft\.AspNetCore|Sdk\.Web/i.test(text)) addTag("aspnet", csprojPath, "aspnet");
  }
  for (const manifestPath of findManifestFiles(rootDir, "manifest.json")) {
    const manifest = readJson(manifestPath);
    if (manifest?.manifest_version === 2 || manifest?.manifest_version === 3) {
      addTag("chrome-extension", manifestPath, `manifest_version:${manifest.manifest_version}`);
    }
  }
  for (const composePath of [
    ...findManifestFiles(rootDir, "docker-compose.yml"),
    ...findManifestFiles(rootDir, "docker-compose.yaml"),
    ...findManifestFiles(rootDir, "compose.yml"),
    ...findManifestFiles(rootDir, "compose.yaml"),
  ]) {
    detectComposeStack(readFileSync(composePath, "utf8"), composePath, addTag);
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
  const agentRoster = loadAgentRosterSync({ rootDir });
  const stackTags = new Set(fingerprint.tags || []);
  const profileSelection = normalizeProfileSelection(selectedProfile);
  const normalizedAddOns = normalizeAddOns(addOns);
  const selectedGroups = GROUPS
    .filter((entry) => groupApplies(entry, profileSelection.effectiveProfiles, stackTags))
    .map((entry) => materializeGroup(entry, availableAgents, stackTags, agentRoster));
  const selectedFromGroups = selectedGroups.flatMap((entry) => entry.agents.filter((agent) => agent.available).map((agent) => agent.id));
  const selectedAddOns = addOnAgents(normalizedAddOns);
  const selectedAgents = unique([...selectedFromGroups, ...selectedAddOns].filter((id) => availableAgents.has(id)));
  const agentResponsibilities = pickAgentRoleSummaries(selectedAgents, agentRoster);
  const missingSpecialists = selectedGroups.flatMap((entry) => entry.agents.filter((agent) => !agent.available).map((agent) => ({
    groupId: entry.id,
    agentId: agent.id,
    reason: agent.reason,
  })));
  const explanations = [
    ...selectedGroups.map((entry) => ({ groupId: entry.id, reason: entry.reason })),
    ...normalizedAddOns.map((id) => ({ addOnId: id, reason: `${id} selected as explicit add-on` })),
  ];
  if (profileSelection.legacy) {
    explanations.unshift({
      profileId: selectedProfile,
      reason: `legacy profile preserved as ${profileSelection.effectiveProfiles.join(" + ")} compatibility profile`,
    });
  }

  return {
    selectedProfile,
    effectiveProfiles: profileSelection.effectiveProfiles,
    legacyProfile: profileSelection.legacy,
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
    agentResponsibilities,
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
    "AGENT_ROLES:",
    formatAgentRoleSummaries(recommendation.selectedAgents, { agents: recommendation.agentResponsibilities }, { max: 80 }) || "- none",
    "GROUPS:",
  ];
  for (const groupEntry of recommendation.agentGroups) {
    lines.push(`- ${groupEntry.id}: ${groupEntry.reason}`);
    for (const agent of groupEntry.agents) {
      lines.push(`  ${agent.available ? "available" : "missing"} ${agent.id} - ${agent.responsibility}`);
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
  const optionalAgents = unique(addOnAgents(addOns));
  const recommendedAgents = agentProfile.selectedAgents.filter((agent) => !optionalAgents.includes(agent));
  const supervibeStateArtifacts = [
    { path: ".supervibe/memory/", reason: "Supervibe-owned project state root" },
    { path: ".supervibe/memory/genesis/state.json", reason: "genesis lifecycle state" },
    { path: ".supervibe/memory/.supervibe-version", reason: "installed Supervibe artifact version for update/adapt drift checks" },
    { path: ".supervibe/memory/index-config.json", reason: "project-owned indexing include/exclude and refresh policy" },
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
        command: "node <resolved-supervibe-plugin-root>/scripts/build-code-index.mjs --root . --resume --source-only --max-files 200 --max-seconds 120 --health --json-progress",
        reason: "initialize source RAG in bounded atomic batches with JSON progress, checkpoints, and a single-run lock before status verification",
      },
      {
        command: "node <resolved-supervibe-plugin-root>/scripts/build-code-index.mjs --root . --list-missing",
        reason: "inspect partial index gaps after an interrupted large-project indexing run",
      },
      {
        command: "node <resolved-supervibe-plugin-root>/scripts/build-code-index.mjs --root . --resume --graph --max-files 200 --health",
        reason: "build or repair Code Graph separately after source RAG is healthy",
      },
      {
        command: "node <resolved-supervibe-plugin-root>/scripts/supervibe-status.mjs",
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
      { path: ".next/.nuxt/.svelte-kit", reason: "framework caches and generated output" },
      { path: "target", reason: "Rust build output" },
      { path: "node_modules", reason: "dependency cache" },
      { path: "bower_components/jspm_packages/site-packages/Pods", reason: "vendored dependencies" },
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
    "AGENT_ROLES:",
    formatAgentRoleSummaries(report.agentProfile.selectedAgents, { agents: report.agentProfile.agentResponsibilities }, { max: 80 }) || "- none",
    "UPDATE_ADAPT_NEXT: After plugin updates run /supervibe-update, then /supervibe-adapt in each project to dry-run managed artifact changes; never delete project files manually.",
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

function groupApplies(groupEntry, effectiveProfiles, stackTags) {
  if (!groupEntry.profiles.some((profile) => effectiveProfiles.includes(profile))) return false;
  if (groupEntry.stackTags.length === 0) return true;
  return groupEntry.stackTags.some((tag) => stackTags.has(tag));
}

function materializeGroup(groupEntry, availableAgents, stackTags, agentRoster) {
  const byId = new Map((agentRoster.agents || []).map((agent) => [agent.id, agent]));
  return {
    id: groupEntry.id,
    label: groupEntry.label,
    reason: groupEntry.stackTags.length === 0
      ? `${groupEntry.label} included by ${groupEntry.profiles.join("/")} profile`
      : `${groupEntry.label} matched stack tags: ${groupEntry.stackTags.filter((tag) => stackTags.has(tag)).join(", ")}`,
    agents: groupEntry.agents.map((id) => ({
      id,
      available: availableAgents.has(id),
      responsibility: byId.get(id)?.responsibility || `${groupEntry.label} specialist for ${id.replace(/-/g, " ")} tasks.`,
      reason: availableAgents.has(id) ? "available in plugin agents" : "selectable specialist not present yet",
    })),
  };
}

const STACK_SCAN_SKIP_DIRS = new Set([
  "node_modules",
  "bower_components",
  "jspm_packages",
  ".git",
  ".supervibe",
  ".claude",
  ".codex",
  ".cursor",
  ".gemini",
  ".opencode",
  "dist",
  "build",
  "out",
  "coverage",
  "target",
  "vendor",
  "venv",
  ".venv",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  ".tox",
  ".nox",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".turbo",
  ".cache",
  ".gradle",
  "Pods",
  "DerivedData",
]);

function findManifestFiles(rootDir, name, { maxDepth = 4, suffix = false } = {}) {
  const found = [];
  const visit = (dir, depth) => {
    if (depth > maxDepth) return;
    let entries = [];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (STACK_SCAN_SKIP_DIRS.has(entry.name) || (entry.name.startsWith(".") && ![".github"].includes(entry.name))) continue;
        visit(path, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      if (suffix ? entry.name.endsWith(name) : entry.name === name) found.push(path);
    }
  };
  visit(rootDir, 0);
  return found.sort((a, b) => toRel(rootDir, a).localeCompare(toRel(rootDir, b)));
}

function toRel(rootDir, path) {
  return relative(rootDir, path).split(sep).join("/") || path;
}

function readJson(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch { return null; }
}

function hasDep(deps, patterns) {
  const names = Object.keys(deps || {}).map((name) => name.toLowerCase());
  return patterns.some((pattern) => names.some((name) => typeof pattern === "string" ? name === pattern : pattern.test(name)));
}

function detectPackageStack(deps, source, addTag) {
  if (hasDep(deps, ["next"])) addTag("nextjs", source, "next");
  if (hasDep(deps, ["react", "react-dom"])) addTag("react", source, "react");
  if (hasDep(deps, ["vue"])) addTag("vue", source, "vue");
  if (hasDep(deps, ["nuxt"])) addTag("nuxt", source, "nuxt");
  if (hasDep(deps, ["svelte", "@sveltejs/kit"])) addTag("sveltekit", source, "sveltekit");
  if (hasDep(deps, ["express"])) addTag("express", source, "express");
  if (hasDep(deps, ["@nestjs/core", "nestjs"])) addTag("nestjs", source, "nestjs");
  if (hasDep(deps, ["@tauri-apps/api"])) addTag("tauri", source, "@tauri-apps/api");
  if (hasDep(deps, ["electron"])) addTag("electron", source, "electron");
  if (hasDep(deps, ["tailwindcss", "@tailwindcss/vite"])) addTag("tailwind", source, "tailwindcss");
  if (hasDep(deps, ["vite", /vite-plugin/])) addTag("vite", source, "vite");
  if (hasDep(deps, [/@tanstack\/react-router/])) addTag("tanstack-router", source, "@tanstack/react-router");
  if (hasDep(deps, ["pg", "postgres", "postgresql", "@prisma/client", "drizzle-orm"])) addTag("postgres", source, "postgres dependency");
  if (hasDep(deps, ["mysql2", "mysql"])) addTag("mysql", source, "mysql dependency");
  if (hasDep(deps, ["mongodb", "mongoose"])) addTag("mongodb", source, "mongodb dependency");
  if (hasDep(deps, ["redis", "ioredis", "bull", "bullmq"])) addTag("redis", source, "redis dependency");
  if (hasDep(deps, ["graphql", "@apollo/client", "@apollo/server", "apollo-server", "urql"])) addTag("graphql", source, "graphql dependency");
  if (hasDep(deps, ["@crxjs/vite-plugin", "wxt", "plasmo"])) addTag("chrome-extension", source, "extension bundler");
}

function detectPythonStack(text, source, addTag) {
  const value = text.toLowerCase();
  if (/\bdjango\b/.test(value)) addTag("django", source, "django");
  if (/\bfastapi\b/.test(value)) addTag("fastapi", source, "fastapi");
  if (/\bflask\b/.test(value)) addTag("flask", source, "flask");
  if (/\bsqlalchemy\b|\bpsycopg\b|\basyncpg\b/.test(value)) addTag("postgres", source, "python postgres dependency");
  if (/\bredis\b/.test(value)) addTag("redis", source, "redis");
  if (/\bcelery\b|\brq\b/.test(value)) addTag("queue", source, "python queue dependency");
}

function detectComposerStack(deps, source, addTag) {
  if (hasDep(deps, ["laravel/framework"])) addTag("laravel", source, "laravel/framework");
  if (hasDep(deps, ["symfony/framework-bundle", "symfony/http-kernel"])) addTag("symfony", source, "symfony");
  if (hasDep(deps, ["doctrine/dbal"])) addTag("sql", source, "doctrine/dbal");
  if (hasDep(deps, ["predis/predis"])) addTag("redis", source, "predis");
}

function detectGoStack(text, source, addTag) {
  const value = text.toLowerCase();
  if (/github\.com\/gin-gonic\/gin/.test(value)) addTag("gin", source, "gin");
  if (/github\.com\/labstack\/echo/.test(value)) addTag("echo", source, "echo");
  if (/github\.com\/go-chi\/chi/.test(value)) addTag("chi", source, "chi");
  if (/google\.golang\.org\/grpc/.test(value)) addTag("grpc", source, "grpc");
  if (/jackc\/pgx|lib\/pq|sqlc-dev\/sqlc/.test(value)) addTag("postgres", source, "go postgres dependency");
  if (/redis\/go-redis/.test(value)) addTag("redis", source, "go-redis");
}

function detectRubyStack(text, source, addTag) {
  const value = text.toLowerCase();
  if (/gem ["']rails["']/.test(value)) addTag("rails", source, "rails");
  if (/gem ["']pg["']/.test(value)) addTag("postgres", source, "pg");
  if (/gem ["']redis["']/.test(value)) addTag("redis", source, "redis");
  if (/gem ["']sidekiq["']/.test(value)) addTag("queue", source, "sidekiq");
}

function detectComposeStack(text, source, addTag) {
  const value = text.toLowerCase();
  if (/postgres/.test(value)) addTag("postgres", source, "compose postgres service");
  if (/\bredis\b/.test(value)) addTag("redis", source, "compose redis service");
  if (/mysql|mariadb/.test(value)) addTag("mysql", source, "compose mysql service");
  if (/mongo/.test(value)) addTag("mongodb", source, "compose mongodb service");
  if (/elastic/.test(value)) addTag("elasticsearch", source, "compose elasticsearch service");
}

function normalizeStackTag(name) {
  const value = String(name).toLowerCase();
  if (value === "react") return "react";
  if (value === "next") return "nextjs";
  if (value === "vue") return "vue";
  if (value === "nuxt") return "nuxt";
  if (value === "svelte" || value === "@sveltejs/kit") return "sveltekit";
  if (value === "express") return "express";
  if (value === "@nestjs/core" || value === "nestjs") return "nestjs";
  if (value.includes("vite")) return "vite";
  if (value.includes("tailwind")) return "tailwind";
  if (value.includes("tauri")) return "tauri";
  if (value.includes("tanstack") && value.includes("router")) return "tanstack-router";
  if (value.includes("playwright")) return "playwright";
  if (["pg", "postgres"].includes(value) || value.includes("postgres")) return "postgres";
  if (["redis", "ioredis", "bull", "bullmq"].includes(value)) return "redis";
  if (["mongodb", "mongoose"].includes(value)) return "mongodb";
  if (["mysql", "mysql2"].includes(value)) return "mysql";
  if (value.includes("graphql") || value.includes("apollo")) return "graphql";
  return null;
}

function resolveGenesisStackPack({ pluginRoot, fingerprint }) {
  const tags = new Set(fingerprint.tags || []);
  const candidates = [
    { id: "tauri-react-rust-postgres", path: "stack-packs/tauri-react-rust-postgres/pack.yaml", requiredTags: ["tauri"], exactTags: ["tauri", "react", "rust", "postgres"] },
    { id: "laravel-nextjs-postgres-redis", path: "stack-packs/laravel-nextjs-postgres-redis/manifest.yaml", requiredTags: ["laravel", "nextjs", "postgres"], exactTags: ["laravel", "nextjs", "postgres"] },
    { id: "chrome-extension-mv3", path: "stack-packs/chrome-extension-mv3/manifest.yaml", requiredTags: ["chrome-extension"], exactTags: ["chrome-extension"] },
  ];
  const match = candidates.find((candidate) => candidate.requiredTags.every((tag) => tags.has(tag)));
  if (!match) return null;
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

function normalizeProfileSelection(selectedProfile) {
  const id = selectedProfile || "minimal";
  const effectiveProfiles = LEGACY_PROFILE_COMPATIBILITY[id] || [id];
  return {
    requestedProfile: id,
    effectiveProfiles,
    legacy: Object.hasOwn(LEGACY_PROFILE_COMPATIBILITY, id),
  };
}

function normalizeAddOns(addOns = []) {
  return unique(asArray(addOns).filter((id) => id && id !== "none"));
}

function addOnAgents(addOns = []) {
  return normalizeAddOns(addOns).flatMap((id) => ADD_ON_AGENTS[id] || []);
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
  const agentRoles = formatAgentRoleSummaries(agentProfile.selectedAgents, { agents: agentProfile.agentResponsibilities }, { max: 30 });
  const adapter = hostSelection.adapter;
  return [
    `# Supervibe Managed Context (${hostSelection.adapter.displayName})`,
    "",
    `Stack tags: ${fingerprint.tags.join(", ") || "unknown"}`,
    `Install profile: ${agentProfile.selectedProfile}`,
    `Recommended agents: ${recommendedAgents.join(", ") || "none"}`,
    `Optional agents: ${optionalAgents.join(", ") || "none"}`,
    "",
    "## Selected Agent Roles",
    agentRoles || "- none",
    "",
    "## Working Contract",
    "- Start by checking project memory, semantic code search and code graph before non-trivial changes.",
    "- Explain the current step, what evidence was gathered, and what decision is being made before writing files.",
    "- Ask concise questions only when the answer changes implementation, safety or scope.",
    "- Preserve user-owned instructions outside this managed block and keep host-specific files in the selected adapter folders.",
    "",
    "## Update Path",
    "- Plugin update: run `/supervibe-update` or the installer update command for this host.",
    "- Project artifact update: run `/supervibe-adapt` and review the dry-run diff before approving managed agent/rule/skill/context changes.",
    "- Do not delete installed project agents, rules or skills manually to refresh them; adapt preserves local user sections and only updates managed blocks after approval.",
    "",
    `Host instruction file: ${adapter.instructionFiles.join(", ")}`,
    `Host agents folder: ${adapter.agentsFolder}`,
    `Host rules folder: ${adapter.rulesFolder}`,
    `Host skills folder: ${adapter.skillsFolder}`,
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
