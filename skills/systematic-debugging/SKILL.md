---
name: systematic-debugging
namespace: process
description: "Use WHEN encountering any bug, test failure, or unexpected behavior BEFORE proposing fixes to enforce hypothesis-evidence-isolation methodology. RU: Используется КОГДА встречен баг, упавший тест или неожиданное поведение ПЕРЕД предложением фиксов — навязывает методологию hypothesis → evidence → isolation. Trigger phrases: 'дебаг', 'почему сломалось', 'найди корень', 'разбери баг'."
allowed-tools: [Read, Grep, Glob, Bash]
phase: exec
prerequisites: []
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1.0
last-verified: 2026-04-27
---

# Systematic Debugging

## When to invoke

WHEN ANY of: a bug is reported, a test fails, code behaves unexpectedly, a build breaks, a deploy fails. BEFORE proposing or making any fix.

This skill bans "guess and check" debugging.

## Step 0 — Read source of truth (required)

1. Reproduce the issue first — run the exact failing command, capture output verbatim
2. Read the error message in full (don't paraphrase)
3. Read the failing code path AND its callers (Grep + Read)
4. Read recent commits in the affected file (`git log -p`)
5. If test failure: read the test, the implementation it exercises, and the test fixtures

## Decision tree

```
What kind of bug?
├─ Logic error (wrong output for given input) → trace data flow with Read+Grep, find divergence
├─ Concurrency (race, deadlock, lost update) → identify shared state, locks, ordering
├─ State (wrong DB content, stale cache) → query the state directly, compare expected vs actual
├─ Integration (network, DB, external API) → reproduce at boundary, log raw payloads
├─ Performance (slow, OOM) → profiler / benchmark BEFORE making changes
└─ Build / config (typecheck, lint, deps) → read tool output verbatim, follow exact instruction
```

## Procedure

1. **Symptom** — write down EXACTLY what is observed (one sentence)
2. **Hypotheses** — list at most 3 possible causes (more = thinking is too shallow)
3. **Evidence** — for each hypothesis, identify what evidence would confirm/refute it
4. **Gather evidence** — Read/Grep/Bash to collect
5. **Isolation** — narrow to smallest reproducer (single test, minimal input, single function)
6. **Minimal fix** — propose smallest change that addresses root cause (NOT symptom)
7. **Verify** — run failing test/command; show pre-fix FAIL + post-fix PASS
8. **Score** — `supervibe:confidence-scoring` artifact-type=agent-output; gate ≥9
9. **Postmortem note** — if non-trivial bug, add a one-liner to project's MEMORY.md or rules

## Output contract

Returns:
- Symptom statement
- Hypotheses considered (with evidence outcomes)
- Root cause identified
- Minimal fix (diff or code block)
- Verification output (pre + post)

## Guard rails

- DO NOT: propose fix before confirming root cause
- DO NOT: rewrite when a localized fix exists
- DO NOT: suppress symptoms (try/catch around the error, ignore failing test)
- DO NOT: blame "flaky test" without isolating
- DO NOT: list >3 hypotheses (sign of confused thinking — slow down)
- ALWAYS: reproduce first
- ALWAYS: distinguish root cause from symptom

## Verification

- Pre-fix FAIL output shown
- Post-fix PASS output shown
- Test count unchanged or increased (no tests deleted)
- Fix is minimal (diff scope matches root cause scope)

## Related

- `supervibe:verification` — invoked to prove fix works
- `supervibe:tdd` — preferred next step (write regression test before fix)
- `supervibe:requesting-code-review` — for non-trivial fixes
