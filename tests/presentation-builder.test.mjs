import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPresentation, validateDeckSpec } from '../scripts/build-presentation.mjs';

test('validateDeckSpec reports missing required fields', () => {
  const issues = validateDeckSpec({ title: '', slides: [] });
  assert.ok(issues.some(issue => issue.includes('title')));
  assert.ok(issues.some(issue => issue.includes('slides')));
});

test('buildPresentation creates a pptx zip file from deck json', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'presentation-'));
  const input = join(dir, 'deck.json');
  const output = join(dir, 'export', 'deck.pptx');
  await writeFile(input, JSON.stringify({
    title: 'Quarterly Product Review',
    author: 'Supervibe',
    theme: {
      colors: {
        background: 'FFFFFF',
        foreground: '111827',
        muted: '64748B',
        accent: '2563EB',
        accentText: 'FFFFFF',
      },
    },
    slides: [
      { type: 'title', title: 'Quarterly Product Review', subtitle: 'What changed and what we need next' },
      { type: 'bullets', title: 'Decision needed', bullets: ['Approve beta expansion', 'Hold pricing', 'Fund onboarding work'] },
    ],
  }, null, 2));

  const result = await buildPresentation({ input, output });
  assert.equal(result.slides, 2);
  const info = await stat(output);
  assert.ok(info.size > 1000);
  const bytes = await readFile(output);
  assert.equal(bytes.subarray(0, 2).toString('utf8'), 'PK');
});

test('build-presentation CLI supports --json output', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'presentation-cli-'));
  const input = join(dir, 'deck.json');
  const output = join(dir, 'deck.pptx');
  await writeFile(input, JSON.stringify({
    title: 'CLI Deck',
    slides: [{ type: 'title', title: 'CLI Deck' }],
  }));

  const stdout = execFileSync(process.execPath, [
    'scripts/build-presentation.mjs',
    '--input', input,
    '--output', output,
    '--json',
  ], { cwd: new URL('../', import.meta.url), encoding: 'utf8' });

  const parsed = JSON.parse(stdout);
  assert.equal(parsed.slides, 1);
  assert.match(parsed.output, /deck\.pptx$/);
});
