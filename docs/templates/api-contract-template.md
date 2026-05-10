# API Contract: Admin Billing Export

Use this before frontend or backend implementation when a public API, internal service boundary, webhook, RPC method, generated client, or event stream can affect consumers. This filled example shows the level of specificity required before implementation starts.

## Contract Overview

- Consumer: admin billing dashboard typed client.
- Provider: admin billing API route.
- Business capability: create a redacted CSV export for the last 90 days of billing events.
- Contract type: OpenAPI-compatible HTTP endpoint; GraphQL, RPC, webhook, and event-stream variants are not used for this MVP.
- Owner: billing platform owner.
- Reviewers: API owner, security owner, frontend owner, operations owner.
- Compatibility tier: internal stable admin contract with additive-only response changes during the release.

## Protocol And Versioning

- Protocol: HTTPS JSON request and JSON response.
- Version: `/admin/billing/export` under the current admin API version.
- Compatibility policy: additive fields are allowed; removing fields, changing types, changing error codes, or changing authorization behavior is a breaking change.
- Breaking change policy: update PRD, plan, typed client, backend tests, frontend tests, docs, and changelog before release.
- Changelog location: `CHANGELOG.md`.
- Deprecation window: one release cycle for internal admin clients.
- Consumer notification path: billing platform owner posts release note to admin tooling owners.

## Auth And Authorization

- Authentication: existing admin session or service identity recognized by the admin API.
- Authorization model: existing billing admin permission gates export access.
- Permission checks: route rejects users without billing export permission before reading billing events.
- Token or session handling: no token values are logged, stored in fixtures, or sent to the export service.
- Service-to-service identity: not used for the MVP unless the existing signed URL helper requires it.
- Audit logging requirement: every accepted export request records actor id class, account reference, date range, row count, result, and correlation id without PII.

## Request And Response Contract

- Endpoint, operation, method, topic, or event: `POST /admin/billing/export`.
- Path params: none.
- Query params: none.
- Headers: authenticated admin session, `x-correlation-id` accepted when present.
- Request schema: JSON object with `accountReference`, `startDate`, `endDate`, and `format`.
- Response schema: JSON object with `downloadUrl`, `expiresAt`, `rowCount`, `correlationId`, and `warnings`.
- Required fields: `accountReference`, `startDate`, `endDate`, `format` in request; `downloadUrl`, `expiresAt`, `rowCount`, `correlationId` in response.
- Optional fields: `warnings` may include `empty_result` or `range_clamped`.
- Validation rules: `format` must equal `csv`; date range must be valid ISO date strings; range cannot exceed 90 days; account reference must match authorized account scope.
- Example request payload uses the exact JSON shown below.
  ```json
  {
    "accountReference": "acct_demo_001",
    "startDate": "2026-02-01",
    "endDate": "2026-04-30",
    "format": "csv"
  }
  ```
- Example success response payload uses the exact JSON shown below.
  ```json
  {
    "downloadUrl": "https://downloads.example.test/billing-export-demo.csv",
    "expiresAt": "2026-05-11T12:10:00.000Z",
    "rowCount": 2481,
    "correlationId": "corr_demo_001",
    "warnings": []
  }
  ```
- Redacted fields: customer email, customer name, raw invoice id, card data, payment token, tax id, address, and any credential-like value.

## Error Envelope

- Error format: JSON object with `code`, `message`, `retryable`, `correlationId`, and `details`.
- Machine-readable code: one of `invalid_range`, `forbidden`, `not_found`, `export_timeout`, `rate_limited`, `internal_error`.
- Human-readable message: safe admin-facing string without sensitive data.
- Retryable flag: true for timeout and rate limit, false for invalid range and forbidden access.
- Correlation id: always returned when route execution starts.
- Partial failure shape: `warnings` in success response for non-blocking row omissions; blocking failures use error envelope.
- Rate-limit shape: `code` equals `rate_limited`, `retryable` true, and `details.retryAfterSeconds` present.
- Validation error shape: `code` equals `invalid_range`, `retryable` false, and `details.fields` names invalid request fields only.

## Idempotency And Retry Semantics

- Idempotency key: optional `x-idempotency-key` accepted when existing middleware supports it; otherwise duplicate requests create separate short-lived export URLs but identical CSV content for the same range.
- Retry policy: client may retry `export_timeout` and `rate_limited` after the provided delay.
- Timeout policy: route fails with `export_timeout` before the admin request reaches platform timeout.
- Duplicate request behavior: duplicate valid requests are safe because the export is read-only and audit events include correlation id.
- Rate limit behavior: per-admin and per-account throttles protect storage and signing service.
- Backoff guidance: exponential backoff capped at 60 seconds for retryable failures.
- At-least-once or exactly-once caveat: audit logging is at least once; duplicate audit events are acceptable and correlated.

## Pagination Filtering And Limits

- Pagination model: not exposed to the client; server streams all matching rows within the approved range.
- Filtering model: account reference plus date range only.
- Sorting model: ascending event time, then stable event id.
- Maximum page size: not applicable to the client; internal batch size is bounded by the export service.
- Backpressure or streaming behavior: service streams or batches CSV rows to avoid loading all rows into memory.
- Cursor stability: internal repository iterator must be stable for the duration of the export.
- Default limits: 90-day range and 25,000-row performance target.

## Frontend Integration

- Typed client or equivalent integration: `src/admin/billing-export-client.mjs` wraps request, response, and error mapping.
- Loading state: export button disabled with progress text while request is active.
- Empty state: success response with zero rows shows a safe empty export message and keeps retry available.
- Error state: invalid range, forbidden, timeout, rate limit, and internal error map to actionable admin messages.
- Partial success state: warnings render below the success state without blocking download.
- Offline or degraded state: request failure shows retry and keeps dashboard data intact.
- Cache invalidation: no dashboard cache invalidation because export is read-only.
- Optimistic update policy: no optimistic update; UI waits for signed URL response.

## Mock Data And Scenarios

- Mock contract file: `tests/fixtures/billing-export-contract.fixture.mjs`.
- Scenario fixtures: success with rows, success empty, invalid range, forbidden, timeout, rate limit, and partial warning.
- Success scenario: 2,481 rows for `acct_demo_001`, signed URL expires in 10 minutes.
- Validation failure scenario: 120-day range returns `invalid_range`.
- Authorization failure scenario: missing billing export permission returns `forbidden`.
- Retry or timeout scenario: export generation exceeds route budget and returns retryable `export_timeout`.
- Partial failure scenario: non-critical legacy row omission returns warning without exposing raw payload.
- Backward-compatibility fixture: old client ignores additive `warnings` field without breaking.

## Compatibility And Deprecation

- Backward compatibility: response fields remain stable through the release.
- Forward compatibility: clients ignore unknown additive fields.
- Deprecation window: one release cycle for internal admin clients.
- Migration notes: no data migration is required for the MVP.
- Consumer notification: release note names endpoint, range limit, CSV columns, and rollback.
- Rollback behavior: disable UI action and remove route registration; no persisted export jobs need cleanup.
- Version skew handling: typed client and route ship together in the same package version.

## Security Privacy And Observability

- PII handling: allowlist CSV columns only and exclude customer identifiers beyond account reference.
- Secrets handling: signed URL secret stays in existing signing helper and never appears in logs or tests.
- Data retention: signed URL expires in 10 minutes; CSV retention follows existing download service policy.
- Redaction: request, response, logs, audit events, fixtures, and screenshots exclude raw payment and customer fields.
- Audit logging: accepted export attempts and rejected permission attempts are recorded without PII.
- Metrics: export count, failure count, duration, row count bucket, and retryable error count.
- Alerts: repeated internal failures or timeout rate above threshold alerts operations owner.
- Trace fields: correlation id, account reference class, actor class, duration, result, and error code.
- Dashboard: existing operations dashboard or structured log query records export health.

## Verification

- Contract lint command: `node --test tests/admin/billing-export-route.test.mjs`.
- Breaking-change check: route and typed client fixture compatibility test.
- Backend tests: `node --test tests/billing/export-service.test.mjs`.
- Frontend integration tests: `node --test tests/admin/billing-export-client.test.mjs`.
- Mock scenario tests: `node --test tests/fixtures/billing-export-contract.fixture.test.mjs`.
- Security test: permission and redaction assertions in route and service tests.
- Observability check: structured log or audit assertion verifies correlation id, row count, duration, and safe fields.
- Rollback check: config or route disablement path documented and smoke tested before release.
