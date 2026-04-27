---
description: "Auto-detect which evolve phase to run (genesis | audit | strengthen | adapt | evaluate) based on project state. Run with no arguments. Use specific phase commands for explicit control."
---

# /evolve

Dispatch to the right evolve phase based on current project state.

## Auto-detect logic

1. **No `.claude/agents/` AND no routing table in `CLAUDE.md`** → propose `/evolve-genesis`
2. **Stale references found** → propose `/evolve-audit + /evolve-adapt`
3. **Weak artifacts found** → propose `/evolve-strengthen`
4. **Coverage gaps** → propose `/evolve-adapt`
5. **Everything current** → respond "System healthy. No changes needed."

## What I do when invoked

1. Run the detection checks above (using build-registry, validate-frontmatter, audit logic when available).
2. Report findings to user.
3. Propose the next command to run with rationale.
4. Wait for user confirmation before running any state-changing phase.

## Note (Phase 0+1 reality)

In v0.1.0, only `evolve:confidence-scoring` and `evolve:verification` skills exist. Detection of weak artifacts is partially functional (frontmatter validation works, but full audit logic ships in Phase 6). Until then, this dispatcher is informational and tells the user which phases are not yet implemented.
