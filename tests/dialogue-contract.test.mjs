import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  buildPostDeliveryQuestion,
  buildTransparentStepQuestion,
  formatPostDeliveryQuestion,
  formatTransparentStepQuestion,
  validateDialogueContract,
} from '../scripts/lib/supervibe-dialogue-contract.mjs';
import { validateDialogueUx } from '../scripts/validate-dialogue-ux.mjs';
import { checkAgentDiscipline, collectDisciplineFiles } from '../scripts/validate-question-discipline.mjs';

test('dialogue contract reports missing single-question shape', () => {
  const issues = validateDialogueContract({
    path: 'commands/example.md',
    content: '# Example\nAsk users for setup details and continue.',
    delivery: true,
  });

  assert.ok(
    issues.some((issue) => issue.message === 'interactive command missing single-question contract'),
    `expected single-question contract issue; got ${JSON.stringify(issues)}`
  );
});

test('design and genesis command docs satisfy shared delivery dialogue contract', async () => {
  const design = await readFile('commands/supervibe-design.md', 'utf8');
  const genesis = await readFile('commands/supervibe-genesis.md', 'utf8');

  assert.deepEqual(validateDialogueContract({ path: 'commands/supervibe-design.md', content: design, delivery: true }), []);
  assert.deepEqual(validateDialogueContract({ path: 'commands/supervibe-genesis.md', content: genesis, delivery: true }), []);
});

test('genesis skill records state artifact and post-delivery menu', async () => {
  const genesisSkill = await readFile('skills/genesis/SKILL.md', 'utf8');
  const issues = validateDialogueContract({
    path: 'skills/genesis/SKILL.md',
    content: genesisSkill,
    delivery: true,
  });

  assert.deepEqual(issues, []);
});

test('post-delivery question uses beginner-friendly labels instead of raw ids', () => {
  const question = buildPostDeliveryQuestion({
    intent: 'delivery_control',
    nextQuestion: 'Следующий шаг - применить dry-run?',
  });
  const labels = question.choices.map((choice) => choice.label);

  assert.deepEqual(labels, ['Применить', 'Доработать', 'Другой вариант', 'Проверить глубже', 'Остановиться']);
  assert.equal(question.choices[0].recommended, true);
  assert.ok(question.choices.every((choice) => choice.label !== choice.id), 'visible labels must not equal internal ids');
  assert.match(formatPostDeliveryQuestion(question), /Рекомендуемый путь указан первым/);
});

test('genesis post-delivery question is scaffold-specific, not a generic next-step menu', () => {
  const question = buildPostDeliveryQuestion({
    intent: 'genesis_setup',
    command: '/supervibe-genesis',
    nextQuestion: 'Следующий шаг - применить dry-run?',
  });
  const labels = question.choices.map((choice) => choice.label);
  const formatted = formatPostDeliveryQuestion(question);

  assert.equal(question.context, 'genesis_setup');
  assert.equal(question.prompt, 'Шаг 1/1: применяем Supervibe scaffold в проект или сначала меняем план установки?');
  assert.doesNotMatch(question.prompt, /что делаем дальше/i);
  assert.deepEqual(labels, [
    'Применить scaffold',
    'Изменить план установки',
    'Сравнить другой набор',
    'Проверить dry-run глубже',
    'Остановиться без установки',
  ]);
  assert.match(formatted, /Применить scaffold \(рекомендуется\)/);
  assert.doesNotMatch(formatted, /Применить \(recommended\)/);
});

test('prototype post-delivery question uses prototype-specific actions', () => {
  const question = buildPostDeliveryQuestion({
    intent: 'prototype_delivery',
    nextQuestion: 'Prototype review',
  });
  const labels = question.choices.map((choice) => choice.label);

  assert.equal(question.context, 'prototype_delivery');
  assert.deepEqual(labels, [
    'Approve prototype',
    'Refine prototype',
    'Explore another direction',
    'Run deeper review',
    'Keep draft',
  ]);
  assert.match(formatPostDeliveryQuestion(question), /Approve prototype \(recommended\)/);
});

test('requirements post-delivery question uses requirements-specific actions', () => {
  const question = buildPostDeliveryQuestion({
    intent: 'requirements_delivery',
    nextQuestion: 'Requirements review',
  });
  const labels = question.choices.map((choice) => choice.label);

  assert.equal(question.context, 'requirements_delivery');
  assert.deepEqual(labels, [
    'Approve requirements',
    'Revise requirements',
    'Compare another scope',
    'Review risks deeper',
    'Keep as draft',
  ]);
  assert.match(formatPostDeliveryQuestion(question), /Approve requirements \(recommended\)/);
});

test('adaptation, strengthening and design post-delivery contexts localize visible labels', () => {
  const adaptation = buildPostDeliveryQuestion({ intent: 'adaptation_delivery' }, { locale: 'ru' });
  assert.equal(adaptation.context, 'adaptation_delivery');
  assert.deepEqual(adaptation.choices.map((choice) => choice.label), [
    'Применить адаптацию',
    'Изменить план адаптации',
    'Сравнить другой scope',
    'Проверить адаптацию глубже',
    'Остановиться без адаптации',
  ]);
  assert.match(formatPostDeliveryQuestion(adaptation), /Применить адаптацию \(рекомендуется\)/);
  assert.doesNotMatch(formatPostDeliveryQuestion(adaptation), /Apply adaptation/);

  const strengthening = buildPostDeliveryQuestion({ intent: 'strengthening_delivery' }, { locale: 'en' });
  assert.equal(strengthening.context, 'strengthening_delivery');
  assert.deepEqual(strengthening.choices.map((choice) => choice.label), [
    'Apply strengthening',
    'Adjust strengthening diff',
    'Compare another approach',
    'Review strengthening deeper',
    'Stop without strengthening',
  ]);

  const design = buildPostDeliveryQuestion({ intent: 'design_delivery' }, { locale: 'ru' });
  assert.equal(design.context, 'design_delivery');
  assert.deepEqual(design.choices.map((choice) => choice.label), [
    'Утвердить дизайн',
    'Доработать дизайн',
    'Сравнить другое направление',
    'Проверить дизайн глубже',
    'Остановиться и сохранить дизайн',
  ]);
  assert.doesNotMatch(formatPostDeliveryQuestion(design), /Approve design/);
});

test('transparent step questions expose why, decision, and skip assumption', () => {
  const question = buildTransparentStepQuestion({
    step: 2,
    total: 3,
    question: 'Which install profile should genesis use?',
    why: 'The profile controls which agents, rules and skills are copied.',
    decision: 'This selects the dry-run artifact set.',
    assumption: 'If skipped, use minimal with no add-ons.',
    choices: [
      { label: 'minimal', tradeoff: 'Smallest safe setup.' },
      { label: 'full-stack', tradeoff: 'More coverage, more files.' },
    ],
  });
  const formatted = formatTransparentStepQuestion(question);

  assert.match(formatted, /Why:/);
  assert.match(formatted, /Decision unlocked:/);
  assert.match(formatted, /If skipped:/);
  assert.match(formatted, /minimal \(recommended\)/);
});

test('dialogue contract rejects raw action-id delivery menus', () => {
  const issues = validateDialogueContract({
    path: 'commands/example.md',
    delivery: true,
    content: [
      'Lifecycle: draft -> review. Persist state at `.supervibe/state.json`.',
      'Every interactive step asks one question at a time using `Step N/M`.',
      'The recommended/default option is first. Free-form answers are accepted. Stop condition is documented.',
      'Each option has a tradeoff summary.',
      '- Approve - accept this delivery.',
      '- Refine - change one thing.',
      '- Alternative - produce another option.',
      '- Deeper review - run checks.',
      '- Stop - persist state.',
    ].join('\n'),
  });

  assert.ok(issues.some((issue) => issue.code === 'raw-action-id-menu'), JSON.stringify(issues));
  assert.ok(issues.some((issue) => issue.code === 'beginner-friendly-action-labels'), JSON.stringify(issues));
});

test('question discipline rejects hardcoded English recommended marker in localized templates', () => {
  const issues = checkAgentDiscipline('agents/_core/repo-researcher.md', {}, [
    '## User dialogue discipline',
    'When this agent must clarify with the user, ask one question per message and use outcome-oriented labels.',
    '> **Step N/M:** <one focused question>',
    '> - <Recommended action> (recommended) - <what happens and what it costs>',
    '',
    '## Anti-patterns',
    '- `asking-multiple-questions-at-once`',
  ].join('\n'));

  assert.ok(
    issues.some((issue) => issue.code === 'hardcoded-english-recommended-marker'),
    JSON.stringify(issues)
  );
});

test('dialogue UX validator rejects dry next-step handoff prompts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'supervibe-dialogue-ux-'));
  await mkdir(join(root, 'commands'), { recursive: true });
  await mkdir(join(root, 'agents'), { recursive: true });
  await mkdir(join(root, 'rules'), { recursive: true });
  await mkdir(join(root, 'scripts', 'lib'), { recursive: true });
  await mkdir(join(root, 'skills'), { recursive: true });
  await mkdir(join(root, 'templates'), { recursive: true });
  await writeFile(join(root, 'commands', 'bad.md'), 'Question: Next step - write the plan. Proceed?\n', 'utf8');

  const result = await validateDialogueUx(root);

  assert.equal(result.pass, false);
  assert.ok(result.issues.some((issue) => issue.code === 'stale-next-step-handoff'), JSON.stringify(result.issues));
});

test('dialogue UX validator rejects mixed-language visible action menus', async () => {
  const root = await mkdtemp(join(tmpdir(), 'supervibe-dialogue-mixed-locale-'));
  await mkdir(join(root, 'skills', 'bad-flow'), { recursive: true });
  await writeFile(join(root, 'skills', 'bad-flow', 'SKILL.md'), [
    '## Shared Dialogue Contract',
    'Every interactive step asks one question at a time using `Step N/M`.',
    '- Apply adaptation / Применить адаптацию - recommended when the dry-run looks right.',
  ].join('\n'), 'utf8');

  const result = await validateDialogueUx(root);

  assert.equal(result.pass, false);
  assert.ok(result.issues.some((issue) => issue.code === 'mixed-language-visible-action-menu'), JSON.stringify(result.issues));
});

test('dialogue UX validator passes current tracked dialogue surfaces', async () => {
  const result = await validateDialogueUx(process.cwd());

  assert.deepEqual(result.issues, []);
  assert.equal(result.pass, true);
});

test('question discipline validator inspects commands and skills directories', async () => {
  const files = await collectDisciplineFiles(process.cwd());
  const relPaths = files.map((file) => file.relPath.replace(/\\/g, '/'));

  assert.ok(relPaths.some((path) => path.startsWith('commands/')), 'validator did not inspect commands directory');
  assert.ok(relPaths.some((path) => path.startsWith('skills/')), 'validator did not inspect skills directory');
  assert.ok(relPaths.some((path) => path.startsWith('rules/')), 'validator did not inspect dialogue rules');
});
