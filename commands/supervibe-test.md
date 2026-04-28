---
description: >-
  Run plugin's test + validator suite with structured output. Wraps `npm run
  check` with per-validator status, regression detection vs baseline, and quick
  re-run modes for failing subset. Triggers: 'run tests', 'прогони тесты',
  'check plugin', '/supervibe-test'.
---

# /supervibe-test

User-facing entry-point for the plugin's full quality-assurance suite. Wraps `npm run check` (253+ tests + 8 validators) with structured output, per-validator status, and the ability to re-run only failing subsets.

This command exists because `npm run check` is hidden in `package.json` and not always obvious to users. Plugin developers + project users running CI-style checks need a clear entry-point.

## Invocation forms

### `/supervibe-test` — full suite

Runs everything: `npm run check`. Reports per-validator + per-test-file status.

### `/supervibe-test --validators` — validators only (fast)

Runs only the 8 validators (no node:test). Used for quick frontmatter / footer / discipline checks.

### `/supervibe-test --tests` — tests only

Runs `npm test` (skips validators). Used when user just edited test files and wants quick feedback.

### `/supervibe-test --watch` — watch mode

Runs `npm run test:watch`. Stays running, re-runs tests on file change.

### `/supervibe-test --failing` — re-run only previously-failing items

Reads `.claude/memory/.test-results.json` (last run state). Re-runs only what was failing. Useful in tight iteration loops.

### `/supervibe-test --validator <name>` — single validator

Examples:
- `/supervibe-test --validator design-skills` → runs only `validate-design-skills.mjs`
- `/supervibe-test --validator question-discipline` → runs only `validate-question-discipline.mjs`

### `/supervibe-test --file <path>` — single test file

Example: `/supervibe-test --file tests/feedback-channel.test.mjs`

### `/supervibe-test --regression` — diff against baseline

Compares current `npm run check` output against `.claude/memory/.test-baseline.json` (saved by previous green run). Reports:
- New failures
- Newly passing (regression FIXED)
- Test count delta
- Duration delta

Useful before commit: did my change introduce a regression?

## What `npm run check` covers

Auto-discovered from `package.json` — current composition (253 tests + 8 validators):

| Step | Source | Purpose |
|---|---|---|
| 1 | `validate:plugin-json` | Manifest shape + agents:[] paths exist |
| 2 | `validate:frontmatter` | Every agent / skill / rule has required fields |
| 3 | `lint:descriptions` | Trigger-clarity format on skills |
| 4 | `validate:agent-footers` | Every agent's Output contract has Confidence + Rubric |
| 5 | `validate:design-skills` | Design skill bodies have feedback prompt + anti-patterns |
| 6 | `validate:question-discipline` | Interactive agents have dialogue discipline + anti-pattern |
| 7 | `lint:dead-code` | knip clean (no orphan exports/files) |
| 8 | `test` | 253 tests in `tests/*.test.mjs` |

If the user adds new validators (Phase 6 in token-economy plan etc.), this command auto-picks them up via package.json.

## Procedure

1. **Determine mode** from args.

2. **Pre-flight:**
   - Check `package.json` `scripts.check` exists. If missing → print actionable error + exit.
   - If `--regression`: check `.claude/memory/.test-baseline.json` exists. If not, suggest running full `/supervibe-test` to establish baseline first.

3. **Run the appropriate command:**
   ```bash
   cd $CLAUDE_PLUGIN_ROOT && <selected-command>
   ```

4. **Parse output:**
   - For validators: parse `[validator-name] all <type> compliant` or specific failure lines.
   - For tests: parse `ℹ tests N`, `ℹ pass N`, `ℹ fail N`, `ℹ duration_ms N`.
   - On failure: extract failing test names + first 200 chars of error.

5. **Persist results:**
   - Write `.claude/memory/.test-results.json`:
     ```json
     {
       "timestamp": "<ISO>",
       "mode": "full|validators|tests|file|validator",
       "passed": <total>,
       "failed": <total>,
       "duration_ms": <N>,
       "validators": { "<name>": "pass|fail", ... },
       "tests": [ { "file": "<path>", "name": "<test>", "status": "pass|fail", "error": "<excerpt>" } ]
     }
     ```
   - On full success: copy to `.claude/memory/.test-baseline.json` (becomes new regression baseline).

6. **Format output:**

   Success:
   ```
   === Evolve Test — full suite ===
   Validators:    8 / 8 ✓
   Tests:         253 / 253 ✓
   Duration:      17.3s

   ✓ All checks pass.
   Baseline updated: .claude/memory/.test-baseline.json
   ```

   Failure:
   ```
   === Evolve Test — full suite ===
   Validators:    7 / 8 ✓
     ✓ plugin-json
     ✓ frontmatter
     ✗ design-skills        — 1 issue
     ✓ question-discipline
     ✓ agent-footers
     ✓ descriptions
     ✓ knip
     ✓ tests

   Failures:
     [validator: design-skills]
       prototype: missing 'silent-viewport-expansion' anti-pattern
       Suggested fix: add bullet to skills/prototype/SKILL.md Anti-patterns section

     [test file: tests/foo.test.mjs]
       'feature X works': AssertionError: expected 5 to equal 6
         at file://tests/foo.test.mjs:42:3

   Duration: 17.5s
   Baseline NOT updated (failures present).

   Re-run only failing items: /supervibe-test --failing
   ```

7. **Suggest follow-ups:**
   - If validators fail → point at the specific source file with file:line.
   - If tests fail → suggest `/supervibe-debug` if it's an agent test, otherwise read test output.
   - If `--regression` shows new failures → suggest `git stash` + re-run to confirm caused by user's edit.

## Error recovery

| Failure | Recovery action |
|---|---|
| `npm run check` doesn't exist | Print which scripts exist; suggest re-running the installer |
| Tests fail | Per-test error excerpt + suggested next step (`/supervibe-debug`, read source, etc.) |
| Validator fails | Parse the validator's stdout for file:line; print actionable hint |
| `knip` reports unused | List unused files/exports; suggest `knip` config edit OR removal |
| Watch mode dies | Auto-restart once; second crash → exit with error |

## Output contract

See "Format output" above. Key invariants:
- **Non-zero exit code** if any check fails (so it works in CI / pre-commit hooks).
- **Structured per-validator status** (no opaque "all checks failed").
- **File:line citations** for every failure (no vague messages).

## When NOT to invoke

- For your project's own tests (not the plugin's) — use your stack's test runner directly.
- During an active agent dispatch — agent uses validators internally as needed.
- For a single source-file lint (e.g., just one agent's frontmatter) — use `/supervibe-score agent-quality <path>` for richer feedback.

## Related

- `npm run check` — the underlying script
- `package.json` `scripts:` — source of truth for what `check` composes
- `/supervibe-score` — per-artifact scoring (complementary)
- `/supervibe-execute-plan` — runs `/supervibe-test` as part of Stage B completion audit
- `.claude/memory/.test-baseline.json` — regression baseline (auto-managed)
- `.claude/memory/.test-results.json` — last-run state (auto-managed)
- `confidence-rubrics/*.yaml` — what `validate:*` checks against
