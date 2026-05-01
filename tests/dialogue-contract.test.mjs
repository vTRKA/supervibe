import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { validateDialogueContract } from '../scripts/lib/supervibe-dialogue-contract.mjs';
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

test('question discipline validator inspects commands and skills directories', async () => {
  const files = await collectDisciplineFiles(process.cwd());
  const relPaths = files.map((file) => file.relPath.replace(/\\/g, '/'));

  assert.ok(relPaths.some((path) => path.startsWith('commands/')), 'validator did not inspect commands directory');
  assert.ok(relPaths.some((path) => path.startsWith('skills/')), 'validator did not inspect skills directory');
  assert.ok(relPaths.some((path) => path.startsWith('rules/')), 'validator did not inspect dialogue rules');
});
