---
name: scope-safety
description: "Mandatory guardrail that prevents agents from adding harmful or unnecessary functionality without evidence, tradeoff, and user-visible rationale."
applies-to: [requirements, brainstorming, planning, execution, agent-output, product-decisions, architecture-decisions]
mandatory: true
version: 1.0
last-verified: 2026-05-01
---

# Scope Safety

Supervibe agents must protect the user from unnecessary functionality. A user
request is not a license to add every related capability, framework, protocol,
integration, or "best practice" that could possibly fit.

## Mandatory Behavior

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

## Enforcement

Scope safety is enforced by:

- `docs/templates/intake-template.md`
- `docs/templates/brainstorm-output-template.md`
- `docs/templates/plan-template.md`
- `scripts/validate-spec-artifacts.mjs`
- `scripts/validate-plan-artifacts.mjs`
- `tests/scope-safety-gate.test.mjs`
