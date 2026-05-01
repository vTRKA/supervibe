# Scope Safety Standard

This reference protects users from feature bloat, over-engineering, and
well-intended agent scope expansion. Supervibe agents must optimize for the
best user outcome, not the largest possible implementation.

## Core Principle

Adding functionality is a product, engineering, security, UX, support, and
maintenance decision. "We can add it" is not enough. Agents must be willing to
recommend "do not add this now" when the addition weakens the product, dilutes
the MVP, slows delivery, increases risk, or lacks evidence.

## Scope Safety Gate

Before including a requested or agent-suggested addition, answer all checks:

1. **Outcome fit**: Which user outcome, metric, risk, or production blocker does
   this improve? If none is named, defer or reject it.
2. **Evidence**: Is there user research, support evidence, analytics, a failing
   test, a regulatory need, or an explicit user-approved constraint? If not,
   park it as a candidate, not committed scope.
3. **MVP and product goal fit**: Does it belong in the smallest production-safe
   slice, or is it a later optimization?
4. **Cost of complexity**: What does it add to maintenance, cognitive load,
   onboarding, QA, security/privacy review, performance, support, docs, or
   release risk?
5. **Blast radius**: Which files, contracts, permissions, data models,
   integrations, users, and operational runbooks become larger because of it?
6. **Tradeoff**: If this enters scope, what is removed, deferred, or explicitly
   re-estimated? No addition is free.
7. **Decision**: Mark the item as `include`, `defer`, `reject`, `spike`, or
   `ask-one-question`, with rationale.

## Decision Policy

- **Include** only when the item is essential to the current goal, supported by
  evidence, and has verification, owner, rollout, and rollback coverage.
- **Defer** when it may be valuable but is not required for the current release
  or needs validation first.
- **Reject** when it adds complexity without clear user value, duplicates an
  existing capability, increases risk beyond the benefit, or exists only because
  it is fashionable or broadly "best practice".
- **Spike** when value is plausible but feasibility or risk is unknown; the
  spike must have a time box and a decision output.
- **Ask one question** only when one missing fact changes the decision.

## How To Explain A No

Use direct, respectful reasoning:

```text
I do not recommend adding <feature> in this scope.
Why: <specific harm: complexity, UX load, security/privacy, performance,
maintenance, support, or delivery risk>.
What we should do instead: <smallest production-safe alternative>.
What would make it worth adding later: <evidence or threshold>.
```

The explanation must be concrete enough that the user can agree, override, or
turn the idea into a separate tracked change.

## Required Artifact Evidence

Specs, brainstorms, plans, and autonomous-loop graphs must carry:

- included scope with owner and acceptance evidence;
- deferred scope with validation trigger;
- rejected scope with harm/rationale;
- explicit tradeoff for every accepted scope expansion;
- final 10/10 check that no hidden optional functionality entered execution.

## 10/10 Scope Safety

A task reaches 10/10 only when every implemented item maps to an approved
requirement or accepted scope change, every optional addition is deferred or
rejected with rationale, and the final verification proves no hidden scope
expansion was shipped.

## Source Links

- https://scrumguides.org/scrum-guide.html
- https://apply-the-service-standard.education.gov.uk/service-standard/2-solve-a-whole-problem
- https://www.atlassian.com/work-management/project-management/scope-creep
- https://your.wa.gov/cx-resources/moscow-method/
- https://framework.scaledagile.com/wsjf/
