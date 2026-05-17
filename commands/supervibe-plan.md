---
description: >-
  Use AFTER approved brainstorm/spec OR WHEN planning is ready TO write one
  implementation plan. By default the plan should be loop-ready: epics, tasks,
  dependencies, acceptance checks, optional deeper review, and direct
  /supervibe-loop atomize handoff are in the plan artifact itself. A TODO-only
  draft is allowed only when the user chooses it explicitly.
last-verified: "2026-05-16"
---

# /supervibe-plan

Direct trigger for `supervibe:writing-plans`. The command turns an approved
brief/spec into one user-readable plan that can immediately become a loop graph
after user approval.

The normal path is simple:

```text
brainstorm/spec -> /supervibe-plan --loop-ready -> user approves -> /supervibe-loop --atomize-plan <plan> --user-approved-plan
```

Strict plan review still exists as an explicit strengthening step, but it is not
the default blocker for ordinary development.

## Planning Shape

Plan Scope Approval Gate: ask one `plan_delivery` question when the plan shape or delivery choice is ambiguous. Record the Current explicit user answer before saving a durable plan, atomizing work items, or offering execution. The visible choices must map to `NEXT_USER_ACTIONS[]`: create graph from this plan, revise plan, run deeper review, or keep draft and stop.

## Scope Safety Gate

Every plan must classify scope lines as include, defer, reject, or spike. Keep the loop-ready graph focused on included work, explain the tradeoff or concrete harm behind deferred/rejected scope, and avoid scope expansion unless the user accepts the cost.

`/supervibe-plan` uses one workflow with two output shapes, not two products.
If the user does not specify a shape, offer the choice once and recommend
loop-ready.

- `--loop-ready` (recommended): the plan includes epics, tasks, dependencies,
  write scopes, acceptance checks, risk notes, and the exact loop handoff.
- `--todo-only`: the plan is a lightweight TODO draft for discussion. It is not
  ready for loop until converted or rewritten as loop-ready.

Do not add extra review, atomization, execution, or handoff rituals between a
user-approved loop-ready plan and graph creation. If architecture/security/data
risk is high, run specialist review while drafting the same plan or offer an
explicit deeper review choice after the plan is shown.

## Work Graph Compatibility

| Command | Responsibility | Graph mutation | Normal handoff |
| --- | --- | --- | --- |
| `/supervibe-plan --loop-ready` | Write one approved implementation plan with epics/tasks ready for graph creation. | No | `/supervibe-loop --atomize-plan <plan> --user-approved-plan` |
| `/supervibe-plan --todo-only` | Write a lightweight discussion plan or TODO list. | No | Revise or convert to `--loop-ready` before loop. |
| `/supervibe-plan --review <plan>` | Optional strict/deeper plan review for risky or user-requested cases. | No | Either revise, stop, or atomize after user approval. |
| `/supervibe-loop` | Create and run the active work graph. | Yes | Dispatch the next ready task, including a single ready task. |

Command contract notes:

- A plan is still not a graph; only `/supervibe-loop` writes graph state.
- User approval of a loop-ready plan is enough for normal atomization.
- Reviewer receipts are evidence for explicit strict review or final release
  readiness, not the ordinary gate before graph creation.
- Every plan must preserve one resume cursor: plan path, selected shape,
  recommended next command, and stop reason.

## Invocation Forms

### `/supervibe-plan --loop-ready --from-brainstorm <spec-path>`

Canonical fast handoff after brainstorm. Produces a plan that can be approved
and atomized directly.

### `/supervibe-plan --loop-ready <spec-or-plan-path>`

Create or revise a loop-ready plan from an existing spec or plan.

### `/supervibe-plan --todo-only <spec-or-plan-path>`

Create a lightweight planning draft only. Do not offer loop execution until it
is converted to loop-ready.

### `/supervibe-plan --review <plan-path>`

Optional strict review. Use only when the user asks for reviewers, a regulated
or high-risk surface needs extra proof, or release governance requires it. This
path can still produce plan-review artifacts and runtime receipts, but it must
not be silently inserted into the normal plan-to-loop path.

### `/supervibe-plan` (no args)

Resolve the latest approved brainstorm/spec. If multiple candidates exist, ask
one short question. If no source exists, route to `/supervibe-brainstorm`.

## Procedure

1. Resolve the source brief/spec/plan.
2. Check whether the user requested `--loop-ready`, `--todo-only`, or strict
   `--review`. If ambiguous, ask one choice and recommend loop-ready.
3. Read relevant project memory, code search, and CodeGraph readiness when the
   plan claims architecture maturity. If no index evidence exists, record that
   limitation in the plan instead of blocking ordinary planning.
4. Draft one plan artifact. For loop-ready plans, include:
   - goal and non-goals
   - implementation phases
   - epics and tasks with stable ids
   - dependencies and blocked reasons
   - write scopes and likely files/modules
   - acceptance checks per task
   - risk notes and rollback notes
   - final verification and release gates as optional user outcomes
   - the exact atomization command
5. Show the user the plan, risk summary, and one next-choice card:
   - create graph from this plan
   - revise plan
   - run deeper review
   - keep TODO/draft and stop
6. When the user chooses graph creation, hand off to:

```text
/supervibe-loop --atomize-plan <plan-path> --user-approved-plan
```

Do not run tests, validators, receipt validation, or release checks during the
normal plan/graph development path. These expand later only if the user chooses
verification or release handoff.

Do not stop after individual plan phases: continue through source resolution, loop-ready drafting, user next choices, and exact graph handoff unless the user chooses stop, revision, or deeper review.

## Continuation Contract

Start with a pre-plan summary (`pre-plan` / `pre-plan-summary.json` when persisted), then show a compact plan-scope preview and one approve/revise/exclude-or-defer/stop choice when scope is ambiguous. After the user answers, write the full plan before handoff, then show a Post-plan summary with added-and-why, deferred-and-why, risk, table or ASCII map, and text-first summary. Include Exclude or defer items as an explicit option when scope is too broad. Expose `NEXT_USER_ACTIONS[]` as create graph from this plan, revise plan, run deeper review, or keep draft and stop. Emit `NEXT_STEP_HANDOFF` only as secondary resume state.

## Topic Drift / Resume Contract

If a saved plan, `NEXT_STEP_HANDOFF`, or workflow state exists and the user changes topic, surface the saved phase and ask whether to continue, skip/delegate safe non-final decisions, pause and switch topic, or stop/archive.

## Loop-Ready Plan Contract

A loop-ready plan must be parseable enough for graph creation without another
planning ritual. Use stable headings and ids:

If the plan cannot produce parseable epics and tasks, the handoff must
fail-closed instead of creating a vague fallback graph.

```text
## Epic E01: <title>
Goal: <outcome>
Depends on: <ids or none>

### Task T01: <title>
Parent: E01
Status: ready|blocked
Depends on: <ids or none>
Write scope: <paths/modules>
Acceptance: <checkable result>
Verification hint: <targeted command or manual check, deferred until requested>
Risk: <plain risk or none>
```

The plan can include reviewers as advisory contributors, but their output is
folded into the same plan unless the user explicitly asks for strict review.

## Output Contract

```text
=== Supervibe Plan ===
Shape:       loop-ready | todo-only
Source:      <path-or-summary>
Plan:        .supervibe/artifacts/plans/YYYY-MM-DD-<slug>.md
Epics:       <count or n/a>
Tasks:       <count or n/a>
Ready:       <count or n/a>
Blocked:     <count or n/a>
Risks:       <top risks>
Next:        create graph | revise | deeper review | stop
Handoff:     /supervibe-loop --atomize-plan <plan-path> --user-approved-plan
```

Keep raw handoff markers, receipt mechanics, validator commands, Code RAG /
CodeGraph maintenance, and internal artifact details out of normal user-facing
prose unless the user asks for details.

## When Not To Invoke

- Requirements are not understood enough to plan: route to `/supervibe-brainstorm`.
- The change is a trivial one-file edit: implement directly.
- The user asked only for exploratory alternatives: brainstorm first.

## Related

- `supervibe:writing-plans`
- `/supervibe-brainstorm`
- `/supervibe-loop`
- `docs/templates/plan-template.md`

## Agent Orchestration Contract

Load the executable profile from
`scripts/lib/command-agent-orchestration-contract.mjs`. For the default plan
path, start with the owner agent and add specialists only when the plan risk or
user request needs them. In Codex, active specialist work must still use real
host invocation ids and runtime receipts when a specialist output is claimed.

Plan review is optional strict work unless the user or risk gate asks for it.
Command, skill, agent, reviewer, validator, or external-tool invocation claims
must still be backed by runtime-issued workflow receipts; old global receipts
are diagnostic only.

<!-- supervibe-release-operational-markers:start -->
Release-gate operational markers: before durable agent-owned work or completion claims, run `node <resolved-supervibe-plugin-root>/scripts/command-agent-plan.mjs --command /supervibe-plan` and follow the printed `SUPERVIBE_COMMAND_AGENT_PLAN`. The executable `scripts/lib/command-agent-orchestration-contract.mjs` profile and `rules/command-agent-orchestration.md` remain the source of truth for `ownerAgentId`, `agentPlan`, `requiredAgentIds`, dynamic specialist selection, default `real-agents` mode, and `agent-required-blocked` behavior. The plan must show `CALLABLE_AGENT_SOURCES`, `CALLABLE_AGENTS_READY`, `SCOPED_RECEIPT_GATE`, and `MISSING_CALLABLE_AGENTS` before any agent-owned artifact is claimed.

Invoke real host agents when specialist output is claimed and issue runtime receipts with `hostInvocation.source` and `hostInvocation.invocationId`. For Codex, use `spawn_agent` according to `CODEX_SPAWN_PAYLOAD_RULES` and `CODEX_SPAWN_PAYLOADS`: forked payloads must set `fork_context=true`, must omit `agent_type`, `model`, and `reasoning_effort`, and must encode the Supervibe logical role in the message. Record each returned Codex agent id with `node <resolved-supervibe-plugin-root>/scripts/agent-invocation.mjs log ...` before receipts are issued. `inline` is diagnostic/dry-run only. Do not emulate specialist agents, and command or skill receipts must not substitute for agent, worker, or reviewer output.
<!-- supervibe-release-operational-markers:end -->

## Workflow Invocation Receipts

Any claim that this command invoked another Supervibe command, skill, agent, reviewer, worker, validator, or external tool must be backed by a runtime-issued workflow receipt created with `node <resolved-supervibe-plugin-root>/scripts/workflow-receipt.mjs issue ...`. Hand-written receipts are untrusted. Agent, worker, and reviewer receipts must include `hostInvocation.source` and `hostInvocation.invocationId` from a real host dispatch; command or skill receipts must not substitute for specialist output. Scoped current-run receipts are required for active command/handoff claims; old global receipts are diagnostic only and cannot authorize a new agent-owned output. Durable artifacts produced by this command must stay linked through `.supervibe/memory/workflow-invocation-ledger.jsonl` and `artifact-links.json`; run `npm run validate:workflow-receipts` and `npm run validate:agent-producer-receipts` only at explicit verification, strict review, or release gates before claiming the command, delegated stage, or produced artifact is complete.
