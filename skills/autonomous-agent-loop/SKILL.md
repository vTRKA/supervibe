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
version: 1.0
last-verified: 2026-04-29
---

# Autonomous Agent Loop

## Procedure

1. Normalize the user request or read the provided plan.
2. Run preflight for scope, autonomy level, budget, environment, MCP/tool
   permissions, access needs, secret handling, approval leases, and rollback
   expectations.
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
5. Build a minimal context pack before dispatch: memory lookup, Code RAG,
   CodeGraph when structurally relevant, then targeted file reads.
6. Dispatch specialist chains by task type and verify required agents, skills,
   MCPs, reviewer independence, and fallback availability.
7. Execute only ready-front tasks. For fresh-context mode, pass only the task
   contract, acceptance criteria, verification matrix, compact context pack,
   progress notes, policy boundaries, side-effect rules, and output contract.
8. Require structured handoff after each task with verification evidence and
   independent reviewer evidence when risk or shared contracts require it.
9. Score every task on the autonomous-loop rubric. Anything below 9.0 is not
   complete and must be re-queued, repaired, blocked for user input, or marked
   partial only with explicit user acceptance.
10. Stop on policy, budget, no progress, approval expiry, side-effect
   reconciliation failure, state migration failure, cancellation, or missing
   required evidence.
    Treat failed provider permission audit as a policy stop before any task
    attempt starts.
11. Write final report with task, agent, context, handoff, score, verification,
   approval, rollback, and artifact-retention evidence.
12. Use `status`, `graph`, `doctor`, and `prime` before resuming a long run in a
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
```
