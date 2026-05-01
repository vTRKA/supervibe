---
name: test-strategy
namespace: app-excellence
description: "Use BEFORE designing tests for a new feature TO establish pyramid (unit/integration/e2e ratios), fixture isolation policy, flake budget, coverage triangulation strategy. RU: Используется ПЕРЕД проектированием тестов под новую фичу — устанавливает пирамиду (unit/integration/e2e), политику изоляции фикстур, flake budget и стратегию триангуляции покрытия. Trigger phrases: 'test strategy', 'покрытие тестами', 'тестовая пирамида', 'стратегия тестов'."
allowed-tools: [Read, Grep, Glob, Bash]
phase: plan
prerequisites: []
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1.0
last-verified: 2026-04-27
---

# Test Strategy

## When to invoke

BEFORE writing the first test for a new feature. BEFORE adding a new test layer (e.g. introducing Playwright into a project that only had Jest). WHEN flake rate breaches the project SLO. WHEN a coverage report shows numerically high coverage but bugs still ship.

The skill answers four questions in order: what shape is the pyramid, how do fixtures stay isolated, what flake budget is acceptable, how is coverage triangulated.

## Step 0 — Read source of truth (required)

1. Read project the active host instruction file for any pre-declared testing conventions.
2. Read `package.json` / `pyproject.toml` / `Cargo.toml` to enumerate which test runners exist already.
3. Read CI config (`.github/workflows/`, `.gitlab-ci.yml`, etc.) and capture current test job timings.
4. Read the most recent flaky-test issues / quarantine list (search for `skip`, `xit`, `@flaky`, `t.Skip`, quarantine tags).
5. Pull the latest coverage report if one is published; record line / branch / mutation numbers separately.

## Decision tree

```
Is the feature pure logic (no I/O, no UI)?
  YES → 90% unit, 10% contract; no e2e needed
  NO  → continue

Does the feature cross a process boundary (DB, HTTP, queue)?
  YES → add integration layer with real dependency in container or in-memory double
  NO  → unit + a single happy-path e2e is enough

Is there a user-visible flow (form → server → screen)?
  YES → at least one e2e per critical journey, capped at 10% of total runtime
  NO  → skip e2e

Is the feature behind a flag with staged rollout?
  YES → add a contract test pinned to the OFF state so cleanup is safe later
  NO  → standard pyramid only
```

## Procedure

1. **Pyramid sizing**: target ≈70% unit / ≈20% integration / ≈10% e2e measured by *test count*, and a hard ceiling of 10% e2e by *wall-clock runtime*. Document the chosen ratios in `docs/testing.md` or equivalent.
2. **Fixture isolation policy**: pick exactly one of (a) per-test transactional rollback, (b) per-test schema/database, (c) per-test in-memory clone. Document the chosen mode and ban shared mutable state across tests.
3. **Test-data factories**: prefer factory functions (`makeUser({ overrides })`) over fixture files. Fixture files are allowed only for golden-file assertions.
4. **Flake budget**: declare an explicit budget (e.g. ≤0.5% flake rate over rolling 7 days). Define the quarantine workflow: a flake either gets a fix-by date or gets deleted; never left in `.skip` indefinitely.
5. **Coverage triangulation**: do not gate on line coverage alone. Combine line + branch + at least one stronger signal (mutation testing on critical modules, contract tests at the API boundary, or property-based tests on pure functions).
6. **CI gate thresholds**: encode minimum line / branch / mutation thresholds as CI failures, not advisory warnings. Differential coverage on the diff is preferable to absolute repo numbers.
7. **Fast-feedback loops**: keep the unit suite under 60 seconds locally. If it grows beyond that, split by package/module before adding parallelism — slow tests usually mean leaked I/O.
8. **Output**: write the strategy as a short ADR-style note (see Output contract).
9. **Score** — invoke `supervibe:confidence-scoring` with artifact-type=agent-output; ≥9 required to mark this skill complete.

## Output contract

A strategy document containing:

```
Pyramid: <unit%> / <integration%> / <e2e%>  (count + runtime)
Isolation: <transactional | per-test-db | in-memory>
Factories: <path to factory module> + ban list for shared fixtures
Flake budget: <X% over Y days>; quarantine TTL: <Z days>
Coverage triangulation: line ≥ <a>%, branch ≥ <b>%, mutation ≥ <c>% on <modules>
CI gates: <list of failing thresholds>
Fast-feedback: unit suite target = <seconds>; runner = <name>
Open risks: <enumerated>
```

## Anti-patterns

- **e2e-heavy-pyramid** — inverted pyramid; slow CI, brittle suite, expensive failures.
- **shared-mutable-fixtures** — tests pass alone, fail in suite, or vice versa; impossible to parallelise.
- **sleep-not-wait** — `sleep(500)` instead of waiting for a condition; flaky and slow simultaneously.
- **over-mocking** — every collaborator stubbed; tests pass with bugs the integration would catch.
- **flaky-tolerance** — `.skip` with no expiry; signals decay until the suite is ignored.
- **test-coupling** — test B depends on test A having run first; reorder breaks everything.
- **coverage-without-meaning** — 95% line coverage with assertion-free tests; mutation score reveals the truth.

## Verification

- Pyramid percentages are stated, not implied.
- Fixture isolation mode is named, not "we'll be careful".
- Flake budget has a numeric threshold and a quarantine TTL.
- At least two of (line, branch, mutation, contract, property) are gated in CI.
- Unit suite local runtime measured and recorded.
- e2e wall-clock share measured and ≤10%.

## Related

- `supervibe:tdd` — drives the day-to-day red/green/refactor loop on top of this strategy.
- `supervibe:audit` — periodic re-check of flake rate and coverage triangulation.
- `supervibe:feature-flag-rollout` — paired strategy when the feature ships behind a flag.
- `supervibe:error-envelope-design` — defines the contract that integration tests assert against.
