const SEMANTIC_INTENT_PROFILES = Object.freeze([
  {
    intent: "work_control_ui",
    baseConfidence: 0.84,
    minGroups: 2,
    concepts: [
      ["visual", "dashboard", "ui", "screen", "see", "visibility", "view", "control plane", "видеть", "визуально", "интерфейс", "экран", "дашборд", "показать"],
      ["tasks", "work items", "epics", "phases", "cycles", "waves", "задачи", "эпики", "фазы", "циклы", "волны"],
      ["manage", "control", "influence", "change status", "claim", "close", "управлять", "влиять", "менять", "закрывать"],
    ],
    pain: ["can't see progress", "lost in project", "where are we", "не видно задач", "непонятно что дальше", "пользователь может увидеть"],
  },
  {
    intent: "cleanup_stale_work",
    baseConfidence: 0.85,
    minGroups: 2,
    requiredGroups: [1],
    concepts: [
      ["old", "stale", "closed", "obsolete", "superseded", "not relevant", "старые", "закрыты", "не актуальны", "устарели"],
      ["tasks", "epics", "work items", "memory", "задачи", "эпики", "память"],
      ["cleanup", "garbage", "clutter", "archive", "delete", "gc", "очист", "мусор", "захлам", "архив", "удал"],
    ],
    pain: ["project keeps growing", "too much noise", "со временем проекты могут расти", "будет захламляться"],
  },
  {
    intent: "agent_strengthen",
    baseConfidence: 0.84,
    minGroups: 2,
    concepts: [
      ["agent", "agents", "subagent", "агент", "агенты"],
      ["dumb", "weak", "underperform", "not smart", "confidence", "отупели", "слабые", "не умные", "плохо"],
      ["tools", "memory", "rag", "codegraph", "mcp", "инструмент", "память", "кодграф"],
    ],
    pain: ["agents feel dumb", "don't use tools", "не пользуются инструментами", "агенты отупели"],
  },
  {
    intent: "memory_audit",
    baseConfidence: 0.84,
    minGroups: 2,
    concepts: [
      ["memory", "rag", "retrieval", "context", "codegraph", "semantic anchors", "tokens", "память", "раг", "контекст", "кодграф", "токены"],
      ["quality", "coverage", "economy", "save tokens", "drift", "weak", "прокачана", "эконом", "качество", "дрейф", "слаб"],
      ["audit", "check", "evaluate", "проверь", "оцен", "аудит"],
    ],
    pain: ["without losing quality", "token waste", "без потери качества", "без рисков отупления"],
  },
  {
    intent: "docs_audit",
    baseConfidence: 0.85,
    minGroups: 2,
    concepts: [
      ["docs", "readme", "documentation", "доки", "документация"],
      ["todo", "stale", "old", "internal", "dev files", "garbage", "trash", "туду", "старые", "внутрен", "мусор"],
      ["delete", "remove", "cleanup", "audit", "удал", "очист", "проверь"],
    ],
    pain: ["user should not see", "не должно быть файлов", "внутренняя разработка"],
  },
  {
    intent: "figma_source_of_truth",
    baseConfidence: 0.85,
    minGroups: 2,
    concepts: [
      ["figma", "фигма"],
      ["variables", "components", "tokens", "code connect", "prototype", "переменные", "компоненты", "токены", "прототип"],
      ["source of truth", "drift", "sync", "writeback", "источник истины", "дрейф", "синхрон", "обратная запись"],
    ],
    pain: ["figma integration lags", "figma drift", "фигма отстает"],
  },
  {
    intent: "design_new",
    baseConfidence: 0.83,
    minGroups: 2,
    concepts: [
      ["ui", "design", "visual", "screen", "layout", "interface", "дизайн", "визуал", "экран", "интерфейс"],
      ["cheap", "amateur", "ugly", "premium", "professional", "polish", "дорого", "дешево", "любитель", "премиум", "профессионал", "полиш"],
      ["improve", "make", "fix", "сделай", "улучши", "исправь"],
    ],
    pain: ["looks amateur", "does not look professional", "выглядит слабо", "выглядит дешево"],
  },
  {
    intent: "trigger_diagnostics",
    baseConfidence: 0.84,
    minGroups: 2,
    concepts: [
      ["intent", "trigger", "router", "route", "command", "интент", "триггер", "роутер", "команда"],
      ["wrong", "failed", "not understand", "misread", "почему", "не понял", "не сработал", "не туда"],
      ["diagnose", "explain", "debug", "диагност", "объясни", "проверь"],
    ],
    pain: ["plugin does not understand me", "wrong command selected", "плагин не понимает намерение"],
  },
]);

export function getSemanticIntentProfiles() {
  return SEMANTIC_INTENT_PROFILES.map((profile) => ({
    ...profile,
    concepts: profile.concepts.map((group) => [...group]),
    pain: [...(profile.pain || [])],
  }));
}

export function rankSemanticIntents(input, { limit = 4 } = {}) {
  const text = normalizeIntentText(input);
  if (!text) return [];
  return SEMANTIC_INTENT_PROFILES
    .map((profile) => scoreProfile(profile, text))
    .filter(Boolean)
    .sort((a, b) => b.confidence - a.confidence || b.matchedGroups.length - a.matchedGroups.length)
    .slice(0, limit);
}

export function routeSemanticIntent(input, options = {}) {
  return rankSemanticIntents(input, { limit: 1, ...options })[0] || null;
}

function normalizeIntentText(input = "") {
  return String(input)
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}+#./-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreProfile(profile, text) {
  const groupMatches = [];
  for (const group of profile.concepts) {
    groupMatches.push(firstMatch(text, group));
  }
  if ((profile.requiredGroups || []).some((index) => !groupMatches[index])) {
    return null;
  }
  const matchedGroups = groupMatches.filter(Boolean);
  const painMatches = (profile.pain || []).filter((phrase) => includesPhrase(text, phrase));
  const matched = matchedGroups.length >= profile.minGroups || (painMatches.length > 0 && matchedGroups.length > 0);
  if (!matched) return null;
  const confidence = Math.min(
    0.97,
    profile.baseConfidence + matchedGroups.length * 0.035 + painMatches.length * 0.025,
  );
  return {
    intent: profile.intent,
    confidence: Number(confidence.toFixed(2)),
    source: "semantic-intent-profile",
    matchedGroups,
    painMatches,
    reason: `Semantic profile matched ${profile.intent}: ${[...matchedGroups, ...painMatches].join(", ")}`,
  };
}

function firstMatch(text, phrases) {
  return phrases.find((phrase) => includesPhrase(text, phrase)) || null;
}

function includesPhrase(text, phrase) {
  const normalized = normalizeIntentText(phrase);
  if (!normalized) return false;
  if (normalized.length <= 3) {
    return new RegExp(`(^| )${escapeRegExp(normalized)}( |$)`, "u").test(text);
  }
  return text.includes(normalized);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
