---
name: autonomous-agent-loop
namespace: process
description: >-
  Use WHEN the user wants TO run a bounded autonomous multi-agent loop, epic,
  worktree run, or 3h timeboxed session that turns a plan into tasks, dispatches
  specialists, supports status/resume/stop, and stops safely on policy, budget,
  approval, or missing evidence. Triggers: 'autonomous loop', 'epic',
  'worktree', 'эпик', '3 часа'.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
  - Edit
phase: exec
prerequisites:
  - user-request-or-plan
emits-artifact: loop-state
confidence-rubric: confidence-rubrics/autonomous-loop.yaml
gate-on-exit: true
version: 1.2
last-verified: 2026-05-02T00:00:00.000Z
---

# Autonomous Agent Loop

## When to invoke

Use this skill when a user asks for an autonomous run, epic execution, bounded
multi-agent loop, long worktree session, or multi-step delivery that must keep
working until the queue is exhausted, blocked, cancelled, or out of approved
budget. This skill is the loop controller contract, not a short checklist.

Do not use it for one small local edit, a read-only explanation, or a plan that
has not passed review unless the invocation is explicitly dry-run/readiness
only.

## Controller Model

Every run has three roles even when one human or one AI session performs more
than one role:

- Controller: owns task graph, scope, policy, budget, approvals, state, and
  final truth. The controller decides ready/blocked/done.
- Worker: owns one bounded task with a declared write set, verification command,
  stop condition, and no authority to expand scope.
- Reviewer: independently checks worker evidence, scope safety, regression
  risk, and acceptance criteria before the controller marks done.

Workers are never trusted because they completed a first step or produced a
confident narrative. Completion requires reviewer-grade evidence and controller
state reconciliation.

## Definition Of Ready

A task is ready only when all of these are true:

1. It maps to approved user scope or an explicit approved scope-change receipt.
2. Dependencies are complete or intentionally mocked with a rollback path.
3. Write set is declared and does not overlap another active worker unless a
   maintainer-approved conflict exception exists.
4. Acceptance criteria, verification commands, rollback, risk level, and stop
   conditions are present.
5. Minimal context pack exists with memory, Code RAG, CodeGraph when relevant,
   source citations, retrieval quality, graph warnings, and fallback reasons.
6. Policy preflight is green for tools, network, MCP, secrets, production,
   provider permissions, rate limits, and approval leases.
7. Readiness score is at least 9/10, or the run is dry-run and the missing
   remediation is recorded.

## Definition Of Done

A task is done only when all of these are true:

1. Acceptance criteria are satisfied with cited evidence.
2. Required verification ran and the output is recorded.
3. Reviewer evidence is present for risky, shared-contract, or multi-file work.
4. Side-effect ledger matches actual writes, commands, external calls, spawned
   processes, approvals, and cleanup actions.
5. Scope Safety Gate confirms no unapproved extras shipped.
6. Handoff includes next action, residual risks, rollback, and confidence score.
7. Score is at least 9/10. Anything lower is re-queued, repaired, blocked, or
   explicitly accepted as partial by the user.

## Continuation Contract

Do not stop after the first task or wave. Continue ready work until the task
queue is exhausted, max-duration/max-iteration/provider budget is reached,
policy or approval gates block progress, verification fails, no-progress policy
fires, or the user explicitly pauses/stops.

Wave reviews, taste checks, first working tests, first agent handoffs, and
partial reports are checkpoints, not terminal states. If the loop pauses, print
the exact stop reason and next resume command. Final output must distinguish
`COMPLETE` from `BLOCKED`, `PARTIAL`, `POLICY_STOP`, `BUDGET_STOP`, and
`USER_PAUSED`.

## Topic Drift / Resume Contract

If the user shifts topic while `.supervibe/memory/loops/<run-id>/state.json`,
`contextPack.workflowSignal`, or a queued handoff exists, preserve the loop
state instead of silently switching. Surface run id, current phase, active task
or wave, artifact path, next command, stop command, and blocker, then ask one
`Step N/M` or `Step N/M` resume question: continue ready work, skip/delegate safe non-final decisions to the controller and continue, pause current loop and switch topic, or stop/archive the current state.

Skipped or delegated decisions must be recorded in loop state, side-effect
ledger, and final report. They cannot bypass policy, budget, approval,
production, destructive-operation, review, verification, or scope-expansion
gates.

## Execution Packet

Every worker or fresh-context handoff must be self-contained and small:

```yaml
taskId: "<stable id>"
objective: "<one bounded deliverable>"
approvedScopeId: "<scope id or approval receipt>"
writeSet: ["<repo-relative path or glob>"]
readOnlyContext:
  memory: ["<memory id/path or no-match query>"]
  ragCitations: ["<file:line or search result id>"]
  graphEvidence: ["<symbol/caller/impact evidence or N/A reason>"]
acceptanceCriteria: ["<observable criterion>"]
verification: ["<command and expected signal>"]
policyBoundaries: ["<tools/network/MCP/secrets/prod limits>"]
sideEffectsAllowed: ["<local write/process/network action or none>"]
stopConditions: ["<when to stop instead of improvise>"]
outputContract: "<exact handoff fields>"
```

Missing packet fields mean the task is not ready.

## Wave Planning And Dispatch

Build waves from ready tasks using dependencies, write-set overlap, policy risk,
reviewer availability, worktree/session registry claims, and rollback cost.
Parallelize only disjoint write sets or read-only investigations. Keep waves
small enough to review; large ready fronts become multiple waves.

Record why each worker/reviewer pair was chosen, which alternatives were
rejected, and why any task was serialized, blocked, or quarantined. A failing
known task should not keep blocking unrelated ready work; quarantine it with
reason, retry limit, owner, and resume condition.

## Recovery And Resume

State lives under `.supervibe/memory/loops/<run-id>/` and must be sufficient for
fresh-context recovery. Before resume, run `status`, `graph`, `doctor`, and
`prime`; validate state schema/migrations, side-effect ledger, active process
ownership, approval expiry, and ready-front ordering.

No-progress policy: after a bounded failed retry, change one variable
(context, task split, owner, verification, or scope decision) or stop as
blocked. Never repeat the same worker prompt with the same evidence and expect a
different result.

## Procedure

1. Normalize the user request or read the provided plan.
2. Run preflight for scope, autonomy level, budget, environment, MCP/tool
   permissions, access needs, secret handling, approval leases, and rollback
   expectations.
   - Apply the Scope Safety Gate from `docs/references/scope-safety-standard.md`: distinguish approved
     scope from optional extras, and reject/defer tasks that do not map to the
     plan, user outcome, or explicit scope-change approval.
   - For non-dry execution, run provider permission audit before dispatch.
     Block dangerous provider flags, hidden automation, unknown network/MCP
     access, sensitive-file reads, unmanaged rate-limit retries, and missing
     permission prompt bridge.
3. Generate execution contracts for every task and score autonomy readiness.
   Long autonomous runs must not start below 9/10 unless dry-run or explicitly
   overridden by the user with the missing remediation recorded.
4. Build a durable task graph with acceptance criteria, verification commands,
   policy risk, required agent capability, stop conditions, confidence rubric,
   dependencies, and ready-front ordering.
5. Add Scope Safety metadata to every task: approved scope id, scope decision
   (`include`, `defer`, `reject`, `spike`, `ask-one-question`), complexity
   cost, tradeoff, and stop condition for unapproved scope expansion.
6. Add an SDLC and production path to the graph: discovery/spec evidence,
   MVP slice, phased rollout, release gate, security/privacy checks,
   observability, rollback, support owner, and post-release learning. If the
   user asks for "one big spec/plan to production", keep the plan broad enough
   to reach production but split execution into verified phases.
7. Build a minimal context pack before dispatch: memory lookup, Code RAG,
   CodeGraph when structurally relevant, then targeted file reads.
   The context pack must preserve Retrieval Quality, Graph Quality Gates,
   fallback reason, source citations, semantic anchors, and warnings. If graph
   warnings affect a structural task, stop or repair before dispatching that task.
8. Dispatch specialist chains by task type and verify required agents, skills,
   MCPs, reviewer independence, and fallback availability.
9. Execute only ready-front tasks. For fresh-context mode, pass only the task
   contract, acceptance criteria, verification matrix, compact context pack,
   progress notes, policy boundaries, side-effect rules, and output contract.
10. Require structured handoff after each task with verification evidence and
   independent reviewer evidence when risk or shared contracts require it.
11. Score every task on the autonomous-loop rubric. Anything below 9.0 is not
   complete and must be re-queued, repaired, blocked for user input, or marked
   partial only with explicit user acceptance.
12. Stop on policy, budget, no progress, approval expiry, side-effect
   reconciliation failure, state migration failure, cancellation, or missing
   required evidence.
    Treat failed provider permission audit as a policy stop before any task
    attempt starts.
    Treat unapproved functionality as a scope-safety stop, not as a task
    "improvement".
13. Before completion, run a final 10/10 readiness pass: reread source spec and
   plan, verify every acceptance criterion, close or explicitly block every
   open risk, confirm production readiness gates are green, and verify no
   hidden optional functionality entered execution.
14. Write final report with task, agent, context, handoff, score, verification,
   approval, rollback, and artifact-retention evidence.
   Include a visual status summary: Mermaid graph export or UI/control-plane
   link plus a text fallback listing ready, blocked, review, done, open gates,
   and release blockers.
15. Use `status`, `graph`, `doctor`, and `prime` before resuming a long run in a
   fresh context; never rely on hidden conversation state.

## Output Contract

```text
SUPERVIBE_LOOP_STATUS
STATUS: IN_PROGRESS | COMPLETE | BLOCKED | POLICY_STOP | BUDGET_STOP
EXIT_SIGNAL: true | false
CONFIDENCE: 0.0-10.0
NEXT_AGENT: agent-id or none
NEXT_ACTION: concrete next action
STOP_REASON: concrete reason or none
POLICY_RISK: none | low | medium | high
PERMISSION_MODE: ask-preserving | blocked | unknown
BYPASS_DISABLED: true | false
SDLC_STAGE: discovery | planning | implementation | verification | release | post-release
PRODUCTION_READINESS: 0.0-10.0
OPEN_BLOCKERS: number
SCOPE_SAFETY: pass | blocked | needs-tradeoff
SCOPE_CHANGES: number
```

## Guard rails

- Do not mutate files, provider state, network resources, or external tools unless this skill's procedure and the user approval path allow it.
- Do not skip prerequisites, confidence gates, policy gates, or explicit approval gates.
- Do not claim completion without concrete verification evidence.
- Preserve user-owned content and unrelated worktree changes.

## Verification

- Confirm every emitted artifact exists and matches the Output contract.
- Run the validator, test, dry-run, or audit command named by this skill when one exists.
- Include concrete command/output evidence before claiming the skill completed successfully.
- If verification cannot run, state the blocker and keep confidence below the passing gate.
