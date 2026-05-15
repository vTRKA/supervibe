# UX/UI Patterns

Reusable UX/UI routing, design-intelligence, and handoff depth relocated from `ux-ui-designer`.

## Slicing Contract

- Agent files keep persona, invocation boundary, procedure, output contract, skills, verification, dialogue discipline, and anti-patterns.
- This reference holds reusable depth: decision trees, workflow matrices, detailed examples, and output templates.
- Load this file only when the current task needs the deeper pattern; otherwise use the concise agent contract.
- Treat copied source sections as reference patterns, not mandatory steps for every task.

## UX UI Designer: Decision Tree

Source agent: `agents/_design/ux-ui-designer.md`
Moved content type: UX/UI task routing tree

## Decision tree

```
NEW SCREEN (no prior spec exists):
  - Frame JTBD → IA map → wireframe → states matrix → tokens → responsive → motion → handoff
  - Output: full screen spec, component inventory marked EXISTS/NEW

STATE-DESIGN PASS (spec exists, states incomplete):
  - Audit current states present vs. required (loading/empty/error/success/partial/skeleton)
  - Fill gaps; verify each state has copy + visual + recovery affordance
  - Output: states matrix delta + updated spec

RESPONSIVE-FLOW (mobile/tablet/desktop adaptation):
  - Identify breakpoints from tokens
  - Re-flow IA per breakpoint (stack vs. side-by-side, drawer vs. inline)
  - Verify touch targets ≥44px, readable line lengths, hierarchy preserved
  - Output: per-breakpoint redlines

MOTION (transitions / micro-interactions):
  - Justify each motion: clarifies cause-effect? signals state change? guides attention?
  - If decorative-only → cut
  - Specify duration, easing, reduced-motion fallback
  - Output: motion spec table

ACCESSIBILITY-PASS (a11y review of existing spec):
  - Contrast ratios, focus order, keyboard paths, screen reader labels, error association
  - Verify each state is reachable + comprehensible without sight, hearing, fine motor
  - Output: a11y findings + spec patches

IA-RESTRUCTURE (existing flow underperforms):
  - Re-frame JTBD; observe failure mode (skip, abandon, mis-click)
  - Map current IA; identify hierarchy mismatch with task
  - Propose alternative IA; A/B mental model with stakeholders
  - Output: before/after IA diagrams + migration plan
```

## UX UI Designer: Local Design Expert Reference

Source agent: `agents/_design/ux-ui-designer.md`
Moved content type: design-intelligence and expert-routine guidance

## Local Design Expert Reference

Before producing design-facing output, read `docs/references/design-expert-knowledge.md` and run Design Pass Triage from the `Eight-Pass Expert Routine`. Do not force all eight passes for every prototype. Classify each pass as `required | reuse | delegated | skipped | N/A` with rationale. If an approved design system already exists and the request is a prototype, screen, refinement inside that system, reuse preference and visual-system decisions and run only the relevant evidence, reference, IA/user-flow, responsive/platform, quality, and prototype/review passes. If a candidate or needs_revision design system exists, resume the design-system approval gate instead of treating it as prototype-ready. Full eight-pass coverage is required only for new products, rebrands, missing design systems, or material direction changes.

Query local design intelligence through `designContextPreflight()` or `searchDesignIntelligence()` for the relevant local domains: `product`, `style`, `color`, `typography`, `ux`, `landing`, `app-interface`, `charts`, `icons`, `google-fonts`, `react-performance`, `ui-reasoning`, `stack` and `collateral`. External references are supplemental: use the internet only for current references, market examples, official platform docs, live competitor pages, or fresh visual evidence that local data cannot contain.

Local folder map: `skills/design-intelligence/data/manifest.json`, `skills/design-intelligence/data/*.csv`, `skills/design-intelligence/data/stacks/`, `skills/design-intelligence/data/collateral/`, `skills/design-intelligence/references/`, and `references/design-intelligence-source-coverage.md`.

### Dataset Family Matrix

For any material screen, flow, or design audit, include a compact matrix before
the recommendation:

| Family | Required when | Evidence |
| --- | --- | --- |
| product/style/color/typography | visual direction, density, trust, or brand feel changes | cited design-intelligence rows plus approved-system override status |
| ux/app-interface | IA, navigation, forms, state matrix, platform behavior | row ids for UX and app-interface, including web or native platform coverage |
| charts/icons/landing | data surfaces, iconography, or marketing pages | chart/icon/landing row ids and accessibility implications |
| stack/collateral | implementation handoff or brand/collateral work | stack or collateral row ids and handoff constraints |

Do not report `Confidence: 9/10` or higher if the matrix is absent for a
design-facing output or if a required family is skipped without rationale.

Apply the `Reference Quality Ladder` before using examples. UX references must declare reference role and quality tier. Use interaction benchmark sources for specific flows, category convention sources for expected patterns, direct competitor sources for parity and differentiation, platform standard sources for platform behavior, and anti-pattern sources for what to avoid. Brand-name analogies are not UX direction until translated into explicit borrow/avoid notes.

When visual direction is still open, consume the creative-director's selected
`creativePacks` from Design Intelligence Evidence instead of choosing visual
style by analogy. UX examples must still be interaction evidence: a creative
pack can influence hierarchy, density, motion tone, or visual restraint, but it
cannot replace JTBD, IA, state matrix, accessibility, recovery paths, or
component inventory.

## UX UI Designer: Design Expert Knowledge

Source agent: `agents/_design/ux-ui-designer.md`
Moved content type: interaction and visual evidence families

## Design Expert Knowledge

Before writing the screen spec, read `docs/references/design-expert-knowledge.md` and apply a product-fit style matrix: product category, trust/risk level, density, platform, interaction mode, and data intensity must explain the chosen style, palette, type, motion, and component density.

Cover or mark N/A with rationale: Accessibility, Touch & Interaction, Performance, Style Selection, Layout & Responsive, Typography & Color, Animation, Forms & Feedback, Navigation Patterns, and Charts & Data. For stack handoff, include stack-aware UI guidance so framework or component-library adapters implement approved tokens instead of replacing them with defaults.

### Design Diversity Benchmark Handoff

When UX/UI work proposes alternatives or hands a concept to prototype-builder,
include diversity handoff axes: palette, typography, motion, imagery, hierarchy,
density, composition, and interaction. The handoff must say which three or more
axes changed, why the change improves the user's task, and what the direction
gives up. Same shell, new paint is not a valid UX/UI alternative.

### Prototype Capability Handoff

Every handoff to prototype-builder must include `prototypeCapability.mode`:
`native-static`, `enhanced-native`, `bundled-dependency`, `framework-sandbox`,
or `handoff-only`. Use `enhanced-native` for CSS/WAAPI, Canvas, SVG, local
assets, and browser APIs. Use `bundled-dependency` only when charts, 3D,
advanced animation, maps, code editing, physics, or data visualization make the
prototype materially better. Name candidate libraries/APIs and the rejected
native-only alternative so the builder can create or validate a Prototype
Capability Plan before implementation.

## UX UI Designer: Common Workflows

Source agent: `agents/_design/ux-ui-designer.md`
Moved content type: workflow matrix for screens, flows, systems, and reviews

## Common workflows

### New screen spec (greenfield)
1. Load brandbook + tokens + relevant memory
2. Frame JTBD (1–3 statements)
3. Map IA primary/secondary/tertiary
4. Wireframe low-fidelity
5. Component inventory (EXISTS/NEW)
6. States matrix (loading/empty/partial/success/error classes)
7. Apply tokens
8. Responsive breakpoints
9. Motion + a11y pass
10. Microcopy
11. Assemble spec; score; iterate to ≥9
12. Handoff to prototype-builder or engineering

### State matrix pass (existing spec, states gaps)
1. Read existing spec
2. Audit: which states present? which copy / visual / recovery present?
3. List gaps explicitly
4. For each gap: design state per matrix template
5. Verify recovery affordance for every error class
6. Update spec; diff against prior; score

### Responsive design (single-breakpoint spec → multi-breakpoint)
1. Identify breakpoints from tokens
2. For each breakpoint: re-flow IA (stack vs. side-by-side, drawer vs. inline)
3. Validate touch targets, line length, hierarchy at each breakpoint
4. Per-breakpoint redlines + token-mapped values
5. Verify state matrix holds at each breakpoint (empty / error layouts adapt)

### IA restructure (existing flow underperforms)
1. Observe failure mode (analytics, session recording, support tickets)
2. Re-frame JTBD; identify mismatch with current IA
3. Map current IA explicitly (block diagram)
4. Propose alternative IA (1–3 candidates)
5. Mental-model walk with stakeholders; pick one
6. Migration plan: which screens change, which stay; deprecation of old patterns
7. Update affected specs

## UX UI Designer: Artifact Template

Source agent: `agents/_design/ux-ui-designer.md`
Moved content type: UX/UI handoff output sections

## Jobs-to-be-done
- JTBD-1: When <context>, I want to <action>, so I can <outcome>
- JTBD-2: ...

## Information Architecture
- Primary: <what the user must see / do first>
- Secondary: <supporting context>
- Tertiary: <available but de-emphasized>
- (Diagram or block hierarchy)

## Component Inventory
| Component | Status | Source / Justification |
|-----------|--------|------------------------|
| Button.Primary | EXISTS | `frontend/src/components/Button` |
| InlineFilter | NEW | No existing pattern; justification: ... |

## States Matrix
| State | Trigger | Visual | Copy | Recovery | Notes |
|-------|---------|--------|------|----------|-------|
| Loading | Initial mount | Skeleton (matches layout) | — | — | Token: `motion.skeleton.shimmer` |
| Empty | API returns []  | Illustration + headline + CTA | "No items yet" + "Create your first" | CTA → create flow | — |
| Partial | Stream chunk | Render available + skeleton tail | — | — | aria-live="polite" |
| Error.Network | Fetch fails | Inline banner | "Couldn't load — check connection" | Retry button | — |
| Error.Permission | 403 | Empty-state variant | "You don't have access" | Contact-admin link | — |
| Success | Data resolves | Canonical render | — | — | — |

## Tokens Applied
- Colors: `color.surface.canvas`, `color.text.primary`, `color.feedback.error.bg`, ...
- Spacing: `space.4`, `space.6`, `space.8`
- Radii: `radius.md`
- Type: `type.heading.lg`, `type.body.md`
- Shadows: `shadow.elevation.2`
- Motion: `motion.duration.fast`, `motion.easing.standard`

## Responsive Breakpoints
- Mobile (≤640px): stacked, drawer for filters, full-width CTAs
- Tablet (641–1024px): two-column, inline filters
- Desktop (≥1025px): three-column, persistent sidebar

## Motion Notes
| Transition | Duration | Easing | Reduced-Motion Fallback |
|------------|----------|--------|--------------------------|
| Loading → Success | 200ms | standard | crossfade only |
| List item enter | 150ms stagger 30ms | standard | no stagger, instant |

## Motion specification responsibility (designer ≠ implementer)

When you specify a screen, your motion responsibility is: declare the **intent** (snappy / considered / deliberate) and the **state** (loading → loaded → error → success transitions). You do NOT pick the library — that's `creative-director`'s call.

Hand-off contract to creative-director / prototype-builder:
- For each interactive element, name a tier from the timing-tier table (instant / quick / considered / deliberate / narrative).
- For each state transition, name what enters and what leaves.
- For prefers-reduced-motion: name the alternative (instant snap | crossfade | unchanged).
- Reference `skills/interaction-design-patterns/SKILL.md` timing tiers for vocabulary.

If your spec has 0 motion intent declared, creative-director will not animate. That is your decision, and it is OK — silence is a valid motion spec.

## Accessibility Notes
- Contrast: all token pairs verified ≥ WCAG AA
- Focus order: header → primary action → list → secondary actions
- Keyboard: Tab/Shift+Tab navigates; Enter activates; Esc dismisses overlays
- Screen reader: dynamic regions `aria-live="polite"`; errors associated via `aria-describedby`
- Reduced motion: all transitions have static fallback

## Redlines
(Annotated mockups or token-mapped specs)

## Open Questions
- ...

## Verdict
READY FOR HANDOFF | NEEDS REVIEW | BLOCKED
```
