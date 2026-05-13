import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertPlanWriteTargetAllowed,
  createPlanLifecycleReport,
  defaultActivePlanPointerPath,
  defaultPlanArchiveIndexPath,
  evaluatePlanSourceAgainstLifecycle,
  formatPlanLifecycleReport,
  repairPlanLifecycle,
} from '../scripts/supervibe-plan-lifecycle.mjs';

async function makeLifecycleFixture() {
  const root = await mkdtemp(join(tmpdir(), 'plan-lifecycle-'));
  const plansDir = join(root, '.supervibe', 'artifacts', 'plans');
  const graphDir = join(root, '.supervibe', 'memory', 'work-items', 'epic-current');
  await mkdir(plansDir, { recursive: true });
  await mkdir(graphDir, { recursive: true });
  const oldPlan = '.supervibe/artifacts/plans/2026-05-12-supervibe-workflow-hardening-10-of-10.md';
  const currentPlan = '.supervibe/artifacts/plans/2026-05-12-supervibe-runtime-ui-memory-rag-codegraph-10-of-10.md';
  await writeFile(join(root, oldPlan), '# Old Implementation Plan\n', 'utf8');
  await writeFile(join(root, currentPlan), '# Current Implementation Plan\n', 'utf8');
  await writeFile(join(graphDir, 'graph.json'), `${JSON.stringify({
    kind: 'supervibe-work-item-graph',
    epicId: 'epic-current',
    source: { type: 'plan', path: currentPlan, snapshotPath: 'source-plan.md' },
    items: [
      { itemId: 'epic-current', type: 'epic', status: 'open', title: 'Epic' },
      { itemId: 't1', type: 'task', status: 'claimed', title: 'Task' },
    ],
  }, null, 2)}\n`, 'utf8');
  await writeFile(join(root, '.supervibe', 'memory', 'work-items', 'index.json'), `${JSON.stringify({
    schemaVersion: 1,
    activeEpicId: 'epic-current',
    activeGraphPath: '.supervibe/memory/work-items/epic-current/graph.json',
    updatedAt: '2026-05-13T00:00:00.000Z',
    epics: {
      'epic-old': {
        epicId: 'epic-old',
        graphPath: '.supervibe/memory/work-items/epic-old/graph.json',
        sourcePlanPath: oldPlan,
        status: 'closed',
      },
      'epic-current': {
        epicId: 'epic-current',
        graphPath: '.supervibe/memory/work-items/epic-current/graph.json',
        sourcePlanPath: currentPlan,
        status: 'active',
      },
    },
  }, null, 2)}\n`, 'utf8');
  return { root, oldPlan, currentPlan };
}

test('plan lifecycle report exposes canonical active plan and stale closed archive action', async () => {
  const { root, currentPlan, oldPlan } = await makeLifecycleFixture();
  const report = createPlanLifecycleReport({ rootDir: root });

  assert.equal(report.activePlanPath, currentPlan);
  assert.equal(report.activeStatus, 'executing');
  assert.equal(report.closedPlanCount, 1);
  assert.match(report.archiveAction, /stale closed plan\(s\): 1/);
  assert.equal(report.staleActiveSource, false);
  assert.ok(report.staleClosedPlans.some((plan) => plan.path === oldPlan));
  assert.match(formatPlanLifecycleReport(report), /SUPERVIBE_PLAN_LIFECYCLE/);
});

test('plan lifecycle repair dry-run is non-mutating and apply writes pointer plus archive index', async () => {
  const { root, currentPlan, oldPlan } = await makeLifecycleFixture();
  const dryRun = await repairPlanLifecycle({ rootDir: root, currentPlanPath: currentPlan });

  assert.equal(dryRun.applied, false);
  assert.ok(dryRun.actions.some((action) => action.type === 'index-archived-plan' && action.path === oldPlan));
  assert.ok(dryRun.actions.some((action) => action.type === 'set-active-plan-pointer'));
  assert.equal(existsSync(defaultActivePlanPointerPath(root)), false);

  await assert.rejects(
    () => repairPlanLifecycle({ rootDir: root, currentPlanPath: currentPlan, apply: true }),
    /requires --receipt-id/
  );

  const applied = await repairPlanLifecycle({
    rootDir: root,
    currentPlanPath: currentPlan,
    apply: true,
    receiptId: 'workflow-test',
  });
  assert.equal(applied.applied, true);

  const pointer = JSON.parse(await readFile(defaultActivePlanPointerPath(root), 'utf8'));
  assert.equal(pointer.activePlanPath, currentPlan);
  assert.equal(pointer.status, 'executing');
  assert.equal(pointer.receiptId, 'workflow-test');

  const archive = JSON.parse(await readFile(defaultPlanArchiveIndexPath(root), 'utf8'));
  assert.ok(archive.plans.some((plan) => plan.path === oldPlan && plan.status === 'closed'));
  assert.throws(() => assertPlanWriteTargetAllowed({ rootDir: root, planPath: oldPlan }), /Refusing to reuse closed plan/);
  assert.doesNotThrow(() => assertPlanWriteTargetAllowed({ rootDir: root, planPath: currentPlan }));
});

test('plan lifecycle flags stale active graph source against canonical pointer', async () => {
  const { root, currentPlan, oldPlan } = await makeLifecycleFixture();
  await repairPlanLifecycle({
    rootDir: root,
    currentPlanPath: currentPlan,
    apply: true,
    receiptId: 'workflow-test',
  });

  const evaluation = evaluatePlanSourceAgainstLifecycle({ rootDir: root, sourcePath: oldPlan });
  assert.equal(evaluation.status, 'closed');
  assert.equal(evaluation.excludedFromDefaultContext, true);
  assert.ok(evaluation.issues.some((issue) => issue.includes('active graph source plan is closed')));
  assert.ok(evaluation.issues.some((issue) => issue.includes('canonical active plan pointer')));
});

test('plan lifecycle CLI prints status and refuses destructive deletion without receipt', async () => {
  const { root } = await makeLifecycleFixture();
  const output = execFileSync(process.execPath, [
    join(process.cwd(), 'scripts', 'supervibe-plan-lifecycle.mjs'),
    '--root',
    root,
    '--status',
  ], { encoding: 'utf8' });
  assert.match(output, /SUPERVIBE_PLAN_LIFECYCLE/);
  assert.match(output, /ACTIVE_PLAN: \.supervibe\/artifacts\/plans\/2026-05-12-supervibe-runtime-ui-memory-rag-codegraph-10-of-10\.md/);
  assert.match(output, /ARCHIVE_ACTION: index\/archive stale closed plan\(s\): 1/);

  assert.throws(() => execFileSync(process.execPath, [
    join(process.cwd(), 'scripts', 'supervibe-plan-lifecycle.mjs'),
    '--root',
    root,
    '--delete-plan',
    '.supervibe/artifacts/plans/old.md',
  ], { encoding: 'utf8', stdio: 'pipe' }), /--delete-plan requires --receipt-id/);
});

