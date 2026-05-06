---
name: mock-data-contract
description: >-
  Data-fed prototypes and frontend-before-backend workflows must use
  schema-tied mock contracts, scenario fixtures, and backend integration notes
  instead of ad hoc JSON samples.
applies-to:
  - any
mandatory: false
version: 1
last-verified: 2026-05-07T00:00:00.000Z
related-rules:
  - prototype-to-production
  - confidence-discipline
---

# Mock Data Contract

## Why this rule exists

Mock data often looks harmless, but it decides what the frontend thinks the backend will send. If local fixtures are ad hoc, teams miss empty states, permission states, slow/loading behavior, validation envelopes, pagination, partial responses, and schema drift until integration.

Concrete consequence of not following: a prototype can be approved and implemented against a fictional backend shape. The frontend then needs rework when real endpoints arrive.

## When this rule applies

- A prototype uses `interaction: data-fed`.
- A frontend feature starts before backend endpoints are complete.
- The design spec includes API-backed states, validation, permissions, pagination, or server errors.
- A prototype handoff is used by a stack developer before backend integration is done.

This rule does not apply to static visual-only prototypes, purely editorial landing pages with no API state, or production seed data.

## What to do

1. Produce `mocks/mock-contract.json` with contract status, owner, schema refs, endpoint mapping, entities, PII policy, and drift rule.
2. Produce `mocks/mock-scenarios.json` covering success, loading, slow, empty, error, permission, validation, partial, and large-list scenarios where relevant.
3. Produce `mocks/api-fixtures/<scenario>.json` for every scenario id.
4. Use synthetic data only. No real PII, secrets, tokens, or production exports.
5. In handoff, copy the mock bundle to `handoff/mocks/` and add `handoff/backend-integration.md`.
6. If no API/schema/data-model source exists, mark the contract `provisional` and list backend questions. Do not claim backend readiness.

## Examples

### Bad

```json
{
  "users": [
    { "name": "Jane", "email": "jane@example.com" }
  ]
}
```

Why this is bad: no endpoint, no owner, no error envelope, no empty/loading states, and no drift rule.

### Good

```json
{
  "contractStatus": "schema-backed",
  "owner": "api-designer",
  "schemaRefs": ["openapi.yaml#/paths/~1v1~1users/get"],
  "endpoints": [{ "method": "GET", "path": "/v1/users", "fixtureSet": "users-list" }],
  "driftRule": "Any removed field, renamed property, narrowed type, or error-envelope change requires mock update and frontend review."
}
```

Why this is good: the frontend can build against a named response contract and backend changes have a visible review rule.

## Enforcement

- `supervibe:mock-data-contract` creates the required contract and fixtures.
- `mock-data-designer` owns scenario coverage and synthetic-data checks.
- `supervibe:prototype` must require this bundle for data-fed prototypes.
- `supervibe:prototype-handoff` must include mock contract files and backend integration notes.
- `validate:mock-data-contracts` checks that plugin guidance keeps these gates in place.

## Related rules

- `prototype-to-production` - approved prototype and final tokens are the visual implementation source.
- `confidence-discipline` - missing scenario coverage or provisional backend shape caps confidence.

## See also

- `agents/_ops/mock-data-designer.md`
- `skills/mock-data-contract/SKILL.md`
- `skills/prototype/SKILL.md`
- `skills/prototype-handoff/SKILL.md`
