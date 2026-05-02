---
name: autonomous-agent-loop
namespace: process
description: "Use WHEN the user wants TO run a bounded autonomous multi-agent loop, epic/эпик, worktree run, or 3h/3 часа session that turns a plan into tasks, dispatches specialists, supports status/resume/stop, and stops safely on policy, budget, approval, or missing evidence."
allowed-tools: [Read, Grep, Glob, Bash, Write, Edit]
phase: exec
prerequisites: [user-request-or-plan]
emits-artifact: loop-state
confidence-rubric: confidence-rubrics/autonomous-loop.yaml
gate-on-exit: true
version: 1.1
last-verified: 2026-05-02
---

# Autonomous Agent Loop

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
