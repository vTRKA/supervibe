---
description: "Sync project-level host artifacts to upstream plugin changes or user-requested project-fit changes for agents, rules, and skills. Diff-driven, user-gated."
---

# /supervibe-adapt

Pull upstream improvements from the installed plugin into the selected host adapter without losing local customizations. This is the project-artifact refresh path after plugin updates; users should not delete generated agents/rules/skills manually.

The slash form runs inside the Claude Code, Codex, Gemini, Cursor, or OpenCode session for the target project; do not type `/supervibe-adapt` in zsh, bash, or PowerShell. On macOS/Linux installs, the no-slash terminal alias `supervibe-adapt` is also linked for direct CLI dry-runs and approved applies.

## Invocation

```bash
/supervibe-adapt
/supervibe-adapt --dry-run
/supervibe-adapt --apply
supervibe-adapt --dry-run --diff-summary
supervibe-adapt --apply --include "<project-relative-path>"
```

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
   The implementation resolves `pluginRoot` explicitly, detects the active host adapter, compares project host artifacts such as `.codex/agents`, `.codex/rules`, and `.codex/skills` against upstream plugin artifacts, computes `related-rules` closure candidates, and never reuses `supervibe-status --genesis-dry-run` as an adapt substitute. Dry-run is read-only by default; use `--refresh-memory-index` only when you intentionally want to rewrite `.supervibe/memory/index.json` during planning.

1. **Read upstream.** Resolve the active host adapter first, then for each file in `<adapter>/agents`, `<adapter>/rules`, and `<adapter>/skills`, find the matching upstream file in the resolved Supervibe plugin root under `agents/`, `rules/`, or `skills/`.

2. **Three-way classification.** For each pair:
   - **Identical** → skip (no action).
   - **Upstream-only change** (project file unchanged from prior version baseline) → propose direct update.
   - **Both changed** (project has local customizations + upstream changed) → propose 3-way merge with conflict markers, ask user to resolve manually.
   - **Project-only change** (no upstream equivalent any more — deleted/renamed) → flag, ask user whether to keep, archive to `.supervibe/archive/`, or delete.
   - **Related-rule closure add** (installed rule references upstream rule missing from selected profile) → propose an `ADD` candidate, showing `mandatory: true/false` and the exact include path.

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

6. **Update metadata.** After approved artifact writes, refresh `.supervibe/memory/.supervibe-version` to the current plugin version and write `baseline.pluginVersion`. If the dry-run reports `UPDATES: 0` and `ADDS: 0` with `VERSION_DRIFT: true` or `METADATA_UPDATE_REQUIRED: true`, run the printed `NEXT_APPLY_METADATA` command; it updates only the version marker and baseline metadata.

7. **Score the result.** Run a quick `/supervibe-audit` to verify no new drift was introduced. Confidence ≥9 to declare done.

8. **Separate adapt from index health.** A clean adapt can still leave code index health red. Treat `ARTIFACT_ADAPT_CLEAN: true` as the artifact-sync result and `CODE_INDEX_READY: false` as a separate follow-up. When index repair is needed, run the printed `NEXT_INDEX_REPAIR` command instead of calling the adapt incomplete.

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

## Safety Boundaries

- Dry-run is read-only by default and must not refresh memory indexes unless
  explicitly requested.
- Apply writes only approved project host artifacts and `.supervibe/memory/`
  metadata required by the adapt plan.
- User-owned host instruction text outside managed blocks is never overwritten.
- Index repair is a separate follow-up from artifact adaptation.

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
