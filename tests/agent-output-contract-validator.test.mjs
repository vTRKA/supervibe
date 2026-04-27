import { test } from 'node:test';
import assert from 'node:assert';
import { hasCanonicalFooter } from '../scripts/validate-agent-output-contract.mjs';

test('detects valid canonical footer', () => {
  const content = `---
name: test
---
## Output contract

Do X.

\`\`\`
Confidence: 9.2/10
Override: false
Rubric: agent-delivery
\`\`\`
`;
  const r = hasCanonicalFooter(content);
  assert.strictEqual(r.ok, true);
});

test('flags missing confidence line', () => {
  const content = `## Output contract

Do X.

Rubric: agent-delivery
`;
  const r = hasCanonicalFooter(content);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'no-confidence-line');
});

test('flags missing rubric line', () => {
  const content = `## Output contract

Do X.

Confidence: 9.2/10
`;
  const r = hasCanonicalFooter(content);
  assert.strictEqual(r.ok, false);
});

test('flags missing Output contract section', () => {
  const content = `## Procedure

Do X.
`;
  const r = hasCanonicalFooter(content);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'no-output-contract');
});

test('accepts N/A for non-quantifiable agents', () => {
  const content = `## Output contract

Research report.

Confidence: N/A
Override: false
Rubric: read-only-research
`;
  const r = hasCanonicalFooter(content);
  assert.strictEqual(r.ok, true);
});
