# Testing Reference Pack

Use this when an agent or skill changes behavior, validates a plan, or claims
regression safety.

## Gates

- Map each changed behavior to at least one executable check before editing.
- Prefer the narrowest deterministic command that covers the touched module,
  artifact type, or workflow edge.
- Run broader suites only when the change crosses shared contracts, release
  gates, or user-facing flows.
- Block completion if no command was run, unless the final output names the
  constraint and residual risk.

## Evidence

- Record command, working directory, exit code, and the relevant pass/fail line.
- For failures, preserve the first actionable diagnostic and the affected file
  or assertion.
- For manual checks, capture exact input, observed output, and why automation is
  not available.
- For skipped full suites, name the targeted substitute and why it is sufficient.

## TDD Evidence

- Red evidence: before production code changes, run the focused test and record
  the failure that proves the expected behavior is not implemented yet.
- Green evidence: after the implementation, rerun the same focused command and
  record the pass line.
- Refactor evidence: after structure-only cleanup, rerun the same command and
  record that it remains green.
- Missing red or green evidence blocks a completion claim unless the final output
  names the exact residual risk and why executable evidence was unavailable.


## Scenario Matrix

Before adding tests, map the changed behavior to scenario rows:

- Happy path: valid input or primary user flow succeeds.
- Negative path: invalid input, denied permission, illegal state, or dependency failure is rejected with a specific observable result.
- Boundary/null path: zero, one, max, max+1, negative, empty, null, undefined, missing fields, and very large inputs where relevant.
- Concurrency/idempotency path: double-submit, retry, simultaneous write, out-of-order response, or stale read where relevant.
- Time/locale/encoding path: fake-clock, timezone, DST, currency rounding, Unicode, RTL, or normalization cases where relevant.
- Regression path: exact reported symptom is reproduced before the fix and remains in the suite.

A row may be marked N/A only with a concrete reason. Do not treat a suite as adequate when every new test is a happy path, snapshot, broad smoke check, or assertion that would still pass after deleting the behavior.

## Test Shape

- Size tests to the behavior: small for pure logic, medium for owned boundaries,
  large for user-visible workflows or cross-system behavior.
- Keep the pyramid balanced: many deterministic unit tests, fewer integration
  tests around boundaries, and a small set of end-to-end tests for critical
  flows.
- Prefer DAMP tests over hidden abstractions. Inline scenario details when they
  clarify behavior; extract helpers only when they remove noise without hiding
  the expected contract.
- Regression tests should reproduce the bug before the fix, assert the symptom
  that users or callers observe, and stay in the suite after the fix.

## Boundary Mocking

- Prefer real local dependencies for owned code: test databases, temp files,
  fake clocks, local queues, or in-process handlers.
- Mock only slow, paid, nondeterministic, unavailable, or external services.
- Pair mocks with contract fixtures or recorded responses when the external
  service shape matters.
- Do not mock internal collaborators just to assert implementation calls; assert
  observable behavior instead.

## When TDD Is Wrong

- Exploratory spikes where no stable expected behavior exists yet.
- Generated, vendored, or mechanically formatted files where validators are the
  proof.
- One-off data migrations or repairs that need rehearsal and post-condition
  checks more than unit-first design.
- Emergency mitigation where risk requires a hotfix first; add the regression
  test immediately after stabilization and name the residual risk.

## Example Evidence Map

- Pure logic: failing unit case for one input/output rule, then the same unit
  command passing after implementation.
- API behavior: failing route or handler integration case for status, body, and
  side effect, then the same route-level command passing.
- UI behavior: failing component or e2e interaction asserting visible state,
  accessibility state, or navigation, then the same browser/component command
  passing.
- Bug fix: failing reproduction for the reported symptom, then a passing
  regression test that remains in the suite.
- Refactor guard: characterization test for externally visible behavior before
  structural edits, then the same guard staying green after refactor.

## Failure Modes

- Claiming coverage from a command that does not exercise the changed path.
- Treating compile, lint, or link validation as behavioral proof by itself.
- Fixing unrelated failures found by a broad suite without user scope approval.
- Omitting residual risk after changing generated artifacts, prompts, or routing.

## Acceptance Check

- Every user-visible or contract-visible change has a scenario matrix and a matching test, validator,
  or explicit manual evidence item.
- The final report can be replayed by another agent from the command and file
  references alone.
- Remaining risk is bounded to untested surfaces and does not contradict the
  requested verification scope.
- New or changed tests answer the mutation question: the report names at least
  one bad implementation change the assertions would catch.
