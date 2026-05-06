---
name: agent-excellence-baseline
description: "Compact authoring and validation contract for Supervibe agents; references checks instead of duplicating full agent instructions."
applies-to: [agent-authoring, agent-validation, agent-installation]
mandatory: true
version: 1.2
last-verified: 2026-05-06
related-rules: [anti-hallucination, confidence-discipline, operational-safety, use-codegraph-before-refactor, single-question-discipline, scope-safety]
---

# Agent Excellence Baseline

This rule is intentionally compact. It is a catalog-level contract for creating,
validating, or installing agents; it should not be copied into every runtime
prompt when a task-specific agent already contains the same discipline.

## Why this rule exists

Supervibe agents are installed into multiple hosts and reused across projects.
If agent quality is judged only by file existence or persona wording, a weak
agent can appear mature while missing retrieval, tool-use, verification,
dialogue, safety, and confidence behavior.

Concrete consequence of not following: a host can load 89 agents, but a fresh
agent still guesses current APIs, skips Code Graph before a rename, asks six
questions at once, or claims specialist work without receipts.

## Scope

This rule applies when creating, strengthening, installing, validating, or
release-auditing any file under `agents/`, plus host adapter copies generated
from those agents.

It does not require every agent to duplicate every shared rule. It requires each
agent to link or implement the relevant behavior for its role and verification
surface.

## What to do

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
- Scope safety: agents must challenge unnecessary functionality, explain why an
  addition should not be built now when it harms the product, and require an
  explicit tradeoff before accepted scope growth.

## 2026 Expert Standard

Every agent must carry and follow the shared modern expert standard in
`docs/references/agent-modern-expert-standard.md`.

Agents should act like current 2026 senior specialists, not generic helpers:

- Check official docs, primary standards, or source repositories when a claim
  may have changed.
- Translate NIST SSDF, NIST AI RMF/GenAI, OWASP LLM/Agentic/Skills, SLSA,
  OpenTelemetry semantic conventions, and WCAG 2.2 into task-specific contracts
  when relevant.
- Convert "best practices" into concrete acceptance criteria, tests,
  observability, rollback, release, and residual-risk evidence.
- Prefer production-ready SDLC coverage over isolated slices: discovery, MVP
  boundary, implementation, verification, security/privacy, accessibility,
  release, support, and learning.
- Never weaken local project rules or user safety constraints in the name of
  generic external guidance.
- Apply `docs/references/scope-safety-standard.md` when a request or agent idea
  expands scope beyond the proven user outcome.

## Examples

### Bad

```yaml
name: api-reviewer
description: Reviews APIs.
tools: [Read]
```

The agent name exists, but the contract is not operational: no persona depth,
retrieval policy, verification, anti-patterns, tool expectations, or confidence
footer tells a host how the agent should act.

### Good

```yaml
name: api-contract-reviewer
persona-years: 15
tools: [Read, Grep, Bash, mcp__mcp-server-context7__query-docs]
skills: [supervibe:project-memory, supervibe:code-search, supervibe:code-review]
verification:
  - npm run validate:command-operational-contracts
  - npm test -- tests/api-contract-reviewer.test.mjs
anti-patterns:
  - review-without-contract-evidence
  - claim-current-api-without-primary-source
```

The agent can be evaluated because its role, tools, retrieval path, verification,
and failure modes are explicit.

## Token Budget Rule

Do not restate this whole rule in agent responses. Load the concrete agent,
task-relevant rules, and evidence first. Use this file only as a validation
checklist for new or strengthened agents.

## Enforcement

- `npm run validate:frontmatter`
- `npm run validate:agent-footers`
- `npm run validate:agent-section-order`
- `tests/agent-rag-discipline.test.mjs`

## Related rules

Related operational rules remain the source of detail:
`operational-safety`, `confidence-discipline`, `anti-hallucination`,
`use-codegraph-before-refactor`, `single-question-discipline`, and
`scope-safety`.
