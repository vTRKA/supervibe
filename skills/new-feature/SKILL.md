---
name: new-feature
namespace: process
description: "Use WHEN starting any new user-facing feature to orchestrate end-to-end flow from requirements to merge with all gates enforced"
allowed-tools: [Read, Grep, Glob, Bash, Write, Edit]
phase: brainstorm
prerequisites: []
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1.0
last-verified: 2026-04-27
---

# New Feature

## When to invoke

WHEN user says "let's build feature X" and X is non-trivial (estimated complexity ≥4). This is the orchestrator that chains the entire feature workflow.

NOT for: bug fixes (use systematic-debugging), refactors (use refactoring-specialist), config-only changes.

## Step 0 — Read source of truth (MANDATORY)

1. Read project state (stack, conventions, existing patterns)
2. Read recent PRDs / specs / plans for context
3. Read `MEMORY.md` for prior preferences

## Decision tree

```
Feature has clear product framing?
├─ NO → start with evolve:prd (product-manager agent)
└─ YES → skip PRD

Feature visual / UI?
├─ YES → after design phase, evolve:prototype + brandbook check
└─ NO → straight to plan + execute

Feature backend-heavy?
├─ Yes → involve appropriate stack-specific architect early
└─ NO → skip architect involvement
```

## Procedure (orchestration chain)

1. **PRD** (optional): `evolve:prd` if no clear product framing
2. **Requirements intake**: `evolve:requirements-intake` to set complexity routing
3. **Brainstorming**: `evolve:brainstorming` if complexity ≥7 (else skip)
4. **Design (UI features)**: `evolve:brandbook` if no brandbook exists, then `evolve:prototype`
5. **Plan**: `evolve:writing-plans`
6. **Worktree**: `evolve:using-git-worktrees` for isolation
7. **Execute**: `evolve:executing-plans` (or `evolve:subagent-driven-development`)
8. **Pre-PR**: `evolve:pre-pr-check`
9. **Review**: `evolve:requesting-code-review` → `code-reviewer` agent → `evolve:receiving-code-review`
10. **Quality gate**: `quality-gate-reviewer` agent
11. **Finish**: `evolve:finishing-a-development-branch`
12. **Score** — `evolve:confidence-scoring` agent-output for entire feature; ≥9 required to mark done

## Output contract

Returns:
- Feature delivered (commits / PR / merged code)
- Per-stage confidence scores
- Final aggregate score
- Effectiveness signals for `evolve:evaluate` (Phase 6)

## Guard rails

- DO NOT: skip PRD for user-facing features without explicit user opt-out
- DO NOT: skip brainstorming for complex features (complexity ≥7)
- DO NOT: skip prototype for UI features (causes implementation-without-design)
- DO NOT: merge without code-review + quality-gate
- ALWAYS: enforce confidence-gates between stages
- ALWAYS: respect HARD BLOCK — no done claim at <9 without override

## Verification

- All required stages invoked in order
- Per-stage confidence scores recorded
- Final delivery has evidence (PR URL, commit hash)
- No stage skipped without documented reason

## Related

- All Phase 2 process skills (this orchestrates them)
- All Phase 3 agents (this involves them)
