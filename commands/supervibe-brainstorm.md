---
description: >-
  Use WHEN starting brainstorm, clarifying a feature, or continuing after an
  approved brainstorm TO produce an approved spec and hand off with "Next:
  /supervibe-plan" instead of stopping. Triggers: 'brainstorm', 'next plan',
  'брейншторм', 'я сделал брейншторм', 'план'.
last-verified: "2026-05-08"
---

# /supervibe-brainstorm

Direct trigger for the `supervibe:brainstorming` skill. Use this when you want to be explicit about entering brainstorm mode rather than relying on the AI to detect it from the phrasing of your request. After the spec is approved, always hand off to planning with the exact next-step question.

## Continuation Contract

Do not stop after individual brainstorm sections such as first-principles, options, risks, matrix, or scope safety. A `/supervibe-brainstorm` invocation should complete the requirements package before handoff, unless the user explicitly stops/pauses, a single blocking ambiguity prevents the next section, or the user asks to review one section manually.

Ask one clarifying question at a time only when a decision is genuinely blocked. Otherwise use stated assumptions, mark them in the spec, finish the full package, validate it, then print the `/supervibe-plan --loop-ready --from-brainstorm <spec-path>` handoff.

## Topic Drift / Resume Contract

If the user shifts topic while a brainstorm is incomplete or a `NEXT_STEP_HANDOFF` exists, do not silently drop the saved phase. Surface the current phase, artifact path, next command, and blocker, then ask one `Step N/M` or `Step N/M` resume question with these choices: continue current brainstorm, skip/delegate safe non-final decisions to the agent and continue, pause current brainstorm and switch topic, or stop/archive the current state.

Skipped or delegated decisions must be recorded in the spec under assumptions or explicit delegations. They cannot satisfy final spec approval, safety/policy gates, production approvals, or destructive-operation consent.

## Invocation forms

### `/supervibe-brainstorm <topic>`

Examples:
- `/supervibe-brainstorm "idea"`
- `/supervibe-brainstorm payment idempotency`
- `/supervibe-brainstorm rebuilding the dashboard for editor users`
- `/supervibe-brainstorm preview-server mockups`

### `/supervibe-brainstorm` (no args)

Treat the most recent user message as the topic.

## Procedure

1. **Resolve the topic.** If `<topic>` is provided, use it verbatim. Otherwise extract intent from the latest user message. If the topic is still unclear ("just brainstorm something"), ask one clarifying question and stop.

2. **Pre-flight memory check.** Before any new dialogue, run `supervibe:project-memory` with the topic as query. If a prior decision / pattern / incident covers the same ground (similarity ≥ 0.75), surface it FIRST: "Found prior work on this — [link]. Continue brainstorming or build on it?"

3. **Invoke the `supervibe:brainstorming` skill.** It encodes the full methodology:
   - First-principle decomposition
   - Product type, MVP path, MVP readiness stage, launch model, and production owner
   - Scope Safety Gate: include/defer/reject/spike decisions, why-not rationale, and tradeoffs
   - Evidence and retrieval plan: memory, Code RAG, CodeGraph need, citations, stale checks
   - Visual explanation plan: text-first summary with a compact stage map, table, or improvised ASCII scheme. Browser previews are optional only for real UI/prototype/browser evidence; Mermaid is allowed only as an accessible fallback with `accTitle` and `accDescr`.
   - Stakeholder map
   - Competitive scan (when applicable, via `supervibe:mcp-discovery` for Firecrawl)
   - 2-3 alternative approaches with kill criteria
   - Decision matrix
   - Production readiness contract and 10/10 acceptance scorecard
   - Approved spec output

4. **Pre-documentation summary / Pre-spec summary.** Before creating any durable brainstorm documentation, produce the durable `pre-spec` summary using `scripts/lib/supervibe-post-stage-actions.mjs`: objective, chosen option, rejected/deferred scope, key risks, missing facts, evidence still needed, markdown table, ASCII lifecycle map, and stable approve/revise/stop choices. This is the user's decision point before a spec file exists.

4a. **Documentation Approval Gate.** Ask one explicit `documentation_approval` question and wait for the user choice. Do not write, save, or claim a spec until the user chooses **Create brainstorm documentation**. Valid choices:
   - **Create brainstorm documentation** - write the durable brainstorm spec.
   - **Revise before documentation** - change goals, assumptions, scope, risks, or acceptance criteria first.
   - **Show visual summary first** - produce the text-first stage map, compact table, or improvised scheme before writing the spec.
   - **Compare or research deeper** - gather more evidence before documentation.
   - **Keep summary and stop** - no durable brainstorm documentation is created.

4b. **Save the approved spec.** Only after the Documentation Approval Gate is answered with **Create brainstorm documentation**, write `.supervibe/artifacts/specs/YYYY-MM-DD-<topic-slug>-brainstorm.md`. Record the approval source in the spec as `Documentation approval source`.

5. **Machine-validate the spec.** Run `node scripts/validate-spec-artifacts.mjs --file <spec>` only at the command's validation gate. Any failure blocks the post-spec summary and handoff.

6. **Score against `requirements.yaml` rubric.** Gate >=9 to declare the spec ready for planning. <9 means iterate; <8 with explicit override must be logged to `.supervibe/confidence-log.jsonl`.

7. **Post-spec summary.** After the spec is saved, validated, and scored, produce the durable `post-spec` summary using `scripts/lib/supervibe-post-stage-actions.mjs`. It must include the spec path, source artifact hash, markdown table, ASCII lifecycle map, what was added and why, deferred/rejected scope, validation result, confidence score, and the available next actions.

8. **Mandatory next user actions.** After showing the post-spec summary, present a human-first Decision Card using `scripts/lib/supervibe-post-stage-actions.mjs`: recommendation, why, `Step N/M` question, visible choices, resume cursor, and next command. Print `NEXT_USER_ACTIONS[]` in the command output block with these visible choices and wait for one choice before moving on. In normal conversational summaries, translate the same choices into a short human-readable next-step sentence instead of exposing the raw marker:
   - **Approve spec and write plan** - run `/supervibe-plan --loop-ready --from-brainstorm <spec-path>`.
   - **Revise idea/spec** - update goals, references, assumptions, scope, or acceptance criteria before planning.
   - **Compare or research deeper** - run additional alternatives, references, risks, or specialist checks before approval.
   - **Exclude or defer items** - record out-of-scope work so it cannot enter the plan silently.
   - **Keep spec draft and stop** - save the candidate spec without planning, review, atomization, or execution.

8a. **Secondary machine-readable handoff.** Include the raw block only after the Decision Card. The raw `NEXT_STEP_HANDOFF` block is resume state, not the primary user-facing UX:

   ```text
   NEXT_STEP_HANDOFF
   Current phase: brainstorm
   Artifact: <spec-path>
   Next phase: plan
   Next command: /supervibe-plan --loop-ready --from-brainstorm <spec-path>
   Next skill: supervibe:writing-plans
   Stop condition: ask-before-plan
   Why: Brainstorm output should become a loop-ready implementation plan before graph creation.
   Question: Step N/M: writing the implementation plan?
   Choices:
   - Approve spec and write plan - run `/supervibe-plan --loop-ready --from-brainstorm <spec-path>`.
   - Revise idea/spec - change requirements before planning.
   - Compare or research deeper - gather more evidence before approval.
   - Exclude or defer items - keep them out of the next plan.
   - Keep spec draft and stop - no next workflow stage runs.
   END_NEXT_STEP_HANDOFF
   ```

9. **Hand off.** Print the spec path + `/supervibe-plan --loop-ready --from-brainstorm <spec-path>` only after the post-spec summary and Decision Card exist. Brainstorm must not silently jump to implementation.
## Output contract

```
=== Supervibe Brainstorm ===
Topic:     <one-line summary>
Spec:      .supervibe/artifacts/specs/YYYY-MM-DD-<slug>-brainstorm.md
Lines:     <count>
Approaches: <count>  (chosen: <name>)
Score:     <N>/10  Rubric: requirements
Validator: validate-spec-artifacts PASS
Production readiness: covered
Scope safety: present, with deferred/rejected additions explained
Evidence plan: memory/RAG/CodeGraph commands and citations present
Pre-spec summary: durable pre-spec summary shown before spec write, with markdown table, ASCII lifecycle map, approval choices, source prompt hash, and latest-user approval gate
Post-spec summary: source-bound post-spec summary shown after spec validation, with spec path, source artifact hash, added-and-why, deferred-and-why, validation result, table, ASCII map, and next actions
Visual explanation: text-first summary/table/stage map present; browser preview is optional only for UI/prototype/browser evidence; Mermaid fallback includes accessible title and description when used
10/10 scorecard: present

Next:      /supervibe-plan --loop-ready --from-brainstorm .supervibe/artifacts/specs/YYYY-MM-DD-<slug>-brainstorm.md
Post-documentation summary: concise human summary and next actions shown after spec creation
Decision Card: human-first recommendation, `Step N/M` question, choices, resume cursor, and next command before any raw handoff block
Documentation Approval Gate: answered before durable spec write
NEXT_USER_ACTIONS[]: approve spec and write plan | revise idea/spec | compare or research deeper | exclude or defer items | keep spec draft and stop
Handoff:   NEXT_STEP_HANDOFF with command `/supervibe-plan --loop-ready --from-brainstorm <spec-path>`
```

`NEXT_USER_ACTIONS[]` is a machine-readable command/artifact marker. Outside the command output block, summarize it as natural language and do not leave the raw marker in the user-facing prose.

## When NOT to invoke

- Bug fix or debugging — use `supervibe:systematic-debugging` (no slash command, but the AI can dispatch it)
- Routine refactor with clear scope — skip to `/supervibe-plan`
- One-line documentation tweak — just do it
- Already have an approved spec — skip to `/supervibe-plan`

## Related

- `supervibe:brainstorming` skill — the methodology this command runs
- `supervibe:project-memory` — the pre-flight similarity check
- `/supervibe-plan` — where you go next
- `docs/templates/brainstorm-output-template.md` — spec format

## Agent Orchestration Contract

This command must load its executable profile from `scripts/lib/command-agent-orchestration-contract.mjs` and follow `rules/command-agent-orchestration.md`. The profile is the source of truth for `ownerAgentId`, `agentPlan`, `requiredAgentIds`, dynamic specialist selection, default `real-agents` mode, and `agent-required-blocked` behavior.

Normal brainstorm output should capture the current understanding, key choices, recommended direction, and a direct handoff to `/supervibe-plan --loop-ready`. It must not expose command-agent plans, scoped receipt gates, validator rituals, or plugin-only role diagnostics as prerequisites for ordinary spec completion. Run `node <resolved-supervibe-plugin-root>/scripts/command-agent-plan.mjs --command /supervibe-brainstorm` only for explicit strict delegation/release evidence paths or when claiming that named specialist agents produced durable output.

When specialist output is claimed, invoke the real host agents and issue runtime receipts with `hostInvocation.source` and `hostInvocation.invocationId`. In Codex, use `spawn_agent` for explicit reviewer/worker claims and record the returned Codex agent id before issuing receipts. `inline` remains diagnostic/dry-run only; command or skill receipts do not substitute for agent, worker, or reviewer output.
## Workflow Invocation Receipts

Any claim that this command invoked another Supervibe command, skill, agent, reviewer, worker, validator, or external tool must be backed by a runtime-issued workflow receipt created with `node <resolved-supervibe-plugin-root>/scripts/workflow-receipt.mjs issue ...`. Hand-written receipts are untrusted. Agent, worker, and reviewer receipts must include `hostInvocation.source` and `hostInvocation.invocationId` from a real host dispatch; command or skill receipts must not substitute for specialist output. Scoped current-run receipts are required for active command/handoff claims; old global receipts are diagnostic only and cannot authorize a new agent-owned output. Durable specialist/release artifacts produced by this command stay linked through `.supervibe/memory/workflow-invocation-ledger.jsonl` and `artifact-links.json`; run `npm run validate:workflow-receipts` and `npm run validate:agent-producer-receipts` only in explicit verification, strict review, or release gates, not as a normal prerequisite for brainstorm-to-plan handoff.

<!-- supervibe-release-operational-markers:start -->
Release-gate operational markers: before durable agent-owned work or completion claims, run `node <resolved-supervibe-plugin-root>/scripts/command-agent-plan.mjs --command /supervibe-brainstorm` and follow the printed `SUPERVIBE_COMMAND_AGENT_PLAN`. The executable `scripts/lib/command-agent-orchestration-contract.mjs` profile and `rules/command-agent-orchestration.md` remain the source of truth for `ownerAgentId`, `agentPlan`, `requiredAgentIds`, dynamic specialist selection, default `real-agents` mode, and `agent-required-blocked` behavior. The plan must show `CALLABLE_AGENT_SOURCES`, `CALLABLE_AGENTS_READY`, `SCOPED_RECEIPT_GATE`, and `MISSING_CALLABLE_AGENTS` before any agent-owned artifact is claimed.

Invoke real host agents when specialist output is claimed and issue runtime receipts with `hostInvocation.source` and `hostInvocation.invocationId`. For Codex, use `spawn_agent` according to `CODEX_SPAWN_PAYLOAD_RULES` and `CODEX_SPAWN_PAYLOADS`: forked payloads must set `fork_context=true`, must omit `agent_type`, `model`, and `reasoning_effort`, and must encode the Supervibe logical role in the message. Record each returned Codex agent id with `node <resolved-supervibe-plugin-root>/scripts/agent-invocation.mjs log ...` before receipts are issued. `inline` is diagnostic/dry-run only. Do not emulate specialist agents, and command or skill receipts must not substitute for agent, worker, or reviewer output.
<!-- supervibe-release-operational-markers:end -->
