---
description: >-
Update the Supervibe plugin: git pull + lfs pull + npm ci + tests +
  register-refresh. Idempotent. Now with mid-upgrade rollback procedure if tests
  fail. Идемпотентно. С rollback при сбое тестов на середине upgrade. Triggers:
  'update plugin', 'обнови плагин', 'evolve upgrade', '/supervibe-update'.
---

# /supervibe-update

Update the installed Supervibe plugin to the latest commit. Wraps `npm run supervibe:upgrade` with explicit rollback procedure if anything fails mid-upgrade.

## Difference from `/supervibe-adapt`

- `/supervibe-update` updates the **plugin source** in `~/.claude/plugins/marketplaces/supervibe-marketplace/` (global, single install per machine).
- `/supervibe-adapt` propagates upstream agent improvements into a **specific project's** `.claude/` overrides.

Run `/supervibe-update` first, then `/supervibe-adapt` per project that has overrides.

## Invocation forms

### `/supervibe-update` — full upgrade

Standard procedure: pull, install, test, refresh cache.

### `/supervibe-update --check` — non-mutating probe

Equivalent to `npm run supervibe:upgrade-check`. Reports whether a newer version exists without applying.

### Auto-update background policy

Claude Code SessionStart runs `npm run supervibe:auto-update` in the background when the plugin root is available. Default mode is `managed`: apply automatically only for the installer-managed git checkout, and stay notify-only for dev/manual/IDE paths. Operators can force behavior with `SUPERVIBE_AUTO_UPDATE=apply|check|off`.

### `/supervibe-update --rollback` — explicit rollback

Roll back to the previous commit on the plugin checkout. Useful after a failed upgrade left a partially-installed state, or after discovering a new release introduced regression.

### `/supervibe-update --to <ref>` — pin to specific version

Examples:
- `/supervibe-update --to v2.0.6` — checkout tag
- `/supervibe-update --to abc123` — checkout commit SHA

After pin: same install + test cycle. Use to test a specific candidate before adopting.

### `/supervibe-update --dry-run` — show what would happen

Print: current version, target version, changelog summary between them, breaking changes if any. No modification.

## Procedure

1. **Locate the plugin checkout.**
   - Use `$CLAUDE_PLUGIN_ROOT`. Fail fast with actionable error if not set:
     > "CLAUDE_PLUGIN_ROOT not set. Re-run installer: curl -fsSL https://raw.githubusercontent.com/vTRKA/supervibe/main/install.sh | bash"

2. **Capture pre-upgrade state (REQUIRED for rollback):**
   ```bash
   PRE_SHA=$(git -C $CLAUDE_PLUGIN_ROOT rev-parse HEAD)
   PRE_VERSION=$(node -p "require('$CLAUDE_PLUGIN_ROOT/.claude-plugin/plugin.json').version")
   ```
   Save to `.claude/memory/.evolve-update-state.json`:
   ```json
   { "preSha": "<sha>", "preVersion": "<ver>", "startedAt": "<ISO>" }
   ```
   This file is the rollback anchor. Cleaned up only on successful upgrade.

3. **Refuse tracked local edits; clean stale leftovers.**
   - Run `git -C $CLAUDE_PLUGIN_ROOT status --porcelain`.
   - If tracked files are modified, print them and exit. Never auto-discard user edits.
   - If only untracked/ignored stale files exist, continue. The managed upgrader runs `git clean -ffdx` before reinstalling dependencies so old routes, commands, generated leftovers, and removed files cannot stay active.

4. **Run the upgrade.**
   ```bash
   cd $CLAUDE_PLUGIN_ROOT && npm run supervibe:upgrade
   ```
This script does: clean managed checkout -> `git fetch --tags --prune` -> `git pull --ff-only` -> `git lfs pull` (if available) -> `npm ci` -> `npm run registry:build` -> `npm run check` -> `npm run supervibe:install-doctor`.

5. **If upgrade fails — automatic rollback:**

   The script's `npm run check` exit code or any earlier step's failure triggers rollback:

   ```bash
   # Rollback procedure (mid-upgrade failure)
   cd $CLAUDE_PLUGIN_ROOT
   git reset --hard $PRE_SHA   # restore source code
npm ci                       # restore old node_modules from package-lock.json
   git lfs pull                 # restore LFS state if changed
   ```

   Print to user:
   ```
   ❌ Upgrade failed at step: <step-name>
   Failure: <error excerpt>

   Rollback executed:
     • Source restored to $PRE_SHA
     • Dependencies reinstalled at pre-upgrade lockfile
     • LFS state restored

   Plugin remains on v$PRE_VERSION.
   Investigate failure: <error log path>
   ```

   Save the failure record to `.claude/memory/incidents/upgrade-failure-<ISO>.md`:
   ```markdown
   # Upgrade failure: <pre-version> → <target-version>
   Date: <ISO>
   Failed step: <step>
   Error: <full output>
   Rollback: succeeded
   Action items:
     - File issue at github.com/vTRKA/supervibe/issues
     - Try /supervibe-update --to <safer-version> to pin
   ```

6. **If upgrade succeeds:**
   - Refresh upstream-check cache (handled by `evolve-upgrade.mjs`).
   - Confirm `.supervibe/audits/install-lifecycle/latest.json` exists and has `score: 10`.
   - Print version diff: `vX.Y.Z → vA.B.C`.
   - Clean up `.evolve-update-state.json` (no longer needed for rollback).
   - Append success record to `.claude/memory/decisions/upgrades.md`.

7. **Print next steps:**
   - Restart the AI CLI to pick up new plugin code.
   - Each project sees `[evolve] ⬆ plugin upgraded ...` on next session.
   - If project has `.claude/` overrides → run `/supervibe-adapt`.
   - To see what changed → read `CHANGELOG.md` or use `/supervibe-update --dry-run`.

## Error recovery

| Failure | Recovery action |
|---|---|
| `CLAUDE_PLUGIN_ROOT` not set | Print installer URL; exit |
| Tracked local edits in checkout | List dirty tracked files; instruct stash/commit; exit |
| Stale untracked files in checkout | Clean automatically with `git clean -ffdx` before reinstall; install doctor fails if any remain |
| Network failure during `git pull` | Print message; preserve pre-state; exit (no rollback needed — nothing changed yet) |
| `npm ci` fails | Auto-rollback (step 5) — restore old node_modules from `package-lock.json` |
| `npm run check` fails (tests, validators, knip) | Auto-rollback; save failure log; suggest `--to <prev-version>` to pin |
| LFS fetch fails | Continue (LFS is non-critical; lazy-fetch on first use); print warning |
| Rollback itself fails | Last-resort guidance: `git reflog` to find pre-state SHA; manual `git reset --hard <sha>`; print exact commands |

## Manual rollback (if auto-rollback unreachable)

If a hard machine crash or interrupt happens mid-upgrade:

```bash
cd $CLAUDE_PLUGIN_ROOT
cat .claude/memory/.evolve-update-state.json   # find preSha
git reset --hard <preSha>
npm ci
```

If the state file is corrupted: `git reflog` shows recent HEAD positions.

## Output contract

Successful upgrade:

```
=== Supervibe Update ===
Plugin root:    /path/to/marketplace
Before:         vX.Y.Z
After:          v2.0.6
Tests:          679 / 679 passed
Validators:     10 / 10 clean (+ knip)
LFS:            pulled (or: skipped — lazy-fetch fallback)

Rollback anchor: cleaned up (no longer needed)

Next:
  1. Restart your AI CLI
   2. Read changelog: `CHANGELOG.md`
  3. (if project has overrides) /supervibe-adapt
```

Failed upgrade with rollback:

```
=== Supervibe Update — FAILED ===
Plugin root:    /path/to/marketplace
Pre-state SHA:  abc1234
Target:         v2.0.6

❌ Failed at: npm run check (3 tests failed)
Error excerpt: [first 500 chars]

✓ Rollback executed:
  - Source restored to abc1234
  - Dependencies reinstalled
  - LFS restored

Plugin remains on vX.Y.Z.
Failure log: .claude/memory/incidents/upgrade-failure-2026-04-28T15-30-00.md

Next:
  1. File issue: https://github.com/vTRKA/supervibe/issues
  2. Or pin to safer version: /supervibe-update --to <version>
```

Dry-run:

```
=== Supervibe Update — DRY RUN ===
Current:        vX.Y.Z
Latest:         v2.0.6
Changelog summary: [from CHANGELOG.md since vX.Y.Z]

Breaking changes detected: 2
  - Removed: supervibe:legacy-prompt-quality
  - Schema change: confidence-rubrics gates field

Run `/supervibe-update` to apply (auto-rollback on failure).
```

## When NOT to invoke

- Plugin checkout has uncommitted changes — stash/commit first.
- You only want to *check* whether an upgrade exists, not apply — use `/supervibe-update --check`.
- You want to update project-level overrides — that is `/supervibe-adapt`.
- An upgrade is already in progress (state file exists with recent timestamp) — wait for it or run `--rollback` if stuck.

## Related

- `npm run supervibe:upgrade` — the underlying script (called by this command)
- `npm run supervibe:upgrade-check` — non-mutating probe
- `/supervibe-update --rollback` — explicit revert to last good state
- `CHANGELOG.md` — what changed
- `/supervibe-adapt` — propagate upstream changes into a specific project
- `.claude/memory/.evolve-update-state.json` — rollback anchor (transient)
- `.claude/memory/incidents/upgrade-failure-*.md` — failure forensics
- `.claude/memory/decisions/upgrades.md` — success log
