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
supervibe-adapt --dry-run --summary-json --changed-only
supervibe-adapt --dry-run --evidence-summary --quiet-identical
supervibe-adapt --apply --include "<project-relative-path>"
supervibe-adapt --scope deploy --target dokploy --dry-run
supervibe-adapt --scope deploy --target dokploy --apply
```

## When to invoke

- After `npm run supervibe:upgrade` reports a version bump (e.g. `previous → 2.0.11`).
- The SessionStart banner shows `[supervibe] ⬆ plugin upgraded N → M`.
- An audit (`/supervibe-audit`) flagged drift between upstream and project copies.
- The project has been on the same plugin version for >90 days and you want to refresh.
- The user explicitly asks to adapt rules or agents to the current project so gaps can be closed deliberately.

## Procedure

0. **Run the real dry-run implementation first.** Use the compact machine form before any agent plan:
   ```bash
   node "<resolved-supervibe-plugin-root>/scripts/supervibe-adapt.mjs" --dry-run --summary-json --changed-only --project "<project-root>" --plugin-root "<resolved-supervibe-plugin-root>"
   ```
   The implementation resolves `pluginRoot` explicitly, detects the active host adapter, compares project host artifacts such as `.codex/agents`, `.codex/rules`, and `.codex/skills` against upstream plugin artifacts, computes `related-rules` closure candidates, and never reuses `supervibe-status --genesis-dry-run` as an adapt substitute. Dry-run is read-only by default; use `--refresh-memory-index` only when you intentionally want to rewrite `.supervibe/memory/index.json` during planning.
   Feed the returned counts into:
   ```bash
   node "<resolved-supervibe-plugin-root>/scripts/command-agent-plan.mjs" --command /supervibe-adapt --dry-run --adds <adds> --updates <updates> --project-only <projectOnly> --conflicts <conflicts> --memory-writes <true|false>
   ```

   If `.git` is absent, this is not fatal. The dry-run compares the current
   tree against `.supervibe/memory/adapt/file-manifest.json` when available;
   apply writes a fresh snapshot for the next Adapt run.

0a. **Honor Genesis state.** Read `.supervibe/memory/genesis/state.json` when
   present. `appChoice=next-app`, `appGenerated`, `appVerified`, and ignored
   stack tags such as `vite` are source-of-truth for stack drift. A new `vite`
   dependency inside a Genesis Next app is accidental/tooling/separate-SPA
   evidence, not an automatic switch to Vite agents.

1. **Read upstream.** Resolve the active host adapter first, then for each file in `<adapter>/agents`, `<adapter>/rules`, and `<adapter>/skills`, find the matching upstream file in the resolved Supervibe plugin root under `agents/`, `rules/`, or `skills/`.

2. **Three-way classification.** For each pair:
   - **Identical** → skip (no action).
   - **Upstream-only change** (project file unchanged from prior version baseline) → propose direct update.
   - **Both changed** (project has local customizations + upstream changed) → propose 3-way merge with conflict markers, ask user to resolve manually.
   - **Project-only change** (no upstream equivalent any more — deleted/renamed) → flag, ask user whether to keep, archive to `.supervibe/archive/`, or delete.
   - **Related-rule closure add** (installed rule references upstream rule missing from selected profile) → propose an `ADD` candidate, showing `mandatory: true/false` and the exact include path.

3. **Use the `supervibe:adapt` skill plus the CLI plan** for the actual diff/merge logic. If the request is project-fit adaptation, include capability registry evidence for why each agent/rule/skill is added, kept, changed, or deferred. If the plan prints `FAST_PATH_ELIGIBLE: true` (`ADDS: 0`, `UPDATES <= 1`, `PROJECT_ONLY: 0`, `CONFLICTS: 0`, `MEMORY_WRITES: false`), use the low-risk fast path: owner/orchestrator plus quality gate, CLI apply, and validators. Do not dispatch repo/rules/memory curators for a single upstream-only artifact unless the plan reports conflicts, project-only files, rule closure adds, or memory writes.

4. **Show summary.** Before any write, print a table:
   ```
   File                                  Upstream   Project   Action
   <adapter>/agents/_core/code-reviewer.md upgrade-A  unchanged direct-update
   <adapter>/agents/_design/copywriter.md  upgrade-B  edited    3-way merge
   <adapter>/rules/no-half-finished.md     unchanged  unchanged skip
   <adapter>/agents/_legacy/*.md           DELETED    present   ask user
   ```
   The CLI also prints `SUPERVIBE_ADAPT_DIFF_SUMMARY` with per-file additions/deletions. Use `--summary-json --changed-only` for compact machine output, `--evidence-summary` for a terse text proof packet, and `--quiet-identical` when unchanged artifacts would drown the actual diff. If a slash-flow uses `--apply --all` after explicit user approval, keep that summary visible in the transcript so the applied files are auditable.

5. **Per-file diff gate.** For each non-trivial action, show the diff and wait for user "yes" / "skip" / "abort". Never write without explicit per-file approval. Apply only approved files:
   ```bash
   node "<resolved-supervibe-plugin-root>/scripts/supervibe-adapt.mjs" --apply --include "<project-relative-path-1>,<project-relative-path-2>"
   ```

6. **Update metadata and lifecycle state.** After approved artifact writes, refresh `.supervibe/memory/.supervibe-version`, write `baseline.pluginVersion`, and let apply write `.supervibe/memory/adapt/state.json` with `approved -> applied -> artifact_verified` or `failed_recoverable`, evidence, updated artifacts, blocked artifacts, recovery notes, and layered verification fields: `artifactVerified`, `agentReceiptsVerified`, `appVerified`, and `deployVerified`. If the dry-run reports `UPDATES: 0` and `ADDS: 0` with `VERSION_DRIFT: true` or `METADATA_UPDATE_REQUIRED: true`, run the printed `NEXT_APPLY_METADATA` command; it updates only the version marker and baseline metadata.

7. **Score the result.** Run a quick `/supervibe-audit` to verify no new drift was introduced. Confidence ≥9 to declare done.

8. **Separate adapt from index health.** A clean adapt can still leave code index health red. Treat `ARTIFACT_ADAPT_CLEAN: true` as the artifact-sync result and `CODE_INDEX_READY: false` as a separate follow-up. When index repair is needed, run the printed `NEXT_INDEX_REPAIR` command instead of calling the adapt incomplete.

9. **Handle dependency remediation as policy.** If dependency health reports a
   vulnerable nested package, block `npm audit fix --force` when it downgrades a
   framework major/minor line. Prefer a reviewed `overrides`/`resolutions` plan
   only when compatibility evidence exists, then rerun `npm install`,
   `npm audit`, lint, build, and `dependency-health`.

## Output contract

```
=== Supervibe Adapt: vX → vY ===
Upgraded:    <count>
Skipped:     <count>
Conflicts:   <count> (manual resolution needed)
Fast path:   eligible | standard-agent-plan
Archived:    <count>
Deleted:     <count>
State:       .supervibe/memory/adapt/state.json (artifact_verified | applied_unverified | failed_recoverable)
Layers:      artifactVerified=<bool> agentReceiptsVerified=<bool> appVerified=<bool> deployVerified=<bool>
Frontend:    target=<next-app|vite-spa|monorepo-two-frontends|none> bundler=<turbopack|vite|mixed|none>
Diff mode:   git | no-git snapshot

Confidence:  N/10  Rubric: agent-delivery
```

## Safety Boundaries

- Dry-run is read-only by default and must not refresh memory indexes unless
  explicitly requested.
- Apply writes only approved project host artifacts and `.supervibe/memory/`
  metadata required by the adapt plan.
- No-git projects use `.supervibe/memory/adapt/file-manifest.json` snapshots
  instead of failing before `git init`.
- Package tags must not override a Genesis frontend decision without a
  frontend target resolution.
- User-owned host instruction text outside managed blocks is never overwritten.
- Index repair is a separate follow-up from artifact adaptation.
- Completion claims require real runtime receipts. Without
  `.supervibe/memory/agent-invocations.jsonl`, Adapt may claim artifact
  changes were applied, but not that real agents completed.

## Deploy Add-ons

Deploy artifacts are opt-in and separate from the base scaffold:

```bash
node "<resolved-supervibe-plugin-root>/scripts/supervibe-adapt.mjs" --scope deploy --target dokploy --dry-run
node "<resolved-supervibe-plugin-root>/scripts/supervibe-adapt.mjs" --scope deploy --target dokploy --apply
```

The Dokploy add-on creates `.dockerignore`, `docker-compose.dokploy.yml`,
`backend/Dockerfile`, `frontend/Dockerfile`, `.env.example`, and
`docs/deploy/dokploy.md`. Compose uses explicit `env_file` and `environment`
keys, named Postgres volumes, service healthchecks, Laravel queue and scheduler
services, and an explicit migration command. It does not auto-migrate or claim
`deployVerified` until a real deployment health check passes.

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

## Agent Orchestration Contract

This command must load its executable profile from `scripts/lib/command-agent-orchestration-contract.mjs` and follow `rules/command-agent-orchestration.md`. The profile is the source of truth for `ownerAgentId`, `agentPlan`, `requiredAgentIds`, dynamic specialist selection, default `real-agents` mode, and `agent-required-blocked` behavior.

Before durable work or completion claims, run `node <resolved-supervibe-plugin-root>/scripts/command-agent-plan.mjs --command /supervibe-adapt --dry-run --adds <n> --updates <n> --project-only <n> --conflicts <n>` and follow the printed `SUPERVIBE_COMMAND_AGENT_PLAN`. Adapt dry-run is read-only and may print `EXECUTION_MODE: dry-run-no-agent`; approved `--apply` and `--verify-agents` are separate gates. The plan must show host dispatch support, proof source, `AGENT_SELECTION_MODE`, required agents, `REQUIRED_AGENT_SOURCES`, and durable-write permission before any agent-owned artifact is produced. Role sources must be visible as `project artifact`, `plugin-only`, or `logical role` so users can tell whether a role is installed into the project or supplied by the plugin profile.

Invoke the real host agents named by the plan and issue runtime receipts with `hostInvocation.source` and `hostInvocation.invocationId`. In Codex, invoke with `spawn_agent` using the `CODEX_SPAWN_PAYLOAD_RULES` and `CODEX_SPAWN_PAYLOADS` printed by `command-agent-plan.mjs`: forked payloads must set `fork_context=true`, must omit `agent_type`, `model`, and `reasoning_effort`, and must encode the Supervibe logical role in `message` instead of Codex `agent_type`. Record each returned Codex agent id with `node <resolved-supervibe-plugin-root>/scripts/agent-invocation.mjs log ...` before receipts are issued. `inline` is diagnostic/dry-run only. Do not emulate specialist agents, and do not let command or skill receipts substitute for agent, worker, or reviewer output.
## Workflow Invocation Receipts

Any claim that this command invoked another Supervibe command, skill, agent, reviewer, worker, validator, or external tool must be backed by a runtime-issued workflow receipt created with `node <resolved-supervibe-plugin-root>/scripts/workflow-receipt.mjs issue ...`. Hand-written receipts are untrusted. Agent, worker, and reviewer receipts must include `hostInvocation.source` and `hostInvocation.invocationId` from a real host dispatch; command or skill receipts must not substitute for specialist output. Durable artifacts produced by this command must stay linked through `.supervibe/memory/workflow-invocation-ledger.jsonl` and `artifact-links.json`; run `npm run validate:workflow-receipts` and `npm run validate:agent-producer-receipts` before claiming the command, delegated stage, or produced artifact is complete.
