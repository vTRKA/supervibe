---
name: confidence-scoring
namespace: process
description: "Use BEFORE exiting any process skill that emits an artifact (requirements-spec, plan, agent-output, scaffold, prototype, research-output) to score it against its rubric and gate progression. RU: Используется ПЕРЕД выходом из любого process-скилла, выдающего артефакт (requirements/plan/output/scaffold/prototype/research) — оценивает по рубрике и гейтит дальнейшие шаги. Trigger phrases: 'оцени по рубрике', 'confidence score', 'оцени уверенность', 'rubric check'."
allowed-tools: [Read, Bash]
phase: review
prerequisites: []
emits-artifact: confidence-score
confidence-rubric: null
gate-on-exit: false
version: 1.0
last-verified: 2026-04-27
---

# Confidence Scoring

## When to invoke

EVERY skill marked `gate-on-exit: true` MUST invoke this skill before completing.

Direct invocation: `/supervibe-score <artifact-type> [path-to-artifact]` from the user.

## Step 0 — Read source of truth (required)

1. Read `confidence-rubrics/<artifact-type>.yaml` for the rubric matching the artifact being scored.
2. Read the artifact itself.
3. Read `.claude/confidence-log.jsonl` (if exists) for context on prior scoring history.

If rubric file does not exist: STOP — caller passed an unknown artifact type.

## Decision tree

```
For each dimension in rubric:
├─ Evidence exists in artifact?
│   ├─ YES, fully meets evidence-required → score = full weight
│   ├─ YES, partially meets               → score = weight / 2 (half credit, round down)
│   └─ NO                                 → score = 0
└─ Sum weighted scores → total_score (0..max-score)

Compare total_score to gates:
├─ total_score >= warn-below   → status = PASS
├─ block-below ≤ total_score < warn-below → status = WARN
└─ total_score < block-below   → status = BLOCK
```

## Procedure

1. **Load rubric** from `confidence-rubrics/<artifact-type>.yaml`
2. **Load artifact** content
3. **For each dimension**:
   a. Read `evidence-required` field
   b. Search artifact (and any cited evidence files) for that evidence
   c. Decide: full / half / none → assign score
   d. Record reason in scoring log
4. **Sum scores**, compare to gates, decide status
5. **Build output** (see Output contract)
6. **If status is BLOCK**:
   - Return BLOCK to caller (caller MUST NOT claim done)
   - Suggest concrete remediation per failed dimension
7. **If status is WARN**:
   - Return WARN, caller may proceed but should document the gap
8. **If status is PASS**: return PASS

## Output contract

Returns JSON-shaped object:

```
{
  "artifact-type": "requirements-spec",
  "artifact-ref": "docs/specs/2026-04-27-foo.md",
  "score": 8,
  "max-score": 10,
  "status": "BLOCK",  // PASS | WARN | BLOCK
  "dimensions": [
    {"id": "clarity", "score": 2, "max": 2, "evidence-found": "..."},
    {"id": "completeness", "score": 1, "max": 2, "evidence-found": "partial; missing race conditions"}
  ],
  "gaps": [
    {"dimension": "completeness", "missing": "race condition handling enumeration"}
  ],
  "remediation": [
    "Add 'Edge cases / Concurrency' subsection with explicit race scenarios"
  ]
}
```

If status is BLOCK and no explicit override was recorded by the calling command, the calling skill MUST loop back rather than claim completion.

## Guard rails

- DO NOT: invent evidence that isn't in the artifact (anti-hallucination).
- DO NOT: round scores up — always round down for partial credit.
- DO NOT: change rubric on the fly — if rubric needs updating, that's a separate `supervibe:strengthen` job.
- DO NOT: persist scores anywhere — scoring is stateless. Score/override decisions are persisted by the caller command, not by this skill.
- ALWAYS: include `evidence-found` per dimension so the user can audit the score.
- ALWAYS: if `block-below = warn-below = 10`, the only PASS is exactly 10/10.

## Override interaction

If a confidence gate accepts an explicit override reason, the caller appends to `.claude/confidence-log.jsonl`. This skill does NOT consult or alter the override log — overrides are a caller-side decision to ignore the BLOCK return.

The append-only log allows `/supervibe-audit` to compute override-rate later.

## Verification (of this skill itself)

This skill's correctness can be verified by:
- Run on a known-good artifact with full evidence → expect PASS at max-score.
- Run on a known-bad artifact with no evidence → expect BLOCK at low score.
- Run on a partial artifact → expect WARN with specific gaps.

## Related skills

- `supervibe:verification` — operates at per-claim level; this skill operates at per-artifact level.
- `supervibe:requirements-intake` (Phase 2) — consumes this skill at exit.
- `supervibe:writing-plans` (Phase 2) — consumes this skill at exit.
