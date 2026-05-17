---
name: tdd
namespace: process
description: >-
  Use BEFORE writing any production code for a feature or bugfix to enforce
  red-green-refactor with integration-tests-first discipline. Triggers: 'TDD',
  'red-green-refactor', 'failing test', 'тесты сначала'.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
  - Edit
phase: exec
prerequisites: []
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1.1
last-verified: 2026-05-17T00:00:00.000Z
---

# TDD

## Overview

TDD turns implementation work into small evidence-backed loops: write the
behavior test first, prove it fails, implement the smallest change, prove it
passes, then refactor behind the same behavior proof. Use it to keep features,
bug fixes, and behavior-preserving refactors anchored to observable outcomes
instead of implementation guesses.

## When to Use

Use before writing production code for a new feature, bug fix, or refactor that
changes behavior. Triggered when implementation step is reached in
`supervibe:executing-plans`.

Use for:
- New behavior that can be described with executable expectations.
- Bug fixes that need a regression test before the fix.
- Refactors that need characterization or guard tests around public behavior.
- Boundary behavior where an integration, contract, or e2e test can prove the
  observable result.

Not for: pure config changes, scaffolding files, documentation updates,
dependency bumps, generated code, or exploratory spikes with no stable expected
behavior yet.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source of truth, preserve retrieval evidence, apply scope safety, use real producers with runtime receipts for durable delegated outputs, verify before completion claims, and keep confidence below gate when evidence is partial.

## Step 0 — Read source of truth (required)

1. Read project's test conventions from the active host instruction file
2. Identify test framework from `package.json` / `composer.json` / `Cargo.toml` (vitest/jest/pytest/phpunit/cargo test/etc.)
3. Identify test command (`npm test`, `pytest`, etc.) and per-file invocation form
4. Check if project has a "no mocks" rule in the selected host adapter rules folder (some projects mandate integration tests)
5. Read `references/checklists/testing.md` for evidence and residual-risk expectations

## Decision tree

```
What kind of test?
├─ Pure logic (formatter, parser, calculator) → unit test
├─ Boundary code (API endpoint, DB query, file IO) → integration test (real DB if possible)
├─ Cross-system (third-party API call) → contract test + recorded response
└─ UI behavior → e2e test (Playwright/Cypress)

Mock policy?
- Project has an explicit no-mocks rule for the dependency -> real dependency always (DB, filesystem, etc.)
├─ External service unavailable in dev → record-replay (VCR-style)
└─ Otherwise → test against real dependency by default
```

## Red-green-refactor contract

Use TDD as a behavior loop, not as a documentation ritual.

1. Red: write the smallest executable test that describes one observable behavior
   and fails for the expected reason before production code changes.
2. Green: write the least production code needed to pass that behavior without
   widening the change surface.
3. Refactor: improve structure, names, duplication, or boundaries while keeping
   the behavior stable and the same focused test command green.
4. Repeat: add the next behavior only after the current red-green-refactor loop
   has passing evidence.

Evidence must show the failing-before command and the passing-after command. If
either side cannot be produced, stop the completion claim and record explicit
residual risk.


## Scenario matrix before RED

Before writing the first failing test, enumerate the behavior matrix so the suite does not collapse into one happy path:

| Dimension | Ask | Test shape |
| --- | --- | --- |
| Happy | What valid input or flow succeeds? | One clear success case at the lowest useful layer. |
| Negative | What invalid input, denied permission, or bad state is rejected? | Error/rejection case with exact observable error and no unwanted side effect. |
| Boundary/null | Which zero, one, max, max+1, empty, null, undefined, or missing-field cases matter? | Parameterized cases or separate DAMP tests when readability is better. |
| Concurrency/degraded | What happens on retry, double-submit, timeout, unavailable dependency, or out-of-order response? | Integration or contract test with deterministic fake clock/dependency where needed. |
| Regression | What reported symptom must never return? | Failing-before reproduction kept as a permanent regression guard. |

Use explicit N/A rationale for dimensions that do not apply. A behavior change with only a success-path test is not ready unless the missing failure dimensions are intentionally out of scope.

## Test sizing and pyramid

- Small tests cover pure functions, deterministic policy, parsing, formatting,
  validation, and branch-heavy logic. They should be fast, local, and numerous.
- Medium tests cover adapters and boundaries such as API handlers, persistence,
  filesystem behavior, queues, and service integration using real local
  dependencies whenever the project supports them.
- Large tests cover browser, CLI, workflow, or multi-service behavior. Use them
  for the user-visible contract and high-value regression paths, not for every
  branch.
- The test pyramid is a default shape: many small tests, fewer medium tests, and
  a small number of large end-to-end tests. Invert only when the application
  surface genuinely cannot be validated below the UI or workflow level.
- One test should usually verify one behavior. Multiple assertions are acceptable
  when they describe the same behavior and make the expected contract clearer.

## DAMP vs DRY in tests

Prefer DAMP tests (descriptive and meaningful phrases) over aggressively DRY
tests when duplication improves readability. A future maintainer should
understand the behavior by reading the test body.

- Keep setup inline when it is short and clarifies the scenario.
- Extract builders, fixtures, or helpers only when they remove noise without
  hiding the behavior under test.
- Avoid shared assertion helpers that make failures harder to diagnose.
- Name tests by observable behavior, not implementation details.

## Regression tests

For a bug fix, first reproduce the defect with a failing test that would have
failed before the fix. Keep the fixture as small as possible, assert the user or
contract-visible symptom, and preserve the test after the fix so the defect
cannot silently return. If the bug cannot be reproduced deterministically, record
the attempted reproduction, why automation is unavailable, and the residual
risk.

## Boundary mocking policy

Mock only at boundaries that are slow, nondeterministic, paid, unavailable, or
outside the process owner. Prefer real local dependencies for code the project
owns.

- Do not mock the unit's collaborators merely to assert internal calls.
- Do not mock databases, filesystems, clocks, queues, or HTTP clients when the
  project has explicit real-dependency test rules for them.
- Use fake clocks, temp directories, local test databases, in-memory queues, or
  record-replay contracts when they make the boundary deterministic.
- Pair mocks for external services with a contract, fixture, or recorded response
  so the mock cannot drift from reality unnoticed.

## Procedure

1. **Write failing test** — describe one observable behavior, with measurable expected value
2. **Run test** — verify it FAILS for the right reason (red). Show output.
3. **Write minimal implementation** — JUST enough to pass the test
4. **Run test** — verify it PASSES (green). Show output.
5. **Refactor** — improve names/structure; tests stay green
6. **Run test again** — confirm refactor didn't break (still green)
7. **Commit** (skip if user said no commits) with message describing behavior, not implementation
8. **Repeat** for next behavior

## Example patterns

| Scenario | First failing test | Passing-after proof |
| --- | --- | --- |
| Pure logic | A unit test for one input/output rule, edge case, or invariant. | The same per-file unit command passes and nearby logic tests still pass. |
| API behavior | An integration test calls the route/handler with real validation, auth, and persistence boundaries where available. | The route-level test passes and proves status, body, side effect, and error shape as needed. |
| UI behavior | A component or e2e test performs the user action and asserts the visible state, accessibility state, or navigation result. | The browser/component command passes with the same interaction path. |
| Bug fix | A regression test reproduces the reported symptom before editing production code. | The reproduction test passes and the final note names the defect that is now guarded. |
| Refactor guard | A characterization test captures externally visible behavior before structural changes. | The same guard test stays green after refactor, with no assertions tied to private implementation. |

## When TDD is the wrong tool

- Exploratory spikes where the goal is to learn an unknown API or feasibility;
  timebox the spike, discard or quarantine it, then resume TDD for retained code.
- Generated code, vendored code, lockfile churn, or mechanical formatting where
  validators are the correct proof.
- One-off migrations or data repairs that need rehearsal, backups, and
  post-condition checks more than unit-first design.
- Visual exploration where the expected result is not yet known; use screenshots,
  design review, or acceptance criteria first, then add behavior tests for stable
  interactions.
- Emergency mitigation where production risk requires a hotfix first; record the
  exception and add regression coverage immediately after the system is stable.

## When not to use

- Do not use this skill to bypass the command or workflow that owns durable artifacts.
- Do not use it when source evidence, RAG/CodeGraph, or required verification is missing.
- Do not use it to replace a specialist producer, worker, or reviewer that must issue runtime evidence.

## Common rationalizations

- "This is small, so no source check is needed" - reject when the skill changes code, config, or durable artifacts.
- "The user asked for speed, so skip receipts" - reject when durable work, delegation, or review is claimed.
- "Existing prose is enough evidence" - reject when validators or command output are required.

## Red flags

- A durable artifact changes without a command, receipt, or verification path.
- The skill is used outside its phase without an explicit handoff.
- Claims of completion appear before evidence and confidence scoring.

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

Returns:
- Scenario matrix: changed behaviors mapped to happy, negative, boundary/null, concurrency/degraded, regression, or explicit N/A rationale.
- Failing-before evidence: command, working directory, exit code, and the
  relevant failure line proving the test was red for the expected reason.
- Passing-after evidence: command, working directory, exit code, and the
  relevant pass line proving the implemented behavior is green.
- Refactor evidence when refactoring occurred: the same targeted command remains
  green after structure-only changes.
- Explicit residual risk when failing-before or passing-after evidence is
  unavailable, including why it is unavailable and what surface remains unproven.
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

- Scenario matrix exists for changed behavior, including at least one failure or edge case where applicable.
- Failing-before evidence exists or residual risk is explicit.
- Passing-after evidence exists or residual risk is explicit.
- Test file exists with assertion
- Test command output shows transition: FAIL → PASS
- Coverage delta ≥0% (project may have higher bar)
- No regressions in existing tests
- Mutation question answered for new tests: what incorrect code path would this assertion catch?

## Related

- `references/checklists/testing.md` — testing evidence checklist
- `supervibe:systematic-debugging` — when test fails for wrong reason
- `supervibe:executing-plans` — invokes this skill per task that requires production code
