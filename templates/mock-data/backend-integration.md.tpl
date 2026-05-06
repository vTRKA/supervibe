# Backend Integration: <slug>

## Contract Status

- Status: `<api-backed|schema-backed|data-model-backed|provisional>`
- Owner: `<api-designer|data-modeler|backend-owner>`
- Source artifacts: `<openapi.yaml|schema.graphql|spec.md|data-model.md>`

## Local Mock Bundle

- Contract: `mocks/mock-contract.json`
- Scenarios: `mocks/mock-scenarios.json`
- Fixtures: `mocks/api-fixtures/`

## Endpoint Mapping

| Prototype fetch | Live endpoint | Scenario coverage | Notes |
| --- | --- | --- | --- |
| `mocks/api-fixtures/success.json` | `GET /v1/<resource>` | success, empty, error, permission, validation, partial, large-list | Replace only after envelopes match. |

## Backend Questions

- `<question required before live integration>`

## Switch-To-Live Rule

Replace local fixture fetches only after the live endpoint returns the same response envelope for every required scenario. Any removed field, renamed property, narrowed type, changed requiredness, pagination change, or error-envelope change requires a mock contract update and frontend review.

## Verification Before Merge

- Contract drift check completed against current API/schema source.
- All required UI states still render against live or mocked responses.
- Error envelope, validation shape, permission state, and pagination behavior are covered.
- No real PII, tokens, secrets, or production exports exist in fixtures.
