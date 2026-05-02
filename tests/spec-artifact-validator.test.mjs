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

## Scope Safety Gate
| Candidate item | Decision | Evidence | Complexity cost | Tradeoff |
|----------------|----------|----------|-----------------|----------|
| CSV export | include | Finance support evidence and success metric | Low maintenance cost | Keep PDF deferred |
| PDF export | reject | No evidence for current users | Adds layout, QA, and support risk | Won't ship in this scope |

## AI/data boundary
| Boundary | Value | Source |
|----------|-------|--------|
| Data agents may read | billing code | repo |
| Data agents must not read | raw secrets | policy |
| MCP/browser/Figma allowed | Figma no, browser no, MCP local only | user |
| Screenshots allowed | no screenshots | user |
| External API calls allowed | no External API calls | user |
| PII/secrets handling | no raw PII or secrets | policy |
| Approval required before | production, Figma writeback, External API mutation | user |

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

## Evidence and retrieval plan
- Memory: search project memory for prior billing export decisions.
- RAG: run source RAG for billing export controller and service patterns.
- CodeGraph: graph N/A for brainstorm; planner must run CodeGraph if public API changes.
- Citations: cite memory IDs and source file:line references in the plan.

## Product and SDLC fit
- MVP path: ship synchronous export first, async only if measured need appears.
- SDLC stage: discovery complete, ready for implementation planning, test design, release review, and production rollout.
- Launch path: internal beta, finance validation, then production release.
- Production bar: no raw PII leakage, auditable exports, measurable performance.

## Scope Safety Gate
| Candidate addition | Decision | Evidence | Complexity cost | Tradeoff |
|--------------------|----------|----------|-----------------|----------|
| Synchronous CSV export | include | Admin outcome and finance workflow metric | Low risk and easy rollback | PDF export stays deferred |
| Async export queue | defer | No failing test or support evidence yet | Adds jobs, emails, storage, support risk | Promote only if 10k rows exceeds 30s |
| PDF export | reject | No current user evidence | High maintenance and QA cost | Won't build until a paid workflow needs it |

## Visual explanation plan
- Mermaid flowchart with accTitle and accDescr.
- Text fallback describes CSV export decision and deferred async queue.
- Do not rely on color alone.

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

## Production readiness contract
- Contract: request filters, CSV columns, authorization roles, and error envelope are explicit.
- Data: only allowed billing fields are exported; raw secrets are never read.
- Security: role checks and CSV injection escaping are required.
- Observability: export count, duration, and error metrics are emitted.
- Rollback: feature flag disables export and removes route from navigation.

## Acceptance and 10/10 scorecard
- Acceptance: selected rows export exactly once with the documented columns.
- Verification: unit, integration, authorization, and CSV injection tests pass.
- Release: changelog, docs, and rollback note are complete.
- 10/10 gate: all acceptance criteria, production readiness items, and open blockers are closed.

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

test('validateBrainstormSpec requires production-grade SDLC and 10/10 gates', () => {
  const issues = validateBrainstormSpec(
    GOOD_BRAINSTORM
      .replace('## Product and SDLC fit', '## Product notes')
      .replace('## Scope Safety Gate', '## Scope Notes')
      .replace('## Acceptance and 10/10 scorecard', '## Acceptance')
  );
  assert.ok(issues.some(issue => issue.includes('Product and SDLC fit')));
  assert.ok(issues.some(issue => issue.includes('Scope Safety Gate')));
  assert.ok(issues.some(issue => issue.includes('10/10')));
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
