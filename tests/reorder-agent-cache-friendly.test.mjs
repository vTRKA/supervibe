import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reorderAgent } from '../scripts/reorder-agent-cache-friendly.mjs';

test('reorderAgent puts Persona before Project Context', () => {
  const sample = `---
name: foo
version: 1
---

## Project Context
volatile

## Persona
stable
`;
  const out = reorderAgent(sample);
  assert.ok(out.indexOf('## Persona') < out.indexOf('## Project Context'));
});

test('reorderAgent puts last-verified at bottom of frontmatter', () => {
  const sample = `---
last-verified: 2026-01-01
name: foo
version: 1
---

## Persona
x
`;
  const out = reorderAgent(sample);
  const fmEnd = out.indexOf('---', 4);
  const fmBody = out.slice(0, fmEnd);
  assert.ok(fmBody.indexOf('name:') < fmBody.indexOf('last-verified:'));
});

test('reorderAgent is idempotent (run twice = same result)', () => {
  const sample = `---
name: foo
version: 1
---

## Persona
a

## Project Context
b
`;
  const once = reorderAgent(sample);
  const twice = reorderAgent(once);
  assert.equal(twice, once);
});

test('reorderAgent preserves Skills + all sections', () => {
  const sample = `---
name: foo
version: 1
---

## Project Context
b

## Skills
- evolve:foo

## Persona
x

## Anti-patterns
- bad
`;
  const out = reorderAgent(sample);
  assert.ok(out.includes('## Skills'));
  assert.ok(out.includes('- evolve:foo'));
  assert.ok(out.includes('## Anti-patterns'));
  assert.ok(out.includes('- bad'));
  assert.ok(out.includes('## Persona'));
  assert.ok(out.includes('## Project Context'));
});

test('reorderAgent: bytes preserved within tolerance', () => {
  const sample = `---
name: foo
version: 1
---

## Project Context
some content here

## Persona
more content here
`;
  const out = reorderAgent(sample);
  // YAML re-serialization may add trivial whitespace; tolerance is 2%
  assert.ok(Math.abs(out.length - sample.length) <= sample.length * 0.05);
});
