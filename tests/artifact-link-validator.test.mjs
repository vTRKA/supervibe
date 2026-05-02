import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { validateArtifactLinks } from '../scripts/validate-artifact-links.mjs';

test('artifact link validator passes current repository links', async () => {
  const result = await validateArtifactLinks(process.cwd());

  assert.deepEqual(result.issues, []);
  assert.equal(result.pass, true);
});

test('artifact link validator reports missing skill and rule references', async () => {
  const root = await mkdtemp(join(tmpdir(), 'supervibe-artifact-links-'));
  await mkdir(join(root, 'agents', '_core'), { recursive: true });
  await mkdir(join(root, 'skills', 'existing'), { recursive: true });
  await mkdir(join(root, 'rules'), { recursive: true });
  await mkdir(join(root, 'confidence-rubrics'), { recursive: true });
  await mkdir(join(root, 'scripts', 'lib'), { recursive: true });

  await writeFile(join(root, 'confidence-rubrics', 'agent-delivery.yaml'), 'name: agent-delivery\n', 'utf8');
  await writeFile(join(root, 'skills', 'existing', 'SKILL.md'), [
    '---',
    'name: existing',
    'namespace: process',
    'description: Existing test skill.',
    'allowed-tools: [Read]',
    'phase: review',
    'emits-artifact: agent-output',
    'confidence-rubric: confidence-rubrics/missing.yaml',
    'gate-on-exit: false',
    'version: 1',
    '---',
    '# Existing',
  ].join('\n'), 'utf8');
  await writeFile(join(root, 'agents', '_core', 'example.md'), [
    '---',
    'name: example',
    'namespace: _core',
    'skills:',
    '  - supervibe:existing',
    '  - supervibe:missing',
    '---',
    '# Example',
  ].join('\n'), 'utf8');
  await writeFile(join(root, 'rules', 'one.md'), [
    '---',
    'name: one',
    'description: Test rule.',
    'applies-to: [agents/**]',
    'version: 1',
    'last-verified: 2026-05-02',
    'related-rules:',
    '  - absent-rule',
    '---',
    '# Rule',
  ].join('\n'), 'utf8');
  await writeFile(join(root, 'scripts', 'lib', 'supervibe-trigger-router.mjs'), 'export const route = { skill: "supervibe:routed-missing" };\n', 'utf8');

  const result = await validateArtifactLinks(root);
  const codes = result.issues.map((issue) => issue.code);

  assert.equal(result.pass, false);
  assert.ok(codes.includes('missing-agent-skill'), JSON.stringify(result.issues));
  assert.ok(codes.includes('missing-skill-rubric'), JSON.stringify(result.issues));
  assert.ok(codes.includes('missing-related-rule'), JSON.stringify(result.issues));
  assert.ok(codes.includes('missing-routed-skill'), JSON.stringify(result.issues));
});
