import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  buildPostDeliveryQuestion,
  formatPostDeliveryQuestion,
  validateDialogueContract,
} from '../scripts/lib/supervibe-dialogue-contract.mjs';
import { collectDisciplineFiles } from '../scripts/validate-question-discipline.mjs';

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
  const question = buildPostDeliveryQuestion({ nextQuestion: 'Следующий шаг - применить dry-run?' });
  const labels = question.choices.map((choice) => choice.label);

  assert.deepEqual(labels, ['Применить', 'Доработать', 'Другой вариант', 'Проверить глубже', 'Остановиться']);
  assert.equal(question.choices[0].recommended, true);
  assert.ok(question.choices.every((choice) => choice.label !== choice.id), 'visible labels must not equal internal ids');
  assert.match(formatPostDeliveryQuestion(question), /Рекомендованный путь стоит первым/);
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

test('question discipline validator inspects commands and skills directories', async () => {
  const files = await collectDisciplineFiles(process.cwd());
  const relPaths = files.map((file) => file.relPath.replace(/\\/g, '/'));

  assert.ok(relPaths.some((path) => path.startsWith('commands/')), 'validator did not inspect commands directory');
  assert.ok(relPaths.some((path) => path.startsWith('skills/')), 'validator did not inspect skills directory');
  assert.ok(relPaths.some((path) => path.startsWith('rules/')), 'validator did not inspect dialogue rules');
});
