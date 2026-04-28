---
name: requesting-code-review
namespace: process
description: "Use BEFORE invoking code-reviewer agent or opening a PR to prepare the review package with PR description, evidence, and changed-file scope. RU: Используется ПЕРЕД вызовом code-reviewer или открытием PR — готовит пакет на ревью: описание PR, evidence и scope изменённых файлов. Trigger phrases: 'pre-PR review', 'request review', 'запроси ревью', 'готов к ревью'."
allowed-tools: [Read, Grep, Glob, Bash, Write, Edit]
phase: review
prerequisites: [agent-output]
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1.0
last-verified: 2026-04-27
---

# Requesting Code Review

## When to invoke

BEFORE invoking `code-reviewer` agent OR before opening a PR for external review. After implementation completes but before claiming done.

## Step 0 — Read source of truth (required)

1. Read the spec/plan that motivated the change
2. Read all modified/created/deleted files (`git diff`)
3. Run full check (`npm run check` or project equivalent) — capture output
4. Take screenshots if UI change

## Decision tree

```
What's the review surface?
├─ Single small change (≤3 files, ≤100 lines) → minimal package (diff + test output)
├─ Feature (multiple files, new concept) → full PR description with What/Why/Test plan
└─ Refactor (preserve-behavior change, broad scope) → full + behavioral evidence (before/after)
```

## Procedure

1. **Collect change scope** — list every file changed with one-line description
2. **Write PR description**:
   ```markdown
   ## What
   <one sentence>

   ## Why
   <one sentence + spec link>

   ## Test plan
   - [ ] <verification step 1>
   - [ ] <verification step 2>
   ```
3. **Attach evidence**:
   - Test output (verbatim, not summarized)
   - Screenshots for UI
   - Performance numbers (before/after) for perf changes
4. **Identify reviewer agent** — `code-reviewer` for general, `security-auditor` for security-sensitive, `db-reviewer` for DB
5. **Score** — `supervibe:confidence-scoring` artifact-type=agent-output (the prepared package)
6. **Invoke reviewer** with the prepared package

## Output contract

Returns:
- PR description (Markdown)
- File changes list
- Evidence bundle (test output + screenshots + benchmarks)
- Reviewer agent identified

## Guard rails

- DO NOT: open PR without running full project checks
- DO NOT: paraphrase test output ("all tests pass" without showing the output)
- DO NOT: attach incomplete evidence (e.g., one screenshot when feature has 3 states)
- ALWAYS: link to spec/plan in PR description
- ALWAYS: include verification commands user can re-run

## Verification

- PR description has What + Why + Test plan
- Test output is verbatim
- All claims in description are supported by evidence

## Related

- `supervibe:code-review` — methodology consumed by reviewer
- `supervibe:receiving-code-review` — how to handle the resulting feedback
- `supervibe:pre-pr-check` — runs comprehensive checks before this
