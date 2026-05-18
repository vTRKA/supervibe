---
name: api-and-interface-design
namespace: app-excellence
description: "Use WHEN designing APIs, SDK boundaries, events, or public interfaces to make consumer-first contracts explicit before implementation."
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
phase: design
prerequisites: []
emits-artifact: api-interface-contract
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1
last-verified: 2026-05-18T00:00:00.000Z
---

# API And Interface Design

## Overview

API And Interface Design turns a proposed API, SDK, event, CLI, component prop surface, or service boundary into an explicit contract before code hardens it. It keeps Supervibe memory, Code RAG, CodeGraph, source evidence, receipts, and verification in the workflow while adding one consumer-first interface pass.

Use it to decide shape, compatibility, errors, idempotency, pagination, authorization declaration, versioning, examples, and observability before implementation or review.

## When to Use

Use before adding or changing a public or cross-team interface. Use when a spec, schema, endpoint, event, SDK method, CLI command, plugin config, or component contract may be consumed by code outside the edited module. Use before `supervibe:error-envelope-design` or `supervibe:auth-flow-design` when the broader interface shape is still undecided.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source of truth, preserve retrieval evidence, apply scope safety, use real producers with runtime receipts for durable delegated outputs, verify before completion claims, and keep confidence below gate when evidence is partial.

## Step 0 - Read source of truth

1. Read `AGENTS.md`, the active requirement/spec/PRD, and any existing API or interface convention docs.
2. Search project memory for prior versioning, error envelope, auth, pagination, SDK, or plugin contract decisions.
3. Run Code RAG for existing interface patterns and read the top relevant files before designing a new shape.
4. Use CodeGraph before changing an exported symbol, generated client surface, command argument, event name, or public schema.
5. If the interface depends on external standards or provider behavior, invoke `supervibe:source-driven-development` and prefer official current docs.

## When not to use

- Do not use for purely internal implementation details with no observable consumer contract.
- Do not use to bypass `supervibe:error-envelope-design`, `supervibe:auth-flow-design`, `supervibe:deprecation-and-migration`, or formal API reviewers when those narrower gates apply.
- Do not approve a breaking change without a migration path, versioning decision, and release owner.

## Decision tree

```text
Is the surface observable outside the edited module?
  NO  -> use local implementation skills and keep this skill out of scope.
  YES -> continue.

Is the change additive and backward compatible?
  YES -> document the contract, examples, tests, and changelog decision.
  NO  -> require versioning, deprecation, migration, rollback, and consumer impact.

Does the surface mutate state or trigger side effects?
  YES -> require idempotency, retry semantics, auditability, and auth declaration.
  NO  -> require pagination/filtering/sorting semantics when collections are involved.
```

## Procedure

1. Read existing conventions and identify consumers: browser, mobile, service, SDK, plugin host, CLI user, webhook receiver, or internal worker.
2. Define the operation list and name each operation from the consumer's perspective, not from storage tables or internal classes.
3. Write request, response, event, or method shapes with required/optional fields, nullable values, defaults, and unknown-field behavior.
4. Define errors using the project canonical envelope; if none exists, invoke `supervibe:error-envelope-design`.
5. Define auth/authz declaration; if unclear, invoke `supervibe:auth-flow-design`.
6. Define idempotency and retry behavior for every mutation, webhook, queue handler, or command with external side effects.
7. Define collection semantics: cursor or page model, sort order, filters, max page size, and stable empty response.
8. Define compatibility rules: additive changes, deprecations, breaking changes, generated client impact, versioning scheme, and sunset window.
9. Add examples for success, validation failure, auth failure, rate limiting, empty collection, and retry/idempotency when relevant.
10. Name contract tests, schema diff checks, or static validators that will prove the interface stays stable.
11. Record observability: request id, correlation id, audit log, metrics, and alert hooks needed to support the interface.
12. Score with `supervibe:confidence-scoring`; do not mark complete below the gate.

## Common rationalizations

- "It is internal, so compatibility does not matter" fails when another module, generated client, task runner, or plugin can observe the shape.
- "We can add versioning later" fails because first consumers turn today's defaults into tomorrow's compatibility contract.
- "The implementation is obvious" fails when errors, retries, auth, pagination, or null handling are not specified.

## Red flags

- Request/response shape is inferred from code instead of written as a contract.
- Mutation lacks idempotency or retry semantics.
- Error examples differ by endpoint, event, or transport without a recorded reason.
- A field rename, enum narrowing, status-code change, or auth-scheme change is called non-breaking without consumer evidence.
- Generated clients, SDKs, webhooks, or docs are not mentioned in verification.

## Checklist

- Consumers and compatibility class are named.
- Shape, errors, auth, idempotency, pagination, versioning, and examples are explicit.
- Consumer-impact and generated-client impact are checked.
- Contract tests, schema diff, or lint commands are named.
- Rollback, deprecation, and changelog decisions are recorded when needed.

## Failure modes

- Interface design mirrors database schema and leaks internal coupling.
- One happy-path example hides validation, auth, empty, and retry behavior.
- Public behavior changes without a version bump, deprecation window, or migration guide.
- The skill emits prose but no testable contract fields.

## Output contract

- `surface`: endpoint, SDK method, event, CLI, config, component, or service boundary.
- `consumers`: known consumer classes and unknown-consumer risk.
- `contract`: request/response/event/method shape with required, optional, nullable, default, and unknown-field behavior.
- `semantics`: auth, errors, idempotency, pagination, rate limits, retries, ordering, and observability.
- `compatibility`: additive/deprecating/breaking classification with versioning and migration plan when needed.
- `examples`: success and failure examples.
- `verificationCommands`: exact contract lint, diff, test, or grep commands.
- `residualRisk`: open consumer or tooling uncertainty.

## Guard rails

- Do not claim backward compatibility without consumer-impact evidence.
- Do not design a new error or auth convention when a local canonical skill owns it.
- Do not change generated or public surfaces without CodeGraph or explicit Case C rationale.
- Preserve host-neutral wording and avoid provider-specific folders unless the artifact is adapter-specific.

## Verification

- `npm run validate:skill-content-quality`
- Run the relevant interface validator when a concrete artifact exists, such as `spectral lint`, `oasdiff`, `graphql-inspector diff`, `buf breaking`, schema tests, or project-specific contract tests.
- For repository changes, run the targeted validator named by the owning agent or plan.

## Related

- `supervibe:error-envelope-design`
- `supervibe:auth-flow-design`
- `supervibe:deprecation-and-migration`
- `supervibe:documentation-and-adrs`
- `supervibe:source-driven-development`