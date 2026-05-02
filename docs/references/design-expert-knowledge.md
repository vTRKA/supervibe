# Design Expert Knowledge

This reference is not a runtime dependency. Supervibe uses the adapted UI/UX
coverage model as a local expert checklist for design-facing agents and skills.
The goal is to preserve senior design breadth while keeping Supervibe
host-neutral, token-governed, evidence-backed, and explicit with the user.

## Local Design Knowledge Pack

Design agents must use local Supervibe knowledge before reaching for the web.
The internal design intelligence data pack is declared in
`skills/design-intelligence/data/manifest.json` and queried through
`designContextPreflight()` or `searchDesignIntelligence()`.

The useful local domains are:

- `product`: category, audience, trust, density, buyer/user expectations.
- `style`: visual direction, style fit, risk, compatibility, anti-fit notes.
- `color`: palette candidates, contrast intent, semantic color pairing.
- `typography`: type roles, hierarchy, scale, readability, pairing logic.
- `ux`: task flow, usability heuristics, decision quality, pitfalls.
- `landing`: hero, conversion, proof, funnel, content and section strategy.
- `app-interface`: dashboard, SaaS, admin, mobile, desktop, and shell patterns.
- `charts`: chart selection, data density, fallback states, accessibility.
- `icons`: icon style, library/import guidance, density, recognizability.
- `google-fonts`: current font availability, pairing and loading evidence.
- `react-performance`: UI performance constraints for React-like surfaces.
- `ui-reasoning`: design critique, tradeoff, and decision framing examples.
- `stack`: framework or platform-specific UI implementation guidance.
- `slides`: deck strategy, layout, chart, visual hierarchy, and audience fit.
- `collateral`: logo, icon, brand asset, identity, mockup and CIP guidance.

## Local Knowledge Folders

Design agents should cite these local folders in their own reasoning and
handoffs so they know where the expertise lives:

- `skills/design-intelligence/data/manifest.json`: import manifest, domain
  registry, row counts, checksums, and skipped/deferred source-family rationale.
- `skills/design-intelligence/data/*.csv`: core product, style, color,
  typography, UX, landing, app-interface, chart, icon, font, performance, and
  reasoning rows used by `searchDesignIntelligence()`.
- `skills/design-intelligence/data/stacks/`: stack-specific UI handoff guidance
  for web, mobile, native, component-library, and 3D surfaces.
- `skills/design-intelligence/data/slides/`: presentation strategy, layout,
  copy, chart, typography, color, and background evidence.
- `skills/design-intelligence/data/collateral/`: logo, icon, brand asset, CIP,
  and mockup context evidence.
- `skills/design-intelligence/references/`: compact local reference cards for
  brand, design system, UI styling, slide decks, collateral, and priority order.
- `scripts/lib/design-intelligence-search.mjs`: local retrieval, domain
  inference, recommendation synthesis, evidence formatting, and checksum logic.
- `references/design-intelligence-source-coverage.md`: local coverage map for
  source families, adapted assets, skipped assets, and rationale.

External references are supplemental. Use the internet only for current
references, market examples, official platform docs, live competitor pages, or
fresh visual evidence that the local pack cannot know. Do not depend on a remote
repository or external skill for baseline design expertise.

## Eight-Pass Expert Routine

This is an adaptive coverage routine, not a fixed eight-step user gauntlet.
Start every substantial design workflow with **Design Pass Triage** and record
each pass as `required | reuse | delegated | skipped | N/A` with a short
rationale in the owning artifact, config, or handoff.

Do not force all eight passes for every prototype. Full eight-pass coverage is
required for a new product, rebrand, missing design system, major audience or
brand-positioning change, or material visual direction change. If an approved
design system already exists and the request is a prototype, screen, flow, deck,
or refinement inside that system, reuse preference and visual-system decisions
instead of asking the user to approve palette, typography, spacing, radius,
motion, and component baseline again. If the system is candidate or
needs_revision, resume the design-system approval gate; do not treat it as
prototype-ready.

Prototype-only work inside an existing system normally runs the relevant local
evidence, reference, IA/user-flow, responsive/platform, quality, and
prototype/review/feedback passes. If the request needs a missing token,
component, asset, interaction, or platform behavior, create a narrow design
system extension request and ask exactly one approval question for that
extension. The user may explicitly skip a pass or delegate safe decisions to
the agent; record that skip/delegation and keep the next handoff state current.

Ask one user-facing question at a time at gates that require preference or
approval; do not silently collapse the flow into a single generated artifact.

1. **Preference intake and product fit**: capture audience, business goal,
   trust/risk, density, platform, interaction mode, data intensity, references
   to borrow from or avoid, and any style dislikes.
2. **Local evidence lookup**: query project memory, code search, approved design
   system artifacts, then the local design intelligence domains relevant to the
   surface. Record `Design Intelligence Evidence` when rows shape a decision.
3. **Reference scan**: collect 5-8 current direct, adjacent, and best-in-class
   references when web/search tools are available. For each, record what to
   borrow, what to avoid, and why it fits this product.
4. **IA and user-flow pass**: map jobs-to-be-done, navigation model, screen
   inventory, hierarchy, empty/error/loading/recovery paths, and user decisions.
5. **Visual system pass**: choose style, palette, typography, spacing, radius,
   iconography, imagery, motion and component density through candidate tokens.
6. **Responsive and platform pass**: cover declared viewports, safe areas,
   keyboard/touch/pointer paths, container behavior, and platform conventions.
7. **Quality pass**: check accessibility, performance, forms, feedback,
   navigation, charts, copy, state coverage, and token discipline.
8. **Prototype, review, and feedback pass**: run silent preview with feedback
   overlay, review the result, ask the canonical approve/revise/alternative/stop
   question, and only hand off after explicit approval and final tokens.

## Coverage Domains

Every design-facing workflow must explicitly consider these ten domains when the
surface is relevant:

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

## Product Fit

Use a product-fit style matrix before committing to visual direction. Match the
product category, user trust burden, density, interaction mode, platform
conventions, data intensity, and audience expectations before selecting style,
palette, typography, motion, and component density.

Examples of product-fit decisions:

- Operational SaaS and admin tools prioritize clarity, density, predictable
  navigation, keyboard paths, fast scanning, tables, filters, and stable layout.
- Finance, healthcare, government, and safety-sensitive products prioritize
  trust, high contrast, conservative motion, visible recovery paths, auditability
  and accessibility.
- Consumer, creator, gaming, and campaign surfaces may carry stronger visual
  identity, but still need state coverage, readable type, and reduced-motion
  fallbacks.
- Data-heavy products require chart semantics, legends, tooltips, accessible
  encodings, filtering, export, pagination or virtualization, and no color-only
  meaning.

## Stack-Aware UI Guidance

Design guidance must be stack-aware UI guidance, not generic visual taste:

- Web prototypes use native HTML/CSS/JS and Supervibe tokens before framework
  handoff.
- React, Vue, Svelte, Angular, Laravel, and similar stacks receive
  framework-neutral handoff plus token/component mapping.
- Mobile-native flows must respect platform safe areas, touch targets, system
  navigation, dynamic type, haptics where appropriate, and gesture alternatives.
- shadcn/ui, Tailwind, Radix, Material, SwiftUI, Flutter, and other libraries are
  implementation adapters; they do not override approved tokens, accessibility
  requirements, or explicit user feedback.

## Mandatory Gates

- Accessibility: contrast, labels, keyboard, focus, semantic structure, reduced
  motion, screen-reader announcements, error associations, and zoom tolerance.
- Touch & Interaction: target size, spacing, press feedback, hover-independent
  primary actions, gesture alternatives, pointer/focus parity, and touch-safe
  density.
- Performance: image dimensions, modern formats, lazy loading, font loading,
  layout shift prevention, main-thread budget, list virtualization, and no
  heavy motion where the surface is task-critical.
- Style Selection: style matches product category and is consistent across
  screens; icon language, imagery, texture, elevation, and density form one
  coherent system.
- Layout & Responsive: declared viewports only, no horizontal scroll, safe
  areas, content priority, stable dimensions, line length, and predictable
  reflow.
- Typography & Color: semantic tokens, readable sizes, hierarchy, contrast,
  dark-mode pairing where supported, and no raw one-off colors.
- Animation: meaningful, interruptible, transform/opacity based, duration
  tokenized, reduced-motion safe, and never used to hide latency or confusion.
- Forms & Feedback: visible labels, inline validation, loading/success/error
  states, recovery paths, autosave status, disabled-state rationale, and clear
  microcopy.
- Navigation Patterns: predictable back behavior, active state, deep links for
  key screens, breadcrumbs or tabs where depth requires them, and no hidden
  critical navigation.
- Charts & Data: chart type fits the data, legends/tooltips exist, color is not
  the only encoding, tables/lists handle scale, empty states are informative,
  and export/filter/sort affordances are explicit when expected.

## Senior-Agent Anti-Patterns

- Acting from generic taste instead of local evidence, product fit, and user
  preference.
- Starting candidate tokens before preference intake for a new direction or
  rebrand.
- Treating internet examples as the source of truth instead of supplemental
  references.
- Reusing old prototypes without an artifact-mode question.
- Letting a style trend override product context or accessibility.
- Using draft prototype visuals as production guidance before final tokens.
- Raw colors, magic spacing, arbitrary shadows, inline cubic-beziers, or one-off
  icon styles.
- Hover-only interactions, missing focus rings, disabled zoom, gesture-only
  critical actions, or missing keyboard paths.
- Chart visuals without labels, legends, accessible color treatment, or
  data-state coverage.
- A single happy-path screen with no state matrix, copy pass, responsive pass,
  review pass, or explicit feedback gate.
