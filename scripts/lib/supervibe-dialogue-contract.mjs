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
    'After every material delivery, ask one explicit next-step question with choices:',
    '- Approve - accept this delivery and move to the next lifecycle state.',
    '- Refine - user gives one focused change; apply one iteration.',
    '- Alternative - produce another option with explicit tradeoffs.',
    '- Deeper review - run the relevant review/check agents or validators.',
    '- Stop - persist current state and exit without claiming silent completion.',
  ].join('\n');
}

function hasSingleQuestion(text) {
  return /one question at a time|ask exactly one question|ask one question|single-question|Шаг N\/M|Step N\/M|Шаг \d+\/\d+|Step \d+\/\d+/i.test(text);
}

function hasPostDeliveryMenu(text) {
  const lower = text.toLowerCase();
  const approve = /approve|approved|утверд|✅/.test(lower);
  const refine = /refine|revision|доработ|✎/.test(lower);
  const alternative = /alternative|альтернатив|🔀/.test(lower);
  const stop = /stop|стоп|🛑/.test(lower);
  return approve && refine && alternative && stop;
}

function normalizePath(path) {
  return String(path || '').replace(/\\/g, '/');
}

function issue(code, message) {
  return { code, message };
}
