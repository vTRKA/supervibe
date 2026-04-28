---
description: >-
  Explicit entry-point for the brainstorming skill — collaborative dialogue that
  ends with an approved spec at docs/specs/. Use to remove ambiguity before any
  creative work.
---

# /evolve-brainstorm

Direct trigger for the `evolve:brainstorming` skill. Use this when you want to be explicit about entering brainstorm mode rather than relying on the AI to detect it from the phrasing of your request.

## Invocation forms

### `/evolve-brainstorm <topic>`

Examples:
- `/evolve-brainstorm payment idempotency`
- `/evolve-brainstorm rebuilding the dashboard for editor users`
- `/evolve-brainstorm моки для preview-server`  *(Russian topics work — the skill is bilingual)*

### `/evolve-brainstorm` (no args)

Treat the most recent user message as the topic.

## Procedure

1. **Resolve the topic.** If `<topic>` is provided, use it verbatim. Otherwise extract intent from the latest user message. If the topic is still unclear ("just brainstorm something"), ask one clarifying question and stop.

2. **Pre-flight memory check.** Before any new dialogue, run `evolve:project-memory` with the topic as query. If a prior decision / pattern / incident covers the same ground (similarity ≥ 0.75), surface it FIRST: "Found prior work on this — [link]. Continue brainstorming or build on it?"

3. **Invoke the `evolve:brainstorming` skill.** It encodes the full methodology:
   - First-principle decomposition
   - Stakeholder map
   - Competitive scan (when applicable, via `evolve:mcp-discovery` for Firecrawl)
   - 2-3 alternative approaches with kill criteria
   - Decision matrix
   - Approved spec output

4. **Save the spec.** The skill emits `docs/specs/YYYY-MM-DD-<topic-slug>-design.md`. The path is deterministic — no "shall we save it?" round-trip; the user already opted in by running this command.

5. **Score against `requirements.yaml` rubric.** Gate ≥9 to declare done. <9 → iterate; <8 with explicit override → log to `.claude/confidence-log.jsonl`.

6. **Hand off.** Print the spec path + the recommended next step:
   - Complexity 1-2 → just implement directly
   - Complexity 3-6 → `/evolve-plan <spec-path>`
   - Complexity 7+ → `/evolve-plan <spec-path>` plus parallelization analysis

## Output contract

```
=== Evolve Brainstorm ===
Topic:     <one-line summary>
Spec:      docs/specs/YYYY-MM-DD-<slug>-design.md
Lines:     <count>
Approaches: <count>  (chosen: <name>)
Score:     <N>/10  Rubric: requirements

Next:      /evolve-plan docs/specs/YYYY-MM-DD-<slug>-design.md
```

## When NOT to invoke

- Bug fix or debugging — use `evolve:systematic-debugging` (no slash command, but the AI can dispatch it)
- Routine refactor with clear scope — skip to `/evolve-plan`
- One-line documentation tweak — just do it
- Already have an approved spec — skip to `/evolve-plan`

## Related

- `evolve:brainstorming` skill — the methodology this command runs
- `evolve:project-memory` — the pre-flight similarity check
- `/evolve-plan` — where you go next
- `docs/templates/brainstorm-output-template.md` — spec format
