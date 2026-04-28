---
name: pre-pr-check
namespace: process
description: "Use BEFORE opening any PR or merging to main to run mandatory checks (typecheck, test, lint, dep audit, security scan) and capture evidence. RU: Используется ПЕРЕД открытием PR или мержем в main — запускает обязательные проверки (typecheck / test / lint / dep-audit / security-scan) и собирает доказательства. Trigger phrases: 'перед PR', 'pre-merge check', 'check before PR', 'пред-PR проверки'."
allowed-tools: [Read, Grep, Glob, Bash]
phase: review
prerequisites: []
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1.0
last-verified: 2026-04-27
---

# Pre-PR Check

## When to invoke

BEFORE opening a PR, BEFORE merging to main, BEFORE pushing to a tracked branch. Invoked by `supervibe:finishing-a-development-branch` and `supervibe:requesting-code-review`.

## Step 0 — Read source of truth (required)

1. Read project's check command(s) from `CLAUDE.md` or `package.json`/`composer.json`/`Cargo.toml`/`Makefile`
2. Identify stack (decides which checks apply)
3. Note any project-specific gates (e.g., bundle size budget, coverage threshold)

## Decision tree

```
What stack determines which checks?
├─ Node.js → tsc --noEmit + npm test + npm run lint + npm audit + bundle-size (if applicable)
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
