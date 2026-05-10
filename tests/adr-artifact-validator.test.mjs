import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validateAdrArtifact } from "../scripts/validate-adr-artifacts.mjs";

const GOOD_ADR = `# ADR: Use Streaming Billing Export

## Status
- Accepted.

## Context
- Constraint: exports can include 10000 rows.
- Driver: finance needs reliable monthly reconciliation.
- Current approach: manual SQL.
- Problem: manual export is slow and hard to audit.

## Decision
- Decision: implement a streaming service owned by backend because memory use stays bounded.
- Owner: backend lead.

## Alternatives
- Buffered response: benefit simple code, cost high memory, risk timeout.
- Async job: benefit scale, cost queue operations, risk support complexity.
- Streaming service: benefit bounded memory, cost stream tests, risk client compatibility.

## Consequences
- Positive: lower memory use and better large-export behavior.
- Negative: stream handling tests are required.
- Tradeoff: async status tracking remains deferred.

## Compatibility And Migration
- Compatibility: existing billing routes remain unchanged.
- Migration: no data migration required.
- Consumer: admin UI consumes the new endpoint.
- Version: route is introduced as v1.

## Rollback And Review
- Rollback: disable feature flag and remove route exposure.
- Review date: 2026-06-01.
- Trigger: revisit if exports exceed 30s.
- Owner: backend lead.

## Evidence
- Source: billing service code and route map.
- CodeGraph: impact search covers billing route callers.
- RAG: source retrieval cites export patterns.
- Verification: unit and integration tests pass.
`;

test("validateAdrArtifact accepts a complete ADR", () => {
  assert.deepEqual(validateAdrArtifact(GOOD_ADR), []);
});

test("validateAdrArtifact rejects missing alternatives", () => {
  const issues = validateAdrArtifact(GOOD_ADR.replace("- Async job: benefit scale, cost queue operations, risk support complexity.\n- Streaming service: benefit bounded memory, cost stream tests, risk client compatibility.", ""));
  assert.ok(issues.some((issue) => issue.includes("alternatives")));
});

test("official ADR template validates as a canonical artifact example", async () => {
  const markdown = await readFile("docs/templates/ADR-template.md", "utf8");
  assert.deepEqual(validateAdrArtifact(markdown), []);
});

test("validateAdrArtifact rejects heading-complete but empty ADRs", () => {
  const shallow = `# ADR: Empty

## Status
- Accepted.

## Context
- Context.

## Decision
- Decision.

## Alternatives
- A.
- B.
- C.

## Consequences
- Consequence.

## Compatibility And Migration
- Compatibility.

## Rollback And Review
- Rollback.

## Evidence
- Evidence.
`;
  const issues = validateAdrArtifact(shallow);
  assert.ok(issues.some((issue) => issue.includes("context")));
  assert.ok(issues.some((issue) => issue.includes("decision")));
  assert.ok(issues.some((issue) => issue.includes("alternatives")));
});
