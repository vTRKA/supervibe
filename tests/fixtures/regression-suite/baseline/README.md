# Regression suite baseline

This directory will hold the **pre-token-economy** outputs for the 5×8 = 40 canonical tasks defined in `../canonical-tasks.json`.

## Why empty now

Establishing the baseline requires 40 real Task-tool dispatches with the user-driven paste workflow (see `scripts/regression-suite.mjs`). This is structured prompt-driven work that takes ~2-4 hours of paste cycles, not full automation.

## How to populate

Run from project root:

```bash
node scripts/regression-suite.mjs baseline
```

The script will print each task as a system-prompt with structured markers; for each:

1. Open Claude Code in the project (separate session).
2. Dispatch the named agent with the printed task verbatim.
3. Copy the agent's full output (including Confidence/Override/Rubric footer).
4. Paste into the script's stdin.
5. Hit Ctrl-D (Linux/Mac) or Ctrl-Z then Enter (Windows) to advance.

The script is **resume-friendly**: if it crashes or you want to do this in batches, re-running skips already-saved tasks (one file per `<agent>-<idx>.md`).

## After baseline is populated

Per-phase regression check:

```bash
# After Phase 1 ships (CLAUDE.md slim):
node scripts/regression-suite.mjs phase1
# Captures phase1 outputs.

# Compare against baseline:
node scripts/lib/regression-scorer.mjs --baseline baseline --current phase1
# Reports any confidence-regression or evidence-regression.
```

Same procedure for phase2, phase3, phase4, phase5.

## Quality guard

If `regression-scorer.mjs` reports any regression:
1. Identify which file regressed
2. Read that task's output (old vs new) side-by-side
3. Determine root cause (Phase X edit broke something)
4. Revert that phase's commit
5. Adjust the plan + retry

This is the safety net per the token-economy plan's hard constraint #8.
