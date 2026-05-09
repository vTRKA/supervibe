# API Contract Template

Use this before frontend or backend implementation when a public API, internal service boundary, webhook, RPC method, or generated client can affect consumers.

## Contract Overview

- Consumer:
- Provider:
- Business capability:
- Contract type: OpenAPI, GraphQL, RPC, webhook, or event.

## Protocol And Versioning

- Protocol:
- Version:
- Compatibility policy:
- Breaking change policy:
- Changelog location:

## Auth And Authorization

- Authentication:
- Authorization model:
- Permission checks:
- Token or session handling:

## Request And Response Contract

- Endpoint, operation, or method:
- Request schema:
- Response schema:
- Required fields:
- Optional fields:
- Validation rules:

## Error Envelope

- Error format:
- Machine-readable code:
- Human-readable message:
- Retryable flag:
- Correlation id:
- Partial failure shape:

## Idempotency And Retry Semantics

- Idempotency key:
- Retry policy:
- Timeout policy:
- Duplicate request behavior:
- Rate limit behavior:

## Pagination Filtering And Limits

- Pagination model:
- Filtering model:
- Sorting model:
- Maximum page size:
- Backpressure or streaming behavior:

## Frontend Integration

- Typed client or equivalent integration:
- Loading state:
- Empty state:
- Error state:
- Partial success state:
- Offline or degraded state:

## Mock Data And Scenarios

- Mock contract file:
- Scenario fixtures:
- Success scenario:
- Validation failure scenario:
- Authorization failure scenario:
- Retry or timeout scenario:

## Compatibility And Deprecation

- Backward compatibility:
- Deprecation window:
- Migration notes:
- Consumer notification:

## Security Privacy And Observability

- PII handling:
- Secrets handling:
- Audit logging:
- Metrics:
- Alerts:

## Verification

- Contract lint command:
- Breaking-change check:
- Backend tests:
- Frontend integration tests:
- Mock scenario tests:

