---
description: >-
  Explicit entry-point for the brainstorming skill — collaborative dialogue that
  ends with an approved spec at docs/specs/. Use to remove ambiguity before any
  creative work.
---

# /supervibe-brainstorm

Direct trigger for the `supervibe:brainstorming` skill. Use this when you want to be explicit about entering brainstorm mode rather than relying on the AI to detect it from the phrasing of your request.

## Invocation forms

### `/supervibe-brainstorm <topic>`

Examples:
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
   - Stakeholder map
   - Competitive scan (when applicable, via `supervibe:mcp-discovery` for Firecrawl)
   - 2-3 alternative approaches with kill criteria
   - Decision matrix
   - Approved spec output

4. **Save the spec.** The skill emits `docs/specs/YYYY-MM-DD-<topic-slug>-design.md`. The path is deterministic — no "shall we save it?" round-trip; the user already opted in by running this command.

5. **Machine-validate the spec.** Run `node scripts/validate-spec-artifacts.mjs --file <spec>`. Any failure blocks handoff.

6. **Score against `requirements.yaml` rubric.** Gate ≥9 to declare done. <9 → iterate; <8 with explicit override → log to `.claude/confidence-log.jsonl`.

7. **Hand off.** Print the spec path + the recommended next step:
   - Complexity 1-2 → just implement directly
   - Complexity 3-6 → `/supervibe-plan <spec-path>`
   - Complexity 7+ → `/supervibe-plan <spec-path>` plus parallelization analysis

## Output contract

```
=== Supervibe Brainstorm ===
Topic:     <one-line summary>
Spec:      docs/specs/YYYY-MM-DD-<slug>-design.md
Lines:     <count>
Approaches: <count>  (chosen: <name>)
Score:     <N>/10  Rubric: requirements
Validator: validate-spec-artifacts PASS

Next:      /supervibe-plan docs/specs/YYYY-MM-DD-<slug>-design.md
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
