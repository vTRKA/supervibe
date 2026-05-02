---
description: >-
  Use WHEN starting brainstorm/брейншторм, clarifying a feature, or the user
  says "я сделал брейншторм" and needs the next plan/план step TO produce an
  approved spec and hand off with "Next: /supervibe-plan" instead of stopping.
---

# /supervibe-brainstorm

Direct trigger for the `supervibe:brainstorming` skill. Use this when you want to be explicit about entering brainstorm mode rather than relying on the AI to detect it from the phrasing of your request. After the spec is approved, always hand off to planning with the exact next-step question.

## Invocation forms

### `/supervibe-brainstorm <topic>`

Examples:
- `/supervibe-brainstorm "idea"`
- `/supervibe-brainstorm payment idempotency`
- `/supervibe-brainstorm rebuilding the dashboard for editor users`
- `/supervibe-brainstorm моки для preview-server`  *(Russian topics work — the skill is bilingual)*

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

4. **Save the spec.** The skill emits `docs/specs/YYYY-MM-DD-<topic-slug>-design.md`. The path is deterministic — no "shall we save it?" round-trip; the user already opted in by running this command.

5. **Mandatory handoff.** Print `Шаг 1/1: написать production-ready план?` with the concrete `/supervibe-plan <spec-path>` command. Do not offer direct implementation from brainstorm output.

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
Spec:      docs/specs/YYYY-MM-DD-<slug>-design.md
Lines:     <count>
Approaches: <count>  (chosen: <name>)
Score:     <N>/10  Rubric: requirements
Validator: validate-spec-artifacts PASS
Production readiness: covered
Scope safety: present, with deferred/rejected additions explained
Evidence plan: memory/RAG/CodeGraph commands and citations present
Visual explanation: diagram/table choice with accessible fallback present
10/10 scorecard: present

Next:      /supervibe-plan docs/specs/YYYY-MM-DD-<slug>-design.md
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
