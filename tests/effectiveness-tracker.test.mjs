import { test } from 'node:test';
import assert from 'node:assert';
import { aggregateForAgent } from '../scripts/effectiveness-tracker.mjs';

test('aggregateForAgent: computes iterations + avg-confidence + override-rate', () => {
  const invs = [
    { ts: '2026-01-01T10:00:00Z', confidence_score: 9, override: false, user_feedback: 'accept', task_summary: 'task1' },
    { ts: '2026-01-02T10:00:00Z', confidence_score: 7, override: true, user_feedback: 'partial', task_summary: 'task2' },
    { ts: '2026-01-03T10:00:00Z', confidence_score: 10, override: false, user_feedback: 'accept', task_summary: 'task3' },
  ];
  const eff = aggregateForAgent(invs);
  assert.strictEqual(eff.iterations, 3);
  assert.strictEqual(eff['avg-confidence'], 8.67);
  assert.ok(Math.abs(eff['override-rate'] - 0.333) < 0.001);
  assert.strictEqual(eff['last-task'], 'task3');
});

test('aggregateForAgent: returns null for empty list', () => {
  assert.strictEqual(aggregateForAgent([]), null);
});

test('aggregateForAgent: last-outcome defaults to accept when score >= 9', () => {
  const invs = [{ ts: '2026-01-01T10:00:00Z', confidence_score: 9.5, task_summary: 't' }];
  const eff = aggregateForAgent(invs);
  assert.strictEqual(eff['last-outcome'], 'accept');
});

test('aggregateForAgent: last-outcome is review when score < 9', () => {
  const invs = [{ ts: '2026-01-01T10:00:00Z', confidence_score: 8, task_summary: 't' }];
  const eff = aggregateForAgent(invs);
  assert.strictEqual(eff['last-outcome'], 'review');
});
