import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { parse as parseYaml } from "yaml";

import { planContextMigration } from "./supervibe-context-migrator.mjs";
import {
  applyFrontendTargetResolution,
  normalizeFrontendTargetChoice,
  resolveFrontendTarget,
} from "./frontend-target-resolver.mjs";
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
  choice("creative-brand", "Add brand direction, copy and competitive design research."),
  choice("web-design", "Add web UI, accessibility and polish specialists without mobile or desktop designers."),
  choice("prototype", "Add prototype build and polish specialists."),
  choice("presentation", "Add deck direction and presentation build specialists."),
  choice("mobile", "Add mobile UI design specialists only when a mobile target is intended."),
  choice("desktop", "Add Electron/Tauri desktop UI specialists only when a desktop target is intended."),
  choice("github-actions", "Opt-in GitHub Actions CI scaffold. Base scaffold creates no CI workflow."),
  choice("gitlab-ci", "Opt-in GitLab CI scaffold. Base scaffold creates no CI workflow."),
  choice("ci-ready", "Opt-in CI readiness notes without choosing a CI provider."),
  choice("redis", "Explicit add-on for Redis cache or queue architecture."),
  choice("product-design-extended", "Legacy-compatible web product design add-on; target-specific mobile, desktop and presentation designers are separate add-ons."),
  choice("network-ops", "Explicit add-on for read-only router/network diagnostics; never selected by default."),
]);

const GROUPS = Object.freeze([
  group("core", "Core orchestration", ["supervibe-orchestrator", "repo-researcher", "rules-curator", "memory-curator", "code-reviewer", "quality-gate-reviewer", "root-cause-debugger"], ["minimal", "product-design", "full-stack", "research-heavy"]),
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
  group("product-design", "Product and design", ["product-manager", "creative-director", "ux-ui-designer", "copywriter", "prototype-builder", "ui-polish-reviewer"], ["product-design", "full-stack"]),
  group("ops-security", "Operations and security", ["security-auditor", "performance-reviewer", "dependency-reviewer"], ["full-stack"]),
  group("research", "Research-heavy support", ["repo-researcher", "security-researcher", "dependency-reviewer"], ["research-heavy"]),
]);

const ADD_ON_AGENTS = Object.freeze({
  "security-audit": ["security-auditor"],
  "ai-prompting": ["prompt-ai-engineer"],
  "project-adaptation": ["rules-curator", "memory-curator", "repo-researcher"],
  redis: ["redis-architect", "job-scheduler-architect"],
  "creative-brand": ["creative-director", "copywriter", "competitive-design-researcher"],
  "web-design": ["ux-ui-designer", "accessibility-reviewer", "ui-polish-reviewer"],
  prototype: ["prototype-builder", "ui-polish-reviewer"],
  presentation: ["presentation-director", "presentation-deck-builder"],
  mobile: ["mobile-ui-designer"],
  desktop: ["electron-ui-designer", "tauri-ui-designer"],
  "product-design-extended": [
    "creative-director",
    "copywriter",
    "accessibility-reviewer",
    "ux-ui-designer",
    "prototype-builder",
    "ui-polish-reviewer",
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

export function discoverGenesisStackFingerprint({
  rootDir = process.cwd(),
  explicitStackTags = [],
  stackText = "",
  appChoice = "",
} = {}) {
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

  for (const tag of normalizeExplicitStackTags([...asArray(explicitStackTags), ...extractStackTagsFromText(stackText)])) {
    addTag(tag, "user-request", tag);
  }

  const fingerprint = {
    rootDir,
    tags: [...tags].sort(),
    facts,
  };
  return applyFrontendTargetResolution(fingerprint, resolveFrontendTarget({
    tags: fingerprint.tags,
    facts,
    requestText: stackText,
    appChoice,
    source: "genesis",
  }));
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
  explicitStackTags = [],
  stackText = "",
  appChoice = "",
} = {}) {
  const hostSelection = selectHostAdapter({ rootDir: targetRoot, env });
  const fingerprint = discoverGenesisStackFingerprint({
    rootDir: targetRoot,
    explicitStackTags,
    stackText,
    appChoice,
  });
  const agentProfile = buildGenesisAgentRecommendation({
    rootDir: pluginRoot,
    fingerprint,
    selectedProfile,
    addOns,
  });
  const stackPack = resolveGenesisStackPack({ pluginRoot, fingerprint });
  const rulesPlan = resolveGenesisRules({ pluginRoot, fingerprint, stackPack, addOns });
  const skillsPlan = resolveGenesisSkills({ pluginRoot, selectedAgents: agentProfile.selectedAgents });
  const scaffoldPlan = resolveStackPackScaffoldArtifacts({ stackPack, addOns, fingerprint });
  const deployAddOnPolicy = buildDeployAddOnPolicy(fingerprint);
  const groupSelectedAgents = unique(agentProfile.agentGroups.flatMap((groupEntry) => (
    groupEntry.agents || []
  ).filter((agent) => agent.available).map((agent) => agent.id)));
  const optionalAgents = unique(addOnAgents(addOns)).filter((agent) => !groupSelectedAgents.includes(agent));
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
    lifecycle: "dry-run",
    stateWriteAllowed: true,
    scaffoldWriteRequiresApproval: true,
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
    generateAppsStep: buildGenerateAppsStep(fingerprint),
    deployAddOnPolicy,
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
      {
        command: "node <resolved-supervibe-plugin-root>/scripts/dependency-health.mjs --root <generated-app-dir>",
        reason: "classify multi-ecosystem dependency health, including lockfiles, audit/SCA evidence, nested vulnerable dependencies, freshness drift, and unsafe automated fixes after app dependencies exist",
      },
      ...deployAddOnPolicy.nextCommands.map((entry) => ({
        command: entry.command,
        reason: entry.reason,
      })),
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

function buildGenerateAppsStep(fingerprint = {}) {
  const tags = new Set(fingerprint.tags || []);
  const frontendTarget = fingerprint.frontendTarget || null;
  const appChoice = normalizeFrontendTargetChoice(fingerprint.appChoice?.id || fingerprint.appChoice);
  const commands = [];
  if (tags.has("laravel")) {
    commands.push({
      command: "composer create-project laravel/laravel backend",
      executable: "composer",
      args: ["create-project", "laravel/laravel", "backend"],
      appDir: "backend",
      framework: "laravel",
      dependencyHealth: true,
      when: "backend/ is still an empty placeholder and Composer is installed",
    });
  }
  if (tags.has("nextjs") && appChoice === "monorepo-two-frontends") {
    commands.push(nextAppCommand({ appDir: "frontend-next" }));
    commands.push(viteAppCommand({ appDir: "frontend-vite" }));
  } else if (tags.has("nextjs")) {
    commands.push(nextAppCommand({ appDir: "frontend" }));
  } else if (tags.has("vite")) {
    commands.push(viteAppCommand({ appDir: "frontend" }));
  }
  const stackAmbiguities = buildStackAmbiguities(tags, frontendTarget);
  return {
    id: "generate-apps",
    approvalRequired: commands.length > 0,
    status: "not-run",
    commands,
    appChoice: appChoice
      ? {
          id: appChoice,
          source: fingerprint.appChoice?.source || "resolved",
          bundler: fingerprint.appChoice?.bundler || frontendTarget?.bundler || null,
          ignoredStackTags: fingerprint.appChoice?.ignoredStackTags || [],
        }
      : null,
    frontendTarget,
    stackAmbiguities,
    clarificationRequired: !appChoice && stackAmbiguities.some((entry) => entry.requiresChoice === true),
    note: stackAmbiguities.length > 0
      ? (appChoice
          ? `Base scaffold creates placeholders only; frontend app choice ${appChoice} uses ${fingerprint.appChoice?.bundler || frontendTarget?.bundler || "the resolved bundler"} and is persisted for app generation.`
          : "Base scaffold creates placeholders only; Next.js and Vite evidence together require choosing Next app, Vite SPA, or intentional monorepo before adding another frontend.")
      : "Base scaffold creates placeholders only; run this approved step to create real framework apps.",
  };
}

function nextAppCommand({ appDir }) {
  return {
    command: `npx create-next-app@latest ${appDir} --ts --eslint --tailwind --app --src-dir --import-alias "@/*" --use-npm --disable-git`,
    executable: "npx",
    args: ["create-next-app@latest", appDir, "--ts", "--eslint", "--tailwind", "--app", "--src-dir", "--import-alias", "@/*", "--use-npm", "--disable-git"],
    appDir,
    framework: "nextjs",
    bundler: "turbopack",
    bundlerPolicy: "Next 16 defaults to Turbopack for next dev and next build; do not generate Vite inside a single Next app.",
    verifyCommands: [
      { command: "npm run lint", executable: "npm", args: ["run", "lint"], cwd: appDir },
      { command: "npm run build", executable: "npm", args: ["run", "build"], cwd: appDir },
    ],
    dependencyHealth: true,
    emptyDirPolicy: "allowed-empty-placeholder-or-absent-dir",
    when: `${appDir}/ is still an empty placeholder and Node/npm are installed`,
  };
}

function viteAppCommand({ appDir }) {
  return {
    command: `npm create vite@latest ${appDir} -- --template react-ts`,
    executable: "npm",
    args: ["create", "vite@latest", appDir, "--", "--template", "react-ts"],
    appDir,
    framework: "vite",
    bundler: "vite",
    verifyCommands: [
      { command: "npm run build", executable: "npm", args: ["run", "build"], cwd: appDir },
    ],
    dependencyHealth: true,
    emptyDirPolicy: "allowed-empty-placeholder-or-absent-dir",
    when: `${appDir}/ is still an empty placeholder and Node/npm are installed`,
  };
}

function buildDeployAddOnPolicy(fingerprint = {}) {
  const tags = new Set(fingerprint.tags || []);
  const targets = [];
  if (tags.has("docker")) targets.push("docker");
  if (tags.has("dokploy")) targets.push("dokploy");
  if (targets.length === 0) {
    return {
      requested: false,
      status: "not-requested",
      targets: [],
      requiresAppEvidence: false,
      policy: "No deploy add-on was requested during Genesis.",
      nextCommands: [],
    };
  }
  return {
    requested: true,
    status: "requires-adapt-deploy-scope",
    targets,
    requiresAppEvidence: true,
    policy: "Docker/Dokploy artifacts are generated by /supervibe-adapt deploy scope after real service evidence exists. Genesis records the intent but does not guess Dockerfiles from placeholder folders.",
    nextCommands: targets.map((target) => ({
      target,
      command: `node <resolved-supervibe-plugin-root>/scripts/supervibe-adapt.mjs --scope deploy --target ${target} --dry-run`,
      reason: `${target} deploy add-on requested; run after --generate-apps or after package/composer evidence exists`,
    })),
  };
}

function buildStackAmbiguities(tags, frontendTarget = null) {
  const warnings = frontendTarget?.driftWarnings || [];
  if (warnings.length > 0) {
    return warnings.map((warning) => ({
      code: warning.code,
      choices: warning.options || frontendTarget.choices || [],
      message: warning.message,
      requiresChoice: false,
      recommendedId: frontendTarget.id || "next-app",
      policy: frontendTarget.policy || "",
    }));
  }
  if (!(tags.has("nextjs") && tags.has("vite"))) return [];
  if (tags.has("tauri") || tags.has("chrome-extension")) return [];
  return [{
    code: "nextjs-vite-frontend",
    choices: [
      { id: "next-app", label: "Next app on Turbopack", tradeoff: "Use this when the web frontend is a single Next.js app; Vite evidence is ignored for app generation.", provenance: "genesis-stack-ambiguity" },
      { id: "vite-spa", label: "Vite SPA", tradeoff: "Use this when the frontend is a standalone Vite SPA instead of Next.js; Next agents should be deferred.", provenance: "genesis-stack-ambiguity" },
      { id: "monorepo-two-frontends", label: "Two frontends", tradeoff: "Use this only when Next.js and Vite are intentional separate apps; requires explicit app-dir choices.", provenance: "genesis-stack-ambiguity" },
      { id: "tooling-only", label: "Vite tooling only", tradeoff: "Keep the resolved app target and classify Vite as tooling evidence only.", provenance: "genesis-stack-ambiguity" },
    ],
    message: "Next.js uses Turbopack by default; Vite evidence should be a separate SPA/frontend or tooling dependency only when explicit.",
    requiresChoice: true,
  }];
}

export function formatGenesisDryRunReport(report) {
  const lines = [
    report.dryRun === false ? "SUPERVIBE_GENESIS_APPLY_PLAN" : "SUPERVIBE_GENESIS_DRY_RUN",
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
    `GENERATE_APPS_STEP: ${report.generateAppsStep?.approvalRequired ? "approval-required" : "not-needed"}`,
    `STACK_CLARIFICATION_REQUIRED: ${report.generateAppsStep?.clarificationRequired ? "true" : "false"}`,
    `APP_CHOICE: ${report.generateAppsStep?.appChoice?.id || "none"}`,
    `FRONTEND_BUNDLER: ${report.generateAppsStep?.appChoice?.bundler || report.generateAppsStep?.frontendTarget?.bundler || "none"}`,
    `DEPLOY_ADDON_POLICY: ${report.deployAddOnPolicy?.status || "not-requested"}`,
    `POST_APPLY_COMMANDS: ${report.postApplyCommands.map((entry) => entry.command).join(" && ")}`,
    "AGENT_ROLES:",
    formatAgentRoleSummaries(report.agentProfile.selectedAgents, { agents: report.agentProfile.agentResponsibilities }, { max: 80 }) || "- none",
    "UPDATE_ADAPT_NEXT: After plugin updates run /supervibe-update, then /supervibe-adapt in each project to dry-run managed artifact changes; never delete project files manually.",
  ];
  for (const entry of report.filesToModify) lines.push(`MODIFY: ${entry.path} - ${entry.reason}`);
  for (const entry of report.filesToCreate.slice(0, 10)) lines.push(`CREATE: ${entry.path} - ${entry.reason}`);
  for (const entry of report.deployAddOnPolicy?.nextCommands || []) {
    lines.push(`DEPLOY_ADDON_NEXT: ${entry.command} (${entry.reason})`);
  }
  for (const ambiguity of report.generateAppsStep?.stackAmbiguities || []) {
    lines.push(`STACK_AMBIGUITY: ${ambiguity.code} - ${ambiguity.message}`);
    lines.push(`STACK_CHOICES: ${(ambiguity.choices || []).map((choice) => choice.id).join(", ")}`);
    if (ambiguity.recommendedId) lines.push(`STACK_RECOMMENDED: ${ambiguity.recommendedId}`);
  }
  for (const entry of report.generateAppsStep?.commands || []) lines.push(`GENERATE_APPS_COMMAND: ${entry.command} (${entry.when})`);
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

function listAvailableRuleRecords(rootDir) {
  const rulesDir = join(rootDir, "rules");
  const records = new Map();
  if (!existsSync(rulesDir)) return records;
  for (const file of listMarkdownFiles(rulesDir)) {
    const id = file.replace(/\.md$/, "");
    const path = findMarkdownFilePath(rulesDir, file);
    const frontmatter = path ? parseFrontmatter(readFileSync(path, "utf8")) : {};
    const name = String(frontmatter.name || id).trim();
    const record = {
      id,
      name,
      relatedRules: asArray(frontmatter["related-rules"]).map((item) => String(item).trim()).filter(Boolean),
    };
    records.set(id, record);
    if (name) records.set(name, record);
  }
  return records;
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
  if (hasDep(deps, ["typescript", "tsx", "ts-node"])) addTag("typescript", source, "typescript");
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

function extractStackTagsFromText(text = "") {
  const value = String(text || "").toLowerCase();
  const matches = [];
  const aliases = [
    ["nextjs", /\bnext(?:\.js|js)?\b/, ["next", "next.js", "nextjs"]],
    ["react", /\breact\b/, ["react"]],
    ["vite", /\bvite\b/, ["vite"]],
    ["typescript", /\btypescript\b|\bts\b/, ["typescript", "ts"]],
    ["tailwind", /\btailwind(?:css)?\b/, ["tailwind", "tailwindcss"]],
    ["laravel", /\blaravel\b/, ["laravel"]],
    ["postgres", /\bpostgres(?:ql)?\b/, ["postgres", "postgresql"]],
    ["redis", /\bredis\b/, ["redis"]],
    ["mysql", /\bmysql\b|\bmariadb\b/, ["mysql", "mariadb"]],
    ["mongodb", /\bmongo(?:db)?\b/, ["mongo", "mongodb"]],
    ["graphql", /\bgraphql\b|\bapollo\b/, ["graphql", "apollo"]],
    ["tauri", /\btauri\b/, ["tauri"]],
    ["rust", /\brust\b/, ["rust"]],
    ["vue", /\bvue\b/, ["vue"]],
    ["nuxt", /\bnuxt\b/, ["nuxt"]],
    ["sveltekit", /\bsvelte(?:kit)?\b/, ["svelte", "sveltekit"]],
    ["django", /\bdjango\b/, ["django"]],
    ["fastapi", /\bfastapi\b/, ["fastapi"]],
    ["rails", /\brails\b/, ["rails"]],
    ["go", /\bgolang\b|\bgo\b/, ["golang", "go"]],
    ["chrome-extension", /\bchrome extension\b|\bmv3\b|\bextension\b/, ["chrome extension", "mv3", "extension"]],
    ["docker", /\bdocker\b|\bdockerfile\b|\bcompose\b/, ["docker", "dockerfile", "compose"]],
    ["dokploy", /\bdokploy\b/, ["dokploy"]],
  ];
  for (const [tag, pattern, terms] of aliases) {
    if (pattern.test(value) && hasAffirmedStackMention(value, terms)) matches.push(tag);
  }
  return matches;
}

function hasAffirmedStackMention(value, terms = []) {
  for (const term of terms) {
    const escaped = escapeRegExp(term);
    const pattern = new RegExp(`\\b${escaped}\\b`, "gi");
    for (const match of value.matchAll(pattern)) {
      const before = value.slice(Math.max(0, match.index - 48), match.index);
      const after = value.slice(match.index + match[0].length, match.index + match[0].length + 56);
      if (!isNegatedMention(before, after)) return true;
    }
  }
  return false;
}

function isNegatedMention(before = "", after = "") {
  return /(?:\bno\b|\bnot\b|\bwithout\b|\bdo\s+not\s+use\b|\bdon't\s+use\b|\bnot\s+using\b|\bне\b|\bбез\b)\s*$/i.test(before)
    || /^\s*(?:is\s+not\s+used|isn't\s+used|not\s+used|not\s+in\s+use|not\s+part|unused|не\s+используется)\b/i.test(after);
}

function normalizeExplicitStackTags(values = []) {
  return unique(values.flatMap((value) => {
    const raw = String(value || "").trim();
    if (!raw) return [];
    return raw.split(/[,\s/|+]+/).map((part) => normalizeStackTag(part) || normalizeStackAlias(part)).filter(Boolean);
  }));
}

function normalizeStackAlias(value) {
  const normalized = String(value || "").toLowerCase().replace(/[^a-z0-9.+-]/g, "");
  if (!normalized) return null;
  if (["next", "next.js", "nextjs"].includes(normalized)) return "nextjs";
  if (["postgresql", "postgres"].includes(normalized)) return "postgres";
  if (["tailwindcss", "tailwind"].includes(normalized)) return "tailwind";
  if (["ts", "typescript"].includes(normalized)) return "typescript";
  if (["golang"].includes(normalized)) return "go";
  return normalizeStackTag(normalized) || normalized;
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeStackTag(name) {
  const value = String(name).toLowerCase();
  if (value === "typescript") return "typescript";
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
  if (["docker", "dockerfile", "docker-compose", "compose"].includes(value) || value.includes("docker")) return "docker";
  if (value.includes("dokploy")) return "dokploy";
  return null;
}

function resolveGenesisStackPack({ pluginRoot, fingerprint }) {
  const tags = new Set(fingerprint.tags || []);
  const candidates = [
    { id: "tauri-react-rust-postgres", path: "stack-packs/tauri-react-rust-postgres/pack.yaml", requiredTags: ["tauri"], exactTags: ["tauri", "react", "rust", "postgres"] },
    { id: "laravel-nextjs-postgres-redis", path: "stack-packs/laravel-nextjs-postgres-redis/manifest.yaml", requiredTags: ["laravel", "nextjs", "postgres", "redis"], exactTags: ["laravel", "nextjs", "postgres", "redis"] },
    { id: "laravel-nextjs-postgres", path: "stack-packs/laravel-nextjs-postgres/manifest.yaml", requiredTags: ["laravel", "nextjs", "postgres"], exactTags: ["laravel", "nextjs", "postgres"] },
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
  const ruleRecords = listAvailableRuleRecords(pluginRoot);
  const packRules = asArray(stackPack?.data?.["rules-attach"]);
  const requestedAdaptationRules = addOns.includes("project-adaptation") ? ADAPTATION_RULES : [];
  const baseWantedRules = unique([
    ...listMandatoryRules(pluginRoot),
    ...packRules,
    ...requestedAdaptationRules,
  ]);
  const wantedRules = expandRelatedRuleClosure(baseWantedRules, ruleRecords);
  return {
    selectedRules: wantedRules.filter((id) => availableRules.has(id)),
    missingRules: wantedRules.filter((id) => !availableRules.has(id)),
  };
}

function expandRelatedRuleClosure(seedRules, ruleRecords) {
  const selected = [];
  const seen = new Set();
  const queue = [...seedRules];
  while (queue.length > 0) {
    const requestedId = queue.shift();
    if (!requestedId || seen.has(requestedId)) continue;
    seen.add(requestedId);
    const record = ruleRecords.get(requestedId);
    const id = record?.id || requestedId;
    if (!selected.includes(id)) selected.push(id);
    for (const related of record?.relatedRules || []) {
      if (!seen.has(related)) queue.push(related);
    }
  }
  return selected;
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

function resolveStackPackScaffoldArtifacts({ stackPack, addOns = [], fingerprint = {} }) {
  const scaffold = stackPack?.data?.scaffold || {};
  const rootFiles = uniqueScaffoldEntries([
    ...asArray(scaffold["root-files"]).map((entry) => ({ path: entry.path, source: entry.source || null, type: "file", reason: "stack-pack root file" })),
    ...baseRootScaffoldFiles(),
  ]);
  const directories = uniqueScaffoldEntries([
    ...basePlaceholderDirectories(fingerprint),
    ...asArray(scaffold.directories).map((entry) => ({ path: entry.path, source: null, type: "directory", reason: entry.purpose || "stack-pack directory" })),
  ]);
  const husky = Object.entries(scaffold.husky || {}).map(([name, source]) => ({ path: `.husky/${name}`, source, type: "file", reason: "stack-pack git hook" }));
  const baseHooks = baseHuskyScaffoldFiles();
  const ci = resolveCiAddOnScaffold(addOns);
  return {
    files: uniqueScaffoldEntries([...rootFiles, ...directories, ...husky, ...baseHooks, ...ci]).filter((entry) => entry.path),
  };
}

function baseRootScaffoldFiles() {
  return [
    { path: ".editorconfig", source: "templates/configs/.editorconfig", type: "file", reason: "base UTF-8/LF editor policy" },
    { path: ".gitattributes", source: "templates/configs/.gitattributes", type: "file", reason: "base LF normalization policy" },
    { path: ".gitignore", source: "templates/gitignore/_base", type: "file", reason: "base generated/runtime ignore policy" },
    { path: ".nvmrc", source: "templates/configs/.nvmrc", type: "file", reason: "base Node runtime version marker" },
    { path: "commitlint.config.js", source: "templates/configs/commitlint.config.js", type: "file", reason: "base commit message policy required by scaffold rubric" },
    { path: "lint-staged.config.js", source: "templates/configs/lint-staged.config.js", type: "file", reason: "base staged-file policy required by scaffold rubric" },
  ];
}

function baseHuskyScaffoldFiles() {
  return [
    { path: ".husky/pre-commit", source: "templates/husky/pre-commit-base", type: "file", reason: "base pre-commit hook required by scaffold rubric" },
    { path: ".husky/commit-msg", source: "templates/husky/commit-msg", type: "file", reason: "base commit-message hook required by scaffold rubric" },
  ];
}

function basePlaceholderDirectories(fingerprint = {}) {
  const tags = new Set(fingerprint.tags || []);
  const dirs = [
    { path: "docs/", source: null, type: "directory", reason: "project documentation placeholder" },
    { path: ".supervibe/artifacts/prototypes/", source: null, type: "directory", reason: "HTML prototypes placeholder" },
  ];
  if (tags.has("nextjs") || tags.has("vite") || tags.has("react")) {
    dirs.push({ path: "frontend/", source: null, type: "directory", reason: "frontend placeholder; run approved generate-apps step for real app scaffold" });
  }
  if (tags.has("laravel") || tags.has("fastapi") || tags.has("django") || tags.has("rails") || tags.has("express") || tags.has("nestjs")) {
    dirs.push({ path: "backend/", source: null, type: "directory", reason: "backend placeholder; run approved generate-apps step for real app scaffold" });
  }
  return dirs;
}

function uniqueScaffoldEntries(entries = []) {
  const byPath = new Map();
  for (const entry of entries) {
    if (!entry?.path || byPath.has(entry.path)) continue;
    byPath.set(entry.path, entry);
  }
  return [...byPath.values()];
}

function resolveCiAddOnScaffold(addOns = []) {
  const normalized = new Set(normalizeAddOns(addOns));
  const files = [];
  if (normalized.has("github-actions")) {
    files.push({
      path: ".github/workflows/supervibe-ci.yml",
      source: "templates/ci/github-actions-supervibe-ci.yml",
      type: "file",
      reason: "github-actions CI add-on",
    });
  }
  if (normalized.has("gitlab-ci")) {
    files.push({
      path: ".gitlab-ci.yml",
      source: "templates/ci/gitlab-ci.yml",
      type: "file",
      reason: "gitlab-ci add-on",
    });
  }
  if (normalized.has("ci-ready")) {
    files.push({
      path: "docs/ci-ready.md",
      source: "templates/ci/ci-ready.md",
      type: "file",
      reason: "CI readiness add-on",
    });
  }
  return files;
}

function renderManagedInstruction({ hostSelection, fingerprint, agentProfile, recommendedAgents, optionalAgents }) {
  const agentRoles = formatAgentRoleSummaries(agentProfile.selectedAgents, { agents: agentProfile.agentResponsibilities }, { max: 30 });
  const adapter = hostSelection.adapter;
  const terminalRulePath = `${adapter.rulesFolder}/terminal-file-io.md`;
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
    `- Follow \`.editorconfig\`, \`.gitattributes\`, and \`${terminalRulePath}\`: write text files as UTF-8 with LF, prefer Node \`fs.writeFile(..., "utf8")\`, and avoid legacy PowerShell redirection for non-ASCII or machine-readable files.`,
    "",
    "## Agent Orchestration Contract",
    "- Treat `scripts/lib/command-agent-orchestration-contract.mjs` and `rules/command-agent-orchestration.md` as the source of truth for slash-command agent requirements.",
    "- Every `/supervibe-*` command invocation has an explicit owner agent; default to `supervibe-orchestrator` for routing, gates, and evidence.",
    "- Before durable command work, run `node <resolved-supervibe-plugin-root>/scripts/command-agent-plan.mjs --command /supervibe-...` and follow the printed `SUPERVIBE_COMMAND_AGENT_PLAN`.",
    "- The command-agent plan is the runtime `agentPlan`; it must name `requiredAgentIds`, selected host dispatch support, proof source, and whether durable writes are allowed.",
    "- Use execution modes `inline`, `real-agents`, or `hybrid`; `inline` is diagnostic/dry-run only and must not claim specialist output.",
    "- `real-agents` and agent-owned `hybrid` outputs require runtime receipts with `hostInvocation.source` and `hostInvocation.invocationId` from a real host agent run.",
    "- In Codex, invoke required specialists through `spawn_agent` using the `CODEX_SPAWN_PAYLOAD_RULES` and `CODEX_SPAWN_PAYLOADS` printed by `command-agent-plan.mjs`; when `fork_context=true`, omit `agent_type`, `model`, and `reasoning_effort`, and encode the Supervibe logical role in `message` instead of Codex `agent_type`.",
    "- In Codex, record each returned agent id with `node <resolved-supervibe-plugin-root>/scripts/agent-invocation.mjs log --agent <agent-id> --host codex --host-invocation-id <runtime-id> --task <summary> --confidence <0-10>` before issuing receipts.",
    "- If a required agent is missing or invocation proof is unavailable, enter `agent-required-blocked`, offer provision/connect/stop choices, and do not emulate specialist output.",
    "- Command or skill receipts must not substitute for specialist agent, worker, or reviewer output.",
    "",
    "## Fast Command Lookup",
    "- Before broad repo search for a command-like user request, run `node <resolved-supervibe-plugin-root>/scripts/supervibe-commands.mjs --match \"<user request>\"`.",
    "- Examples: `npm run code:index вот запусти индексацию` -> genesis-compatible source RAG command; `сделай дизайн макет UI` -> `/supervibe-design`; `проверь безопасность` -> `/supervibe-security-audit`.",
    "- If the catalog returns `SUPERVIBE_COMMAND_MATCH`, run the printed `COMMAND:` from the project root or invoke the printed slash command in the active AI CLI. Do not search the whole project for command docs first.",
    "- If the catalog prints `AGENT_PLAN_COMMAND`, run it before the slash command writes durable artifacts or claims specialist output.",
    "- If the catalog returns `INTENT: missing_slash_command` or `HARD_STOP: true`, stop immediately, report the missing command, and do not inspect source files, marketplace command files, or repository paths to emulate it.",
    "- Treat `PROJECT_SCRIPT: missing` plus `PLUGIN_SCRIPT: present/known-shortcut` as a portable Supervibe command, not as a project package.json failure.",
    "- For every claimed Supervibe command, skill, agent, reviewer, worker, validator, or external-tool invocation, issue a shared workflow receipt with `node <resolved-supervibe-plugin-root>/scripts/workflow-receipt.mjs issue ...`; hand-written receipts are untrusted and `npm run validate:workflow-receipts` must pass before claiming delegated work is complete.",
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
  const normalized = String(raw).replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---")) return {};
  const end = normalized.indexOf("\n---", 3);
  if (end === -1) return {};
  const block = normalized.slice(3, end);
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
