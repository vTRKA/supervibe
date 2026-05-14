---
description: >-
  Use WHEN running an autonomous loop, epic, atomic work queue, goal-until-complete
  session, or separate worktree TO perform provider-safe policy preflight,
  goal-bounded execution, status, resume, stop, side-effect ledger, and cleanup
  gates. Triggers: 'loop', 'epic', 'worktree', 'goal-complete', 'эпик'.
last-verified: "2026-05-10"
---

# /supervibe-loop

Run a goal-until-complete autonomous loop for a user plan or open request. The
command is observable, cancellable, policy-gated, and blocked below a 9/10 task
score.
For large specs, the loop must preserve the full MVP readiness path from discovery to
production release: MVP slice, phased implementation, verification, release
gate, rollback, support owner, and post-release learning.

## Invocation

Primary path:

```bash
/supervibe-loop --atomize-plan .supervibe/artifacts/plans/payment-integration.md --plan-review-passed
/supervibe-loop --from-plan .supervibe/artifacts/plans/payment-integration.md --atomize --dry-run
/supervibe-loop --file .supervibe/memory/work-items/<epic-id>/graph.json --guided
/supervibe-loop --validate-completion --file .supervibe/memory/work-items/<epic-id>/graph.json
/supervibe-loop --validate-completion --file .supervibe/memory/work-items/<epic-id>/graph.json --require-trusted-evidence --trusted-receipts <id,id>
/supervibe-loop --close-eligible --file .supervibe/memory/work-items/<epic-id>/graph.json
/supervibe-loop --from-prd .supervibe/artifacts/specs/checkout.md --dry-run
/supervibe-loop --request "validate code and fix integration bugs"
/supervibe-loop --happy-path --plan .supervibe/artifacts/plans/payment-integration.md
/supervibe-loop --request "finish onboarding design and wire it into app" --max-loops 20
/supervibe-loop --guided
/supervibe-loop --epic SV-123 --worktree
/supervibe-loop --epic SV-123 --worktree --assigned-task T1 --assigned-write-set src/auth.ts
/supervibe-loop --worktree-existing .worktrees/loop-upgrade --resume-session session-loop-upgrade
/supervibe-loop --worktree-status
/supervibe-loop --watch --file .supervibe/memory/work-items/<epic-id>/graph.json
/supervibe-loop --quickstart
/supervibe-loop --onboard
/supervibe-loop --tracker-prime
/supervibe-loop --completion bash
npm run supervibe:task-graph-maturity
/supervibe-loop --claim task-123 --file .supervibe/memory/work-items/<epic-id>/graph.json
/supervibe-loop --claim-ready --file .supervibe/memory/work-items/<epic-id>/graph.json
/supervibe-loop --close task-123 --reason "verified" --file .supervibe/memory/work-items/<epic-id>/graph.json
/supervibe-loop --edit task-123 --title "Updated title" --file .supervibe/memory/work-items/<epic-id>/graph.json
/supervibe-loop --split task-123 --titles "Subtask A,Subtask B" --file .supervibe/memory/work-items/<epic-id>/graph.json --preview
/supervibe-loop --reparent task-123 --parent <epic-or-task-id> --file .supervibe/memory/work-items/<epic-id>/graph.json
/supervibe-loop --dep-add task-123 --to task-456 --file .supervibe/memory/work-items/<epic-id>/graph.json
/supervibe-loop --delete task-123 --file .supervibe/memory/work-items/<epic-id>/graph.json --preview
/supervibe-loop --validate-completion --file .supervibe/memory/work-items/<epic-id>/graph.json
/supervibe-loop --close-eligible --file .supervibe/memory/work-items/<epic-id>/graph.json
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
/supervibe-loop --require-user-acceptance --request "validate integrations"
/supervibe-loop --accept-goals --file .supervibe/memory/loops/<run-id>/state.json --accepted-by <name>
/supervibe-loop --reject-goals --file .supervibe/memory/loops/<run-id>/state.json --feedback "what is missing"
/supervibe-loop --fork-checkpoint --file .supervibe/memory/loops/<run-id>/state.json
/supervibe-loop --status --epic example-epic
/supervibe-loop --resume .supervibe/memory/loops/<run-id>/state.json
/supervibe-loop --status --file .supervibe/memory/loops/<run-id>/state.json
/supervibe-loop --status --file .supervibe/memory/work-items/<epic-id>/graph.json --auto-ui
/supervibe-loop --status --file .supervibe/memory/work-items/<epic-id>/graph.json --auto-ui-dry-run --ui-port 3057
/supervibe-loop --status --file .supervibe/memory/work-items/<epic-id>/graph.json --auto-ui --no-auto-ui
/supervibe-loop --stop <run-id>
```

Advanced diagnostics:

```bash
/supervibe-loop --readiness --plan .supervibe/artifacts/plans/payment-integration.md
/supervibe-loop --atomize-plan .supervibe/artifacts/plans/payment-integration.md --preview
/supervibe-loop --plan .supervibe/artifacts/plans/payment-integration.md --allow-flat-plan --dry-run
/supervibe-loop --graph --file .supervibe/memory/loops/<run-id>/state.json --format text
/supervibe-loop graph --file .supervibe/memory/loops/<run-id>/state.json --format mermaid
/supervibe-loop doctor --file .supervibe/memory/loops/<run-id>/state.json
/supervibe-loop doctor --file .supervibe/memory/loops/<run-id>/state.json --fix
/supervibe-loop prime --file .supervibe/memory/loops/<run-id>/state.json
/supervibe-loop export --file .supervibe/memory/loops/<run-id>/state.json --out .supervibe/memory/bundles/<run-id>
/supervibe-loop import --file .supervibe/memory/bundles/<run-id> --out .
/supervibe-loop --tracker-sync-push --file .supervibe/memory/work-items/<epic-id>/graph.json
/supervibe-loop --tracker-sync-push --tracker memory --file .supervibe/memory/work-items/<epic-id>/graph.json
/supervibe-loop --tracker-sync-pull --file .supervibe/memory/work-items/<epic-id>/graph.json
/supervibe-loop --tracker-doctor --file .supervibe/memory/work-items/<epic-id>/graph.json --fix
/supervibe-loop --tracker-prime --json
/supervibe-loop --export-sync-bundle .supervibe/memory/loops/<run-id> --out .supervibe/memory/bundles/<run-id>-sync
/supervibe-loop --import-sync-bundle .supervibe/memory/bundles/<run-id>-sync --dry-run
/supervibe-loop --eval --case plan-review-loop --out .supervibe/audits/autonomous-loop-evals/latest-report.json
/supervibe-loop --provider-matrix
```

Plan atomization:

```bash
/supervibe-loop --atomize-plan .supervibe/artifacts/plans/example.md --dry-run
/supervibe-loop --atomize-plan .supervibe/artifacts/plans/example.md --plan-review-passed
```

Atomization converts one reviewed plan into one epic, child work items, blocker edges, soft related links, gate items, and follow-ups. Writes require `--plan-review-passed` plus a validated plan-review artifact with `evidenceGatePass:true`, real-agent reviewer coverage, scoped runtime receipts carrying `hostInvocation.source` and `hostInvocation.invocationId`, and a Next User Decision; `--dry-run` previews the graph without writing. A reviewed plan with no parseable task/work-item structure must fail closed: the command exits non-zero and does not write `graph.json`, previews, registry entries, or tracker sync state unless an explicit invalid-graph override is used by a diagnostic tool.
Generated work items use reusable templates for feature, bugfix, refactor, UI story, integration, migration, documentation, release-prep, production-prep, and research spike work. Items carry labels, severity, owner/component/stack fields, required gates, verification hints, comments, and optional repo/package/workspace/subproject routing metadata.
Production-oriented plans also generate release, observability, rollback,
security/privacy, and post-release learning work items so the loop does not
stop after a code-only slice.

After atomization or a dry-run preview, print `NEXT_USER_ACTIONS[]` and wait for one choice before execution:
- **Inspect generated epic/work items** - show graph status, blockers, owners, and verification gates.
- **Revise atomization** - change task boundaries, dependencies, labels, or excluded scope before execution.
- **Run another review** - send the reviewed plan or generated work graph back through specialist review.
- **Start guided execution** - run `/supervibe-loop --guided` only after review and atomization evidence is accepted.
- **Keep work graph and stop** - save the result without starting execution.

Do not treat `--plan-review-passed` as permission to execute. It only permits atomization from a reviewed plan with trusted current-run reviewer receipts. Starting guided, manual, fresh-context, worktree, version bump, commit, push, cleanup, or plan deletion still requires the current visible user-choice gate to be answered after the generated work graph is shown. Manual and guided modes are queue-control modes, not durable producer/reviewer/worker evidence. Subagent batches or inline controller summaries are diagnostic only unless they are bound to real host-agent invocation ids and scoped runtime receipts for the current run.

Repair paths:

- Invalid plan repair: when atomization cannot derive a valid epic/task/subtask graph, revise the reviewed plan or rerun `--atomize-plan <plan> --preview`; do not write `graph.json` until the plan has parseable work items and `--plan-review-passed`.
- Graph drift repair: run `/supervibe-status --ready --blocked --stale --orphan --file <graph.json>`, then repair dependency cycles, stale claims, orphaned evidence, ownership gaps, or worktree assignment drift before continuing.
- Completion blocker repair: run `/supervibe-loop --validate-completion --file <graph.json>` or `/supervibe-loop --close-eligible --file <graph.json>` to list blockers, attach production or dry-run evidence, then rerun close validation. `--require-trusted-evidence --trusted-receipts <id,id>` requires runtime-issued receipts; `--allow-dry-run-evidence` and `--no-evidence-required` are explicit diagnostic overrides, not default completion.
- Task graph maturity repair: run `npm run supervibe:task-graph-maturity` for capability maturity, or `node scripts/supervibe-task-graph-maturity.mjs --require-active-graph` when the current project must already have an active graph. The generic agent maturity gate does not replace this task-graph-specific score.
- Tracker sync repair: if sync reports `invalid-mapping`, run `/supervibe-loop --tracker-doctor --file <graph.json> --fix`; if it reports `partial-sync`, keep the generated mapping file, repair the external adapter failure, and rerun the same sync push. Diagnostics redact token, secret, password, authorization, and API-key fields before printing or bundling.

Durable tracker sync:

```bash
/supervibe-loop --tracker-sync-push --file .supervibe/memory/work-items/<epic-id>/graph.json
/supervibe-loop --tracker-sync-push --tracker cli --tracker-command supervibe-task --file .supervibe/memory/work-items/<epic-id>/graph.json
/supervibe-loop --tracker-sync-pull --file .supervibe/memory/work-items/<epic-id>/graph.json
/supervibe-loop --tracker-doctor --file .supervibe/memory/work-items/<epic-id>/graph.json
/supervibe-loop --tracker-prime
```

The native graph remains canonical. External CLI or MCP trackers are optional,
but when an adapter is configured the loop reconciles ready work with the
tracker, mirrors claims, includes tracker state in `contextPack.workflowSignal`,
and closes mapped work only with verification evidence. If no adapter is
available, sync falls back to the native JSON graph and writes a reversible
mapping at `.supervibe/memory/loops/task-tracker-map.json`. `--tracker-prime`
prints the compact ready, claimed, blocked, and next-action context used by
session and prompt hooks.

External ecosystem integration stays provider-safe by default. `--notify` can
route completion and failure events to terminal and delegated inbox targets.
Webhook notification is disabled unless the target is allowlisted and covered by
an explicit policy approval. Federated sync bundles export redacted graph,
status, comments, evidence, tracker mapping, and checksums into a portable local
directory; import currently supports `--dry-run` validation and conflict
reporting without mutating remote systems.

Executing `/supervibe-loop --file <graph.json>` treats the native work-item graph
as the canonical queue. Loop task status, claims, verification evidence, and
completion semantics are synced back into that graph so status, UI, resume, and
worktree sessions see the same source of truth. Completion output includes
`COMPLETION_SEMANTICS`, `PRODUCTION_READY`, and `NEXT_COMPLETION_ACTION` when
the validator can derive them from the graph and run state. Then print a
human-first Decision Card before raw machine handoff state. The card must offer
`/supervibe-verify`, `/supervibe-review`, continue loop, revise goals, and
stop-with-gaps choices. It must not offer `/supervibe-ship` directly from
loop-completion; ship appears only after review has passed or an approved waiver
covers the review gate.

Saved views and reports are handled by `/supervibe-status`. Local task control
is handled by `/supervibe-loop --claim-ready|--claim|--close|--complete|--reopen|--edit|--split|--reparent|--dep-add|--dep-remove|--skip|--cancel|--delete`
against the native `graph.json`. Destructive delete requires preview, dry-run,
`--yes`, or `--force`; every mutation writes an audit event, and non-dry writes
create a graph backup. Skip and cancel require both a reason and an impact so
completion validation can prove the user goal still holds. Deferred work uses
`/supervibe-loop --defer <item> --until <timestamp> --file <graph.json>` and remains visible in status,
dashboard, query results, and SLA reports. No background daemon is required; due
work is re-evaluated deterministically when a status, dashboard, report, or
scheduler check runs.

For visual inspection, `/supervibe-ui` can open the same `graph.json` and loop
`state.json` in a localhost control plane. It previews context packs, waves,
reports, GC candidates, and safe local actions without changing the canonical
JSON graph unless the user previews and explicitly applies a local mutation.
For long loop or worktree sessions, `--auto-ui` on `--status` starts the same
localhost-only control plane as a visible sidecar and prints the URL, PID, logs,
and graph path. `--auto-ui-dry-run` alone prints the exact
`npm run supervibe:ui --` daemon command without spawning a process, which is
the safe mode for tests, headless sessions, and operator review. `--no-auto-ui`
is an explicit opt-out and suppresses UI output even when `--auto-ui` was added
by a preset or wrapper.

Closed work graphs are reported as `ARCHIVE_CANDIDATE: true` and
`LIFECYCLE: completed-awaiting-archive` when all required work is terminal and
the graph has not already been archived. That label is an operational lifecycle
signal; production completion still depends on the completion validator and
trusted evidence gates.

Interactive mode is opt-in. `/supervibe-loop --create-work-item --interactive`
uses guided terminal forms when a real TTY exists; otherwise it prints a
`SUPERVIBE_INTERACTIVE_FALLBACK` command and exits without mutation. Guided
forms validate template, title, owner, priority, labels, acceptance criteria,
verification hints, dependencies, due date, and risk before any write. `--preview`
and `--dry-run` show redacted before/after state for create, import, atomize,
defer, claim, close, edit, split, reparent, dependency, skip, cancel, and delete
actions. `--yes` is limited to safe local actions and cannot approve provider,
network, production, webhook, or risky operations.

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
builds a goal-scoped wave plan from ready work, dependency state, write-set overlap,
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
/supervibe-loop --guided
/supervibe-loop --epic <epic-id> --worktree
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
/supervibe-loop --request "validate integrations"
/supervibe-loop --file .supervibe/memory/work-items/<epic-id>/graph.json
/supervibe-loop --dry-run --request "validate integrations"
/supervibe-loop --guided --file .supervibe/memory/work-items/<epic-id>/graph.json
/supervibe-loop --manual --file .supervibe/memory/work-items/<epic-id>/graph.json
/supervibe-loop --fresh-context --tool codex --file .supervibe/memory/work-items/<epic-id>/graph.json
/supervibe-loop --fresh-context --tool codex --allow-spawn --permission-prompt-bridge --file .supervibe/memory/work-items/<epic-id>/graph.json
/supervibe-loop --commit-per-task --fresh-context --tool codex --file .supervibe/memory/work-items/<epic-id>/graph.json
/supervibe-loop --dry-run --tracker memory --request "validate integrations"
/supervibe-loop --fresh-context --tool codex --tracker cli --tracker-command supervibe-task --file .supervibe/memory/work-items/<epic-id>/graph.json
/supervibe-loop --provider-matrix
```

The provider capability matrix is the single source of truth for loop
execution across hosts. Claude, Codex, Gemini, and OpenCode currently expose
fresh-context adapters with explicit headless mode, context-forking strategy,
permission-prompt bridge requirement, spawn receipt requirement, and
allow-spawn requirement. Cursor and Copilot are package/docs-supported but
degrade to guided or manual execution until portable fresh-context adapters
exist. Codex can use native goal workflows when available, Claude can use
supported hook continuations, and every host keeps the
Supervibe state files, receipt gates, quality gates, and stop/resume/status
commands as the portable baseline.

Bare loop execution defaults to the selected provider's recommended real mode.
For Codex, Claude, Gemini, and OpenCode this is fresh-context execution; without
a real provider adapter the fallback is guided mode so the local deterministic
stub cannot produce fake production completion. Pass `--dry-run` only when a
preview/compatibility artifact is intentional.

Fresh-context execution from a provider CLI is provider-safe and fail-closed. A
true headless loop needs a configured provider CLI command (`codex`, `claude`,
`gemini`, or `opencode`, or `--adapter-command <command>`), visible external
adapter process tracking, and the permission-prompt bridge so non-interactive
execution preserves provider permission prompts instead of bypassing them. Bare
provider loops enable those runtime defaults; the flags remain available for
explicit scripts and diagnostics. Each spawned worker must also emit runtime
workflow receipts for the external adapter and any delegated
agent/reviewer/validator output. If policy or configuration is incomplete the
command must stop with the provider permission status and print a status/resume
artifact instead of pretending to run autonomously.

Durable loop work is real-agent owned. A worker, reviewer, validator, epic, task
graph, completion, or external-adapter output cannot be satisfied by a manual
note, controller-authored summary, command receipt, skill receipt, or stale
global receipt; it needs the current run's scoped runtime receipt bound to the
named host-agent invocation and output artifact.

## Contract

- Build a task queue from a reviewed work-item graph or request. Direct plan execution is legacy diagnostic-only; reviewed plans must atomize into a graph before guided, manual, fresh-context, or worktree execution.
- Run preflight for scope, autonomy, optional explicit budgets, environment, MCP/tool permissions,
  access needs, and approval boundaries.
- Apply Scope Safety Gate before atomization or execution: each task must map
  to approved scope or an explicit user-approved scope change; optional extras
  are deferred or rejected with rationale instead of silently built.
- Run provider permission audit before non-dry execution. The audit records the
  effective permission mode, denied tools, prompt-required tools, rate-limit
  state, network/MCP approval state, and next safe action.
- Dispatch named real-agent specialist chains by task type and bind their outputs to runtime receipts.
- Keep structured handoffs, scores, audit events, side-effect ledger entries,
  and a final report under `.supervibe/memory/loops/<run-id>/`.
- Include `contextPack.workflowSignal` in each handoff and fresh-context prompt
  so the worker and reviewer see the current epic/task phase, claim,
  gate, and next action before acting.
- When a tracker adapter is configured, include `contextPack.workflowSignal.tracker`
  so workers see reconciled ready counts, mapping status, claim source, and
  tracker-blocked work before editing.
- Include Retrieval Quality and Graph Quality Gates in fresh-context handoffs
  so workers see source citations, rerank/fallback status, semantic anchors,
  graph warnings, symbol coverage, and edge-resolution caveats before editing.
- Include a visual status summary in long-run reports as a text-first stage map,
  compact table, or improvised ASCII scheme listing ready, blocked, review,
  done, open gates, release blockers, and rollback owner. Mermaid output and
  `/supervibe-ui` links are optional fallbacks, not required for ordinary
  status summaries.
- Treat task score below 9.0 as incomplete.
- Continue by default until user goals are complete. Stop only for policy,
  explicit budget, missing access, production approval, cancellation, state
  migration, unapproved scope expansion, verification failure, no-progress, or
  side-effect reconciliation.
- Distinguish system acceptance from user goal acceptance. A run can pass all
  internal gates and still stop as `AWAITING_USER_ACCEPTANCE` until the user
  confirms the goals, rejects them with feedback, or forks a checkpoint for a
  new direction. Non-dry execution requires this confirmation by default; dry
  runs can opt in with `--require-user-acceptance`.
- Rejected user goal acceptance must not be treated as complete. It becomes
  `REPLAN_REQUIRED` and should use `--fork-checkpoint` before changing goals,
  tasks, or flow direction.

## Continuation Contract

Do not stop after the first task or wave if there is still ready work and no blocker. The loop should continue ready work until the user goals are complete, a configured max-duration/max-iteration/provider budget is reached, a policy or approval gate blocks progress, verification fails, no-progress policy fires, or the user explicitly stops/pauses. If no explicit budget is configured, the default run is not time-limited.

Wave reviews are checkpoints, not default terminal states. If a wave passes and more tasks are ready, continue to the next wave or print the exact blocker that prevents continuation. Final output must distinguish "finished all available work" from "paused by gate/budget/user".
Final completion also requires the user goal acceptance state to be approved
when required. If the user rejects the result, preserve the original state and
fork a checkpoint for replan instead of overwriting the completed evidence.

## Topic Drift / Resume Contract

If the user shifts topic while `.supervibe/memory/loops/<run-id>/state.json`, `contextPack.workflowSignal`, or a queued handoff exists, do not silently drop the loop. Surface run id, current phase, active task or wave, artifact path, next command, stop command, and blocker, then ask one `Step N/M` or `Step N/M` resume question with these choices: continue ready work, skip/delegate safe non-final decisions to the controller and continue, pause current loop and switch topic, or stop/archive the current state.

Skipped or delegated decisions must be recorded in loop state, side-effect ledger, and final report. They cannot bypass policy, explicit budget, approval, production, destructive-operation, review, verification, or scope-expansion gates. For production-ready completion, `/supervibe-ship` is blocked until `/supervibe-verify` and `/supervibe-review` evidence exists, unless the skipped gate has explicit waiver or skip evidence with approval, affected goal/stage, and release impact.

## Safety Boundaries

- No provider bypass, rate-limit bypass, hidden background automation, or broad
  shell allowlist.
- Dangerous provider flags such as `--dangerously-skip-permissions`,
  `--bypass-permissions`, `--all-tools`, and `bypassPermissions` are blocked by
  default. A narrow test-only override requires an exact approval lease, a
  declared local sandbox, and an explicit policy profile.
- Long-running runs are goal-bounded, visible, and cancellable. They are not
  time-limited by default; a 3h request means an explicit max-duration budget
  plus status, stop, resume, and final report.
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
npm run supervibe:loop -- --fresh-context --tool codex --allow-spawn --permission-prompt-bridge --request "validate integrations"
npm run supervibe:loop -- --dry-run --request "validate integrations" --notify terminal,inbox
npm run supervibe:loop -- --claim task-123 --file .supervibe/memory/work-items/<epic-id>/graph.json
npm run supervibe:loop -- --split task-123 --titles "Subtask A,Subtask B" --file .supervibe/memory/work-items/<epic-id>/graph.json --preview
npm run supervibe:loop -- --defer task-123 --until 2026-05-01T09:00:00Z --file .supervibe/memory/work-items/<epic-id>/graph.json
npm run supervibe:loop -- --create-work-item --title "Fix checkout bug" --template bug --dry-run
npm run supervibe:loop -- --atomize-plan .supervibe/artifacts/plans/example.md --preview
npm run supervibe:eval -- --case plan-review-loop
npm run supervibe:loop -- graph --file .supervibe/memory/loops/<run-id>/state.json --format dot
npm run supervibe:loop -- doctor --file .supervibe/memory/loops/<run-id>/state.json
npm run supervibe:loop -- prime --file .supervibe/memory/loops/<run-id>/state.json
npm run supervibe:loop -- --tracker-prime
npm run supervibe:loop -- --dry-run --tracker memory --request "validate integrations"
npm run supervibe:loop -- --accept-goals --file .supervibe/memory/loops/<run-id>/state.json --accepted-by <name>
npm run supervibe:loop -- --reject-goals --file .supervibe/memory/loops/<run-id>/state.json --feedback "what is missing"
npm run supervibe:loop -- --fork-checkpoint --file .supervibe/memory/loops/<run-id>/state.json
npm run supervibe:loop -- --export-sync-bundle .supervibe/memory/loops/<run-id> --out .supervibe/memory/bundles/<run-id>-sync
npm run supervibe:context-pack -- --file .supervibe/memory/work-items/<epic-id>/graph.json --item T1
npm run supervibe:ui -- --file .supervibe/memory/work-items/<epic-id>/graph.json
npm run supervibe:gc -- --all --dry-run
```

## Agent Orchestration Contract

This command must load its executable profile from `scripts/lib/command-agent-orchestration-contract.mjs` and follow `rules/command-agent-orchestration.md`. The profile is the source of truth for `ownerAgentId`, `agentPlan`, `requiredAgentIds`, dynamic specialist selection, default `real-agents` mode, and `agent-required-blocked` behavior.

Before durable work or completion claims, run `node <resolved-supervibe-plugin-root>/scripts/command-agent-plan.mjs --command /supervibe-loop` and follow the printed `SUPERVIBE_COMMAND_AGENT_PLAN`. The plan must show host dispatch support, proof source, `AGENT_SELECTION_MODE`, required agents, `REQUIRED_AGENT_SOURCES`, `CALLABLE_AGENT_SOURCES`, `CALLABLE_AGENTS_READY`, `SCOPED_RECEIPT_GATE`, `MISSING_CALLABLE_AGENTS`, and durable-write permission before any agent-owned artifact is produced. Role sources must distinguish definition availability from host-callable availability: `REQUIRED_AGENT_SOURCES` may include `plugin-only`, but `CALLABLE_AGENT_SOURCES`, `CALLABLE_AGENTS_READY`, and `MISSING_CALLABLE_AGENTS` decide whether the selected host can actually invoke the role. Plugin-only definitions are not enough for a real-agent completion claim.

Invoke the real host agents named by the plan and issue runtime receipts with `hostInvocation.source` and `hostInvocation.invocationId`. For active workflows, build the plan with `--active --slug <slug> --handoff-id <handoff-id>`; `SCOPED_RECEIPT_GATE` must be trusted for the current run before durable agent-owned outputs are allowed. Old global receipts are diagnostic only and do not unlock a new command/handoff. In Codex, invoke with `spawn_agent` using the `CODEX_SPAWN_PAYLOAD_RULES` and `CODEX_SPAWN_PAYLOADS` printed by `command-agent-plan.mjs`: forked payloads must set `fork_context=true`, must omit `agent_type`, `model`, and `reasoning_effort`, and must encode the Supervibe logical role in `message` instead of Codex `agent_type`. Record each returned Codex agent id with `node <resolved-supervibe-plugin-root>/scripts/agent-invocation.mjs log ...` before receipts are issued. `inline` is diagnostic/dry-run only. Do not emulate specialist agents, and do not let command or skill receipts substitute for agent, worker, or reviewer output.
## Workflow Invocation Receipts

Any claim that this command invoked another Supervibe command, skill, agent, reviewer, worker, validator, or external tool must be backed by a runtime-issued workflow receipt created with `node <resolved-supervibe-plugin-root>/scripts/workflow-receipt.mjs issue ...`. Hand-written receipts are untrusted. Agent, worker, and reviewer receipts must include `hostInvocation.source` and `hostInvocation.invocationId` from a real host dispatch; command or skill receipts must not substitute for specialist output. Scoped current-run receipts are required for active command/handoff claims; old global receipts are diagnostic only and cannot authorize a new agent-owned output. Durable artifacts produced by this command must stay linked through `.supervibe/memory/workflow-invocation-ledger.jsonl` and `artifact-links.json`; run `npm run validate:workflow-receipts` and `npm run validate:agent-producer-receipts` before claiming the command, delegated stage, or produced artifact is complete.
