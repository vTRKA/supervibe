import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative } from "node:path";

export const SOURCE_RAG_INDEX_COMMAND = "node <resolved-supervibe-plugin-root>/scripts/build-code-index.mjs --root . --resume --source-only --max-files 200 --max-seconds 120 --health --json-progress";
export const LIST_MISSING_INDEX_COMMAND = "node <resolved-supervibe-plugin-root>/scripts/build-code-index.mjs --root . --list-missing";
export const CODEGRAPH_INDEX_COMMAND = "node <resolved-supervibe-plugin-root>/scripts/build-code-index.mjs --root . --resume --graph --max-files 200 --health";
export const MEMORY_WATCH_COMMAND = "node <resolved-supervibe-plugin-root>/scripts/watch-memory.mjs";

const KNOWN_NPM_SCRIPT_SHORTCUTS = Object.freeze({
  "code:index": "index-rag-codegraph",
});

const PACKAGE_SCRIPT_ACTION_WORDS = Object.freeze([
  "run", "start", "execute", "launch", "show", "check", "validate", "audit", "build", "open", "list", "print", "repair", "add", "provision", "connect", "copy",
  "запусти", "стартуй", "выполни", "покажи", "проверь", "валидируй", "проаудируй", "собери", "открой", "выведи", "почини",
]);

const PACKAGE_SCRIPT_GENERIC_TOKENS = new Set([
  "run", "start", "stop", "restart", "test", "dev", "build", "watch", "check", "validate", "audit", "status", "script", "scripts", "npm", "pnpm", "yarn", "bun", "supervibe",
]);

const PACKAGE_SCRIPT_TOKEN_ALIASES = Object.freeze({
  agent: ["agent", "agents", "агент", "агенты"],
  artifact: ["artifact", "artifacts", "артефакт", "артефакты"],
  capabilities: ["capabilities", "capability", "возможности"],
  checkpoint: ["checkpoint", "чекпоинт"],
  commands: ["commands", "command", "команды", "команда"],
  confidence: ["confidence", "уверенность", "скор"],
  context: ["context", "контекст"],
  detect: ["detect", "detection", "детект", "определи"],
  docs: ["docs", "documentation", "доки", "документация"],
  doctor: ["doctor", "diagnostics", "диагностика", "доктор"],
  feedback: ["feedback", "фидбек"],
  frontmatter: ["frontmatter", "metadata", "метаданные"],
  gates: ["gates", "gate", "гейты", "гейт"],
  happy: ["happy"],
  health: ["health", "здоровье", "готовность"],
  ide: ["ide", "иде"],
  index: ["index", "indexer", "индекс", "индексация", "индексирование"],
  install: ["install", "installation", "установка"],
  isolation: ["isolation", "изоляция"],
  loop: ["loop", "цикл"],
  media: ["media", "медиа"],
  memory: ["memory", "память"],
  package: ["package", "пакет"],
  palette: ["palette", "палитра"],
  performance: ["performance", "perf", "производительность"],
  plan: ["plan", "план"],
  plugin: ["plugin", "плагин"],
  preview: ["preview", "превью", "просмотр"],
  quality: ["quality", "качество"],
  registry: ["registry", "реестр"],
  release: ["release", "релиз"],
  replay: ["replay", "проиграй", "реплей"],
  security: ["security", "безопасность", "уязвимости"],
  status: ["status", "статус"],
  trigger: ["trigger", "triggers", "триггер", "триггеры"],
  ui: ["ui", "interface", "интерфейс", "панель"],
  upgrade: ["upgrade", "update", "апгрейд", "обновление"],
  watch: ["watch", "watcher", "следи", "отслеживай", "наблюдатель"],
  workspace: ["workspace", "воркспейс"],
});

const SLASH_COMMAND_SHORTCUTS = Object.freeze([
  {
    command: "/supervibe",
    title: "Route to the next safe Supervibe workflow",
    aliases: ["что дальше", "route this request", "auto route supervibe", "diagnose trigger", "why trigger"],
    keywordGroups: [["route", "auto", "trigger", "diagnose", "why", "дальше", "маршрутизируй"], ["supervibe", "workflow", "command", "команда", "воркфлоу"]],
  },
  {
    command: "/supervibe-adapt",
    title: "Adapt project artifacts after a plugin update",
    aliases: ["адаптируй проект после обновления", "adapt project artifacts after update", "обнови agents rules skills в проекте", "sync project artifacts"],
    keywordGroups: [["adapt", "sync", "update", "адаптируй", "синхронизируй", "обнови"], ["artifacts", "agents", "rules", "skills", "project", "артефакты", "агенты", "правила", "скиллы", "проект"]],
  },
  {
    command: "/supervibe-audit",
    title: "Audit project health",
    aliases: ["проведи аудит проекта", "run project audit", "проверь проект", "health check project"],
    keywordGroups: [["audit", "check", "review", "проверь", "проведи", "аудит"], ["project", "health", "качество", "проект", "здоровье"]],
  },
  {
    command: "/supervibe-brainstorm",
    title: "Brainstorm and capture a spec",
    aliases: ["сделай брейншторм идеи", "brainstorm the feature", "обсудим идею", "придумай решение"],
    keywordGroups: [["brainstorm", "ideate", "explore", "брейншторм", "обсудим", "придумай"], ["feature", "idea", "solution", "идея", "решение", "фича"]],
  },
  {
    command: "/supervibe-design",
    title: "Run the design pipeline",
    aliases: ["сделай дизайн макет ui", "build a ui prototype", "сделай прототип", "нужен дизайн интерфейса", "landing page design"],
    keywordGroups: [["design", "prototype", "mockup", "ui", "ux", "landing", "дизайн", "макет", "прототип", "интерфейс"], ["build", "make", "create", "сделай", "создай", "нужен"]],
  },
  {
    command: "/supervibe-doctor",
    title: "Diagnose host installation",
    aliases: ["проверь установку supervibe", "run host doctor", "diagnose install", "проверь host adapter"],
    keywordGroups: [["doctor", "diagnose", "install", "host", "доктор", "диагностика", "установка"], ["supervibe", "host", "adapter", "плагин", "адаптер"]],
  },
  {
    command: "/supervibe-execute-plan",
    title: "Execute a reviewed plan",
    aliases: ["выполни план", "execute reviewed plan", "запусти выполнение плана", "implement the plan"],
    keywordGroups: [["execute", "implement", "run", "выполни", "реализуй", "запусти"], ["plan", "план"]],
  },
  {
    command: "/supervibe-gc",
    title: "Run reversible cleanup",
    aliases: ["очисти старые задачи", "cleanup old work items", "запусти gc", "garbage collect memory"],
    keywordGroups: [["cleanup", "clean", "gc", "garbage", "prune", "очисти", "убери"], ["memory", "tasks", "work items", "мусор", "память", "задачи"]],
  },
  {
    command: "/supervibe-genesis",
    title: "Scaffold Supervibe into a project",
    aliases: ["инициализируй supervibe", "setup supervibe project", "подключи supervibe к проекту", "bootstrap supervibe"],
    keywordGroups: [["genesis", "setup", "bootstrap", "scaffold", "init", "инициализируй", "подключи", "разверни"], ["supervibe", "project", "проект"]],
  },
  {
    command: "/supervibe-loop",
    title: "Run autonomous loop or work-item control",
    aliases: ["запусти автономный loop", "run autonomous loop", "запусти эпик в worktree", "run 10 sessions on the plan"],
    keywordGroups: [["loop", "autonomous", "epic", "worktree", "sessions", "автоном", "эпик", "сессии"], ["run", "start", "запусти", "запуск"]],
  },
  {
    command: "/supervibe-plan",
    title: "Write or review an implementation plan",
    aliases: ["напиши план реализации", "create implementation plan", "составь план", "review the plan"],
    keywordGroups: [["plan", "planning", "план", "спланируй", "составь"], ["implementation", "реализация", "review", "ревью"]],
  },
  {
    command: "/supervibe-presentation",
    title: "Build a presentation deck",
    aliases: ["сделай презентацию", "build slide deck", "создай pptx", "нужны слайды"],
    keywordGroups: [["presentation", "deck", "slides", "pptx", "презентация", "слайды"], ["build", "create", "make", "сделай", "создай"]],
  },
  {
    command: "/supervibe-preview",
    title: "Manage preview server",
    aliases: ["запусти превью прототипа", "start preview server", "открой localhost preview", "покажи live preview"],
    keywordGroups: [["preview", "localhost", "server", "превью", "просмотр"], ["start", "open", "run", "запусти", "открой", "покажи"]],
  },
  {
    command: "/supervibe-score",
    title: "Score an artifact against a rubric",
    aliases: ["оцени артефакт", "score the artifact", "поставь confidence score", "проверь на 10 из 10"],
    keywordGroups: [["score", "confidence", "rubric", "оценка", "оцени"], ["artifact", "качество", "10 из 10", "артефакт"]],
  },
  {
    command: "/supervibe-security-audit",
    title: "Run security audit",
    aliases: ["проверь безопасность", "run security audit", "проверь уязвимости", "security remediation plan"],
    keywordGroups: [["security", "vulnerability", "vulnerabilities", "safe", "безопасность", "уязвимости"], ["audit", "check", "scan", "remediation", "проверь", "аудит"]],
  },
  {
    command: "/supervibe-status",
    title: "Show Supervibe status",
    aliases: ["покажи статус проекта", "show project status", "проверь capabilities", "show supervibe health"],
    keywordGroups: [["status", "health", "capabilities", "ready", "статус", "здоровье", "готовность"], ["project", "supervibe", "проект", "плагин"]],
  },
  {
    command: "/supervibe-strengthen",
    title: "Strengthen weak agents or artifacts",
    aliases: ["усиль слабых агентов", "strengthen weak agents", "прокачай агентов", "agents do not use tools"],
    keywordGroups: [["strengthen", "improve", "weak", "усиль", "прокачай", "слабые"], ["agents", "agent", "агенты", "агента"]],
  },
  {
    command: "/supervibe-ui",
    title: "Open local control plane",
    aliases: ["покажи kanban доску задач", "open kanban dashboard", "открой ui задач", "show tasks dashboard"],
    keywordGroups: [["ui", "dashboard", "kanban", "board", "доска", "панель"], ["tasks", "epics", "agents", "задачи", "эпики", "агенты"]],
  },
  {
    command: "/supervibe-update",
    title: "Update the plugin",
    aliases: ["обнови плагин", "update the plugin", "обнови supervibe", "pull latest supervibe"],
    keywordGroups: [["update", "upgrade", "pull", "latest", "обнови", "апдейт"], ["plugin", "supervibe", "плагин"]],
  },
].map(createSlashShortcut));

const COMMAND_SHORTCUTS = Object.freeze([
  {
    id: "index-rag-codegraph",
    intent: "code_index_build",
    title: "Index RAG and CodeGraph",
    command: SOURCE_RAG_INDEX_COMMAND,
    followUpCommands: [
      LIST_MISSING_INDEX_COMMAND,
      CODEGRAPH_INDEX_COMMAND,
    ],
    description: "Run the genesis-compatible bounded source RAG batch, then graph catch-up, without a repo-wide command search.",
    aliases: [
      "npm run code:index",
      "`npm run code:index`",
      "npm run code:index вот запусти индексацию",
      "run code:index",
      "запусти индексирование rag/codegraph",
      "запусти индексацию rag codegraph",
      "запусти индексацию",
      "запусти индекс кода",
      "проиндексируй проект",
      "проиндексируй код",
      "индексируй rag codegraph",
      "переиндексируй проект",
      "переиндексируй кодовую базу",
      "обнови code rag",
      "обнови rag индекс",
      "собери codegraph",
      "собери code graph",
      "почини rag индекс",
      "построй rag codegraph индекс",
      "run rag codegraph indexing",
      "index rag codegraph",
      "refresh code index",
      "build code rag index",
      "start indexing the project",
      "run the supervibe code indexer",
      "build code graph index",
      "build code index",
    ],
    keywordGroups: [
      [
        "npm run code:index",
        "run",
        "start",
        "launch",
        "build",
        "rebuild",
        "refresh",
        "update",
        "repair",
        "fix",
        "reindex",
        "indexing",
        "запусти",
        "запуск",
        "стартуй",
        "собери",
        "построй",
        "обнови",
        "переиндексируй",
        "проиндексируй",
        "индексируй",
        "почини",
        "пересобери",
      ],
      [
        "code:index",
        "code index",
        "code indexer",
        "code rag",
        "rag",
        "codegraph",
        "code graph",
        "graph index",
        "индекс",
        "индексац",
        "индексация",
        "индексирование",
        "код",
        "кодовую базу",
        "проект",
        "кодграф",
      ],
    ],
    mutationRisk: "writes-generated-index",
    directRoute: true,
    requiredGroupIndexes: [0, 1],
    nextAction: "Run the COMMAND from the project root; it writes only generated index state under .supervibe/memory/. If the bounded batch times out, rerun the same COMMAND, then run the graph follow-up when source coverage is healthy.",
  },
  {
    id: "index-health",
    intent: "index_repair",
    title: "Show index health and repair command",
    command: "node <resolved-supervibe-plugin-root>/scripts/supervibe-status.mjs --index-health --strict-index-health --no-gc-hints --no-color",
    description: "Inspect index readiness and print the next repair command without indexing.",
    aliases: [
      "проверь index health",
      "покажи health rag codegraph",
      "show index health",
      "check rag codegraph health",
    ],
    keywordGroups: [
      ["health", "ready", "readiness", "проверь", "покажи"],
      ["index", "rag", "codegraph", "code graph"],
    ],
    mutationRisk: "none",
    directRoute: false,
    nextAction: "Run status first when the user asked to inspect rather than start indexing.",
  },
  {
    id: "agent-provisioning",
    intent: "agent_provisioning",
    title: "Provision Supervibe agents and skills into the active host",
    command: "node <resolved-supervibe-plugin-root>/scripts/provision-agents.mjs",
    description: "Dry-run or apply missing agent/skill installation into the selected host adapter and refresh managed instructions.",
    aliases: [
      "add missing agents",
      "install missing agents",
      "provision agents",
      "connect real agents",
      "real agents are not being invoked",
      "agents are being emulated",
      "copy agents from plugin to project",
      "sync agents and skills into project",
      "добавь недостающих агентов",
      "установи недостающих агентов",
      "подключи настоящих агентов",
      "агенты не вызываются",
      "агенты эмулируются",
      "скопируй агентов из плагина в проект",
      "синхронизируй агентов и скилы в проект",
    ],
    keywordGroups: [
      ["add", "install", "provision", "connect", "copy", "sync", "invoke", "invoked", "emulated", "real", "missing", "unavailable", "добавь", "установи", "подключи", "подключены", "скопируй", "синхронизируй", "вызываются", "эмулируются", "настоящих", "не хватает", "недоступны", "отсутствуют"],
      ["agent", "agents", "skill", "skills", "агент", "агенты", "агентов", "скил", "скилы", "скиллы", "skills"],
    ],
    mutationRisk: "unknown",
    directRoute: true,
    nextAction: "Run the provisioning dry-run first. Apply only after confirming the host, agents, skills, and managed instruction refresh.",
  },
  {
    id: "design-pipeline-synonyms",
    intent: "design_new",
    title: "Route design-system, styleboard, and prototype requests",
    command: "/supervibe-design",
    description: "Route English/Russian design system, styleboard, UI mockup, and prototype phrasing to the design workflow.",
    aliases: [
      "create a design system",
      "build a new design system",
      "make a styleboard",
      "design system from old prototypes",
      "make the interface design",
      "создай новую дизайн систему",
      "сделай дизайн систему",
      "сделай стайлборд",
      "сделай прототип",
      "сделай макет ui",
      "дизайн система из старых прототипов",
    ],
    keywordGroups: [
      ["design system", "styleboard", "brandbook", "tokens", "дизайн система", "дизайн-система", "стайлборд", "токены"],
      ["create", "build", "make", "redesign", "improve", "from old", "сделай", "создай", "построй", "переработай", "улучши", "старых", "старые"],
    ],
    mutationRisk: "delegates-to-slash-command",
    directRoute: true,
    nextAction: "Run /supervibe-design in the active AI CLI; the design workflow owns intake, wizard, agent, and receipt gates.",
  },
  ...SLASH_COMMAND_SHORTCUTS,
]);

function getCommandShortcuts() {
  return COMMAND_SHORTCUTS.map(copyShortcut);
}

export function findCommandShortcut(request, { shortcuts = COMMAND_SHORTCUTS } = {}) {
  const text = normalizeText(request);
  if (!text) return null;
  const scored = shortcuts
    .map((shortcut) => scoreShortcut(shortcut, text))
    .filter(Boolean)
    .sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id));
  return scored[0] || null;
}

export function resolveCommandRequest(request, {
  pluginRoot = process.cwd(),
  projectRoot = process.cwd(),
  shortcuts = COMMAND_SHORTCUTS,
} = {}) {
  const slashCommands = readSlashCommands(pluginRoot);
  const projectScripts = readNpmScripts(projectRoot, "project");
  const pluginScripts = readNpmScripts(pluginRoot, "plugin");
  const explicitSlash = parseExplicitSupervibeCommand(request);

  if (explicitSlash) {
    const slashCommand = slashCommands.find((entry) => entry.id === explicitSlash.name);
    return {
      id: slashCommand ? `slash-command:${explicitSlash.name.slice(1)}` : `missing-slash-command:${explicitSlash.name.slice(1)}`,
      intent: slashCommand ? "slash_command" : "missing_slash_command",
      title: slashCommand?.description || `Slash command ${explicitSlash.name}`,
      command: slashCommand ? explicitSlash.command : null,
      confidence: 1,
      reason: slashCommand
        ? `explicit Supervibe slash command exists: ${explicitSlash.name}`
        : `explicit Supervibe slash command is not published: ${explicitSlash.name}`,
      requestedCommand: explicitSlash.command,
      slashCommandStatus: slashCommand ? "present" : "missing",
      doNotSearchProject: true,
      hardStop: !slashCommand,
      directRoute: false,
      mutationRisk: "delegates-to-slash-command",
      nextAction: slashCommand
        ? "Run this exact slash command in the active AI CLI; no repository search is needed."
        : "Hard stop: report the missing slash command from the catalog and do not inspect source files, marketplace command files, or repository paths to emulate it.",
    };
  }

  const explicit = parseExplicitNpmRun(request)
    || parseBareNpmScriptReference(request, [
      ...projectScripts.map((script) => script.name),
      ...pluginScripts.map((script) => script.name),
      ...Object.keys(KNOWN_NPM_SCRIPT_SHORTCUTS),
    ]);

  if (explicit) {
    const projectScript = projectScripts.find((script) => script.name === explicit.script);
    const pluginScript = pluginScripts.find((script) => script.name === explicit.script);
    const shortcutId = KNOWN_NPM_SCRIPT_SHORTCUTS[explicit.script];
    if (shortcutId) {
      const shortcut = shortcuts.find((entry) => entry.id === shortcutId);
      if (shortcut) {
        return enrichMatch(copyShortcut(shortcut), {
          confidence: 1,
          reason: `explicit Supervibe npm script alias: ${explicit.command}`,
          requestedCommand: explicit.command,
          requestedPackageManager: explicit.packageManager,
          projectScriptStatus: projectScript ? "present" : "missing",
          pluginScriptStatus: pluginScript ? "present" : "known-shortcut",
          doNotSearchProject: true,
        });
      }
    }

    if (projectScript) {
      return {
        id: `project-npm-script:${explicit.script}`,
        intent: "project_npm_script",
        title: `Project npm script: ${explicit.script}`,
        command: explicit.command,
        confidence: 1,
        reason: `explicit project npm script exists: ${explicit.script}`,
        requestedCommand: explicit.command,
        requestedPackageManager: explicit.packageManager,
        projectScriptStatus: "present",
        pluginScriptStatus: pluginScript ? "present" : "missing",
        doNotSearchProject: true,
        directRoute: false,
        mutationRisk: "unknown",
        nextAction: "Run this exact project npm script from the project root; no repository search is needed.",
      };
    }

    if (pluginScript) {
      return {
        id: `plugin-npm-script:${explicit.script}`,
        intent: "plugin_npm_script",
        title: `Supervibe npm script: ${explicit.script}`,
        command: portablePluginScriptCommand(pluginScript.command, explicit.args),
        confidence: 0.98,
        reason: `explicit package script is missing in the project but exists in the Supervibe plugin: ${explicit.script}`,
        requestedCommand: explicit.command,
        requestedPackageManager: explicit.packageManager,
        projectScriptStatus: "missing",
        pluginScriptStatus: "present",
        doNotSearchProject: true,
        directRoute: false,
        mutationRisk: "unknown",
        nextAction: "Run the portable plugin-root command from the project root; do not retry the missing project npm script.",
      };
    }

    return {
      id: `missing-npm-script:${explicit.script}`,
      intent: "missing_npm_script",
      title: `Missing npm script: ${explicit.script}`,
      command: null,
      confidence: 1,
      reason: `explicit npm script is not present in the project or Supervibe plugin: ${explicit.script}`,
      requestedCommand: explicit.command,
      requestedPackageManager: explicit.packageManager,
      projectScriptStatus: "missing",
      pluginScriptStatus: "missing",
      doNotSearchProject: true,
      directRoute: false,
      mutationRisk: "none",
      nextAction: "Report the missing script and ask for the intended command; do not scan the whole repository for guesses.",
    };
  }

  const shortcutMatch = findCommandShortcut(request, { shortcuts });
  if (shortcutMatch) return shortcutMatch;

  return findSemanticPackageScript(request, { projectScripts, pluginScripts });
}

export function buildProjectCommandCatalog({
  pluginRoot = process.cwd(),
  projectRoot = process.cwd(),
} = {}) {
  return {
    schemaVersion: 1,
    generatedAt: "deterministic-local",
    pluginRoot,
    projectRoot,
    shortcuts: getCommandShortcuts(),
    slashCommands: readSlashCommands(pluginRoot),
    npmScripts: readNpmScripts(projectRoot, "project"),
    pluginNpmScripts: pluginRoot === projectRoot ? [] : readNpmScripts(pluginRoot, "plugin"),
  };
}

export function formatCommandCatalog(catalog = buildProjectCommandCatalog()) {
  const lines = [
    "SUPERVIBE_COMMAND_CATALOG",
    `SHORTCUTS: ${catalog.shortcuts?.length || 0}`,
    `SLASH_COMMANDS: ${catalog.slashCommands?.length || 0}`,
    `NPM_SCRIPTS: ${catalog.npmScripts?.length || 0}`,
    `PLUGIN_NPM_SCRIPTS: ${catalog.pluginNpmScripts?.length || 0}`,
  ];
  for (const shortcut of catalog.shortcuts || []) {
    lines.push(`- ${shortcut.id}: ${shortcut.intent} -> ${shortcut.command}`);
    for (const command of shortcut.followUpCommands || []) lines.push(`  follow-up: ${command}`);
  }
  lines.push("SLASH_COMMANDS:");
  for (const command of catalog.slashCommands || []) lines.push(`- ${command.id}: ${command.description || "no description"}`);
  lines.push("NPM_SCRIPTS:");
  for (const script of catalog.npmScripts || []) lines.push(`- ${script.name}: ${script.command}`);
  if (catalog.pluginNpmScripts?.length) {
    lines.push("PLUGIN_NPM_SCRIPTS:");
    for (const script of catalog.pluginNpmScripts || []) lines.push(`- ${script.name}: ${script.command}`);
  }
  return lines.join("\n");
}

export function formatCommandMatch(match) {
  if (!match) {
    return [
      "SUPERVIBE_COMMAND_MATCH",
      "MATCH: none",
      "NEXT: run `node <resolved-supervibe-plugin-root>/scripts/supervibe-commands.mjs` to inspect the catalog",
    ].join("\n");
  }
  return [
    "SUPERVIBE_COMMAND_MATCH",
    `MATCH: ${match.id}`,
    `INTENT: ${match.intent}`,
    `CONFIDENCE: ${match.confidence}`,
    match.requestedCommand ? `REQUESTED: ${match.requestedCommand}` : null,
    match.requestedPackageManager ? `PACKAGE_MANAGER: ${match.requestedPackageManager}` : null,
    match.slashCommandStatus ? `SLASH_COMMAND: ${match.slashCommandStatus}` : null,
    match.projectScriptStatus ? `PROJECT_SCRIPT: ${match.projectScriptStatus}` : null,
    match.pluginScriptStatus ? `PLUGIN_SCRIPT: ${match.pluginScriptStatus}` : null,
    match.hardStop ? `HARD_STOP: true` : null,
    `DO_NOT_SEARCH_PROJECT: ${match.doNotSearchProject === true}`,
    `COMMAND: ${match.command || "none"}`,
    ...(match.followUpCommands?.length ? ["FOLLOW_UP_COMMANDS:", ...match.followUpCommands.map((command) => `- ${command}`)] : []),
    `WHY: ${match.reason}`,
    `NEXT: ${match.nextAction}`,
  ].filter(Boolean).join("\n");
}

function createSlashShortcut(profile) {
  const name = profile.command.replace(/^\//, "");
  const intent = profile.command === "/supervibe-design"
    ? "design_new"
    : profile.intent || name.replaceAll("-", "_");
  const directRoute = profile.directRoute === true;
  return {
    id: `shortcut:${name}`,
    intent,
    title: profile.title,
    command: profile.command,
    description: `Route to ${profile.command} from natural-language English/Russian command requests.`,
    aliases: profile.aliases || [],
    keywordGroups: profile.keywordGroups || [],
    mutationRisk: "delegates-to-slash-command",
    directRoute,
    requiredGroupIndexes: profile.requiredGroupIndexes || [0, 1],
    nextAction: `Run ${profile.command} in the active AI CLI; the slash command owns safety checks and follow-up questions.`,
  };
}

function scoreShortcut(shortcut, text) {
  const alias = (shortcut.aliases || []).find((entry) => normalizeText(entry) === text);
  if (alias) {
    return enrichMatch(copyShortcut(shortcut), {
      confidence: 1,
      reason: `exact shortcut alias: ${alias}`,
      matchedAlias: alias,
    });
  }

  const groups = shortcut.keywordGroups || [];
  const matchedGroups = groups
    .map((group) => group.find((phrase) => includesPhrase(text, phrase)))
    .filter(Boolean);
  if (shortcut.requiredGroupIndexes?.length) {
    const requiredMatched = shortcut.requiredGroupIndexes.every((index) => groups[index]?.some((phrase) => includesPhrase(text, phrase)));
    if (!requiredMatched) return null;
  }
  const requiredGroupCount = shortcut.requiredGroupIndexes?.length
    ? shortcut.requiredGroupIndexes.length
    : shortcut.requiredGroupCount ?? Math.min(2, groups.length);
  if (matchedGroups.length < requiredGroupCount) return null;
  const confidence = Math.min(0.97, 0.78 + matchedGroups.length * 0.06);
  return enrichMatch(copyShortcut(shortcut), {
    confidence: Number(confidence.toFixed(2)),
    reason: `shortcut keyword groups: ${matchedGroups.join(", ")}`,
    matchedGroups,
  });
}

function readSlashCommands(pluginRoot) {
  const dir = join(pluginRoot, "commands");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file.endsWith(".md"))
    .map((file) => {
      const path = join(dir, file);
      const raw = readFileSync(path, "utf8");
      return {
        id: `/${basename(file, ".md")}`,
        path: relative(pluginRoot, path).replace(/\\/g, "/"),
        description: parseDescription(raw),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

function readNpmScripts(rootDir, source) {
  const path = join(rootDir, "package.json");
  if (!existsSync(path)) return [];
  try {
    const pkg = JSON.parse(readFileSync(path, "utf8"));
    return Object.entries(pkg.scripts || {})
      .map(([name, command]) => ({ name, command, source }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

function parseDescription(raw) {
  const match = String(raw).match(/description:\s*(?:"([^"]+)"|'([^']+)'|([^\n]+))/);
  return (match?.[1] || match?.[2] || match?.[3] || "").trim();
}

function copyShortcut(shortcut) {
  return {
    ...shortcut,
    aliases: [...(shortcut.aliases || [])],
    keywordGroups: (shortcut.keywordGroups || []).map((group) => [...group]),
    requiredGroupIndexes: [...(shortcut.requiredGroupIndexes || [])],
    followUpCommands: [...(shortcut.followUpCommands || [])],
  };
}

function enrichMatch(shortcut, fields = {}) {
  return {
    ...shortcut,
    doNotSearchProject: true,
    ...fields,
  };
}

function parseExplicitNpmRun(request) {
  const text = String(request || "");
  const runMatch = text.match(/(?:^|[\s`"'(])(?<command>(?<manager>npm|pnpm|bun)\s+(?:run|run-script)\s+(?<script>[@\w:.-]+))(?<tail>(?:\s+--\s+[^\n`"']+)?)?/i);
  if (runMatch?.groups?.script) return parsedPackageScript(runMatch.groups);

  const yarnMatch = text.match(/(?:^|[\s`"'(])(?<command>(?<manager>yarn)\s+(?:run\s+)?(?<script>[@\w:.-]+))(?<tail>(?:\s+--\s+[^\n`"']+)?)?/i);
  if (yarnMatch?.groups?.script && !["add", "install", "remove", "upgrade"].includes(yarnMatch.groups.script)) {
    return parsedPackageScript(yarnMatch.groups);
  }

  const npmShortcut = text.match(/(?:^|[\s`"'(])(?<command>(?<manager>npm)\s+(?<script>test|start|stop|restart))(?<tail>(?:\s+--\s+[^\n`"']+)?)?/i);
  if (npmShortcut?.groups?.script) return parsedPackageScript(npmShortcut.groups);

  return null;
}

function parsedPackageScript(groups) {
  const args = String(groups.tail || "").match(/\s+--\s+(.+)$/)?.[1]?.trim() || "";
  const command = args ? `${groups.command} -- ${args}` : groups.command;
  return {
    command: command.trim(),
    script: groups.script,
    packageManager: groups.manager,
    args,
  };
}

function parseBareNpmScriptReference(request, scriptNames = []) {
  const text = String(request || "");
  const unique = [...new Set(scriptNames.filter(Boolean))]
    .sort((a, b) => b.length - a.length || a.localeCompare(b));
  for (const script of unique) {
    if (!isBareScriptReferenceAllowed(script)) continue;
    const escaped = escapeRegExp(script);
    const match = text.match(new RegExp(`(?:^|[\\s\`"'(])(?<script>${escaped})(?:[\\s\`"')]|$)`, "i"));
    if (!match?.groups?.script) continue;
    return {
      command: `npm run ${script}`,
      script,
      packageManager: "npm",
      args: "",
    };
  }
  return null;
}

function isBareScriptReferenceAllowed(script) {
  const value = String(script || "").toLowerCase();
  if (!value) return false;
  if (PACKAGE_SCRIPT_GENERIC_TOKENS.has(value)) return false;
  return value.includes(":") || value.startsWith("supervibe-");
}

function parseExplicitSupervibeCommand(request) {
  const text = String(request || "");
  const match = text.match(/(?:^|[\s`"'(])(?<raw>\/?supervibe(?:-[a-z0-9-]+)?)(?=$|[\s`"')])(?<args>[^\n]*)/i);
  if (!match?.groups?.raw) return null;
  const raw = match.groups.raw;
  const name = raw.startsWith("/") ? raw : `/${raw}`;
  const args = String(match.groups.args || "").trim();
  if (!raw.startsWith("/") && raw.toLowerCase() === "supervibe" && args && !args.startsWith("--")) return null;
  const commandArgs = raw.startsWith("/") || args.startsWith("--") ? args : "";
  return {
    name,
    command: commandArgs ? `${name} ${commandArgs}` : name,
  };
}

function portablePluginScriptCommand(command, args = "") {
  const raw = String(command || "").trim();
  const suffix = args ? ` ${args}` : "";
  if (raw.startsWith("node scripts/")) {
    return `${raw.replace(/^node scripts\//, "node <resolved-supervibe-plugin-root>/scripts/")}${suffix}`;
  }
  return `cd <resolved-supervibe-plugin-root> && ${raw}${suffix}`;
}

function findSemanticPackageScript(request, { projectScripts = [], pluginScripts = [] } = {}) {
  const text = normalizeText(request);
  if (!text || !PACKAGE_SCRIPT_ACTION_WORDS.some((word) => includesPhrase(text, word))) return null;

  const candidates = [];
  const seen = new Set();
  for (const script of projectScripts) {
    if (script?.name && !seen.has(script.name)) {
      seen.add(script.name);
      candidates.push({ ...script, semanticSource: "project" });
    }
  }
  for (const script of pluginScripts) {
    if (script?.name && !seen.has(script.name)) {
      seen.add(script.name);
      candidates.push({ ...script, semanticSource: "plugin" });
    }
  }

  const scored = candidates
    .map((script) => scorePackageScriptName(script, text))
    .filter(Boolean)
    .sort((a, b) => b.confidence - a.confidence || b.distinctiveMatches - a.distinctiveMatches || a.script.name.localeCompare(b.script.name));
  const best = scored[0];
  if (!best) return null;

  const { script, matchedTokens } = best;
  const projectScript = projectScripts.find((entry) => entry.name === script.name);
  const pluginScript = pluginScripts.find((entry) => entry.name === script.name);
  if (projectScript) {
    return {
      id: `project-npm-script:${script.name}`,
      intent: "project_npm_script",
      title: `Project npm script: ${script.name}`,
      command: `npm run ${script.name}`,
      confidence: best.confidence,
      reason: `semantic project npm script name match: ${matchedTokens.join(", ")}`,
      requestedCommand: `npm run ${script.name}`,
      requestedPackageManager: "npm",
      projectScriptStatus: "present",
      pluginScriptStatus: pluginScript ? "present" : "missing",
      doNotSearchProject: true,
      directRoute: false,
      semanticScriptMatch: true,
      mutationRisk: "unknown",
      nextAction: "Run this project npm script from the project root; no repository search is needed.",
    };
  }

  return {
    id: `plugin-npm-script:${script.name}`,
    intent: "plugin_npm_script",
    title: `Supervibe npm script: ${script.name}`,
    command: portablePluginScriptCommand(script.command),
    confidence: best.confidence,
    reason: `semantic Supervibe npm script name match: ${matchedTokens.join(", ")}`,
    requestedCommand: `npm run ${script.name}`,
    requestedPackageManager: "npm",
    projectScriptStatus: "missing",
    pluginScriptStatus: "present",
    doNotSearchProject: true,
    directRoute: false,
    semanticScriptMatch: true,
    mutationRisk: "unknown",
    nextAction: "Run the portable plugin-root command from the project root; do not search the repository for this script.",
  };
}

function scorePackageScriptName(script, text) {
  if (!script?.name || script.name === "prepare") return null;
  const tokens = semanticScriptTokens(script.name);
  if (tokens.length === 0) return null;
  const matchedTokens = tokens.filter((token) => tokenAliases(token).some((alias) => includesPhrase(text, alias)));
  if (matchedTokens.length !== tokens.length) return null;
  const confidence = Math.min(0.96, 0.82 + matchedTokens.length * 0.04 + (script.semanticSource === "project" ? 0.03 : 0));
  return {
    script,
    confidence: Number(confidence.toFixed(2)),
    distinctiveMatches: matchedTokens.length,
    matchedTokens,
  };
}

function semanticScriptTokens(scriptName) {
  return String(scriptName || "")
    .toLowerCase()
    .split(/[:_\-\s]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
    .filter((token) => !PACKAGE_SCRIPT_GENERIC_TOKENS.has(token));
}

function tokenAliases(token) {
  return PACKAGE_SCRIPT_TOKEN_ALIASES[token] || [token];
}

function includesPhrase(text, phrase) {
  const normalized = normalizeText(phrase);
  if (!normalized) return false;
  if (normalized.length <= 3) return new RegExp(`(^| )${escapeRegExp(normalized)}( |$)`, "u").test(text);
  return text.includes(normalized);
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}+#./:-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
