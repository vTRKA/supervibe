import assert from "node:assert/strict";
import test from "node:test";

import { validatePrdArtifact } from "../scripts/validate-prd-artifacts.mjs";

const GOOD_PRD = `# PRD: Billing Export

## Problem Statement
- Problem: admins cannot export billing rows without manual SQL.
- User: finance admin.
- Impact: reconciliation takes 2 days each month.
- Current workaround: support asks engineering for ad hoc exports.

## Users And Jobs
- Finance admin: export invoices and reconcile payments.
- Support lead: answer billing tickets with approved invoice data.

## Goals And Non-Goals
- Goal: ship approved CSV export for billing rows.
- Goal: preserve role-based permissions.
- Non-goal: PDF export.

## Scope
- Included: CSV export with approved columns.
- Deferred: async queue until export exceeds 30s.
- Rejected: PDF export because support cost is high.
- Tradeoff: keep first release synchronous for lower complexity.

## User Stories
- As a finance admin, I can export filtered invoices.
- As a support lead, I can see errors when permissions are missing.

## Requirements
- Behavior: export selected rows exactly once.
- Data: export schema includes approved billing columns only.
- Contract: endpoint returns documented success and error envelopes.

## Success Metrics
- Export completes in <2s for 10000 rows.
- Authorization failures return 100% documented errors.

## Data And Privacy
- PII: approved invoice fields only.
- Permission: finance role required.
- Redaction: logs omit customer emails.
- Retention: generated files expire after 1 day.

## Risks And Open Questions
- Risk: CSV injection; mitigation: escape formulas.
- Open question: exact timezone for date filters.

## Launch And Readiness
- Test: unit, integration, authorization, and CSV injection tests pass.
- Rollout: internal cohort before production.
- Rollback: feature flag disables route.
- Support: support note documents fields.
- Observability: export duration metric and error alert exist.

## Acceptance And Evidence
- 10/10 acceptance: all requirements have verification.
- Verification: targeted and full checks pass.
- Source citations: route and service files cited in plan.
- Blocker: no open blocker remains.
`;

test("validatePrdArtifact accepts a complete PRD", () => {
  assert.deepEqual(validatePrdArtifact(GOOD_PRD), []);
});

test("validatePrdArtifact rejects thin PRDs", () => {
  const issues = validatePrdArtifact(GOOD_PRD.replace("## Success Metrics", "## Metrics").replace("- Contract: endpoint returns documented success and error envelopes.", ""));
  assert.ok(issues.some((issue) => issue.includes("Success Metrics")));
  assert.ok(issues.some((issue) => issue.includes("requirements")));
});
