---
description: "Auto-detect which evolve phase to run (genesis / audit / strengthen / adapt / evaluate / update) based on the current project state."
---

# /evolve

Dispatcher. Looks at the project + plugin state and proposes the right next command. Never modifies anything itself — always defers to the phase-specific command after user confirmation.

## Detection logic

Run these checks in order, stop at the first match.

| Check | Signal | Propose |
|-------|--------|---------|
| 1. Plugin upgrade pending | `.claude-plugin/.upgrade-check.json` shows `behind > 0` | `/evolve-update` |
| 2. New plugin version installed but project not adapted | `.claude/memory/.evolve-version` < installed plugin version | `/evolve-adapt` |
| 3. No project scaffolding | No `.claude/agents/` and no routing table in `CLAUDE.md` | `/evolve-genesis` |
| 4. Underperformers detected | `node $CLAUDE_PLUGIN_ROOT/scripts/lib/auto-strengthen-trigger.mjs` returns a non-empty list | `/evolve-strengthen` |
| 5. Stale artifacts (>30 days) | Audit finds ≥3 files with old `last-verified` | `/evolve-audit` (then `/evolve-strengthen`) |
| 6. Override-rate above threshold | `.claude/confidence-log.jsonl` shows >5% overrides over last 100 entries | `/evolve-audit` |
| 7. Pending finished work to score | Last invocation in `agent-invocations.jsonl` has no `outcome` field | `/evolve-evaluate` |
| 8. None of the above | Nothing to do | "System healthy. No action needed." |

## Procedure

1. **Read state.** Hit each check above, in order.
2. **Stop at first match.** Print the finding with the evidence (e.g. `5 underperformers found: laravel-developer (avg 7.85), ...`).
3. **Propose the next command** with one-line rationale.
4. **Ask for confirmation** before running anything destructive. `/evolve-update` and `/evolve-adapt` modify files and need explicit "yes".

## Output contract

```
=== Evolve State ===
Plugin version:    <installed>  (upstream: <known>)
Project version:   <last-seen>
Underperformers:   <count>
Stale artifacts:   <count>
Override-rate:     <X%>
Pending evals:     <count>

Proposed next:     /<command>     <one-line rationale>

Confidence: N/A    Rubric: read-only-research
```

## When NOT to invoke

- You already know which phase you want — call it directly. The dispatcher adds a round-trip you can skip.
- You only want a one-off score — `/evolve-score`.

## Related

- All `/evolve-*` phase commands
- `evolve:status` (npm run) — overlapping but more index-focused
