import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
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

## Task T1: Export service

**Files:**
- Create: \`src/billing/export-service.ts\`
- Test: \`tests/billing/export-service.test.ts\`

**Estimated time:** 15min (confidence: high)
**Rollback:** \`git revert <sha>\`
**Risks:** R1: CSV injection; mitigation: escape spreadsheet formulas.

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

**Subagent-Driven batches:** Batch 1: T1.
**Inline batches:** T1 if subagents unavailable.
`;

test('validatePlanArtifact accepts a complete plan', () => {
  assert.deepEqual(validatePlanArtifact(GOOD_PLAN), []);
});

test('validatePlanArtifact catches missing readiness fields', () => {
  const issues = validatePlanArtifact(GOOD_PLAN.replace('## Critical Path', '## Dependencies').replace('**Rollback:** `git revert <sha>`', ''));
  assert.ok(issues.some(issue => issue.includes('Critical Path')));
  assert.ok(issues.some(issue => issue.includes('rollback')));
});

test('validatePlanArtifact rejects placeholder wording', () => {
  const issues = validatePlanArtifact(`${GOOD_PLAN}\n\nTBD`);
  assert.ok(issues.some(issue => issue.includes('placeholders')));
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
