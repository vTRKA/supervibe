---
description: >-
  Use WHEN running an autonomous loop, epic, atomic work queue, 3h timeboxed
  session, or separate worktree TO perform provider-safe policy preflight,
  bounded execution, status, resume, stop, side-effect ledger, and cleanup
  gates. Triggers: 'loop', 'epic', 'worktree', 'эпик', '3 часа'.
---

# /supervibe-loop

Run a bounded autonomous loop for a user plan or open request. The command is
observable, cancellable, policy-gated, and blocked below a 9/10 task score.
For large specs, the loop must preserve the full SDLC path from discovery to
production release: MVP slice, phased implementation, verification, release
gate, rollback, support owner, and post-release learning.

## Invocation

Primary path:

```bash
/supervibe-loop --plan .supervibe/artifacts/plans/payment-integration.md
/supervibe-loop --from-prd .supervibe/artifacts/specs/checkout.md --dry-run
/supervibe-loop --atomize-plan .supervibe/artifacts/plans/payment-integration.md --plan-review-passed
/supervibe-loop --from-plan .supervibe/artifacts/plans/payment-integration.md --atomize --dry-run
/supervibe-loop --request "validate code and fix integration bugs"
/supervibe-loop --happy-path --plan .supervibe/artifacts/plans/payment-integration.md
/supervibe-loop --request "finish onboarding design and wire it into app" --max-loops 20
/supervibe-loop --guided --max-duration 3h
/supervibe-loop --epic SV-123 --worktree --max-duration 3h
/supervibe-loop --epic SV-123 --worktree --assigned-task T1 --assigned-write-set src/auth.ts --max-duration 3h
/supervibe-loop --worktree-existing .worktrees/loop-upgrade --resume-session session-loop-upgrade
/supervibe-loop --worktree-status
/supervibe-loop --watch --file .supervibe/memory/work-items/<epic-id>/graph.json
/supervibe-loop --quickstart
/supervibe-loop --onboard
/supervibe-loop --completion bash
/supervibe-loop --create-work-item --interactive
/supervibe-loop --create-work-item --title "Fix checkout bug" --template bug --dry-run
/supervibe-loop --import-tasks .supervibe/artifacts/plans/example.md --dry-run
/supervibe-loop --import-tasks tasks.md --interactive
/supervibe-loop --priority --file .supervibe/memory/work-items/<epic-id>/graph.json
/supervibe-loop --defer task-123 --until 2026-05-01T09:00:00Z --file .supervibe/memory/work-items/<epic-id>/graph.json
/supervibe-loop --request "validate integrations" --notify terminal,inbox
/supervibe-loop --export-sync-bundle .supervibe/memory/loops/<run-id> --out .supervibe/memory/bundles/<run-id>-sync
/supervibe-loop --import-sync-bundle .supervibe/memory/bundles/<run-id>-sync --dry-run
/supervibe-loop --eval
/supervibe-loop --eval --case plan-review-loop
/supervibe-loop --eval --replay .supervibe/memory/loops/example-run
/supervibe-loop --eval-live --case worktree-run --max-runtime-minutes 30 --max-iterations 3 --provider-budget 1
/supervibe-loop --policy-profile guided --request "validate integrations"
/supervibe-loop --approval-receipts
/supervibe-loop --policy-doctor
/supervibe-loop --policy-doctor --fix-derived
/supervibe-loop --anchors --file src/example.ts
/supervibe-loop --anchor-doctor
/supervibe-loop --anchor-doctor --fix-derived
/supervibe-loop --summarize-changes --task task-123 --file src/example.ts --summary "Changed parser"
/supervibe-loop --plan-waves .supervibe/artifacts/plans/example.md
/supervibe-loop --assign-ready --explain --file .supervibe/memory/loops/<run-id>/state.json
/supervibe-loop --setup-worker-presets
/supervibe-loop --status --epic example-epic
/supervibe-loop --resume .supervibe/memory/loops/<run-id>/state.json
/supervibe-loop --status --file .supervibe/memory/loops/<run-id>/state.json
/supervibe-loop --stop <run-id>
```

Advanced diagnostics:

```bash
/supervibe-loop --readiness --plan .supervibe/artifacts/plans/payment-integration.md
/supervibe-loop --atomize-plan .supervibe/artifacts/plans/payment-integration.md --preview
/supervibe-loop --graph --file .supervibe/memory/loops/<run-id>/state.json --format text
/supervibe-loop graph --file .supervibe/memory/loops/<run-id>/state.json --format mermaid
/supervibe-loop doctor --file .supervibe/memory/loops/<run-id>/state.json
/supervibe-loop doctor --file .supervibe/memory/loops/<run-id>/state.json --fix
/supervibe-loop prime --file .supervibe/memory/loops/<run-id>/state.json
/supervibe-loop export --file .supervibe/memory/loops/<run-id>/state.json --out .supervibe/memory/bundles/<run-id>
/supervibe-loop import --file .supervibe/memory/bundles/<run-id> --out .
/supervibe-loop --tracker-sync-push --file .supervibe/memory/work-items/<epic-id>/graph.json
/supervibe-loop --tracker-sync-pull --file .supervibe/memory/work-items/<epic-id>/graph.json
/supervibe-loop --tracker-doctor --file .supervibe/memory/work-items/<epic-id>/graph.json --fix
/supervibe-loop --export-sync-bundle .supervibe/memory/loops/<run-id> --out .supervibe/memory/bundles/<run-id>-sync
/supervibe-loop --import-sync-bundle .supervibe/memory/bundles/<run-id>-sync --dry-run
/supervibe-loop --eval --case plan-review-loop --out .supervibe/audits/autonomous-loop-evals/latest-report.json
```

Plan atomization:

```bash
/supervibe-loop --atomize-plan .supervibe/artifacts/plans/example.md --dry-run
/supervibe-loop --atomize-plan .supervibe/artifacts/plans/example.md --plan-review-passed
```

Atomization converts one reviewed plan into one epic, child work items, blocker edges, soft related links, gate items, and follow-ups. Writes require `--plan-review-passed`; `--dry-run` previews the graph without writing.
Generated work items use reusable templates for feature, bugfix, refactor, UI story, integration, migration, documentation, release-prep, production-prep, and research spike work. Items carry labels, severity, owner/component/stack fields, required gates, verification hints, comments, and optional repo/package/workspace/subproject routing metadata.
Production-oriented plans also generate release, observability, rollback,
security/privacy, and post-release learning work items so the loop does not
stop after a code-only slice.

Durable tracker sync:

```bash
/supervibe-loop --tracker-sync-push --file .supervibe/memory/work-items/<epic-id>/graph.json
/supervibe-loop --tracker-sync-pull --file .supervibe/memory/work-items/<epic-id>/graph.json
/supervibe-loop --tracker-doctor --file .supervibe/memory/work-items/<epic-id>/graph.json
```

The native graph remains canonical. External CLI or MCP trackers are optional;
if no adapter is available, sync falls back to the native JSON graph and writes
a reversible mapping at `.supervibe/memory/loops/task-tracker-map.json`.

External ecosystem integration stays provider-safe by default. `--notify` can
route completion and failure events to terminal and delegated inbox targets.
Webhook notification is disabled unless the target is allowlisted and covered by
an explicit policy approval. Federated sync bundles export redacted graph,
status, comments, evidence, tracker mapping, and checksums into a portable local
directory; import currently supports `--dry-run` validation and conflict
reporting without mutating remote systems.

Saved views and reports are handled by `/supervibe-status`. Deferred work is
handled locally with `/supervibe-loop --defer <item> --until <timestamp> --file
<graph.json>`. Deferral writes only the native graph, creates a backup, and
remains visible in status, dashboard, query results, and SLA reports. No
background daemon is required; due work is re-evaluated deterministically when a
status, dashboard, report, or scheduler check runs.

For visual inspection, `/supervibe-ui` can open the same `graph.json` and loop
`state.json` in a localhost control plane. It previews context packs, waves,
reports, GC candidates, and safe local actions without changing the canonical
JSON graph unless the user previews and explicitly applies a local mutation.

Interactive mode is opt-in. `/supervibe-loop --create-work-item --interactive`
uses guided terminal forms when a real TTY exists; otherwise it prints a
`SUPERVIBE_INTERACTIVE_FALLBACK` command and exits without mutation. Guided
forms validate template, title, owner, priority, labels, acceptance criteria,
verification hints, dependencies, due date, and risk before any write. `--preview`
and `--dry-run` show redacted before/after state for create, import, atomize,
defer, claim, and close-style actions. `--yes` is limited to safe local actions
and cannot approve provider, network, production, webhook, or risky operations.

Autonomous evals are local by default. `/supervibe-loop --eval` replays the
benchmark corpus from `tests/fixtures/autonomous-loop-evals/benchmark-corpus.json`
against `golden-outcomes.json`, calculates a quality scorecard, writes a local
report, and never calls provider tools or mutates the workspace. `--eval
--replay <run-dir>` replays archived run artifacts. `--eval-live` is blocked
unless max runtime, max iterations, and provider budget are explicitly supplied;
live evals never update golden outcomes automatically.

Policy profiles are local governance settings, not provider bypass settings.
`--policy-profile guided|contributor|maintainer|CI-readonly|CI-verify|release-prep`
loads built-in defaults plus optional `.supervibe/policy-profile.json`
overrides. Built-in deny rules and managed deny rules win over local allows.
`--approval-receipts` prints scoped expiring approval receipts from the local
ledger. `--policy-doctor` checks profile drift across command docs, README,
package manifests, local config, worktree sessions, and active runs; `--fix-derived`
can materialize derived safe defaults after writing a backup but never loosens
deny rules automatically.

Semantic anchors are optional local navigation hints for high-value files.
`--anchors --file <source>` parses safe `@supervibe-anchor` comments from one
file. `--anchor-doctor` reports missing files, renamed symbols, duplicate IDs,
missing verification refs, stale file-local contracts, and summaries for deleted
code. `--anchor-doctor --fix-derived` only updates derived anchor indexes after
backup; source comments require manual review. `--summarize-changes` appends a
redacted per-file change summary linked to task/evidence/verification refs.

Multi-agent orchestration remains explicit and inspectable. `--plan-waves`
builds a bounded wave plan from ready work, dependency state, write-set overlap,
risk, reviewer availability, and worktree sessions. `--assign-ready --explain`
prints worker and reviewer assignments with alternatives, required evidence,
semantic anchors, module contracts, and policy constraints. `--setup-worker-presets`
prints the portable worker/reviewer preset catalog without mutating state.

Work-item UX supports natural-language status questions such as "what is
ready?", "what is blocked?", "who owns this?", "what changed?", "what should I
run next?", and "summarize epic progress". Comments are stored as linked notes
for implementation handoffs, reviewer feedback, blockers, user decisions, and
resolutions without bloating task titles.

Advanced work-item helpers are explicit and read-only by default. `--watch`
writes a visible heartbeat snapshot but never mutates tasks. `--priority`
explains ready-front ordering by priority, severity, dependency depth, age,
owner availability, worktree fit, and risk. `--import-tasks` previews markdown,
JSON, plan, or loop-state task migration before writing. The delegated inbox is
visible in `/supervibe-status`, and blocker delegation can only close with a
resolution comment or linked decision.

Worktree sessions:

```bash
/supervibe-loop --guided --max-duration 3h
/supervibe-loop --epic <epic-id> --worktree --max-duration 3h
/supervibe-loop --epic <epic-id> --worktree --assigned-task T1 --assigned-write-set src/auth.ts
/supervibe-loop --epic <epic-id> --worktree --assigned-task T2 --assigned-write-set src/billing.ts
/supervibe-loop --worktree-existing .worktrees/<session> --resume-session <session-id>
/supervibe-loop --worktree-status
```

Use the current-session command when the user is working alone in one checkout
and does not want isolation. Worktree-backed runs are opt-in for parallel
sessions, risky changes, or explicit isolation.

Worktree-backed runs use an active session registry at `.supervibe/memory/worktree-sessions/registry.json`. Each session records `sessionId`, `epicId`, `branchName`, `worktreePath`, `baselineCommit`, `baselineChecks`, `activeAgentIds`, `status`, `cleanupPolicy`, heartbeat, stop, resume, and cleanup commands. Cleanup is blocked until the worktree is clean and archived.
Parallel sessions on one epic must declare task and write-set ownership. The
registry write path is lock-protected and atomically replaces the registry file,
so separate CLI processes do not lose each other's claims. `--worktree-status`
prints each active session's wave, tasks, write-set, agents, and path.
`--allow-session-conflict` is an explicit escape hatch for maintainer-reviewed
overlap and should not be used for normal parallel work.

Execution modes:

```bash
/supervibe-loop --dry-run --request "validate integrations"
/supervibe-loop --guided --plan .supervibe/artifacts/plans/payment-integration.md
/supervibe-loop --manual --plan .supervibe/artifacts/plans/payment-integration.md
/supervibe-loop --fresh-context --tool codex --plan .supervibe/artifacts/plans/payment-integration.md
/supervibe-loop --commit-per-task --fresh-context --tool codex --plan .supervibe/artifacts/plans/payment-integration.md
```

## Contract

- Build a task queue from a plan or request.
- Run preflight for scope, autonomy, budget, environment, MCP/tool permissions,
  access needs, and approval boundaries.
- Apply Scope Safety Gate before atomization or execution: each task must map
  to approved scope or an explicit user-approved scope change; optional extras
  are deferred or rejected with rationale instead of silently built.
- Run provider permission audit before non-dry execution. The audit records the
  effective permission mode, denied tools, prompt-required tools, rate-limit
  state, network/MCP approval state, and next safe action.
- Dispatch specialist chains by task type.
- Keep structured handoffs, scores, audit events, side-effect ledger entries,
  and a final report under `.supervibe/memory/loops/<run-id>/`.
- Include `contextPack.workflowSignal` in each handoff and fresh-context prompt
  so the worker and reviewer see the current project/epic/task phase, claim,
  gate, and next action before acting.
- Include Retrieval Quality and Graph Quality Gates in fresh-context handoffs
  so workers see source citations, rerank/fallback status, semantic anchors,
  graph warnings, symbol coverage, and edge-resolution caveats before editing.
- Include a visual status summary in long-run reports: `/supervibe-loop graph
  --format mermaid` output or `/supervibe-ui` URL plus a text fallback listing
  ready, blocked, review, done, open gates, release blockers, and rollback owner.
- Treat task score below 9.0 as incomplete.
- Stop for policy, budget, missing access, production approval, cancellation,
  state migration, unapproved scope expansion, or side-effect reconciliation.

## Continuation Contract

Do not stop after the first task or wave if there is still ready work, budget, and no blocker. The loop should continue ready work until the queue is exhausted, a configured max-duration/max-iteration/provider budget is reached, a policy or approval gate blocks progress, verification fails, or the user explicitly stops/pauses.

Wave reviews are checkpoints, not default terminal states. If a wave passes and more tasks are ready, continue to the next wave or print the exact blocker that prevents continuation. Final output must distinguish "finished all available work" from "paused by gate/budget/user".

## Topic Drift / Resume Contract

If the user shifts topic while `.supervibe/memory/loops/<run-id>/state.json`, `contextPack.workflowSignal`, or a queued handoff exists, do not silently drop the loop. Surface run id, current phase, active task or wave, artifact path, next command, stop command, and blocker, then ask one `Step N/M` or `Step N/M` resume question with these choices: continue ready work, skip/delegate safe non-final decisions to the controller and continue, pause current loop and switch topic, or stop/archive the current state.

Skipped or delegated decisions must be recorded in loop state, side-effect ledger, and final report. They cannot bypass policy, budget, approval, production, destructive-operation, review, verification, or scope-expansion gates.

## Safety Boundaries

- No provider bypass, rate-limit bypass, hidden background automation, or broad
  shell allowlist.
- Dangerous provider flags such as `--dangerously-skip-permissions`,
  `--bypass-permissions`, `--all-tools`, and `bypassPermissions` are blocked by
  default. A narrow test-only override requires an exact approval lease, a
  declared local sandbox, and an explicit policy profile.
- Long-running runs are bounded, visible, and cancellable. A 3h request means
  an explicit max-duration budget plus status, stop, resume, and final report.
- No production deploy, destructive migration, credential mutation, remote
  server mutation, billing, account, or DNS action without explicit approval.
- Secrets are requested as references only, never raw values.
- Non-interactive provider execution must preserve prompts through a permission
  prompt bridge. Network, MCP, remote mutation, and sensitive-file access fail
  closed unless approved for the exact target and scope.
- CI-readonly and CI-verify profiles are no-tty safe: approval-dependent
  mutations exit as blocked states with exact required approval instead of
  prompting.
- The stop command only terminates loop-owned processes tracked by the
  side-effect ledger.
- Scope expansion is a stop condition unless it carries user approval, a
  tradeoff, verification, rollout, and rollback.

## Local CLI

```bash
npm run supervibe:loop -- --dry-run --request "validate integrations"
npm run supervibe:loop -- --happy-path --plan .supervibe/artifacts/plans/example.md
npm run supervibe:loop -- --dry-run --request "validate integrations" --notify terminal,inbox
npm run supervibe:loop -- --defer task-123 --until 2026-05-01T09:00:00Z --file .supervibe/memory/work-items/<epic-id>/graph.json
npm run supervibe:loop -- --create-work-item --title "Fix checkout bug" --template bug --dry-run
npm run supervibe:loop -- --atomize-plan .supervibe/artifacts/plans/example.md --preview
npm run supervibe:eval -- --case plan-review-loop
npm run supervibe:loop -- graph --file .supervibe/memory/loops/<run-id>/state.json --format dot
npm run supervibe:loop -- doctor --file .supervibe/memory/loops/<run-id>/state.json
npm run supervibe:loop -- prime --file .supervibe/memory/loops/<run-id>/state.json
npm run supervibe:loop -- --export-sync-bundle .supervibe/memory/loops/<run-id> --out .supervibe/memory/bundles/<run-id>-sync
npm run supervibe:context-pack -- --file .supervibe/memory/work-items/<epic-id>/graph.json --item T1
npm run supervibe:ui -- --file .supervibe/memory/work-items/<epic-id>/graph.json
npm run supervibe:gc -- --all --dry-run
```
