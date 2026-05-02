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
version: 2.1
last-verified: 2026-05-02
---

# Design Intelligence

Internal lookup and synthesis support for Supervibe design work. This skill does not own brand direction, UX specs, prototypes, presentation decks, accessibility review, or stack implementation. It supplies cited evidence so those agents make better decisions.

## When to invoke

Use this skill only as internal evidence support for design-facing agents and
commands that need retrieval-backed product, style, UX, chart, deck, collateral,
or stack UI guidance. It should enrich a design decision with citations, not
replace the owning design, review, or handoff skill.

## Invocation Scope

Use through existing routes only:
- `/supervibe-design` for design-system, prototype, presentation, collateral, and stack handoff work.
- `/supervibe-audit` for UI polish, accessibility, token drift, brand asset drift, and deck quality review.
- `/supervibe-strengthen` for agent tuning and repeated design failure patterns.
- `/supervibe` routing when the trigger router selects a design intent.

Never add a new slash command, package script, or standalone CLI wrapper for this lookup.

## Procedure

Required preflight order:

1. Project memory: search accepted decisions, rejected alternatives, review findings, and learned patterns tagged `design`, `brand`, `ux`, `a11y`, `tokens`, `prototype`, `slides`, or `rejected`.
2. Code search: inspect existing tokens, components, prototypes, routes, stack conventions, and brand assets.
3. Internal lookup: call `designContextPreflight()` or `searchDesignIntelligence()` for the relevant domains.
4. Optional external references: use Figma/browser/search only when available and relevant. External references are supplemental; use the internet only for current references, market examples, official platform docs, live competitor pages, or fresh visual evidence that local data cannot contain.

## Local Expert Routine

Before design-facing outputs, read `docs/references/design-expert-knowledge.md`
and apply Design Pass Triage from its `Eight-Pass Expert Routine` where the
owning command or agent is doing substantial design work. The owning workflow
classifies each pass as `required | reuse | delegated | skipped | N/A`. This
skill supplies the local evidence lookup pass; it does not replace preference
intake, reference scan, IA/user-flow, visual-system, responsive/platform,
quality, or feedback/approval passes.

When an approved design system already exists, treat prior preference and
visual-system choices as reusable evidence unless the user asked for a rebrand,
new audience posture, or material direction change. When a candidate or needs_revision
design system exists, recommend resuming section approval instead of treating it
as reusable prototype evidence. If lookup reveals a
missing token, component, asset, or interaction, recommend a narrow
design-system extension instead of a full restart. Do not force all eight passes
for every prototype when local evidence proves reuse is sufficient.

## Evidence Contract

Design-facing outputs must include a compact `Design Intelligence Evidence` section when lookup influenced a recommendation:

```yaml
Design Intelligence Evidence:
  query: "<user/design query>"
  memory:
    - path: ".supervibe/memory/decisions/example.md"
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
- `ui-reasoning`: decision framing, critique, and recommendation quality evidence.
- `stack:*`: implementation guidance for React, Next.js, Vue, Svelte, Angular, Flutter, SwiftUI, Shadcn, Tailwind, Three.js, and related stacks.
- `slides:*`: presentation strategy, layout, copy, chart, typography, color, and background guidance.
- `collateral:*`: logo, icon, CIP, brand asset, and mockup context guidance.

Domain aliases `stack`, `slides`, and `collateral` expand to the corresponding
prefixed local domain families during lookup.

Use the local knowledge pack first. Do not instruct design agents to fetch a
remote repository or remote skill for baseline expertise.

## Design Expert Knowledge Matrix

For design-facing lookups, map retrieved evidence to this coverage matrix before making a recommendation:

1. Accessibility
2. Touch & Interaction
3. Performance
4. Style Selection
5. Layout & Responsive
6. Typography & Color
7. Animation
8. Forms & Feedback
9. Navigation Patterns
10. Charts & Data

Use a product-fit style matrix to match product category, trust/risk, density, platform, interaction mode, and data intensity before suggesting visual direction. Use stack-aware UI guidance for framework, mobile, or component-library handoff; retrieved style rows are advisory and cannot override approved tokens, accessibility requirements, or local code patterns.

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

## Output contract

Returns:
- Evidence summary with cited memory, code, lookup, or fallback sources.
- Decision or recommendation with confidence score and conflict handling.
- Explicit next action, owner skill/agent, and stop condition when follow-up work is needed.

## Guard rails

- Do not mutate files, provider state, network resources, or external tools unless this skill's procedure and the user approval path allow it.
- Do not skip prerequisites, confidence gates, policy gates, or explicit approval gates.
- Do not claim completion without concrete verification evidence.
- Preserve user-owned content and unrelated worktree changes.

## Verification

- Confirm every emitted artifact exists and matches the Output contract.
- Run the validator, test, dry-run, or audit command named by this skill when one exists.
- Include concrete command/output evidence before claiming the skill completed successfully.
- If verification cannot run, state the blocker and keep confidence below the passing gate.
