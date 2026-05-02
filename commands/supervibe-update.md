---
description: >-
Update the Supervibe plugin: git pull + required ONNX model setup + npm ci +
  registry rebuild + install doctor. Idempotent. Triggers:
  'update plugin', 'обнови плагин', 'supervibe upgrade', '/supervibe-update'.
---

# /supervibe-update

Update the installed Supervibe plugin to the latest commit. Wraps `npm run supervibe:upgrade`.

## Difference from `/supervibe-adapt`

- `/supervibe-update` updates the **plugin source** in `~/.claude/plugins/marketplaces/supervibe-marketplace/` (global, single install per machine).
- `/supervibe-adapt` propagates upstream agent improvements into a **specific project's** selected host adapter overrides.

Run `/supervibe-update` first, then `/supervibe-adapt` per project that has overrides.

Both are slash commands inside an AI CLI session, not terminal shell commands. Use the one-line `curl`/PowerShell updater in zsh, bash, or PowerShell; send `/supervibe-update` and `/supervibe-adapt` inside the AI chat/session.

## Invocation forms

### `/supervibe-update` — full upgrade

Standard procedure: pull, install, refresh cache.

### `/supervibe-update --check` — non-mutating probe

Equivalent to `npm run supervibe:upgrade-check`. Reports whether a newer version exists without applying.

### Auto-update background policy

Claude Code SessionStart runs `npm run supervibe:auto-update` in the background when the plugin root is available. Default mode is `managed`: apply automatically only for the installer-managed git checkout, and stay notify-only for dev/manual/IDE paths. Operators can force behavior with `SUPERVIBE_AUTO_UPDATE=apply|check|off`.

### `/supervibe-update --rollback` — explicit rollback

Roll back to the previous commit on the plugin checkout. Useful after a failed upgrade left a partially-installed state, or after discovering a new release introduced regression.

### `/supervibe-update --to <ref>` — pin to specific version

Examples:
- `/supervibe-update --to v2.0.11` — checkout tag
- `/supervibe-update --to abc123` — checkout commit SHA

After pin: same install + test cycle. Use to test a specific candidate before adopting.

### `/supervibe-update --dry-run` — show what would happen

Print: current version, target version, changelog summary between them, breaking changes if any. No modification.

## Procedure

1. **Locate the plugin checkout.**
   - Use `<resolved-supervibe-plugin-root>`. Fail fast with actionable error if not set:
     > "Resolved Supervibe plugin root not set. Re-run installer: curl -fsSL https://raw.githubusercontent.com/vTRKA/supervibe/main/install.sh | bash"

2. **Capture pre-upgrade state (REQUIRED for rollback):**
   ```bash
   PRE_SHA=$(git -C <resolved-supervibe-plugin-root> rev-parse HEAD)
   PRE_VERSION=$(node -p "require('<resolved-supervibe-plugin-root>/.claude-plugin/plugin.json').version")
   ```
   Save to `.supervibe/memory/.supervibe-update-state.json`:
   ```json
   { "preSha": "<sha>", "preVersion": "<ver>", "startedAt": "<ISO>" }
   ```
   This file is the rollback anchor. Cleaned up only on successful upgrade.

3. **Refuse user-owned tracked local edits; clean stale leftovers.**
   - Run `git -C <resolved-supervibe-plugin-root> status --porcelain`.
   - If user-owned tracked files are modified, print them and exit. Never auto-discard user edits.
   - Installer-managed `package-lock.json` and ONNX model drift are restored first; the required model is rehydrated again after pull.
   - If only untracked/ignored stale files exist, continue. The managed upgrader runs `git clean -ffdx` before reinstalling dependencies so old routes, commands, generated leftovers, and removed files cannot stay active.

4. **Run the upgrade.**
   ```bash
   cd <resolved-supervibe-plugin-root> && npm run supervibe:upgrade
   ```
This script does: self-heal installer-managed tracked artifacts -> clean managed checkout -> `git fetch --tags --prune` -> `git pull --ff-only` with LFS smudge disabled -> required ONNX model setup -> `npm ci` -> `npm run registry:build` -> `npm run supervibe:install-doctor`.

5. **If upgrade fails:**

   The updater stops at the failing step, preserves the plugin checkout for retry, and prints the failed command output. Use manual rollback only if a partial update must be reverted:

   ```bash
   # Rollback procedure (mid-upgrade failure)
   cd <resolved-supervibe-plugin-root>
   git reset --hard $PRE_SHA   # restore source code
npm ci                       # restore old node_modules from package-lock.json
   node scripts/ensure-onnx-model.mjs
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

   Save the failure record to `.supervibe/memory/incidents/upgrade-failure-<ISO>.md`:
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
   - Refresh upstream-check cache (handled by `supervibe-upgrade.mjs`).
   - Confirm `.supervibe/audits/install-lifecycle/latest.json` exists and has `score: 10`.
   - Print version diff: `vX.Y.Z → vA.B.C`.
   - Clean up `.supervibe-update-state.json` (no longer needed for rollback).
   - Append success record to `.supervibe/memory/decisions/upgrades.md`.

7. **Print next steps:**
   - Restart the AI CLI to pick up new plugin code.
   - Each project sees `[supervibe] ⬆ plugin upgraded ...` on next session.
   - If project has host adapter overrides → run `/supervibe-adapt`.
   - To see what changed → read `CHANGELOG.md` or use `/supervibe-update --dry-run`.

## Error recovery

| Failure | Recovery action |
|---|---|
| Resolved Supervibe plugin root not set | Print installer URL; exit |
| User-owned tracked local edits in checkout | List dirty tracked files; instruct stash/commit; exit |
| Installer-managed ONNX/package-lock drift | Restore those paths with LFS smudge disabled, then continue dirty check |
| Stale untracked files in checkout | Clean automatically with `git clean -ffdx` before reinstall; install doctor fails if any remain |
| Network failure during `git pull` | Print message; preserve pre-state; exit (no rollback needed — nothing changed yet) |
| `npm ci` fails | Stop and print output; rerun after fixing dependency or network issue |
| ONNX model fetch fails | Stop before declaring success; keep checkout for retry; print Git LFS/HuggingFace recovery hint |
| Rollback itself fails | Last-resort guidance: `git reflog` to find pre-state SHA; manual `git reset --hard <sha>`; print exact commands |

## Manual rollback

If a hard machine crash or interrupt happens mid-upgrade:

```bash
cd <resolved-supervibe-plugin-root>
cat .supervibe/memory/.supervibe-update-state.json   # find preSha
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
After:          v2.0.11
ONNX model:     ready before registration

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
Target:         v2.0.11

❌ Failed at: npm run supervibe:install-doctor
Error excerpt: [first 500 chars]

✓ Rollback executed:
  - Source restored to abc1234
  - Dependencies reinstalled
  - LFS restored

Plugin remains on vX.Y.Z.
Failure log: .supervibe/memory/incidents/upgrade-failure-2026-04-28T15-30-00.md

Next:
  1. File issue: https://github.com/vTRKA/supervibe/issues
  2. Or pin to safer version: /supervibe-update --to <version>
```

Dry-run:

```
=== Supervibe Update — DRY RUN ===
Current:        vX.Y.Z
Latest:         v2.0.11
Changelog summary: [from CHANGELOG.md since vX.Y.Z]

Breaking changes detected: 2
  - Removed: supervibe:legacy-prompt-quality
  - Schema change: confidence-rubrics gates field

Run `/supervibe-update` to apply.
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
- `.supervibe/memory/.supervibe-update-state.json` — rollback anchor (transient)
- `.supervibe/memory/incidents/upgrade-failure-*.md` — failure forensics
- `.supervibe/memory/decisions/upgrades.md` — success log
