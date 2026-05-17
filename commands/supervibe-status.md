---
description: >-
  Use WHEN checking Supervibe health, work-item watch state, delegated inbox, or
  tracker visibility, dashboard output, external integration readiness, saved
  views, structured queries, interactive status palette, or local work reports
  or eval reports TO show a read-only project status report.
last-verified: "2026-05-10"
---

# /supervibe-status

Status outputs are covered by scenario evals for broken RAG/index repair. When
index health is requested, include the gate result, repair command and explicit
next action rather than only raw counts.

Shows local index health, preview servers, MCP discovery, task tracker mapping,
read-only work-item watch snapshots, delegated inbox blockers, agent telemetry,
dashboard output, and external integration readiness.
It can also filter large work-item graphs with safe structured queries, apply
saved views, and render local redacted daily/weekly/SLA reports.

## Invocation

```bash
/supervibe-status
/supervibe-status --dashboard --file .supervibe/memory/loops/<run-id>/state.json --out .supervibe/memory/loops/<run-id>/dashboard.html
/supervibe-status --integrations
/supervibe-status --integrations --json
/supervibe-status --view ready-now --file .supervibe/memory/work-items/<epic-id>/graph.json
/supervibe-status --ready --blocked --stale --orphan --file .supervibe/memory/work-items/<epic-id>/graph.json
/supervibe-status --query "status:blocked label:integration sort:age" --file .supervibe/memory/work-items/<epic-id>/graph.json
/supervibe-status --save-view release-risk --query "risk:high status:not-done" --views-file .supervibe/memory/work-item-views.json
/supervibe-status --report daily --file .supervibe/memory/work-items/<epic-id>/graph.json
/supervibe-status --report sla --file .supervibe/memory/work-items/<epic-id>/graph.json --out .supervibe/memory/reports/sla.md
/supervibe-status --interactive
/supervibe-status --eval-report
/supervibe-status --eval-report --file .supervibe/audits/autonomous-loop-evals/latest-report.json --json
/supervibe-status --policy
/supervibe-status --policy --policy-profile CI-readonly --json
/supervibe-status --role
/supervibe-status --anchors --file src/example.ts
/supervibe-status --waves --file .supervibe/memory/loops/<run-id>/state.json
/supervibe-status --assignment task-123 --file .supervibe/memory/loops/<run-id>/state.json
```

`--dashboard` writes a static offline HTML run dashboard from an existing loop
state file. It redacts local paths, secrets, and raw prompt text before writing.

`--integrations` reports detected local integration capabilities. Network-backed
integrations stay advisory unless an explicit policy approval and allowlisted
target are present; native JSON graph support is always the safe fallback.

`--query` accepts only whitelisted local filters and sort keys such as
`status`, `label`, `priority`, `owner`, `package`, `worktree`, `repo`, `due`,
`stale`, `blocked-reason`, `verification`, and `risk`. It never evaluates code.

`--view` applies built-in or custom saved views. Built-ins include `ready-now`,
`blocked`, `review-needed`, `stale-claims`, `due-soon`, `overdue`, `high-risk`,
`release-gates`, `my-work`, `unowned-work`, and `cross-repo-blockers`.

`--report daily|weekly|sla` renders local markdown summaries with done work,
blocked work, next ready work, risk changes, stale claims, review requests,
release gates, due state, aging, and SLA status. Reports redact secrets, local
user paths, and raw prompts before printing or writing.

`--interactive` opens the opt-in command palette only when a real terminal is
available. In CI, pipes, and agent subprocesses it prints
`SUPERVIBE_INTERACTIVE_FALLBACK` with the equivalent non-interactive command and
exits without mutation.

`--eval-report` prints the latest local autonomous-loop replay eval report.
Reports include replay pass/fail, quality scorecard averages, golden diffs, and
top regressions. They are local artifacts and do not run live tools.

`--policy` prints the active local policy profile, including allowed tools,
denied tools, network/MCP/write modes, runtime limits, and validation issues.
`--role` prints team governance for the current role: storage location, branch
policy, allowed sync, review requirement, metadata visibility, and mutation
permission. Both are read-only and no-tty safe.

`--anchors --file <source>` parses optional semantic anchors from one source
file and prints anchor IDs, file coverage, and verification coverage. It does
not write indexes or edit comments.

`--waves` rebuilds read-only execution wave status from a loop or work-item
state file, including current wave, next serialized work, blockers, and missing
reviewer/worktree conditions. `--assignment <task-id>` prints the stored
assignment explanation for one task: why the worker/reviewer were selected,
which alternatives were rejected, and what evidence the handoff must include.

The work-item watch and delegated inbox sections are observational. They do not
claim, close, or mutate tasks.

Default status also detects the active native work-item graph and prints
`SUPERVIBE_ACTIVE_WORK_GRAPH` with `NEXT_ACTION`, ready work, blocked work,
stale claims, orphaned evidence, and terminal counts. Use `--ready`, `--blocked`,
`--stale`, and `--orphan` to include focused rows for the current graph or the
graph passed with `--file`.

## Work Graph Command Compatibility

| Command | Status responsibility | Graph mutation allowed | Preferred next command | Exit states surfaced |
| --- | --- | --- | --- | --- |
| `/supervibe-plan` | Show loop-ready plan, optional review, unatomized plan, or handoff state when plan artifacts are referenced. | No | `/supervibe-loop --atomize-plan <plan> --user-approved-plan` or optional `/supervibe-plan --review <plan>` | `plan-ready`, `review-optional`, `blocked` |
| `/supervibe-loop` | Show active graph, run state, assignments, claims, blockers, evidence, archive candidates, and resume/stop commands. | No | `/supervibe-loop --file <graph.json>`, `--claim-ready`, `--validate-completion`, or `--close-eligible` | `ready`, `running`, `blocked`, `awaiting-user-acceptance`, `complete`, `failed` |
| `/supervibe-status` | Provide read-only summary, saved views, reports, dashboards, queries, policy, role, anchors, waves, and assignment explanations. | No, except explicit report/dashboard/view writes. | The single `NEXT_ACTION` printed in the status block. | `ok`, `warnings`, `blocked`, `failed` |

Command contract notes:
- Status is the read-only compatibility layer between plan and loop commands; it must not claim, close, reopen, skip, cancel, sync, or atomize work.
- Every graph-aware status block must include graph path, detected source, lifecycle state, ready/blocked/stale/orphan counts, evidence gaps, and one exact next command or `none`.
- If both a plan artifact and a graph artifact are visible, status must prefer the active graph for execution state and report the plan only as provenance or missing-review context.
- Missing or stale graph evidence exits as `blocked` or `warnings` with a repair command, not as successful completion.

## Output Contract

```text
SUPERVIBE_STATUS
MODE: standard | dashboard | integrations | query | report | policy | role | anchors | waves
READ_ONLY: true
STATUS: ok | warnings | blocked | failed
SECTIONS: <comma-separated sections rendered>
NEXT_ACTION: <single recommended command or none>
```

## Safety Boundaries

- Default status is read-only and no-tty safe.
- Dashboard, report, view, and eval outputs write only explicitly requested
  local artifacts under `.supervibe/memory/` or `.supervibe/audits/`.
- Queries use whitelisted filters only and never evaluate code.
- Network-backed integrations remain advisory unless an explicit policy approval
  and allowlisted target are present.

## Agent Orchestration Contract

This command must load its executable profile from `scripts/lib/command-agent-orchestration-contract.mjs` and follow `rules/command-agent-orchestration.md`. The profile is the source of truth for `ownerAgentId`, `agentPlan`, `requiredAgentIds`, dynamic specialist selection, default `real-agents` mode, and `agent-required-blocked` behavior.

Normal status inspection is read-only and must not expose command-agent plans, scoped receipt gates, or validator rituals as a prerequisite. Use `node <resolved-supervibe-plugin-root>/scripts/command-agent-plan.mjs --command /supervibe-status` only for explicit strict delegation/release evidence paths or when claiming that named specialist agents produced durable output.

When specialist output is claimed, invoke the real host agents and issue runtime receipts with `hostInvocation.source` and `hostInvocation.invocationId`. In Codex, use `spawn_agent` for explicit reviewer/worker claims and record the returned Codex agent id before issuing receipts. `inline` remains diagnostic/dry-run only; command or skill receipts do not substitute for agent, worker, or reviewer output.
## Workflow Invocation Receipts

Any claim that this command invoked another Supervibe command, skill, agent, reviewer, worker, validator, or external tool must be backed by a runtime-issued workflow receipt created with `node <resolved-supervibe-plugin-root>/scripts/workflow-receipt.mjs issue ...`. Hand-written receipts are untrusted. Agent, worker, and reviewer receipts must include `hostInvocation.source` and `hostInvocation.invocationId` from a real host dispatch; command or skill receipts must not substitute for specialist output. Scoped current-run receipts are required for active command/handoff claims; old global receipts are diagnostic only and cannot authorize a new agent-owned output. Durable specialist/release artifacts produced by this command stay linked through `.supervibe/memory/workflow-invocation-ledger.jsonl` and `artifact-links.json`; run `npm run validate:workflow-receipts` and `npm run validate:agent-producer-receipts` only in explicit verification, strict review, or release gates.

<!-- supervibe-release-operational-markers:start -->
Release-gate operational markers: before durable agent-owned work or completion claims, run `node <resolved-supervibe-plugin-root>/scripts/command-agent-plan.mjs --command /supervibe-status` and follow the printed `SUPERVIBE_COMMAND_AGENT_PLAN`. The executable `scripts/lib/command-agent-orchestration-contract.mjs` profile and `rules/command-agent-orchestration.md` remain the source of truth for `ownerAgentId`, `agentPlan`, `requiredAgentIds`, dynamic specialist selection, default `real-agents` mode, and `agent-required-blocked` behavior. The plan must show `CALLABLE_AGENT_SOURCES`, `CALLABLE_AGENTS_READY`, `SCOPED_RECEIPT_GATE`, and `MISSING_CALLABLE_AGENTS` before any agent-owned artifact is claimed.

Invoke real host agents when specialist output is claimed and issue runtime receipts with `hostInvocation.source` and `hostInvocation.invocationId`. For Codex, use `spawn_agent` according to `CODEX_SPAWN_PAYLOAD_RULES` and `CODEX_SPAWN_PAYLOADS`: forked payloads must set `fork_context=true`, must omit `agent_type`, `model`, and `reasoning_effort`, and must encode the Supervibe logical role in the message. Record each returned Codex agent id with `node <resolved-supervibe-plugin-root>/scripts/agent-invocation.mjs log ...` before receipts are issued. `inline` is diagnostic/dry-run only. Do not emulate specialist agents, and command or skill receipts must not substitute for agent, worker, or reviewer output.
<!-- supervibe-release-operational-markers:end -->
