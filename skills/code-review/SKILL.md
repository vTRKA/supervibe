---
name: code-review
namespace: process
description: 'Use BEFORE merging any change to systematically review code across 8 dimensions (correctness/security/readability/performance/coverage/error-handling/naming/docs) with severity ranking. Triggers: ''отревьюй код'', ''code review'', ''проверь PR'', ''обзор кода''.'
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
phase: review
prerequisites: []
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1
last-verified: 2026-04-27T00:00:00.000Z
---

# Code Review

## Overview

Code Review provides a reusable Supervibe operating method for Use BEFORE merging any change to systematically review code across 8 dimensions (correctness/security/readability/performance/coverage/error-handling/naming/docs) with severity ranking. Triggers: 'отревьюй код', 'code review', 'проверь PR', 'обзор кода'.
It keeps the work evidence-first, scope-bounded, confidence-scored, and verified before completion claims.
## When to Use

BEFORE any merge to main, BEFORE opening a PR for external review, AFTER completing a non-trivial implementation task.

This is methodology — used by the `code-reviewer` agent (Phase 3) AND can be attached to any other agent for self-review.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source of truth, preserve retrieval evidence, apply scope safety, use real producers with runtime receipts for durable delegated outputs, verify before completion claims, and keep confidence below gate when evidence is partial.

## Step 0 — Read source of truth (required)

1. Read the change scope (all files modified/created/deleted)
2. Read the spec/plan that motivated the change
3. Read the project's active host instruction file for conventions
4. Read selected host adapter rules for mandatory standards
5. Run typecheck + tests + lint and capture output

## Decision tree

```
Per finding, what severity?
├─ CRITICAL → blocks merge (correctness bug, security hole, data loss risk)
├─ MAJOR → must fix before merge (test gap, perf regression, contract break)
├─ MINOR → nice to fix (naming, structure, redundancy)
└─ SUGGESTION → optional improvement (style, alternative approach)
```

Is the diff touching public symbols (rename / move / extract / delete)?
  YES → MANDATORY graph evidence check:
        - Run `--callers <old-symbol-name>` — must return 0 (or all updated in same diff)
        - Run `--callers <new-symbol-name>` (if rename) — verify expected count
        - Document graph evidence in review output using Case A/B/C template
  NO  → standard 8-dim review

## 8 review dimensions (in priority order)

1. **Correctness** — does it solve the stated problem? Edge cases handled?
2. **Security** — input validation, secrets, OWASP risks
3. **Readability** — names, structure, control flow obvious?
4. **Performance** — algorithmic complexity, N+1 queries, unnecessary allocs
5. **Test coverage** — new behavior has tests; existing tests still pass
6. **Error handling** — failures handled at boundaries, not silently swallowed
7. **Naming** — names reveal intent, follow project conventions
8. **Documentation** — public API documented; non-obvious decisions explained

## Procedure

1. **Map change scope** (Step 0)
2. **For each file changed**: review against 8 dimensions
3. **Run automated checks** — typecheck, tests, lint, coverage
4. **Collect findings** — file:line + severity + suggestion
5. **Rank by severity**
6. **Structural-change check** (only if diff renames/moves/extracts/deletes a public symbol):
   - Identify changed symbol(s) by walking the diff
   - For each: `node <resolved-supervibe-plugin-root>/scripts/search-code.mjs --callers "<name>"`
   - Verify: all callers updated in same diff OR documented as breaking change
   - If breaking: require migration note + deprecation period per `api-contract-reviewer` rules
7. **Protected simplification check** (only if the diff simplifies/refactors generated, vendored, migration, or compatibility code):
   - Respect `supervibe-simplify-ignore-start: <reason>` / `supervibe-simplify-ignore-end` blocks documented in `references/protected-block-simplification.md`
   - Map the diff to 1-based touched line ranges and run `evaluateProtectedSimplification(text, touchedRanges)` from `scripts/lib/protected-block-simplification.mjs`
   - Block review approval when markers are malformed, unreasoned, unmatched, unclosed, or when any touched range overlaps a protected span, including marker lines
   - Treat generated, vendored, migration, security, legal, compatibility, and user-owned spans as preserve-by-default; protected markers can only narrow edits, never authorize deletion or weaker verification
8. **Output report** — see Output contract
9. **Score** — `supervibe:confidence-scoring` artifact-type=agent-output; ≥9 required to mark review complete

## Examples

- Use after implementation is complete: inspect the diff, rank findings by severity, cite file and line evidence, and block release on correctness, security, or missing verification gaps.
- Do not run as a substitute for building the feature or as a mid-loop blocker unless the graph explicitly marks a review gate.

## When not to use

- Do not use this skill to bypass the command or workflow that owns durable artifacts.
- Do not use it when source evidence, RAG/CodeGraph, or required verification is missing.
- Do not use it to replace a specialist producer, worker, or reviewer that must issue runtime evidence.

## Common rationalizations

- "The diff is mostly formatting, so caller behavior cannot change" fails when
  public symbols, generated output, selectors, routing, serialization, or
  config defaults changed; inspect callers and tests before approving.
- "Only one reviewer pass is enough because the implementation agent is senior"
  fails for security, data, migration, workflow, and release changes; require
  independent evidence and severity-ranked findings.
- "A green happy-path test means review is complete" fails when edge cases,
  rollback, accessibility, auth, or persistence behavior were not covered by
  the changed surface.

## Red flags

- The review verdict is `APPROVED` while a correctness, security, data-loss,
  migration, or unverified-public-contract finding remains open.
- Findings cite broad file names without line-level evidence, reachable path,
  changed behavior, or a concrete fix owner.
- The reviewer summarizes tests as "passed" without naming the exact command,
  exit code, and whether the command covers the touched behavior.

## Checklist

- Source of truth read.
- Scope and owner confirmed.
- RAG/CodeGraph/memory requirement decided.
- Evidence artifact or command recorded.
- Stop condition and next handoff clear.

## Failure modes

- Inline emulation replaces a required producer or reviewer.
- Broad use of the skill slows delivery without improving evidence.
- Missing verification lets stale assumptions pass as production-ready.

## Output contract

Return a ranked review artifact with stable fields:

- `verdict`: `APPROVED`, `APPROVED_WITH_NOTES`, or `BLOCKED`.
- `criticalFindings`: count and line-cited findings that block release.
- `majorFindings`: count and line-cited findings that must be fixed or accepted.
- `minorFindings`: count and line-cited non-blocking fixes.
- `suggestions`: optional improvements separated from required fixes.
- `evidence`: exact commands, exit codes, source reads, graph checks, and
  reviewer receipts used.
- `residualRisk`: remaining risk, owner, and why the verdict still holds.

## Guard rails

- DO NOT: rubber-stamp ("LGTM" without specifics)
- DO NOT: nitpick without substance (every comment must reference a real issue)
- DO NOT: suggest changes outside the diff scope (file separate refactor task)
- DO NOT: claim "I tested it" without showing command output
- ALWAYS: cite file:line for every finding
- ALWAYS: distinguish CRITICAL/MAJOR (blocking) from MINOR/SUGGESTION (advisory)
- **Skip graph check on rename**: silent breakage waiting to happen. The rule `use-codegraph-before-refactor` makes this a HARD BLOCK; review must enforce.
- **Deleting protected simplification blocks without checking reason/range**: can break generated, vendored, migration, security, legal, compatibility, or user-owned code. Treat malformed `supervibe-simplify-ignore-*` markers and protected-range overlaps as review blockers.

## Verification

- Run the task's targeted `node --test ...`, `npm run validate:*`, or stack
  check when review covers executable behavior.
- Run `npm run validate:agent-content-quality` or
  `npm run validate:skill-content-quality` when reviewing agent/skill changes.
- Every CRITICAL finding has a reproducer, path evidence, or source citation.
- Verdict matches finding severity; any unresolved CRITICAL remains `BLOCKED`.
- For diffs touching public symbols, cite CodeGraph or caller evidence with the
  caller count and resolution decision.

## Related

- `supervibe:requesting-code-review` — prepares the package this skill consumes
- `supervibe:receiving-code-review` — how the reviewed agent should respond
- Phase 3 `code-reviewer` agent — primary user of this skill
