---
description: >-
  Auto-detect which evolve phase to run (genesis / audit / strengthen / adapt /
  evaluate / update) based on the current project state.
---

# /evolve

Dispatcher. Reads project + plugin state via a deterministic detector and proposes the right next command. Never modifies anything itself — always defers to the phase-specific command after user confirmation.

## How it works

The detector lives at `scripts/lib/supervibe-state-detector.mjs` and runs **7 checks in priority order** (first-triggered wins). Each check is independent code, NOT an AI heuristic — failures are surfaced explicitly, false-positives are testable.

| Priority | Check | Signal source | Proposes |
|----------|-------|---------------|----------|
| 1 | `upstream-behind` | `.claude-plugin/.upgrade-check.json` shows `behind > 0` | `/supervibe-update` |
| 2 | `version-bump-unacked` | `.claude/memory/.evolve-version` < installed plugin version | `/supervibe-adapt` |
| 3 | `project-not-scaffolded` | No `.claude/agents/` AND no `CLAUDE.md` in project root | `/supervibe-genesis` |
| 4 | `underperformers` | `auto-strengthen-trigger` returns ≥1 flagged agent (needs ≥10 invocations to trigger) | `/supervibe-strengthen` |
| 5 | `stale-artifacts` | ≥3 files in `agents/` `rules/` `skills/` with `last-verified` >30 days old | `/supervibe-audit` |
| 6 | `override-rate-high` | `.claude/confidence-log.jsonl` shows >5% overrides over last 100 entries | `/supervibe-audit` |
| 7 | `pending-evaluation` | Latest invocation in `agent-invocations.jsonl` has no `outcome` field | `/supervibe-evaluate` |
| (none) | — | All 7 checks pass | "System healthy. No action needed." |

## Procedure

1. **Run the detector.** Execute `node $CLAUDE_PLUGIN_ROOT/scripts/supervibe-detect.mjs` from the project root. It prints a human-readable banner + the proposed next command. Failure-tolerant — individual check errors do not break the run.

2. **Show the user the report.** Print every check's status (✓ pass / ⚠ triggered) with one-line evidence. Do not paraphrase — the detector's wording is precise.

3. **Stop at first triggered check.** Do not chain phases automatically — propose ONE next command and wait for user confirmation. The user might want to skip an audit and go straight to update, etc.

4. **Ask for confirmation** before running anything destructive. `/supervibe-update` and `/supervibe-adapt` modify files — explicit "yes" required. `/supervibe-audit` and `/supervibe-evaluate` are read-only and can run immediately if the user agrees.

## Output contract

Mirrors what `evolve-detect.mjs` prints, plus a one-line conclusion:

```
=== Supervibe State ===
Project:  <path>
Plugin:   <path>

  ✓ upstream-behind             → plugin is up to date with upstream
  ✓ version-bump-unacked        → project + plugin both on 1.7.0
  ⚠ project-not-scaffolded      → no .claude/agents/ and no CLAUDE.md — run genesis first
  ✓ underperformers             → 12 invocations, no underperformers
  ✓ stale-artifacts             → 0 stale artifact(s) (under 3-threshold)
  ✓ override-rate-high          → override rate 1.2% (under threshold)
  ✓ pending-evaluation          → latest invocation already has outcome

Proposed: /supervibe-genesis
Why:      no .claude/agents/ and no CLAUDE.md — run genesis first

Confidence: N/A    Rubric: read-only-research
```

## When NOT to invoke

- You already know which phase you want — call it directly. The dispatcher adds a round-trip you can skip.
- You only want a one-off score — `/supervibe-score`.
- You are diagnosing a specific bug — `supervibe:systematic-debugging` skill is more direct.

## Related

- `scripts/lib/supervibe-state-detector.mjs` — the deterministic detector (7 checks, all unit-tested)
- `tests/supervibe-state-detector.test.mjs` — covers each check's triggered + not-triggered paths
- All `/supervibe-*` phase commands — what this dispatcher proposes
- `npm run supervibe:status` — overlapping but more index-focused
