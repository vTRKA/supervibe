import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { validatePlanArtifact } from '../scripts/validate-plan-artifacts.mjs';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const validatorPath = fileURLToPath(new URL('../scripts/validate-plan-artifacts.mjs', import.meta.url));
const templatePath = new URL('../docs/templates/plan-template.md', import.meta.url);
const billingFixturePath = new URL('../tests/fixtures/artifacts/plans/billing-export-example.md', import.meta.url);

async function readTemplate() {
  return readFile(templatePath, 'utf8');
}

async function readBillingFixture() {
  return readFile(billingFixturePath, 'utf8');
}

function runValidatorExpectFailure(args, { cwd }) {
  try {
    execFileSync(process.execPath, [validatorPath, ...args], {
      cwd,
      encoding: 'utf8',
      stdio: 'pipe',
    });
  } catch (error) {
    return `${error.stdout || ''}${error.stderr || ''}`;
  }
  assert.fail(`validator unexpectedly passed: ${args.join(' ')}`);
}

test('neutral plan template validates as a full plan without domain leakage', async () => {
  const markdown = await readTemplate();
  assert.deepEqual(validatePlanArtifact(markdown), []);
  assert.doesNotMatch(markdown, /\b(?:billing|invoice|payment|customer|CSV)\b/i);
});

test('filled billing example lives in fixture and validates as a full plan', async () => {
  const markdown = await readBillingFixture();
  assert.match(markdown, /Billing Export MVP Implementation Plan/);
  assert.deepEqual(validatePlanArtifact(markdown), []);
});

test('plan validator requires task scoring fields', async () => {
  const markdown = await readBillingFixture();
  const weakened = markdown.replace(/^\*\*Estimated time:\*\*.*$/m, '');
  const issues = validatePlanArtifact(weakened);
  assert.ok(issues.some(issue => issue.includes('missing estimated time with confidence')));
});

test('plan validator requires anti-bloat and scope-expansion controls', async () => {
  const markdown = await readBillingFixture();
  const weakened = markdown
    .replace(/anti-bloat/gi, 'scope discipline')
    .replace(/Scope expansion rule/gi, 'Scope note');
  const issues = validatePlanArtifact(weakened);
  assert.ok(issues.some(issue => issue.includes('delivery strategy: missing anti-bloat')));
  assert.ok(issues.some(issue => issue.includes('scope safety gate: missing scope expansion rule')));
});

test('plan validator requires self-review coverage for user-approved scope', async () => {
  const markdown = await readBillingFixture();
  const weakened = markdown
    .replace('- **Approved scope baseline:**', '- **Included scope baseline:**')
    .replace(/\n### Scope consistency[\s\S]*?(?=\n---\n\n## Execution Handoff)/, '');
  const issues = validatePlanArtifact(weakened);
  assert.ok(issues.some(issue => issue.includes('self-review: missing user-approved scope consistency check')));
});

test('strict plan validation fails with zero durable plans and no active source', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'plan-strict-zero-'));
  const output = runValidatorExpectFailure(['--all', '--require-active-source'], { cwd: dir });
  assert.match(output, /zero plan artifacts and no original active source/);
});

test('strict plan validation validates the active source as a full plan', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'plan-strict-active-source-'));
  const graphDir = join(dir, '.supervibe', 'memory', 'work-items', 'epic-active-source');
  await mkdir(graphDir, { recursive: true });
  await writeFile(join(dir, 'active-source.md'), '# Weak Implementation Plan\n\n**Goal:** short\n', 'utf8');
  await writeFile(join(graphDir, 'graph.json'), `${JSON.stringify({
    kind: 'supervibe-work-item-graph',
    graph_id: 'epic-active-source',
    epicId: 'epic-active-source',
    source: { type: 'plan', path: 'active-source.md' },
    items: [
      { itemId: 'epic-active-source', type: 'epic', status: 'open', title: 'Epic' },
    ],
  }, null, 2)}\n`, 'utf8');

  const output = runValidatorExpectFailure(['--all', '--require-active-source'], { cwd: dir });
  assert.match(output, /FAIL active-source active-source\.md/);
  assert.match(output, /missing section: AI\/Data Boundary/);
});

test('validate-plan-artifacts accepts the moved billing fixture through CLI', () => {
  const output = execFileSync(process.execPath, [
    validatorPath,
    '--file',
    fileURLToPath(billingFixturePath),
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  assert.match(output, /OK\s+plan\s+tests\/fixtures\/artifacts\/plans\/billing-export-example\.md/);
});
