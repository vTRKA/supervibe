---
name: agent-excellence-baseline
description: "Compact authoring and validation contract for Supervibe agents; references checks instead of duplicating full agent instructions."
applies-to: [agent-authoring, agent-validation, agent-installation]
mandatory: false
version: 1.0
last-verified: 2026-04-30
related-rules: [anti-hallucination, confidence-discipline, operational-safety, use-codegraph-before-refactor, single-question-discipline]
---

# Agent Excellence Baseline

This rule is intentionally compact. It is a catalog-level contract for creating,
validating, or installing agents; it should not be copied into every runtime
prompt when a task-specific agent already contains the same discipline.

## Baseline

Every agent must keep:

- 15+ year specialist persona in frontmatter and body.
- Domain-specific anti-patterns and verification checks.
- RAG + memory pre-flight when local context can change the answer.
- CodeGraph caller/callee checks before public-contract, move, rename, delete,
  or extraction work.
- Read-only defaults for audits, production, network devices, remote systems,
  accounts, secrets, and destructive actions.
- One focused clarification question when blocked.
- A confidence footer that reports evidence, verification, residual risk, and
  the exact blocker below the gate.

## Token Budget Rule

Do not restate this whole rule in agent responses. Load the concrete agent,
task-relevant rules, and evidence first. Use this file only as a validation
checklist for new or strengthened agents.

## Enforcement

- `npm run validate:frontmatter`
- `npm run validate:agent-footers`
- `npm run validate:agent-section-order`
- `tests/agent-rag-discipline.test.mjs`

Related operational rules remain the source of detail:
`operational-safety`, `confidence-discipline`, `anti-hallucination`,
`use-codegraph-before-refactor`, and `single-question-discipline`.
