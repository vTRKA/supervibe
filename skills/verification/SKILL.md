---
name: verification
namespace: process
description: "Use BEFORE any claim of works/fixed/complete/passing/done to run a verification command and show its output as evidence — bans assertion without command output. RU: Используется ПЕРЕД любым заявлением 'работает/починено/готово/проходит' — запускает команду верификации и показывает её вывод как evidence; запрещает утверждения без вывода команды. Trigger phrases: 'проверь', 'evidence', 'докажи что работает', 'верификация'."
allowed-tools: [Bash, Read]
phase: review
prerequisites: []
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: false
version: 1.0
last-verified: 2026-04-27
---

# Verification

## When to invoke

ALWAYS, before saying any of: "works", "fixed", "complete", "passing", "done", "ready", "shipped", "merged", "deployed".

The single line that calls this skill: **evidence before assertion, always.**

## Step 0 — Read source of truth (required)

Read:
- The project's `CLAUDE.md` to find the canonical verification commands for this stack (typecheck, test, lint, build).
- Any `package.json` scripts / `composer.json` scripts / `Makefile` targets that the project blesses for verification.

If no canonical commands documented: STOP and ask the user which commands count as verification for this project.

## Decision tree

```
What is being claimed?
├─ Code change                  → run typecheck + tests + lint, show output
├─ Bug fix                      → run the failing test, show pre-fix FAIL + post-fix PASS
├─ Performance improvement      → run benchmark BEFORE and AFTER, show numbers
├─ Build / CI passes            → run the build command, show exit code 0
├─ Visual / UI change           → take screenshot, paste path; or open in browser, describe what user sees
├─ Documentation accurate       → grep the documented thing exists, show match
└─ External call works (API)    → run the call, show response
```

## Procedure

1. **Identify the claim** — what exactly is being asserted?
2. **Choose verification command(s)** from CLAUDE.md / project conventions.
3. **Run via Bash tool** (do NOT skip — assertion-without-running is a discipline violation).
4. **Capture output** — full stdout/stderr, exit code.
5. **Decide**:
   - Verification PASSED → claim is supported. Include command + output in delivery.
   - Verification FAILED → claim is INVALID. Do NOT make the claim. Return to debugging.
6. **Emit artifact** — verification record:
   ```
   Claim: <what was claimed>
   Command: <exact command run>
   Exit code: <0 or N>
   Output (verbatim):
     <captured output>
   Verdict: PASS | FAIL
   ```

## Output contract

Returns:
- `verdict`: `PASS` or `FAIL`
- `claim`: original claim string
- `command`: exact command executed
- `exit-code`: integer
- `output`: full stdout+stderr verbatim

If verdict is `FAIL`, the calling agent MUST NOT proceed with the claim.

## Guard rails

- DO NOT: claim a thing works without running the command
- DO NOT: paraphrase or summarize the command output — paste verbatim
- DO NOT: invent the verification command — read it from CLAUDE.md or ask
- DO NOT: skip verification because "this is obviously fine"
- ALWAYS: include exit code in the verification record
- ALWAYS: if there's no canonical command, ask before assuming

## Verification (of this skill itself)

This skill's correct application is itself verifiable:
- Every "done" claim in conversation history MUST be preceded by a Bash tool call with output shown.
- `supervibe:audit` includes a discipline check: scan transcripts for "done"/"works"/"fixed" claims and check the preceding 5 messages for verification command output.

## Related rules

- `confidence-discipline.md` — the broader gate this skill enforces at the per-claim level
- `anti-hallucination.md` — verification is the antidote to hallucination
