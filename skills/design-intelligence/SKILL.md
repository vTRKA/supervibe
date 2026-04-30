---
name: design-intelligence
namespace: internal
description: "Use WHEN design-facing agents need retrieval-backed style, UX, brand, deck, chart, collateral, or stack UI evidence TO ground decisions in project memory, code facts, approved design-system tokens, and the internal design intelligence data pack. Internal support only; no user-facing slash command."
allowed-tools: [Read, Grep, Glob, Bash]
phase: support
prerequisites: [project-memory-preflight, code-search-preflight]
emits-artifact: design-intelligence-evidence
confidence-rubric: confidence-rubrics/design-intelligence.yaml
gate-on-exit: true
version: 2.0
last-verified: 2026-04-30
---

# Design Intelligence

Internal lookup and synthesis support for Supervibe design work. This skill does not own brand direction, UX specs, prototypes, presentation decks, accessibility review, or stack implementation. It supplies cited evidence so those agents make better decisions.

## Invocation Scope

Use through existing routes only:
- `/supervibe-design` for design-system, prototype, presentation, collateral, and stack handoff work.
- `/supervibe-audit` for UI polish, accessibility, token drift, brand asset drift, and deck quality review.
- `/supervibe-strengthen` for agent tuning and repeated design failure patterns.
- `/supervibe` routing when the trigger router selects a design intent.

Never add a new slash command, package script, or standalone CLI wrapper for this lookup.

## Required Preflight Order

1. Project memory: search accepted decisions, rejected alternatives, review findings, and learned patterns tagged `design`, `brand`, `ux`, `a11y`, `tokens`, `prototype`, `slides`, or `rejected`.
2. Code search: inspect existing tokens, components, prototypes, routes, stack conventions, and brand assets.
3. Internal lookup: call `designContextPreflight()` or `searchDesignIntelligence()` for the relevant domains.
4. Optional external references: use Figma/browser/search only when available and relevant.

## Evidence Contract

Design-facing outputs must include a compact `Design Intelligence Evidence` section when lookup influenced a recommendation:

```yaml
Design Intelligence Evidence:
  query: "<user/design query>"
  memory:
    - path: ".claude/memory/decisions/example.md"
      relevance: "accepted or rejected design decision"
  lookup:
    - id: "style:12:example"
      domain: "style"
      score: 3.42
      recommendation: "retrieved row summary"
      conflict: "none | project memory wins | design system wins"
  acceptedStatus: "candidate | accepted | rejected | learned"
  fallbackReason: "no matching row | stack data unavailable | external lookup skipped"
```

## Precedence

Apply this hierarchy without exceptions:

1. Approved design system
2. Project memory
3. Codebase patterns
4. Accessibility law
5. External lookup

Generic retrieved guidance is advisory. It cannot override approved tokens, prior explicit rejection, accessibility requirements, or codebase facts.

## Domain Map

- `product`, `style`, `color`, `typography`, `ux`, `landing`, `app-interface`: primary design and UX guidance.
- `charts`: chart choice, fallback, and accessibility guidance.
- `icons`: icon library/import guidance, adapted to Supervibe's local icon policy.
- `google-fonts`: font pairing and font availability evidence.
- `react-performance`: UI performance rules for React surfaces.
- `stack:*`: implementation guidance for React, Next.js, Vue, Svelte, Angular, Flutter, SwiftUI, Shadcn, Tailwind, Three.js, and related stacks.
- `slides:*`: presentation strategy, layout, copy, chart, typography, color, and background guidance.
- `collateral:*`: logo, icon, CIP, brand asset, and mockup context guidance.

## Memory Writeback Rules

Write memory only after a review or user signal marks the result accepted, rejected, or learned. Do not write every candidate suggestion.

Accepted decisions need artifact links or evidence ids. Rejected alternatives need a rejection rationale so future agents do not resurrect the same weak option.

## Anti-Patterns

- asking-multiple-questions-at-once
- advancing-without-feedback-prompt
- random-regen-instead-of-tradeoff-alternatives
- lookup-as-authority
- memory-bypass
- approved-system-overwrite
- uncited-design-claim
