---
name: doubt-driven-development
namespace: review
description: >-
  Use after implementation to run bounded skeptical review before release, or
  whenever confidence is high but evidence may be thin.
allowed-tools:
  - Bash
  - Read
phase: review
prerequisites: []
emits-artifact: doubt-review-report
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: false
version: 1
last-verified: 2026-05-13T00:00:00.000Z
---

# Doubt Driven Development

## When to invoke

Use after graph execution, critical fixes, security/release work, or any change where a fresh-context reviewer should actively look for the strongest reason the work is not production-ready.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source of truth, preserve retrieval evidence, apply scope safety, use real producers with runtime receipts for durable delegated outputs, verify before completion claims, and keep confidence below gate when evidence is partial.

## Step 0 - Read source of truth

Read the claim, changed files, graph/task evidence, receipts, and verification outputs. If the claim names agents or reviewers, inspect runtime receipts before trusting the claim.

## When not to use

- Do not run recursive review loops after the stop condition is met.
- Do not use doubt review before implementation when it would block parallel development without evidence.
- Do not substitute reviewer opinion for failing tests or missing source evidence.

## Decision tree

```text
Critical/release/security change? -> fresh-context doubt review required
Only docs copy with no behavioral claim? -> normal verification is enough
Reviewer finds blocker? -> reconcile fix + evidence, then one final reviewer pass
Reviewer finds non-blocker? -> record residual risk, do not reopen graph work
No new evidence after two passes? -> stop recursion and escalate explicit risk
```

## Procedure

1. Restate the production claim and the strongest plausible failure mode.
2. Inspect receipts, graph status, changed files, and verification commands.
3. Produce severity-ranked findings with file/line or artifact references.
4. Bind each finding to a reconciliation action or explicit residual risk.
5. Stop after blockers are fixed and one final verification/reviewer pass is green.

## Common rationalizations

- "The tests passed, so review is unnecessary" - false for release, security, and workflow proof changes.
- "Keep reviewing until perfect" - false; bounded review must stop when evidence is sufficient.
- "Reviewer can run full tests during development" - false for this workflow; full tests run after graph completion.

## Red flags

- Reviewers run before implementation is complete and slow parallel work.
- Findings are not tied to tasks, receipts, or reconciliation evidence.
- The same concern recurs without a new failing fact.

## Checklist

- Claim and scope restated.
- Receipts and graph/task status checked.
- Findings severity-ranked.
- Reconciliation action or residual risk recorded.
- Stop condition applied.

## Failure modes

- Infinite review recursion.
- Rubber-stamp review with no adversarial hypothesis.
- Findings detached from production evidence.

## Examples

- After provider config loop work, reviewer checks default runtime, receipt proof, graph completion, and final-test timing.
- After security changes, reviewer looks for bypass paths and missing threat-model evidence.

## Output contract

Return `claim`, `reviewedEvidence`, `findings`, `reconciliation`, `stopCondition`, `confidence`, and `verificationCommands`.

## Guard rails

- Do not delay implementation with broad review until the graph is complete.
- Do not claim production readiness with unresolved high/critical findings.
- Do not let reviewer receipts substitute for worker receipts.

## Verification

- `npm run validate:skill-content-quality`
- `npm run validate:agent-skill-coverage`
- `npm run validate:confidence-gates`

## Related

- `supervibe:code-review`
- `supervibe:requesting-code-review`
- `supervibe:verification`
