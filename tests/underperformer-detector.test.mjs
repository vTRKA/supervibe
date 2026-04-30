import { test } from 'node:test';
import assert from 'node:assert';
import { detectUnderperformers } from '../scripts/lib/underperformer-detector.mjs';

const fakeInvocations = (agent_id, scores, overrides = []) =>
  scores.map((s, i) => ({
    agent_id,
    confidence_score: s,
    override: overrides[i] ?? false,
    ts: new Date(Date.now() - (scores.length - i) * 86400000).toISOString(),
  }));

test('detectUnderperformers: flags agents with avg < 8.5 over last 10', () => {
  const allInv = [
    ...fakeInvocations('good-agent', [9, 9.5, 9.2, 9.7, 9.8, 9.1, 9.3, 9.5, 9.6, 9.4]),
    ...fakeInvocations('bad-agent', [7, 8, 7.5, 8.2, 7.8, 7, 8, 8.4, 7.9, 8.1]),
  ];
  const flagged = detectUnderperformers(allInv);
  const ids = flagged.map(f => f.agent_id);
  assert.ok(ids.includes('bad-agent'), `expected bad-agent flagged; got ${ids.join(',')}`);
  assert.ok(!ids.includes('good-agent'));
});

test('detectUnderperformers: flags rising override-rate trend', () => {
  const overrides = [false, false, false, false, false, true, true, true, true, true];
  const scores = [9.5, 9.5, 9.5, 9.5, 9.5, 9.5, 9.5, 9.5, 9.5, 9.5];
  const inv = fakeInvocations('drift-agent', scores, overrides);
  const flagged = detectUnderperformers(inv);
  const ids = flagged.map(f => f.agent_id);
  assert.ok(ids.includes('drift-agent'),
    `expected drift detected via override trend; flagged: ${ids.join(',')}`);
});

test('detectUnderperformers: needs at least 10 invocations to flag', () => {
  const inv = fakeInvocations('newbie', [5, 5, 5, 5]);
  const flagged = detectUnderperformers(inv);
  assert.ok(!flagged.find(f => f.agent_id === 'newbie'),
    'should not flag agents with < 10 invocations');
});

test('detectUnderperformers: ignores unknown agents when knownAgentIds provided', () => {
  const allInv = [
    ...fakeInvocations('real-agent', [9, 9, 9, 9, 9, 9, 9, 9, 9, 9]),
    ...fakeInvocations('test-agent', [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]),
  ];
  const flagged = detectUnderperformers(allInv, { knownAgentIds: new Set(['real-agent']) });
  assert.deepEqual(flagged, []);
});

test('detectUnderperformers: ignores explicit fixture telemetry', () => {
  const inv = fakeInvocations('fixture-agent', [1, 1, 1, 1, 1, 1, 1, 1, 1, 1])
    .map(entry => ({ ...entry, fixture: true }));
  const flagged = detectUnderperformers(inv);
  assert.deepEqual(flagged, []);
});
