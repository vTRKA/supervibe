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

## Overview

Doubt driven development turns a confident delivery claim into an adversarial,
evidence-backed review loop. The user outcome is safer release judgment: the
agent either proves the claim with concrete evidence, narrows it to what the
evidence supports, or stops with an explicit blocker instead of shipping
optimistic prose.

Scope boundary: use this skill for post-implementation behavioral, security,
workflow, evidence, and release-readiness claims. It may read source, graph
state, receipts, tests, logs, and reviewer artifacts; it may write only the
declared `doubt-review-report` or the artifact explicitly assigned by the
owning workflow.

Non-goals: this is not a replacement for implementation, TDD, ordinary code
review, failing tests, required runtime receipts, user authorization, or new
feature discovery. It must not create an unbounded review loop or expand scope
past the active work item.

## When to Use

Use after graph execution, critical fixes, security/release work, external API
changes, workflow-proof changes, or any task where a fresh-context reviewer
should actively look for the strongest reason the production claim is wrong.

Use it before claiming high confidence when any of these are true:

- The claim depends on receipts, graph state, Code RAG, CodeGraph, or project
  memory.
- The implementation has behavioral acceptance criteria, edge cases, degraded
  behavior, or user-visible failure modes.
- The task touches security, privacy, authorization, workflow state, release
  readiness, provider contracts, generated artifacts, or command routing.
- Verification passed but did not directly cover a named user outcome.
- The workflow requires a reviewer, second model, or cross-context challenge.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source
of truth, preserve retrieval evidence, apply scope safety, use real producers
with runtime receipts for durable delegated outputs, verify before completion
claims, and keep confidence below gate when evidence is partial.

## Step 0 - Read source of truth

Read the active claim, work item, plan section, changed files, graph/task
status, receipts, project memory, code-search evidence, CodeGraph readiness,
and verification output. If the claim names a command, skill, agent, worker,
reviewer, validator, external tool, or second model, inspect runtime-issued
receipts before trusting it.

Stop before review if the work item is blocked, the write scope is unclear, the
source artifact is missing, or the requested reviewer/model would require user
authorization that has not been granted.

## When not to use

- Do not run recursive review loops after the STOP contract is met.
- Do not use doubt review before implementation when it would block parallel
  development without evidence.
- Do not substitute reviewer opinion for failing tests, missing source
  evidence, absent receipts, or unavailable user authorization.
- Do not use a degraded fallback to satisfy a workflow gate that explicitly
  requires an independent reviewer, specialist, worker, or cross-model receipt.
- Do not use this skill to add new requirements; record new scope as a follow-up
  or blocker instead.

## Decision tree

```text
Claim has behavioral acceptance criteria and TDD red evidence? -> Use red test as DOUBT for that behavior, then reconcile with green verification.
Critical/release/security/workflow-proof change? -> Independent adversarial review required.
Cross-model review requested or required? -> Check authorization policy before sending context.
Reviewer finds high/critical blocker? -> Reconcile fix + evidence, then run at most one more cycle.
Reviewer finds only low/info findings? -> Record residual risk and apply STOP.
Same concern repeats without new evidence? -> Stop by cycle bound and escalate the blocker or residual risk.
Three doubt cycles reached? -> Stop; do not start cycle 4 without a new user-approved work item.
```

## Procedure

1. CLAIM - Restate the production claim in a falsifiable form.
   Required fields: `claimId`, `workItemId`, `userOutcome`, `scope`, `outOfScope`,
   `contractRows`, `successCriteria`, `edgeStates`, `errorStates`,
   `rollbackOrRecovery`, `claimedVerification`, `claimedReceipts`, `claimOwner`.
2. EXTRACT - Gather evidence without judging it yet.
   Required fields: `evidenceId`, `sourceType`, `sourcePath`, `sourceRef`,
   `freshness`, `whatItProves`, `limits`, `verifiedBy`, `retrievedAt`.
   Source types include `memory`, `code-search`, `CodeGraph`, `test-output`,
   `receipt`, `runtime-log`, `artifact`, `official-doc`, and `manual-review`.
3. DOUBT - Run the adversarial challenge from
   `references/templates/doubt-review-prompt.md`, or use an authorized fresh
   reviewer/model when required by the workflow.
   Required fields: `cycle`, `doubtQuestion`, `adversarialHypothesis`,
   `findingId`, `severity`, `class`, `claimRef`, `evidenceRef`,
   `reproducerOrCounterexample`, `blocksRelease`, `requiredReconciliation`.
4. RECONCILE - For each finding, either fix and verify, narrow the claim, or
   record residual risk.
   Required fields: `findingId`, `decision`, `actionOwner`, `changedArtifact`,
   `verificationCommand`, `verificationResult`, `residualRisk`, `confidenceDelta`,
   `nextCycleNeeded`.
5. STOP - End the loop when the release decision is defensible.
   Required fields: `cycleCount`, `stopReason`, `remainingBlockers`,
   `residualRisks`, `authorizationState`, `degradedMode`, `finalVerdict`,
   `confidence`, `unsupportedClaims`, `nextSafeAction`.

Cycle bound: one cycle is DOUBT plus RECONCILE plus targeted verification. Run
no more than three cycles. If a high or critical finding remains after cycle 3,
the final verdict is `blocked`. If only low or informational findings remain,
the final verdict may be `clear-with-residual-risk` when owner and trigger are
recorded. A fourth cycle requires a new user-approved work item or workflow
state transition.

## Finding classification

Use one row per finding and do not combine unrelated risks.

| Severity | Blocks release | Meaning |
| --- | --- | --- |
| Critical | Yes | The claim is false in a way that can cause data loss, security exposure, destructive workflow state, release compromise, or a broken primary user path. |
| High | Yes | The claim lacks required proof, has a likely correctness failure, violates authorization, omits a required receipt, or leaves a major user-facing edge unhandled. |
| Medium | Usually | The claim may hold for the happy path but misses an important edge, degraded mode, contract field, or verification path. |
| Low | No unless repeated | The claim is mostly supported but has wording drift, minor evidence gaps, or non-blocking maintainability risk. |
| Informational | No | Context, assumption, or follow-up note that does not require a fix. |

Classify each finding with one primary `class`: `false-claim`,
`missing-evidence`, `unverified-edge`, `contract-break`, `security-privacy`,
`authorization-gap`, `receipt-gap`, `test-gap`, `degraded-mode-gap`,
`scope-creep`, or `process-proof-gap`.

## Cross-model authorization policy

Cross-model or cross-provider doubt review is optional unless the active
workflow requires it. It is allowed only when one of these authorization states
is true:

- `same-host-fresh-context`: a fresh reviewer in the same authorized host reads
  only repository-local context already available to the workflow.
- `workflow-preauthorized`: the active command, work item, or receipt policy
  explicitly authorizes the model/provider, data class, and artifact scope.
- `explicit-user-authorization`: the user explicitly approves the external
  model/provider, context to send, secret/privacy boundary, and expected output.

If authorization is unclear, set `authorizationState=blocked`, do not send the
context, and STOP with `finalVerdict=blocked`. Never send secrets, credentials,
private user data, proprietary artifacts outside the approved host boundary, or
unredacted logs to another model/provider. Record `provider`, `modelOrHost`,
`contextSent`, `redactions`, `authorizationSource`, and `receiptId` when a
cross-model reviewer is used.

## TDD red phase as DOUBT

A TDD red phase can satisfy DOUBT only for a narrow behavioral claim when all of
these are true:

- The failing test was written before the implementation.
- The test names one observable user or API behavior, not an implementation
  detail.
- The test failed for the expected reason before the fix.
- The green verification after implementation uses the same or stricter command.
- The claim being made is exactly the behavior covered by the test.

The red phase does not satisfy DOUBT for release readiness, security/privacy
clearance, receipt proof, cross-model authorization, CodeGraph impact, provider
availability, documentation-only claims, or broad "10/10" maturity claims. In
those cases, keep the red test as one `test-output` evidence row and still run
the relevant adversarial challenge.

## Degraded fallback

If the required reviewer, second model, Code RAG, CodeGraph, or receipt source
is unavailable, use degraded mode only to preserve an honest handoff:

1. Record `degradedMode=true`, unavailable source, attempted command or lookup,
   and effect on confidence.
2. Run the template prompt against the evidence already available in the current
   host context.
3. Do not mark required reviewer, specialist, worker, validator, cross-model, or
   receipt gates complete.
4. Set `finalVerdict=blocked` for release/security/workflow-proof claims, or
   `clear-with-residual-risk` only for low-risk claims where the owner accepts
   the missing evidence.

Degraded fallback is diagnostic evidence, not durable proof.

## Common rationalizations

- "The tests passed, so doubt review is unnecessary" - reject for release,
  security, workflow proof, authorization, and receipt-dependent claims.
- "A reviewer said it looks fine, so no evidence fields are needed" - reject
  unless findings tie to claim refs, evidence refs, and reconciliation actions.
- "The second model can see everything because it is just review" - reject
  unless the cross-model authorization policy is satisfied and recorded.
- "One more review pass might find perfection" - reject after the three-cycle
  bound; stop with blockers or residual risk.
- "The red test proves the whole feature" - reject unless the claim is the exact
  behavior that failed red and passed green.

## Red flags

- The reviewer prompt asks for validation, approval, or polish instead of the
  strongest plausible reason the claim is false.
- A finding has severity but no `claimRef`, `evidenceRef`, or required
  reconciliation.
- A fourth cycle starts without a new work item or explicit user approval.
- Cross-model context is sent before authorization, redaction, and receipt
  requirements are recorded.
- Degraded fallback is used to claim an independent reviewer or receipt gate.
- The same high-risk concern recurs without new evidence or a narrowed claim.

## Checklist

- Source of truth, memory, code search, CodeGraph readiness, receipts, and
  verification outputs were checked or explicitly marked unavailable.
- CLAIM fields are complete and falsifiable.
- EXTRACT evidence rows state what each source proves and what it cannot prove.
- DOUBT uses the adversarial template or an authorized fresh reviewer.
- Findings are severity-ranked and classified with claim/evidence references.
- RECONCILE records fix, narrowed claim, or residual risk for every finding.
- STOP records cycle count, authorization state, degraded mode, verdict, and
  unsupported claims.

## Failure modes

- Infinite review recursion hides the real release decision.
- Rubber-stamp review validates the claim instead of trying to falsify it.
- Missing authorization turns review into data exposure.
- TDD red evidence is overextended from a behavioral test to security, release,
  or maturity claims.
- Degraded fallback silently replaces a required reviewer, worker, validator, or
  receipt.
- Findings are detached from production evidence and cannot be reconciled.

## Examples

- Provider config change: CLAIM names default runtime, auth boundary, retry
  behavior, degraded fallback, and verification command; DOUBT asks how the
  provider could fail in production despite green tests; RECONCILE records
  contract test output or blocks on missing credentials.
- Workflow receipt change: CLAIM names command, specialist, receipt ids, graph
  status, and validator output; DOUBT checks whether inline output substituted
  for a required runtime receipt; STOP blocks if receipt proof is absent.
- Behavioral bug fix with TDD: the red test for `returns empty results when the
  search index is missing` is the DOUBT evidence for that one behavior; separate
  release and degraded-mode claims still need adversarial review.
- Anti-example: do not ask a second model to "approve the PR"; ask it to find
  the strongest false claim, missing evidence, authorization gap, or user-visible
  failure in the bounded review packet.

## Output contract

Return a `doubt-review-report` with these exact top-level fields:

- `claim`: object with CLAIM fields.
- `extractedEvidence`: array of EXTRACT evidence rows.
- `doubtCycles`: array of DOUBT cycle records, each with findings.
- `findings`: severity-ranked array with `findingId`, `severity`, `class`,
  `claimRef`, `evidenceRef`, `summary`, `blocksRelease`,
  `requiredReconciliation`.
- `reconciliation`: array with RECONCILE fields and verification results.
- `stop`: object with STOP fields.
- `crossModelAuthorization`: object with authorization state, provider/model,
  redactions, context sent, and receipt id when applicable.
- `degradedFallback`: object with unavailable source, fallback action, and
  confidence effect.
- `verificationCommands`: exact commands run and pass/fail/blocked result.
- `confidence`: numeric score plus unsupported claims and residual risk.

Verdicts are `clear`, `clear-with-residual-risk`, `needs-remediation`, or
`blocked`. Any unresolved critical or high finding requires `blocked`.

## Guard rails

- Do not delay implementation with broad review until the graph or work item is
  ready for review.
- Do not claim production readiness with unresolved high or critical findings.
- Do not let reviewer receipts substitute for worker, specialist, validator, or
  command receipts.
- Do not send context across model/provider boundaries without recorded
  authorization.
- Do not run more than three cycles for the same claim.
- Do not raise confidence when evidence is degraded, stale, missing, or outside
  the declared scope.

## Verification

- `npm run validate:skill-content-quality`
- `npm run validate:artifact-links`

## Related

- `supervibe:code-review`
- `supervibe:requesting-code-review`
- `supervibe:receiving-code-review`
- `supervibe:verification`
- `supervibe:tdd`
- `references/templates/doubt-review-prompt.md`
