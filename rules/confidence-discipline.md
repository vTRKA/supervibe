---
name: confidence-discipline
description: >-
  Every artifact (spec, plan, code, scaffold) must score ≥9 against its rubric
  before claiming done; <9 requires an explicit override reason recorded by the
  confidence gate. Triggers: 'confidence', 'оценка', 'rubric'.
applies-to:
  - any
mandatory: true
version: 1
last-verified: 2026-04-27T00:00:00.000Z
related-rules:
  - anti-hallucination
  - no-dead-code
  - commit-discipline
---

# Confidence Discipline

## Why this rule exists

Without measurable quality gates, "done" means whatever the agent feels like meaning. The 10-point confidence engine (Phase 0+1 of Supervibe) provides per-artifact rubrics with concrete dimensions; this rule enforces them as gates.

Concrete consequence of NOT following: shipped half-done features, plans skipping verification, agents claiming completion without evidence.

## When this rule applies

- ALL artifacts produced by Supervibe agents/skills:
  - requirements-spec (after brainstorming/intake)
  - implementation-plan (after writing-plans)
  - agent-output (after each task)
  - scaffold-bundle (after genesis)
  - prototype (after prototype skill)
  - research-output (after research agents)
  - brandbook (after brandbook skill)

This rule does NOT apply when: an explicit override reason was recorded in `.supervibe/confidence-log.jsonl`.

## What to do

1. Every skill marked `gate-on-exit: true` MUST invoke `supervibe:confidence-scoring` before exit
2. If score <9 → loop back, identify gaps, address, re-score
3. If a confidence gate offers an override path and the user explicitly accepts:
   - Reason ≥10 chars REQUIRED
   - Entry appended to `.supervibe/confidence-log.jsonl`
   - User-confirmed flag set
4. If override rate >5% over last 100 entries → `supervibe:audit` flags systemic issue

## Examples

### Bad

```
Agent completes implementation, says "Done. Tests pass."
[no confidence-scoring invoked, no rubric applied, no evidence beyond claim]
```

Why this is bad: discipline-free completion claim. Could be wrong about anything.

### Good

```
Agent completes implementation.
Invokes supervibe:confidence-scoring with artifact-type=agent-output.
Result: { score: 9, status: PASS, dimensions: [...], evidence: [...] }
Output:
  Verification: npm test passed (output: 47/47)
  Code review: code-reviewer agent APPROVED (link to review)
  Confidence: 9/10 (gap: dim 'regression-clean' partial — 1 doc string not updated)
Status: DONE.
```

Why this is good: gate invoked, score recorded, gaps disclosed.

### Good (with override)

```
Agent completes prototype implementation.
Score: 7/10 (state coverage 1/2 — missing error state for offline scenario).
User: override because "shipping prototype for stakeholder review; offline state deferred to v2"
Confidence-log entry appended.
Status: DONE WITH OVERRIDE.
```

Why this is good: override recorded with reason ≥10 chars, traceable in audit.

## Enforcement

- `supervibe:confidence-scoring` skill performs the scoring
- Skills with `gate-on-exit: true` cannot exit without invoking it
- Internal override logging requires reason ≥10 chars
- `.supervibe/confidence-log.jsonl` is append-only (rule itself + git commits)
- `supervibe:audit` periodically checks override rate

## Related rules

- `anti-hallucination` — evidence-before-claim (one input to scoring)
- `no-dead-code` — affects agent-quality dim "size-and-shape"
- `commit-discipline` — commits with override notes reference confidence log

## See also

- `confidence-rubrics/` — all 14 rubrics
- `skills/confidence-scoring/SKILL.md`
- `references/internal-commands/supervibe-override.md`
