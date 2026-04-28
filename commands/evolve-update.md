---
description: "Update the Evolve plugin itself: git pull + lfs pull + npm install + tests + register-refresh. Idempotent — safe to re-run."
---

# /evolve-update

Update the installed Evolve plugin to the latest commit on the tracked branch. Wraps the `npm run evolve:upgrade` script so users do not have to leave the AI CLI session.

## Difference from `/evolve-adapt`

- `/evolve-update` updates the **plugin source** in `~/.claude/plugins/marketplaces/evolve-marketplace/` (global, single install per machine).
- `/evolve-adapt` propagates upstream agent improvements into a **specific project's** `.claude/` overrides.

Run `/evolve-update` first, then `/evolve-adapt` per project that has overrides.

## Procedure

1. **Locate the plugin checkout.** Use `$CLAUDE_PLUGIN_ROOT`. Fail fast if not set.

2. **Refuse to clobber local edits.** Run `git -C $CLAUDE_PLUGIN_ROOT status --porcelain`. If non-empty, stop and tell the user to commit or stash first. The user maintains the plugin checkout — never auto-discard their changes.

3. **Run the upgrade.** Invoke `cd $CLAUDE_PLUGIN_ROOT && npm run evolve:upgrade`. This script:
   - `git fetch --tags --prune`
   - `git pull --ff-only` (refuses to merge-commit)
   - `git lfs pull` if available, otherwise lazy-fetch from HuggingFace later
   - `npm install`
   - `npm run check` — fails the upgrade if any of the 214+ tests fail

4. **Refresh the upstream-check cache** so the [evolve] ⬆ banner stops nagging — this is part of `evolve-upgrade.mjs` already.

5. **Print version diff.** Read `plugin.json.version` before and after. If the upgrade was a no-op (already up to date), say so. Otherwise show `vX.Y.Z → vA.B.C`.

6. **Tell the user what comes next:**
   - Restart the AI CLI to pick up the new plugin code.
   - Each project sees `[evolve] ⬆ plugin upgraded ...` on its next session.
   - If the project has `.claude/` overrides, run `/evolve-adapt` to merge upstream agent changes.

## Output contract

```
=== Evolve Update ===
Plugin root:    <path>
Before:         vX.Y.Z
After:          vA.B.C
Tests:          194 / 194 passed
LFS:            <pulled | skipped — lazy-fetch fallback>

Next:
  1. Restart your AI CLI
  2. (if project has overrides) /evolve-adapt
```

## When NOT to invoke

- The plugin checkout has uncommitted changes — commit/stash first.
- You only want to *check* whether an upgrade exists, not apply — use `npm run evolve:upgrade-check`.
- You want to update project-level overrides — that is `/evolve-adapt`.

## Related

- `npm run evolve:upgrade` — the underlying script
- `npm run evolve:upgrade-check` — non-mutating "is there a new version" probe
- `/evolve-adapt` — propagate upstream changes into a specific project
- `/evolve-changelog` — what changed since the last version this project saw
