---
description: >-
  Use WHEN starting brainstorm, clarifying a feature, or continuing after an
  approved brainstorm TO produce an approved spec and hand off with "Next:
  /supervibe-plan" instead of stopping. Triggers: 'brainstorm', 'next plan',
  'брейншторм', 'я сделал брейншторм', 'план'.
---

# /supervibe-brainstorm

Direct trigger for the `supervibe:brainstorming` skill. Use this when you want to be explicit about entering brainstorm mode rather than relying on the AI to detect it from the phrasing of your request. After the spec is approved, always hand off to planning with the exact next-step question.

## Continuation Contract

Do not stop after individual brainstorm sections such as first-principles, options, risks, matrix, or scope safety. A `/supervibe-brainstorm` invocation should complete the requirements package before handoff, unless the user explicitly stops/pauses, a single blocking ambiguity prevents the next section, or the user asks to review one section manually.

Ask one clarifying question at a time only when a decision is genuinely blocked. Otherwise use stated assumptions, mark them in the spec, finish the full package, validate it, then print the `/supervibe-plan <spec-path>` handoff.

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
   - Product type, MVP path, SDLC stage, launch model, and production owner
   - Scope Safety Gate: include/defer/reject/spike decisions, why-not rationale, and tradeoffs
   - Evidence and retrieval plan: memory, Code RAG, CodeGraph need, citations, stale checks
   - Visual explanation plan: Mermaid/table choice with `accTitle`, `accDescr`, and text fallback
   - Stakeholder map
   - Competitive scan (when applicable, via `supervibe:mcp-discovery` for Firecrawl)
   - 2-3 alternative approaches with kill criteria
   - Decision matrix
   - Production readiness contract and 10/10 acceptance scorecard
   - Approved spec output

4. **Save the spec.** The skill emits `.supervibe/artifacts/specs/YYYY-MM-DD-<topic-slug>-design.md`. The path is deterministic — no "shall we save it?" round-trip; the user already opted in by running this command.

5. **Mandatory handoff.** Print `Step 1/1: write the production-ready plan?` with the concrete `/supervibe-plan <spec-path>` command. Do not offer direct implementation from brainstorm output.

5a. **Machine-readable handoff.** Include:

   ```text
   NEXT_STEP_HANDOFF
   Current phase: brainstorm
   Artifact: <spec-path>
   Next phase: plan
   Next command: /supervibe-plan <spec-path>
   Next skill: supervibe:writing-plans
   Stop condition: ask-before-plan
   Why: Brainstorm output must become a reviewed implementation plan before execution.
   Question: Step 1/1: writing the implementation plan?
   END_NEXT_STEP_HANDOFF
   ```

5. **Machine-validate the spec.** Run `node scripts/validate-spec-artifacts.mjs --file <spec>`. Any failure blocks handoff.

6. **Score against `requirements.yaml` rubric.** Gate ≥9 to declare done. <9 → iterate; <8 with explicit override → log to `.supervibe/confidence-log.jsonl`.

7. **Hand off.** Print the spec path + `/supervibe-plan <spec-path>` for every completed brainstorm unless the user explicitly cancels planning. Small changes may get a compact plan, but brainstorm must not silently jump to implementation.

## Output contract

```
=== Supervibe Brainstorm ===
Topic:     <one-line summary>
Spec:      .supervibe/artifacts/specs/YYYY-MM-DD-<slug>-design.md
Lines:     <count>
Approaches: <count>  (chosen: <name>)
Score:     <N>/10  Rubric: requirements
Validator: validate-spec-artifacts PASS
Production readiness: covered
Scope safety: present, with deferred/rejected additions explained
Evidence plan: memory/RAG/CodeGraph commands and citations present
Visual explanation: diagram/table choice with accessible fallback present
10/10 scorecard: present

Next:      /supervibe-plan .supervibe/artifacts/specs/YYYY-MM-DD-<slug>-design.md
Handoff:   NEXT_STEP_HANDOFF with command `/supervibe-plan <spec-path>`
```

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

## Workflow Invocation Receipts

Any claim that this command invoked another Supervibe command, skill, agent, reviewer, worker, validator, or external tool must be backed by a runtime-issued workflow receipt created with `node <resolved-supervibe-plugin-root>/scripts/workflow-receipt.mjs issue ...`. Hand-written receipts are untrusted. Agent, worker, and reviewer receipts must include `hostInvocation.source` and `hostInvocation.invocationId` from a real host dispatch; command or skill receipts must not substitute for specialist output. Durable artifacts produced by this command must stay linked through `.supervibe/memory/workflow-invocation-ledger.jsonl` and `artifact-links.json`; run `npm run validate:workflow-receipts` and `npm run validate:agent-producer-receipts` before claiming the command, delegated stage, or produced artifact is complete.
