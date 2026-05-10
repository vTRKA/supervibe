# API Contract: {contract-name}

Use this before frontend or backend implementation when a public API, internal service boundary, webhook, RPC method, generated client, or event stream can affect consumers.

## Contract Overview

- Consumer:
- Provider:
- Business capability:
- Contract type: OpenAPI, GraphQL, RPC, webhook, or event.
- Owner:
- Reviewers:
- Compatibility tier:

## Protocol And Versioning

- Protocol:
- Version:
- Compatibility policy:
- Breaking change policy:
- Changelog location:
- Deprecation window:
- Consumer notification path:

## Auth And Authorization

- Authentication:
- Authorization model:
- Permission checks:
- Token or session handling:
- Service-to-service identity:
- Audit logging requirement:

## Request And Response Contract

- Endpoint, operation, method, topic, or event:
- Path params:
- Query params:
- Headers:
- Request schema:
- Response schema:
- Required fields:
- Optional fields:
- Validation rules:
- Example request:
- Example success response:
- Redacted fields:

## Error Envelope

- Error format:
- Machine-readable code:
- Human-readable message:
- Retryable flag:
- Correlation id:
- Partial failure shape:
- Rate-limit shape:
- Validation error shape:

## Idempotency And Retry Semantics

- Idempotency key:
- Retry policy:
- Timeout policy:
- Duplicate request behavior:
- Rate limit behavior:
- Backoff guidance:
- At-least-once or exactly-once caveat:

## Pagination Filtering And Limits

- Pagination model:
- Filtering model:
- Sorting model:
- Maximum page size:
- Backpressure or streaming behavior:
- Cursor stability:
- Default limits:

## Frontend Integration

- Typed client or equivalent integration:
- Loading state:
- Empty state:
- Error state:
- Partial success state:
- Offline or degraded state:
- Cache invalidation:
- Optimistic update policy:

## Mock Data And Scenarios

- Mock contract file:
- Scenario fixtures:
- Success scenario:
- Validation failure scenario:
- Authorization failure scenario:
- Retry or timeout scenario:
- Partial failure scenario:
- Backward-compatibility fixture:

## Compatibility And Deprecation

- Backward compatibility:
- Forward compatibility:
- Deprecation window:
- Migration notes:
- Consumer notification:
- Rollback behavior:
- Version skew handling:

## Security Privacy And Observability

- PII handling:
- Secrets handling:
- Data retention:
- Redaction:
- Audit logging:
- Metrics:
- Alerts:
- Trace fields:
- Dashboard:

## Verification

- Contract lint command:
- Breaking-change check:
- Backend tests:
- Frontend integration tests:
- Mock scenario tests:
- Security test:
- Observability check:
- Rollback check:
