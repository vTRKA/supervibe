---
name: pre-pr-check
namespace: process
description: >-
  Use BEFORE opening any PR or merging to main to run mandatory checks
  (typecheck, test, lint, dep audit, security scan) and capture evidence.
  Triggers: 'перед PR', 'pre-merge check', 'check before PR', 'пред-PR
  проверки'.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
phase: review
prerequisites: []
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1
last-verified: 2026-04-27T00:00:00.000Z
---

# Pre-PR Check

## When to invoke

BEFORE opening a PR, BEFORE merging to main, BEFORE pushing to a tracked branch. Invoked by `supervibe:finishing-a-development-branch` and `supervibe:requesting-code-review`.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source of truth, preserve retrieval evidence, apply scope safety, use real producers with runtime receipts for durable delegated outputs, verify before completion claims, and keep confidence below gate when evidence is partial.

## Step 0 — Read source of truth (required)

1. Read project's check command(s) from the active host instruction file or `package.json`/`composer.json`/`Cargo.toml`/`Makefile`
2. Identify stack (decides which checks apply)
3. Note any project-specific gates (e.g., bundle size budget, coverage threshold)

## Decision tree

```
What stack determines which checks?
├─ Node.js → tsc --noEmit + npm test + npm run lint + npm audit + bundle-size (if applicable); never auto-apply `npm audit fix --force` when it downgrades a framework major/minor line
├─ Python → mypy + pytest + ruff + pip-audit + safety check
├─ PHP → phpstan + pest/phpunit + pint + composer audit
├─ Go → go vet + go test + golangci-lint + govulncheck
├─ Rust → cargo check + cargo test + cargo clippy + cargo audit
└─ Mixed → all above for each detected stack
```

## Procedure

1. **Run stack-appropriate checks** sequentially (parallel risks output mixing)
2. **Capture each output verbatim** (no paraphrasing)
3. **Decide pass/fail per check**:
   - Typecheck: 0 errors
   - Tests: 0 failures, 0 regressions
   - Lint: 0 errors (warnings may be allowed per project)
   - Audit: 0 high+critical vulns
4. **If ANY fail** → STOP, return failure with output; caller must fix
5. **If ALL pass** → emit evidence bundle
6. **Score** — `supervibe:confidence-scoring` artifact-type=agent-output; ≥9 required

## Examples

- Use before PR or release handoff: inspect status, run the agreed final checks, verify receipts/evidence, and document residual risk.
- Do not run as repeated inner-loop validation that slows active implementation work.

## When not to use

- Do not use this skill to bypass the command or workflow that owns durable artifacts.
- Do not use it when source evidence, RAG/CodeGraph, or required verification is missing.
- Do not use it to replace a specialist producer, worker, or reviewer that must issue runtime evidence.

## Common rationalizations

- "This is small, so no source check is needed" - reject when the skill changes code, config, or durable artifacts.
- "The user asked for speed, so skip receipts" - reject when durable work, delegation, or review is claimed.
- "Existing prose is enough evidence" - reject when validators or command output are required.

## Red flags

- A durable artifact changes without a command, receipt, or verification path.
- The skill is used outside its phase without an explicit handoff.
- Claims of completion appear before evidence and confidence scoring.

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

Returns evidence bundle:
```
✓ Typecheck: <output snippet> (exit 0)
✓ Tests: <count passed/failed> (<output>)
✓ Lint: <output> (exit 0)
✓ Audit: <count vulns by severity>
✓ Bundle size: <delta vs baseline> (if applicable)

Verdict: READY / NOT-READY
```

## Guard rails

- DO NOT: skip a check because "it usually passes"
- DO NOT: paraphrase output ("looks good" without showing it)
- DO NOT: declare ready with non-zero exit code anywhere
- DO NOT: ignore audit findings (must fix or document override)
- ALWAYS: capture output verbatim
- ALWAYS: include exit codes

## Verification

- Every required check ran and exit code captured
- Output is verbatim, not summarized
- Verdict matches results

## Related

- `supervibe:finishing-a-development-branch` — invokes this first
- `supervibe:requesting-code-review` — invokes this before reviewer
- `supervibe:verification` — per-claim verification (this is per-PR)
