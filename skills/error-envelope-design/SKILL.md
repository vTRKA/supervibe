---
name: error-envelope-design
namespace: app-excellence
description: >-
  Use WHEN designing API error responses TO pick a consistent envelope (RFC 7807
  problem+json / GraphQL union / gRPC status), define retry semantics, partial
  failure shapes. Triggers: 'error envelope', 'API ошибки формат', 'формат
  ошибок', 'problem+json'.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
phase: design
prerequisites: []
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1
last-verified: 2026-04-27T00:00:00.000Z
---

# Error Envelope Design

## When to invoke

WHEN designing the first endpoint of a new API. WHEN extending an API whose error shape is inconsistent across endpoints. WHEN clients keep parsing error strings to decide whether to retry. WHEN a 500 response actually means a validation failure — i.e. the envelope has lost its semantics.

The skill produces a single answer for the project: one envelope shape, one error-code registry, one retry contract, one partial-failure pattern. Mixed envelopes are the most common cause of unreliable client retries.

## Step 0 — Read source of truth (required)

1. Read API style guide / OpenAPI / GraphQL schema / proto files for the project.
2. Sample real error responses from at least three endpoints — confirm whether the shape is already consistent or already drifted.
3. Read the gateway / framework defaults (Express, Fastify, NestJS, ASP.NET, Spring, gRPC) — they ship default envelopes that often leak.
4. Read RFC 7807 (problem+json) for HTTP-JSON projects.
5. Read the relevant GraphQL spec for error extensions and union-error patterns; or the canonical google.rpc.Status and google.rpc.ErrorInfo for gRPC.
6. Inventory error codes already in use: `grep -rE "ErrorCode|errorCode|code:\s*['\"]" src/`. The result is the seed of the registry.

## Decision tree

```
Transport?
  HTTP/JSON         → RFC 7807 problem+json (type, title, status, detail, instance, code, errors[])
  GraphQL           → Errors-as-data via union types on mutations; reserve top-level `errors[]` for transport faults
  gRPC              → google.rpc.Status with typed details (ErrorInfo, BadRequest, RetryInfo, QuotaFailure)

Is the failure transient?
  YES (5xx, 429, UNAVAILABLE, ABORTED) → MUST include Retry-After / RetryInfo + idempotency guidance
  NO  (4xx, FAILED_PRECONDITION, INVALID_ARGUMENT) → MUST NOT advertise retry; clients that retry are buggy

Is the operation a batch / multi-resource call?
  YES → partial failure shape: per-item status, never an all-or-nothing 500
  NO  → standard envelope

Is the error machine-actionable by the client?
  YES → stable code from the registry (e.g. `payment.card_declined`)
  NO  → generic code (`internal_error`) + correlation id, never a free-form string the client must parse
```

## Procedure

1. **Pick the envelope** from the decision tree and freeze it in the API style guide. New endpoints that violate it must be blocked at review.
2. **Build the error-code registry**: codes are dotted, lowercase, stable, namespaced by domain (`auth.token_expired`, `billing.insufficient_funds`). Store in a single file (TypeScript enum, Go const block, Java enum, proto enum). Codes are append-only — never reuse, never silently rename.
3. **Map HTTP status / gRPC code per error code** at the registry level, not at the throw site. This guarantees consistency and prevents 500-for-validation regressions.
4. **Retry contract**: every transient code carries `Retry-After` (seconds) or `google.rpc.RetryInfo`. Document the retry algorithm clients should use (exponential backoff with jitter, max attempts) in the style guide. Non-transient codes MUST omit retry hints.
5. **Idempotency-key responses**: if the endpoint accepts an `Idempotency-Key`, define what a replay returns (the original response, not a fresh one) and how long the key is honoured. The key contract is part of the error envelope spec.
6. **Partial failure shape**: for batch endpoints, return 200 (or `Status.OK` with details) with a per-item array `{ id, status, error? }`. Never collapse a 1-of-100 failure into a 500.
7. **Stack traces and internals never cross the boundary**: clients receive a stable `code` plus a `correlationId`. Stack traces, SQL fragments, and internal hostnames are logged server-side only.
8. **Deprecation policy for codes**: introduce `Deprecation` / `Sunset` headers (HTTP) or a `deprecated` flag in the registry. Maintain old codes for at least one major version with monitoring on residual usage.
9. **Output**: the envelope spec + registry skeleton (see Output contract).
10. **Score** — invoke `supervibe:confidence-scoring` with artifact-type=agent-output; ≥9 required to mark this skill complete.

## Output contract

```
Envelope: <RFC 7807 | GraphQL union | google.rpc.Status>
Required fields: <list>
Registry location: <path>
Code naming rule: <regex / pattern>
Status mapping: <code → http/grpc status>  (centralised, not at throw sites)
Retry contract:
  Transient codes: <list> + Retry-After source
  Non-transient codes: <list>  (no retry hints)
  Client algorithm: <expo backoff parameters>
Idempotency:
  Header / field: <Idempotency-Key>
  Replay window: <seconds>
  Replay shape: <verbatim original response>
Partial failure shape: <schema for per-item status>
Internal data leak rules: <forbidden fields list>
Deprecation: <Sunset header + monitoring metric>
```

## Anti-patterns

- **stringly-typed-errors** — clients parse `error.message` to branch logic; any wording change is a breaking change.
- **leaking-stack-trace-to-client** — security disclosure plus tight coupling to internal modules.
- **inconsistent-error-shape** — `{error: "..."}` here, `{message: "..."}` there, `{detail, code}` elsewhere; clients write a switch per endpoint.
- **no-error-code-registry** — codes invented at throw sites; duplicates and typos guaranteed.
- **500-for-validation-failures** — clients retry, alarms fire, and the actual cause (bad input) is buried.
- **retry-without-idempotency-guidance** — clients retry POST and create duplicates because the server never specified the key contract.

## Verification

- Exactly one envelope shape per transport, recorded in the style guide.
- Registry file exists and the CI lints throw sites against it.
- Status mapping is centralised, not per-handler.
- Every transient code is linked to a retry hint; every non-transient code is not.
- Batch endpoints return per-item status; no all-or-nothing collapses.
- Sample error responses contain no stack traces, no SQL fragments, no internal hostnames.

## Guard rails

- Do not mutate files, provider state, network resources, or external tools unless this skill's procedure and the user approval path allow it.
- Do not skip prerequisites, confidence gates, policy gates, or explicit approval gates.
- Do not claim completion without concrete verification evidence.
- Preserve user-owned content and unrelated worktree changes.

## Related

- `supervibe:test-strategy` — contract tests assert the envelope at the API boundary.
- `supervibe:auth-flow-design` — auth errors must use the same envelope, not a bespoke one.
- `supervibe:adr` — capture envelope choice as an ADR; future API versions inherit it.
- `supervibe:incident-response` — `correlationId` from the envelope is the bridge to logs/traces.
