# Design Intelligence

Design intelligence is the Supervibe 2.0 design upgrade: internal retrieval, memory, and trigger routing that grounds designer agents in reusable evidence.

## What It Does

- Searches project memory, code, and the internal design data pack before design artifacts are produced.
- Provides cited rows for style, palette, typography, UX, charts, icons, landing patterns, slides, collateral, and stack-specific UI handoff.
- Writes durable memory only for accepted, rejected, or learned design decisions.
- Keeps all user-facing behavior on existing commands: `/supervibe-design`, `/supervibe-audit`, `/supervibe-strengthen`, and `/supervibe`.

## Agent Contract

Design agents must include a `Design Intelligence Evidence` section when lookup influenced output. The evidence must name the query, matched ids, scores, conflicts, and fallback reason when a domain has no match.

## Safety Hierarchy

Use this order when evidence conflicts:

1. Approved design system
2. Project memory
3. Codebase patterns
4. Accessibility law
5. External lookup

## Version

This capability ships with Supervibe `2.0.0`; public docs may refer to it as Supervibe `2.0`.
