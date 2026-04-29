import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  validateBrainstormSpec,
  validateIntakeSpec,
  validateSpecArtifact,
} from '../scripts/validate-spec-artifacts.mjs';

const GOOD_INTAKE = `# Intake: Billing export

## Request as stated
> Build export

## Restated in our words
We need billing CSV export.

## Personas
### Persona 1
- **Role / context**: Finance admin
- **Top 3 pains**: manual reconciliation, delayed reports, error-prone exports
- **Top 3 jobs-to-be-done**: export invoices, reconcile payments, share reports
- **Current workaround**: SQL query

### Persona 2
- **Role / context**: Support lead
- **Top 3 pains**: missing invoice context, slow answers, duplicate work
- **Top 3 jobs-to-be-done**: answer tickets, inspect charges, share receipts
- **Current workaround**: asks finance

## Constraints
| Type | Value | Source |
|------|-------|--------|
| Time | 2 weeks | user |
| Budget | OSS only | user |
| Team | 1 dev | user |
| Compliance | GDPR | user |
| Tech stack | Node | repo |
| Performance | <2s for 10k rows | user |
| Localization | en | user |
| Accessibility | N/A backend | user |

## Success criteria
- Exports CSV with 100% selected rows.
- Completes within 2s for 10k rows.
- Returns validation error for invalid date range.

## Out of scope
- PDF export.

## Stakeholders
- **Decision approvers**: PM
- **Affected parties**: Finance
- **SMEs**: Backend
- **End users**: Admins

## Open questions
- Which fields?
- Which timezone?
- Who can export?

## Suggested next step
- [ ] Direct implementation plan
`;

const GOOD_BRAINSTORM = `# Brainstorm: Billing export

## Problem statement
Admins need a reliable billing export path that avoids manual SQL.

## First-principle decomposition
### Constraints
- Must use current backend.
### Success criteria
- Exports complete CSV.
### Failure modes
- Partial exports.
### Non-goals
- PDF export.

## Options explored
### Option A: Synchronous export
Simple controller endpoint.
### Option B: Async export
Queued job with email link.
### Option C: Status quo
Keep manual SQL.

## Non-obvious risks
- CSV injection in spreadsheet cells.
- Timezone boundary bugs at month-end.
- Exporting too much PII for support roles.

## Kill criteria
- Kill if export exceeds 30s for 10k rows.
- Kill if PII review blocks role-based access.

## Decision matrix
| Dimension | Weight | A | B | C |
|-----------|--------|---|---|---|
| User impact | 3 | 8 | 9 | 1 |
| Effort | -2 | 2 | 5 | 0 |
| **Total** | -- | 20 | 17 | 3 |

weights set BEFORE scores

## Recommended option
Choose A for first release.

## Open questions
- Do we need async later?

## Next step
- [ ] Plan
`;

test('validateIntakeSpec accepts a complete intake artifact', () => {
  assert.deepEqual(validateIntakeSpec(GOOD_INTAKE), []);
});

test('validateIntakeSpec flags missing personas and open questions', () => {
  const issues = validateIntakeSpec(GOOD_INTAKE.replace('### Persona 2', '### User 2').replace('- Who can export?', ''));
  assert.ok(issues.some(issue => issue.includes('personas')));
  assert.ok(issues.some(issue => issue.includes('open questions')));
});

test('validateBrainstormSpec accepts a complete brainstorm artifact', () => {
  assert.deepEqual(validateBrainstormSpec(GOOD_BRAINSTORM), []);
});

test('validateBrainstormSpec flags weak decision artifacts', () => {
  const issues = validateBrainstormSpec(GOOD_BRAINSTORM.replace('weights set BEFORE scores', '').replace('- Kill if export exceeds 30s for 10k rows.', '- Kill if it feels slow.'));
  assert.ok(issues.some(issue => issue.includes('weights')));
  assert.ok(issues.some(issue => issue.includes('quantitative')));
});

test('validateSpecArtifact auto-detects intake vs brainstorm', () => {
  assert.equal(validateSpecArtifact(GOOD_INTAKE).kind, 'intake');
  assert.equal(validateSpecArtifact(GOOD_BRAINSTORM).kind, 'brainstorm');
});

test('validate-spec-artifacts CLI fails bad file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'spec-validator-'));
  const file = join(dir, 'bad.md');
  await writeFile(file, '# Brainstorm: bad\n\n## Problem statement\nToo thin.');
  assert.throws(() => execFileSync(process.execPath, ['scripts/validate-spec-artifacts.mjs', '--file', file], {
    cwd: new URL('../', import.meta.url),
    encoding: 'utf8',
    stdio: 'pipe',
  }));
});
