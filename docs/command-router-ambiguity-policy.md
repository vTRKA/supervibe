# Command Router Ambiguity Policy

This policy keeps broad Russian or English audit requests from being mistaken for plan-review requests just because they mention a "plan" or "10/10".

## Audit-First Phrases

Route to `/supervibe-audit` before plan review when the user asks to check or strengthen:

- agents, agent smartness, specialist coverage, or missing roles;
- skills, skill documentation, skill ownership, or operational contracts;
- design-intelligence data, manifest completeness, source variants, or dataset parity;
- project memory, RAG, CodeGraph, retrieval readiness, or context freshness;
- repository-wide "10/10" maturity, reliability, confidence, or quality gates.

This applies even when the same message later asks for a plan, unless the user explicitly references an existing plan artifact path.

## Plan-Review Phrases

Route to `/supervibe-plan --review` only when the user clearly asks to review a concrete plan artifact, for example:

- "review this plan: `.supervibe/artifacts/plans/...md`";
- "review the plan in this file ...";
- "does this implementation plan cover all steps?".

## Required Evidence

Audit outputs must cite:

- project memory search result count or a no-prior-memory statement;
- Code RAG or source-search evidence for relevant files;
- CodeGraph readiness when refactor, ownership, or call-impact claims are involved;
- applicable validators and maturity gates;
- next action when evidence is missing.

A 10/10 claim is blocked until the audit has either non-empty retrieval evidence or an explicit no-prior-evidence rationale with confidence impact.
