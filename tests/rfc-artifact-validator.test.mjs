import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validateRfcArtifact } from "../scripts/validate-rfc-artifacts.mjs";

const GOOD_RFC = `# RFC: Billing Export Endpoint

## Summary
- Owner: backend lead.
- Status: proposed.
- Outcome: add an audited CSV export endpoint.

## Motivation
- Finance needs self-serve monthly reconciliation without engineering intervention.

## Proposal
- Architecture: controller validates filters and service streams rows.
- Data: export schema uses approved invoice fields.
- API: GET /billing/export returns CSV or an error envelope.
- Failure mode: invalid filters return a documented validation error.

## Contracts
- Schema: invoice export row has stable columns.
- Event: audit event records export request.
- Error: validation and authorization errors use the standard envelope.
- Permission: finance role required.
- Observability: duration metric, failure counter, and trace id emitted.

## Compatibility And Migration
- Backward compatibility: existing routes unchanged.
- Migration: no database migration required.
- Version: v1 endpoint.
- Consumer: admin UI and support docs consume the contract.

## Rollout And Rollback
- Rollout: internal cohort then production.
- Rollback: feature flag disables route.
- Flag: billingExportCsv.
- Owner: release lead.
- Stop: halt if authorization failures exceed 1%.

## Verification Plan
- Unit: CSV escaping tests.
- Integration: route tests.
- Contract: API envelope tests.
- Performance: stream budget test.
- Security: role and redaction tests.

## Security Privacy Observability
- PII: only approved invoice fields.
- Secret: no secret values in logs.
- Metric: export duration.
- Alert: error-rate alert.
- Trace: correlation id on each request.

## Open Questions
- Confirm timezone for month filters.
`;

test("validateRfcArtifact accepts a complete RFC", () => {
  assert.deepEqual(validateRfcArtifact(GOOD_RFC), []);
});

test("validateRfcArtifact rejects missing rollout contract", () => {
  const issues = validateRfcArtifact(GOOD_RFC.replace("## Rollout And Rollback", "## Launch"));
  assert.ok(issues.some((issue) => issue.includes("Rollout And Rollback")));
});

test("official RFC template validates as a canonical artifact example", async () => {
  const markdown = await readFile("docs/templates/RFC-template.md", "utf8");
  assert.deepEqual(validateRfcArtifact(markdown), []);
});

test("validateRfcArtifact rejects heading-complete but empty RFCs", () => {
  const shallow = `# RFC: Empty

## Summary
- Summary.

## Motivation
- Motivation.

## Proposal
- Proposal.

## Contracts
- Contract.

## Compatibility And Migration
- Migration.

## Rollout And Rollback
- Rollout.

## Verification Plan
- Verification.

## Security Privacy Observability
- Security.

## Open Questions
- Question.
`;
  const issues = validateRfcArtifact(shallow);
  assert.ok(issues.some((issue) => issue.includes("summary")));
  assert.ok(issues.some((issue) => issue.includes("proposal")));
  assert.ok(issues.some((issue) => issue.includes("contracts")));
});
