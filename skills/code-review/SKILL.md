---
name: code-review
namespace: process
description: "Use BEFORE merging any change to systematically review code across 8 dimensions (correctness/security/readability/performance/coverage/error-handling/naming/docs) with severity ranking"
allowed-tools: [Read, Grep, Glob, Bash]
phase: review
prerequisites: []
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1.0
last-verified: 2026-04-27
---

# Code Review

## When to invoke

BEFORE any merge to main, BEFORE opening a PR for external review, AFTER completing a non-trivial implementation task.

This is methodology — used by the `code-reviewer` agent (Phase 3) AND can be attached to any other agent for self-review.

## Step 0 — Read source of truth (MANDATORY)

1. Read the change scope (all files modified/created/deleted)
2. Read the spec/plan that motivated the change
3. Read project's `CLAUDE.md` for conventions
4. Read `.claude/rules/*` for mandatory standards
5. Run typecheck + tests + lint and capture output

## Decision tree

```
Per finding, what severity?
├─ CRITICAL → blocks merge (correctness bug, security hole, data loss risk)
├─ MAJOR → must fix before merge (test gap, perf regression, contract break)
├─ MINOR → nice to fix (naming, structure, redundancy)
└─ SUGGESTION → optional improvement (style, alternative approach)
```

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
6. **Output report** — see Output contract
7. **Score** — `evolve:confidence-scoring` artifact-type=agent-output; ≥9 required to mark review complete

## Output contract

Returns ranked findings list:
```
CRITICAL (N findings):
  - file.ext:42 — <issue> — <suggested fix>
MAJOR (N):
  - ...
MINOR (N):
  - ...
SUGGESTION (N):
  - ...

Verdict: APPROVED | APPROVED WITH NOTES | BLOCKED
Evidence: <typecheck/test/lint output summary>
```

## Guard rails

- DO NOT: rubber-stamp ("LGTM" without specifics)
- DO NOT: nitpick without substance (every comment must reference a real issue)
- DO NOT: suggest changes outside the diff scope (file separate refactor task)
- DO NOT: claim "I tested it" without showing command output
- ALWAYS: cite file:line for every finding
- ALWAYS: distinguish CRITICAL/MAJOR (blocking) from MINOR/SUGGESTION (advisory)

## Verification

- Every CRITICAL finding has reproducer or evidence
- Verdict matches finding severity (any CRITICAL → BLOCKED)
- Test/typecheck/lint output included

## Related

- `evolve:requesting-code-review` — prepares the package this skill consumes
- `evolve:receiving-code-review` — how the reviewed agent should respond
- Phase 3 `code-reviewer` agent — primary user of this skill
