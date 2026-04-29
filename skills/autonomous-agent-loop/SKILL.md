---
name: autonomous-agent-loop
namespace: process
description: "Use WHEN the user wants TO run a bounded autonomous multi-agent loop that turns a plan or request into tasks, dispatches specialists, scores work at 9/10 gates, and stops safely on policy, budget, approval, or missing evidence."
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
3. Build a task queue with acceptance criteria, verification commands, policy
   risk, required agent capability, stop conditions, and confidence rubric.
4. Build a minimal context pack before dispatch: memory lookup, Code RAG,
   CodeGraph when structurally relevant, then targeted file reads.
5. Dispatch specialist chains by task type and verify required agents, skills,
   MCPs, reviewer independence, and fallback availability.
6. Require structured handoff after each task.
7. Score every task on the autonomous-loop rubric. Anything below 9.0 is not
   complete and must be re-queued, repaired, blocked for user input, or marked
   partial only with explicit user acceptance.
8. Stop on policy, budget, no progress, approval expiry, side-effect
   reconciliation failure, state migration failure, cancellation, or missing
   required evidence.
9. Write final report with task, agent, context, handoff, score, verification,
   approval, rollback, and artifact-retention evidence.

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
```
