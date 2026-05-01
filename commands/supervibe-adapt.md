---
description: "Sync project-level host artifacts to upstream plugin changes or user-requested project-fit changes for agents, rules, and skills. Diff-driven, user-gated."
---

# /supervibe-adapt

Pull upstream improvements from the installed plugin into the selected host adapter without losing local customizations. This is the project-artifact refresh path after plugin updates; users should not delete generated agents/rules/skills manually.

## When to invoke

- After `npm run supervibe:upgrade` reports a version bump (e.g. `previous → 2.0.11`).
- The SessionStart banner shows `[supervibe] ⬆ plugin upgraded N → M`.
- An audit (`/supervibe-audit`) flagged drift between upstream and project copies.
- The project has been on the same plugin version for >90 days and you want to refresh.
- The user explicitly asks to adapt rules or agents to the current project so gaps can be closed deliberately.

## Procedure

1. **Read upstream.** Resolve the active host adapter first, then for each file in `<adapter>/agents`, `<adapter>/rules`, and `<adapter>/skills`, find the matching upstream file in the resolved Supervibe plugin root under `agents/`, `rules/`, or `skills/`.

2. **Three-way classification.** For each pair:
   - **Identical** → skip (no action).
   - **Upstream-only change** (project file unchanged from prior version baseline) → propose direct update.
   - **Both changed** (project has local customizations + upstream changed) → propose 3-way merge with conflict markers, ask user to resolve manually.
   - **Project-only change** (no upstream equivalent any more — deleted/renamed) → flag, ask user whether to keep, archive to `.supervibe/archive/`, or delete.

3. **Use the `supervibe:adapt` skill** for the actual diff/merge logic. If the request is project-fit adaptation, include capability registry evidence for why each agent/rule/skill is added, kept, changed, or deferred.

4. **Show summary.** Before any write, print a table:
   ```
   File                                  Upstream   Project   Action
   <adapter>/agents/_core/code-reviewer.md upgrade-A  unchanged direct-update
   <adapter>/agents/_design/copywriter.md  upgrade-B  edited    3-way merge
   <adapter>/rules/no-half-finished.md     unchanged  unchanged skip
   <adapter>/agents/_legacy/*.md           DELETED    present   ask user
   ```

5. **Per-file diff gate.** For each non-trivial action, show the diff and wait for user "yes" / "skip" / "abort". Never write without explicit per-file approval.

6. **Update version marker.** After all approved writes, refresh `.supervibe/memory/.supervibe-version` to the current plugin version.

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

Host instruction content outside Supervibe managed blocks is user-owned. This
includes every provider-specific instruction surface outside the Supervibe
managed block.

- `.supervibe/memory/decisions/`, `patterns/`, `incidents/`, `learnings/`, `solutions/` — your project data
- `.supervibe/memory/*.db` — indexes (regenerated automatically)
- Any host instruction file or host rule file outside the Supervibe managed block.

## Related

- `supervibe:adapt` skill — the underlying diff/merge methodology
- `CHANGELOG.md` — see what upstream changed before adapting
- `/supervibe-genesis` — for projects without a Supervibe host adapter scaffold yet
- `/supervibe-audit` — to discover drift in the first place
