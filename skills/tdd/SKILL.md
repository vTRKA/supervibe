---
name: tdd
namespace: process
description: "Use BEFORE writing any production code for a feature or bugfix to enforce red-green-refactor with integration-tests-first discipline. RU: Используется ПЕРЕД написанием production-кода для фичи или фикса — навязывает red-green-refactor с дисциплиной integration-tests-first. Trigger phrases: 'TDD', 'red-green-refactor', 'failing test', 'тесты сначала'."
allowed-tools: [Read, Grep, Glob, Bash, Write, Edit]
phase: exec
prerequisites: []
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1.0
last-verified: 2026-04-27
---

# TDD

## When to invoke

BEFORE writing any production code for a new feature, bug fix, or refactor that changes behavior. Triggered when implementation step is reached in `supervibe:executing-plans`.

NOT for: pure config changes, scaffolding files, documentation updates, dependency bumps.

## Step 0 — Read source of truth (required)

1. Read project's test conventions from the active host instruction file
2. Identify test framework from `package.json` / `composer.json` / `Cargo.toml` (vitest/jest/pytest/phpunit/cargo test/etc.)
3. Identify test command (`npm test`, `pytest`, etc.) and per-file invocation form
4. Check if project has a "no mocks" rule in the selected host adapter rules folder (some projects mandate integration tests)

## Decision tree

```
What kind of test?
├─ Pure logic (formatter, parser, calculator) → unit test
├─ Boundary code (API endpoint, DB query, file IO) → integration test (real DB if possible)
├─ Cross-system (third-party API call) → contract test + recorded response
└─ UI behavior → e2e test (Playwright/Cypress)

Mock policy?
├─ Project has rules/no-mock-X.md → real X always (DB, filesystem, etc.)
├─ External service unavailable in dev → record-replay (VCR-style)
└─ Otherwise → test against real dependency by default
```

## Procedure

1. **Write failing test** — describe one observable behavior, with measurable expected value
2. **Run test** — verify it FAILS for the right reason (red). Show output.
3. **Write minimal implementation** — JUST enough to pass the test
4. **Run test** — verify it PASSES (green). Show output.
5. **Refactor** — improve names/structure; tests stay green
6. **Run test again** — confirm refactor didn't break (still green)
7. **Commit** (skip if user said no commits) with message describing behavior, not implementation
8. **Repeat** for next behavior

## Output contract

Returns:
- Test files at `tests/...` matching project convention
- Production code at expected location
- Test command output showing all green
- Commit history of red→green→refactor cycle

## Guard rails

- DO NOT: write production code before failing test exists
- DO NOT: test implementation details (tests should survive refactor)
- DO NOT: commit with red tests
- DO NOT: skip the red step ("I know it would fail")
- DO NOT: mock when project rule says no mocks
- ALWAYS: name tests by behavior ("returns empty when input is null") not by function ("test_foo")
- ALWAYS: one test = one observable behavior

## Verification

- Test file exists with assertion
- Test command output shows transition: FAIL → PASS
- Coverage delta ≥0% (project may have higher bar)
- No regressions in existing tests

## Related

- `supervibe:systematic-debugging` — when test fails for wrong reason
- `supervibe:executing-plans` — invokes this skill per task that requires production code
