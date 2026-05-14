# Design Creative Direction Patterns

Reusable creative-direction depth relocated from `creative-director`.

## Slicing Contract

- Agent files keep persona, invocation boundary, procedure, output contract, skills, verification, dialogue discipline, and anti-patterns.
- This reference holds reusable depth: decision trees, workflow matrices, detailed examples, and output templates.
- Load this file only when the current task needs the deeper pattern; otherwise use the concise agent contract.
- Treat copied source sections as reference patterns, not mandatory steps for every task.

## Creative Director: Local Design Expert Reference

Source agent: `agents/_design/creative-director.md`
Moved content type: design-intelligence dataset matrix and variant-set contract

## Local Design Expert Reference

Before producing design-facing output, read `docs/references/design-expert-knowledge.md` and run Design Pass Triage from the `Eight-Pass Expert Routine`. Do not force all eight passes for every prototype. Classify each pass as `required | reuse | delegated | skipped | N/A` with rationale. If an approved design system already exists and the request is a prototype, screen, deck, or refinement inside that system, reuse preference and visual-system decisions and run only the relevant evidence, reference, IA/user-flow, responsive/platform, quality, and prototype/review passes. If a candidate or needs_revision design system exists, resume design-system approval instead of treating it as prototype-ready. Full eight-pass coverage is required only for new products, rebrands, missing design systems, or material direction changes.

Query local design intelligence through `designContextPreflight()` or `searchDesignIntelligence()` for the relevant local domains: `product`, `style`, `color`, `typography`, `ux`, `landing`, `app-interface`, `charts`, `icons`, `google-fonts`, `react-performance`, `ui-reasoning`, `stack`, `slides`, and `collateral`. External references are supplemental: use the internet only for current references, market examples, official platform docs, live competitor pages, or fresh visual evidence that local data cannot contain.

Local folder map: `skills/design-intelligence/data/manifest.json`, `skills/design-intelligence/data/*.csv`, `skills/design-intelligence/data/stacks/`, `skills/design-intelligence/data/slides/`, `skills/design-intelligence/data/collateral/`, `skills/design-intelligence/references/`, and `references/design-intelligence-source-coverage.md`.

### Dataset Family Matrix

Before approving a direction, record which design-intelligence families shaped
the choice:

| Family | Direction question answered |
| --- | --- |
| product/style | category fit, differentiation pressure, and visual language |
| color/typography | emotional tone, readability, contrast, and brand memory |
| ux/landing/app-interface | conversion pattern, trust sequence, navigation, and platform behavior |
| icons/collateral/creative packs | asset voice, icon treatment, collateral coherence, borrow/avoid notes |
| stack/slides | implementation constraints and presentation transfer when relevant |

No family can be silently skipped when the direction depends on it. If the
approved design system overrides retrieved rows, say so in the matrix.

Apply the `Reference Quality Ladder` from `docs/references/design-expert-knowledge.md` before any external source shapes the direction. Every reference needs a reference role, quality tier, capture date or local-pack source, borrow note, avoid note, and fit rationale. A source may be a creative benchmark, interaction benchmark, category convention, direct competitor, platform standard, implementation library, anti-pattern, or do-not-use-as-style. Famous product names are never style authority until decomposed into concrete traits.

### Creative Pack Selection

Before the reference scan, read `docs/references/creative-reference-taxonomy.md`
and choose the path:

- Fast path: approved design system exists; use only the pack needed for a
  missing extension or screen capability.
- Medium path: candidate or needs_revision system exists; use one or two packs
  to sharpen the candidate and route back to section approval.
- Full creative path: new product, rebrand, missing system, or material visual
  shift; select two or three local packs from
  `skills/design-intelligence/references/creative/` and produce 2-3 candidate
  directions with different palette, type, motion, imagery, hierarchy, or
  density axes.

Always include `creativePacks.path`, selected pack paths, borrow notes, avoid
notes, and differentiation pressure in Design Intelligence Evidence. A direct
competitor or famous product can be category pressure, not a creative north
star.

### Design Diversity Benchmark

Use the Design Diversity Benchmark before presenting candidate directions. A
direction must differ on at least three changed axes across palette, typography,
motion, imagery, hierarchy, density, composition, and interaction. Same shell,
new paint is a failed direction even when the colors or type choices look
polished. Same shell, new paint is never a valid creative direction.

For each direction, write `differsBecause`, `gains`, `givesUp`, reference packet,
screenshot plan, token notes, `domLayoutSignature`, `cssTokenSignature`,
`screenshotViewportPlan`, and `interactionMotionSignature`. If two concepts use
the same layout skeleton, same density, same content priority, and same
interaction rhythm, merge them or redesign one before handoff.

### Explicit Variant-Set Contract

When the brief asks for a concrete number of different variants, especially
five variants or "five creative variants", the direction output must include a
variant-set contract instead of a comparison shell. The contract is durable
only when runtime receipts bind the creative-director output to
`.supervibe/artifacts/prototypes/<slug>/variant-manifest.json`.

The manifest must define one record per variant with `id`, `label`,
`artifactPath`, `feedbackTargetId`, `fullscreen`, `differsBecause`, `gains`,
`givesUp`, diversity `axes`, and artifact evidence fields. Each variant must
point at its own fullscreen artifact, usually
`.supervibe/artifacts/prototypes/<slug>/variants/<variant-id>/index.html`.
A primary tabbed switcher, carousel, or comparison shell is not a substitute
for separate variants when the user asked for separate directions.

If old prototypes are referenced as context, record functional evidence in each
variant: tasks, approvals, memory, skills, and automations when present. The
old artifact is evidence for product meaning and IA, not visual authority,
unless the user explicitly asks to preserve visual style.

## Creative Director: Procedure

Source agent: `agents/_design/creative-director.md`
Moved content type: full creative-direction procedure

## Procedure

1. **Search project memory** for prior brand decisions, critiques, stakeholder feedback, and abandoned directions in this product or related products. Cite at least 3 relevant prior entries or explicitly note "no prior direction found".
2. **Read PRD / vision / audience docs** — a direction without an audience is decoration; capture primary persona, primary moment, primary emotion target.
3. **Brand audit** (if existing brand) — inventory current palette, type, motion, voice, surfaces; tag each as KEEP / FLEX / RETIRE with reason.
4. **Discover research/asset MCPs** — invoke `supervibe:mcp-discovery` with categories `[design-assets, web-crawl, search]`. Use returned tool names for Figma asset reads + competitor scrape. If none available → fall back to WebFetch/WebSearch and explicitly note `MCP unavailable; competitor scan limited to manually fetched/searchable URLs`.
5. **Reference scan** — start from local design intelligence evidence and local creative packs, then use Firecrawl/WebSearch/WebFetch where available to collect 8-12 direct, adjacent, and out-of-category references. For each reference, record URL, reference role, quality tier, captured date, what to borrow, what to avoid, and whether the idea is visual language, interaction, information architecture, motion, or copy. Include at least 3 true creative benchmark references outside the immediate SaaS category when defining a new brand direction; direct competitors and platform standards can explain conventions but cannot be the creative north star. Never copy a brand wholesale; extract patterns.
5a. **Explicit variant count** — if the user asks for a concrete number of design variants, honor that number when it is safe and scoped. A request such as "same structure, 5 different styles" means: first produce a reference inventory for IA/section order, then create five variants that differ on real axes such as palette, typography, motion, imagery, hierarchy, density, or interaction rhythm. Do not reduce the count to the default 2-3 directions, and do not treat the reference as visual authority unless visual inspiration was explicitly approved.
5b. **Media capability check** — run `node "<resolved-supervibe-plugin-root>/scripts/detect-media-capabilities.mjs" --json` before proposing video, GIF, or rendered motion deliverables. If `video=false`, choose CSS/WAAPI live motion, static storyboard frames, SVG/Lottie spec from existing assets, or poster-frame treatment instead.
5c. **Prototype capability recommendation** — for every direction that depends on motion, charts, 3D, maps, code editing, physics, data visualization, or generated media, recommend one capability mode: `native-static`, `enhanced-native`, `bundled-dependency`, `framework-sandbox`, or `handoff-only`. If the recommendation is not `native-static`, require `templates/design-decisions/prototype-capability-plan.md.tpl` before prototype build and name candidate libraries such as Motion, GSAP, Lottie/lottie-web, Rive, Three.js, PixiJS, D3, Observable Plot, ECharts, MapLibre GL, Theatre.js, Rough.js, Matter.js, Monaco, or CodeMirror. Downstream agents may reject the recommendation only with written evidence.
6. **Competitor scan** — identify 5-8 direct + 2-3 adjacent competitors; capture their palette, type, voice, distinctive moves; identify category sea-of-sameness to avoid; identify ownable whitespace.
6. **Define brand personality** through a structured one-question-at-a-time dialogue (see "User dialogue style" below). Aim for 3-5 adjectives with negative-space pairs ("trustworthy not stiff", "warm not soft", "precise not cold"); these are the constraint anchors for every later choice.
7. **Define emotional anchors** per primary user moment (first-launch, daily-use, error-state, success-moment, payment, etc.) — what should the user feel in their body during each.
8. **Build mood-board with per-image rationale** — collect 30-60 images across 3 candidate directions; for each image record: source, what to extract (light? composition? type? color? texture? mood?), what to ignore; cull to 15-20 strongest with narrative threading the selections.
9. **Propose design system structure** — BEFORE any prototype work, write `.supervibe/artifacts/prototypes/_design-system/system.md` listing the proposed token surfaces (color roles, type roles, space scale, radius, elevation, motion tiers, animation toolchain, illustration style). Send to user for explicit approval as a direction/system-structure gate. This may set `creative_direction.status = selected`; it must not set `design_system.status = approved` or unlock prototypes. **Do not start prototypes until the brandbook review packet approves every required design-system section.** This gate prevents the most common failure mode: building visuals that contradict an unspecified system.
10. **Token intent — color**: define palette as semantic roles (primary, secondary, accent, success, warning, danger, neutrals); per color record HEX, role, emotional intent, accessibility check (WCAG AA contrast against background pairs), category-distinctiveness note; max 2-3 accents per screen rule.
11. **Token intent — type**: define hierarchy roles (display, heading, body, caption, mono); pairing rationale (contrast in weight/proportion/era); language coverage (Cyrillic? CJK? RTL?); variable axes; license; fallback stack.
12. **Token intent — space + radius + elevation**: define spacing scale logic (4 / 8 base; geometric or arithmetic), radius philosophy (sharp / soft / mixed-with-rule), elevation tiers and what each communicates.
13. **Token intent — motion**: define timing tiers (instant / quick / considered / deliberate), easing rules per intent (entrance / exit / state-change / attention), reduced-motion behavior, personality match (patient brand uses longer durations; punchy brand uses snappier curves). Record GPU-cheap defaults: animate `transform` and `opacity`; avoid animating `filter`, `box-shadow`, `width/height`, `top/left`, `background-color` for repeating loops — those force layout/paint and burn the 16ms repaint budget.
14. **Animation library decision** — record explicit choice with rationale. Copy `templates/design-decisions/animation-library-matrix.md.tpl` to `.supervibe/artifacts/prototypes/<slug>/decisions/animation.md` and fill ALL sections. Default position: native CSS + WAAPI for everything until measured need proves otherwise. Any third-party library must justify weight (KB), interop (SSR? React 19? RSC?), and what it unlocks that native can't deliver. The decisions file becomes part of the handoff bundle.
15. **Graphics medium decision** — for each significant graphic surface (hero, illustration, data-viz, background, micro-illustration) decide Figma export / SVG / Canvas / WebGL. Copy `templates/design-decisions/graphics-medium-matrix.md.tpl` to `.supervibe/artifacts/prototypes/<slug>/decisions/graphics.md` and fill per-surface choice with rationale. Record summary in `.supervibe/artifacts/prototypes/_design-system/system.md`.
15b. **Prototype Capability Plan** — if the chosen direction needs `bundled-dependency`, `framework-sandbox`, or `handoff-only`, copy `templates/design-decisions/prototype-capability-plan.md.tpl` to `.supervibe/artifacts/prototypes/<slug>/decisions/prototype-capability-plan.md`. Fill mode, libraries/APIs, native alternative rejected, artifact scope, license/security posture, bundle/performance budget, accessibility fallback, reduced-motion fallback, and verification commands. This file is mandatory before prototype-builder can use the library.
15c. **Component library decision** — after brandbook Section 6 is approved, ask the user the Section 6.5 question (component library: custom / shadcn / MUI / Mantine / Radix-or-HeadlessUI / explicit). If user picks anything other than "custom", dispatch `skill: supervibe:component-library-integration` immediately. Do NOT proceed to prototype until library bridge is approved. The chosen library + bridge depth + bridge path become part of `manifest.json` `componentLibrary`.
16. **Reduced-motion + a11y motion plan** — for every animation tier, specify the `prefers-reduced-motion: reduce` fallback. No animation ships without one. Vestibular-trigger motions (parallax, large translate, zoom) MUST be cut entirely under reduced-motion, not just shortened.
17. **Trial layouts** — apply approved system to 3 representative screens (landing, primary task, error state); pressure-test the tokens against real content; surface contradictions. If contradictions require token changes → escalate as system-level revision (re-approval needed) before continuing.
18. **Critique session** — invite ux-ui-designer and copywriter; capture feedback verbatim in critique log; classify each item as system-level / instance-level / principle-violation / out-of-scope; resolve in writing.
19. **Narrow to one direction** — abandoned directions move to `.supervibe/artifacts/brandbook/alternatives/<slug>/` with reason ("rejected because conflicted with audience expectation of seriousness in finance category"). Never deleted — traceability protects future revisits.
20. **DEFEND palette** — write a one-paragraph defense per primary color answering: why this hue, why this saturation, why this lightness, why over the obvious alternative; same for type pairing.
21. **Author DO / DON'T** — concrete examples, not abstractions ("DO: pair display weight 700 with body weight 400 for hierarchy; DON'T: use display weight under 500, it loses presence at large sizes"). Include animation DO/DON'T ("DO: stagger list entrance at 30ms with reduced-motion fallback to instant; DON'T: parallax hero — vestibular trigger and re-paints on every scroll tick").
22. **Output brand direction document** with mood board + system summary + token intent + animation tooling decisions + DO/DON'T + critique log + revision criteria + alternatives index.
23. **Stakeholder alignment** — present, capture sign-off in writing, log dissents.
24. **Score** with `supervibe:confidence-scoring` — rubric ≥9 before handoff to brandbook materialization.

### User dialogue style

The director must talk to the user **one question at a time**. This is non-negotiable.

- Format every question as a numbered options list in markdown.
- Begin every question with a progress indicator: `**Step N of M: <topic>**`.
- Limit each turn to ONE question. Never bundle "what's the personality, the audience, the palette, the typography preference, and the motion vibe?" into one message — users answer the first one and ignore the rest, leaving silent gaps.
- After each answer, restate it back ("Captured: brand personality leans toward 'precise, warm, trustworthy'.") before moving on.
- When offering alternatives, frame as "Pick A, B, or C — here's what each gives up":

```markdown
**Step 3 of 5: palette mood**

Pick the direction you want to explore first. Each is a tradeoff:

1. **Saturated minimalism** — one bold accent on broad neutrals. Reads premium and confident, but risks feeling sparse on data-dense screens.
2. **Earth-toned warmth** — muted naturals with one warm primary. Reads human and approachable, but can feel quiet against competitors using high-contrast colorways.
3. **Architectural mono** — near-monochrome with one cool accent. Reads serious and editorial, but limits emotional range for celebratory moments.

Which one matches your gut? (Answer 1, 2, or 3 — we can revisit.)
```

This pattern repeats across personality, audience moments, palette, type, motion, illustration. The dialogue is the deliverable's first artifact.

### Animation + graphics tooling decision matrix

Animation library choice — concrete criteria, not vibes:

| Need | Default | When to switch up |
|------|---------|-------------------|
| Hover / focus / state transitions; micro-interactions ≤300ms | **Native CSS transitions + WAAPI** (`element.animate(...)`) | Never — this is the floor |
| Orchestrated multi-element timeline (sequence, stagger across components, scrub-control) | **Motion One** (~3KB, WAAPI under the hood, modern, RSC-safe) | If you need scroll-triggered scrubbing across 50+ elements with pinning → GSAP |
| Scroll-triggered storytelling, pinning, scrub, complex timelines, SVG morphing | **GSAP + ScrollTrigger** (paid for non-trivial commercial use; deep API; bulletproof browser coverage) | If GSAP license is a blocker → Motion One + custom IntersectionObserver |
| Layout animations (FLIP — element reorders, list shuffles), gesture (drag/swipe), spring physics in React app | **Framer Motion / motion-react** (~30-50KB) | If bundle is critical and you only need 1-2 cases → Motion One + manual FLIP |
| Designer-handed-off complex character animation, illustration, mascot motion | **Lottie** (After Effects → bodymovin export → lottie-web / lottie-react) | If file >300KB or runs at <50fps on mid-tier mobile → re-author in SVG+CSS or as MP4/WebM |
| Legacy SVG morphing, decade-old browser support | **Anime.js** (mature, broad support, smaller than GSAP, free) | New projects rarely need this — Motion One covers most cases |
| One-off CSS keyframe (logo pulse, loader) | **Pure `@keyframes`** | Don't reach for a library |

**Decision rule:** start at native CSS + WAAPI; only escalate when a measured need (interaction designer hands you a multi-element scrubbed timeline, or a Lottie file from After Effects, or a complex spring-physics drag) crosses the line. "We might need GSAP someday" is not a need.

Graphics medium choice:

| Surface | Choose | Why |
|---------|--------|-----|
| Logo, icon, simple illustration, marketing hero | **SVG** (hand-authored or Figma export) | Resolution-independent, accessible, animatable via CSS/SMIL/JS, tiny |
| Character animation, complex illustration with motion | **Lottie** | Designer authoring in AE; runtime cheaper than equivalent SVG+JS hand-write |
| Particle effects, generative backgrounds, real-time data viz with thousands of nodes | **Canvas 2D** | Imperative pixel control; no DOM cost per element |
| 3D, mesh gradients (real-time), shader effects, immersive hero | **WebGL / WebGPU** (Three.js, OGL, Pixi for 2D-on-GPU) | GPU shaders unlock looks impossible in CSS; cost: bundle, complexity, accessibility burden |
| Static mesh gradient, blob shape, abstract background | **Pre-rendered PNG/WebP from Figma** OR **CSS conic/radial-gradient stack** | Don't ship WebGL for a static decoration; the right answer is a 50KB image or 12 lines of CSS |
| Photography | **WebP / AVIF with `<picture>` fallback** | Format negotiation per browser; 30-60% smaller than JPEG |

**Mesh gradients, blob shapes, custom shaders — when worth the complexity:**
- Static mesh / blob → pre-render in Figma or use CSS gradients. Cost: zero. Pixel-perfect across devices.
- Animated mesh that *responds to input* (cursor tracking, audio-reactive, scroll-distortion) → WebGL/WebGPU shader. Cost: 50-150KB lib + shader auth time + a11y plan. Only worth it if the animation is a brand pillar, not decoration.
- Custom shader effects (chromatic aberration, displacement, ripple) → only when the brief explicitly demands a "wow" moment that print/CSS can't deliver. Provide a static fallback for `prefers-reduced-motion` AND for low-end devices (`navigator.hardwareConcurrency < 4` or matchMedia battery hints).

**Lottie pipeline (when the project warrants it):**
1. Designer authors animation in After Effects with vector layers (no rasters, no expressions that bodymovin can't export).
2. Export via `bodymovin` plugin → `.json` file.
3. Inspect file size — target <100KB for in-flow animations, <300KB for hero. If larger, simplify (fewer keyframes, fewer shape layers, remove gradients with stops >4).
4. Integrate via `lottie-web` or framework wrapper (`lottie-react`, `@lottiefiles/dotlottie-react`).
5. Lazy-load below the fold; respect `prefers-reduced-motion` (pause at frame 0 or swap to static poster).
6. QA on mid-tier mobile (throttle CPU 4x in DevTools) — must hit 60fps or fall back to static.

**Performance budget (the 16ms truth):**
- GPU-cheap (compositor-only): `transform`, `opacity`, `filter` on isolated layers (`will-change`, `transform: translateZ(0)`).
- GPU-expensive: `filter` on large surfaces, `box-shadow` animations, `backdrop-filter` on scroll, `border-radius` morphing, `width/height` (forces layout), `top/left/margin` (forces layout), `background-color` on large surfaces (forces paint).
- Repaint budget: stay under 5ms scripting + 8ms render per frame for 60fps. Anything more on repeating animations → switch property or move to canvas.
- Test discipline: every motion ships with a Performance panel screenshot showing no layout/paint storms during the animation.

**Reduced-motion discipline (non-negotiable):**
- Every animation has a `@media (prefers-reduced-motion: reduce)` branch — instant, crossfade, or no-op.
- Vestibular-trigger animations (parallax, scale > 1.1, translate > 50px, rotation, zoom) → `none` under reduced-motion. Not "shorter" — gone.
- Auto-playing video/Lottie with motion → paused or replaced with static poster.
- Test: toggle OS reduced-motion preference and walk every flow. No animation should surprise the user.

### Variant generation discipline

When the user rejects a direction, the director offers **2-3 alternative directions with explicit tradeoffs** — never random regen.

Each alternative MUST answer two questions:
1. **"This differs from what we tried because X"** — name the axis of difference (palette saturation, type era, motion personality, illustration style, hierarchy density).
2. **"You give up Y to gain Z"** — every alternative is a trade. Pretending otherwise is dishonest and produces buyer's remorse.

Each rejected/alternative direction is parked in `.supervibe/artifacts/brandbook/alternatives/<slug>/` with:
- A one-paragraph summary of the direction's POV.
- Rationale for why it was set aside.
- A pointer to the moodboard subset, palette draft, and type pairing for that direction.
- A revisit-criteria note ("come back if audience research shifts toward older demographic" / "revisit if competitor X relaunches with our current direction").

Inconsistency between alternatives is a code-smell: if direction A and direction B share the same hero illustration and same type pairing, they're not alternatives — they're the same direction with different paint. Force at least three of {palette / type / motion / illustration / hierarchy} to differ between any two alternatives.

## Creative Director: Common Workflows

Source agent: `agents/_design/creative-director.md`
Moved content type: workflow routing and feedback patterns

## Common workflows

### New brand direction (zero-to-one)
1. Read PRD, audience, vision; project-memory search for any prior aborted attempts
2. Competitor scan (5-8 direct + adjacent); identify sea-of-sameness and whitespace
3. One-question-at-a-time dialogue: personality anchors with negative-space pairs
4. Build 3 candidate mood-board directions with per-image rationale
5. Propose design system structure → user approval gate (BEFORE prototypes)
6. Token intent first pass for each direction (lightweight)
7. Animation library + graphics medium decisions per direction
8. Trial layouts — landing + primary task + error — for chosen direction
9. Critique session, classify feedback, narrow to one
10. Park other 2 in alternatives/ with revisit criteria
11. Full token intent on chosen; defend palette + type
12. Author DO/DON'T with concrete examples (including animation DO/DON'T)
13. Stakeholder alignment, capture sign-off, score, hand off to `supervibe:brandbook`

### Brand refresh (refine existing identity)
1. Brand audit — inventory current palette, type, motion, voice, surfaces
2. Tag each element KEEP / FLEX / RETIRE with reason
3. Identify equity to preserve (recognizable logo glyph, signature color, voice quirks)
4. Identify debt to retire (dated metaphors, low-contrast type, motion that ages poorly)
5. Mood-board contrasts old vs new per shift, with rationale
6. System-level revision proposal → user approval gate
7. Token intent diffs — old token, new token, transition rule
8. Animation toolchain reassessed (legacy GSAP install? still warranted?)
9. Cohabitation plan — surfaces that ship new immediately vs surfaces that migrate over time
10. Critique session emphasizing loyal-user impact
11. Stakeholder alignment with explicit attention to risk of alienation
12. Migration timeline with rollback criteria

### Sub-brand or extension
1. Read parent brandbook FIRST — identify locked vs flex zones
2. Define relationship: endorsed / independent / freestanding
3. Mood-board scoped to flex zones, parent referenced only as boundary
4. System extension proposal → user approval gate (which parent tokens inherit, which override)
5. Token intent: shared neutrals, distinct accents (typically)
6. DO/DON'T heavy on parent-vs-extension boundaries
7. Trial layouts including a co-presence surface
8. Critique session with parent-brand owner present
9. Stakeholder alignment from both parent-brand and sub-product owners

### Feedback round (after stakeholder review)
1. Capture feedback verbatim into critique log
2. Classify each item: system-level / instance-level / principle-violation / out-of-scope
3. **System-level** → re-approval cycle: write proposed system.md diff, get sign-off, then propagate
4. **Instance-level** → apply directly within existing tokens, log in critique entry, no re-approval
5. **Principle-violation** → revise direction with reasoning OR hold the line in writing with reasoning
6. **Out-of-scope** → defer to relevant agent (ux-ui-designer for IA, copywriter for voice, product-manager for scope)
7. Update revision criteria if feedback exposes a missing one
8. Re-present, capture updated sign-off

### Rejection of direction (user says "I don't like this")
1. Acknowledge in one line; do NOT defend reflexively
2. Ask one clarifying question (numbered options): "Is the issue with palette / type / motion / hierarchy / overall feeling?"
3. Park current direction in alternatives/<slug>/ with reason
4. Generate 2-3 NEW alternatives, each differing on ≥3 axes
5. Present alternatives with explicit "differs because X" and "gives up Y to gain Z" framing
6. Ask user to pick one (numbered options) — one question, one turn
7. Resume from step 6 of new-brand workflow with chosen direction

## Creative Director: Engagement Decision Tree

Source agent: `agents/_design/creative-director.md`
Moved content type: engagement-type routing tree

## Decision tree (engagement type)

```
NEW BRAND (zero-to-one identity):
  - Full brand audit not applicable (nothing to audit yet); start with audience + product POV
  - Heavy competitor scan (must avoid sea-of-sameness in category)
  - Mood-board with 3 distinct directions before narrowing to 1
  - Token intent built ground-up; defend every choice
  - Stakeholder alignment is high-stakes — first impression of the brand

REFRESH (existing brand matures):
  - Brand audit MANDATORY — document what exists, what works, what fails
  - Identify equity to preserve (logo glyph? signature color? voice?)
  - Identify debt to retire (legacy gradients, dated type, mixed metaphors)
  - Mood-board contrasts old vs new with rationale per shift
  - Migration plan: which tokens move when; cohabitation rules

EXTENSION (new product under existing brand):
  - Read existing brandbook FIRST — extension is constrained, not blank
  - Identify what must stay (parent identifier) vs what can flex (sub-product accent)
  - Mood-board scoped to the flex zones, not the locked zones
  - DO/DON'T explicit about parent-vs-extension boundaries

SUB-BRAND (distinct product, related parent):
  - Define relationship: endorsed (visible parent), independent (parent in fine print), or freestanding
  - Mood-board for sub-brand POV; reference parent only as boundary
  - Token intent: shared neutrals, distinct primaries usually

CO-BRAND (two equal identities together):
  - Define hierarchy rules per surface (lockup, app, marketing)
  - Negotiate shared neutrals; protect each brand's distinctive accents
  - DO/DON'T heavy here — co-branding fails through ambiguity

MOOD-BOARD DISCIPLINE (any of the above):
  - Every image: source, rationale, what to extract, what to ignore
  - No "vibes only" boards; vibes must be named (warmth? austerity? tension? generosity?)
  - 3 directions explored before committing; abandoned directions documented with reason

FEEDBACK CLASSIFICATION (after any review):
  - SYSTEM-LEVEL → token change, rule change, primitive change → re-approve before applying
  - INSTANCE-LEVEL → one-screen adjustment within existing tokens → apply, log, move on
  - PRINCIPLE-VIOLATION → conflicts with locked anchors → revise direction or hold the line in writing
  - OUT-OF-SCOPE → defer to other agent (ux-ui-designer / copywriter / product-manager)

REJECTION RESPONSE (user rejects current direction):
  - DO NOT regen randomly; that produces noise and erodes trust
  - Offer 2-3 alternative directions with explicit tradeoffs
  - Each alternative names: "this differs from what we tried because X" + "you give up Y to gain Z"
  - Park abandoned direction in alternatives/ with reason; never delete (traceability)
  - When parking a direction in `alternatives/`, copy `templates/alternatives/tradeoff.md.tpl` and fill all sections. Never delete a parked variant — convert to `Status: rejected` with a Rejection note instead.
```

## Creative Director: Artifact Template

Source agent: `agents/_design/creative-director.md`
Moved content type: creative-direction output template

## One-line vision
<single sentence the team can recite>

## Audience + moment
- Primary persona: ...
- Primary moment: ...
- Target feeling: ...

## Personality anchors
- <adjective> not <negative-space pair>
- ...

## Mood board
(15-20 curated images)
- image-01.jpg — source: <url>; extract: <warmth of late-afternoon light>; ignore: <subject matter>
- image-02.jpg — ...

## Design system summary (approved)
- Color roles: ...
- Type roles: ...
- Space scale: ...
- Radius philosophy: ...
- Elevation tiers: ...
- Motion tiers: ...
- Animation library: ... (with rationale)
- Graphics media: SVG for X, Lottie for Y, Canvas for Z
- Reduced-motion plan: ...

## Palette intent
| Token | Hex | Role | Emotional intent | A11y | Category note |
|-------|-----|------|------------------|------|---------------|
| brand.primary | #... | primary | calm authority | AA on neutral.50 | distinct from competitor blue |

**Defense — primary**: <paragraph>

## Type intent
- Display / Heading / Body / Mono — family + rationale + license + coverage

## Space / radius / elevation intent
...

## Motion + animation intent
- Timing tiers: instant 80ms / quick 160ms / considered 280ms / deliberate 480ms
- Easing rules: ...
- Library: <choice> — <rationale>
- Reduced-motion behavior: ...
- GPU-budget rule: animate transform/opacity only on hot paths

## Graphics decisions
- Hero: <medium + rationale>
- Illustration: <medium + rationale>
- Background / mesh / blob: <medium + rationale>

## DO / DON'T
- DO: <concrete>
- DON'T: <concrete>

## Alternatives explored
- alternatives/<slug-a>/ — POV: ...; set aside because ...; revisit if ...
- alternatives/<slug-b>/ — POV: ...; set aside because ...; revisit if ...

## Critique log
- <stakeholder> — <feedback> — <classification: system-level / instance-level / principle / out-of-scope> — <resolution>

## Revision criteria
This direction will be revisited if:
- Audience shifts
- Competitive frame shifts
- Product scope expands beyond <boundary>

## Sign-off
- <stakeholder>: APPROVED / APPROVED WITH NOTES / DISSENT — date

```
Confidence: <N>.<dd>/10
Override: <true|false>
Rubric: brandbook
```
```
