# Supervibe Workflow Hardening

This document holds detailed guidance that should not live in host root files.
Host instruction files should stay concise and point here for deeper policy.

## Token Economy

`npm run measure:tokens:strict` is the release-facing token gate. It reports all
host, skill, and agent token budget violations, then separates them into
blocking violations and planned repairs. A strict run passes only when every
current violation has a concrete repair strategy.

Current hard budgets:

- Host root instructions: 5,000 chars.
- Skill body: 500 lines or 5,000 approximate tokens.
- Skill description: 1,024 chars.
- Agent body: 500 lines or 8,000 approximate tokens.
- Per-agent context packet: 8,000 approximate tokens.

## Prompt Slicing

Agent handoffs should be assembled by relevance instead of dumping every
available artifact. Use this order:

1. Task contract.
2. Current work item.
3. Direct dependencies.
4. Retrieval evidence from memory, Code RAG, and CodeGraph.
5. Write-scope contracts and semantic anchors.
6. Recent blockers.
7. Omitted-context summary.

If the packet exceeds budget, reduce broad history first, then lower memory and
evidence limits. Do not remove acceptance criteria, verification commands, or
receipt requirements.

## Host Guidance Split

Keep `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, and other host roots focused on
runtime-critical rules and command entry points. Move long explanations,
examples, and rationale here or into skill/reference documents. Host roots
should name the required command or validator, not duplicate the implementation
manual.
