---
name: verification
namespace: process
description: 'Use BEFORE any claim of works/fixed/complete/passing/done to run a verification command and show its output as evidence — bans assertion without command output. Triggers: ''проверь'', ''evidence'', ''докажи что работает'', ''верификация''.'
allowed-tools:
  - Bash
  - Read
phase: review
prerequisites: []
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: false
version: 1
last-verified: 2026-04-27T00:00:00.000Z
---

# Verification

## Overview

Verification provides a reusable Supervibe operating method for Use BEFORE any claim of works/fixed/complete/passing/done to run a verification command and show its output as evidence — bans assertion without command output. Triggers: 'проверь', 'evidence', 'докажи что работает', 'верификация'.
It keeps the work evidence-first, scope-bounded, confidence-scored, and verified before completion claims.
## When to Use

ALWAYS, before saying any of: "works", "fixed", "complete", "passing", "done", "ready", "shipped", "merged", "deployed".

The single line that calls this skill: **evidence before assertion, always.**

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source of truth, preserve retrieval evidence, apply scope safety, use real producers with runtime receipts for durable delegated outputs, verify before completion claims, and keep confidence below gate when evidence is partial.

## Step 0 — Read source of truth (required)

Read:
- The project's active host instruction file to find the canonical verification commands for this stack (typecheck, test, lint, build).
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
2. **Choose verification command(s)** from the active host instruction file / project conventions.
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

## Examples

- Use at the correct gate: run targeted checks during implementation and full checks only after the graph or release slice is complete.
- Do not claim success from prose alone when a command, screenshot, receipt, or artifact can verify the result.

## When not to use

- Do not use this skill to bypass the command or workflow that owns durable artifacts.
- Do not use it when source evidence, RAG/CodeGraph, or required verification is missing.
- Do not use it to replace a specialist producer, worker, or reviewer that must issue runtime evidence.

## Common rationalizations

- "The change is obvious, so no command is needed" fails because the verifier
  must prove the specific claim or explicitly cap confidence when proof is not
  available.
- "A broad check passed, so the touched behavior is covered" fails unless the
  command actually exercises the changed files, route, artifact, or workflow
  contract.
- "A failed command is unrelated" fails without a pre-change baseline, changed
  path analysis, or task evidence showing the failure predates the current work.

## Red flags

- A completion claim names no exact command, exit code, artifact, screenshot,
  receipt, or manual evidence path.
- Verification output is summarized as "green" while stderr, skipped tests,
  stale indexes, or partial browser/runtime evidence are omitted.
- Full release checks are run inside child tasks while targeted checks for the
  edited module are missing, or the final release gate is skipped at handoff.

## Checklist

- Source of truth read.
- Scope and owner confirmed.
- RAG/CodeGraph/memory requirement decided.
- Evidence artifact or command recorded.
- Stop condition and next handoff clear.

## Failure modes

- Inline emulation replaces a required producer or reviewer.
- Broad use of the skill slows delivery without improving evidence.
- Missing verification lets stale assumptions pass as production-ready.

## Output contract

Returns:
- `verdict`: `PASS` or `FAIL`
- `claim`: original claim string
- `command`: exact command executed
- `exit-code`: integer
- `output`: full stdout+stderr verbatim

If verdict is `FAIL`, the calling agent MUST NOT proceed with the claim.

## Failure Reporting Discipline

When verification is run after scaffold/genesis/adapt work, keep tool verification separate from project application health:

- If the Supervibe/index/status command passes but an application build/typecheck fails, do not downgrade the scaffold/index claim. Report a separate `Project verification failed after genesis` section.
- Include the command, exit code, and the failing repo-relative file paths and TypeScript/lint/test diagnostics needed for the user to act.
- Do not include absolute local paths, machine usernames, or project names in user-facing summaries, commits, changelogs, memories, or release notes.
- Do not say a failure is "unrelated" unless you captured a pre-change baseline showing the same failure before the Supervibe action. Prefer "separate existing project verification failure" when the evidence is only that the failing files were outside the changed Supervibe scaffold surface.

## Guard rails

- DO NOT: claim a thing works without running the command
- DO NOT: paraphrase or summarize the command output — paste verbatim
- DO NOT: invent the verification command — read it from the active host instruction file or ask
- DO NOT: skip verification because "this is obviously fine"
- ALWAYS: include exit code in the verification record
- ALWAYS: if there's no canonical command, ask before assuming

## Verification

This skill's correct application is itself verifiable:
- Every "done" claim in conversation history MUST be preceded by a Bash tool
  call, browser/runtime proof, receipt validator, or named manual inspection
  with output recorded.
- Run targeted commands such as `node --test tests/<name>.test.mjs`,
  `npm run validate:workflow-receipts`, `npm run validate:artifact-links`, or
  the stack-specific test command selected by the active task.
- Run `npm run check` only at release handoff or when the task explicitly
  requires a full gate.
- `supervibe:audit` includes a discipline check: scan transcripts for
  completion claims and check the preceding evidence for verification output.

## Related rules

- `confidence-discipline.md` — the broader gate this skill enforces at the per-claim level
- `anti-hallucination.md` — verification is the antidote to hallucination
