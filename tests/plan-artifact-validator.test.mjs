import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validatePlanArtifact } from '../scripts/validate-plan-artifacts.mjs';

const GOOD_PLAN = `# Billing Export Implementation Plan

**Goal:** Add a CSV export endpoint.

**Architecture:** Controller validates filters, service streams rows, tests cover edge cases.

**Tech Stack:** Node, Vitest

**Hard constraints (do not violate):** No PII outside allowed columns.

## AI/Data Boundary

| Area | Allowed | Redaction | Approval gate |
|------|---------|-----------|---------------|
| Local source reads | yes | no secrets | none |
| Local writes | yes | no PII fixtures | review |
| MCP/browser automation | MCP no, browser no | N/A | user approval |
| Figma/design source | no Figma source | N/A | Figma writeback blocked |
| External network/API | no External calls | N/A | explicit approval |
| PII/secrets | references only | redact PII | approver |

## Retrieval, CodeGraph, And Visual Evidence

- Memory: search project memory for billing export decisions before edits.
- RAG: run source RAG for billing export route and service patterns.
- CodeGraph: graph Case C unless exported route symbols are renamed; if renamed, run callers and impact.
- Mermaid: include accTitle and accDescr on the release-flow diagram.
- Text fallback: explain plan -> build -> verify -> release path.

## Development Contract Map

| ID | Contract | Required details | Owner | Verification |
|----|----------|------------------|-------|--------------|
| C-BEH | Behavior contract | CSV export behavior, edge cases, invariants | backend | unit tests |
| C-ARCH | Architecture contract | Controller and service boundary | backend | review |
| C-DATA | Data and schema contract | Export row schema and validation | backend | schema tests |
| C-API | API contract | Route, auth, response, error envelope | backend | integration tests |
| C-UI | UI state contract | Loading, empty, error, permission states | frontend | component tests |
| C-SEC | Security contract | Role checks, PII redaction, audit logging | security | authorization tests |
| C-PERF | Performance contract | Stream budget and timeout threshold | backend | performance smoke |
| C-OBS | Observability contract | Metrics, logs, alerts, correlation id | ops | metric assertion |
| C-ROLL | Rollout contract | Feature flag and route rollback | release | rollback note |
| C-DOC | Documentation contract | Changelog and support note | support | doc review |

## File Structure

### Created
\`\`\`
src/billing/export-service.ts
tests/billing/export-service.test.ts
\`\`\`

### Modified
- \`src/routes.ts\` - add export route

## Critical Path

\`T1 -> T2 -> T3\`

Off-path parallel candidates: T4 || T5

## Scope Safety Gate

- Approved scope baseline: CSV export service and route.
- Deferred scope: async queue remains deferred until export exceeds 30s with evidence.
- Rejected scope: PDF export rejected because it adds support and QA cost without current evidence.
- Scope expansion tradeoff: any new export format removes another item or is re-estimated.

## Delivery Strategy

- MVP path: ship CSV export behind an internal gate before broad production exposure.
- User value: finance admins can finish monthly reconciliation without engineering support.
- Anti-bloat: PDF export, analytics, and async queue are rejected or deferred until evidence justifies them.
- Delivery discipline: discovery -> spec -> plan -> review -> implementation -> verification -> release.
- Phase plan: foundation, behavior, hardening, release.
- Task budget policy: max tasks per phase=12; max child items per atomization run=80; phase-split required before graph write when either limit is exceeded.
- Production target: export is supportable, observable, documented, and reversible.

## Production Readiness

- Test: unit, integration, authorization, and CSV injection tests pass.
- Security: role checks and PII boundaries reviewed.
- Performance: export stream stays within the agreed duration budget.
- Observability: export duration and failure metrics are emitted.
- Rollback: feature flag and route removal are documented.
- Release: changelog, docs, and support notes are ready.

## Final 10/10 Acceptance Gate

- 10/10 acceptance requires every requirement mapped to a green verification.
- Verification commands are rerun after the final task.
- No open blockers remain before production release.
- Contract coverage maps each touched contract row to a verification.
- Production readiness covers security, performance, observability, rollback, docs, and support.

## Task T1: Export service

**Files:**
- Create: \`src/billing/export-service.ts\`
- Test: \`tests/billing/export-service.test.ts\`

**Estimated time:** 15min (confidence: high)
**Scope IDs:** S1
**Requirement IDs:** REQ1
**Contract rows touched:** C-BEH, C-DATA, C-API, C-SEC, C-OBS, C-ROLL
**Rollback:** \`git revert <sha>\`
**Risks:** R1: CSV injection; mitigation: escape spreadsheet formulas.
**Stop conditions:** stop if the endpoint requires extra PII columns or production mutation.

**Acceptance Criteria:**
- Requirement REQ1 exports CSV rows with approved columns.
- Contract rows C-BEH, C-DATA, C-API, C-SEC, C-OBS, and C-ROLL have verification evidence.

- [ ] **Step 1: Write failing test**
\`\`\`bash
npm test -- tests/billing/export-service.test.ts
\`\`\`

- [ ] **Step 2: Run test, verify fail**
\`\`\`bash
npm test -- tests/billing/export-service.test.ts
\`\`\`
Expected output: fails on missing service.

- [ ] **Step 3: Minimal implementation**
\`\`\`ts
export function exportRows() { return ''; }
\`\`\`

- [ ] **Step 4: Run test, verify pass**
\`\`\`bash
npm test -- tests/billing/export-service.test.ts
\`\`\`
Expected output: pass.

- [ ] **Step 5: Commit**
\`\`\`bash
git add src/billing/export-service.ts tests/billing/export-service.test.ts && git commit -m "Add billing export service"
\`\`\`

## Self-Review

### Spec coverage
| Requirement | Task |
|-------------|------|
| CSV export | T1 |

### Placeholder scan
- No placeholders found.

### Type consistency
- Export service returns string stream-compatible content.

## Execution Handoff

**Real-agent receipt-backed handoff:** Batch 1: T1 runs only after runtime-issued workflow receipts are available for the owning specialist.
**Subagent-Driven batches:** prohibited batches for this plan.
**Inline batches:** prohibited batches for durable implementation.
`;

test('validatePlanArtifact accepts a complete plan', () => {
  assert.deepEqual(validatePlanArtifact(GOOD_PLAN), []);
});

test('validatePlanArtifact accepts browser-first visual evidence', () => {
  const browserFirst = GOOD_PLAN.replace(
    [
      '- Mermaid: include accTitle and accDescr on the release-flow diagram.',
      '- Text fallback: explain plan -> build -> verify -> release path.',
    ].join('\n'),
    [
      '- Browser-first visual packet: preview path .supervibe/artifacts/visual-explanations/billing-export/index.html.',
      '- Table-only approved fallback: release gate table is available when preview is not rendered.',
      '- Text fallback: explain plan -> build -> verify -> release path.',
    ].join('\n')
  );
  assert.deepEqual(validatePlanArtifact(browserFirst), []);
});

test('validatePlanArtifact catches missing readiness fields', () => {
  const issues = validatePlanArtifact(GOOD_PLAN.replace('## Critical Path', '## Dependencies').replace('**Rollback:** `git revert <sha>`', ''));
  assert.ok(issues.some(issue => issue.includes('Critical Path')));
  assert.ok(issues.some(issue => issue.includes('rollback')));
});

test('validatePlanArtifact requires production delivery and final 10/10 gate', () => {
  const issues = validatePlanArtifact(
    GOOD_PLAN
      .replace('## Scope Safety Gate', '## Scope Notes')
      .replace('## Delivery Strategy', '## Delivery Notes')
      .replace('## Final 10/10 Acceptance Gate', '## Final Gate')
  );
  assert.ok(issues.some(issue => issue.includes('Scope Safety Gate')));
  assert.ok(issues.some(issue => issue.includes('Delivery Strategy')));
  assert.ok(issues.some(issue => issue.includes('Final 10/10 Acceptance Gate')));
});

test('validatePlanArtifact rejects placeholder wording', () => {
  const issues = validatePlanArtifact(`${GOOD_PLAN}\n\nTBD`);
  assert.ok(issues.some(issue => issue.includes('placeholders')));
});

test('validatePlanArtifact rejects generic acceptance criteria', () => {
  const issues = validatePlanArtifact(GOOD_PLAN.replace('Requirement REQ1 exports CSV rows with approved columns.', 'The feature works correctly.'));
  assert.ok(issues.some(issue => issue.includes('generic acceptance criteria')));
});

test('validate-plan-artifacts CLI fails bad file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'plan-validator-'));
  const file = join(dir, 'bad.md');
  await writeFile(file, '# Bad Implementation Plan\n\n**Goal:** x');
  assert.throws(() => execFileSync(process.execPath, ['scripts/validate-plan-artifacts.mjs', '--file', file], {
    cwd: new URL('../', import.meta.url),
    encoding: 'utf8',
    stdio: 'pipe',
  }));
});

test('validate-plan-artifacts strict mode fails active graph with missing source and snapshot', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'plan-validator-active-source-'));
  const graphDir = join(dir, '.supervibe', 'memory', 'work-items', 'epic-missing-source');
  await mkdir(graphDir, { recursive: true });
  await writeFile(join(graphDir, 'graph.json'), `${JSON.stringify({
    kind: 'supervibe-work-item-graph',
    graph_id: 'epic-missing-source',
    epicId: 'epic-missing-source',
    source: { type: 'plan', path: '.supervibe/artifacts/plans/missing.md', snapshotPath: 'source-plan.md' },
    items: [
      { itemId: 'epic-missing-source', type: 'epic', status: 'open', title: 'Epic' },
    ],
  }, null, 2)}\n`, 'utf8');

  assert.throws(() => execFileSync(process.execPath, [
    join(process.cwd(), 'scripts', 'validate-plan-artifacts.mjs'),
    '--all',
    '--require-active-source',
  ], {
    cwd: dir,
    encoding: 'utf8',
    stdio: 'pipe',
  }), /active graph source is missing/);
});

test('validate-plan-artifacts strict mode fails active graph snapshot fallback', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'plan-validator-active-snapshot-'));
  const graphDir = join(dir, '.supervibe', 'memory', 'work-items', 'epic-snapshot-source');
  await mkdir(graphDir, { recursive: true });
  await writeFile(join(graphDir, 'source-plan.md'), GOOD_PLAN, 'utf8');
  await writeFile(join(graphDir, 'graph.json'), `${JSON.stringify({
    kind: 'supervibe-work-item-graph',
    graph_id: 'epic-snapshot-source',
    epicId: 'epic-snapshot-source',
    source: { type: 'plan', path: '.supervibe/artifacts/plans/missing.md', snapshotPath: 'source-plan.md' },
    items: [
      { itemId: 'epic-snapshot-source', type: 'epic', status: 'open', title: 'Epic' },
    ],
  }, null, 2)}\n`, 'utf8');

  let output = '';
  assert.throws(() => {
    try {
      execFileSync(process.execPath, [
        join(process.cwd(), 'scripts', 'validate-plan-artifacts.mjs'),
        '--all',
        '--require-active-source',
      ], {
        cwd: dir,
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch (error) {
      output = `${error.stdout || ''}${error.stderr || ''}`;
      throw error;
    }
  });
  assert.match(output, /snapshot fallback/);
});

test('validate-plan-artifacts strict mode fails when closed old plan is active graph source', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'plan-validator-stale-source-'));
  const plansDir = join(dir, '.supervibe', 'artifacts', 'plans');
  const archiveDir = join(plansDir, '_archive');
  const graphDir = join(dir, '.supervibe', 'memory', 'work-items', 'epic-current');
  const oldPlan = '.supervibe/artifacts/plans/2026-05-12-supervibe-workflow-hardening-10-of-10.md';
  const currentPlan = '.supervibe/artifacts/plans/2026-05-12-supervibe-runtime-ui-memory-rag-codegraph-10-of-10.md';
  await mkdir(plansDir, { recursive: true });
  await mkdir(archiveDir, { recursive: true });
  await mkdir(graphDir, { recursive: true });
  await writeFile(join(dir, oldPlan), GOOD_PLAN.replace('Billing Export', 'Old Workflow Hardening'), 'utf8');
  await writeFile(join(dir, currentPlan), GOOD_PLAN.replace('Billing Export', 'Runtime UI Memory RAG CodeGraph'), 'utf8');
  await writeFile(join(archiveDir, 'index.json'), `${JSON.stringify({
    schemaVersion: 1,
    plans: [
      {
        path: oldPlan,
        status: 'closed',
        archivePath: '.supervibe/artifacts/plans/_archive/2026-05-12-supervibe-workflow-hardening-10-of-10.md',
        archivedAt: '2026-05-13T00:00:00.000Z',
        receiptId: 'workflow-test',
      },
    ],
  }, null, 2)}\n`, 'utf8');
  await writeFile(join(dir, '.supervibe', 'memory', 'active-plan.json'), `${JSON.stringify({
    schemaVersion: 1,
    activePlanPath: currentPlan,
    status: 'executing',
    updatedAt: '2026-05-13T00:00:00.000Z',
  }, null, 2)}\n`, 'utf8');
  await writeFile(join(graphDir, 'graph.json'), `${JSON.stringify({
    kind: 'supervibe-work-item-graph',
    graph_id: 'epic-current',
    epicId: 'epic-current',
    source: { type: 'plan', path: oldPlan, snapshotPath: 'source-plan.md' },
    items: [
      { itemId: 'epic-current', type: 'epic', status: 'open', title: 'Epic' },
      { itemId: 't1', type: 'task', status: 'claimed', title: 'Task' },
    ],
  }, null, 2)}\n`, 'utf8');
  await writeFile(join(dir, '.supervibe', 'memory', 'work-items', 'index.json'), `${JSON.stringify({
    schemaVersion: 1,
    activeEpicId: 'epic-current',
    activeGraphPath: '.supervibe/memory/work-items/epic-current/graph.json',
    epics: {
      'epic-current': {
        epicId: 'epic-current',
        graphPath: '.supervibe/memory/work-items/epic-current/graph.json',
        sourcePlanPath: currentPlan,
        status: 'active',
      },
    },
  }, null, 2)}\n`, 'utf8');

  let output = '';
  assert.throws(() => {
    try {
      execFileSync(process.execPath, [
        join(process.cwd(), 'scripts', 'validate-plan-artifacts.mjs'),
        '--all',
        '--require-active-source',
      ], {
        cwd: dir,
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch (error) {
      output = `${error.stdout || ''}${error.stderr || ''}`;
      throw error;
    }
  });
  assert.match(output, /active graph source plan is closed/);
  assert.match(output, /canonical active plan pointer/);
});
