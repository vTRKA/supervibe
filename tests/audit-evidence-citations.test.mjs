import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateUsage, detectViolations } from '../scripts/audit-evidence-citations.mjs';

const fixture = (overrides = {}) => ({
  agent_id: 'foo-developer',
  task_summary: 'do thing',
  confidence_score: 9,
  override: false,
  subtool_usage: { memory: 0, 'code-search': 0, 'code-graph': 0 },
  ...overrides,
});

test('aggregateUsage computes per-agent rates', () => {
  const entries = [
    fixture({ subtool_usage: { memory: 1, 'code-search': 1, 'code-graph': 0 } }),
    fixture({ subtool_usage: { memory: 1, 'code-search': 0, 'code-graph': 0 } }),
    fixture({ subtool_usage: { memory: 0, 'code-search': 1, 'code-graph': 0 } }),
    fixture({ subtool_usage: { memory: 0, 'code-search': 0, 'code-graph': 0 } }),
  ];
  const usage = aggregateUsage(entries, 10);
  assert.equal(usage.length, 1);
  assert.equal(usage[0].sample, 4);
  assert.equal(usage[0].memoryRate, 0.5);
  assert.equal(usage[0].codeSearchRate, 0.5);
  assert.equal(usage[0].codeGraphRate, 0);
});

test('aggregateUsage windows to last N', () => {
  const entries = Array.from({ length: 20 }, (_, i) =>
    fixture({ subtool_usage: { memory: i < 10 ? 0 : 1, 'code-search': 0, 'code-graph': 0 } })
  );
  const usage = aggregateUsage(entries, 10);
  // last 10 all have memory=1
  assert.equal(usage[0].memoryRate, 1.0);
});

test('detectViolations flags low-memory-usage', () => {
  const usage = [{
    agent_id: 'foo-developer',
    sample: 10,
    memoryRate: 0.1,
    codeSearchRate: 0.7,
    codeGraphRate: 0,
  }];
  const violations = detectViolations(usage);
  assert.ok(violations.some(v => v.kind === 'low-memory-usage'));
});

test('detectViolations skips design agents (memory less critical)', () => {
  const usage = [{
    agent_id: 'creative-director',
    sample: 10,
    memoryRate: 0.0,
    codeSearchRate: 0.0,
    codeGraphRate: 0,
  }];
  const violations = detectViolations(usage);
  assert.equal(violations.length, 0);
});

test('detectViolations flags refactor agent without graph', () => {
  const usage = [{
    agent_id: 'refactoring-specialist',
    sample: 10,
    memoryRate: 0.5,
    codeSearchRate: 0.6,
    codeGraphRate: 0.3,
  }];
  const violations = detectViolations(usage);
  assert.ok(violations.some(v => v.kind === 'refactor-without-graph'));
});

test('detectViolations respects min-sample', () => {
  const usage = [{
    agent_id: 'tiny-dev',
    sample: 3,  // below default minSample 5
    memoryRate: 0.0,
    codeSearchRate: 0.0,
    codeGraphRate: 0,
  }];
  const violations = detectViolations(usage);
  assert.equal(violations.length, 0);
});
