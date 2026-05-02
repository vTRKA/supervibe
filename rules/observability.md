---
name: observability
description: >-
  Structured logs (JSON), metrics (RED/USE), distributed tracing, with
  consistent fields and correlation IDs across services. Triggers:
  'observability', 'logging', 'трейсинг'.
applies-to:
  - any
mandatory: false
version: 1
last-verified: 2026-04-27T00:00:00.000Z
related-rules:
  - best-practices-2026
  - infrastructure-patterns
---

# Observability

## Why this rule exists

You can't fix what you can't see. Logs without structure can't be queried. Metrics without dimensions are aggregates only. Traces without correlation IDs lose context.

Concrete consequence of NOT following: 3am incident, no idea what went wrong, hours debugging instead of minutes.

## When this rule applies

- Any production system
- Any system with >1 service (correlation matters)

## What to do

### Logs

- **Format**: JSON (machine queryable)
- **Required fields**: `ts`, `level`, `service`, `trace_id`, `request_id`, `message`
- **Levels**: `error` / `warn` / `info` / `debug` (debug off in prod usually)
- **No PII in logs**: scrub before write (see `privacy-pii` rule)

### Metrics (RED for services, USE for resources)

- **RED**: Rate, Errors, Duration (per service / endpoint)
- **USE**: Utilization, Saturation, Errors (per resource: CPU, memory, disk, network)
- **SLO-driven**: alert on SLO violations, not arbitrary thresholds
- **Cardinality discipline**: avoid high-cardinality labels (user_id) in metrics → use traces

### Traces

- **Distributed tracing**: OpenTelemetry standard
- **Correlation ID**: passed via header (`traceparent`), included in every log
- **Trace sampling**: 100% errors + 1% baseline typical

### Dashboards

- One per service: latency p50/p95/p99, error rate, throughput, saturation
- Linked from runbooks

### Alerts

- Symptom-based, not cause-based ("error rate >1%" not "DB connection pool >80%")
- Actionable (every alert has runbook URL)
- Pageable vs notification (only pages for SLO violations)

## Examples

### Bad

```python
print(f"User {user_email} did action X")  # PII + unstructured
```

### Good

```python
logger.info("user_action", extra={
  "user_id_hash": hash_user_id(user_id),
  "action": "X",
  "trace_id": ctx.trace_id,
  "request_id": ctx.request_id
})
```

### Bad

```python
metrics.increment("api.calls")  # no dimensions; can't slice by endpoint
```

### Good

```python
metrics.increment("http_requests_total", tags=["method:GET", "endpoint:/users", "status:200"])
```

## Enforcement

- Logger config rejects unstructured logs
- Metrics linter (Prometheus rules) checks cardinality
- Tracing middleware mandatory
- Runbook required per alert

## Related rules

- `best-practices-2026` — structured logging is part of modern stack
- `infrastructure-patterns` — observability tooling per tier

## See also

- https://opentelemetry.io/
- "Observability Engineering" book
