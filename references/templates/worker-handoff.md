# Worker Handoff Template

Use this template when work moves between parallel workers, reviewers,
validators, specialists, or workflow phases. The handoff should let the next
role continue from a bounded context packet instead of rereading broad project
history.

## Handoff Metadata

| Field | Required content |
| --- | --- |
| Handoff ID | Stable workflow, task, or artifact identifier. |
| Status | Ready, blocked, needs review, needs verification, or complete. |
| From role | Worker, reviewer, agent, skill, command workflow, or maintainer role. |
| To role | Next worker, reviewer, validator, agent, skill, command workflow, or maintainer role. |
| Scope | Files, artifacts, commands, runtime state, user request, or plan section covered. |
| Write boundary | Files or artifact classes the next role may change. |
| Stop condition | Missing input, failed verification, policy conflict, write-scope mismatch, or user decision required. |

## Context Packet

Include only context the next role needs:

1. Task contract and acceptance criteria.
2. Current work item, issue, plan section, or workflow state.
3. Direct dependency artifacts and decisions.
4. Source evidence from memory, Code RAG, CodeGraph, docs, tests, reviewers, or
   [Source Evidence Report](source-evidence-report.md).
5. Write scope and semantic anchors.
6. Recent blockers and rejected paths.
7. Omitted-context summary.

This order follows the prompt-slicing guidance in
[Workflow Hardening](../../docs/supervibe-workflow-hardening.md).

## Work Completed

| Area | Result | Evidence |
| --- | --- | --- |
| Implementation, review, research, validation, or docs. | Concrete completed action. | File path, command output summary, reviewer finding, or artifact path. |

Use the `summary`, `filesTouched`, `verificationEvidence`, and `confidenceScore`
fields when interoperating with worker and reviewer preset contracts.

## Files And Artifacts

| Path or artifact | Status | Notes |
| --- | --- | --- |
| Repository-relative path or workflow artifact id. | Read, changed, created, reviewed, generated, or untouched. | Why it matters and whether another role may edit it. |

Do not list files outside the approved write scope as changed unless the current
workflow explicitly authorized them.

## Decisions And Constraints

- Decisions accepted: list ADRs, user decisions, reviewer approvals, or workflow
  state that controls the next step.
- Constraints still active: write scope, host-neutral wording, verification
  limits, security restrictions, runtime proof requirements, release gates, or
  user constraints.
- Rejected paths: approaches considered and rejected with reason.
- Required receipts or runtime proof: state what the workflow requires and what
  evidence already exists. Do not hand-write receipt proof.

## Verification Evidence

| Check | Result | Evidence |
| --- | --- | --- |
| Command, test, validator, manual inspection, screenshot, reviewer pass, or blocked check. | Passed, failed, blocked, skipped by instruction, or not applicable. | Exact command and result summary, inspected path, or blocker reason. |

Completion cannot be claimed without verification evidence or an explicit
blocked status.

## Remaining Work

| Item | Owner | Trigger | Required evidence |
| --- | --- | --- | --- |
| Follow-up task, review, validation, repair, cleanup, or user decision. | Next role. | Condition that starts the item. | Command, artifact, reviewer output, or source evidence required. |

## Blockers And Risks

- Blocker: missing input, failed command, write-scope conflict, unavailable
  evidence, policy issue, or user decision required.
- Residual risk: uncertainty that does not block the current handoff but must be
  visible to the next role.
- Mitigation: next safe action, rollback, retry, reviewer escalation, or
  narrowed scope.

## NEXT_STEP_HANDOFF Block

Use this block when a runtime parser or workflow continuation expects a stable
handoff marker:

```text
NEXT_STEP_HANDOFF
Artifact: repository-relative artifact path or workflow artifact id
Current phase: phase that just completed
Next phase: phase the receiving role should execute
Command: workflow command or targeted verification command when applicable
Skill: owning skill or not applicable
Stop condition: concrete blocker or condition that pauses work
Question: one user or maintainer question if input is required
END_NEXT_STEP_HANDOFF
```

## Completion Checklist

- The next role and write boundary are explicit.
- Context packet is narrow and ordered by relevance.
- Changed files and untouched files are not mixed together.
- Decisions, constraints, blockers, and rejected paths are visible.
- Verification evidence is exact.
- Runtime proof requirements are stated without emulation.
- Remaining work has owner, trigger, and required evidence.
