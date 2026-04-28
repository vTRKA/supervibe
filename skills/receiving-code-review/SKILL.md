---
name: receiving-code-review
namespace: process
description: "Use WHEN receiving code review feedback BEFORE implementing suggestions to evaluate each finding with technical rigor instead of performative agreement. RU: Используется КОГДА получен фидбэк code review ПЕРЕД внедрением правок — оценивает каждое замечание с технической строгостью, без показного согласия. Trigger phrases: 'обработай review', 'feedback', 'комменты с PR', 'разбери ревью'."
allowed-tools: [Read, Grep, Glob, Bash, Edit]
phase: review
prerequisites: []
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1.0
last-verified: 2026-04-27
---

# Receiving Code Review

## When to invoke

WHEN receiving review feedback (from `code-reviewer` agent, human reviewer, or automated checks). BEFORE implementing any suggestion blindly.

This skill bans performative agreement ("I'll fix everything you said") and demands technical evaluation per finding.

## Step 0 — Read source of truth (MANDATORY)

1. Read the full review report (don't skim)
2. Read the original spec/plan to understand intent
3. Read the code each finding references
4. Note severity per finding (CRITICAL/MAJOR/MINOR/SUGGESTION)

## Decision tree

```
Per finding, classify:
├─ AGREE — finding correct, fix straightforward → schedule fix
├─ AGREE-WITH-AMENDMENT — finding correct but suggested fix wrong → fix with note
├─ DISAGREE — finding based on misunderstanding → write counterargument with evidence
├─ CLARIFY — finding ambiguous → ask reviewer specific question
└─ DEFER — finding valid but out-of-scope → file follow-up issue
```

## Procedure

1. **Read review** (Step 0)
2. **Classify each finding** using decision tree
3. **For AGREE**: implement fix, run verification
4. **For AGREE-WITH-AMENDMENT**: implement variant, document why
5. **For DISAGREE**: write 2-3 sentence counterargument with code/spec references
6. **For CLARIFY**: ask reviewer one question per ambiguity
7. **For DEFER**: create issue/note in `docs/follow-ups.md`
8. **Mark each finding resolved** with link to evidence (commit/PR/issue)
9. **Score** — `evolve:confidence-scoring` artifact-type=agent-output; ≥9 required
10. **Re-invoke reviewer** if substantive changes made

## Output contract

Returns per-finding resolution table:
```
| Finding | Classification | Action | Evidence |
| #1 ...  | AGREE          | fixed  | abc1234  |
| #2 ...  | DISAGREE       | <argument> | spec.md L42 |
| #3 ...  | DEFER          | follow-up issue #N | docs/follow-ups.md |
```

## Guard rails

- DO NOT: blindly implement every suggestion (over-engineering risk)
- DO NOT: dismiss findings without writing counterargument
- DO NOT: ignore CRITICAL findings (must AGREE or escalate)
- DO NOT: claim "fixed" without verification command output
- ALWAYS: classify every finding (no "I'll think about it")
- ALWAYS: ask specific questions for CLARIFY (not "what do you mean?")

## Verification

- Every finding has classification + action + evidence
- All AGREE/AGREE-WITH-AMENDMENT have verification output
- All DISAGREE have written counterargument
- No finding left unaddressed

## Related

- `evolve:code-review` — produces input
- `evolve:requesting-code-review` — opposite flow
- `evolve:systematic-debugging` — used when finding reveals real bug
