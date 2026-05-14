---
description: >-
  Update the Supervibe plugin: git pull + required ONNX model setup + npm ci +
  registry rebuild + install doctor. Idempotent. Triggers:
  'update plugin', 'обнови плагин', 'supervibe upgrade', '/supervibe-update'.
last-verified: "2026-05-08"
---

# /supervibe-update

Update the installed Supervibe plugin to the latest commit. Wraps `npm run supervibe:upgrade`.

## Difference from `/supervibe-adapt`

- `/supervibe-update` updates the **provider-scoped plugin source** in the resolved install root, for example `~/.codex/plugins/marketplaces/supervibe-marketplace/` for Codex or `~/.claude/plugins/marketplaces/supervibe-marketplace/` for Claude Code.
- `/supervibe-adapt` propagates upstream agent improvements into a **specific project's** selected host adapter overrides.

Run `/supervibe-update` first, then `/supervibe-adapt` per project that has overrides.

Both are slash commands inside an AI CLI session. Use the one-line `curl`/PowerShell updater in zsh, bash, or PowerShell; send `/supervibe-update` and `/supervibe-adapt` inside the AI chat/session. Windows/macOS/Linux installs also link no-slash terminal aliases such as `supervibe-update` and `supervibe-adapt` for users who prefer terminal workflows.

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

Print: plugin root, current version, HEAD, branch, dirty-line count, target ref, cached upstream-behind count, and the exact update steps that would run. No git pull, npm install, checkout, or file mutation.

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
This file is the rollback anchor. The updater writes it before mutating the checkout, preserves it through `git clean`, and cleans it up only on successful upgrade or successful rollback.

3. **Refuse user-owned tracked local edits; clean stale leftovers.**
   - Run `git -C <resolved-supervibe-plugin-root> status --porcelain`.
   - If user-owned tracked files are modified, print them and exit. Never auto-discard user edits.
   - Installer-managed `package-lock.json` drift is restored first; the required model is rehydrated again after pull.
   - If only untracked/ignored stale files exist, continue. The managed upgrader runs `git clean -ffdx` before reinstalling dependencies so old routes, commands, generated leftovers, and removed files cannot stay active.

4. **Run the upgrade.**
   ```bash
   cd <resolved-supervibe-plugin-root> && npm run supervibe:upgrade
   ```
This script does: self-heal installer-managed tracked artifacts -> clean managed checkout -> `git fetch --tags --prune` -> `git pull --ff-only` -> required HuggingFace ONNX model setup -> `npm ci` -> `npm run registry:build` -> `npm run supervibe:install-doctor`.

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
     • ONNX model rechecked

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
| Installer-managed package-lock drift | Restore `package-lock.json`, then continue dirty check |
| Stale untracked files in checkout | Clean automatically with `git clean -ffdx` before reinstall; install doctor fails if any remain |
| Network failure during `git pull` | Print message; preserve pre-state; exit (no rollback needed — nothing changed yet) |
| `npm ci` fails | Stop and print output; rerun after fixing dependency or network issue |
| ONNX model fetch fails | Stop before declaring success; keep checkout for retry; print HuggingFace recovery hint |
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
  4. Terminal aliases refreshed: supervibe-update, supervibe-adapt
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
  - ONNX model rechecked

Plugin remains on vX.Y.Z.
Failure log: .supervibe/memory/incidents/upgrade-failure-2026-04-28T15-30-00.md

Next:
  1. File issue: https://github.com/vTRKA/supervibe/issues
  2. Or pin to safer version: /supervibe-update --to <version>
```

Dry-run:

```
=== Supervibe Update — DRY RUN ===
PLUGIN_ROOT: /path/to/marketplace
CURRENT_VERSION: vX.Y.Z
HEAD: abc1234
BRANCH: main
DIRTY_LINES: 0
TARGET_REF: tracked-upstream
UPSTREAM_CACHE_BEHIND: 2
WOULD_RUN: restore managed drift -> git clean -> fetch -> pull/checkout -> ensure ONNX -> npm ci -> registry:build -> terminal shim refresh -> install doctor
MUTATES: false
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

## Agent Orchestration Contract

This command must load its executable profile from `scripts/lib/command-agent-orchestration-contract.mjs` and follow `rules/command-agent-orchestration.md`. The profile is the source of truth for `ownerAgentId`, `agentPlan`, `requiredAgentIds`, dynamic specialist selection, default `real-agents` mode, and `agent-required-blocked` behavior.

Before durable work or completion claims, run `node <resolved-supervibe-plugin-root>/scripts/command-agent-plan.mjs --command /supervibe-update` and follow the printed `SUPERVIBE_COMMAND_AGENT_PLAN`. The plan must show host dispatch support, proof source, `AGENT_SELECTION_MODE`, required agents, `REQUIRED_AGENT_SOURCES`, `CALLABLE_AGENT_SOURCES`, `CALLABLE_AGENTS_READY`, `SCOPED_RECEIPT_GATE`, `MISSING_CALLABLE_AGENTS`, and durable-write permission before any agent-owned artifact is produced. Role sources must distinguish definition availability from host-callable availability: `REQUIRED_AGENT_SOURCES` may include `plugin-only`, but `CALLABLE_AGENT_SOURCES`, `CALLABLE_AGENTS_READY`, and `MISSING_CALLABLE_AGENTS` decide whether the selected host can actually invoke the role. Plugin-only definitions are not enough for a real-agent completion claim.

Invoke the real host agents named by the plan and issue runtime receipts with `hostInvocation.source` and `hostInvocation.invocationId`. For active workflows, build the plan with `--active --slug <slug> --handoff-id <handoff-id>`; `SCOPED_RECEIPT_GATE` must be trusted for the current run before durable agent-owned outputs are allowed. Old global receipts are diagnostic only and do not unlock a new command/handoff. In Codex, invoke with `spawn_agent` using the `CODEX_SPAWN_PAYLOAD_RULES` and `CODEX_SPAWN_PAYLOADS` printed by `command-agent-plan.mjs`: forked payloads must set `fork_context=true`, must omit `agent_type`, `model`, and `reasoning_effort`, and must encode the Supervibe logical role in `message` instead of Codex `agent_type`. Record each returned Codex agent id with `node <resolved-supervibe-plugin-root>/scripts/agent-invocation.mjs log ...` before receipts are issued. `inline` is diagnostic/dry-run only. Do not emulate specialist agents, and do not let command or skill receipts substitute for agent, worker, or reviewer output.
## Workflow Invocation Receipts

Any claim that this command invoked another Supervibe command, skill, agent, reviewer, worker, validator, or external tool must be backed by a runtime-issued workflow receipt created with `node <resolved-supervibe-plugin-root>/scripts/workflow-receipt.mjs issue ...`. Hand-written receipts are untrusted. Agent, worker, and reviewer receipts must include `hostInvocation.source` and `hostInvocation.invocationId` from a real host dispatch; command or skill receipts must not substitute for specialist output. Scoped current-run receipts are required for active command/handoff claims; old global receipts are diagnostic only and cannot authorize a new agent-owned output. Durable artifacts produced by this command must stay linked through `.supervibe/memory/workflow-invocation-ledger.jsonl` and `artifact-links.json`; run `npm run validate:workflow-receipts` and `npm run validate:agent-producer-receipts` before claiming the command, delegated stage, or produced artifact is complete.
