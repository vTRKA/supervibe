---
description: >-
  Use AFTER approved spec OR WHEN planning is ready TO write a phased plan,
  require review loop, then atomic task split and epic handoff before execution.
  Triggers: 'plan', 'review plan', 'atomize', 'сделал план', 'план', 'ревью',
  'эпик'.
---

# /supervibe-plan

Direct trigger for the `supervibe:writing-plans` skill. Use after `/supervibe-brainstorm` (or any other producer of an approved spec) to lay out exactly how the work gets done.

## Continuation Contract

Do not stop after individual plan phases, file-structure mapping, first task batch, or the first review-gate draft. A `/supervibe-plan` invocation should write the full plan before the review handoff, unless the user explicitly stops/pauses, the spec is missing or unapproved, or a single blocking ambiguity prevents a production-safe plan.

Review gates inside the plan are execution-time gates for later workers; they are not reasons for the planning agent to stop before completing the full plan artifact.

## Topic Drift / Resume Contract

If the user shifts topic while a plan is incomplete or a `NEXT_STEP_HANDOFF` exists, do not silently drop the saved phase. Surface the current phase, plan/spec artifact path, next command, and blocker, then ask one `Step N/M` or `Step N/M` resume question with these choices: continue current plan, skip/delegate safe non-final decisions to the agent and continue, pause current plan and switch topic, or stop/archive the current state.

Skipped or delegated decisions must be recorded in the plan assumptions, scope safety gate, or review handoff. They cannot bypass the mandatory plan review loop, final approval, safety/policy gates, production approvals, or destructive-operation consent.

## Invocation forms

### `/supervibe-plan <spec-path>`

Examples:
- `/supervibe-plan .supervibe/artifacts/specs/2026-04-28-payment-idempotency-design.md`
- `/supervibe-plan .supervibe/artifacts/specs/2026-04-28-mocks-preview-server-design.md`

### `/supervibe-plan` (no args)

Auto-detect the most recent spec in `.supervibe/artifacts/specs/` and use it. If none, fall back to:
- Show user the list of recent specs and ask which to plan
- If no specs exist at all → tell user to run `/supervibe-brainstorm` first and stop

## Procedure

1. **Resolve the spec.** Either explicit path, the freshest file in `.supervibe/artifacts/specs/`, or stop with a redirect to `/supervibe-brainstorm`.

2. **Validate the spec.** Read it. Check for:
   - Approved status (frontmatter or first H2 indicating user signed off)
   - Goals / non-goals / success criteria sections
   If gaps → ask user to confirm before planning incomplete requirements.

3. **Search project memory** for similar past plans (`supervibe:project-memory --query <topic>`). If a near-identical implementation exists, propose adapting it instead of re-planning from scratch.

4. **Invoke `supervibe:writing-plans` skill.** It produces:
   - File structure (which files to create / modify, with paths)
   - Critical path
   - Scope Safety Gate (approved/deferred/rejected scope, tradeoffs, and stop condition for unapproved additions)
   - Retrieval, CodeGraph, and visual evidence contract
   - Delivery strategy from MVP to production
   - Production readiness contract (tests, security/privacy, performance, observability, rollback, release)
   - Phased tasks (≤5 minutes each, with verification commands)
   - Per-phase confidence gates
   - Parallelization batches (which tasks can run concurrently)
   - Risk register + rollback plan per phase
   - Final 10/10 acceptance gate with no open blockers
   - Self-review checklist

5. **Save the plan.** Output goes to `.supervibe/artifacts/plans/YYYY-MM-DD-<topic-slug>.md`.

6. **Machine-validate the plan.** Run `node scripts/validate-plan-artifacts.mjs --file <plan>`. Any failure blocks execution handoff.

7. **Score against `plan.yaml` rubric.** Gate ≥9. <9 → iterate.

8. **Mandatory review handoff before execution.** Print:
   ```
   Plan saved to <path>.
   Step 1/1: run the plan review loop?
   ```

8a. **Machine-readable review handoff.** Include:

   ```text
   NEXT_STEP_HANDOFF
   Current phase: plan
   Artifact: <plan-path>
   Next phase: plan-review
   Next command: /supervibe-plan --review <plan-path>
   Next skill: supervibe:requesting-code-review
   Stop condition: ask-before-plan-review
   Why: Execution and atomization are blocked until plan review passes.
   Question: Step 1/1: the plan review loop?
   END_NEXT_STEP_HANDOFF
   ```

9. **After review passes.** Hand off to atomization and epic creation:
   ```
   Step 1/1: split the plan into atomic work items and an epic?
   ```

After review passes, the concrete atomization command is `/supervibe-loop --atomize-plan <plan-path> --plan-review-passed`.
External tracker sync is optional after atomization: `/supervibe-loop --tracker-sync-push --file .supervibe/memory/work-items/<epic-id>/graph.json`. The native work-item graph remains canonical if no tracker adapter is available.
Atomized items are templated by work type and preserve labels, severity, owner/component/stack, required gates, verification hints, comments, and repo/package/workspace/subproject routing metadata for status queries.

## Output contract

```
=== Supervibe Plan ===
Spec:        <path>
Plan:        .supervibe/artifacts/plans/YYYY-MM-DD-<slug>.md
Phases:      <count>
Tasks:       <count>  (parallelizable batches: <count>)
Critical path: <N> tasks
Production readiness: test/security/perf/observability/rollback/release covered
Scope safety: approved scope mapped; deferred/rejected extras documented
Retrieval/graph: required memory, RAG, CodeGraph, citations, fallback and graph-quality checks mapped
Visual evidence: Mermaid/table plan with accessible title, description and text fallback
Final gate:  10/10 acceptance + no open blockers
Score:       <N>/10  Rubric: plan
Validator:   validate-plan-artifacts PASS

Next:        review loop -> atomic work items -> epic -> provider-safe execution preflight
Handoff:    NEXT_STEP_HANDOFF with command `/supervibe-plan --review <plan-path>`
```

## When NOT to invoke

- Spec doesn't exist or isn't approved — go to `/supervibe-brainstorm` first
- One-line trivial change — skip planning, just implement
- The work is exploratory ("let's see what happens if...") — that's brainstorming, not planning

## Related

- `supervibe:writing-plans` skill — the methodology
- `supervibe:project-memory` — pre-flight similarity check
- `/supervibe-brainstorm` — what produces the spec
- `supervibe:executing-plans` / `supervibe:subagent-driven-development` — execution skills
- `docs/templates/plan-template.md` — plan format

## Agent Orchestration Contract

This command must load its executable profile from `scripts/lib/command-agent-orchestration-contract.mjs` and follow `rules/command-agent-orchestration.md`. The profile is the source of truth for `ownerAgentId`, `agentPlan`, `requiredAgentIds`, dynamic specialist selection, default `real-agents` mode, and `agent-required-blocked` behavior.

Before durable work or completion claims, invoke the real host agents named by the profile and issue runtime receipts with `hostInvocation.source` and `hostInvocation.invocationId`. `inline` is diagnostic/dry-run only. Do not emulate specialist agents, and do not let command or skill receipts substitute for agent, worker, or reviewer output.
## Workflow Invocation Receipts

Any claim that this command invoked another Supervibe command, skill, agent, reviewer, worker, validator, or external tool must be backed by a runtime-issued workflow receipt created with `node <resolved-supervibe-plugin-root>/scripts/workflow-receipt.mjs issue ...`. Hand-written receipts are untrusted. Agent, worker, and reviewer receipts must include `hostInvocation.source` and `hostInvocation.invocationId` from a real host dispatch; command or skill receipts must not substitute for specialist output. Durable artifacts produced by this command must stay linked through `.supervibe/memory/workflow-invocation-ledger.jsonl` and `artifact-links.json`; run `npm run validate:workflow-receipts` and `npm run validate:agent-producer-receipts` before claiming the command, delegated stage, or produced artifact is complete.
