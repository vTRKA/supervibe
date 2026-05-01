import { getTriggerIntentCorpus } from "./supervibe-trigger-intent-corpus.mjs";
import { rankSemanticIntents } from "./supervibe-semantic-intent-router.mjs";
import { getCapabilityRouteHint } from "./supervibe-capability-registry.mjs";
import { decideRetrievalPolicy } from "./supervibe-retrieval-decision-policy.mjs";

const ROUTES = {
  genesis_setup: {
    phase: "setup",
    command: "/supervibe-genesis",
    skill: "supervibe:genesis",
    nextQuestionRu: "Следующий шаг - host-aware genesis dry-run с сохранением существующих host instruction files. Переходим?",
    nextQuestionEn: "Next step - run a host-aware genesis dry-run while preserving existing host instruction files. Proceed?",
    prerequisites: ["user-request"],
  },
  index_repair: {
    phase: "diagnostics",
    command: "/supervibe-status --index-health --strict-index-health",
    skill: "supervibe:project-memory",
    nextQuestionRu: "Следующий шаг - показать index health gate и repair command. Переходим?",
    nextQuestionEn: "Next step - show the index health gate and repair command. Proceed?",
    prerequisites: [],
  },
  preview_server: {
    phase: "preview",
    command: "/supervibe-preview --daemon",
    skill: "supervibe:preview-server",
    nextQuestionRu: "Следующий шаг - запустить silent preview daemon с pid/log evidence. Переходим?",
    nextQuestionEn: "Next step - start the silent preview daemon with PID and log evidence. Proceed?",
    prerequisites: ["user-request"],
  },
  delivery_control: {
    phase: "delivery",
    command: "/supervibe --delivery-control",
    skill: "supervibe:executing-plans",
    nextQuestionRu: "Следующий шаг - сохранить state и выбрать понятное действие: применить, доработать, другой вариант, проверить глубже или остановиться. Переходим?",
    nextQuestionEn: "Next step - persist state and choose a clear action: apply, revise, try another option, review deeper, or stop here. Proceed?",
    prerequisites: ["user-request"],
  },
  brainstorm_to_plan: {
    phase: "brainstorm",
    command: "/supervibe-plan",
    skill: "supervibe:writing-plans",
    nextQuestionRu: "Следующий шаг - написать план. Переходим?",
    nextQuestionEn: "Next step - write the plan. Proceed?",
    prerequisites: ["brainstorm-artifact-or-summary"],
  },
  plan_review: {
    phase: "plan",
    command: "/supervibe-plan --review",
    skill: "supervibe:requesting-code-review",
    nextQuestionRu: "Следующий шаг - review loop по плану. Переходим?",
    nextQuestionEn: "Next step - run the plan review loop. Proceed?",
    prerequisites: ["plan-path-or-plan-content"],
  },
  atomize_plan: {
    phase: "plan_reviewed",
    command: "/supervibe-loop --from-plan --atomize",
    skill: "supervibe:writing-plans",
    nextQuestionRu: "Следующий шаг - разбить план на атомарные work items и epic. Переходим?",
    nextQuestionEn: "Next step - split the plan into atomic work items and an epic. Proceed?",
    prerequisites: ["reviewed-plan"],
  },
  create_epic: {
    phase: "plan_reviewed",
    command: "/supervibe-loop --from-plan --create-epic",
    skill: "supervibe:autonomous-agent-loop",
    nextQuestionRu: "Следующий шаг - разбить план на атомарные work items и epic. Переходим?",
    nextQuestionEn: "Next step - split the plan into atomic work items and an epic. Proceed?",
    prerequisites: ["reviewed-plan"],
  },
  autonomous_epic_run: {
    phase: "execution",
    command: "/supervibe-loop --epic",
    skill: "supervibe:autonomous-agent-loop",
    nextQuestionRu: "Следующий шаг - provider-safe preflight перед worktree/autonomous run. Переходим?",
    nextQuestionEn: "Next step - run provider-safe preflight before the worktree/autonomous run. Proceed?",
    prerequisites: ["epic-id", "approved-scope"],
  },
  worktree_autonomous_run: {
    phase: "execution",
    command: "/supervibe-loop --epic --worktree",
    skill: "supervibe:using-git-worktrees",
    nextQuestionRu: "Следующий шаг - provider-safe preflight перед worktree/autonomous run. Переходим?",
    nextQuestionEn: "Next step - run provider-safe preflight before the worktree/autonomous run. Proceed?",
    prerequisites: ["epic-id", "clean-or-isolated-worktree"],
  },
  execute_plan: {
    phase: "execution",
    command: "/supervibe-execute-plan",
    skill: "supervibe:executing-plans",
    nextQuestionRu: "Следующий шаг - readiness audit перед исполнением. Переходим?",
    nextQuestionEn: "Next step - run the readiness audit before execution. Proceed?",
    prerequisites: ["plan-path-or-plan-content", "readiness-audit"],
  },
  ready_query: {
    phase: "status",
    command: "/supervibe-status --ready",
    skill: "supervibe:project-memory",
    nextQuestionRu: "Следующий шаг - показать ready work items. Переходим?",
    nextQuestionEn: "Next step - show ready work items. Proceed?",
    prerequisites: [],
  },
  blocked_query: {
    phase: "status",
    command: "/supervibe-status --blocked",
    skill: "supervibe:project-memory",
    nextQuestionRu: "Следующий шаг - показать blockers. Переходим?",
    nextQuestionEn: "Next step - show blockers. Proceed?",
    prerequisites: [],
  },
  trigger_diagnostics: {
    phase: "diagnostics",
    command: "/supervibe --diagnose-trigger",
    skill: "supervibe:trigger-diagnostics",
    nextQuestionRu: "Следующий шаг - показать диагностику триггера. Переходим?",
    nextQuestionEn: "Next step - show trigger diagnostics. Proceed?",
    prerequisites: ["user-request"],
  },
  why_trigger: {
    phase: "diagnostics",
    command: "/supervibe --why-trigger",
    skill: "supervibe:trigger-diagnostics",
    nextQuestionRu: "Следующий шаг - показать объяснение выбора skill. Переходим?",
    nextQuestionEn: "Next step - explain the selected skill. Proceed?",
    prerequisites: ["last-route"],
  },
  readme_update: {
    phase: "documentation",
    command: "/supervibe-plan --docs-sync",
    skill: "supervibe:writing-plans",
    nextQuestionRu: "Следующий шаг - синхронизировать README и acceptance coverage. Переходим?",
    nextQuestionEn: "Next step - sync README and acceptance coverage. Proceed?",
    prerequisites: ["accepted-change-summary"],
  },
  security_audit: {
    phase: "audit",
    command: "/supervibe-security-audit",
    skill: "supervibe:audit",
    nextQuestionRu: "Следующий шаг - запустить read-only security audit с приоритизацией уязвимостей. Переходим?",
    nextQuestionEn: "Next step - run the read-only security audit with prioritized findings. Proceed?",
    prerequisites: [],
  },
  network_ops: {
    phase: "diagnostics",
    command: "/supervibe --agent network-router-engineer --read-only",
    skill: "supervibe:incident-response",
    nextQuestionRu: "Следующий шаг - начать read-only диагностику сети/роутера без изменений конфигурации. Переходим?",
    nextQuestionEn: "Next step - start read-only network/router diagnostics without config changes. Proceed?",
    prerequisites: ["user-request"],
  },
  prompt_ai_engineering: {
    phase: "design",
    command: "/supervibe --agent prompt-ai-engineer",
    skill: "supervibe:test-strategy",
    nextQuestionRu: "Следующий шаг - проверить prompt/agent/router contract, evals и safety boundaries. Переходим?",
    nextQuestionEn: "Next step - review the prompt, agent, or router contract with evals and safety boundaries. Proceed?",
    prerequisites: ["user-request"],
  },
  design_new: {
    phase: "design",
    command: "/supervibe-design",
    skill: "supervibe:prototype",
    nextQuestionRu: "Следующий шаг - запустить дизайн-пайплайн с memory, code и design lookup preflight. Переходим?",
    nextQuestionEn: "Next step - run the design pipeline with memory, code, and design lookup preflight. Proceed?",
    prerequisites: ["design-brief"],
  },
  design_review: {
    phase: "audit",
    command: "/supervibe-audit --design",
    skill: "supervibe:audit",
    nextQuestionRu: "Следующий шаг - провести дизайн-аудит с evidence, token и accessibility checks. Переходим?",
    nextQuestionEn: "Next step - run design audit with evidence, token, and accessibility checks. Proceed?",
    prerequisites: ["design-artifact"],
  },
  design_system_extension: {
    phase: "design",
    command: "/supervibe-design --extend-system",
    skill: "supervibe:brandbook",
    nextQuestionRu: "Следующий шаг - подготовить узкое расширение дизайн-системы без ребренда. Переходим?",
    nextQuestionEn: "Next step - prepare a narrow design-system extension without rebrand. Proceed?",
    prerequisites: ["approved-design-system", "design-brief"],
  },
  mobile_ui: {
    phase: "design",
    command: "/supervibe-design --target mobile-native",
    skill: "supervibe:prototype",
    nextQuestionRu: "Следующий шаг - запустить мобильный UI flow с platform и touch constraints. Переходим?",
    nextQuestionEn: "Next step - run the mobile UI flow with platform and touch constraints. Proceed?",
    prerequisites: ["design-brief"],
  },
  chart_ux: {
    phase: "design",
    command: "/supervibe-design --chart-ux",
    skill: "supervibe:prototype",
    nextQuestionRu: "Следующий шаг - проработать chart UX с fallback и accessibility evidence. Переходим?",
    nextQuestionEn: "Next step - work through chart UX with fallback and accessibility evidence. Proceed?",
    prerequisites: ["design-brief"],
  },
  presentation_deck: {
    phase: "design",
    command: "/supervibe-design --presentation",
    skill: "supervibe:presentation-deck",
    nextQuestionRu: "Следующий шаг - запустить deck flow с narrative, slide и brand evidence. Переходим?",
    nextQuestionEn: "Next step - run deck flow with narrative, slide, and brand evidence. Proceed?",
    prerequisites: ["design-brief"],
  },
  brand_collateral: {
    phase: "design",
    command: "/supervibe-design --brand-collateral",
    skill: "supervibe:brandbook",
    nextQuestionRu: "Следующий шаг - проработать brand/collateral assets через существующий дизайн-пайплайн. Переходим?",
    nextQuestionEn: "Next step - work through brand/collateral assets via the existing design pipeline. Proceed?",
    prerequisites: ["design-brief"],
  },
  stack_ui_guidance: {
    phase: "design",
    command: "/supervibe-design --handoff",
    skill: "supervibe:component-library-integration",
    nextQuestionRu: "Следующий шаг - подготовить stack-aware UI handoff на базе утвержденных tokens. Переходим?",
    nextQuestionEn: "Next step - prepare stack-aware UI handoff from approved tokens. Proceed?",
    prerequisites: ["approved-design-system", "design-artifact"],
  },
  work_control_ui: {
    phase: "status",
    command: "/supervibe-ui",
    skill: "supervibe:project-memory",
    nextQuestionRu: "Следующий шаг - открыть локальный UI для задач, эпиков, фаз, волн и безопасных действий. Переходим?",
    nextQuestionEn: "Next step - open the local UI for tasks, epics, phases, waves, and safe actions. Proceed?",
    prerequisites: [],
  },
  cleanup_stale_work: {
    phase: "maintenance",
    command: "/supervibe-gc --all --dry-run",
    skill: "supervibe:project-memory",
    nextQuestionRu: "Следующий шаг - показать dry-run очистки старых задач, эпиков и памяти без удаления. Переходим?",
    nextQuestionEn: "Next step - show a dry-run cleanup for stale tasks, epics, and memory without deleting anything. Proceed?",
    prerequisites: [],
  },
  agent_strengthen: {
    phase: "maintenance",
    command: "/supervibe-strengthen",
    skill: "supervibe:strengthen",
    nextQuestionRu: "Следующий шаг - проверить слабых агентов по телеметрии и предложить усиление через user gate. Переходим?",
    nextQuestionEn: "Next step - inspect weak agents from telemetry and propose strengthening through a user gate. Proceed?",
    prerequisites: [],
  },
  memory_audit: {
    phase: "audit",
    command: "/supervibe-audit --memory",
    skill: "supervibe:audit",
    nextQuestionRu: "Следующий шаг - проверить memory/RAG/codegraph/context качество, свежесть и расход токенов. Переходим?",
    nextQuestionEn: "Next step - audit memory/RAG/codegraph/context quality, freshness, and token cost. Proceed?",
    prerequisites: [],
  },
  docs_audit: {
    phase: "audit",
    command: "/supervibe-audit --docs",
    skill: "supervibe:audit",
    nextQuestionRu: "Следующий шаг - проверить docs на устаревшие и внутренние dev-артефакты. Переходим?",
    nextQuestionEn: "Next step - audit docs for stale and internal development artifacts. Proceed?",
    prerequisites: [],
  },
  figma_source_of_truth: {
    phase: "design",
    command: "/supervibe-design --figma-source-of-truth",
    skill: "supervibe:design-intelligence",
    nextQuestionRu: "Следующий шаг - пройти Figma source-of-truth flow: variables/components -> tokens -> prototype -> code -> drift audit. Переходим?",
    nextQuestionEn: "Next step - run the Figma source-of-truth flow: variables/components -> tokens -> prototype -> code -> drift audit. Proceed?",
    prerequisites: ["design-brief"],
  },
};

const RULES = [
  {
    intent: "genesis_setup",
    confidence: 0.93,
    test: (text) => hasAny(text, ["genesis", "supervibe-genesis", "set up", "setup", "bootstrap", "scaffold", "install", "initialize", "генезис", "разверн"]) &&
      hasAny(text, ["supervibe", "host instruction", "agents", "skills", "rules", "codex", "claude", "cursor", "gemini", "opencode", "AGENTS.md"]),
  },
  {
    intent: "index_repair",
    confidence: 0.92,
    test: (text) => hasAny(text, ["broken rag", "index health", "repair index", "stale index", "code index"]) && hasAny(text, ["repair", "health", "gate", "fix", "show"]),
  },
  {
    intent: "preview_server",
    confidence: 0.91,
    test: (text) => hasAny(text, ["preview", "preview server"]) && hasAny(text, ["silent", "daemon", "background"]),
  },
  {
    intent: "delivery_control",
    confidence: 0.9,
    test: (text) => hasAny(text, ["stop after delivery", "resume later", "save state", "post-delivery"]) && hasAny(text, ["stop", "resume", "state"]),
  },
  {
    intent: "worktree_autonomous_run",
    confidence: 0.92,
    test: (text) => hasAny(text, ["worktree", "separate workspace", "isolated session"]) && hasAny(text, ["parallel sessions", "multiple sessions", "10 sessions", "same plan", "same epic"]),
  },
  {
    intent: "worktree_autonomous_run",
    confidence: 0.94,
    test: (text) => hasAny(text, ["worktree", "отдельном worktree"]) && hasAny(text, ["автоном", "epic", "эпик", "3 часа", "3h"]),
  },
  {
    intent: "autonomous_epic_run",
    confidence: 0.91,
    test: (text) => hasAny(text, ["автоном", "autonom"]) && hasAny(text, ["эпик", "epic", "3 часа", "3h"]),
  },
  {
    intent: "create_epic",
    confidence: 0.9,
    test: (text) => hasAny(text, ["создай эпик", "create epic", "epic"]) && hasAny(text, ["план", "plan", "child tasks"]),
  },
  {
    intent: "atomize_plan",
    confidence: 0.9,
    test: (text) => hasAny(text, ["атомар", "atomic", "разбей", "break"]) && hasAny(text, ["план", "plan", "задач", "tasks"]),
  },
  {
    intent: "plan_review",
    confidence: 0.91,
    test: (text) => hasAny(text, ["ревью", "review", "проверь"]) && hasAny(text, ["план", "plan"]),
  },
  {
    intent: "brainstorm_to_plan",
    confidence: 0.9,
    test: (text) => hasAny(text, ["брейншторм", "brainstorm"]) && hasAny(text, ["готов", "done", "finished", "после", "next", "дальше", "план", "plan"]),
  },
  {
    intent: "execute_plan",
    confidence: 0.87,
    test: (text) => hasAny(text, ["сделай по плану", "выполни план", "execute plan", "run plan"]),
  },
  {
    intent: "trigger_diagnostics",
    confidence: 0.9,
    test: (text) => hasAny(text, ["почему не сработал", "trigger fail", "diagnose trigger", "триггер не"]),
  },
  {
    intent: "why_trigger",
    confidence: 0.88,
    test: (text) => hasAny(text, ["почему выбрал", "why did you choose", "why this skill", "why-trigger"]),
  },
  {
    intent: "ready_query",
    confidence: 0.84,
    test: (text) => hasAny(text, ["что готово", "ready work", "ready tasks"]),
  },
  {
    intent: "blocked_query",
    confidence: 0.84,
    test: (text) => hasAny(text, ["что заблокировано", "blocked", "blockers"]),
  },
  {
    intent: "readme_update",
    confidence: 0.84,
    test: (text) => hasAny(text, ["readme", "ридми"]) && hasAny(text, ["обнови", "update", "sync"]),
  },
  {
    intent: "security_audit",
    confidence: 0.93,
    test: (text) => hasAny(text, ["security", "appsec", "vulnerability", "vulnerabilities", "owasp", "cve", "secret", "секьюрити", "безопасность", "уязвимость", "уязвимости"]) && hasAny(text, ["audit", "scan", "review", "check", "провер", "аудит"]),
  },
  {
    intent: "network_ops",
    confidence: 0.92,
    test: (text) => hasAny(text, ["router", "network", "wifi", "wi-fi", "vpn", "firewall", "nat", "dhcp", "dns", "роутер", "маршрутизатор", "вайфай", "сеть"]) && hasAny(text, ["diagnose", "configure", "stabilize", "fix", "setup", "не работает", "падает", "настро", "стабил"]),
  },
  {
    intent: "prompt_ai_engineering",
    confidence: 0.92,
    test: (text) => hasAny(text, ["prompt", "system prompt", "agent prompt", "instructions", "intent", "router", "промпт", "интент"]) && hasAny(text, ["engineer", "improve", "harden", "debug", "eval", "injection", "усиль", "улучши", "проверь"]),
  },
  {
    intent: "work_control_ui",
    confidence: 0.91,
    test: (text) => hasAny(text, ["kanban", "board", "канбан", "доска"]) && hasAny(text, ["task", "tasks", "epic", "epics", "agent", "agents", "задач", "эпик", "агент"]),
  },
  {
    intent: "presentation_deck",
    confidence: 0.93,
    test: (text) => hasAny(text, ["deck", "presentation", "слайд", "презентац"]) && hasAny(text, ["design", "дизайн", "make", "сделай", "build"]),
  },
  {
    intent: "brand_collateral",
    confidence: 0.9,
    test: (text) => hasAny(text, ["logo", "collateral", "cip", "brand asset", "логотип", "фирстиль"]) && hasAny(text, ["design", "дизайн", "сделай", "asset", "mockup"]),
  },
  {
    intent: "chart_ux",
    confidence: 0.92,
    test: (text) => hasAny(text, ["chart", "graph", "data viz", "график", "диаграм"]) && hasAny(text, ["ux", "design", "дизайн", "a11y", "accessibility"]),
  },
  {
    intent: "mobile_ui",
    confidence: 0.93,
    test: (text) => hasAny(text, ["mobile", "ios", "android", "touch", "мобиль"]) && hasAny(text, ["ui", "дизайн", "interface", "экран"]),
  },
  {
    intent: "design_system_extension",
    confidence: 0.88,
    test: (text) => hasAny(text, ["extend design system", "design-system extension", "расшир", "дизайн-систем"]) && hasAny(text, ["token", "component", "tokens", "компонент"]),
  },
  {
    intent: "design_review",
    confidence: 0.87,
    test: (text) => hasAny(text, ["ui review", "design audit", "проверь дизайн", "аудит дизайна", "полиш", "polish"]),
  },
  {
    intent: "stack_ui_guidance",
    confidence: 0.86,
    test: (text) => hasAny(text, ["shadcn", "tailwind", "next.js", "react", "vue", "svelte"]) && hasAny(text, ["ui", "handoff", "design", "tokens", "дизайн"]),
  },
  {
    intent: "design_new",
    confidence: 0.85,
    test: (text) => hasDesignSurface(text) && hasAny(text, ["make", "build", "create", "сделай", "нарисуй", "улучши"]),
  },
];

export function routeTriggerRequest(input, options = {}) {
  const request = typeof input === "string" ? input : input?.request;
  const artifacts = typeof input === "object" && input?.artifacts ? input.artifacts : options.artifacts ?? {};
  const text = normalize(request ?? "");
  const locale = detectLocale(text);
  const corpus = options.corpus ?? getTriggerIntentCorpus();

  const commandMatch = matchSlashCommand(text);
  if (commandMatch) {
    const route = ROUTES[commandMatch.intent];
    return withArtifactStatus(
      withRoutingEvidence({
        intent: commandMatch.intent,
        phase: route.phase,
        command: route.command,
        skill: route.skill,
        confidence: 1,
        confidenceFloor: 0.99,
        mutationRisk: mutationRiskFor(commandMatch.intent),
        prerequisites: route.prerequisites,
        requiredSafety: requiredSafetyFor(commandMatch.intent),
        nextQuestion: locale === "ru" ? route.nextQuestionRu : route.nextQuestionEn,
        alternatives: alternativesFromRoutes(commandMatch.intent),
        matchedPhrase: route.command,
        source: "exact-command",
        reason: `Exact slash command match: ${route.command}`,
      }, [{
        source: "exact-command",
        reason: `Exact slash command match: ${route.command}`,
        matchedPhrase: route.command,
      }], alternativesFromRoutes(commandMatch.intent)),
      artifacts,
    );
  }

  const exact = corpus.find((entry) => normalize(entry.phrase) === text);
  if (exact) {
    return withArtifactStatus(
      withRoutingEvidence({
        ...exact,
        confidence: 1,
        nextQuestion: localizeQuestion(exact, locale),
        alternatives: alternativesFor(exact.intent, corpus),
        matchedPhrase: exact.phrase,
        source: "exact-corpus",
        reason: `Exact corpus match: ${exact.id}`,
      }, [{
        source: "exact-corpus",
        reason: `Exact corpus match: ${exact.id}`,
        matchedPhrase: exact.phrase,
      }], alternativesFor(exact.intent, corpus)),
      artifacts,
    );
  }

  const keywordScored = RULES
    .filter((rule) => rule.test(text))
    .map((rule) => ({ ...rule, source: "keyword-rule", reason: `Keyword route: ${rule.intent}` }));
  const semanticScored = rankSemanticIntents(text)
    .filter((candidate) => ROUTES[candidate.intent])
    .map((candidate) => ({
      intent: candidate.intent,
      confidence: candidate.confidence,
      source: candidate.source,
      reason: candidate.reason,
      semanticEvidence: {
        matchedGroups: candidate.matchedGroups,
        painMatches: candidate.painMatches,
      },
    }));
  const scored = [...keywordScored, ...semanticScored]
    .sort((a, b) => b.confidence - a.confidence || sourcePriority(b.source) - sourcePriority(a.source));
  if (scored.length > 0) {
    const route = ROUTES[scored[0].intent];
    return withArtifactStatus(
      withRoutingEvidence({
        intent: scored[0].intent,
        phase: route.phase,
        command: route.command,
        skill: route.skill,
        confidence: scored[0].confidence,
        confidenceFloor: scored[0].confidence,
        mutationRisk: mutationRiskFor(scored[0].intent),
        prerequisites: route.prerequisites,
        requiredSafety: requiredSafetyFor(scored[0].intent),
        nextQuestion: locale === "ru" ? route.nextQuestionRu : route.nextQuestionEn,
        alternatives: scored.slice(1, 4).map((rule) => ({ intent: rule.intent, confidence: rule.confidence })),
        matchedPhrase: null,
        semanticEvidence: scored[0].semanticEvidence,
        source: scored[0].source,
        reason: scored[0].reason,
      }, evidenceFor(scored[0]), scored.slice(1, 4).map((rule) => ({
        intent: rule.intent,
        confidence: rule.confidence,
        source: rule.source,
        reason: rule.reason,
      }))),
      artifacts,
    );
  }

  return withRoutingEvidence({
    intent: "unknown",
    phase: "diagnostics",
    command: "/supervibe --diagnose-trigger",
    skill: "supervibe:trigger-diagnostics",
    confidence: 0,
    confidenceFloor: 0.8,
    mutationRisk: "none",
    prerequisites: ["user-request"],
    requiredSafety: ["confirm-before-mutation"],
    nextQuestion: locale === "ru"
      ? "Триггер не распознан. Показать диагностику и ближайшие маршруты?"
      : "Trigger was not recognized. Show diagnostics and nearest routes?",
    alternatives: [],
    missingArtifacts: [],
    safetyBlockers: [],
    matchedPhrase: null,
    reason: "No corpus or keyword match",
    clarifyingQuestion: true,
  }, [{
    source: "fallback",
    reason: "No corpus or keyword match",
  }], []);
}

export function evaluateIntentGoldenCorpus(corpus = []) {
  const results = corpus.map((entry) => {
    const route = routeTriggerRequest(entry.phrase);
    const failures = [];
    const expected = entry.expected || {};

    if (expected.intent && route.intent !== expected.intent) {
      failures.push(`expected intent ${expected.intent} but got ${route.intent}`);
    }
    if (expected.notIntent && route.intent === expected.notIntent) {
      failures.push(`expected not to route to ${expected.notIntent}`);
    }
    if (expected.command && route.command !== expected.command) {
      failures.push(`expected command ${expected.command} but got ${route.command}`);
    }
    if (typeof expected.minConfidence === "number" && route.confidence < expected.minConfidence) {
      failures.push(`expected confidence >= ${expected.minConfidence} but got ${route.confidence}`);
    }
    if (expected.clarifyingQuestion && !(route.clarifyingQuestion || route.nextQuestion)) {
      failures.push("expected clarifying question");
    }
    if (!route.routingEvidence?.length) {
      failures.push("missing routing evidence");
    }
    if (!Array.isArray(route.rejectedAlternatives)) {
      failures.push("missing rejected alternatives");
    }

    return {
      id: entry.id,
      phrase: entry.phrase,
      expected,
      pass: failures.length === 0,
      failures,
      route,
    };
  });
  const failed = results.filter((result) => !result.pass);
  return {
    pass: failed.length === 0,
    total: results.length,
    failed,
    results,
  };
}

export function formatIntentGoldenEvaluation(evaluation) {
  const lines = [
    "SUPERVIBE_INTENT_GOLDEN_EVALUATION",
    `PASS: ${evaluation.pass}`,
    `TOTAL: ${evaluation.total}`,
    `FAILED: ${evaluation.failed.length}`,
  ];
  for (const failure of evaluation.failed) {
    lines.push(`- ${failure.id}: ${failure.failures.join("; ")}`);
    lines.push(`  route: ${failure.route.intent} -> ${failure.route.command} (${failure.route.confidence})`);
  }
  return lines.join("\n");
}

function withArtifactStatus(route, artifacts) {
  const missingArtifacts = route.prerequisites.filter((name) => !artifactSatisfied(name, artifacts));
  const safetyBlockers = safetyBlockersFor(route, artifacts);
  return { ...route, missingArtifacts, safetyBlockers };
}

function artifactSatisfied(name, artifacts) {
  const aliases = {
    "brainstorm-artifact-or-summary": ["brainstorm", "brainstormSummary", "spec"],
    "plan-path-or-plan-content": ["plan", "planPath", "planContent"],
    "reviewed-plan": ["planReviewPassed", "reviewedPlan", "planReview"],
    "epic-id": ["epic", "epicId"],
    "approved-scope": ["approvedScope", "approval", "approvals"],
    "clean-or-isolated-worktree": ["worktreeClean", "worktreePath"],
    "duration-budget": ["durationBudget", "maxDuration"],
    "readiness-audit": ["readinessAudit", "planReviewPassed"],
    "accepted-change-summary": ["changeSummary", "acceptedChangeSummary"],
    "design-brief": ["designBrief", "brief", "request", "userRequest"],
    "design-artifact": ["prototype", "prototypePath", "designArtifact", "screenshot", "figmaFile"],
    "approved-design-system": ["approvedDesignSystem", "designSystemApproved", "designSystem"],
    "user-request": ["request", "userRequest"],
    "last-route": ["lastRoute"],
  };
  const keys = aliases[name] ?? [name];
  return keys.some((key) => Boolean(artifacts[key]));
}

function safetyBlockersFor(route, artifacts) {
  const blockers = [];
  if (route.mutationRisk !== "none" && artifacts.confirmedMutation !== true) {
    blockers.push("needs-explicit-user-confirmation");
  }
  if (route.requiredSafety?.includes("bounded-runtime") && !artifacts.maxDuration && !artifacts.durationBudget) {
    blockers.push("needs-bounded-runtime");
  }
  if (route.requiredSafety?.includes("stop-command") && artifacts.stopCommandAvailable === false) {
    blockers.push("stop-command-unavailable");
  }
  if (artifacts.providerPolicyReviewed === false) {
    blockers.push("provider-policy-review-required");
  }
  return blockers;
}

function alternativesFor(intent, corpus) {
  return [...new Set(corpus.filter((entry) => entry.intent !== intent).map((entry) => entry.intent))]
    .slice(0, 3)
    .map((candidate) => ({ intent: candidate, confidence: 0.5 }));
}

function alternativesFromRoutes(intent) {
  return Object.keys(ROUTES)
    .filter((candidate) => candidate !== intent)
    .slice(0, 3)
    .map((candidate) => ({ intent: candidate, confidence: 0.5 }));
}

function localizeQuestion(entry, locale) {
  if (locale === "en") {
    const route = ROUTES[entry.intent];
    return route?.nextQuestionEn ?? entry.nextQuestionIncludes;
  }
  return entry.nextQuestionIncludes;
}

function mutationRiskFor(intent) {
  if (["autonomous_epic_run", "execute_plan"].includes(intent)) return "executes-code";
  if (intent === "worktree_autonomous_run") return "creates-worktree";
  if (["atomize_plan", "create_epic"].includes(intent)) return "writes-tracker";
  if (["brainstorm_to_plan", "readme_update", "design_new", "design_system_extension", "mobile_ui", "chart_ux", "presentation_deck", "brand_collateral", "stack_ui_guidance", "agent_strengthen", "prompt_ai_engineering", "figma_source_of_truth"].includes(intent)) return "writes-docs";
  return "none";
}

function requiredSafetyFor(intent) {
  const base = ["no-provider-bypass", "no-hidden-background-work", "confirm-before-mutation"];
  if (intent === "genesis_setup") return [...base, "dry-run-before-host-file-write", "preserve-existing-host-files"];
  if (["autonomous_epic_run", "worktree_autonomous_run"].includes(intent)) {
    return [...base, "bounded-runtime", "stop-command", intent === "worktree_autonomous_run" ? "worktree-cleanup" : "side-effect-ledger"];
  }
  if (intent === "execute_plan") return [...base, "readiness-gate", "completion-gate"];
  if (intent === "security_audit") return [...base, "read-only-audit", "scoped-approval-before-fix"];
  if (intent === "network_ops") return [...base, "read-only-diagnostics", "scoped-approval-before-network-mutation"];
  if (intent === "prompt_ai_engineering") return [...base, "eval-before-claim", "tool-boundary-review"];
  return base;
}

function sourcePriority(source) {
  if (source === "exact-command") return 4;
  if (source === "exact-corpus") return 3;
  if (source === "semantic-intent-profile") return 2;
  if (source === "keyword-rule") return 1;
  return 0;
}

function detectLocale(text) {
  return /[а-яё]/i.test(text) ? "ru" : "en";
}

function hasAny(text, phrases) {
  return phrases.some((phrase) => text.includes(normalize(phrase)));
}

function matchSlashCommand(text) {
  if (!text.startsWith("/")) return null;
  return Object.entries(ROUTES)
    .map(([intent, route]) => ({ intent, command: normalize(route.command).split(" ")[0] }))
    .sort((a, b) => b.command.length - a.command.length)
    .find((candidate) => text === candidate.command || text.startsWith(`${candidate.command} `)) || null;
}

function evidenceFor(candidate) {
  return [{
    source: candidate.source,
    reason: candidate.reason,
    matchedPhrase: candidate.matchedPhrase || null,
    semanticEvidence: candidate.semanticEvidence,
  }];
}

function withRoutingEvidence(route, evidence, rejectedAlternatives) {
  const capability = getCapabilityRouteHint(route.intent);
  return {
    ...route,
    capabilityId: capability?.capabilityId || null,
    verificationHooks: capability?.verificationHooks || [],
    toolMetadata: { required: Boolean(capability?.toolMetadataRequired), deterministicOrder: true, intentScoped: true },
    retrievalPolicy: decideRetrievalPolicy({ taskText: `${route.intent} ${route.command} ${route.reason || ""}` }),
    routingEvidence: evidence.filter(Boolean),
    rejectedAlternatives: rejectedAlternatives || [],
  };
}

function hasDesignSurface(text) {
  return hasAny(text, ["design", "mockup", "prototype", "user interface", "дизайн", "макет", "мокап", "прототип"]) ||
    /(^| )ui( |$)/.test(text) ||
    /(^| )(look|looks|visual|screen|layout|polish|professional)( |$)/.test(text);
}

function normalize(value) {
  return String(value).toLowerCase().replace(/\s+/g, " ").trim();
}
