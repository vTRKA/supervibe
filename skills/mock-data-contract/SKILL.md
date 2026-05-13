---
name: mock-data-contract
namespace: process
description: >-
  Use WHEN a prototype, frontend handoff, or backend integration needs
  realistic mock data TO create schema-tied mock contracts and scenario
  fixtures before frontend implementation. Triggers: 'mock data contract',
  'prepare mocks', 'data-fed prototype', 'frontend before backend'.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
  - Edit
phase: handoff
prerequisites:
  - prototype-or-spec-exists
emits-artifact: mock-data-contract
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1
last-verified: 2026-05-07T00:00:00.000Z
---

# Mock Data Contract

Create a contract-backed mock data bundle for data-fed prototypes and frontend-before-backend work. The output makes mock data useful for design, frontend implementation, API design, and backend integration without pretending local JSON is the backend.

## When to invoke

- The prototype interaction depth is `data-fed`.
- A screen spec includes loading, empty, error, permission, validation, partial, pagination, or large-list data states.
- Frontend work must start before backend endpoints are available.
- `/supervibe-design` reaches prototype or handoff with fake API responses.
- A stack developer receives a prototype handoff and needs to know how mocks map to the eventual backend.

Do not invoke for purely visual prototypes, static marketing pages with no API state, or production seed data.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source
of truth, preserve retrieval evidence, apply scope safety, use real producers
with runtime receipts for durable delegated outputs, verify before completion
claims, and keep confidence below gate when evidence is partial.

## Step 0 - Read source of truth

Before writing fixtures, read the relevant available files:

- `.supervibe/artifacts/prototypes/<slug>/config.json`
- `.supervibe/artifacts/prototypes/<slug>/spec.md`
- `.supervibe/artifacts/prototypes/<slug>/content/copy.md`
- `.supervibe/artifacts/prototypes/<slug>/mocks/` if it already exists
- `.supervibe/artifacts/prototypes/<slug>/.approval.json` when handoff is requested
- API specs such as `openapi.yaml`, `openapi.json`, `schema.graphql`, `*.proto`, or `asyncapi.yaml`
- Data model artifacts such as migrations, ORM models, Prisma schema, SQL schema, or data-modeler output
- API designer output, PRD decision sections, and project memory entries for contracts, error envelopes, pagination, auth, and PII rules

If no API/schema/data-model source exists, create a **provisional** contract with explicit backend questions. Do not mark it schema-backed.

## Decision tree

```
Is interaction data-fed?
  no  -> stop; no mock-data contract needed.
  yes -> continue.

Does an API/schema contract exist?
  yes -> derive mock-contract.json schemaRefs from it.
  no  -> check data model / spec / API designer notes.

Only product/spec shape exists?
  -> create contractStatus="provisional" and list backendQuestions.

Does the spec name states?
  yes -> cover every named state in mock-scenarios.json.
  no  -> require baseline states: success, loading, slow, empty, error, permission, validation, partial, large-list where relevant.

Does any fixture include real PII, secrets, or production export data?
  yes -> replace with synthetic values before handoff.
  no  -> continue.

Is handoff being produced?
  yes -> copy mocks into handoff/mocks/ and add backend-integration.md.
  no  -> keep mocks under prototype root and record readiness state.
```

## Procedure

1. Resolve `<slug>` and target prototype root.
2. Classify `contractStatus`: `api-backed`, `schema-backed`, `data-model-backed`, or `provisional`.
3. Create `.supervibe/artifacts/prototypes/<slug>/mocks/` if absent.
4. Write `.supervibe/artifacts/prototypes/<slug>/mocks/mock-contract.json` from `templates/mock-data/mock-contract.json.tpl`.
5. Write `.supervibe/artifacts/prototypes/<slug>/mocks/mock-scenarios.json` from `templates/mock-data/mock-scenarios.json.tpl`.
6. Write one JSON fixture per scenario under `.supervibe/artifacts/prototypes/<slug>/mocks/api-fixtures/`.
7. Write `.supervibe/artifacts/prototypes/<slug>/mocks/README.md` with data ownership, PII policy, backend questions, and replacement steps.
8. When producing handoff, copy the same mock bundle into `.supervibe/artifacts/prototypes/<slug>/handoff/mocks/` and write `handoff/backend-integration.md` from `templates/mock-data/backend-integration.md.tpl`.
9. Verify scenario coverage, schema refs, PII safety, and backend drift notes.
10. Score with `supervibe:confidence-scoring`.

## When not to use

- Do not use this skill to bypass the command or workflow that owns durable artifacts.
- Do not use it when source evidence, RAG/CodeGraph, or required verification is missing.
- Do not use it to replace a specialist producer, worker, or reviewer that must issue runtime evidence.

## Common rationalizations

- "This is small, so no source check is needed" - reject when the skill changes code, config, or durable artifacts.
- "The user asked for speed, so skip receipts" - reject when durable work, delegation, or review is claimed.
- "Existing prose is enough evidence" - reject when validators or command output are required.

## Red flags

- A durable artifact changes without a command, receipt, or verification path.
- The skill is used outside its phase without an explicit handoff.
- Claims of completion appear before evidence and confidence scoring.

## Checklist

- Source of truth read.
- Scope and owner confirmed.
- RAG/CodeGraph/memory requirement decided.
- Evidence artifact or command recorded.
- Stop condition and next handoff clear.

## Failure modes

- Inline emulation replaces a required producer or reviewer.
- Broad use of the skill slows delivery without improving evidence.
- Missing verification lets stale assumptions pass as production-ready.

## Output contract

Returns:

```markdown
=== Mock Data Contract ===
Slug:           <slug>
Contract:       .supervibe/artifacts/prototypes/<slug>/mocks/mock-contract.json
Scenarios:      .supervibe/artifacts/prototypes/<slug>/mocks/mock-scenarios.json
Fixtures:       .supervibe/artifacts/prototypes/<slug>/mocks/api-fixtures/
Handoff copy:   <pending | .supervibe/artifacts/prototypes/<slug>/handoff/mocks/>
Backend notes:  <pending | .supervibe/artifacts/prototypes/<slug>/handoff/backend-integration.md>
Status:         <api-backed | schema-backed | data-model-backed | provisional>

Confidence: <N>.<dd>/10
Override:   <true|false>
Rubric:     agent-delivery
```

## Guard rails

- DO NOT write happy-path-only mock data for data-fed prototypes.
- DO NOT use real PII, access tokens, secrets, production exports, or customer-identifying strings in fixtures.
- DO NOT call provisional mocks backend-ready; list the missing owner decision and backend questions.
- DO NOT let mock shape diverge from API/schema/data model without a drift note.
- DO NOT hand off data-fed prototypes without `mock-contract.json`, `mock-scenarios.json`, `api-fixtures/`, and backend integration notes.
- ALWAYS preserve the distinction between UI state, API response shape, and backend persistence shape.

## Verification

This skill's output is verified by:

- `mock-contract.json` includes `contractStatus`, `owner`, `schemaRefs`, `endpoints`, `entities`, `piiPolicy`, and `driftRule`
- `mock-scenarios.json` includes scenario ids for success and every applicable non-happy-path state
- `api-fixtures/` includes one fixture file per scenario id
- Fixture values are synthetic and contain no secrets, tokens, or production export markers
- `backend-integration.md` exists in handoff for approved data-fed prototypes
- Downstream prototype or handoff summary names the mock contract status and unresolved backend questions

## Related

- `supervibe:_ops:mock-data-designer` - specialist agent for producing this bundle
- `supervibe:_ops:api-designer` - API contract owner
- `supervibe:_ops:data-modeler` - data-model owner
- `supervibe:prototype` - data-fed prototype consumer
- `supervibe:prototype-handoff` - packages mock data for stack developers
- `rules/mock-data-contract.md` - rule-level gate for frontend-before-backend workflows
