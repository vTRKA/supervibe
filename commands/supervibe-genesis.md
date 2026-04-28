---
description: "Bootstrap a project's .claude/ scaffold from a stack-pack matched to the detected project stack. Invokes the supervibe:genesis skill end-to-end."
---

# /supervibe-genesis

Set up Evolve for a fresh project (or one without `.claude/agents/`).

## Procedure

1. **Pre-flight check.** Read the project root:
   - If `.claude/agents/` already has files AND `CLAUDE.md` exists with a routing table → ask user whether to re-run (overwriting customizations) or run `/supervibe-adapt` instead. Stop if the user is unsure.
   - Otherwise continue.

2. **Detect stack.** Invoke the `supervibe:stack-discovery` skill. It reads manifests (`package.json`, `composer.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `Gemfile`, etc.) and returns a stack-fingerprint with primary language, framework(s), database(s), queue(s), and confidence per axis.

3. **Confirm intent.** Show the user the detected fingerprint plus 1-2 clarifying questions (e.g. "is this monorepo or single-app?", "which environments does this deploy to?"). Wait for answers.

4. **Match a stack-pack.** Invoke the `supervibe:genesis` skill with the fingerprint. The skill:
   - Looks for an exact pack in `$CLAUDE_PLUGIN_ROOT/stack-packs/` (e.g. `laravel-nextjs-postgres-redis`).
   - If no exact match — composes from `stack-packs/_atomic/` per its decision tree, scoring the composition against `confidence-rubrics/scaffold.yaml`.

5. **Apply scaffold (with diff gate).** Before any write, present a file-by-file diff:
   - `.claude/agents/` — copies of stack-relevant agents
   - `.claude/rules/` — project-applicable rules
   - `.claude/memory/` — empty category dirs (`decisions/`, `patterns/`, `incidents/`, `learnings/`, `solutions/`)
   - `CLAUDE.md` — generated from `templates/claude-md/_base.md.tpl` filled with the fingerprint
   - `.claude/settings.json` — permissions + enabledPlugins entry mirroring the global one
   Wait for user "yes" before writing.

6. **Score the result.** Run `supervibe:confidence-scoring` against the scaffold using `confidence-rubrics/scaffold.yaml`. Required: ≥9 to declare done.

7. **Verify.** Run `npm run supervibe:status` (or `node $CLAUDE_PLUGIN_ROOT/scripts/supervibe-status.mjs`). The banner should show fresh code RAG + graph counts for the project.

## Output contract

```
Detected stack:    <fingerprint summary>
Pack chosen:       <pack name>  (composition score: X.X/10)
Files written:     <count>
Confidence:        <N>/10  Rubric: scaffold
Next:              open the project, restart your AI CLI, watch for [evolve] welcome banner
```

## When NOT to invoke

- Project already has `.claude/agents/` with custom edits — use `/supervibe-adapt` instead
- User just wants to score an existing artifact — use `/supervibe-score`
- User wants per-feature scaffolding (not the whole project) — use the `supervibe:new-feature` skill directly

## Related

- `supervibe:stack-discovery` — produces the fingerprint
- `supervibe:genesis` skill — does the actual composition + write
- `supervibe:confidence-scoring` — final gate
- `/supervibe-adapt` — what to use when the project is already scaffolded
