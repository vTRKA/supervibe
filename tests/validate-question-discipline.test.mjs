import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAgentDiscipline, isInScope } from '../scripts/validate-question-discipline.mjs';

test('isInScope true for product agent', () => {
  assert.equal(isInScope('agents/_product/systems-analyst.md'), true);
});

test('isInScope true for windows path separators', () => {
  assert.equal(isInScope('agents\\_product\\systems-analyst.md'), true);
});

test('isInScope true for every agent path', () => {
  assert.equal(isInScope('agents/_core/code-reviewer.md'), true);
  assert.equal(isInScope('agents/_core/security-auditor.md'), true);
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
  const body = [
    '## User dialogue discipline',
    'Use localized Step marker guidance with outcome-oriented labels.',
    'Why: this answer changes scope.',
    'Decision unlocked: select the safest path.',
    'If skipped: use the documented default.',
    'Use an adaptive progress indicator and recompute M from current triage, saved workflow state, skipped stages, and delegated safe decisions.',
    'If a NEXT_STEP_HANDOFF or workflowSignal exists and the user changes topic, ask whether to continue, skip/delegate, pause and switch, or stop/archive.',
    '## Anti-patterns',
    '- asking-multiple-questions-at-once',
    '',
  ].join('\n');
  const issues = checkAgentDiscipline('agents/_product/systems-analyst.md', {}, body);
  assert.equal(issues.length, 0);
});

test('agent with stale option placeholders fails', () => {
  const body = [
    '## User dialogue discipline',
    'When clarifying, use one-line rationale per option.',
    '> - <option a> - <one-line rationale>',
    '## Anti-patterns',
    '- asking-multiple-questions-at-once',
    '',
  ].join('\n');
  const issues = checkAgentDiscipline('agents/_product/systems-analyst.md', {}, body);
  assert.ok(issues.some((issue) => issue.code === 'missing-outcome-label-guidance'), JSON.stringify(issues));
  assert.ok(issues.some((issue) => issue.code === 'stale-dialogue-placeholder'), JSON.stringify(issues));
});

test('agent dialogue rejects wrong Russian step marker guidance', () => {
  const body = [
    '## User dialogue discipline',
    'Use Step N/M with outcome-oriented labels.',
    'Why: this answer changes scope.',
    'Decision unlocked: select the safest path.',
    'If skipped: use the documented default.',
    'Use an adaptive progress indicator and recompute M from current triage, saved workflow state, skipped stages, and delegated safe decisions.',
    'If a NEXT_STEP_HANDOFF or workflowSignal exists and the user changes topic, ask whether to continue, skip/delegate, pause and switch, or stop/archive.',
    'Use `Step N/M:` when the conversation is in Russian.',
    '## Anti-patterns',
    '- asking-multiple-questions-at-once',
    '',
  ].join('\n');
  const issues = checkAgentDiscipline('agents/_product/systems-analyst.md', {}, body);
  assert.ok(issues.some((issue) => issue.code === 'wrong-russian-step-marker'), JSON.stringify(issues));
});

test('stale placeholders outside dialogue section do not fail dialogue check', () => {
  const body = [
    '## User dialogue discipline',
    'Use localized Step marker guidance with outcome-oriented labels.',
    'Why: this answer changes scope.',
    'Decision unlocked: select the safest path.',
    'If skipped: use the documented default.',
    'Use an adaptive progress indicator and recompute M from current triage, saved workflow state, skipped stages, and delegated safe decisions.',
    'If a NEXT_STEP_HANDOFF or workflowSignal exists and the user changes topic, ask whether to continue, skip/delegate, pause and switch, or stop/archive.',
    '',
    '## Alternatives considered',
    '- <option A>: rejected because <reason>',
    '## Anti-patterns',
    '- asking-multiple-questions-at-once',
    '',
  ].join('\n');
  const issues = checkAgentDiscipline('agents/_product/systems-analyst.md', {}, body);
  assert.equal(issues.length, 0, JSON.stringify(issues));
});

test('agent dialogue section must explain why, decision, and skip default', () => {
  const body = [
    '## User dialogue discipline',
    'Use localized Step marker guidance with outcome-oriented labels.',
    '## Anti-patterns',
    '- asking-multiple-questions-at-once',
    '',
  ].join('\n');
  const issues = checkAgentDiscipline('agents/_product/systems-analyst.md', {}, body);
  assert.ok(issues.some((issue) => issue.code === 'missing-dialogue-why'), JSON.stringify(issues));
  assert.ok(issues.some((issue) => issue.code === 'missing-dialogue-decision'), JSON.stringify(issues));
  assert.ok(issues.some((issue) => issue.code === 'missing-dialogue-skip-assumption'), JSON.stringify(issues));
});

test('agent dialogue section must keep adaptive stage and topic-resume guidance', () => {
  const body = [
    '## User dialogue discipline',
    'Use localized Step marker guidance with outcome-oriented labels.',
    'Why: this answer changes scope.',
    'Decision unlocked: select the safest path.',
    'If skipped: use the documented default.',
    '## Anti-patterns',
    '- asking-multiple-questions-at-once',
    '',
  ].join('\n');
  const issues = checkAgentDiscipline('agents/_product/systems-analyst.md', {}, body);
  assert.ok(issues.some((issue) => issue.code === 'missing-adaptive-progress-guidance'), JSON.stringify(issues));
  assert.ok(issues.some((issue) => issue.code === 'missing-topic-resume-guidance'), JSON.stringify(issues));
});

test('noninteractive frontmatter override skips check', () => {
  const issues = checkAgentDiscipline(
    'agents/_meta/supervibe-orchestrator.md',
    { dialogue: 'noninteractive' },
    ''
  );
  assert.equal(issues.length, 0);
});

test('non-agent paths are skipped by agent discipline check', () => {
  const issues = checkAgentDiscipline('rules/example.md', {}, '');
  assert.equal(issues.length, 0);
});
