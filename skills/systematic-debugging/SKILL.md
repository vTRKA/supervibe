---
name: systematic-debugging
namespace: process
description: >-
  Use WHEN a test, runtime behavior, integration, or environment failure appears
  TO reproduce, localize, reduce, fix, guard, and document the issue with
  root-cause evidence before changing code.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
phase: exec
prerequisites: []
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1.1
last-verified: 2026-05-14T00:00:00.000Z
---

# Systematic Debugging

## Overview

Systematic debugging is the stop-the-line method for bugs, failing tests,
runtime errors, flaky behavior, integration failures, and environment failures.
It turns a symptom into a reproduced failure, narrowed cause, minimal fix,
regression guard, and documented residual risk before any completion claim.

This skill bans fix-first behavior. If the issue cannot be reproduced, localized,
or guarded, stop and report the blocker instead of guessing.

## When to Use

Use this skill before proposing or applying a fix when any of these triggers are
present:

- A test, lint, build, typecheck, migration, or validation command fails.
- Runtime behavior is wrong, crashes, times out, logs an exception, corrupts
  state, or violates a user-facing contract.
- A flaky test or intermittent production behavior is reported.
- A database, API, queue, browser, file, network, auth, or provider integration
  fails at a boundary.
- A command fails only on one machine, shell, OS, Node version, environment
  variable set, permission model, dependency install, or sandbox.
- A reviewer asks for root-cause, blast-radius, regression, or postmortem
  evidence.

## When not to use

- Do not use this skill to bypass the command, agent, reviewer, or workflow that
  owns the durable artifact.
- Do not use it as a release, security, or incident-response substitute when a
  more specific workflow owns mitigation, approval, or postmortem cadence.
- Do not continue when the active workflow requires a specialist producer,
  worker, reviewer, external tool, or validator receipt that is unavailable.
- Do not change code when the failure cannot be reproduced or the affected
  contract is unknown, except for explicitly scoped diagnostic instrumentation or
  emergency mitigation approved by the active incident workflow.
- Do not treat stale project memory, stale Code RAG, or stale CodeGraph evidence
  as structural certainty.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source
of truth, preserve retrieval evidence, apply scope safety, use real producers
with runtime receipts for durable delegated outputs, verify before completion
claims, and keep confidence below gate when evidence is partial.

## Step 0 - Source-of-truth preflight (required)

1. Read active host instructions, repository rules, the user request, and any
   claimed work item or incident artifact before searching broadly.
2. Identify the failure mode, user impact, and affected contract:
   Behavior, API, Data, UI, Security, Performance, Observability, Environment,
   Documentation, or Verification.
3. Run or record the exact reproduction command supplied by the user, test
   runner, validator, log, incident, or reviewer. Capture stdout, stderr, exit
   code, environment facts, and timestamp.
4. Read the full error output before paraphrasing. For test failures, read the
   failing test, implementation, fixtures, and setup. For runtime failures, read
   the throwing path, caller path, logs, and relevant state.
5. Query project memory and code search before unfamiliar code changes. Use
   CodeGraph before rename, move, delete, extract, public API, dependency-impact,
   or multi-module blast-radius claims.
6. If reproduction, source evidence, affected contract, or required access is
   missing, stop and return a blocker with the missing evidence and next action.

## Decision tree

```text
Observed failure?
|-- Failing deterministic test, build, lint, or validator
|   |-- Reproduces with exact command -> localize to test, fixture, code path
|   `-- Does not reproduce -> capture environment delta, rerun clean install, stop if still unknown
|-- Runtime exception or wrong behavior
|   |-- Has stack trace or log -> trace caller/data path to first divergence
|   `-- No trace -> add scoped diagnostics or ask for logs before code changes
|-- Flaky or intermittent behavior
|   |-- Can run loop/stress/retry harness -> measure failure rate, seed, timing, shared state
|   `-- Cannot quantify -> stop; do not label fixed without a repeatable signal
|-- Integration boundary failure
|   |-- Boundary is controllable -> capture raw request/response, schema, auth, timeout, retry behavior
|   `-- Boundary inaccessible -> use contract docs or mocks only as partial evidence and stop before fix claims
`-- Environment failure
    |-- Environment differs from expected -> document shell, OS, runtime, dependency, permission, config delta
    `-- Cause remains unknown -> stop-the-line and return blocked with reproduction gap
```

## Procedure

1. Define the symptom in one sentence and name the failure mode, user impact,
   affected contract, first observed evidence, and expected behavior.
2. Reproduce the issue with the narrowest available command. Keep the original
   command intact, then create a focused reproduction such as one test, one input
   case, one request, one script, or one fixture.
3. Localize the failure by reading the error in full, then tracing the execution
   path from failing assertion, exception, log, or boundary response to callers,
   state, configuration, and recent edits.
4. List at most three hypotheses. For each one, write the evidence that would
   confirm it and the evidence that would refute it. Remove hypotheses only when
   evidence rules them out.
5. Reduce the case until the smallest failure remains. For flaky failures,
   record run count, failure count, seed, timing, concurrency, isolation, and any
   shared resource. For integration failures, reduce to raw boundary input and
   output. For environment failures, reduce to the minimal version/config/permission
   delta.
6. Stop-the-line when the cause is unknown, reproduction is absent, a boundary is
   inaccessible, the affected contract is unclear, or no regression guard can be
   created. Return a blocker and do not make a code fix.
7. Apply the smallest fix that addresses the narrowed cause, not the symptom.
   Keep unrelated refactors, broad rewrites, fixture deletion, and assertion
   weakening out of scope.
8. Add the regression guard that would have caught the bug: failing test,
   contract test, fixture, seed, integration stub, environment preflight,
   assertion, monitor, or validator.
9. Verify fix evidence by rerunning the original reproduction command, the new
   guard, and the smallest adjacent blast-radius check justified by the affected
   contract.
10. Document the outcome. For non-trivial bugs, repeated failures, user impact,
    data risk, integration drift, or unknown residual risk, write a postmortem
    using `references/templates/postmortem.md`.

## Common rationalizations

- "I know the likely fix, so reproduction can wait" - reject because the fix may
  only mask the symptom or break the affected contract elsewhere.
- "The failing test is probably stale" - reject until the test's intended
  behavior, fixtures, and current product contract are read.
- "It only flakes sometimes" - reject until the failure rate, seed, timing, and
  shared state have been measured or the work is explicitly blocked.
- "The external API is down, so there is nothing to debug" - reject until raw
  boundary evidence, retry behavior, timeout behavior, and local fallback are
  captured or marked inaccessible.
- "It works on my machine" - reject until environment differences are reduced to
  specific runtime, shell, OS, dependency, config, permission, or sandbox facts.
- "A broad refactor will probably fix it" - reject unless the root cause proves
  the current structure is the defect and the blast radius is reviewed.

## Red flags

- A fix is proposed before the original reproduction command is run or recorded.
- The report names "root cause" without a narrowed file, function, boundary,
  state transition, config, data row, or environment delta.
- A flaky failure is called fixed after one pass without run-count evidence or a
  deterministic guard.
- The regression guard deletes a test, weakens an assertion, accepts either old
  or new behavior, or validates only a mocked happy path.
- Integration debugging omits raw payloads, status codes, auth mode, timeout,
  retry, idempotency, schema, or rate-limit evidence.
- Environment debugging omits the runtime version, shell, OS, package manager,
  dependency install state, env vars, permissions, or sandbox limits.
- The output does not state failure mode, user impact, affected contract,
  residual risk, and the verification command results.

## Checklist

- Source of truth read: instructions, task/incident artifact, relevant memory,
  code search, and CodeGraph when structural impact matters.
- Failure mode, user impact, affected contract, expected behavior, and observed
  behavior are explicit.
- Reproduction command is exact, rerunnable, and paired with pre-fix evidence.
- Cause is localized and reduced to the smallest test, input, boundary, state,
  or environment delta.
- Fix addresses the narrowed cause and avoids unrelated scope.
- Regression guard fails before the fix or is justified as a new prevention
  guard when pre-fix execution is impossible.
- Original command, guard command, and adjacent blast-radius check pass after
  the fix or are recorded as blockers.
- Postmortem, memory, runbook, or reviewer handoff is written when impact,
  recurrence, or residual risk requires it.

## Failure modes

- Missing reproduction: the agent edits from intuition. Recovery is to stop,
  record the missing command or input, and ask for logs or access before fixing.
- Mislocalized cause: the agent fixes the caller while the bug lives in shared
  state, fixtures, schema, config, or dependency behavior. Recovery is to reduce
  the case and trace the first divergence.
- Symptom suppression: the agent catches, retries, ignores, or broadens
  assertions without explaining why that behavior is correct. Recovery is to
  re-open the failure and define the expected contract.
- No regression guard: the fix works once but can silently regress. Recovery is
  to add a test, validator, monitor, fixture, seed, or environment preflight.
- Flake misclassification: intermittent behavior is dismissed because a rerun
  passed. Recovery is to measure enough runs to show a rate or stop as unknown.
- Boundary blind spot: integration behavior is verified only with a local mock.
  Recovery is to capture raw boundary evidence or mark external access as a
  confidence-lowering blocker.
- Environment blind spot: a machine-specific failure is treated as application
  logic. Recovery is to document runtime, dependency, shell, OS, permission,
  sandbox, and config deltas.
- Documentation gap: user impact, affected contract, residual risk, or rollback
  is absent. Recovery is to write the postmortem or handoff before completion.

## Examples

- Failing test: run `node --test tests/payment-total.test.mjs --test-name-pattern "rounds tax"` and capture the assertion diff, then reduce to the fixture row that miscalculates cents, fix the rounding branch, and guard it with the same focused test plus the original suite command.
- Runtime error: reproduce `npm run dev -- --scenario expired-session`, read the full stack trace, localize the null access to the auth callback contract, add a guard for missing session data, and verify with the scenario command and a regression test for the callback.
- Flaky behavior: run `node --test tests/scheduler.test.mjs --test-reporter tap` in a 50-run loop, record 7 failures with the same seed and shared temp directory, isolate the race to cleanup ordering, and guard with a deterministic temp-directory test.
- Integration failure: replay `node scripts/sync-provider.mjs --account fixture-a --dry-run`, capture raw status, headers, body, retry count, and idempotency key, localize the schema mismatch at the provider boundary, and guard with a contract fixture for the changed field.
- Environment failure: reproduce `npm ci` on the failing Node and OS version, compare package manager, lockfile, permissions, proxy, and env vars against the expected setup, document the version delta, and guard with an environment preflight or clearer install error.
- Anti-example: do not change an assertion from exact output to truthy output after one failing test run; that hides the affected behavior contract and creates no regression guard.

## Output contract

Return these fields in the final debugging artifact or response:

- `status`: `fixed`, `mitigated`, `blocked`, `unreproduced`, or `needs-info`.
- `failureMode`: failing test, runtime error, flaky behavior, integration
  failure, environment failure, data/state issue, performance issue, or other
  named mode.
- `userImpact`: affected user, workflow, data, reliability, support, release, or
  internal developer impact, including "not user-facing" when supported.
- `affectedContract`: Behavior, API, Data, UI, Security, Performance,
  Observability, Environment, Documentation, or Verification contract.
- `reproductionCommand`: exact command, request, scenario, input, log query, or
  manual steps that reproduce or attempted to reproduce the issue.
- `preFixEvidence`: command output, assertion diff, stack trace, logs, payload,
  environment delta, run count, or explicit blocker.
- `narrowedCause`: concrete root cause with file/function/boundary/state/config
  evidence, or `unknown` with the missing evidence.
- `reduction`: smallest reproducer, fixture, input, seed, boundary case, or
  environment delta used to prove the cause.
- `fixEvidence`: changed behavior plus exact post-fix command output or reviewer
  evidence.
- `regressionGuard`: test, validator, monitor, fixture, contract check,
  environment preflight, or explicit reason a guard is blocked.
- `verificationCommands`: original reproduction, guard command, and adjacent
  blast-radius command with pass/fail/blocker status.
- `postmortemPath`: path to the postmortem when one is required, otherwise
  `not-required` with rationale.
- `residualRisk`: remaining uncertainty, blast-radius note, owner, trigger, and
  next action.

## Guard rails

- DO NOT: propose a fix before reproduction or a documented reproduction blocker.
- DO NOT: call a cause "root cause" without evidence that rules out competing
  hypotheses.
- DO NOT: delete tests, weaken assertions, suppress exceptions, ignore errors,
  or widen accepted behavior to make the failure pass.
- DO NOT: label a failure flaky without quantifying or isolating it.
- DO NOT: claim integration confidence from a mock when the real boundary was
  inaccessible.
- DO NOT: claim environment confidence without exact runtime, dependency,
  permission, shell, OS, config, and sandbox facts.
- ALWAYS: name failure mode, user impact, affected contract, reproduction
  command, narrowed cause, fix evidence, regression guard, and residual risk.
- ALWAYS: stop-the-line for unknown failures, missing access, missing guard, or
  missing affected contract.
- ALWAYS: keep the fix minimal and verify with the original command plus the
  guard that prevents recurrence.

## Verification

- Run the original reproduction command and record the pre-fix failure or the
  explicit blocker that made pre-fix execution impossible.
- Run the focused guard command, such as `node --test tests/<name>.test.mjs`,
  `npm run validate:<scope>`, a contract replay script, or an environment
  preflight.
- Run the smallest adjacent blast-radius check justified by the affected
  contract, such as the owning suite, validator, integration dry run, or runtime
  scenario.
- Confirm no tests, fixtures, assertions, monitors, or validation gates were
  removed unless the affected contract explicitly changed and review approved it.
- For this skill file, use `npm run validate:skill-content-quality` and, when
  links or referenced artifacts change, `npm run validate:artifact-links`.

## Related

- `supervibe:verification` - prove the fix and guard work.
- `supervibe:tdd` - write or preserve the failing regression before the fix.
- `supervibe:source-driven-development` - refresh external API or standard
  evidence before fixing provider or platform behavior.
- `supervibe:code-review` - review non-trivial fixes, blast radius, and
  regression guards.
- `supervibe:incident-response` - mitigate user-facing incidents and produce
  incident-level timelines.
- `references/templates/postmortem.md` - document non-trivial bugs, repeated
  failures, user impact, unknowns, and residual risk.
