---
description: "Score a finished artifact against its confidence rubric and record the outcome into agent telemetry. Use after a Task completes to lock in feedback."
---

# /supervibe-evaluate

Apply the matching confidence rubric to a finished artifact (agent output, document, scaffold, etc.) and persist the score so the evolution loop can learn from it.

## Difference from `/supervibe-score`

- `/supervibe-score` scores once, prints a number, no persistence.
- `/supervibe-evaluate` scores **and** writes the outcome into `.claude/memory/agent-invocations.jsonl` (via `updateLatestInvocation`) so the effectiveness tracker, underperformer detector, and re-dispatch suggester all see it.

## Invocation forms

### `/supervibe-evaluate` (no args)

Evaluate the most recent Task completion in this session.

### `/supervibe-evaluate <agent_id>`

Evaluate the most recent invocation of a specific agent.

### `/supervibe-evaluate <artifact-type> <path>`

Evaluate any artifact on disk, even outside an active task. Example: `/supervibe-evaluate plan docs/plans/2026-04-28-foo.md`.

## Procedure

1. **Pick the rubric.** Map artifact-type → rubric file in `confidence-rubrics/`:
   - agent-delivery → `agent-delivery.yaml` (default for Task outputs)
   - plan → `plan.yaml`
   - prd → `requirements.yaml`
   - scaffold → `scaffold.yaml`
   - prototype → `prototype.yaml`
   - research → `research-output.yaml`
   - memory-entry → `memory-entry.yaml`
   - brandbook → `brandbook.yaml`

2. **Invoke `supervibe:confidence-scoring` skill.** Pass: artifact content, rubric path, optional context. The skill returns dimension-by-dimension scores, weighted total, and explicit evidence per dimension.

3. **Apply the gate.** If total < 9 AND no override is set → print the failing dimensions and stop. If 8.x with override → log to `.claude/confidence-log.jsonl` with reason. If ≥9 → mark accepted.

4. **Persist into telemetry.** Call `updateLatestInvocation({ outcome: 'accept'|'review'|'reject', user_feedback: <one-line summary> })` from `scripts/lib/agent-invocation-logger.mjs`. This is what closes the evolution loop — the effectiveness tracker reads `outcome` into agent frontmatter on `Stop` hook.

5. **Print the breakdown.** Show the user every dimension's score + the cited evidence so they can challenge any line.

## Output contract

```
=== Evolve Evaluate ===
Artifact:     <path or task summary>
Rubric:       <name>.yaml
Total:        <N>/10  (gate: ≥9)

Dimensions:
  <id-1>           weight=<w>  score=<n>   <evidence ref>
  <id-2>           weight=<w>  score=<n>   <evidence ref>
  ...

Outcome:      accept | review | reject
Logged to:    .claude/memory/agent-invocations.jsonl

Confidence:   <N>/10
Override:     <true|false>
Rubric:       <rubric-id>
```

## When NOT to invoke

- One-off "is this thing OK?" check — `/supervibe-score` is faster, no persistence.
- You already have a low score and want to fix the agent — go to `/supervibe-strengthen`.
- The artifact is half-done — wait until it is finished; rubrics don't make sense on partial work.

## Related

- `supervibe:evaluate` skill — methodology for picking rubrics + applying them
- `supervibe:confidence-scoring` skill — does the actual rubric application
- `/supervibe-score` — scoring without persistence
- `/supervibe-override` — record an explicit override when accepting <9
