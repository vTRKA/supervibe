---
name: code-simplification
namespace: development
description: >-
  Use WHEN code works but is unnecessarily complex to simplify it without behavior change using caller evidence, protected-block checks, and before/after verification.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
phase: review
prerequisites: []
emits-artifact: simplification-report
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1
last-verified: 2026-05-18T00:00:00.000Z
---

# Code Simplification

## Overview

Code Simplification removes unnecessary complexity while preserving observable behavior. It names the smell, checks callers and protected blocks, applies the smallest rewrite, and verifies that behavior stayed the same.

## When to Use

- Working code is harder to read, test, or maintain than necessary.
- Review finds duplicate branches, needless abstraction, dead branches, or confusing control flow.
- Simplification reduces future risk without changing product behavior.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source of truth, preserve retrieval evidence, apply scope safety, use real producers with runtime receipts for durable delegated outputs, verify before completion claims, and keep confidence below gate when evidence is partial.

## When not to use

- Do not add features, change behavior, or redesign architecture.
- Do not simplify generated, vendor, migration, adapter, or public contract code before ownership is known.
- Do not delete code only because it looks unused; prove callers, config, runtime hooks, and tests first.

## Step 0 - Source-of-truth preflight

1. Read the request, nearby code, tests, and comments.
2. Search callers, config references, generated references, and related tests.
3. Check memory for prior compatibility or rollback notes.
4. Identify protected blocks such as generated spans, public APIs, migrations, feature flags, manifests, and user-owned sections.
5. Capture the pre-change verification command or explain why it is unavailable.

## Decision tree

```text
Behavior change required? -> stop and route to feature or bug workflow
No named complexity smell? -> stop; do not churn code
Protected block or public contract affected? -> require owner evidence or skip
Callers and tests unknown? -> run code search before editing
Small local rewrite preserves behavior? -> patch and verify
```

## Procedure

1. Name the smell and why it matters.
2. Record why the current code exists before removing or inlining it.
3. Map blast radius with code search and CodeGraph caller evidence when available.
4. Choose the smallest transformation that preserves behavior.
5. Patch only owned files and leave unrelated formatting untouched.
6. Run targeted verification and emit the simplification report.

## Common rationalizations

- "It is obviously dead" fails without caller, config, and runtime evidence.
- "Simpler for me" fails if the next maintainer loses domain intent.
- "Tests pass" fails when tests do not cover the changed path.

## Red flags

- Public exports, serialized data, migrations, or plugin manifests change.
- Comments explaining business, security, or compatibility context disappear.
- The agent cannot name a verification command.
- The simplification increases coupling or clever indirection.

## Checklist

- Complexity smell is named.
- Protected blocks and public contracts were checked.
- Callers and related tests were located or absence was recorded.
- Diff is behavior-preserving.
- Targeted verification output is captured.

## Failure modes

- Hidden behavior change through defaults, ordering, timing, or side effects.
- Compatibility shim removed while consumers still depend on it.
- Broad refactor disguised as simplification.
- Green tests hide uncovered behavior.

## Output contract

Returns `simplification-report` with:

- `smell`
- `targetFiles`
- `protectedBlockDecision`
- `callerEvidence`
- `beforeState`
- `afterState`
- `behaviorPreservationEvidence`
- `verificationCommand`
- `residualRisk`

## Guard rails

- DO NOT change behavior under this skill.
- DO NOT remove compatibility or generated code without owner evidence.
- DO NOT make a broad rename or architecture rewrite.
- ALWAYS verify with a command before claiming safety.

## Verification

- Run `npm run validate:skill-content-quality`.
- Run `npm run validate:agent-skill-coverage` after owner wiring.
- For actual simplification, run the targeted test, lint, or grep command for the owning area.

## Related

- `supervibe:code-review`
- `supervibe:code-search`
- `supervibe:verification`
