# Design Intelligence

Design intelligence is the Supervibe 2.0 design upgrade: internal retrieval, memory, and trigger routing that grounds designer agents in reusable evidence.

## What It Does

- Searches project memory, code, and the internal design data pack before design artifacts are produced.
- Provides cited rows for style, palette, typography, UX, charts, icons, landing patterns, slides, collateral, and stack-specific UI handoff.
- Writes durable memory only for accepted, rejected, or learned design decisions.
- Keeps all user-facing behavior on existing commands: `/supervibe-design`, `/supervibe-audit`, `/supervibe-strengthen`, and `/supervibe`.
- Uses the Figma source-of-truth flow when Figma files, variables, components,
  Code Connect metadata, or design-node URLs are provided.

## Agent Contract

Design agents must include a `Design Intelligence Evidence` section when lookup influenced output. The evidence must name the query, matched ids, scores, conflicts, and fallback reason when a domain has no match.

## Safety Hierarchy

Use this order when evidence conflicts:

1. Approved design system
2. Project memory
3. Codebase patterns
4. Accessibility law
5. External lookup

## Figma Source Of Truth

When Figma is the declared source, design agents follow
[Figma Source-Of-Truth Flow](figma-source-of-truth.md). The flow is capability
aware: no MCP, read-only MCP, writeback-capable MCP, and Code Connect evidence
all have different allowed actions. Remote Figma mutation remains blocked
without exact approval for the file, node/page, action, and timebox.

## Version

This capability ships with Supervibe `2.0.65`; public docs may refer to it as Supervibe `2.0`.
