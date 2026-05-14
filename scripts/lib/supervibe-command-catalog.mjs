import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative } from "node:path";

import {
  COMMAND_AGENT_ORCHESTRATION_CONTRACT,
  COMMAND_AGENT_SELECTOR_INPUT_FIELDS,
  copyCommandAgentContract,
  getCommandAgentProfile,
} from "./command-agent-orchestration-contract.mjs";

export const SOURCE_RAG_INDEX_COMMAND = "node <resolved-supervibe-plugin-root>/scripts/build-code-index.mjs --root . --resume --source-only --max-files 200 --max-seconds 120 --health --json-progress";
export const LIST_MISSING_INDEX_COMMAND = "node <resolved-supervibe-plugin-root>/scripts/build-code-index.mjs --root . --list-missing";
export const CODEGRAPH_INDEX_COMMAND = "node <resolved-supervibe-plugin-root>/scripts/build-code-index.mjs --root . --resume --graph --max-files 200 --health";
export const MEMORY_WATCH_COMMAND = "node <resolved-supervibe-plugin-root>/scripts/watch-memory.mjs";
export { COMMAND_AGENT_ORCHESTRATION_CONTRACT } from "./command-agent-orchestration-contract.mjs";

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

const SUPERVIBE_SUBCOMMAND_ALIASES = Object.freeze({
  adapt: "/supervibe-adapt",
  adpat: "/supervibe-adapt",
  update: "/supervibe-update",
  upgrade: "/supervibe-update",
  updat: "/supervibe-update",
});

const EXACT_BARE_SUPERVIBE_COMMANDS = Object.freeze({
  adapt: "/supervibe-adapt",
});

const COMMON_SUPERVIBE_COMMAND_TYPOS = Object.freeze({
  "supervibe-adpat": "/supervibe-adapt",
  "supervibe-updat": "/supervibe-update",
});

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
    aliases: ["адаптируй проект после обновления", "adapt project artifacts after update", "обнови agents rules skills в проекте", "sync project artifacts", "обнолвление проекта", "обнолви проект"],
    keywordGroups: [["adapt", "sync", "update", "адаптируй", "синхронизируй", "обнови", "обнолви", "обнолвление"], ["artifacts", "agents", "rules", "skills", "project", "артефакты", "агенты", "правила", "скиллы", "проект"]],
  },
  {
    command: "/supervibe-audit",
    title: "Audit project health",
    directRoute: true,
    aliases: [
      "проведи аудит проекта",
      "run project audit",
      "проверь проект",
      "health check project",
      "проведи аудит агентской системы",
      "сделай аудит плагина",
      "проверь зрелость агентской системы",
      "audit agent system maturity",
      "rate agent system maturity out of 10",
      "score agent system maturity",
      "оцени систему агентов на 10 из 10",
      "насколько зрелая агентская система",
      "на сколько зрелая агентская система",
      "run plugin audit",
    ],
    keywordGroups: [
      ["audit", "check", "review", "rate", "score", "assess", "проверь", "проведи", "сделай", "оцени", "насколько", "на сколько", "аудит"],
      ["project", "health", "agent system", "agents", "maturity", "out of 10", "10 из 10", "качество", "проект", "здоровье", "агент", "агенты", "агентов", "агентской системы", "зрелость", "зрелая"],
      ["intent", "routing", "router", "receipt", "receipts", "skills", "semantic", "rag", "codegraph", "coverage", "emulation", "invoked", "really invoked", "интент", "роут", "маршрут", "рецепт", "скил", "семантичес", "покрытие", "вызываются", "эмулируются"],
    ],
  },
  {
    id: "verification-policy-audit",
    intent: "supervibe_audit",
    title: "Audit verification policy",
    command: "/supervibe-audit",
    description: "Route questions about whether npm run check, full suites, or release-gate tests should be deferred to the workflow audit path instead of executing the script.",
    agentContract: copyCommandAgentContract(),
    agentProfile: getCommandAgentProfile("/supervibe-audit"),
    aliases: [
      "audit whether npm run check should be reserved for release gate",
      "review whether npm run check should only run at the final gate",
      "why is npm run check running before the release gate",
    ],
    keywordGroups: [
      ["audit", "review", "check", "whether", "why", "policy"],
      ["npm run check", "full suite", "tests", "verification", "release gate", "final gate"],
      ["reserved", "defer", "deferred", "only", "final", "release"],
    ],
    requiredGroupIndexes: [0, 1],
    mutationRisk: "none",
    directRoute: true,
    commandId: "/supervibe-audit",
    nextAction: "Run /supervibe-audit to inspect verification policy; do not execute npm run check from a meta/audit question.",
  },
  {
    command: "/supervibe-brainstorm",
    title: "Brainstorm and capture a spec",
    aliases: ["брейншторм", "давай брейншторм", "start brainstorm", "brainstorm", "new feature", "давай новую фичу", "сделай брейншторм идеи", "brainstorm the feature", "обсудим идею", "придумай решение"],
    keywordGroups: [["brainstorm", "ideate", "explore", "брейншторм", "обсудим", "придумай"], ["feature", "idea", "solution", "\u0438\u0434\u0435\u0438", "идея", "решение", "фича"]],
  },
  {
    command: "/supervibe-design",
    title: "Run the design pipeline",
    aliases: [
      "сделай дизайн макет ui",
      "build a ui prototype",
      "сделай прототип",
      "нужен дизайн интерфейса",
      "landing page design",
      "сделай 5 креативных и разных вариантов с фидбек оверлей",
      "make 5 creative and different variants with feedback overlay",
      "изучи старые прототипы и сделай 5 креативных вариантов",
    ],
    keywordGroups: [
      ["design", "prototype", "mockup", "ui", "ux", "landing", "design variant", "creative variant", "creative variants", "feedback overlay", "old prototypes", "chat screen", "agentic app", "дизайн", "макет", "прототип", "интерфейс", "вариант дизайна", "креатив", "креативные варианты", "фидбек оверлей", "старые прототипы", "экран чата", "агентское приложение"],
      ["build", "make", "create", "redesign", "explore", "сделай", "создай", "нужен", "изучи", "используй", "проработай", "подготовь"],
    ],
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
    intent: "genesis_setup",
    aliases: [
      "инициализируй supervibe",
      "setup supervibe project",
      "подключи supervibe к проекту",
      "bootstrap supervibe",
      "создай scaffold supervibe",
      "сделай genesis scaffold под next laravel postgres",
      "genesis под laravel next postgres",
    ],
    keywordGroups: [
      ["genesis", "setup", "bootstrap", "scaffold", "init", "initialize", "install", "создай", "сделай", "инициализируй", "подключи", "разверни"],
      ["supervibe", "project", "stack", "next", "nextjs", "laravel", "postgres", "postgresql", "react", "vite", "tailwind", "проект", "стек", "под"],
    ],
  },
  {
    command: "/supervibe-loop",
    title: "Run autonomous loop or work-item control",
    priorityPhrases: ["worktree", "sessions", "plan"],
    aliases: ["запусти автономный loop", "run autonomous loop", "запусти эпик в worktree", "run 10 sessions on the plan"],
    keywordGroups: [["loop", "autonomous", "epic", "worktree", "sessions", "автоном", "эпик", "сессии"], ["run", "start", "запусти", "запуск"]],
  },
  {
    command: "/supervibe-plan",
    title: "Write or review an implementation plan",
    aliases: ["план", "сделай план", "make a plan", "create plan and then tasks", "составь план для новой фичи", "напиши план реализации", "create implementation plan", "составь план", "составь детальный план реализации", "review the plan"],
    keywordGroups: [["plan", "planning", "план", "спланируй", "составь"], ["implementation", "реализация", "реализации", "review", "ревью"]],
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
    command: "/supervibe-verify",
    title: "Verify implementation against goals",
    aliases: ["verify goals", "verify implementation goals", "verify the completed goals with tester evidence", "prove goals are done"],
    keywordGroups: [["verify", "validate", "prove", "check"], ["goal", "goals", "evidence", "tester", "acceptance"]],
  },
  {
    command: "/supervibe-review",
    title: "Review production readiness after verification",
    aliases: ["review production readiness", "review production readiness after verify evidence", "final review after verify", "review the verified diff"],
    keywordGroups: [["review", "code review", "final review"], ["production", "readiness", "verify evidence", "verified", "diff", "release"]],
  },
  {
    command: "/supervibe-ship",
    title: "Ship target-aware release readiness",
    aliases: ["ship release", "ship the release", "ship the release with target-aware release readiness", "prepare release shipment"],
    keywordGroups: [["ship", "release", "deploy", "publish"], ["readiness", "release", "target", "docker", "rollback"]],
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
    aliases: ["обнови плагин", "update the plugin", "обнови supervibe", "pull latest supervibe", "обнолви плагин", "обнолви supervibe"],
    keywordGroups: [["update", "upgrade", "pull", "latest", "обнови", "обнолви", "апдейт"], ["plugin", "supervibe", "плагин"]],
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
    id: "task-graph-maturity",
    intent: "task_graph_maturity",
    title: "Check task graph maturity",
    command: "npm run supervibe:task-graph-maturity",
    description: "Score task graph integration across routing, loop actions, UI controls, sync, validators, tests, and graph fixtures.",
    aliases: [
      "task graph maturity",
      "check task graph maturity",
      "проверь task graph maturity",
      "проверь зрелость task graph",
      "оцени task graph на 10 из 10",
    ],
    keywordGroups: [
      ["task graph", "work graph", "work-item graph"],
      ["maturity", "10 из 10", "зрелость"],
    ],
    mutationRisk: "none",
    directRoute: false,
    nextAction: "Run npm run supervibe:task-graph-maturity for task-graph-specific readiness; use --require-active-graph only when the current project must already have an active graph.",
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
    id: "plan-then-execute-natural-language",
    intent: "plan_then_execute",
    title: "Write a detailed plan before atomization and execution",
    command: "/supervibe-plan",
    description: "Route requests that ask for a detailed plan and then execution through the full plan -> review -> atomize -> execute chain instead of the review-only gate.",
    agentContract: copyCommandAgentContract(),
    agentProfile: getCommandAgentProfile("/supervibe-plan"),
    aliases: [
      "write a detailed plan then start work",
      "create a plan then execute it",
      "make 40 tasks in a plan and start execution",
      "Давай все 40+ задач в детальный план, после этого начни работу по плану",
      "Составь детальный план и потом начни выполнение по плану",
    ],
    keywordGroups: [
      ["plan", "detailed plan", "implementation plan", "план", "детальный план"],
      ["task", "tasks", "work items", "задач", "задачи", "подзадач", "эпик"],
      ["execute", "start work", "start execution", "begin work", "начни работу", "начать работу", "выполнение", "выполнены", "выполни"],
    ],
    requiredGroupIndexes: [0, 1, 2],
    followUpCommands: [
      "/supervibe-plan --review <plan-path>",
      "/supervibe-loop --atomize-plan <plan-path> --plan-review-passed",
      "/supervibe-execute-plan <reviewed-plan-path>",
    ],
    mutationRisk: "delegates-to-slash-command",
    directRoute: true,
    commandId: "/supervibe-plan",
    nextAction: "Run /supervibe-plan first; after the durable plan passes review, atomize it into a work-item graph before execution.",
  },
  {
    id: "design-flow-broken-audit",
    intent: "supervibe_audit",
    title: "Audit broken Supervibe design workflow execution",
    command: "/supervibe-audit",
    description: "Route broken /supervibe-design, skipped specialist, inline-emulation, subagent, and missing design receipt complaints to audit before plan review or agent provisioning.",
    agentContract: copyCommandAgentContract(),
    agentProfile: getCommandAgentProfile("/supervibe-audit"),
    aliases: [
      "audit broken design flow",
      "audit why design workflow is broken",
      "design flow is broken and agents were skipped",
      "Проведи аудит почему дизайн флоу сломан",
    ],
    keywordGroups: [
      ["audit", "check", "review", "investigate", "why", "проверь", "проведи", "аудит", "почему", "разбери"],
      ["design flow", "design workflow", "/supervibe-design", "design command", "дизайн флоу", "дизайн flow", "дизайн команда", "дизайн"],
      ["broken", "broke", "skipped", "missing", "not used", "subagent", "inline", "emulated", "receipt", "runtime", "сломан", "сломано", "снова сломан", "не использовались", "проскоч", "субагент", "инлайн", "рецепт"],
      ["creative-director", "prototype-builder", "ux-ui-designer", "ui-polish-reviewer", "accessibility-reviewer", "quality-gate-reviewer", "copywriter", "designer", "designers"],
    ],
    requiredGroupIndexes: [0, 1, 2],
    priorityPhrases: [
      "design flow is broken",
      "broken design workflow",
      "дизайн флоу снова сломан",
      "не использовались prototype-builder",
    ],
    mutationRisk: "none",
    directRoute: true,
    commandId: "/supervibe-audit",
    nextQuestionEn: "Step 1/1: run a read-only audit of the design workflow, specialist receipts, and routing?",
    nextQuestionRu: "Шаг 1/1: провести read-only аудит дизайн-флоу, specialist receipts и routing?",
    nextAction: "Run /supervibe-audit as a read-only design workflow audit; do not route to plan review or agent provisioning until scoped design runtime evidence is inspected.",
  },
  {
    id: "existing-plan-artifact-revision",
    intent: "supervibe_plan",
    title: "Revise or adapt an existing plan or spec artifact",
    command: "/supervibe-plan",
    description: "Route existing plan/spec artifact check, adaptation, scaling, and revision requests to planning instead of audit or plan-review.",
    agentContract: copyCommandAgentContract(),
    agentProfile: getCommandAgentProfile("/supervibe-plan"),
    aliases: [
      "check the existing plan artifact",
      "adapt the existing plan artifact",
      "revise the existing spec artifact",
      "scale the current implementation plan",
      "revise the existing plan text",
    ],
    keywordGroups: [
      ["existing", "current", "active", "artifact", "text", "path", "\u0442\u0435\u043a\u0443\u0449\u0438\u0439", "\u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044e\u0449\u0438\u0439", "\u0430\u0440\u0442\u0435\u0444\u0430\u043a\u0442", "\u0442\u0435\u043a\u0441\u0442"],
      ["plan", "spec", "implementation plan", "\u043f\u043b\u0430\u043d", "\u0441\u043f\u0435\u043a", "\u0441\u043f\u0435\u0446\u0438\u0444\u0438\u043a\u0430\u0446\u0438\u044f"],
      ["check", "adapt", "scale", "revise", "update", "adjust", "refine", "\u043f\u0440\u043e\u0432\u0435\u0440\u044c", "\u0430\u0434\u0430\u043f\u0442\u0438\u0440\u0443\u0439", "\u043c\u0430\u0441\u0448\u0442\u0430\u0431\u0438\u0440\u0443\u0439", "\u043f\u0435\u0440\u0435\u0441\u043c\u043e\u0442\u0440\u0438", "\u043e\u0431\u043d\u043e\u0432\u0438", "\u0434\u043e\u0440\u0430\u0431\u043e\u0442\u0430\u0439"],
    ],
    requiredGroupIndexes: [0, 1, 2],
    priorityPhrases: ["existing plan", "existing spec", "current implementation plan", "plan artifact", "spec artifact", "plan text"],
    mutationRisk: "delegates-to-slash-command",
    directRoute: false,
    commandId: "/supervibe-plan",
    nextAction: "Run /supervibe-plan against the referenced plan or spec artifact; use --review only when the user explicitly asks for the plan-review loop.",
  },
  {
    id: "plan-review-natural-language",
    intent: "plan_review",
    title: "Run mandatory specialist review for an implementation plan",
    command: "/supervibe-plan --review",
    description: "Route plan review, review-loop, and specialist-agent review requests to the mandatory plan review gate before atomization or execution.",
    agentContract: copyCommandAgentContract(),
    agentProfile: getCommandAgentProfile("/supervibe-plan"),
    aliases: [
      "review plan with specialist agents",
      "run plan review with specialist agents",
      "run review loop for the plan",
      "start plan review loop",
      "plan is ready, review it",
      "запусти ревью плана спец агентами",
      "запусти review loop по плану",
      "сделай ревью плана спец агентами",
      "запусти ревью луп по плану",
      "проверь план спец агентами",
      "сделал план, проверь его",
      "после плана сделай ревью луп",
    ],
    keywordGroups: [
      ["review", "review loop", "ревью", "ревью луп", "проверь", "проверить", "аудит плана"],
      ["plan", "implementation plan", "план", "плана", "плану"],
      ["specialist agents", "specialist", "agents", "reviewer", "reviewers", "loop", "спец агент", "спец агентами", "агентами", "ревью луп"],
    ],
    requiredGroupIndexes: [0, 1, 2],
    mutationRisk: "delegates-to-slash-command",
    directRoute: true,
    commandId: "/supervibe-plan",
    commandArgs: "--review",
    nextAction: "Run /supervibe-plan --review in the active AI CLI against the plan artifact; do not execute or atomize until the plan-review gate passes.",
  },
  {
    id: "workflow-chain-audit",
    intent: "workflow_chain_audit",
    title: "Audit end-to-end Supervibe workflow maturity",
    command: "/supervibe-audit --workflow-chain",
    description: "Route maturity, 10/10, and pitfall-review requests for brainstorm, plan, execute-plan, and loop as one read-only workflow audit.",
    aliases: [
      "rate the brainstorm plan execute loop maturity out of 10",
      "audit brainstorm plan execute loop maturity",
      "audit supervibe workflow chain maturity",
      "проверь насколько прокачана цепочка brainstorm plan execute loop",
      "оцени цепочку brainstorm plan execute loop на 10 из 10",
    ],
    keywordGroups: [
      ["audit", "check", "review", "rate", "score", "maturity", "10 out of 10", "out of 10", "проверь", "оцени", "насколько", "на сколько", "прокач", "зрел"],
      ["brainstorm", "plan", "execute", "execute-plan", "loop", "/supervibe-brainstorm", "/supervibe-plan", "/supervibe-execute-plan", "/supervibe-loop", "цепочка", "workflow", "chain"],
    ],
    requiredGroupIndexes: [0, 1],
    agentContract: copyCommandAgentContract(),
    agentProfile: getCommandAgentProfile("/supervibe-audit"),
    mutationRisk: "none",
    directRoute: true,
    nextAction: "Run /supervibe-audit --workflow-chain as a read-only end-to-end maturity audit before proposing strengthen/adapt work.",
  },
  {
    id: "documentation-summary-gate",
    intent: "documentation_summary_gate",
    title: "Show summary before writing durable documentation",
    command: "/supervibe-brainstorm --summary-gate",
    description: "Route requests that want a summary and user decision before documentation is created.",
    aliases: [
      "show summary before creating documentation",
      "summary before docs",
      "summarize before writing docs",
      "покажи саммари перед созданием документации",
    ],
    keywordGroups: [
      ["summary", "summarize", "саммари", "сводка"],
      ["docs", "documentation", "spec", "документац", "доку"],
      ["before", "approval", "decide", "create", "write", "перед", "до", "соглас", "создан"],
    ],
    requiredGroupIndexes: [0, 1, 2],
    agentContract: copyCommandAgentContract(),
    agentProfile: getCommandAgentProfile("/supervibe-brainstorm"),
    mutationRisk: "delegates-to-slash-command",
    directRoute: true,
    commandId: "/supervibe-brainstorm",
    commandArgs: "--summary-gate",
    nextAction: "Run /supervibe-brainstorm --summary-gate to show the summary and wait for documentation approval before any durable spec write.",
  },
  {
    id: "docs-audit",
    intent: "docs_audit",
    title: "Audit internal docs and project-memory cleanup candidates",
    command: "/supervibe-audit --docs",
    description: "Route documentation, internal file, stale docs, and project-memory audit requests to the docs audit mode.",
    agentContract: copyCommandAgentContract(),
    agentProfile: getCommandAgentProfile("/supervibe-audit"),
    aliases: [
      "audit internal application docs",
      "audit internal docs and project memory",
      "review stale docs and internal files",
      "check docs folder garbage",
    ],
    keywordGroups: [
      ["audit", "check", "review", "remove", "cleanup", "what can we remove", "проверь", "аудит", "удалить", "очист"],
      ["docs", "documentation", "readme", "internal files", "доки", "документация", "ридми", "внутренние файлы"],
      ["stale", "old", "todo", "garbage", "internal", "private", "cleanup", "мусор", "старые", "туду", "внутрен"],
    ],
    requiredGroupIndexes: [0, 1],
    mutationRisk: "none",
    directRoute: true,
    nextAction: "Run /supervibe-audit --docs as a read-only documentation and project-memory audit before proposing removals.",
  },
  {
    id: "agent-provisioning",
    intent: "agent_provisioning",
    title: "Provision Supervibe agents and skills into the active host",
    command: "node <resolved-supervibe-plugin-root>/scripts/supervibe-adapt.mjs --add-agents <ids> --skills <ids>",
    description: "Dry-run or apply missing agent/skill installation through Adapt, using split profiles/add-ons when the user wants agent coverage changes.",
    aliases: [
      "add missing agents",
      "install missing agents",
      "provision agents",
      "connect real agents",
      "fix agents for every provider",
      "repair mandatory agents",
      "make agents mandatory",
      "connect host callable agents",
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
      ["add", "install", "provision", "connect", "copy", "sync", "invoke", "invoked", "fix", "repair", "make", "добавь", "установи", "подключи", "подключены", "скопируй", "синхронизируй", "вызываются", "почини", "исправь", "пофикси", "сделай"],
      ["emulated", "real", "missing", "unavailable", "mandatory", "required", "provider", "providers", "host callable", "callable", "every provider", "for each provider", "эмулируются", "настоящих", "не хватает", "недостающ", "недостающих", "недоступны", "отсутствуют", "обязательн", "обязательными", "провайдера", "провайдер"],
      ["agent", "agents", "skill", "skills", "агент", "агенты", "агентов", "скил", "скилы", "скиллы", "skills"],
    ],
    requiredGroupIndexes: [0, 1, 2],
    priorityPhrases: ["every provider", "for each provider", "mandatory agents", "host callable", "обязательн", "провайдер"],
    mutationRisk: "unknown",
    directRoute: true,
      nextAction: "Run the Adapt agent-provisioning dry-run first. Apply only after confirming the host, agents, skills, and managed instruction refresh.",
  },
  {
    id: "design-pipeline-synonyms",
    intent: "design_new",
    title: "Route design-system, styleboard, and prototype requests",
    command: "/supervibe-design",
    description: "Route English/Russian design system, styleboard, UI mockup, and prototype phrasing to the design workflow.",
    agentContract: copyCommandAgentContract(),
    agentProfile: getCommandAgentProfile("/supervibe-design"),
    aliases: [
      "create a design system",
      "build a new design system",
      "make a styleboard",
      "design system from old prototypes",
      "make the interface design",
      "make five creative variants with feedback overlay",
      "study old prototypes and create five different prototype variants",
      "создай новую дизайн систему",
      "сделай дизайн систему",
      "сделай стайлборд",
      "сделай прототип",
      "сделай макет ui",
      "дизайн система из старых прототипов",
      "сделай 5 креативных и разных вариантов с фидбек оверлей",
      "изучи старые прототипы и сделай 5 разных вариантов прототипа",
    ],
    keywordGroups: [
      ["design system", "styleboard", "brandbook", "tokens", "prototype", "creative variant", "creative variants", "feedback overlay", "old prototypes", "chat screen", "дизайн система", "дизайн-система", "стайлборд", "токены", "прототип", "креативные варианты", "фидбек оверлей", "старые прототипы", "экран чата"],
      ["create", "build", "make", "redesign", "improve", "explore", "from old", "сделай", "создай", "построй", "переработай", "улучши", "изучи", "используй", "старых", "старые"],
    ],
    mutationRisk: "delegates-to-slash-command",
    directRoute: true,
    nextAction: "Run /supervibe-design in the active AI CLI; first run command-agent-plan.mjs for /supervibe-design, then invoke required host agents before durable work and receipts.",
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
  const explicitSlash = parseExplicitSupervibeSlashCommand(request);
  if (explicitSlash && !shouldPreserveWorkflowChainAuditRoute(request)) {
    return resolveSlashCommandMatch(explicitSlash, slashCommands, {
      reasonPrefix: "explicit Supervibe slash command",
    });
  }
  const workflowChainAudit = findWorkflowChainAuditShortcut(request, { shortcuts });
  if (workflowChainAudit) {
    const slashCommand = slashCommands.find((entry) => entry.id === "/supervibe-audit");
    if (!slashCommand) {
      return {
        id: "missing-slash-command:supervibe-audit",
        intent: "missing_slash_command",
        title: "Slash command /supervibe-audit",
        command: null,
        commandId: "/supervibe-audit",
        commandArgs: "--workflow-chain",
        commandContext: String(request || "").trim(),
        confidence: 1,
        reason: "workflow-chain audit was requested, but /supervibe-audit is not published",
        requestedCommand: "/supervibe-audit --workflow-chain",
        slashCommandStatus: "missing",
        doNotSearchProject: true,
        hardStop: true,
        agentContract: copyCommandAgentContract(),
        agentProfile: getCommandAgentProfile("/supervibe-audit"),
        directRoute: false,
        mutationRisk: "none",
        nextAction: "Hard stop: report the missing slash command from the catalog and do not inspect source files, marketplace command files, or repository paths to emulate it.",
      };
    }
    return {
      ...workflowChainAudit,
      commandId: "/supervibe-audit",
      commandArgs: "--workflow-chain",
      commandContext: String(request || "").trim(),
      requestedCommand: "/supervibe-audit --workflow-chain",
      slashCommandStatus: "present",
      agentProfile: getCommandAgentProfile("/supervibe-audit"),
    };
  }
  if (explicitSlash) {
    return resolveSlashCommandMatch(explicitSlash, slashCommands, {
      reasonPrefix: "explicit Supervibe slash command",
    });
  }

  const terminalSupervibeCommand = parseTerminalSupervibeCommand(request);
  if (terminalSupervibeCommand) {
    return resolveSlashCommandMatch(terminalSupervibeCommand, slashCommands, {
      reasonPrefix: "terminal-style Supervibe command",
      confidence: terminalSupervibeCommand.confidence || 1,
    });
  }

  const explicitCandidate = parseExplicitNpmRun(request)
    || parseBareNpmScriptReference(request, [
      ...projectScripts.map((script) => script.name),
      ...pluginScripts.map((script) => script.name),
      ...Object.keys(KNOWN_NPM_SCRIPT_SHORTCUTS),
    ]);
  const explicit = explicitCandidate && !looksLikePackageScriptMetaQuestion(request, explicitCandidate)
    ? explicitCandidate
    : null;

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
    agentContract: copyCommandAgentContract(),
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
    `AGENT_OWNER: ${catalog.agentContract?.ownerAgentId || COMMAND_AGENT_ORCHESTRATION_CONTRACT.ownerAgentId}`,
    `AGENT_EXECUTION_MODES: ${(catalog.agentContract?.executionModes || COMMAND_AGENT_ORCHESTRATION_CONTRACT.executionModes).join(", ")}`,
    `AGENT_BLOCKED_MODE: ${catalog.agentContract?.blockedMode || COMMAND_AGENT_ORCHESTRATION_CONTRACT.blockedMode}`,
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
    match.commandId ? `COMMAND_ID: ${match.commandId}` : null,
    match.commandArgs ? `COMMAND_ARGS: ${match.commandArgs}` : null,
    match.commandContext ? `COMMAND_CONTEXT: ${match.commandContext}` : null,
    match.requestedPackageManager ? `PACKAGE_MANAGER: ${match.requestedPackageManager}` : null,
    match.slashCommandStatus ? `SLASH_COMMAND: ${match.slashCommandStatus}` : null,
    match.projectScriptStatus ? `PROJECT_SCRIPT: ${match.projectScriptStatus}` : null,
    match.pluginScriptStatus ? `PLUGIN_SCRIPT: ${match.pluginScriptStatus}` : null,
    match.hardStop ? `HARD_STOP: true` : null,
    `DO_NOT_SEARCH_PROJECT: ${match.doNotSearchProject === true}`,
    `COMMAND: ${match.command || "none"}`,
    match.agentContract ? `OWNER_AGENT: ${match.agentContract.ownerAgentId}` : null,
    match.agentContract ? `AGENT_EXECUTION_MODES: ${match.agentContract.executionModes.join(", ")}` : null,
    match.agentContract ? `AGENT_BLOCKED_MODE: ${match.agentContract.blockedMode}` : null,
    match.agentContract ? `AGENT_PROOF: ${match.agentContract.requiredReceiptFields.join(", ")}` : null,
    match.agentProfile ? `REQUIRED_AGENTS: ${match.agentProfile.requiredAgentIds.join(", ")}` : null,
    match.agentProfile ? `DYNAMIC_SELECTORS: ${(match.agentProfile.dynamicAgentSelectors || []).join(", ") || "none"}` : null,
    match.agentProfile ? `SELECTOR_INPUT_FIELDS: ${(match.agentProfile.selectorInputFields || COMMAND_AGENT_SELECTOR_INPUT_FIELDS).join(", ")}` : null,
    match.agentProfile ? `AGENT_PLAN_COMMAND: node <resolved-supervibe-plugin-root>/scripts/command-agent-plan.mjs --command ${match.agentProfile.commandId}` : null,
    match.agentContract ? `AGENT_EMULATION: ${match.agentContract.emulationPolicy}` : null,
    ...(match.followUpCommands?.length ? ["FOLLOW_UP_COMMANDS:", ...match.followUpCommands.map((command) => `- ${command}`)] : []),
    match.diagnostics?.selectedBecause ? `SELECTED_BECAUSE: ${match.diagnostics.selectedBecause}` : null,
    ...(match.diagnostics?.closeCandidates?.length
      ? match.diagnostics.closeCandidates.map((candidate) => `CLOSE_CANDIDATE: ${candidate.id} intent=${candidate.intent} confidence=${candidate.confidence} reason=${candidate.reason}`)
      : []),
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
    priorityPhrases: profile.priorityPhrases || [],
    agentContract: copyCommandAgentContract(),
    agentProfile: getCommandAgentProfile(profile.command),
    selectorInputFields: COMMAND_AGENT_SELECTOR_INPUT_FIELDS,
    mutationRisk: "delegates-to-slash-command",
    directRoute,
    requiredGroupIndexes: profile.requiredGroupIndexes || [0, 1],
    nextAction: `Run ${profile.command} in the active AI CLI; first run command-agent-plan.mjs for ${profile.command}, then invoke required host agents before durable work and receipts.`,
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

  if (shortcut.exactAliasOnly) return null;

  if (shortcut.id === "agent-provisioning" && looksLikeReadOnlyAgentAudit(text) && !looksLikeProvisioningMutation(text)) {
    return null;
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
  const priorityBoost = (shortcut.priorityPhrases || []).filter((phrase) => includesPhrase(text, phrase)).length * 0.03;
  const confidence = Math.min(0.97, 0.78 + matchedGroups.length * 0.06 + priorityBoost);
  return enrichMatch(copyShortcut(shortcut), {
    confidence: Number(confidence.toFixed(2)),
    reason: `shortcut keyword groups: ${matchedGroups.join(", ")}`,
    matchedGroups,
  });
}

function looksLikeReadOnlyAgentAudit(text) {
  return [
    "audit",
    "check",
    "review",
    "verify",
    "prove",
    "whether",
    "really",
    "receipt",
    "receipts",
    "semantic",
    "rag",
    "codegraph",
    "maturity",
    "проверь",
    "оцени",
    "докажи",
    "реально",
    "рецепт",
  ].some((phrase) => includesPhrase(text, phrase));
}

function looksLikeProvisioningMutation(text) {
  return [
    "add",
    "install",
    "provision",
    "connect",
    "copy",
    "sync",
    "fix",
    "repair",
    "make",
    "добавь",
    "установи",
    "подключи",
    "скопируй",
    "синхронизируй",
    "почини",
    "исправь",
    "сделай",
  ].some((phrase) => includesPhrase(text, phrase));
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
        agentContract: copyCommandAgentContract(),
        agentProfile: getCommandAgentProfile(`/${basename(file, ".md")}`),
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
    selectorInputFields: [...(shortcut.selectorInputFields || COMMAND_AGENT_SELECTOR_INPUT_FIELDS)],
    agentContract: shortcut.agentContract ? copyCommandAgentContract(shortcut.agentContract) : undefined,
    agentProfile: shortcut.agentProfile ? copyAgentProfile(shortcut.agentProfile) : undefined,
  };
}

function enrichMatch(shortcut, fields = {}) {
  return {
    ...shortcut,
    doNotSearchProject: true,
    ...fields,
  };
}

function findWorkflowChainAuditShortcut(request, { shortcuts = COMMAND_SHORTCUTS } = {}) {
  const text = normalizeText(request);
  if (!text) return null;
  if (looksLikeSlashCommandEvidenceText(text) && !looksLikeExplicitWorkflowChainAudit(text)) return null;
  const chainShortcut = shortcuts.find((shortcut) => shortcut.id === "workflow-chain-audit");
  if (!chainShortcut) return null;

  const explicitWorkflowCommands = [
    "/supervibe-brainstorm",
    "/supervibe-plan",
    "/supervibe-execute-plan",
    "/supervibe-loop",
  ].filter((command) => includesPhrase(text, command));
  const namedWorkflowTerms = [
    "brainstorm",
    "plan",
    "plan review",
    "plan-review",
    "review loop",
    "review-loop",
    "execute",
    "execute plan",
    "execute-plan",
    "loop",
    "workflow chain",
    "цепочка",
  ].filter((term) => includesPhrase(text, term));
  const hasPlanReviewLoop = ["plan review", "plan-review", "review loop", "review-loop"].some((term) => includesPhrase(text, term));
  const hasPlanReviewLoopAuditSignal = [
    "audit",
    "rate",
    "score",
    "maturity",
    "readiness",
    "10",
    "10/10",
    "10 out of 10",
    "out of 10",
    "best practices",
    "pitfall",
    "feature bloat",
    "\u0430\u0443\u0434\u0438\u0442",
    "\u043e\u0446\u0435\u043d\u0438",
    "\u043d\u0430\u0441\u043a\u043e\u043b\u044c\u043a\u043e",
    "\u043f\u0440\u043e\u043a\u0430\u0447",
    "\u0437\u0440\u0435\u043b",
    "\u0433\u043e\u0442\u043e\u0432",
  ].some((term) => includesPhrase(text, term));
  const hasStrongAuditOrMaturity = [
    "audit",
    "check",
    "rate",
    "score",
    "maturity",
    "readiness",
    "10 out of 10",
    "10/10",
    "out of 10",
    "best practices",
    "pitfall",
    "feature bloat",
    "аудит",
    "проверь",
    "оцени",
    "насколько",
    "на сколько",
    "прокач",
    "зрел",
    "10 из 10",
    "подводные камни",
    "переизбыток фич",
  ].some((term) => includesPhrase(text, term)) || hasPlanReviewLoopAuditSignal;
  const hasAuditOrMaturity = hasStrongAuditOrMaturity
    || (explicitWorkflowCommands.length >= 2 && includesPhrase(text, "review"));
  const hasWorkflowChain = explicitWorkflowCommands.length >= 2
    || (namedWorkflowTerms.length >= 3 && hasStrongAuditOrMaturity)
    || (hasPlanReviewLoop && hasPlanReviewLoopAuditSignal);
  if (!hasWorkflowChain || !hasAuditOrMaturity) return null;

  return enrichMatch(copyShortcut(chainShortcut), {
    confidence: explicitWorkflowCommands.length >= 2 ? 0.98 : 0.94,
    reason: explicitWorkflowCommands.length >= 2
      ? `workflow-chain audit phrase with commands: ${explicitWorkflowCommands.join(", ")}`
      : `workflow-chain audit phrase with terms: ${namedWorkflowTerms.join(", ")}`,
    matchedGroups: [hasAuditOrMaturity ? "audit-or-maturity" : "", hasWorkflowChain ? "workflow-chain" : ""].filter(Boolean),
  });
}
function looksLikeSlashCommandEvidenceText(text) {
  return ["/supervibe-brainstorm", "/supervibe-plan", "/supervibe-execute-plan", "/supervibe-loop"].some((command) => includesPhrase(text, command)) && [
    "example",
    "examples",
    "prompt",
    "spec",
    "plan text",
    "review text",
    "mentions",
    "lists",
    "inside",
    "do not run",
    "don't run",
    "dont run",
    "not run",
    "evidence",
    "\u043f\u0440\u0438\u043c\u0435\u0440",
    "\u043f\u0440\u0438\u043c\u0435\u0440\u044b",
    "\u043f\u0440\u043e\u043c\u043f\u0442",
    "\u0441\u043f\u0435\u043a",
    "\u0441\u043f\u0435\u0446\u0438\u0444\u0438\u043a\u0430\u0446\u0438\u044f",
    "\u0442\u0435\u043a\u0441\u0442 \u043f\u043b\u0430\u043d\u0430",
    "\u0443\u043f\u043e\u043c\u0438\u043d\u0430\u0435\u0442",
    "\u043f\u0435\u0440\u0435\u0447\u0438\u0441\u043b\u044f\u0435\u0442",
    "\u043d\u0435 \u0437\u0430\u043f\u0443\u0441\u043a\u0430\u0439",
    "\u043d\u0435 \u0437\u0430\u043f\u0443\u0441\u043a\u0430\u0442\u044c",
  ].some((phrase) => includesPhrase(text, phrase));
}

function looksLikeExplicitWorkflowChainAudit(text) {
  return [
    "audit workflow chain",
    "workflow chain audit",
    "audit brainstorm plan execute loop",
    "maturity",
    "10/10",
    "10 out of 10",
    "out of 10",
    "\u0430\u0443\u0434\u0438\u0442 \u0446\u0435\u043f\u043e\u0447\u043a\u0438",
    "\u0437\u0440\u0435\u043b\u043e\u0441\u0442\u044c",
    "10 \u0438\u0437 10",
  ].some((phrase) => includesPhrase(text, phrase));
}

function copyAgentProfile(profile) {
  return {
    ...profile,
    requiredAgentIds: [...(profile.requiredAgentIds || [])],
    dynamicAgentSelectors: [...(profile.dynamicAgentSelectors || [])],
    selectorInputFields: [...(profile.selectorInputFields || COMMAND_AGENT_SELECTOR_INPUT_FIELDS)],
    executionModes: [...(profile.executionModes || [])],
    requiredPlanFields: [...(profile.requiredPlanFields || [])],
    requiredReceiptFields: [...(profile.requiredReceiptFields || [])],
  };
}

function parseExplicitNpmRun(request) {
  const text = String(request || "");
  const runMatch = text.match(/(?:^|[\s`"'(])(?<command>(?<manager>npm|pnpm|bun)\s+(?:run|run-script)\s+(?<script>[@\w:.-]+))(?<tail>(?:\s+--\s+[^\n`"']+)?)?/i);
  if (runMatch?.groups?.script && !isNegatedCommandMention(text, runMatch.index)) {
    return parsedPackageScript(runMatch.groups);
  }

  const yarnMatch = text.match(/(?:^|[\s`"'(])(?<command>(?<manager>yarn)\s+(?:run\s+)?(?<script>[@\w:.-]+))(?<tail>(?:\s+--\s+[^\n`"']+)?)?/i);
  if (yarnMatch?.groups?.script && !["add", "install", "remove", "upgrade"].includes(cleanPackageScriptToken(yarnMatch.groups.script)) && !isNegatedCommandMention(text, yarnMatch.index)) {
    return parsedPackageScript(yarnMatch.groups);
  }

  const npmShortcut = text.match(/(?:^|[\s`"'(])(?<command>(?<manager>npm)\s+(?<script>test|start|stop|restart))(?<tail>(?:\s+--\s+[^\n`"']+)?)?/i);
  if (npmShortcut?.groups?.script && !isNegatedCommandMention(text, npmShortcut.index)) {
    return parsedPackageScript(npmShortcut.groups);
  }

  return null;
}

function parsedPackageScript(groups) {
  const args = String(groups.tail || "").match(/\s+--\s+(.+)$/)?.[1]?.trim() || "";
  const script = cleanPackageScriptToken(groups.script);
  const commandText = String(groups.command || "");
  const command = args
    ? `${commandText.replace(new RegExp(`${escapeRegExp(groups.script)}$`), script)} -- ${args}`
    : commandText.replace(new RegExp(`${escapeRegExp(groups.script)}$`), script);
  return {
    command: command.trim(),
    script,
    packageManager: groups.manager,
    args,
  };
}

function cleanPackageScriptToken(value) {
  return String(value || "").replace(/[.,;:!?]+$/u, "");
}

function isNegatedCommandMention(text, matchIndex = -1) {
  const prefix = normalizeText(String(text || "").slice(0, Math.max(0, matchIndex)));
  return [
    "do not",
    "dont",
    "don't",
    "never",
    "no need to",
    "without",
    "не",
    "не запускай",
    "не запускать",
    "не надо",
  ].some((phrase) => includesPhrase(prefix, phrase));
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

function resolveSlashCommandMatch(explicitSlash, slashCommands, { reasonPrefix = "explicit Supervibe slash command", confidence = 1 } = {}) {
  const slashCommand = slashCommands.find((entry) => entry.id === explicitSlash.name);
  return {
    id: slashCommand ? `slash-command:${explicitSlash.name.slice(1)}` : `missing-slash-command:${explicitSlash.name.slice(1)}`,
    intent: slashCommand ? "slash_command" : "missing_slash_command",
    title: slashCommand?.description || `Slash command ${explicitSlash.name}`,
    command: slashCommand ? explicitSlash.command : null,
    commandId: explicitSlash.name,
    commandArgs: explicitSlash.args,
    commandContext: explicitSlash.context,
    confidence,
    reason: slashCommand
      ? `${reasonPrefix} exists: ${explicitSlash.name}`
      : `${reasonPrefix} is not published: ${explicitSlash.name}`,
    requestedCommand: explicitSlash.requestedCommand,
    slashCommandStatus: slashCommand ? "present" : "missing",
    doNotSearchProject: true,
    hardStop: !slashCommand,
    agentContract: copyCommandAgentContract(),
    agentProfile: getCommandAgentProfile(explicitSlash.name),
    directRoute: false,
    mutationRisk: "delegates-to-slash-command",
    nextAction: slashCommand
      ? "Run this exact slash command in the active AI CLI; no repository search is needed. First run command-agent-plan.mjs for the slash command, then invoke the required host agents and require real host-agent receipts for specialist output."
      : "Hard stop: report the missing slash command from the catalog and do not inspect source files, marketplace command files, or repository paths to emulate it.",
  };
}

function parseExplicitSupervibeSlashCommand(request) {
  const text = String(request || "");
  const match = text.match(/(?:^|[\s`"'(])(?<raw>\/supervibe(?:-[a-z0-9-]+)?)(?=$|[\s`"')])(?<args>[^\n]*)/i);
  if (!match?.groups?.raw) return null;
  if (!isExplicitSupervibeSlashCommandRequest(text, match.index)) return null;
  return parsedSupervibeCommand(match.groups.raw, match.groups.args);
}

function isExplicitSupervibeSlashCommandRequest(text, matchIndex = -1) {
  const raw = String(text || "");
  const prefix = raw.slice(0, Math.max(0, matchIndex));
  const normalizedPrefix = normalizeText(prefix);
  if (!normalizedPrefix) return true;
  if (isNegatedCommandMention(raw, matchIndex)) return false;
  if (looksLikeSlashCommandEvidencePrefix(normalizedPrefix)) return false;
  if (countSupervibeSlashMentions(raw) === 1) return true;
  return [
    "active command",
    "current command",
    "active",
    "current",
    "next command",
    "run command",
    "execute command",
    "invoke command",
    "slash command",
    "command",
    "run",
    "execute",
    "invoke",
    "start",
    "use",
    "please",
    "pls",
    "kindly",
    "can you",
    "could you",
    "\u0434\u0430\u0432\u0430\u0439",
    "\u043f\u043e\u0436\u0430\u043b\u0443\u0439\u0441\u0442\u0430",
    "\u0437\u0430\u043f\u0443\u0441\u0442\u0438",
    "\u0432\u044b\u043f\u043e\u043b\u043d\u0438",
    "\u0430\u043a\u0442\u0438\u0432\u043d\u0430\u044f \u043a\u043e\u043c\u0430\u043d\u0434\u0430",
    "\u0442\u0435\u043a\u0443\u0449\u0430\u044f \u043a\u043e\u043c\u0430\u043d\u0434\u0430",
    "\u0441\u043b\u0435\u0434\u0443\u044e\u0449\u0430\u044f \u043a\u043e\u043c\u0430\u043d\u0434\u0430",
    "\u043a\u043e\u043c\u0430\u043d\u0434\u0430",
  ].some((phrase) => {
    const normalized = normalizeText(phrase);
    return normalizedPrefix.endsWith(normalized) || normalizedPrefix.endsWith(`${normalized}:`);
  });
}

function shouldPreserveWorkflowChainAuditRoute(request) {
  const text = String(request || "");
  return countSupervibeSlashMentions(text) > 1 && looksLikeExplicitWorkflowChainAudit(normalizeText(text));
}

function countSupervibeSlashMentions(value) {
  return (String(value || "").match(/(?:^|[\s`"'(])\/supervibe(?:-[a-z0-9-]+)?(?=$|[\s`"')])/gi) || []).length;
}

function looksLikeSlashCommandEvidencePrefix(normalizedPrefix) {
  return [
    "example",
    "examples",
    "prompt",
    "spec",
    "plan text",
    "review text",
    "mentions",
    "mention",
    "lists",
    "list",
    "inside",
    "include",
    "includes",
    "contains",
    "evidence",
    "as text",
    "\u043f\u0440\u0438\u043c\u0435\u0440",
    "\u043f\u0440\u0438\u043c\u0435\u0440\u044b",
    "\u043f\u0440\u043e\u043c\u043f\u0442",
    "\u0441\u043f\u0435\u043a",
    "\u0441\u043f\u0435\u0446\u0438\u0444\u0438\u043a\u0430\u0446\u0438\u044f",
    "\u0442\u0435\u043a\u0441\u0442 \u043f\u043b\u0430\u043d\u0430",
    "\u0443\u043f\u043e\u043c\u0438\u043d\u0430\u0435\u0442",
    "\u043f\u0435\u0440\u0435\u0447\u0438\u0441\u043b\u044f\u0435\u0442",
    "\u0432\u043d\u0443\u0442\u0440\u0438",
  ].some((phrase) => includesPhrase(normalizedPrefix, phrase));
}

function parseTerminalSupervibeCommand(request) {
  const text = String(request || "").trim();
  if (!text) return null;
  const normalized = normalizeText(text);
  const firstToken = normalized.split(" ")[0] || "";
  const typoTarget = COMMON_SUPERVIBE_COMMAND_TYPOS[firstToken];
  if (typoTarget) {
    const rest = text.slice(text.match(/^\S+/)?.[0]?.length || 0).trim();
    return parsedSupervibeCommand(typoTarget, rest, { confidence: 0.96 });
  }

  const exactBare = EXACT_BARE_SUPERVIBE_COMMANDS[normalized];
  if (exactBare) return parsedSupervibeCommand(exactBare, "", { confidence: 0.95 });

  const subcommandMatch = text.match(/^supervibe\s+(?<subcommand>[a-z0-9-]+)(?=$|[\s`"')])(?<args>[^\n]*)/i);
  const target = SUPERVIBE_SUBCOMMAND_ALIASES[subcommandMatch?.groups?.subcommand?.toLowerCase()];
  if (target) return parsedSupervibeCommand(target, subcommandMatch.groups.args);

  const dashMatch = text.match(/^(?<raw>supervibe(?:-[a-z0-9-]+)?)(?=$|[\s`"')])(?<args>[^\n]*)/i);
  if (dashMatch?.groups?.raw) return parsedSupervibeCommand(dashMatch.groups.raw, dashMatch.groups.args);

  return null;
}

function parsedSupervibeCommand(rawInput, rawRest = "", { confidence = 1 } = {}) {
  const raw = String(rawInput || "");
  const mapped = raw.startsWith("/") ? raw : `/${raw}`;
  const name = mapped.replace(/^\/supervibe\s+/i, "/supervibe-");
  const rest = String(rawRest || "").trim();
  if (!raw.startsWith("/") && raw.toLowerCase() === "supervibe" && rest && !rest.startsWith("--")) return null;
  const { args, context } = splitSlashCommandRest(rest);
  const commandArgs = raw.startsWith("/") || args.startsWith("--") ? args : "";
  const command = commandArgs ? `${name} ${commandArgs}` : name;
  return {
    name,
    command,
    args: commandArgs,
    context,
    requestedCommand: context ? `${command} ${context}` : command,
    confidence,
  };
}

const VALUE_SLASH_FLAGS = new Set([
  "--addons",
  "--host",
  "--plugin-root",
  "--profile",
  "--project",
  "--request",
  "--root",
  "--stack-tags",
  "--target",
]);

function splitSlashCommandRest(rest = "") {
  const tokens = String(rest || "").trim().split(/\s+/).filter(Boolean).map(cleanSlashCommandToken).filter(Boolean);
  if (tokens.length === 0) return { args: "", context: "" };
  const args = [];
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];
    if (!token.startsWith("-")) break;
    args.push(token);
    index += 1;
    const flagName = token.includes("=") ? token.slice(0, token.indexOf("=")) : token;
    if (!token.includes("=") && VALUE_SLASH_FLAGS.has(flagName) && index < tokens.length) {
      args.push(tokens[index]);
      index += 1;
    }
  }
  return {
    args: args.join(" "),
    context: tokens.slice(index).join(" "),
  };
}

function cleanSlashCommandToken(token = "") {
  return String(token || "").replace(/^[`"']+/, "").replace(/[`\\"",)]+$/g, "");
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
  if (looksLikeFinalReviewerWorkflowRequest(text)) return null;
  if (looksLikePackageScriptMetaQuestion(request)) return null;

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

function looksLikePackageScriptMetaQuestion(request, explicit = {}) {
  const text = normalizeText(request);
  if (!text) return false;
  const command = normalizeText(explicit.command || "");
  const script = normalizeText(explicit.script || "");
  if (command && text === command) return false;
  const mentionsPackageScript = includesPhrase(text, "npm run")
    || includesPhrase(text, "pnpm")
    || includesPhrase(text, "yarn")
    || includesPhrase(text, "bun")
    || (command && includesPhrase(text, command))
    || (script && includesPhrase(text, script));
  if (!mentionsPackageScript) return false;
  return [
    "audit whether",
    "review whether",
    "whether",
    "should",
    "why",
    "policy",
    "reserved",
    "defer",
    "deferred",
    "only run",
    "final gate",
    "release gate",
    "full suite",
    "before the release",
    "before final",
  ].some((phrase) => includesPhrase(text, phrase));
}

function looksLikeFinalReviewerWorkflowRequest(text) {
  const asksForFinalReview = [
    "final review",
    "final-review",
    "final reviewer",
    "final-reviewer",
    "reviewer",
    "reviewers",
  ].some((phrase) => includesPhrase(text, phrase));
  if (!asksForFinalReview) return false;
  return ![
    "npm run",
    "pnpm",
    "yarn",
    "bun",
    "supervibe:upgrade",
    "supervibe:update",
  ].some((phrase) => includesPhrase(text, phrase));
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
  const escaped = escapeRegExp(normalized).replace(/\\ /g, "\\s+");
  return new RegExp(`(^| )${escaped}( |$)`, "u").test(text);
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
