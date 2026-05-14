---
name: scope-safety
description: "Mandatory guardrail that prevents agents from adding harmful or unnecessary functionality without evidence, tradeoff, and user-visible rationale."
applies-to: [requirements, brainstorming, planning, execution, agent-output, product-decisions, architecture-decisions]
mandatory: true
version: 1.1
last-verified: 2026-05-06
related-rules: [confidence-discipline, no-half-finished, operational-safety, single-question-discipline]
---

# Scope Safety

## Why this rule exists

Supervibe agents must protect the user from unnecessary functionality. A user
request is not a license to add every related capability, framework, protocol,
integration, or "best practice" that could possibly fit.

Concrete consequence of not following: a narrow fix becomes a platform rewrite,
which increases test, security, rollout, support, and user-training cost without
evidence that the new surface solves the user's actual problem.

## Scope

This rule applies whenever an agent is tempted to add features, integrations,
providers, frameworks, screens, workflow stages, infrastructure, or governance
that were not in the approved request, spec, plan, or explicit user answer.

It does not block necessary follow-through such as tests, validators, docs for
changed behavior, migration notes, rollback instructions, or generated metadata
required by the changed surface.

Provider runtime configuration is never a project artifact by default. When a workflow needs provider settings, write only additive, missing values in the selected local user provider home and treat project runtime config files in provider-named folders or provider-shaped root config files as detection-only unless a future explicit cleanup command is approved.

## What to do

- Apply `docs/references/scope-safety-standard.md` before accepting scope growth.
- Separate the user's actual goal from optional enhancements.
- Prefer the smallest production-safe slice that solves the current problem.
- Explain why an addition should be deferred or rejected when it increases
  complexity without enough evidence.
- Treat accepted additions as explicit scope changes with tradeoff, owner,
  verification, rollout, rollback, and support impact.
- Block execution when a task introduces functionality not present in the
  approved spec, plan, or explicit user-approved scope change.

## Required Output

When scope pressure appears, agents must produce a short decision:

```text
Scope decision: include | defer | reject | spike | ask-one-question
Reason: <user outcome and evidence>
Complexity cost: <maintenance / UX / security / performance / support impact>
Tradeoff: <what leaves scope or is re-estimated>
User-facing explanation: <why this protects the project>
```

## Examples

### Bad

```text
User: Fix the agent maturity audit.
Agent: Also adds a new UI dashboard, a remote telemetry service, three new
workflow stages, and a broad agent taxonomy rewrite because they are related.
```

This hides product and maintenance cost inside a fix. None of the additions are
required to make the maturity gate truthful.

### Good

```text
Scope decision: defer
Reason: the requested fix is strict retrieval telemetry; a dashboard is only a
reporting convenience.
Complexity cost: new UI, persistence, tests, support docs, and release surface.
Tradeoff: keep CLI scorecard now; revisit dashboard after two real release runs.
User-facing explanation: this keeps the audit trustworthy without expanding the
plugin into a monitoring product.
```

This preserves the user's outcome while making the optional enhancement explicit.

## Enforcement

Scope safety is enforced by:

- `docs/templates/intake-template.md`
- `docs/templates/brainstorm-output-template.md`
- `docs/templates/plan-template.md`
- `scripts/validate-spec-artifacts.mjs`
- `scripts/validate-plan-artifacts.mjs`
- `tests/scope-safety-gate.test.mjs`

## Related rules

- `confidence-discipline` - scope growth lowers confidence until evidence and
  verification are explicit.
- `no-half-finished` - optional additions cannot land as placeholders.
- `operational-safety` - external systems, credentials, production, and
  destructive operations require explicit user approval.
- `single-question-discipline` - unclear scope growth should become one focused
  question, not a multi-question planning dump.
