# ADR: Example Production Decision

Use this as a canonical ADR shape. Replace the example values with project-specific facts while preserving every section and evidence requirement.

## Status

- Accepted.

## Context

- Constraint: the first release must be production-safe and deployable without adding queue operations.
- Driver: finance needs reliable monthly reconciliation without engineering intervention.
- Current approach: manual SQL export handled by engineering.
- Problem: manual export is slow, hard to audit, and not supportable at release scale.

## Decision

- Decision: implement a streaming export service owned by the backend lead because it keeps memory bounded while preserving a small MVP production slice.
- Owner: backend lead.

## Alternatives

- Buffered response: benefit simple implementation, cost high memory use, risk timeout for large accounts.
- Async job: benefit scale headroom, cost queue operations and support workflow, risk scope bloat for MVP.
- Streaming service: benefit bounded memory and direct user value, cost stream tests, risk client compatibility.

## Consequences

- Positive: large exports use bounded memory and the release remains operationally simple.
- Negative: stream handling and client cancellation tests are required.
- Tradeoff: async status tracking remains deferred until production evidence justifies it.

## Compatibility And Migration

- Compatibility: existing billing routes remain unchanged.
- Migration: no database migration is required for the first release.
- Consumer: admin UI and support documentation consume the new endpoint.
- Version: the endpoint is introduced as v1.

## Rollback And Review

- Rollback: disable the feature flag and remove route exposure.
- Review date: 2026-06-01.
- Trigger: revisit if export duration exceeds 30s or support escalations exceed 2 incidents in a week.
- Owner: backend lead.

## Evidence

- Source: route map, permission policy, and export service pattern cited in the implementation plan.
- CodeGraph: impact search covers route callers and service dependencies.
- RAG: source retrieval cites existing export, audit, and authorization patterns.
- Verification: unit, integration, authorization, and rollback checks pass before release.
