import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import {
  getCommandAgentProfile,
  listCommandAgentProfiles,
} from "./command-agent-orchestration-contract.mjs";
import { validateAgenticQuestion } from "./supervibe-dialogue-contract.mjs";

export const QUESTION_SURFACE_SCHEMA_VERSION = 1;

const QUESTION_SURFACE_SCAN_DIRS = Object.freeze([
  "agents",
  "commands",
  "rules",
  "scripts/lib",
  "skills",
]);

const STATIC_BYPASS_ALLOWLIST = new Set([
  "scripts/lib/question-surface-contract.mjs",
  "scripts/lib/specialist-question-contract.mjs",
  "scripts/lib/supervibe-dialogue-contract.mjs",
  "scripts/validate-dynamic-question-systems.mjs",
]);

const COMMAND_SUBJECTS = Object.freeze({
  "/supervibe": { en: "Supervibe command router", ru: "маршрутизатор Supervibe" },
  "/supervibe-adapt": { en: "managed artifact adaptation", ru: "адаптация managed artifacts" },
  "/supervibe-audit": { en: "project audit", ru: "аудит проекта" },
  "/supervibe-brainstorm": { en: "requirements brainstorm", ru: "брейншторм требований" },
  "/supervibe-design": { en: "design workflow", ru: "дизайн-workflow" },
  "/supervibe-execute-plan": { en: "implementation execution", ru: "исполнение плана" },
  "/supervibe-gc": { en: "stale work cleanup", ru: "очистка устаревшей работы" },
  "/supervibe-genesis": { en: "project scaffold", ru: "scaffold проекта" },
  "/supervibe-loop": { en: "agent loop", ru: "agent loop" },
  "/supervibe-plan": { en: "implementation plan", ru: "план реализации" },
  "/supervibe-preview": { en: "prototype preview server", ru: "preview server прототипа" },
  "/supervibe-status": { en: "project status report", ru: "status отчёт проекта" },
  "/supervibe-strengthen": { en: "agent and artifact strengthening", ru: "усиление агентов и артефактов" },
  "/supervibe-ui": { en: "local work control UI", ru: "локальный work-control UI" },
});

const STATIC_BYPASS_RULES = Object.freeze([
  {
    code: "raw-string-choice-array",
    pattern: /choices\s*:\s*\[\s*(?:(?:"[^"]+"|'[^']+')\s*,?\s*){2,}\]/s,
    message: "Question choices must be structured objects with id, label, tradeoff, and provenance; raw string arrays are not allowed.",
  },
  {
    code: "legacy-creative-direction-label",
    pattern: /Operational clarity|Technical command center|Premium editorial|Warm product utility|Bold launch energy/i,
    message: "Legacy creative-direction labels must not be user-facing runtime options.",
  },
  {
    code: "template-question-copy",
    pattern: /Choose option A|Choose option B|Which option should we choose\?|what should we choose\?|choose the next step for this delivery/i,
    message: "Generic template question copy must go through the question surface builder.",
  },
  {
    code: "blocked-question-raw-ids",
    pattern: /blockedQuestion[\s\S]{0,240}choices\s*:\s*\[\s*["'](?:provision-agents|connect-host-agents|stop)["']/,
    message: "Blocked-mode choices must use visible labels and tradeoffs, not raw ids.",
  },
]);

export function buildCommandQuestionSurface(commandId, route = {}, options = {}) {
  const locale = normalizeLocale(options.locale || route.locale || detectLocale(`${route.nextQuestion || ""} ${route.command || ""}`));
  const normalizedCommandId = normalizeCommandId(commandId || route.command || route.commandId || route.intent);
  const profile = normalizedCommandId ? getCommandAgentProfile(normalizedCommandId) : null;
  const command = route.command || normalizedCommandId || null;
  const missingCommand = !command || route.hardStop === true || route.intent === "missing_slash_command" || route.intent === "missing_npm_script";
  const subject = subjectForCommand(normalizedCommandId, route, locale);
  const request = sanitizeVisible(options.request || route.request || route.userRequest || route.matchedPhrase || route.reason || subject, 90);
  const specialist = firstNonEmpty(
    options.specialist,
    route.questionSpecialist,
    route.agentProfile?.ownerAgentId,
    profile?.ownerAgentId,
    route.skill,
    "supervibe-orchestrator",
  );
  const evidence = [
    `commandId=${normalizedCommandId || "none"}`,
    `intent=${route.intent || "unknown"}`,
    `source=${route.source || "question-surface"}`,
    ...asArray(route.routingEvidence).map((item) => item?.reason || item?.matchedPhrase || item?.source).filter(Boolean),
    ...asArray(options.evidence),
  ].map((item) => sanitizeVisible(item, 140)).filter(Boolean);
  const artifactImpact = options.artifactImpact || route.questionArtifactImpact || commandArtifactImpact({
    locale,
    command,
    subject,
  });

  if (missingCommand) {
    return {
      schemaVersion: QUESTION_SURFACE_SCHEMA_VERSION,
      surfaceKind: "command-diagnostic",
      commandId: normalizedCommandId || null,
      prompt: locale === "ru"
        ? `Шаг 1/1: ${subject} недоступна. Сообщить диагностику, показать ближайшие маршруты или остановиться?`
        : `Step 1/1: ${subject} is unavailable. Report diagnostics, show nearby routes, or stop?`,
      subject,
      specialist,
      evidence,
      artifactImpact,
      choices: diagnosticChoices({ locale, subject }),
      locale,
    };
  }

  return {
    schemaVersion: QUESTION_SURFACE_SCHEMA_VERSION,
    surfaceKind: "command-route",
    commandId: normalizedCommandId || null,
    prompt: commandPrompt({ locale, subject, request }),
    subject,
    specialist,
    evidence,
    artifactImpact,
    choices: commandChoices({ locale, subject, command, specialist, hasAlternatives: asArray(route.rejectedAlternatives || route.alternatives).length > 0 }),
    locale,
  };
}

export function validateQuestionSurface(surface = {}, options = {}) {
  const issues = [];
  const label = options.surface || surface.commandId || surface.surfaceKind || "question-surface";
  if (surface.schemaVersion !== QUESTION_SURFACE_SCHEMA_VERSION) {
    issues.push(issue("question-surface-schema", `${label} missing schemaVersion=${QUESTION_SURFACE_SCHEMA_VERSION}`));
  }
  if (!surface.surfaceKind) {
    issues.push(issue("question-surface-kind", `${label} missing surfaceKind`));
  }
  if (!surface.subject) {
    issues.push(issue("question-surface-subject", `${label} missing subject`));
  }
  if (surface.surfaceKind === "command-route" && !surface.commandId) {
    issues.push(issue("question-surface-command-id", `${label} command route surface missing commandId`));
  }
  issues.push(...validateAgenticQuestion(surface, {
    surface: label,
    minChoices: options.minChoices || 3,
    minEvidence: options.minEvidence || 2,
  }));
  if (surface.prompt && surface.subject && !surface.prompt.toLowerCase().includes(String(surface.subject).toLowerCase().slice(0, 14))) {
    issues.push(issue("subject-not-visible", `${label} prompt must include the resolved subject`));
  }
  return issues;
}

export function validateAllCommandQuestionSurfaces({ commandIds = null } = {}) {
  const ids = commandIds || listCommandAgentProfiles().map((profile) => profile.commandId).sort();
  const issues = [];
  for (const commandId of ids) {
    for (const locale of ["en", "ru"]) {
      const surface = buildCommandQuestionSurface(commandId, {
        intent: "slash_command",
        command: commandId,
        source: "command-surface-contract",
        reason: `validate command question surface for ${commandId}`,
      }, {
        locale,
        request: locale === "ru" ? `${commandId} пользовательский запрос` : `${commandId} user request`,
      });
      for (const item of validateQuestionSurface(surface, { surface: `${commandId}:${locale}` })) {
        issues.push({
          file: "scripts/lib/question-surface-contract.mjs",
          commandId,
          locale,
          code: item.code,
          message: item.message,
        });
      }
    }
  }
  return {
    pass: issues.length === 0,
    checked: ids.length * 2,
    issues,
  };
}

export function validateStaticQuestionSurfaceBypasses(root = process.cwd(), options = {}) {
  const files = options.files || collectQuestionSurfaceFiles(root);
  const issues = [];
  for (const file of files) {
    const rel = normalizePath(relative(root, file) || file);
    if (STATIC_BYPASS_ALLOWLIST.has(rel)) continue;
    const content = readFileSync(file, "utf8");
    for (const rule of STATIC_BYPASS_RULES) {
      if (rule.pattern.test(content)) {
        issues.push({ file: rel, code: rule.code, message: rule.message });
      }
    }
  }
  return { pass: issues.length === 0, checked: files.length, issues };
}

export function goldenAntiTemplateQuestions() {
  return [
    {
      id: "old-design-catalog",
      prompt: "Step 5/12: which creative direction should anchor this design?",
      choices: [
        { id: "operational-clarity", label: "Operational clarity", tradeoff: "Quiet and dense." },
        { id: "technical-command-center", label: "Technical command center", tradeoff: "Expert vibe." },
        { id: "premium-editorial", label: "Premium editorial", tradeoff: "Polished." },
        { id: "warm-product-utility", label: "Warm product utility", tradeoff: "Friendly." },
        { id: "bold-launch-energy", label: "Bold launch energy", tradeoff: "Memorable." },
      ],
      specialist: "creative-director",
      evidence: ["static catalog fixture"],
      artifactImpact: "Bad fixture should fail.",
      locale: "en",
    },
    {
      id: "raw-action-menu",
      prompt: "Step 1/1: choose the next step for this delivery.",
      choices: [
        { id: "approve", label: "approve", tradeoff: "raw id" },
        { id: "refine", label: "refine", tradeoff: "raw id" },
        { id: "stop", label: "stop", tradeoff: "raw id" },
      ],
      specialist: "supervibe-orchestrator",
      evidence: ["static raw ids"],
      artifactImpact: "Bad fixture should fail.",
      locale: "en",
    },
    {
      id: "generic-options",
      prompt: "Step 1/1: Which option should we choose?",
      choices: [
        { id: "a", label: "Option A", tradeoff: "generic" },
        { id: "b", label: "Option B", tradeoff: "generic" },
        { id: "c", label: "Option C", tradeoff: "generic" },
      ],
      specialist: "supervibe-orchestrator",
      evidence: ["generic options"],
      artifactImpact: "Bad fixture should fail.",
      locale: "en",
    },
  ];
}

function commandPrompt({ locale, subject, request }) {
  if (locale === "ru") {
    return `Шаг 1/1: запустить ${subject} для "${request}", сначала проверить evidence или остановиться?`;
  }
  return `Step 1/1: run ${subject} for "${request}", inspect evidence first, or stop?`;
}

function commandChoices({ locale, subject, command, specialist, hasAlternatives }) {
  if (locale === "ru") {
    return [
      {
        id: "run-routed-action",
        label: `Запустить ${subject}`,
        tradeoff: `Использует ${command} через ${specialist}; safety gates и receipts остаются обязательными.`,
        recommended: true,
      },
      {
        id: "inspect-evidence-first",
        label: `Проверить evidence для ${subject}`,
        tradeoff: "Покажет prerequisites, blockers и route evidence без мутаций.",
      },
      {
        id: "compare-nearby-routes",
        label: hasAlternatives ? `Сравнить альтернативные маршруты для ${subject}` : `Показать причину выбора ${subject}`,
        tradeoff: "Позволяет сменить intent до запуска команды, если маршрут выбран неверно.",
      },
      {
        id: "stop",
        label: `Остановить ${subject}`,
        tradeoff: "Не запускает команду и сохраняет контекст без скрытого продолжения.",
      },
    ];
  }
  return [
    {
      id: "run-routed-action",
      label: `Run ${subject}`,
      tradeoff: `Uses ${command} through ${specialist}; safety gates and receipts still apply.`,
      recommended: true,
    },
    {
      id: "inspect-evidence-first",
      label: `Inspect evidence for ${subject}`,
      tradeoff: "Shows prerequisites, blockers, and route evidence before mutations.",
    },
    {
      id: "compare-nearby-routes",
      label: hasAlternatives ? `Compare alternate routes for ${subject}` : `Show why ${subject} was selected`,
      tradeoff: "Lets the user change intent before the command runs if the route is wrong.",
    },
    {
      id: "stop",
      label: `Stop ${subject}`,
      tradeoff: "Runs no command and keeps context without hidden continuation.",
    },
  ];
}

function diagnosticChoices({ locale, subject }) {
  if (locale === "ru") {
    return [
      { id: "report-diagnostic", label: `Сообщить диагностику для ${subject}`, tradeoff: "Объясняет blocker без поиска по проекту.", recommended: true },
      { id: "show-nearest-routes", label: `Показать ближайшие маршруты для ${subject}`, tradeoff: "Дает безопасные варианты без запуска." },
      { id: "stop", label: `Остановить ${subject}`, tradeoff: "Не запускает команду и не эмулирует workflow." },
    ];
  }
  return [
    { id: "report-diagnostic", label: `Report diagnostics for ${subject}`, tradeoff: "Explains the blocker without a repo-wide search.", recommended: true },
    { id: "show-nearest-routes", label: `Show nearest routes for ${subject}`, tradeoff: "Returns safe options without running them." },
    { id: "stop", label: `Stop ${subject}`, tradeoff: "Runs no command and does not emulate the workflow." },
  ];
}

function subjectForCommand(commandId, route, locale) {
  const explicit = firstNonEmpty(route.subject, route.questionSubject, route.artifact, route.artifactName);
  if (explicit) return sanitizeVisible(explicit, 72);
  const known = COMMAND_SUBJECTS[commandId]?.[locale];
  if (known) return known;
  if (commandId) {
    const short = commandId.replace(/^\/supervibe-?/, "").replace(/-/g, " ").trim();
    return locale === "ru" ? `команда ${short || commandId}` : `${short || commandId} command`;
  }
  if (route.intent) {
    const intent = String(route.intent).replace(/_/g, " ");
    return locale === "ru" ? `маршрут ${intent}` : `${intent} route`;
  }
  return locale === "ru" ? "диагностика маршрута" : "route diagnostics";
}

function commandArtifactImpact({ locale, command, subject }) {
  if (locale === "ru") {
    return `Ответ решает, запускать ли ${command || subject}, сначала показать evidence или остановить маршрут без скрытого продолжения.`;
  }
  return `The answer decides whether ${command || subject} runs, evidence is shown first, or the route stops without hidden continuation.`;
}

function collectQuestionSurfaceFiles(root) {
  const out = [];
  for (const dir of QUESTION_SURFACE_SCAN_DIRS) {
    out.push(...walk(join(root, dir)));
  }
  return out.filter((file) => /\.(mjs|md|tpl)$/.test(file));
}

function walk(dir) {
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function normalizeCommandId(commandId = "") {
  const first = String(commandId || "").trim().split(/\s+/)[0];
  if (!first) return "";
  if (first.startsWith("/")) return first;
  if (first.startsWith("supervibe")) return `/${first}`;
  return first;
}

function normalizeLocale(locale) {
  return String(locale || "en").toLowerCase().startsWith("ru") ? "ru" : "en";
}

function detectLocale(text) {
  return /[а-яё]/i.test(String(text || "")) ? "ru" : "en";
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value !== "string" && value) return value;
  }
  return "";
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === "") return [];
  return [value];
}

function sanitizeVisible(value, maxLength = 120) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function normalizePath(path) {
  return String(path || "").split(sep).join("/");
}

function issue(code, message) {
  return { code, message };
}
