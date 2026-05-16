# Supervibe Workflow Quickstart

This guide is for the improved MVP workflow after Supervibe is installed and the project has run `/supervibe-genesis`.

## The Short Loop

```text
start
  -> inspect status
  -> dispatch ready work
  -> keep receipts and task evidence
  -> recover blocked or stale state
  -> run final validation before release
```

## 1. Start Simply

Use `/supervibe` when you want routing help. Use a direct command when you already know the workflow:

| Goal | Command |
|---|---|
| Find the next safe action | `/supervibe` |
| Turn an idea into a spec | `/supervibe-brainstorm "idea"` |
| Create or review a plan | `/supervibe-plan <source-or-plan>` |
| Run a visible task graph | `/supervibe-loop --guided --file <graph.json>` |
| Check project and workflow health | `/supervibe-status` |

Slash commands go in the AI coding tool chat. Terminal commands such as `npm run supervibe:status` go in your shell.

## 2. Check Graph Status

Before dispatching work, check the current workflow state:

```text
/supervibe-status
/supervibe-loop --status --epic <epic-id>
```

The graph is the shared source of truth for long-running work. The important states are:

| State | Meaning |
|---|---|
| `ready` | Can be picked up now |
| `blocked` | Needs a dependency, decision, or missing evidence |
| `claimed` | Someone or some agent owns it right now |
| `stale` | A claim or dependency needs recovery |
| `orphan` | The task is disconnected from the expected graph |
| `review` | Implementation exists and needs review |
| `done` | Closed with required evidence |

If status and chat disagree, trust the graph and repair it before continuing.

## 3. Dispatch Work

For durable workflow work, dispatch through the owning Supervibe command. The command should show which agents, workers, reviewers, or validators are expected before it mutates durable artifacts.

Use graph-aware execution for task work:

```text
/supervibe-loop --guided --file <graph.json>
/supervibe-loop --epic <epic-id> --worktree
```

Use worktrees when you want isolation or parallel sessions. Keep simple status, audit, and planning summaries in the current session unless the command asks for execution.

## 4. Receipts And Proof

Receipts prove that a current run invoked the producer that owns an output. They are stronger than chat prose and stronger than old global success history.

For completion claims, expect:

- the graph task or epic id
- the current-run receipt or receipt summary
- the changed output or evidence path
- review or verification output when the workflow requires it
- any remaining risks or deferred release checks

If a workflow names a specialist, reviewer, worker, validator, skill producer, or external tool, its result should be bound to runtime proof before the work is called complete.

## 5. Recovery

Use recovery before starting over:

| Problem | First move |
|---|---|
| Interrupted run | `/supervibe-loop --resume <state.json>` |
| Unsure what is next | `/supervibe-status` |
| Stale claim | Check status, then clear or reclaim through the loop command |
| Missing task evidence | Attach the evidence, then rerun completion validation |
| Close is blocked | `/supervibe-loop --validate-completion --epic <epic-id>` |
| Graph looks inconsistent | Inspect ready, blocked, stale, and orphan tasks before dispatch |

Receipt recovery is also available from the plugin checkout when maintainers need it:

```bash
node scripts/workflow-receipt.mjs inspect
node scripts/workflow-receipt.mjs recovery-status
node scripts/workflow-receipt.mjs reissue --receipt <receipt-json>
node scripts/workflow-receipt.mjs prune-stale --apply
node scripts/workflow-receipt.mjs rebuild-ledger --prune-stale
```

Use these as recovery tools, not as a substitute for invoking the required workflow producers.

## 6. Final Validation

During plan, graph, and task workflow development, do not run broad test or validator suites unless the workflow explicitly reaches its final gate. Keep intermediate checks targeted.

### Verification And Release Cache Semantics

A verification cache or release cache is only an opt-in resume aid for an interrupted, failed, or running release check. A previous all-pass cache never converts into a fresh release pass; when a previous pass cache is found, command output should report `previous-pass-cache-ignored` and rerun the release gate.

Force/bypass non-reuse applies when the operator starts from scratch, clears cache, uses bypass options, or the proof is degraded. Forced or bypassed runs must not reuse cached release proof, and release proof bypass reasons visible in command output must explain why proof was not reusable.

Dry-run/non-reusable cache behavior: dry runs may show the planned gates and cached prefix handling, but they must not write reusable cache state, must not count as release execution, and any dry-run proof is non-reusable.

Before release, merge, or a completion claim that depends on repository health, run the final validation block expected by the project. At minimum, maintainers should expect:

```bash
npm run check
```

Some workflow changes also require targeted receipt, graph, command-agent, Code RAG, or CodeGraph health checks. If final validation fails, report the failing command and keep fixes scoped to failures caused by the current change.

## 7. Deprecation Notices

Use deprecation notices when a workflow command, option, output field, or state transition still works but will change or be removed in a future release. Do not warn for purely internal refactors, unchanged aliases, or behavior that users cannot act on.

Compatibility should stay in place for at least one minor release after the first notice. For disruptive workflow UX changes, keep the old path available until the replacement command, migration step, or recovery path is documented and visible in command output.

Command output should be specific and actionable:

- name the deprecated command, option, field, or behavior
- name the replacement or migration command
- say when compatibility is expected to end, using a release or version when known
- print the notice once per command run, near the relevant result or status line

Avoid noisy warnings. Do not repeat the same notice for every task, graph node, receipt, or file. Suppress notices when the user already selected the new behavior, when output is machine-readable, or when the command is running as part of a final validation gate that should stay focused on pass/fail results.

## 8. Migration Guide

Use migration steps when an existing project adopts newer workflow state, receipt, graph, or instruction behavior.

1. Start with a status check and note the current workflow state.
2. Preserve existing user-owned instructions and Supervibe evidence before running any migration.
3. Run the owning Supervibe command that performs the migration. Do not hand-edit generated state unless the command documentation asks for it.
4. Confirm the migrated graph, receipts, and evidence paths still point to current files.
5. Record any skipped migration step with the reason, owner, and follow-up condition.

Exit when `/supervibe-status` shows no unexpected stale, orphan, or blocked workflow state and the next workflow action is clear.

## 9. Rollback Runbook

Use rollback when a workflow change creates incorrect state, bad evidence, broken receipts, or confusing routing.

| Step | Action | Exit |
|---|---|---|
| Stop | Pause new dispatch for the affected graph, command, or artifact set. | No new claims are being created for the affected work. |
| Identify | Find the last known good source, receipt, state file, or release commit. | The rollback target is named and readable. |
| Restore | Revert the scoped change or use the documented recovery command for receipts, graph state, or generated artifacts. | The affected files or state match the rollback target. |
| Verify | Run the smallest status or text check that proves the workflow is usable again. | The command exits 0 or the remaining blocker is documented. |
| Communicate | Note what changed, what was restored, and what still needs release validation. | The handoff has owner, evidence, and next action. |

Do not use rollback to remove unrelated work. If rollback would cross ownership boundaries, stop and ask for a narrower recovery path.

## 10. Troubleshooting Matrix

| Symptom | Likely Cause | First Check | Exit |
|---|---|---|---|
| Status and chat disagree | Stale local context or interrupted workflow | `/supervibe-status` | Trust the graph and repair or resume before dispatch. |
| Ready task will not dispatch | Missing dependency, claim, or policy gate | `/supervibe-loop --status --epic <epic-id>` | The task is ready, blocked with a reason, or reassigned. |
| Completion is rejected | Missing receipt, evidence path, review, or final gate | `/supervibe-loop --validate-completion --epic <epic-id>` | Required proof is attached or the blocker is explicit. |
| Receipt looks stale | Old invocation proof or moved artifact | `node scripts/workflow-receipt.mjs recovery-status` | Receipt is reissued, pruned, or documented as unusable. |
| Migration created confusing state | Partial migration or preserved legacy field | Status plus migrated file inspection | State is repaired or a rollback target is selected. |
| Broad validation is requested too early | Workflow has not reached release gate | Current graph phase and owner | Targeted checks continue; broad validators wait for release. |

When the matrix does not fit, reduce the problem to the smallest graph id, command, file path, and receipt id before changing state.

## Compact Checklist

```text
Did I start with the right command?
Did I check graph/status before mutation?
Is ready work dispatched through the owning workflow?
Do current-run receipts prove the claimed producer output?
Are blockers, stale claims, and missing evidence recovered?
Are broad validators deferred until the final gate?
```
