# API Contract: Agent Readiness Report

## Contract Overview

- Consumer: Supervibe CLI and status users.
- Provider: Maturity report scripts.
- Business capability: Explain readiness gates and blockers.
- Contract type: RPC-style CLI JSON and text output.

## Protocol And Versioning

- Protocol: Local CLI JSON output.
- Version: schemaVersion 1.
- Compatibility policy: Additive fields are allowed.
- Breaking change policy: Renaming existing fields requires changelog and tests.
- Changelog location: CHANGELOG.md.

## Auth And Authorization

- Authentication: Local process permissions.
- Authorization model: Same repository access as the user.
- Permission checks: No privileged operation is performed.
- Token or session handling: No tokens are read.

## Request And Response Contract

- Endpoint, operation, or method: `node scripts/supervibe-maturity-report.mjs --json`.
- Request schema: Optional flags for root and json output.
- Response schema: checks array, counts object, version, and pass boolean.
- Required fields: schemaVersion, version, counts, checks, pass.
- Optional fields: agentSystemReport.
- Validation rules: checks must include artifact readiness when templates and validators exist.

## Error Envelope

- Error format: CLI exits non-zero and writes a readable error.
- Machine-readable code: script name and failing check id.
- Human-readable message: Evidence text explains the blocker.
- Retryable flag: retry after fixing the check.
- Correlation id: not required for local CLI.
- Partial failure shape: passing checks remain visible while failing checks are listed.

## Idempotency And Retry Semantics

- Idempotency key: command input path and current workspace state.
- Retry policy: rerun after code or artifact changes.
- Timeout policy: local script should finish under one minute.
- Duplicate request behavior: repeated calls return the same result for the same workspace.
- Rate limit behavior: no rate limit for local CLI.

## Pagination Filtering And Limits

- Pagination model: no pagination.
- Filtering model: optional future check filters must not change default output.
- Sorting model: stable check order.
- Maximum page size: all checks are returned.
- Backpressure or streaming behavior: not required.

## Frontend Integration

- Typed client or equivalent integration: JSON output can be consumed by a local dashboard.
- Loading state: dashboard shows command running.
- Empty state: dashboard shows no current user artifacts but fixture gates remain.
- Error state: dashboard shows failing check evidence.
- Partial success state: dashboard separates passing checks from blockers.
- Offline or degraded state: local CLI still works without network.

## Mock Data And Scenarios

- Mock contract file: this fixture.
- Scenario fixtures: decision brief and API contract fixtures.
- Success scenario: all artifact fixtures validate.
- Validation failure scenario: missing error envelope fails.
- Authorization failure scenario: local process permission error is reported.
- Retry or timeout scenario: rerun after fixing artifacts.

## Compatibility And Deprecation

- Backward compatibility: existing check ids remain stable.
- Deprecation window: one minor release before removing fields.
- Migration notes: changelog documents changed output.
- Consumer notification: release notes and README version update.

## Security Privacy And Observability

- PII handling: no PII is collected.
- Secrets handling: no secrets are read.
- Audit logging: release verification commands are captured in terminal output.
- Metrics: check pass count and failure evidence are reported.
- Alerts: failing maturity command exits non-zero.

## Verification

- Contract lint command: `npm run validate:api-contracts`.
- Breaking-change check: `node --test tests/api-contract-validator.test.mjs`.
- Backend tests: `node --test tests/supervibe-maturity-report.test.mjs`.
- Frontend integration tests: dashboard consumers can use `--json` output.
- Mock scenario tests: `npm run validate:decision-briefs`.

