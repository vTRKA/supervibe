---
name: incremental-implementation
namespace: app-excellence
description: "Use WHEN building a feature or fix to deliver one thin, verified, reversible implementation slice at a time."
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
phase: exec
prerequisites: []
emits-artifact: implementation-slice-report
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1
last-verified: 2026-05-18T00:00:00.000Z
---

# Incremental Implementation

## Overview

Incremental Implementation keeps delivery small, working, reversible, and verifiable. It is the build-time companion to `writing-plans`, `executing-plans`, `new-feature`, `tdd`, and `verification`: choose one thin vertical slice, implement the minimum change, verify it, checkpoint, then repeat.

## When to Use

Use while implementing a new feature, bug fix, refactor, migration, UI flow, API behavior, or task graph item where a large change can be split into independently testable slices.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source of truth, preserve retrieval evidence, apply scope safety, use real producers with runtime receipts for durable delegated outputs, verify before completion claims, and keep confidence below gate when evidence is partial.

## Step 0 - Read source of truth

1. Read the task packet, plan, graph item, or user request and identify the acceptance signal.
2. Search project memory and Code RAG for local patterns before editing.
3. Use CodeGraph when the slice touches shared symbols, public APIs, generated artifacts, or broad refactors.
4. Read tests and verification commands that cover the slice.
5. Check git status so the slice does not absorb unrelated user or worker changes.

## When not to use

- Do not use to bypass an active plan/task graph or command-owned workflow.
- Do not split work so thin that no slice delivers observable behavior or risk reduction.
- Do not defer verification across many slices unless the active plan explicitly requires final-only validation.
- Do not use for pure read-only analysis.

## Decision tree

```text
Can the work be split by user-observable behavior or risk?
  YES -> choose the smallest vertical slice.
  NO  -> choose the smallest reversible internal checkpoint.

Does the next slice require schema/API/contract change?
  YES -> design and verify the contract first.
  NO  -> implement within existing contract.

Can the app stay working after this slice?
  YES -> proceed and verify.
  NO  -> add a flag, adapter, compatibility layer, or smaller preparatory slice.
```

## Procedure

1. Define the current slice in one sentence: input, behavior, output, and verification.
2. Identify dependencies and choose the slice that reduces highest uncertainty earliest.
3. Keep the write set narrow and reversible; avoid opportunistic refactors.
4. Write or identify the failing check first when behavior changes and tests are allowed.
5. Implement the minimum production change that satisfies the slice.
6. Run targeted verification for the slice, or record exact final gate deferral with non-test evidence.
7. Review the diff for unrelated churn, broad formatting, hidden coupling, and rollback difficulty.
8. Checkpoint the slice: changed files, verification output, residual risk, and next slice.
9. Stop if the next slice changes scope, requires user approval, or hits a failing gate.

## Common rationalizations

- "I need to build the whole stack before anything works" fails when an adapter, flag, mock contract, or compatibility layer can make a smaller slice testable.
- "I will verify after all slices" fails unless the active plan explicitly defers tests and names the final gate.
- "This refactor is nearby, so include it now" fails when it does not change the current slice outcome.

## Red flags

- Slice description names files but not behavior.
- Diff includes broad formatting or unrelated cleanup.
- Verification proves only compilation while behavior changed.
- Rollback requires manually untangling many concerns.
- Next slice depends on an undocumented contract.

## Checklist

- Slice outcome, write set, and verification are named.
- Memory, RAG, source, and graph needs are satisfied or degraded explicitly.
- App or artifact remains runnable/consistent after the slice.
- Diff is scoped and reversible.
- Next slice or stop condition is clear.

## Failure modes

- Large-batch implementation hides bugs until final validation.
- Preparatory slices never connect to user value.
- Multiple agents edit overlapping files without ownership boundaries.
- Feature flag or compatibility layer is added but cleanup is not tracked.

## Output contract

- `slice`: current thin slice and acceptance signal.
- `writeSet`: files changed or planned.
- `evidence`: memory, RAG, graph, source, and verification evidence.
- `verificationCommands`: exact commands run or deferred.
- `result`: passed, blocked, or degraded.
- `nextSlice`: next smallest slice or stop reason.
- `rollback`: how to revert or disable this slice.
- `residualRisk`: known gaps before the next slice.

## Guard rails

- Keep one slice in progress at a time unless the user explicitly authorized parallel agents.
- Do not claim final completion from a partial slice.
- Do not widen scope without updating acceptance and verification.
- Preserve unrelated worktree changes.

## Verification

- Targeted test, lint, build, browser check, contract test, or validator for the current slice.
- `git diff --check` when whitespace-sensitive edits were made.
- `npm run validate:agent-skill-coverage` and `npm run validate:skill-content-quality` when skill/agent routing changes.

## Related

- `supervibe:executing-plans`
- `supervibe:new-feature`
- `supervibe:tdd`
- `supervibe:test-strategy`
- `supervibe:verification`