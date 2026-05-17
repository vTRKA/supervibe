---
description: "Sync project-level host artifacts to upstream plugin changes or user-requested project-fit changes for agents, rules, and skills. Diff-driven, user-gated."
last-verified: "2026-05-08"
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
supervibe-adapt --scope deploy --target docker --dry-run
supervibe-adapt --scope deploy --target docker --apply
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

6. **Update metadata and lifecycle state.** When drift is reported, Adapt writes `.supervibe/memory/adapt/state.json` as a resume artifact with `drift_reported`, dirty-state classification, and next commands. After approved artifact writes, refresh `.supervibe/memory/.supervibe-version`, write `baseline.pluginVersion`, and let apply move the same state through `approved -> applied -> artifact_verified` or `failed_recoverable`, evidence, updated artifacts, blocked artifacts, recovery notes, and layered verification fields: `artifactVerified`, `agentRuntimeVerified`, `appVerified`, and `deployVerified`. If the dry-run reports `UPDATES: 0` and `ADDS: 0` with `VERSION_DRIFT: true` or `METADATA_UPDATE_REQUIRED: true`, run the printed `NEXT_APPLY_METADATA` command; it updates only the version marker and baseline metadata.

7. **Score the result.** Run a quick `/supervibe-audit` to verify no new drift was introduced. Confidence ≥9 to declare done.

8. **Separate adapt from app/deploy/index health.** A clean adapt can still leave app verification, deploy verification, or code index health pending. Treat `ARTIFACT_ADAPT_CLEAN: true` as the artifact-sync result, `APP_VERIFICATION_STATUS` / `DEPLOY_VERIFICATION_STATUS` as layered follow-ups, and `CODE_INDEX_READY: false` as a separate index follow-up. When app or deploy checks are not run, print `NEXT_APP_VERIFICATION` or `NEXT_DEPLOY_VERIFICATION`; when index repair is needed, run the printed `NEXT_INDEX_REPAIR` command instead of calling adapt incomplete.

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
Layers:      artifactVerified=<bool> agentRuntimeVerified=<bool> appVerified=<bool> deployVerified=<bool>
App hook:    APP_VERIFICATION_STATUS=<verified|not-run-app-verification|not-applicable> NEXT_APP_VERIFICATION=<command|none>
Deploy hook: DEPLOY_VERIFICATION_STATUS=<verified|not-run-deploy-adapt|not-run-compose-verification|not-run-deploy-runtime-verification|not-applicable> NEXT_DEPLOY_VERIFICATION=<command|none>
Dirty state: expectedRuntimeEvidence=<n> expectedMemory=<n> staleGarbage=<n> unexpectedMutations=<n>
Frontend:    target=<next-app|vite-spa|monorepo-two-frontends|none> bundler=<turbopack|vite|mixed|none>
Diff mode:   git | no-git snapshot

Confidence:  N/10  Rubric: agent-delivery
```

## Safety Boundaries

- Dry-run does not mutate host artifacts and must not refresh memory indexes
  unless explicitly requested. When drift is detected, it may update only the
  Adapt resume artifact at `.supervibe/memory/adapt/state.json`.
- Apply writes only approved project host artifacts and `.supervibe/memory/`
  metadata required by the adapt plan.
- No-git projects use `.supervibe/memory/adapt/file-manifest.json` snapshots
  instead of failing before `git init`.
- Package tags must not override a Genesis frontend decision without a
  frontend target resolution.
- User-owned host instruction text outside managed blocks is never overwritten.
- Index repair is a separate follow-up from artifact adaptation.
- Adapt dry-run and approved apply are deterministic CLI artifact-sync phases.
  They may claim approved artifact changes were applied and verified by Adapt
  state, diff, and validator evidence. Optional host-agent smoke checks remain
  separate diagnostics and are not required for Adapt completion.
- Dirty state after Adapt must be classified before completion: runtime
  evidence and agent outputs are expected diagnostic evidence, `.supervibe/memory`
  writes are expected memory, stale runtime/archive folders are cleanup
  candidates, and any other mutation is an unexpected mutation that blocks a
  clean completion claim until reviewed.

## Deploy Add-ons

Deploy artifacts are opt-in and separate from the base scaffold:

```bash
node "<resolved-supervibe-plugin-root>/scripts/supervibe-adapt.mjs" --scope deploy --target dokploy --dry-run
node "<resolved-supervibe-plugin-root>/scripts/supervibe-adapt.mjs" --scope deploy --target dokploy --apply
node "<resolved-supervibe-plugin-root>/scripts/supervibe-adapt.mjs" --scope deploy --target docker --dry-run
node "<resolved-supervibe-plugin-root>/scripts/supervibe-adapt.mjs" --scope deploy --target docker --apply
```

Deploy add-ons are stack-evidence gated. The resolver scans supported service
manifests instead of assuming exactly `frontend/` and `backend/`:

- `next-only`: Next.js services get service-local `Dockerfile` and
  `.dockerignore`, compose port `3000`, no backend, no Postgres, no migration.
- `laravel-postgres`: Laravel services get service-local `Dockerfile` and
  `.dockerignore`, Postgres, port `8000`, and explicit migration commands, no
  frontend artifacts.
- `laravel-next-postgres`: all detected Laravel and Next.js services are
  included; one-service projects keep service names `backend` and `frontend`,
  multi-service projects use stable names derived from service paths.
- Unsupported service-only projects, such as Vite-only or non-Laravel Composer
  projects, are reported in `deployProfile.unsupportedServices` and do not
  receive guessed Dockerfiles.

`--target docker` writes portable `docker-compose.yml` with host ports.
`--target dokploy` writes Dokploy-specific compose, internal `expose`, and
`dokploy-network`; it also recognizes an existing hand-written
`docker-compose.yml`/`docs/dokploy-deploy.md` Next-only layer as present when it
is equivalent. Neither target auto-migrates or claims `deployVerified` until a
real deployment health check passes. Docker probing reports
`dockerInstalled`, `composeAvailable`, and `daemonRunning` separately.

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
- [Migration And Deprecation Template](../references/templates/migration-deprecation.md)
  records compatibility, rollout, communication, and rollback evidence when
  Adapt moves an artifact contract.

## Agent Orchestration Contract

This command must load its executable profile from `scripts/lib/command-agent-orchestration-contract.mjs` and follow `rules/command-agent-orchestration.md`. The profile is the source of truth for `ownerAgentId`, `agentPlan`, `requiredAgentIds`, dynamic specialist selection, default `real-agents` mode, and `agent-required-blocked` behavior.

Before durable artifact writes, run `node <resolved-supervibe-plugin-root>/scripts/command-agent-plan.mjs --command /supervibe-adapt --dry-run --adds <n> --updates <n> --project-only <n> --conflicts <n>` and follow the printed `SUPERVIBE_COMMAND_AGENT_PLAN`. Adapt dry-run is read-only and may print `EXECUTION_MODE: dry-run-no-agent`; approved `--apply` is the deterministic artifact-sync gate. The plan must show `AGENT_SELECTION_MODE`, required agents, `REQUIRED_AGENT_SOURCES`, `CALLABLE_AGENT_SOURCES`, `CALLABLE_AGENTS_READY`, `MISSING_CALLABLE_AGENTS`, and durable-write permission before any optional agent-owned follow-up is produced. Role sources must distinguish definition availability from host-callable availability: `REQUIRED_AGENT_SOURCES` may include `plugin-only`, but `CALLABLE_AGENT_SOURCES`, `CALLABLE_AGENTS_READY`, and `MISSING_CALLABLE_AGENTS` decide whether the selected host can actually invoke the role.

Adapt's CLI can apply explicitly approved artifact diffs and may complete without a host-agent proof workflow. Optional agent-produced merge decisions, verification reviews, recovery judgments, or completion assessments must use the normal host-agent invocation path for that separate delegated work; they are not part of the Adapt bootstrap/apply completion contract.
