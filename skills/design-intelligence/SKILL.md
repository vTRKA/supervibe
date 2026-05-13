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

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source
of truth, preserve retrieval evidence, apply scope safety, use real producers
with runtime receipts for durable delegated outputs, verify before completion
claims, and keep confidence below gate when evidence is partial.

## Step 0 - Read source of truth (required)

Before lookup, read the active design workflow state, approved design-system
manifest if present, project memory, Code RAG hits for existing UI/tokens, and
`docs/references/design-expert-knowledge.md`. For regulated-trust briefs, gather
domain evidence before accepting palette, typography, copy-risk, or trust
defaults. Apply the `Reference Quality Ladder` before allowing any external
reference to influence a recommendation. For new products, rebrands, missing
systems, material visual shifts, or weak category references, also read
`docs/references/creative-reference-taxonomy.md` and the relevant local packs in
`skills/design-intelligence/references/creative/` before recommending creative
benchmarks.

## Decision tree

```
Approved design system exists and matches the target
  -> Reuse tokens, components, decisions, and prior approval evidence.

Design system is candidate, needs_revision, missing, or mismatched
  -> Return a gap and route to the owning design-system workflow before durable output.

Local memory, code, or design-intelligence rows conflict
  -> Apply precedence: approved design system, project memory, codebase patterns, accessibility law, external lookup.

Brief is regulated-trust or safety-sensitive
  -> Require domain evidence before palette, typography, trust-copy, or data-display recommendations.

Lookup has no relevant local evidence
  -> Return fallback reason and recommend the owning skill gather external/current evidence if needed.
```

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
4. Creative pack lookup: when creative direction matters, choose fast path,
medium path, or full creative path from
`docs/references/creative-reference-taxonomy.md`, then select 1-3 local packs
from `skills/design-intelligence/references/creative/`. Use packs to produce
borrow/avoid moves and differentiation pressure, not brand imitation.
5. Optional external references: use Figma/browser/search only when available and relevant. External references are supplemental; use the internet only for current references, market examples, official platform docs, live competitor pages, or fresh visual evidence that local data cannot contain. Classify every source with `referenceRole`, `qualityTier`, `capturedAt`, `borrow`, `avoid`, and `notAuthority=true` unless it is an approved project brand source.

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
  references:
    - source: "https://example.com/path"
      referenceRole: "creative benchmark | interaction benchmark | category convention | direct competitor | platform standard | implementation library | anti-pattern | do-not-use-as-style"
      qualityTier: "tier-1 | tier-2 | tier-3"
      capturedAt: "YYYY-MM-DD | local-pack"
      borrow: "specific trait or pattern to reuse"
      avoid: "specific trait, risk, or mimicry to avoid"
      notAuthority: true
  creativePacks:
    path: "fast path | medium path | full creative path"
    selected:
      - "skills/design-intelligence/references/creative/creative-data-products.md"
    borrow: "specific pack moves used"
    avoid: "specific pack risks rejected"
  acceptedStatus: "candidate | accepted | rejected | learned"
  fallbackReason: "no matching row | stack data unavailable | external lookup skipped"
```

## Reference Quality Ladder

Use the ladder from `docs/references/design-expert-knowledge.md` for all
non-project references. A source can be a creative benchmark, interaction
benchmark, category convention, direct competitor, platform standard,
implementation library, anti-pattern, or do-not-use-as-style. Famous product
names must be decomposed into borrow/avoid traits before use; they are not
style authority.
Tier-1 references need a current capture date or official version, direct fit,
and explicit borrow/avoid notes. Tier-2 references are advisory. Tier-3
references are historical context or anti-pattern material only.
Local creative reference packs are tier-2 evidence. For a full creative path,
select multiple packs with genuinely different moves so the owning agent can
generate distinct candidate directions instead of small variations of the same
style.

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
- `creative packs`: local tier-2 pack cards in
  `skills/design-intelligence/references/creative/` selected through
  `docs/references/creative-reference-taxonomy.md`.

Domain aliases `stack`, `slides`, and `collateral` expand to the corresponding
prefixed local domain families during lookup.

### Required Dataset Breadth For Design Agents

When a design-facing agent handles a product, prototype, landing, deck, or
collateral request, it must consider every relevant local dataset family before
claiming that evidence is unavailable: product, style, color, typography, UX,
landing, app-interface, charts, icons, google-fonts, react-performance,
ui-reasoning, stack, slides, collateral, and creative packs. If a family is not
relevant, mark it `N/A` with rationale; do not omit it silently.

For advanced visual work, pair local evidence with a Prototype Capability Plan.
Library families agents may consider include native CSS/WAAPI, Motion, GSAP,
Lottie/lottie-web, Rive, Three.js, PixiJS, D3, Observable Plot, ECharts,
MapLibre GL, Theatre.js, Rough.js, Matter.js, Monaco, CodeMirror, and
stack-specific chart wrappers such as Visx or Recharts for handoff. The local
pack helps select fit and risk; it does not grant permission to import a
dependency without the prototype capability gate.

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
- brand-name-as-style-authority
- unclassified-reference-source

## When not to use

- Do not use this skill to bypass the command or workflow that owns durable artifacts.
- Do not use it when source evidence, RAG/CodeGraph, or required verification is missing.
- Do not use it to replace a specialist producer, worker, or reviewer that must issue runtime evidence.

## Common rationalizations

- "This is small, so no source check is needed" - reject when the skill changes code, config, or durable artifacts.
- "The user asked for speed, so skip receipts" - reject when durable work, delegation, or review is claimed.
- "Existing prose is enough evidence" - reject when validators or command output are required.

## Red flags

- A durable artifact changes without a command, receipt, or verification path.
- The skill is used outside its phase without an explicit handoff.
- Claims of completion appear before evidence and confidence scoring.

## Checklist

- Source of truth read.
- Scope and owner confirmed.
- RAG/CodeGraph/memory requirement decided.
- Evidence artifact or command recorded.
- Stop condition and next handoff clear.

## Failure modes

- Inline emulation replaces a required producer or reviewer.
- Broad use of the skill slows delivery without improving evidence.
- Missing verification lets stale assumptions pass as production-ready.

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

## Related

- `supervibe:brandbook` - owns approved design-system creation.
- `supervibe:prototype` - consumes evidence for UI prototypes.
- `supervibe:presentation-deck` - consumes deck and slide evidence.
- `supervibe:ui-review-and-polish` - verifies design evidence in rendered artifacts.
