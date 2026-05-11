---
description: >-
  Use AFTER approved spec OR WHEN planning is ready TO write a phased plan,
  require review loop, then atomic task split and epic handoff before execution.
  Triggers: 'plan', 'review plan', 'atomize', 'сделал план', 'план', 'ревью',
  'эпик'.
last-verified: "2026-05-10"
---

# /supervibe-plan

Direct trigger for the `supervibe:writing-plans` skill. Use after `/supervibe-brainstorm` (or any other producer of an approved spec) to lay out exactly how the work gets done.

## Continuation Contract

Do not stop after individual plan phases, file-structure mapping, first task batch, or the first review-gate draft. A `/supervibe-plan` invocation should show a compact plan-scope preview, wait for an explicit approve/revise/exclude-or-defer/stop choice, then write the full plan before the review handoff, unless the user explicitly stops/pauses, the spec is missing or unapproved, or a single blocking ambiguity prevents a production-safe plan.

Review gates inside the plan are execution-time gates for later workers; they are not reasons for the planning agent to stop before completing the full plan artifact.

## Topic Drift / Resume Contract

If the user shifts topic while a plan is incomplete or a `NEXT_STEP_HANDOFF` exists, do not silently drop the saved phase. Surface the current phase, plan/spec artifact path, next command, and blocker, then ask one `Step N/M` or `Step N/M` resume question with these choices: continue current plan, skip/delegate safe non-final decisions to the agent and continue, pause current plan and switch topic, or stop/archive the current state.

Skipped or delegated decisions must be recorded in the plan assumptions, scope safety gate, or review handoff. They cannot bypass the mandatory plan review loop, final approval, safety/policy gates, production approvals, or destructive-operation consent.

## Invocation forms

### `/supervibe-plan --from-brainstorm <spec-path>`

Canonical handoff after `/supervibe-brainstorm`. Treat `<spec-path>` as the approved brainstorm output and require the same spec validation as the plain path form.

Example:
- `/supervibe-plan --from-brainstorm .supervibe/artifacts/specs/2026-04-28-payment-idempotency-design.md`

### `/supervibe-plan <spec-path>`

Examples:
- `/supervibe-plan .supervibe/artifacts/specs/2026-04-28-payment-idempotency-design.md`
- `/supervibe-plan .supervibe/artifacts/specs/2026-04-28-mocks-preview-server-design.md`

### `/supervibe-plan --review <plan-path>`

Canonical mandatory review loop after a durable plan is written. This review must pass before `/supervibe-loop --atomize-plan <plan-path> --plan-review-passed` can write work items, epic state, or execution handoff artifacts.

The review loop must produce a durable plan-review artifact, not only inline notes. The artifact follows `docs/templates/plan-review-template.md` and must pass `node scripts/validate-plan-review-artifacts.mjs --file <review-artifact>`. It records:
- Review Summary with verdict, score, and stop reason
- Reviewer Coverage with the baseline reviewers `supervibe-orchestrator`, `systems-analyst`, `architect-reviewer`, and `quality-gate-reviewer`
- Risk Trigger Matrix for database, cache, queue, security, API, infrastructure, and frontend risk
- Plan Review Scorecard against `confidence-rubrics/plan-review.yaml`
- Findings, Convergence Ledger, Residual Risks, Next User Decision, and Evidence

The loop can stop with pass only when there are zero open critical findings, zero open major findings, a stop reason, and one explicit next user decision. If database, cache, queue, API, security, infrastructure, or frontend risks are present, the corresponding specialist reviewer set must be selected and represented in the coverage section. MVP anti-bloat, scope safety, architecture fit, topology, security/privacy, observability, release, rollback, provider policy, and verification coverage are blocking dimensions.

### `/supervibe-plan` (no args)

Auto-detect the most recent spec in `.supervibe/artifacts/specs/` and use it. If none, fall back to:
- Show user the list of recent specs and ask which to plan
- If no specs exist at all → tell user to run `/supervibe-brainstorm` first and stop

## Procedure

1. **Resolve the spec.** Use `--from-brainstorm <spec-path>`, an explicit path, the freshest file in `.supervibe/artifacts/specs/`, or stop with a redirect to `/supervibe-brainstorm`.

2. **Validate the spec.** Read it. Check for:
   - Approved status (frontmatter or first H2 indicating user signed off)
   - Goals / non-goals / success criteria sections
   If gaps → ask user to confirm before planning incomplete requirements.

3. **Search project memory** for similar past plans (`supervibe:project-memory --query <topic>`). If a near-identical implementation exists, propose adapting it instead of re-planning from scratch.

3a. **Plan Scope Approval Gate.** Before saving the durable implementation plan, print a compact plan-scope preview:
   - Proposed phases and task groups
   - Files/modules expected to change
   - Approved, deferred, rejected, and explicitly excluded scope
   - Risks, production gates, and verification strategy
   - What will not be implemented in this plan

   Ask one `plan_delivery` question with these visible choices:
   - **Approve plan for review** - write the durable plan and proceed only to the mandatory review loop.
   - **Revise plan scope** - remove, rewrite, split, or defer named phases/tasks/files before writing.
   - **Exclude or defer items** - record out-of-scope work so it cannot enter execution silently.
   - **Audit plan deeper** - run more coverage/dependency/risk review before approval.
   - **Keep plan draft** - stop without atomization, execution, or approved-scope claims.

   Free-form answers such as "exclude analytics", "defer phase 3", or "split mobile into a later plan" must update the preview and be recorded in the Scope Safety Gate. Do not save the durable plan, atomize work items, or offer execution until this gate is answered.

4. **Invoke `supervibe:writing-plans` skill.** It produces:
   - File structure (which files to create / modify, with paths)
   - Critical path
   - Scope Safety Gate (approved/deferred/rejected scope, tradeoffs, and stop condition for unapproved additions)
   - Development Contract Map covering behavior, architecture, data/schema, API/event, UI state, security/privacy, performance, observability, rollout/rollback, and docs/support
   - Retrieval, CodeGraph, and browser-first visual evidence contract
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

7. **Score against `plan.yaml` rubric before review, then `plan-review.yaml` inside review mode.** Gate remains 9/10 or higher, and any open critical or major plan-review finding blocks the pass state.

8. **Post-plan summary before review.** After the durable plan is saved and validated, give a short human-readable summary: artifact path, phases, critical path, included scope, deferred/rejected scope, highest risks, validation result, score, and the next review choices.

8a. **Mandatory review handoff before execution.** Print the command output block and wait for one user choice. In normal conversational summaries, translate the available choices into a short human-readable next-step sentence instead of exposing the raw `NEXT_USER_ACTIONS[]` marker. Print:
   ```
   Plan saved to <path>.
   Step N/M: run the plan review loop?
   ```

8b. **Machine-readable review handoff.** Include:

   ```text
   NEXT_STEP_HANDOFF
   Current phase: plan
   Artifact: <plan-path>
   Next phase: plan-review
   Next command: /supervibe-plan --review <plan-path>
   Next skill: supervibe:requesting-code-review
   Stop condition: ask-before-plan-review
   Why: Execution and atomization are blocked until plan review passes.
   Question: Step N/M: the plan review loop?
   Choices:
   - Run plan review - invoke `/supervibe-plan --review <plan-path>` with specialist reviewers.
   - Revise plan first - reopen `/supervibe-plan <plan-path>` and update scope/tasks/risks.
   - Audit plan deeper - add coverage/dependency/risk review before the review loop.
   - Exclude or defer items - record out-of-scope work before review.
   - Keep plan draft and stop - no review, atomization, or execution starts.
   END_NEXT_STEP_HANDOFF
   ```

9. **After review passes.** Hand off to atomization and epic creation:
   ```
   Step N/M: split the plan into atomic work items and an epic?
   ```

After review passes, the concrete atomization command is `/supervibe-loop --atomize-plan <plan-path> --plan-review-passed`. Atomization is fail-closed: a reviewed plan without parseable atomic work items, epics, gates, or dependencies must not produce durable loop artifacts until the plan is revised or explicitly handled by a diagnostic override.
After atomization, run tracker sync as the default next step whenever an adapter is configured: `/supervibe-loop --tracker-sync-push --file .supervibe/memory/work-items/<epic-id>/graph.json`. The native work-item graph remains canonical if no tracker adapter is available; a configured adapter lets `/supervibe-loop` reconcile ready work, mirror claims, prime agent context, and close mapped tasks with verification evidence.
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
Development contracts: behavior/architecture/data/API/UI/security/perf/observability/rollout/docs mapped
Scope safety: approved scope mapped; deferred/rejected extras documented
Retrieval/graph: required memory, RAG, CodeGraph, citations, fallback and graph-quality checks mapped
Visual evidence: browser-first preview/table/text packet; Mermaid fallback includes accessible title and description when used
Post-plan summary: concise human summary and next review actions shown after plan creation
Final gate:  10/10 acceptance + no open blockers
Score:       <N>/10  Rubric: plan
Validator:   validate-plan-artifacts PASS

Next:        review loop -> atomic work items -> epic -> provider-safe execution preflight
NEXT_USER_ACTIONS[]: run plan review | revise plan first | audit plan deeper | exclude or defer items | keep plan draft and stop
Handoff:    NEXT_STEP_HANDOFF with command `/supervibe-plan --review <plan-path>`
Source mode: `--from-brainstorm` when the plan came from a brainstorm spec
```

`NEXT_USER_ACTIONS[]` is a machine-readable command/artifact marker. Outside the command output block, summarize it as natural language and do not leave the raw marker in the user-facing prose.

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

Before durable work or completion claims, run `node <resolved-supervibe-plugin-root>/scripts/command-agent-plan.mjs --command /supervibe-plan` and follow the printed `SUPERVIBE_COMMAND_AGENT_PLAN`. The plan must show host dispatch support, proof source, `AGENT_SELECTION_MODE`, required agents, `REQUIRED_AGENT_SOURCES`, `CALLABLE_AGENT_SOURCES`, `CALLABLE_AGENTS_READY`, `SCOPED_RECEIPT_GATE`, `MISSING_CALLABLE_AGENTS`, and durable-write permission before any agent-owned artifact is produced. Role sources must distinguish definition availability from host-callable availability: `REQUIRED_AGENT_SOURCES` may include `plugin-only`, but `CALLABLE_AGENT_SOURCES`, `CALLABLE_AGENTS_READY`, and `MISSING_CALLABLE_AGENTS` decide whether the selected host can actually invoke the role. Plugin-only definitions are not enough for a real-agent completion claim.

Invoke the real host agents named by the plan and issue runtime receipts with `hostInvocation.source` and `hostInvocation.invocationId`. For active workflows, build the plan with `--active --slug <slug> --handoff-id <handoff-id>`; `SCOPED_RECEIPT_GATE` must be trusted for the current run before durable agent-owned outputs are allowed. Old global receipts are diagnostic only and do not unlock a new command/handoff. In Codex, invoke with `spawn_agent` using the `CODEX_SPAWN_PAYLOAD_RULES` and `CODEX_SPAWN_PAYLOADS` printed by `command-agent-plan.mjs`: forked payloads must set `fork_context=true`, must omit `agent_type`, `model`, and `reasoning_effort`, and must encode the Supervibe logical role in `message` instead of Codex `agent_type`. Record each returned Codex agent id with `node <resolved-supervibe-plugin-root>/scripts/agent-invocation.mjs log ...` before receipts are issued. `inline` is diagnostic/dry-run only. Do not emulate specialist agents, and do not let command or skill receipts substitute for agent, worker, or reviewer output.
## Workflow Invocation Receipts

Any claim that this command invoked another Supervibe command, skill, agent, reviewer, worker, validator, or external tool must be backed by a runtime-issued workflow receipt created with `node <resolved-supervibe-plugin-root>/scripts/workflow-receipt.mjs issue ...`. Hand-written receipts are untrusted. Agent, worker, and reviewer receipts must include `hostInvocation.source` and `hostInvocation.invocationId` from a real host dispatch; command or skill receipts must not substitute for specialist output. Scoped current-run receipts are required for active command/handoff claims; old global receipts are diagnostic only and cannot authorize a new agent-owned output. Durable artifacts produced by this command must stay linked through `.supervibe/memory/workflow-invocation-ledger.jsonl` and `artifact-links.json`; run `npm run validate:workflow-receipts` and `npm run validate:agent-producer-receipts` before claiming the command, delegated stage, or produced artifact is complete.
