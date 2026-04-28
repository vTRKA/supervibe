---
description: >-
  Update the Evolve plugin: git pull + lfs pull + npm install + tests +
  register-refresh. Idempotent. Now with mid-upgrade rollback procedure if tests
  fail. Идемпотентно. С rollback при сбое тестов на середине upgrade. Triggers:
  'update plugin', 'обнови плагин', 'evolve upgrade', '/evolve-update'.
---

# /evolve-update

Update the installed Evolve plugin to the latest commit. Wraps `npm run evolve:upgrade` with explicit rollback procedure if anything fails mid-upgrade.

## Difference from `/evolve-adapt`

- `/evolve-update` updates the **plugin source** in `~/.claude/plugins/marketplaces/evolve-marketplace/` (global, single install per machine).
- `/evolve-adapt` propagates upstream agent improvements into a **specific project's** `.claude/` overrides.

Run `/evolve-update` first, then `/evolve-adapt` per project that has overrides.

## Invocation forms

### `/evolve-update` — full upgrade

Standard procedure: pull, install, test, refresh cache.

### `/evolve-update --check` — non-mutating probe

Equivalent to `npm run evolve:upgrade-check`. Reports whether a newer version exists without applying.

### `/evolve-update --rollback` — explicit rollback

Roll back to the previous commit on the plugin checkout. Useful after a failed upgrade left a partially-installed state, or after discovering a new release introduced regression.

### `/evolve-update --to <ref>` — pin to specific version

Examples:
- `/evolve-update --to v1.6.0` — checkout tag
- `/evolve-update --to abc123` — checkout commit SHA

After pin: same install + test cycle. Use to test a specific candidate before adopting.

### `/evolve-update --dry-run` — show what would happen

Print: current version, target version, changelog summary between them, breaking changes if any. No modification.

## Procedure

1. **Locate the plugin checkout.**
   - Use `$CLAUDE_PLUGIN_ROOT`. Fail fast with actionable error if not set:
     > "CLAUDE_PLUGIN_ROOT not set. Re-run installer: curl -fsSL https://raw.githubusercontent.com/vTRKA/evolve-agent/main/install.sh | bash"

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

3. **Refuse to clobber local edits.**
   - Run `git -C $CLAUDE_PLUGIN_ROOT status --porcelain`. If non-empty:
     - Print: "Plugin checkout has uncommitted changes. Stash or commit first, then re-run /evolve-update."
     - List the dirty files.
     - Exit. Never auto-discard user edits.

4. **Run the upgrade.**
   ```bash
   cd $CLAUDE_PLUGIN_ROOT && npm run evolve:upgrade
   ```
   This script does: `git fetch --tags --prune` → `git pull --ff-only` → `git lfs pull` (if available) → `npm install` → `npm run check`.

5. **If upgrade fails — automatic rollback:**

   The script's `npm run check` exit code or any earlier step's failure triggers rollback:

   ```bash
   # Rollback procedure (mid-upgrade failure)
   cd $CLAUDE_PLUGIN_ROOT
   git reset --hard $PRE_SHA   # restore source code
   npm install                  # restore old node_modules
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
     - File issue at github.com/vTRKA/evolve-agent/issues
     - Try /evolve-update --to <safer-version> to pin
   ```

6. **If upgrade succeeds:**
   - Refresh upstream-check cache (handled by `evolve-upgrade.mjs`).
   - Print version diff: `vX.Y.Z → vA.B.C`.
   - Clean up `.evolve-update-state.json` (no longer needed for rollback).
   - Append success record to `.claude/memory/decisions/upgrades.md`.

7. **Print next steps:**
   - Restart the AI CLI to pick up new plugin code.
   - Each project sees `[evolve] ⬆ plugin upgraded ...` on next session.
   - If project has `.claude/` overrides → run `/evolve-adapt`.
   - To see what changed → run `/evolve-changelog`.

## Error recovery

| Failure | Recovery action |
|---|---|
| `CLAUDE_PLUGIN_ROOT` not set | Print installer URL; exit |
| Uncommitted changes in checkout | List dirty files; instruct stash/commit; exit |
| Network failure during `git pull` | Print message; preserve pre-state; exit (no rollback needed — nothing changed yet) |
| `npm install` fails | Auto-rollback (step 5) — restore old node_modules from `package-lock.json` |
| `npm run check` fails (tests, validators, knip) | Auto-rollback; save failure log; suggest `--to <prev-version>` to pin |
| LFS fetch fails | Continue (LFS is non-critical; lazy-fetch on first use); print warning |
| Rollback itself fails | Last-resort guidance: `git reflog` to find pre-state SHA; manual `git reset --hard <sha>`; print exact commands |

## Manual rollback (if auto-rollback unreachable)

If a hard machine crash or interrupt happens mid-upgrade:

```bash
cd $CLAUDE_PLUGIN_ROOT
cat .claude/memory/.evolve-update-state.json   # find preSha
git reset --hard <preSha>
npm install
```

If the state file is corrupted: `git reflog` shows recent HEAD positions.

## Output contract

Successful upgrade:

```
=== Evolve Update ===
Plugin root:    /path/to/marketplace
Before:         v1.6.0
After:          v1.7.0
Tests:          253 / 253 passed
Validators:     8 / 8 clean
LFS:            pulled (or: skipped — lazy-fetch fallback)

Rollback anchor: cleaned up (no longer needed)

Next:
  1. Restart your AI CLI
  2. Read changelog: /evolve-changelog
  3. (if project has overrides) /evolve-adapt
```

Failed upgrade with rollback:

```
=== Evolve Update — FAILED ===
Plugin root:    /path/to/marketplace
Pre-state SHA:  abc1234
Target:         v1.7.0

❌ Failed at: npm run check (3 tests failed)
Error excerpt: [first 500 chars]

✓ Rollback executed:
  - Source restored to abc1234
  - Dependencies reinstalled
  - LFS restored

Plugin remains on v1.6.0.
Failure log: .claude/memory/incidents/upgrade-failure-2026-04-28T15-30-00.md

Next:
  1. File issue: https://github.com/vTRKA/evolve-agent/issues
  2. Or pin to safer version: /evolve-update --to v1.6.5
```

Dry-run:

```
=== Evolve Update — DRY RUN ===
Current:        v1.6.0
Latest:         v1.7.0
Changelog summary: [see /evolve-changelog --since v1.6.0]

Breaking changes detected: 2
  - Removed: evolve:legacy-prompt-quality
  - Schema change: confidence-rubrics gates field

Run `/evolve-update` to apply (auto-rollback on failure).
```

## When NOT to invoke

- Plugin checkout has uncommitted changes — stash/commit first.
- You only want to *check* whether an upgrade exists, not apply — use `/evolve-update --check`.
- You want to update project-level overrides — that is `/evolve-adapt`.
- An upgrade is already in progress (state file exists with recent timestamp) — wait for it or run `--rollback` if stuck.

## Related

- `npm run evolve:upgrade` — the underlying script (called by this command)
- `npm run evolve:upgrade-check` — non-mutating probe
- `/evolve-update --rollback` — explicit revert to last good state
- `/evolve-changelog` — what changed
- `/evolve-adapt` — propagate upstream changes into a specific project
- `.claude/memory/.evolve-update-state.json` — rollback anchor (transient)
- `.claude/memory/incidents/upgrade-failure-*.md` — failure forensics
- `.claude/memory/decisions/upgrades.md` — success log
