---
description: "Sync project-level .claude/ artifacts to upstream plugin changes (new agent versions, deprecated rules, renamed files). Diff-driven, user-gated."
---

# /supervibe-adapt

Pull upstream improvements from the installed plugin into the project's `.claude/` directory without losing local customizations.

## When to invoke

- After `npm run supervibe:upgrade` reports a version bump (e.g. `previous → 2.0.8`).
- The SessionStart banner shows `[evolve] ⬆ plugin upgraded N → M`.
- An audit (`/supervibe-audit`) flagged drift between upstream and project copies.
- The project has been on the same plugin version for >90 days and you want to refresh.

## Procedure

1. **Read upstream.** For each file in `.claude/agents/`, `.claude/rules/`, `.claude/skills/`, find the matching upstream file in `$CLAUDE_PLUGIN_ROOT/<namespace>/<name>.md`.

2. **Three-way classification.** For each pair:
   - **Identical** → skip (no action).
   - **Upstream-only change** (project file unchanged from prior version baseline) → propose direct update.
   - **Both changed** (project has local customizations + upstream evolved) → propose 3-way merge with conflict markers, ask user to resolve manually.
   - **Project-only change** (no upstream equivalent any more — deleted/renamed) → flag, ask user whether to keep, archive to `.claude/_archive/`, or delete.

3. **Use the `supervibe:adapt` skill** for the actual diff/merge logic. It already encodes the methodology.

4. **Show summary.** Before any write, print a table:
   ```
   File                                  Upstream   Project   Action
   .claude/agents/_core/code-reviewer.md upgrade-A  unchanged direct-update
   .claude/agents/_design/copywriter.md  upgrade-B  edited    3-way merge
   .claude/rules/no-half-finished.md     unchanged  unchanged skip
   .claude/agents/_legacy/*.md           DELETED    present   ask user
   ```

5. **Per-file diff gate.** For each non-trivial action, show the diff and wait for user "yes" / "skip" / "abort". Never write without explicit per-file approval.

6. **Update version marker.** After all approved writes, refresh `.claude/memory/.evolve-version` to the current plugin version.

7. **Score the result.** Run a quick `/supervibe-audit` to verify no new drift was introduced. Confidence ≥9 to declare done.

## Output contract

```
=== Supervibe Adapt: vX → vY ===
Upgraded:    <count>
Skipped:     <count>
Conflicts:   <count> (manual resolution needed)
Archived:    <count>
Deleted:     <count>

Confidence:  N/10  Rubric: agent-delivery
```

## What is NOT touched

- `.claude/memory/decisions/`, `patterns/`, `incidents/`, `learnings/`, `solutions/` — your project data
- `.claude/memory/*.db` — indexes (regenerated automatically)
- `CLAUDE.md` if it was hand-edited beyond the generated template — manual review required

## Related

- `supervibe:adapt` skill — the underlying diff/merge methodology
- `CHANGELOG.md` — see what upstream changed before adapting
- `/supervibe-genesis` — for projects without `.claude/` yet
- `/supervibe-audit` — to discover drift in the first place
