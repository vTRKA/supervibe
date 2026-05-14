---
name: receiving-code-review
namespace: process
description: >-
  Use WHEN receiving code review feedback BEFORE implementing suggestions to
  evaluate each finding with technical rigor instead of performative agreement.
  Triggers: 'обработай review', 'feedback', 'комменты с PR', 'разбери ревью'.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Edit
phase: review
prerequisites: []
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1
last-verified: 2026-04-27T00:00:00.000Z
---

# Receiving Code Review

## Overview

Use this skill to turn reviewer feedback into an evidence-backed resolution
record. It forces finding triage before edits, accepts or rejects each finding
with code/spec evidence, verifies every fix, records tradeoffs, and produces a
final response that maps reviewer concerns to concrete outcomes. The goal is to
improve the change, not to perform agreement or dismiss feedback.

## When to Use

WHEN receiving review feedback (from `code-reviewer` agent, human reviewer, or automated checks). BEFORE implementing any suggestion blindly.

This skill bans performative agreement ("I'll fix everything you said") and demands technical evaluation per finding.

Use the full receiving flow when:

- A reviewer returns any critical, major, security, data, API, workflow,
  verification, or release-readiness finding.
- Feedback mixes valid issues, ambiguous comments, optional suggestions, and
  out-of-scope work that must be separated.
- A finding proposes a fix whose intent is right but whose implementation would
  create a worse tradeoff.
- The final user or PR response must show what changed, what was rejected, why,
  and what verification proves the state after review.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source of truth, preserve retrieval evidence, apply scope safety, use real producers with runtime receipts for durable delegated outputs, verify before completion claims, and keep confidence below gate when evidence is partial.

## Step 0 — Read source of truth (required)

1. Read the full review report (don't skim)
2. Read the original spec/plan to understand intent
3. Read the code each finding references
4. Note severity per finding (CRITICAL/MAJOR/MINOR/SUGGESTION)
5. Read the verification evidence and reviewer output shape, especially
   severity, file line, impact, suggested fix, evidence, and verdict
6. Re-check memory/RAG/CodeGraph evidence when a finding depends on stale
   source context, public-symbol impact, or broad dependency behavior

## Finding resolution contract

Every finding must move through the same triage fields before implementation:

| Field | Required content |
| --- | --- |
| Finding triage | Finding id, reviewer, severity, file line, impact, category, blocker status, and whether the evidence is reproducible. |
| Accept/reject with evidence | Decision (`accept`, `accept-with-change`, `reject-with-evidence`, `clarify`, `defer`, or `escalate`) plus code, spec, command output, or artifact evidence. |
| Fix verification | Exact changed files, verification commands, exit codes, relevant output, screenshots/manual checks if applicable, and reviewer re-check need. |
| Tradeoffs | Reason the chosen fix differs from reviewer suggestion, scope that remains deferred, residual risk, owner, and trigger to revisit. |
| Final response | Per-finding outcome, what changed, what was not changed, verification summary, residual risks, and final verdict. |

Critical or major findings cannot be closed by opinion alone. They must be
fixed, disproved with evidence, escalated, or explicitly blocked.

## Decision tree

```
Per finding, classify:
|-- ACCEPT
|   `-- Finding is correct and suggested fix is appropriate -> implement and verify
|-- ACCEPT-WITH-CHANGE
|   `-- Finding is correct but suggested fix has a better local variant -> implement variant and record tradeoff
|-- REJECT-WITH-EVIDENCE
|   `-- Finding is false, already handled, or contradicts source of truth -> cite code/spec/test evidence
|-- CLARIFY
|   `-- Finding is ambiguous or missing reproducer -> ask one precise question before editing
|-- DEFER
|   `-- Finding is valid but outside approved scope -> create follow-up with owner, risk, and trigger
`-- ESCALATE
    `-- Severity, ownership, policy, or reviewer disagreement blocks closure -> route to required reviewer/user
```

Severity handling:

```
CRITICAL -> fix, prove false, or escalate; never defer silently
MAJOR -> fix or reject with strong evidence before completion
MINOR -> fix when low risk; otherwise record tradeoff
SUGGESTION -> accept only when it improves the scoped outcome without churn
```

## Procedure

1. **Read review** (Step 0)
2. **Normalize findings** - assign stable ids and capture reviewer, severity,
   file line, impact, suggested fix, evidence, and verdict. If the reviewer did
   not provide these fields, reconstruct only from cited evidence and mark the
   missing fields as gaps.
3. **Classify each finding** using the decision tree before editing code.
4. **For ACCEPT**: implement the suggested fix, keep the change scoped, and run
   verification that proves the finding is closed.
5. **For ACCEPT-WITH-CHANGE**: implement the local variant, document why it is
   safer or better, and verify both the original issue and the tradeoff.
6. **For REJECT-WITH-EVIDENCE**: write a concise counterargument with code,
   spec, test, validator, or artifact references; do not rely on intent.
7. **For CLARIFY**: ask one specific question per ambiguity and pause that
   finding until the answer or a safe evidence-backed fallback exists.
8. **For DEFER**: create or update follow-up evidence in
   `.supervibe/artifacts/follow-ups.md` only when that path is in scope for the
   active workflow; otherwise report the required follow-up without writing
   outside the owned set.
9. **For ESCALATE**: route to the required reviewer/user when severity,
   ownership, policy, or contradictory evidence blocks local closure.
10. **Verify fixes** - run targeted commands, record exit codes and output, and
    capture screenshots/manual checks when the finding is UI or runtime based.
11. **Record tradeoffs** - name accepted residual risk, deferred scope, owner,
    trigger, and why the chosen fix is preferable to the suggested fix.
12. **Write final response** - per finding: decision, action, evidence,
    verification, residual risk, and final verdict.
13. **Score** - `supervibe:confidence-scoring` artifact-type=agent-output; >=9 required
14. **Re-invoke reviewer** if substantive changes were made or if a blocking
    finding was rejected/escalated.

## When not to use

- Do not use this skill to bypass the command or workflow that owns durable artifacts.
- Do not use it when source evidence, RAG/CodeGraph, or required verification is missing.
- Do not use it to replace a specialist producer, worker, or reviewer that must issue runtime evidence.

## Common rationalizations

- "This is small, so no source check is needed" - reject when the skill changes code, config, or durable artifacts.
- "The user asked for speed, so skip receipts" - reject when durable work, delegation, or review is claimed.
- "Existing prose is enough evidence" - reject when validators or command output are required.
- "The reviewer is probably right" - reject; classify and verify before
  changing code, especially when the suggested fix broadens scope.
- "The reviewer misunderstood, so ignore it" - reject; write the
  counterargument with file, spec, or command evidence.
- "Suggestions do not need tracking" - reject when accepting a suggestion
  changes behavior, contract, architecture, or verification scope.

## Red flags

- A durable artifact changes without a command, receipt, or verification path.
- The skill is used outside its phase without an explicit handoff.
- Claims of completion appear before evidence and confidence scoring.
- A critical or major finding is marked resolved without code/spec evidence or
  verification output.
- The final response says "fixed all feedback" but does not map actions back to
  individual finding ids.
- A rejected finding has no counterexample, source reference, or reproduction
  attempt.
- The accepted fix follows reviewer wording but breaks local architecture,
  scope ownership, or rollback expectations.

## Checklist

- Source of truth read.
- Scope and owner confirmed.
- RAG/CodeGraph/memory requirement decided.
- Evidence artifact or command recorded.
- Stop condition and next handoff clear.
- Every finding has id, severity, file line, impact, suggested fix, evidence,
  and reviewer verdict or an explicit missing-field gap.
- Every finding has a triage decision before implementation starts.
- Accepted findings have changed files and verification output.
- Rejected findings have a counterargument tied to code, spec, tests, or
  artifact evidence.
- Tradeoffs and residual risks have owner, trigger, and final response text.

## Failure modes

- Inline emulation replaces a required producer or reviewer.
- Broad use of the skill slows delivery without improving evidence.
- Missing verification lets stale assumptions pass as production-ready.
- Bulk-applying feedback creates new defects because valid findings and optional
  preferences were not separated.
- A reviewer suggestion is directionally right but locally unsafe; accepting it
  without amendment creates architecture, security, or maintenance debt.
- Rejections become opinionated debate because the response lacks source
  references, repro steps, or command evidence.
- Fix verification checks only the edited line and misses the user-facing
  behavior or contract that the finding targeted.

## Examples

- Accept a missing-validation finding when the referenced file line shows the
  gap, add the guard, run the targeted test or validator, and cite the command
  output in the final response.
- Accept with change when the reviewer suggests duplicating logic but the local
  pattern is a shared helper; implement the helper-compatible fix and explain
  the maintainability tradeoff.
- Reject with evidence when a reviewer claims an artifact link is broken but
  `npm run validate:artifact-links` passes and the referenced path exists; cite
  both the command and file path.
- Do not mark "all review comments addressed" when one finding is deferred or
  awaiting clarification.

## Output contract

Returns a review-resolution record:

- `status`: resolved, needs-clarification, blocked, or ready-for-rereview.
- `sourceReview`: reviewer, artifact path or PR link, reviewed commit/diff, and
  original verdict.
- `findingTriage`: table with finding id, severity, file line, impact,
  suggested fix, reviewer evidence, decision, blocker status, and owner.
- `acceptedFixes`: changed files, implementation summary, verification command,
  exit code, and output evidence for every accepted finding.
- `rejectedFindings`: finding id, rejection reason, code/spec/test evidence,
  and whether a reviewer/user re-check is required.
- `clarifications`: exact question, blocked finding id, and what answer is
  needed before action.
- `deferredWork`: follow-up path or reported follow-up, owner, risk, trigger,
  and why it is outside current scope.
- `tradeoffs`: accepted residual risk, rejected alternative, chosen approach,
  rollback or revisit trigger.
- `finalResponse`: concise message to reviewer/user mapping every finding to
  decision, action, evidence, verification, and final verdict.

Compact table form:

```
| Finding | Severity | File line | Decision | Action | Evidence | Verification | Residual risk |
| #1 ... | MAJOR | src/a.ts:42 | ACCEPT | fixed | reviewer evidence + diff | npm test exit 0 | none |
| #2 ... | MINOR | docs/x.md:17 | REJECT-WITH-EVIDENCE | no code change | spec.md:42 | not applicable | none |
| #3 ... | SUGGESTION | src/b.ts:88 | DEFER | follow-up reported | scope packet | not applicable | owner + trigger |
```

## Guard rails

- DO NOT: blindly implement every suggestion (over-engineering risk)
- DO NOT: dismiss findings without writing counterargument
- DO NOT: ignore CRITICAL findings (must ACCEPT, REJECT-WITH-EVIDENCE, or ESCALATE)
- DO NOT: claim "fixed" without verification command output
- DO NOT: collapse multiple findings into one vague response when they have
  different severity, evidence, or tradeoffs.
- DO NOT: reject a finding because the suggested fix is weak; accept the
  finding with amendment when the underlying issue is real.
- DO NOT: write follow-up artifacts outside the owned write set unless the
  active workflow explicitly permits that path.
- ALWAYS: classify every finding (no "I'll think about it")
- ALWAYS: ask specific questions for CLARIFY (not "what do you mean?")
- ALWAYS: include severity, file line, impact, suggested fix, evidence, and
  verdict from the reviewer or record that the reviewer omitted a field.
- ALWAYS: make the final response traceable from finding id to action and
  verification.

## Verification

- Every finding has classification + action + evidence
- All ACCEPT/ACCEPT-WITH-CHANGE findings have verification output
- All REJECT-WITH-EVIDENCE findings have written counterargument
- No finding left unaddressed
- Every accepted fix has command output, exit code, and changed-file evidence.
- Every rejection cites code, spec, test, validator, or artifact evidence.
- Every defer/clarify/escalate has owner, blocker state, and next safe action.
- Final response includes per-finding outcome, verification summary, tradeoffs,
  residual risks, and final verdict.

## Related

- `supervibe:code-review` — produces input
- `supervibe:requesting-code-review` — opposite flow
- `supervibe:systematic-debugging` — used when finding reveals real bug
