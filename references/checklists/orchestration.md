# Orchestration Reference Pack

Use this when a command, plan, agent lane, durable workflow, or multi-step task
needs coordinated execution and proof.

## Gates

- Name the owner command or work item, responsible orchestrator, worker lanes,
  reviewer timing, and final acceptance gate.
- Confirm dependency order before dispatch: independent lanes may run in
  parallel, but shared write sets, receipts, and state transitions must serialize.
- Use the real producer/reviewer/validator path when the workflow names one;
  inline drafts are diagnostic only.
- Stop when command routing, workflow state, or write-set ownership disagrees
  with the requested action.

## Evidence

- Record lane owner, input artifact, allowed write set, invocation id or receipt
  requirement, output artifact, and verification command.
- For parallel work, record why lanes are independent and where their results
  merge.
- For blockers, record the blocked gate, missing evidence, owner, and next safe
  action.
- For cleanup, record stopped processes, stale claims pruned, or why none were
  present.

## Failure Modes

- Controller-authored output substituted for a required specialist producer.
- Review happening before the artifact is durable or after acceptance is claimed.
- Multiple lanes writing the same file or workflow state without coordination.
- Final status claimed while validators, receipts, or background tasks are still
  pending.

## Acceptance Check

- The graph has one current next action, one owner per write set, and no hidden
  background work needed for the claim.
- Required receipts or invocation identifiers are runtime-issued when the
  workflow demands them.
- The final gate cites executable validation or a named blocker with no invented
  progress.
