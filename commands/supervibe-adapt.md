---
description: "Sync project-level host artifacts to upstream plugin changes or user-requested project-fit changes for agents, rules, and skills. Diff-driven, user-gated."
---

# /supervibe-adapt

Pull upstream improvements from the installed plugin into the selected host adapter without losing local customizations. This is the project-artifact refresh path after plugin updates; users should not delete generated agents/rules/skills manually.

This is an AI CLI slash command, not an operating-system shell command. Run it inside the Claude Code, Codex, Gemini, Cursor, or OpenCode session for the target project; do not type `/supervibe-adapt` in zsh, bash, or PowerShell.

## When to invoke

- After `npm run supervibe:upgrade` reports a version bump (e.g. `previous → 2.0.11`).
- The SessionStart banner shows `[supervibe] ⬆ plugin upgraded N → M`.
- An audit (`/supervibe-audit`) flagged drift between upstream and project copies.
- The project has been on the same plugin version for >90 days and you want to refresh.
- The user explicitly asks to adapt rules or agents to the current project so gaps can be closed deliberately.

## Procedure

0. **Run the real dry-run implementation.** Use:
   ```bash
   node "<resolved-supervibe-plugin-root>/scripts/supervibe-adapt.mjs" --dry-run --diff-summary --project "<project-root>" --plugin-root "<resolved-supervibe-plugin-root>"
   ```
   The implementation resolves `pluginRoot` explicitly, detects the active host adapter, compares project host artifacts such as `.codex/agents`, `.codex/rules`, and `.codex/skills` against upstream plugin artifacts, and never reuses `supervibe-status --genesis-dry-run` as an adapt substitute.

1. **Read upstream.** Resolve the active host adapter first, then for each file in `<adapter>/agents`, `<adapter>/rules`, and `<adapter>/skills`, find the matching upstream file in the resolved Supervibe plugin root under `agents/`, `rules/`, or `skills/`.

2. **Three-way classification.** For each pair:
   - **Identical** → skip (no action).
   - **Upstream-only change** (project file unchanged from prior version baseline) → propose direct update.
   - **Both changed** (project has local customizations + upstream changed) → propose 3-way merge with conflict markers, ask user to resolve manually.
   - **Project-only change** (no upstream equivalent any more — deleted/renamed) → flag, ask user whether to keep, archive to `.supervibe/archive/`, or delete.

3. **Use the `supervibe:adapt` skill plus the CLI plan** for the actual diff/merge logic. If the request is project-fit adaptation, include capability registry evidence for why each agent/rule/skill is added, kept, changed, or deferred.

4. **Show summary.** Before any write, print a table:
   ```
   File                                  Upstream   Project   Action
   <adapter>/agents/_core/code-reviewer.md upgrade-A  unchanged direct-update
   <adapter>/agents/_design/copywriter.md  upgrade-B  edited    3-way merge
   <adapter>/rules/no-half-finished.md     unchanged  unchanged skip
   <adapter>/agents/_legacy/*.md           DELETED    present   ask user
   ```
   The CLI also prints `SUPERVIBE_ADAPT_DIFF_SUMMARY` with per-file additions/deletions. If a slash-flow uses `--apply --all` after explicit user approval, keep that summary visible in the transcript so the applied files are auditable.

5. **Per-file diff gate.** For each non-trivial action, show the diff and wait for user "yes" / "skip" / "abort". Never write without explicit per-file approval. Apply only approved files:
   ```bash
   node "<resolved-supervibe-plugin-root>/scripts/supervibe-adapt.mjs" --apply --include "<project-relative-path-1>,<project-relative-path-2>"
   ```

6. **Update version marker.** After all approved writes, refresh `.supervibe/memory/.supervibe-version` to the current plugin version.

7. **Score the result.** Run a quick `/supervibe-audit` to verify no new drift was introduced. Confidence ≥9 to declare done.

8. **Separate adapt from index health.** A clean adapt can still leave code index health red. Treat `ADAPT_CLEAN: true` as the artifact-sync result and `INDEX_REPAIR_NEEDED: true` as a separate follow-up. When index repair is needed, run the printed `NEXT_INDEX_REPAIR` command instead of calling the adapt incomplete.

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
