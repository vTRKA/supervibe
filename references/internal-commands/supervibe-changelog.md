---
description: >-
  Show what changed in Supervibe since this project's last seen version. Reads
  CHANGELOG.md without truncation; emits structured breaking-change + migration
  sections; offers automatic migration plan if applicable. Triggers:
  'changelog', 'что нового', 'что изменилось', '/supervibe-changelog'.
---

# /supervibe-changelog

Display CHANGELOG entries between the project's last-seen Supervibe version and the currently installed version. Use when SessionStart shows `⬆ plugin upgraded X → Y`, or whenever the user wants to know what changed.

This command does NOT silently truncate. If the changelog is large, sections are paginated with explicit "see next page" pointers — never lossy summarization.

## Invocation forms

### `/supervibe-changelog` — auto-resolve

Reads `.claude/memory/.evolve-version` (last seen) and `plugin.json.version` (current). Shows entries between (last, current], inclusive of current.

### `/supervibe-changelog <from> <to>` — explicit version range

Examples:
- `/supervibe-changelog <from> 2.0.6` — show 2.0.6
- `/supervibe-changelog <from> latest` — show everything since `<from>`

### `/supervibe-changelog --since <version>` — open-ended forward

Show every release after `<version>` up to current.

### `/supervibe-changelog --breaking-only` — filter to breaking changes

Print ONLY entries containing `BREAKING`, `Removed`, `Migration`, or `Deprecated` markers. Useful before `/supervibe-update`.

### `/supervibe-changelog --migrate` — produce migration plan

For each breaking change between last-seen and current, generate a concrete migration step list. Output format:

```
Migration: vX.Y → vA.B
========================

1. Renamed `agents/foo.md` → `agents/_core/foo.md`
   Action: `git mv` if you have project-level overrides. Otherwise no action.
2. Removed `supervibe:legacy-skill` skill
   Action: search for callers: `grep -r 'supervibe:legacy-skill' agents/ skills/`
3. Schema change in confidence-rubrics: gates moved from gate-on to gates.block-below
   Action: run `node scripts/migrate-rubrics-v2.mjs` (auto-fixes existing files)
```

If no breaking changes: print "No migration needed".

### `/supervibe-changelog --page <N>` — pagination

If output exceeds context comfort (~6,000 chars), the command splits into pages of ~5,000 chars each. Default shows page 1 + "Run /supervibe-changelog --page 2 for next 5K chars". User can iterate.

## Procedure

1. **Resolve range:**
   a. If `<from> <to>` given → use them.
   b. If `--since <ver>` → from = `<ver>`, to = `current`.
   c. Otherwise: from = `.claude/memory/.evolve-version` (read), to = `plugin.json.version` (read).

2. **Validate range:**
   - If `from == to` → "Project on latest plugin version (vX). No changes to show."
   - If `from > to` → unusual case (downgrade?) — print a warning + show entries from current to from in REVERSE.
   - If `.evolve-version` doesn't exist → first session under plugin install; suggest setting baseline via `node $CLAUDE_PLUGIN_ROOT/scripts/lib/version-tracker.mjs --init` and exit.

3. **Read CHANGELOG.md:**
   - Read `$CLAUDE_PLUGIN_ROOT/CHANGELOG.md` in full.
   - Parse `## [VERSION] — DATE` headings into a structured array.
   - Extract entries within the resolved range.

4. **Categorise per entry:**
   - **Breaking changes**: lines containing `BREAKING`, `Removed`, `Deprecated`, `Migration`
   - **Features**: `Added`, `feat:`, `New`
   - **Fixes**: `Fixed`, `fix:`, `Bugfix`
   - **Other**: everything else

5. **Calculate output size:**
   - If total chars ≤ 5,000 → print everything.
   - If > 5,000 → paginate: 5,000 chars per page; print page 1 + footer "Pages: 1/N. Run /supervibe-changelog --page 2 for next."
   - If `--breaking-only` → print only breaking section, regardless of size (breaking is critical, no truncation).

6. **Format output (NEVER truncate silently):**

```
=== What changed since vX in this project ===

Range: vA.B.C → vD.E.F  (N versions)

⚠ BREAKING CHANGES (always shown in full):
[verbatim breaking-change blocks from each version]

Features:
[verbatim Added/feat blocks]

Fixes:
[verbatim Fixed/fix blocks]

Pages: 1/N (if paginated)
```

7. **Migration plan generation (if `--migrate`):**
   - For each breaking line, check `.claude/memory/learnings/upgrade-recipes/<version>-<topic>.md` for known migration recipes.
   - If recipe exists → quote it verbatim.
   - If no recipe → emit a placeholder block: "No documented migration. Action: search for `<changed-symbol>` callers via `grep -rE '<symbol>' .` and adjust manually."

8. **Telemetry:**
   - Log the changelog view to `.claude/memory/changelog-views.jsonl`:
     ```jsonl
     {"timestamp":"<ISO>","fromVersion":"X","toVersion":"Y","mode":"normal|breaking|migrate","pages":N}
     ```

## Error recovery

| Failure | Recovery action |
|---|---|
| `.evolve-version` missing | Run `node scripts/lib/version-tracker.mjs --init` to create baseline; exit |
| `plugin.json` missing | Plugin install corrupted; suggest `/supervibe-update` or reinstall |
| `CHANGELOG.md` missing | Print: "No changelog at expected path. Plugin source may be incomplete." |
| Range invalid (from > to) | Show in reverse with warning |
| Output exceeds 5K chars | Auto-paginate with explicit page indicators (NEVER silent truncate) |
| `--migrate` recipe missing for a breaking change | Emit placeholder + grep suggestion (graceful degrade) |

## Output contract

Default mode:

```
=== What changed since vX.Y.Z in this project ===

Range: vX.Y.Z → v2.0.6  (1 version)

⚠ BREAKING CHANGES:
## [v2.0.6] — 2026-04-30
  - Removed deprecated `supervibe:legacy-prompt-quality` skill
  - Schema change: confidence-rubrics top-level field `id:` renamed to `artifact:`
  - hooks.json structure: `Stop` matcher field is now required

Features:
[verbatim feat: lines]

Fixes:
[verbatim fix: lines]

Tip: Run `/supervibe-changelog --migrate` for action items.
```

Breaking-only mode:

```
=== Breaking changes since vX.Y.Z ===

[ALL breaking-change blocks verbatim, even if 20K chars]
```

Migrate mode:

```
=== Migration plan: vX.Y.Z → v2.0.6 ===

3 breaking changes detected.

[1/3] Removed `supervibe:legacy-prompt-quality` skill
  Action: grep -rn "supervibe:legacy-prompt-quality" .
  Replacement: use `supervibe:prompt-quality-engineer` (different signature; see learnings/)

[2/3] Schema change in confidence-rubrics
  Action: run `node scripts/migrate-rubrics-v2.mjs`
  Auto-fixable: yes
  Verify: npm run check

[3/3] hooks.json Stop matcher required
  Action: edit hooks.json, add "matcher": "*" to existing Stop entry
  Auto-fixable: no (hand edit per-project)
```

## When NOT to invoke

- Same session that already showed SessionStart upgrade banner — Claude already has context (the banner IS the changelog summary).
- After `/supervibe-update` reported "no-op (already on latest)" — nothing to show.
- For changes within your own project's `docs/plans/*.md` history — that's `git log`, not the plugin changelog.

## Related

- `npm run supervibe:upgrade` — actually pulls a newer plugin
- `/supervibe-update` — alias for the upgrade flow with status check
- `/supervibe-adapt` — propagates plugin changes into project-level overrides (run AFTER reading the changelog)
- `.claude/memory/.evolve-version` — last-seen version marker
- `scripts/lib/version-tracker.mjs` — version-bump detector that maintains the marker
- `CHANGELOG.md` (plugin root) — source of truth this command reads
