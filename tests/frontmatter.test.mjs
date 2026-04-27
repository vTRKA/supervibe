import { test } from 'node:test';
import assert from 'node:assert';
import { validateFrontmatter, REQUIRED_AGENT_FIELDS, REQUIRED_SKILL_FIELDS, REQUIRED_RULE_FIELDS } from '../scripts/lib/parse-frontmatter.mjs';

test('valid agent frontmatter passes', () => {
  const data = {
    name: 'test-agent',
    namespace: '_core',
    description: 'Use WHEN reviewing code TO check correctness against project rules',
    'persona-years': 15,
    capabilities: ['code-review'],
    stacks: ['any'],
    tools: ['Read', 'Grep'],
    skills: ['evolve:code-review'],
    verification: ['npm test'],
    'anti-patterns': ['no-tests', 'large-pr'],
    version: '1.0',
    'last-verified': '2026-04-27',
    'verified-against': 'abc1234'
  };
  const result = validateFrontmatter(data, 'agent');
  assert.strictEqual(result.pass, true, JSON.stringify(result.missing));
});

test('agent missing persona-years fails', () => {
  const data = {
    name: 'test-agent',
    namespace: '_core',
    description: 'Use WHEN reviewing code TO check things',
    version: '1.0'
  };
  const result = validateFrontmatter(data, 'agent');
  assert.strictEqual(result.pass, false);
  assert.ok(result.missing.includes('persona-years'));
});

test('valid skill frontmatter passes', () => {
  const data = {
    name: 'test-skill',
    namespace: 'process',
    description: 'Use BEFORE editing files TO verify intent against requirements',
    'allowed-tools': ['Read', 'Bash'],
    phase: 'review',
    'emits-artifact': 'agent-output',
    'confidence-rubric': 'confidence-rubrics/agent-delivery.yaml',
    'gate-on-exit': true,
    version: '1.0'
  };
  const result = validateFrontmatter(data, 'skill');
  assert.strictEqual(result.pass, true);
});

test('skill missing gate-on-exit fails', () => {
  const data = {
    name: 'test-skill',
    namespace: 'process',
    description: 'Use BEFORE X TO Y',
    'allowed-tools': ['Read'],
    phase: 'review',
    version: '1.0'
  };
  const result = validateFrontmatter(data, 'skill');
  assert.strictEqual(result.pass, false);
  assert.ok(result.missing.includes('gate-on-exit'));
});

test('exports required field lists', () => {
  assert.ok(REQUIRED_AGENT_FIELDS.includes('persona-years'));
  assert.ok(REQUIRED_SKILL_FIELDS.includes('gate-on-exit'));
  assert.ok(REQUIRED_RULE_FIELDS.includes('applies-to'));
});

test('valid rule frontmatter passes', () => {
  const data = {
    name: 'test-rule',
    description: 'never use git stash',
    'applies-to': ['any'],
    version: '1.0',
    'last-verified': '2026-04-27'
  };
  const result = validateFrontmatter(data, 'rule');
  assert.strictEqual(result.pass, true);
});
