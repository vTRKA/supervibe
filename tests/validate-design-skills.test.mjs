import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDesignSkill } from '../scripts/validate-design-skills.mjs';

test('validator flags missing feedback prompt', () => {
  const body = '## Procedure\n\n1. Build prototype.\n2. Done.\n';
  const issues = validateDesignSkill('prototype', body);
  assert.ok(issues.some(i => i.code === 'missing-feedback-prompt'));
});

test('validator flags missing single-question anti-pattern', () => {
  const body = '## Anti-patterns\n- foo\n- bar\n';
  const issues = validateDesignSkill('prototype', body);
  assert.ok(issues.some(i => i.code === 'missing-single-question-anti-pattern'));
});

test('validator flags missing framework-coupling for prototype/landing-page', () => {
  const body = '## Anti-patterns\n- asking-multiple-questions-at-once\n- advancing-without-feedback-prompt\n';
  const issues = validateDesignSkill('prototype', body);
  assert.ok(issues.some(i => i.code === 'missing-framework-coupling-anti-pattern'));
});

test('validator passes for fully-compliant body', () => {
  const body = `
## Procedure

Step N: Print this exact prompt:
✅ Утвердить — фиксирую approval, готовлю handoff
✎ Доработать
🔀 Альтернатива
📊 Углублённый review
🛑 Стоп

## Anti-patterns
- asking-multiple-questions-at-once
- advancing-without-feedback-prompt
- framework-coupling
- silent-viewport-expansion
- silent-existing-artifact-reuse
- missing-preview-feedback-button
- random-regen-instead-of-tradeoff-alternatives
`;
  const issues = validateDesignSkill('prototype', body);
  assert.equal(issues.length, 0);
});

test('brandbook requires only ALL antipatterns, not prototype-specific ones', () => {
  const body = `
✅ ✎ 🔀 📊 🛑
- asking-multiple-questions-at-once
- advancing-without-feedback-prompt
- random-regen-instead-of-tradeoff-alternatives
`;
  const issues = validateDesignSkill('brandbook', body);
  assert.equal(issues.length, 0);
});

test('design-intelligence requires lookup-specific anti-patterns', () => {
  const body = `
- asking-multiple-questions-at-once
- advancing-without-feedback-prompt
- random-regen-instead-of-tradeoff-alternatives
- lookup-as-authority
- memory-bypass
- approved-system-overwrite
- uncited-design-claim
`;
  const issues = validateDesignSkill('design-intelligence', body);
  assert.equal(issues.length, 0);
});
