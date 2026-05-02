const DIALOGUE_CONTRACT_FIELDS = [
  'singleQuestion',
  'recommendedOption',
  'tradeoffSummary',
  'defaultBehavior',
  'freeFormPath',
  'stopCondition',
  'lifecycleState',
  'persistedStateArtifact',
  'postDeliveryActionMenu',
];

const POST_DELIVERY_ACTIONS = Object.freeze([
  {
    id: 'approve',
    en: {
      label: 'Apply',
      tradeoff: 'Recommended when the plan or delivery looks right; moves to the next state.',
    },
    ru: {
      label: 'Применить',
      tradeoff: 'Рекомендуется, если план выглядит правильно; перейду к следующему состоянию.',
    },
  },
  {
    id: 'refine',
    en: {
      label: 'Revise',
      tradeoff: 'Give one focused change; I will do one small iteration.',
    },
    ru: {
      label: 'Доработать',
      tradeoff: 'Опишите одно изменение; сделаю один короткий проход.',
    },
  },
  {
    id: 'alternative',
    en: {
      label: 'Try another option',
      tradeoff: 'I will propose a different option and explain the tradeoffs.',
    },
    ru: {
      label: 'Другой вариант',
      tradeoff: 'Предложу другой вариант и покажу компромиссы.',
    },
  },
  {
    id: 'deeper-review',
    en: {
      label: 'Review deeper',
      tradeoff: 'Run extra checks or reviewer agents before changing anything.',
    },
    ru: {
      label: 'Проверить глубже',
      tradeoff: 'Запущу дополнительные проверки или ревью перед изменениями.',
    },
  },
  {
    id: 'stop',
    en: {
      label: 'Stop here',
      tradeoff: 'Save the current state and exit without applying more changes.',
    },
    ru: {
      label: 'Остановиться',
      tradeoff: 'Сохраню текущее состояние и ничего дальше не применяю.',
    },
  },
]);

const POST_DELIVERY_CONTEXTS = Object.freeze({
  genesis_setup: {
    en: {
      prompt: 'Step 1/1: apply the Supervibe scaffold to this project, or adjust the install plan first?',
      recommendation: 'Recommended path: apply the scaffold only when the dry-run host, profile, agents, rules and files look correct.',
      freeFormPath: 'You can answer in your own words, for example: "keep Codex, but remove design agents".',
      stopCondition: 'Stop without installing: I will persist the dry-run state and make no project changes.',
      actions: {
        approve: {
          label: 'Apply scaffold',
          tradeoff: 'Write the selected host artifacts, agents, rules and skills, then run index and status checks.',
        },
        refine: {
          label: 'Adjust install plan',
          tradeoff: 'Name what to change in host, profile, add-ons or stack-pack; I will rebuild the dry-run without writing files.',
        },
        alternative: {
          label: 'Compare another set',
          tradeoff: 'Show another profile or agent set with explicit tradeoffs before any write.',
        },
        'deeper-review': {
          label: 'Review dry-run deeper',
          tradeoff: 'Run audit, confidence or status checks before applying the scaffold.',
        },
        stop: {
          label: 'Stop without installing',
          tradeoff: 'Keep the current state and exit without changing the project.',
        },
      },
    },
    ru: {
      prompt: 'Шаг 1/1: применяем Supervibe scaffold в проект или сначала меняем план установки?',
      recommendation: 'Рекомендуемый путь: применять scaffold только если dry-run, выбранный host, профиль, агенты, правила и файлы выглядят правильно.',
      freeFormPath: 'Можно ответить своими словами, например: "оставь Codex, но убери design agents".',
      stopCondition: 'Остановиться без установки: сохраню dry-run состояние и не буду менять проект.',
      actions: {
        approve: {
          label: 'Применить scaffold',
          tradeoff: 'Запишу выбранные host-артефакты, агентов, правила и скилы, затем запущу индекс и status checks.',
        },
        refine: {
          label: 'Изменить план установки',
          tradeoff: 'Укажи, что поменять в host, профиле, add-ons или stack-pack; пересоберу dry-run без записи файлов.',
        },
        alternative: {
          label: 'Сравнить другой набор',
          tradeoff: 'Покажу альтернативный профиль или набор агентов с явными компромиссами до записи файлов.',
        },
        'deeper-review': {
          label: 'Проверить dry-run глубже',
          tradeoff: 'Запущу audit, confidence или status checks перед применением scaffold.',
        },
        stop: {
          label: 'Остановиться без установки',
          tradeoff: 'Сохраню текущее состояние и выйду без изменений проекта.',
        },
      },
    },
  },
  prototype_delivery: {
    en: {
      prompt: 'Step 1/1: approve this prototype for handoff, or choose the next design step?',
      recommendation: 'Recommended path: approve only after the preview URL, declared viewports, state matrix, feedback button, and review evidence look correct.',
      freeFormPath: 'You can answer in your own words, for example: "approve desktop only, refine mobile spacing".',
      stopCondition: 'Keep draft: I will persist the current prototype state and will not create an approval marker or handoff bundle.',
      actions: {
        approve: {
          label: 'Approve prototype',
          tradeoff: 'Write the approval marker and prepare the handoff bundle for production transfer.',
        },
        refine: {
          label: 'Refine prototype',
          tradeoff: 'Name one focused change; I will run one iteration and keep the prototype in draft/review state.',
        },
        alternative: {
          label: 'Explore another direction',
          tradeoff: 'Park the current version and create a compared alternative with explicit gains and tradeoffs.',
        },
        'deeper-review': {
          label: 'Run deeper review',
          tradeoff: 'Run additional UI, accessibility, token, or viewport checks before changing approval state.',
        },
        stop: {
          label: 'Keep draft',
          tradeoff: 'Save the current state and exit without approval or handoff.',
        },
      },
    },
    ru: {
      prompt: 'Шаг 1/1: утверждаем прототип для handoff или выбираем следующий дизайн-шаг?',
      recommendation: 'Рекомендуемый путь: утверждать только если preview URL, viewports, state matrix, feedback button и review evidence выглядят корректно.',
      freeFormPath: 'Можно ответить своими словами, например: "утвердить desktop, но доработать mobile spacing".',
      stopCondition: 'Оставить draft: сохраню текущее состояние прототипа и не создам approval marker или handoff bundle.',
      actions: {
        approve: {
          label: 'Утвердить прототип',
          tradeoff: 'Запишу approval marker и подготовлю handoff bundle для production transfer.',
        },
        refine: {
          label: 'Доработать прототип',
          tradeoff: 'Укажи одно точечное изменение; сделаю один проход и оставлю прототип в draft/review.',
        },
        alternative: {
          label: 'Показать другое направление',
          tradeoff: 'Сохраню текущую версию и создам сравнимую альтернативу с явными плюсами и компромиссами.',
        },
        'deeper-review': {
          label: 'Проверить прототип глубже',
          tradeoff: 'Запущу дополнительные UI, accessibility, token или viewport проверки до изменения approval state.',
        },
        stop: {
          label: 'Оставить draft',
          tradeoff: 'Сохраню текущее состояние и выйду без утверждения или handoff.',
        },
      },
    },
  },
  requirements_delivery: {
    en: {
      prompt: 'Step 1/1: approve this requirements package for planning, or choose the next analysis step?',
      recommendation: 'Recommended path: approve only when scope, acceptance criteria, edge cases, state model, and traceability are reviewable.',
      freeFormPath: 'You can answer in your own words, for example: "approve scope, but add billing edge cases".',
      stopCondition: 'Keep as draft: I will persist the current package and will not route it into planning.',
      actions: {
        approve: {
          label: 'Approve requirements',
          tradeoff: 'Mark the package ready for planning or implementation handoff.',
        },
        refine: {
          label: 'Revise requirements',
          tradeoff: 'Name one ambiguity, edge case, or acceptance criterion to tighten before approval.',
        },
        alternative: {
          label: 'Compare another scope',
          tradeoff: 'Produce a smaller, larger, or safer scope variant with explicit tradeoffs.',
        },
        'deeper-review': {
          label: 'Review risks deeper',
          tradeoff: 'Run another pass over edge cases, non-functional risks, traceability, or stakeholder gaps.',
        },
        stop: {
          label: 'Keep as draft',
          tradeoff: 'Save the package and exit without planning handoff.',
        },
      },
    },
    ru: {
      prompt: 'Шаг 1/1: утверждаем требования для планирования или выбираем следующий аналитический шаг?',
      recommendation: 'Рекомендуемый путь: утверждать только если scope, acceptance criteria, edge cases, state model и traceability готовы к review.',
      freeFormPath: 'Можно ответить своими словами, например: "утвердить scope, но добавить billing edge cases".',
      stopCondition: 'Оставить draft: сохраню текущий пакет и не передам его в планирование.',
      actions: {
        approve: {
          label: 'Утвердить требования',
          tradeoff: 'Помечу пакет готовым для planning или implementation handoff.',
        },
        refine: {
          label: 'Уточнить требования',
          tradeoff: 'Укажи одну неоднозначность, edge case или acceptance criterion для доработки перед approval.',
        },
        alternative: {
          label: 'Сравнить другой scope',
          tradeoff: 'Подготовлю меньший, больший или более безопасный вариант scope с явными компромиссами.',
        },
        'deeper-review': {
          label: 'Проверить риски глубже',
          tradeoff: 'Сделаю еще один проход по edge cases, non-functional risks, traceability или stakeholder gaps.',
        },
        stop: {
          label: 'Оставить draft',
          tradeoff: 'Сохраню пакет и выйду без handoff в планирование.',
        },
      },
    },
  },
});

function getPostDeliveryActions(locale = 'en', context = null) {
  const normalized = normalizeLocale(locale);
  const contextActions = context?.[normalized]?.actions || {};
  return POST_DELIVERY_ACTIONS.map((action, index) => ({
    id: action.id,
    label: (contextActions[action.id] || action[normalized]).label,
    tradeoff: (contextActions[action.id] || action[normalized]).tradeoff,
    recommended: index === 0,
  }));
}

function resolvePostDeliveryContext(route = {}, options = {}) {
  const explicitContext = String(options.context || route.intent || '').trim();
  const command = String(route.command || '');
  const contextId = POST_DELIVERY_CONTEXTS[explicitContext]
    ? explicitContext
    : command.includes('/supervibe-genesis')
      ? 'genesis_setup'
      : null;
  const context = contextId ? POST_DELIVERY_CONTEXTS[contextId] : null;
  return context ? { ...context, id: contextId } : null;
}

function contextCopy(context, locale, field, fallback) {
  return context?.[locale]?.[field] || fallback;
}

export function buildPostDeliveryQuestion(route = {}, options = {}) {
  const locale = normalizeLocale(options.locale || detectDialogueLocale(route.nextQuestion || route.command || ''));
  const context = resolvePostDeliveryContext(route, options);
  return {
    prompt: contextCopy(context, locale, 'prompt', locale === 'ru'
      ? 'Шаг 1/1: выберите следующий шаг для результата.'
      : 'Step 1/1: choose the next step for this delivery.'),
    recommendation: contextCopy(context, locale, 'recommendation', locale === 'ru'
      ? 'Рекомендуемый путь указан первым.'
      : 'The recommended path is listed first.'),
    choices: getPostDeliveryActions(locale, context),
    freeFormPath: contextCopy(context, locale, 'freeFormPath', locale === 'ru'
      ? 'Можно ответить своими словами, если ни один вариант не подходит.'
      : 'You can answer in your own words if none of the choices fit.'),
    stopCondition: contextCopy(context, locale, 'stopCondition', locale === 'ru'
      ? 'Остановиться: сохраню состояние и выйду без скрытого продолжения.'
      : 'Stop here: persist state and exit without hidden continuation.'),
    context: context?.id || null,
    locale,
  };
}

export function buildTransparentStepQuestion({
  step = 1,
  total = 1,
  question,
  why,
  decision,
  assumption,
  choices = [],
  locale = 'en',
} = {}) {
  const normalized = normalizeLocale(locale);
  return {
    prompt: normalized === 'ru'
      ? `Шаг ${step}/${total}: ${question || 'что выбираем?'}`
      : `Step ${step}/${total}: ${question || 'what should we choose?'}`,
    why: why || (normalized === 'ru' ? 'Этот ответ влияет на следующий шаг.' : 'This answer changes the next step.'),
    decision: decision || (normalized === 'ru' ? 'Зафиксирую выбранное решение в состоянии.' : 'I will record the selected decision in state.'),
    assumption: assumption || (normalized === 'ru' ? 'Если пропустить, использую рекомендуемый безопасный вариант.' : 'If skipped, I will use the recommended safe default.'),
    choices: choices.map((choice, index) => ({
      ...choice,
      recommended: choice.recommended ?? index === 0,
    })),
    locale: normalized,
  };
}

export function formatTransparentStepQuestion(question) {
  const lines = [
    `**${question.prompt}**`,
    '',
    `Why: ${question.why}`,
    `Decision unlocked: ${question.decision}`,
    `If skipped: ${question.assumption}`,
    '',
  ];
  for (const choice of question.choices || []) {
    const suffix = choice.recommended ? (question.locale === 'ru' ? ' (рекомендуется)' : ' (recommended)') : '';
    lines.push(`- ${choice.label}${suffix} - ${choice.tradeoff || choice.description || 'No tradeoff provided.'}`);
  }
  return lines.join('\n');
}

export function formatPostDeliveryQuestion(question) {
  const lines = [
    `**${question.prompt}**`,
    '',
    question.recommendation,
    '',
  ];
  for (const choice of question.choices || []) {
    const suffix = choice.recommended ? (question.locale === 'ru' ? ' (рекомендуется)' : ' (recommended)') : '';
    lines.push(`- ${choice.label}${suffix} - ${choice.tradeoff}`);
  }
  lines.push('', question.freeFormPath, question.stopCondition);
  return lines.join('\n');
}

export function validateDialogueContract({ path = '', content = '', delivery = false } = {}) {
  const issues = [];
  const text = String(content || '');
  const isCommand = normalizePath(path).startsWith('commands/');
  const interactiveLabel = isCommand ? 'interactive command' : 'interactive artifact';

  if (!hasSingleQuestion(text)) {
    issues.push(issue('single-question', `${interactiveLabel} missing single-question contract`));
  }
  if (!/recommended|рекоменд|default|по умолчанию/i.test(text)) {
    issues.push(issue('recommended-option', `${interactiveLabel} missing recommended option`));
  }
  if (!/trade-?off|rationale|компромисс|one-line rationale|gives up|gain|выигрыш|цена/i.test(text)) {
    issues.push(issue('tradeoff-summary', `${interactiveLabel} missing tradeoff summary`));
  }
  if (!/free[- ]form|свободн|произвольн/i.test(text)) {
    issues.push(issue('free-form-path', `${interactiveLabel} missing free-form path`));
  }
  if (!/stop|стоп|abort|cancel|останов/i.test(text)) {
    issues.push(issue('stop-condition', `${interactiveLabel} missing stop condition`));
  }

  if (delivery) {
    if (!/lifecycle|draft|review|approved|handoff|state|состояни|detected|applied|verified/i.test(text)) {
      issues.push(issue('lifecycle-state', `${interactiveLabel} missing lifecycle state`));
    }
    if (!/state artifact|persist|save|\.approval\.json|state\.json|\.json|артефакт/i.test(text)) {
      issues.push(issue('persisted-state-artifact', `${interactiveLabel} missing persisted state artifact`));
    }
    if (!hasPostDeliveryMenu(text)) {
      issues.push(issue('post-delivery-action-menu', `${interactiveLabel} missing post-delivery action menu`));
    }
    if (!hasBeginnerFriendlyActionLabels(text)) {
      issues.push(issue('beginner-friendly-action-labels', `${interactiveLabel} missing beginner-friendly post-delivery action labels`));
    }
    if (hasRawActionIdMenu(text)) {
      issues.push(issue('raw-action-id-menu', `${interactiveLabel} exposes raw approve/refine/alternative action ids as user-facing labels`));
    }
  }

  return issues;
}

function dialogueContractMarkdown({
  lifecycle = 'draft -> review -> approved -> handoff',
  stateArtifact = '.supervibe/state.json',
} = {}) {
  return [
    '## Shared Dialogue Contract',
    '',
    `Lifecycle: ${lifecycle}. Persist state at \`${stateArtifact}\`.`,
    '',
    'Every interactive step asks one question at a time using `Step N/M` or `Шаг N/M`.',
    'Each question lists the recommended/default option first, gives a one-line tradeoff summary for every option, allows a free-form answer, and names the stop condition.',
    '',
    'After every material delivery, ask one explicit next-step question. Use language-matched, outcome-oriented labels; keep internal ids only in saved state.',
    '- Apply / Применить - recommended when the plan or delivery looks right; move to the next lifecycle state.',
    '- Revise / Доработать - user gives one focused change; apply one iteration.',
    '- Try another option / Другой вариант - produce another option with explicit tradeoffs.',
    '- Review deeper / Проверить глубже - run the relevant review/check agents or validators before changing anything.',
    '- Stop here / Остановиться - persist current state and exit without claiming silent completion.',
  ].join('\n');
}

function hasSingleQuestion(text) {
  return /one question at a time|ask exactly one question|ask one question|single-question|Шаг N\/M|Step N\/M|Шаг \d+\/\d+|Step \d+\/\d+/i.test(text);
}

function hasPostDeliveryMenu(text) {
  const lower = text.toLowerCase();
  const approve = /approve|approved|apply|apply scaffold|применить|утверд|соглас/.test(lower);
  const refine = /refine|revise|revision|adjust [a-z -]*plan|adjust [a-z -]*diff|доработ|изменить [а-яa-z -]*(план|diff)|исправ|уточн/.test(lower);
  const alternative = /alternative|try another option|another option|compare another|другой вариант|сравнить друг|альтернатив/.test(lower);
  const stop = /stop|stop here|останов|стоп/.test(lower);
  return approve && refine && alternative && stop;
}

function hasBeginnerFriendlyActionLabels(text) {
  const lower = text.toLowerCase();
  const english = /apply/.test(lower) &&
    /revise/.test(lower) &&
    /try another option/.test(lower) &&
    /review deeper/.test(lower) &&
    /stop here/.test(lower);
  const russian = /применить/.test(lower) &&
    /доработать/.test(lower) &&
    /другой вариант/.test(lower) &&
    /проверить глубже/.test(lower) &&
    /остановиться/.test(lower);
  const domainSpecific = /(apply|approve|применить|утверд)[^\n]*(scaffold|adaptation|strengthening|design|prototype|requirements|scope|адаптац|усилен|дизайн|прототип|требован)/.test(lower) &&
    /(adjust|revise|refine|изменить|доработ|уточнить)[^\n]*(plan|diff|design|prototype|requirements|scope|план|адаптац|усилен|дизайн|прототип|требован|scope)/.test(lower) &&
    /(compare another|explore another|another direction|сравнить друг|другое направ)/.test(lower) &&
    /(review|run deeper|проверить)[^\n]*(deeper|глубже|dry-run|adaptation|strengthening|design|prototype|risk|риски|прототип|адаптац|усилен|дизайн)/.test(lower) &&
    /(stop|keep|оставить|останов)[^\n]*(without|save|install|adapt|strengthen|state|draft|без|сохран)/.test(lower);
  return english || russian || domainSpecific;
}

function hasRawActionIdMenu(text) {
  return /(?:^|\n)\s*-\s*Approve\s*[-\u2013\u2014]/.test(text) ||
    /(?:^|\n)\s*-\s*Refine\s*[-\u2013\u2014]/.test(text) ||
    /(?:^|\n)\s*-\s*Alternative\s*[-\u2013\u2014]/.test(text) ||
    /(?:^|\n)\s*-\s*Deeper review\s*[-\u2013\u2014]/.test(text) ||
    /approve\/refine\/alternative(?:\/deeper-review)?\/stop/i.test(text);
}

function detectDialogueLocale(text) {
  return /[а-яё]/i.test(String(text || '')) ? 'ru' : 'en';
}

function normalizeLocale(locale) {
  return String(locale || 'en').toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

function normalizePath(path) {
  return String(path || '').replace(/\\/g, '/');
}

function issue(code, message) {
  return { code, message };
}
