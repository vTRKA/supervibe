import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAgentDiscipline, isInScope } from '../scripts/validate-question-discipline.mjs';

test('isInScope true for product agent', () => {
  assert.equal(isInScope('agents/_product/systems-analyst.md'), true);
});

test('isInScope true for windows path separators', () => {
  assert.equal(isInScope('agents\\_product\\systems-analyst.md'), true);
});

test('isInScope false for code-reviewer (not in applies-to)', () => {
  assert.equal(isInScope('agents/_core/code-reviewer.md'), false);
});

test('agent without discipline section fails', () => {
  const issues = checkAgentDiscipline(
    'agents/_product/systems-analyst.md',
    {},
    '## Persona\nfoo\n## Procedure\n1. Ask user.\n'
  );
  assert.ok(issues.length > 0);
});

test('agent with discipline section passes', () => {
  const body = `## User dialogue discipline\nШаг N/M format used.\n## Anti-patterns\n- asking-multiple-questions-at-once\n`;
  const issues = checkAgentDiscipline('agents/_product/systems-analyst.md', {}, body);
  assert.equal(issues.length, 0);
});

test('noninteractive frontmatter override skips check', () => {
  const issues = checkAgentDiscipline(
    'agents/_meta/evolve-orchestrator.md',
    { dialogue: 'noninteractive' },
    ''
  );
  assert.equal(issues.length, 0);
});

test('agent NOT in applies-to scope is skipped', () => {
  const issues = checkAgentDiscipline('agents/_core/code-reviewer.md', {}, '');
  assert.equal(issues.length, 0);
});
