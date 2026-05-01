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

function getPostDeliveryActions(locale = 'en') {
  const normalized = normalizeLocale(locale);
  return POST_DELIVERY_ACTIONS.map((action, index) => ({
    id: action.id,
    label: action[normalized].label,
    tradeoff: action[normalized].tradeoff,
    recommended: index === 0,
  }));
}

export function buildPostDeliveryQuestion(route = {}, options = {}) {
  const locale = normalizeLocale(options.locale || detectDialogueLocale(route.nextQuestion || route.command || ''));
  return {
    prompt: locale === 'ru'
      ? 'Шаг 1/1: что делаем дальше?'
      : 'Step 1/1: what should happen next?',
    recommendation: locale === 'ru'
      ? 'Рекомендованный путь стоит первым.'
      : 'The recommended path is listed first.',
    choices: getPostDeliveryActions(locale),
    freeFormPath: locale === 'ru'
      ? 'Можно ответить своими словами, если ни один вариант не подходит.'
      : 'You can answer in your own words if none of the choices fit.',
    stopCondition: locale === 'ru'
      ? 'Остановиться: сохраню состояние и выйду без скрытого продолжения.'
      : 'Stop here: persist state and exit without hidden continuation.',
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
    const suffix = choice.recommended ? ' (recommended)' : '';
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
  const approve = /approve|approved|apply|применить|утверд|соглас/.test(lower);
  const refine = /refine|revise|revision|доработ|исправ|уточн/.test(lower);
  const alternative = /alternative|try another option|another option|другой вариант|альтернатив/.test(lower);
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
  return english || russian;
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
