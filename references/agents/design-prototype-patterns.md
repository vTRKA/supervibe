# Design Prototype Patterns

Reusable prototype planning, building, and evidence depth relocated from `prototype-builder`.

## Slicing Contract

- Agent files keep persona, invocation boundary, procedure, output contract, skills, verification, dialogue discipline, and anti-patterns.
- This reference holds reusable depth: decision trees, workflow matrices, detailed examples, and output templates.
- Load this file only when the current task needs the deeper pattern; otherwise use the concise agent contract.
- Treat copied source sections as reference patterns, not mandatory steps for every task.

## Prototype Builder: Local Design Expert Reference

Source agent: `agents/_design/prototype-builder.md`
Moved content type: design-expert and prototype-specific reference gates

## Local Design Expert Reference

Before producing design-facing output, read `docs/references/design-expert-knowledge.md` and run Design Pass Triage from the `Eight-Pass Expert Routine`. Do not force all eight passes for every prototype. Classify each pass as `required | reuse | delegated | skipped | N/A` with rationale. If an approved design system already exists and the request is a prototype, screen, deck, or refinement inside that system, reuse preference and visual-system decisions and run only the relevant evidence, reference, IA/user-flow, responsive/platform, quality, and prototype/review passes. If a candidate or needs_revision design system exists, resume the design-system approval gate instead of building. Full eight-pass coverage is required only for new products, rebrands, missing design systems, or material direction changes.

Query local design intelligence through `designContextPreflight()` or `searchDesignIntelligence()` for the relevant local domains: `product`, `style`, `color`, `typography`, `ux`, `landing`, `app-interface`, `charts`, `icons`, `google-fonts`, `react-performance`, `ui-reasoning`, `stack`, `slides`, and `collateral`. External references are supplemental: use the internet only for current references, market examples, official platform docs, live competitor pages, or fresh visual evidence that local data cannot contain.

Local folder map: `skills/design-intelligence/data/manifest.json`, `skills/design-intelligence/data/*.csv`, `skills/design-intelligence/data/stacks/`, `skills/design-intelligence/data/slides/`, `skills/design-intelligence/data/collateral/`, `skills/design-intelligence/references/`, and `references/design-intelligence-source-coverage.md`.

### Dataset Family Matrix

Prototype setup must translate design-intelligence rows into build constraints:

| Family | Prototype constraint |
| --- | --- |
| product/style/color/typography | first-viewport hierarchy, palette, type scale, density, and token usage |
| ux/app-interface | state matrix, keyboard/touch behavior, focus, forms, feedback, and platform-specific rules |
| charts/icons/landing | chart shell, icon affordances, landing structure, and non-color fallback |
| stack/collateral/slides | framework handoff, asset treatment, deck/collateral transfer, and implementation limits |

If a prototype uses advanced visuals, data-viz, 3D, maps, animation libraries,
or canvas, the matrix must connect those choices to tokens, accessibility, and
reduced-motion fallback before code is written.

## Prototype Builder: Prototype Capability Plan

Source agent: `agents/_design/prototype-builder.md`
Moved content type: capability-mode decision contract

## Prototype Capability Plan

Before writing HTML/CSS/JS, classify the prototype mode:

- `native-static`: semantic HTML/CSS/JS with no advanced runtime effect.
- `enhanced-native`: CSS/WAAPI, Canvas, SVG, local assets, browser APIs, or local JSON fixtures.
- `bundled-dependency`: an approved local bundle for Motion, GSAP, Lottie/lottie-web, Rive, Three.js, PixiJS, D3, Observable Plot, ECharts, MapLibre GL, Theatre.js, Rough.js, Matter.js, Monaco, CodeMirror, or another scoped library that materially improves the prototype.
- `framework-sandbox`: temporary framework/build sandbox when the brief requires framework-specific proof.
- `handoff-only`: static/storyboard output plus exact production implementation notes when the runtime cannot be responsibly rendered.

Any mode beyond `native-static` must be recorded in `.supervibe/artifacts/prototypes/<feature>/decisions/prototype-capability-plan.md`. Dependencies are tools, not taste: name the product problem they solve, the native-only alternative rejected, the bundle and license risk, the accessibility and reduced-motion fallback, and the command evidence used to verify the artifact.

## Prototype Builder: Procedure

Source agent: `agents/_design/prototype-builder.md`
Moved content type: full prototype build procedure

## Procedure

0. **MCP discovery**: invoke `supervibe:mcp-discovery` with category=`figma` for token + asset extraction. Fall back to WebFetch / manual import if MCP unavailable.
1. **Search project memory** for prior prototypes of similar features — reuse interpretation precedents.
2. **Artifact mode gate (MANDATORY)** — run `node "<resolved-supervibe-plugin-root>/scripts/lib/design-artifact-intake.mjs" --json --brief "<brief>"`. If existing artifacts are present and the brief is ambiguous, ask the user one question: continue an existing artifact, create a new design from scratch, or create an alternative next to the old one. Do not read, copy, or edit old `.supervibe/artifacts/prototypes/`, `.supervibe/artifacts/mockups/`, or `.supervibe/artifacts/presentations/` files until this choice is explicit.
3. **Design system gate (MANDATORY)** - load `.supervibe/artifacts/prototypes/_design-system/design-flow-state.json` and `.supervibe/artifacts/prototypes/_design-system/manifest.json`. If `design_system.status !== "approved"` or any required section is missing from `approved_sections` (`palette`, `typography`, `spacing-density`, `radius-elevation`, `motion`, `component-set`, `copy-language`, `accessibility-platform`) -> STOP and tell user: "Design system is not approved yet. Return to the review packet and approve the missing sections; candidate status does not unlock prototype work." Do not proceed.

3a. **Target-specific scaffolding.** Read `.supervibe/artifacts/prototypes/<feature>/config.json` for `target`. Branch directory layout:
- `web` → `.supervibe/artifacts/prototypes/<feature>/{index.html, styles/, scripts/, content/}`. Single page or pages/.
- `chrome-extension` → `.supervibe/artifacts/prototypes/<feature>/{popup/index.html, options/index.html, side-panel/index.html, manifest.json (mock)}`. Each surface its own HTML file. Verify CSP compliance: no `<script>` inline content; all JS in external files.
- `electron` → `.supervibe/artifacts/prototypes/<feature>/{main-window/index.html, settings/index.html}`. Note in README that production preload bridge is NOT implemented in prototype.
- `tauri` → `.supervibe/artifacts/prototypes/<feature>/{main-window/index.html, secondary/index.html}`. Note production `invoke()` calls must be mocked at prototype stage.
- `mobile-native` → `.supervibe/artifacts/prototypes/<feature>/{ios/{home,detail}.html, android/{home,detail}.html}`. Each viewport iframe shows the corresponding HTML at the device-frame size. Note: production is React Native / Flutter / native — these HTMLs are fidelity sketches, not implementation.
3. **Read screen spec** from ux-ui-designer — confirm scope, states required, interaction patterns.
4. **Viewport question (ONE QUESTION, MARKDOWN)** — if `.supervibe/artifacts/prototypes/<feature>/config.json` doesn't already have `viewports`, ask:
   ```markdown
   **Step 1/3: Viewports.**
    Default - 375px mobile and 1440px desktop. What viewport set should be used?
    - Use defaults
   - ➕ + 768px (tablet)
   - ➕ + 1920px (wide)
    - Custom sizes
   ```
   Wait for explicit answer. Save to `config.json` BEFORE writing any HTML.
5. **Scaffold directory**: create `.supervibe/artifacts/prototypes/<feature>/` with `index.html`, `styles/{reset,system,pages}.css`, `pages/`, `scripts/`, `mocks/` (if interaction='data-fed'), `assets/`, `_reviews/`, `config.json`.
5a. **Mock Data Contract for data-fed prototypes**: if interaction is `data-fed`, invoke `mock-data-designer` through `supervibe:mock-data-contract` before writing fetch logic. Require `mocks/mock-contract.json`, `mocks/mock-scenarios.json`, and `mocks/api-fixtures/`; each local fetch must map to an endpoint/scenario fixture, every fixture must be synthetic, and unresolved backend schema questions must be listed before handoff.
6. **Scaffold HTML with an approved capability mode** — semantic markup (`<header>`, `<main>`, `<button>`, `<form>`, proper headings). Default to `native-static` or `enhanced-native`. If the work needs `bundled-dependency`, `framework-sandbox`, or `handoff-only`, write `.supervibe/artifacts/prototypes/<feature>/decisions/prototype-capability-plan.md` first from `templates/design-decisions/prototype-capability-plan.md.tpl`; name the library/API, reason, rejected native alternative, artifact scope, license/security, bundle/performance, accessibility fallback, reduced-motion fallback, and verification commands. No unapproved dependency imports — `grep -rE '(unpkg|cdn|jsdelivr|node_modules|import .* from)' .supervibe/artifacts/prototypes/<feature>/` MUST return 0 unless every hit is documented in the plan and reviewer notes. NO blind `<script src="https://...">`; use local relative bundles or handoff-only notes.
7. **Author CSS using token vars only** — every color via `var(--color-*)`, every space via `var(--space-*)`, every radius via `var(--radius-*)`, every type ramp via `var(--text-*)`. No raw hex, no raw px for layout, no magic numbers. Tokens come from `.supervibe/artifacts/prototypes/_design-system/tokens.css` (imported in `styles/system.css`); NEVER author tokens locally.
7a. **Critique Gate after first screen** — after the first representative screen renders, compare first-screen novelty to older prototypes and ask: "is this a new product direction or same shell, new paint?" If the answer is repaint, revise at least three axes across palette, typography, motion, imagery, hierarchy, density, composition, or interaction before expanding. If it passes, continue the remaining screens.
8. **Render state matrix** in `pages/states/` (one HTML per state: resting / hover / active / focus / focus-visible / disabled / loading / empty / error).
9. **Spawn preview** — only after the design-flow state has allowed prototype.requested and a draft prototype exists, invoke `supervibe:preview-server --root .supervibe/artifacts/prototypes --label <feature> --daemon` for live URL `http://localhost:NNNN/<feature>/` with hot-reload, shared `_design-system` imports, and mandatory feedback overlay. Serving the `<feature>` root directly is allowed only because the static server maps `/_design-system/*` to the sibling folder. Never pass `--no-feedback` for prototypes and never use `file://` delivery verification. Verify the served page has the visible `Feedback` button (`#supervibe-fb-toggle`) and token URL HTTP 200 before handing URL to user. Inform: "Feedback button in the lower-right corner lets you click any region, leave a comment, and send it back to the agent via UserPromptSubmit."
10. **Add keyboard interactivity** — tab order verified; focus visible; Escape closes modals; Enter activates buttons; arrow keys for menus/lists. Document tab order in README.
11. **Viewport breakpoints** — write CSS for the EXACT viewports in `config.json` (default 375 + 1440 only). Use `@media (min-width: <px>)` cascade or container queries. Do NOT add unrequested breakpoints (no silent 768 / 1024 / 1920 unless user asked).
12. **Motion pass** — add transitions/animations using token durations + easings from `.supervibe/artifacts/prototypes/_design-system/motion.css` (`var(--duration-quick)`, `var(--ease-out-quart)`). Wrap non-essential motion in `@media (prefers-reduced-motion: no-preference)`; verify `prefers-reduced-motion: reduce` short-circuits to instant or essential-only.
12a. **Media capability gate** — read `config.json.mediaCapabilities`; if missing, run `node "<resolved-supervibe-plugin-root>/scripts/detect-media-capabilities.mjs" --json` and write the result to config. If `video=false`, do not create or promise rendered video files. Use CSS/WAAPI motion in the preview, static storyboards, SVG/Lottie specs from existing assets, or poster frames instead.
13. **Token-discipline grep (CI gate)**:
    - `grep -rE '#[0-9a-fA-F]{3,8}|rgb\(|rgba\(' .supervibe/artifacts/prototypes/<feature>/styles/pages.css` → 0 hits
    - `grep -rE '\\b[0-9]+px\\b' .supervibe/artifacts/prototypes/<feature>/styles/pages.css` → audit each (1px borders OK, layout px NOT OK)
    - `grep -rE 'cubic-bezier\(' .supervibe/artifacts/prototypes/<feature>/` → 0 hits in pages.css (all easings via `var(--ease-*)`)
    - Drift report lists deliberate exceptions with inline `/* DRIFT: reason */` flag.
14. **Screenshot baseline** — capture each state at every declared viewport; save to `pages/states/.screenshots/`.
15. **Console check** — load each HTML in browser, verify zero console errors/warnings.
16. **Write README.md** — what to view, in what order; viewport list; tab-order map; known drifts (with rationale); browsers tested.
16a. **Consult `supervibe:interaction-design-patterns` for animation recipes.** Read `skills/interaction-design-patterns/SKILL.md` for the recipe matching this prototype's motion surfaces (entrance, micro, scroll-driven, shared-element, 3D, chart, map, or data-viz motion). If creative-director persisted `.supervibe/artifacts/prototypes/<feature>/decisions/animation.md` or a `Prototype Capability Plan`, follow the chosen library; otherwise default to native CSS/WAAPI. Cite the recipe used in your delivery output.
17. **Invoke ui-polish-reviewer** + **accessibility-reviewer** in parallel — they write to `.supervibe/artifacts/prototypes/<feature>/_reviews/`.
18. **Feedback loop (MANDATORY — never skip)** — after delivering URL, print the preview summary, lifecycle state, persisted state artifact path, and the shared post-delivery question from `scripts/lib/supervibe-dialogue-contract.mjs` with `intent="prototype_delivery"`.
    The browser feedback overlay is supplemental and not an approval gate; it captures region comments, while the chat feedback prompt remains the canonical approve/revise/alternative/stop lifecycle gate.
    Required summary fields:
    - `Prototype`: `http://localhost:NNNN`
    - `Viewports`: exact list from `config.json`
    - `State`: `draft` or `review`
    - `State artifact`: `.supervibe/artifacts/prototypes/<feature>/config.json` plus `.approval.json` only after explicit approval
    - `Question`: formatted via `buildPostDeliveryQuestion({ intent: "prototype_delivery" }, { locale })`
    Wait for explicit choice. Do NOT advance silently to handoff.

    If user picks "Alternative": spawn `.supervibe/artifacts/prototypes/<feature>/alternatives/<variant-name>/` and copy `templates/alternatives/tradeoff.md.tpl` to each variant directory. Fill all sections with explicit "differs because X / gives up Y to gain Z" framing. Never delete a parked variant - convert to `Status: rejected` with a Rejection note instead.
19. **Approval marker** (only on explicit "✅"): write `.supervibe/artifacts/prototypes/<feature>/.approval.json` per the schema in `supervibe:prototype` skill (status, approvedAt, approvedBy, viewports, designSystemVersion, feedbackRounds).
20. **Score** with `supervibe:confidence-scoring` against `prototype.yaml` rubric ≥9.
21. **Handoff bundle** (only after approval and final tokens): copy approved files to `.supervibe/artifacts/prototypes/<feature>/handoff/` with `README.md`, `components-used.json`, `tokens-used.json`, `viewport-spec.json`, `stack-agnostic.md`. For data-fed prototypes, also copy `mocks/mock-contract.json`, `mocks/mock-scenarios.json`, `mocks/api-fixtures/`, and `backend-integration.md`. This is what `<stack>-developer` agents pick up.

## Prototype Builder: Common Workflows

Source agent: `agents/_design/prototype-builder.md`
Moved content type: prototype workflow matrix

## Common workflows

### Single-screen prototype
1. Read brandbook + spec
2. Scaffold directory with index.html + styles.css + states/
3. Author HTML semantically, CSS with tokens only
4. Build state matrix (8 files)
5. Keyboard pass + responsive pass + motion pass
6. Drift-check grep, screenshot baseline
7. Reviewers + score + handoff

### State matrix build (existing prototype, adding states)
1. Read existing index.html + styles.css to understand component structure
2. Identify missing states from project state list
3. For each missing state: copy resting.html → state.html, modify markup/classes to trigger that state
4. Verify each state via grep + screenshot
5. Update README with new entries
6. Re-run reviewers

### Token-drift audit (against existing prototype)
1. Run grep audit for hex / raw px / rgb in CSS
2. Map each match to: (a) legitimate token fallback, (b) deliberate drift needing flag, (c) violation needing fix
3. For violations: replace with `var(--token)`; if no matching token, escalate to ux-ui-designer
4. For drifts: add `/* DRIFT: <reason> */` + README entry
5. Output drift report with before/after metrics
6. Confirm reviewer pass

### Interactive-flow mock (multi-step interaction)
1. Read interaction spec (modal flow, multi-step form, tab navigation, etc.)
2. Scaffold HTML with all states present in DOM (toggle visibility via classes, not JS data)
3. Add minimal vanilla JS for class toggling on user events (no logic, no async, no validation rules)
4. State matrix per flow step (each step gets its own resting/hover/focus/error)
5. Keyboard flow verified: tab through entire interaction, Escape exits, Enter advances
6. Reduced-motion check on transitions between steps
7. README documents flow path + alternative paths (back, cancel, error recovery)

## Prototype Builder: Prototype Shape Decision Tree

Source agent: `agents/_design/prototype-builder.md`
Moved content type: prototype-shape routing tree

## Decision tree (prototype shape)

```
single-screen prototype:
  - one HTML file, one CSS file
  - states/ subdir with full state matrix
  - smallest unit; use for atoms, components, single dashboards

multi-screen prototype:
  - index.html with anchor-linked sections OR multiple .html files
  - shared styles.css imports tokens + components
  - state matrix per screen
  - use for flows where context between screens matters

interactive-flow prototype:
  - HTML + CSS + minimal vanilla JS (event listeners only, no logic)
  - JS only enables: tab navigation, modal open/close, accordion toggle, form-state simulation
  - NEVER: data fetching, business logic, validation rules
  - use to prove an interaction pattern before locking framework

motion prototype:
  - HTML + CSS with tokenized CSS/WAAPI by default
  - optional library only when the Prototype Capability Plan approves Motion, GSAP, Lottie, Rive, Three.js, PixiJS, or another scoped runtime for a specific effect
  - reduced-motion media query MUST short-circuit non-essential motion
  - states/ includes motion-pause.html showing the resting target
  - use to prove easing curves, durations, choreography, 3D, chart, or interactive motion

data-driven mock:
  - HTML with realistic-but-fake data (lorem-style but contextual)
  - states/ includes empty.html, loading.html, error.html, partial.html, full.html
  - data lives in mocks/api-fixtures/ and is governed by mock-contract.json + mock-scenarios.json
  - template via vanilla JS or static HTML; no schema-less inline mock data
  - use when content shape drives layout decisions
```

## Prototype Builder: Artifact Template

Source agent: `agents/_design/prototype-builder.md`
Moved content type: prototype output sections and preview evidence

## Deliverables
- index.html — main view
- styles.css — token-only CSS
- states/ — N state HTML files
- states/.screenshots/ — visual baseline (desktop + mobile per state)
- README.md — viewing order, tab map, drift notes

## State Matrix
| State           | File                  | Screenshot |
|-----------------|-----------------------|------------|
| resting         | states/resting.html   | OK         |
| hover           | states/hover.html     | OK         |
| active          | states/active.html    | OK         |
| focus-visible   | states/focus-visible.html | OK     |
| disabled        | states/disabled.html  | OK         |
| loading         | states/loading.html   | OK         |
| empty           | states/empty.html     | OK         |
| error           | states/error.html     | OK         |

## Token-Drift Report
- Hardcoded hex matches: 0
- Hardcoded px matches: N (audited; M flagged as DRIFT with rationale)
- Token coverage: color N%, space N%, radius N%, type N%
- Deliberate drifts: list each with `/* DRIFT: <reason> */` location

## Keyboard Interactivity
- Tab order: <documented sequence>
- Escape behavior: <closes modal X>
- Enter/Space behavior: <activates buttons>
- Arrow-key behavior: <menu/list navigation>

## Responsive
- Breakpoints honored: 360 / 768 / 1024 / 1440 / 1920
- Container queries: yes/no where used

## Motion
- Reduced-motion fallback: VERIFIED
- Token-driven durations: yes

## Reviewer Reports
- ui-polish-reviewer: PASS / NOTES
- accessibility-reviewer: PASS / NOTES

## Verdict
READY FOR HANDOFF | ITERATE
```

## Preview server (when applicable)
- **URL**: http://localhost:NNNN — handed to user, opens in browser
- **Label**: <feature-name>
- **Hot-reload**: on (file edits in `.supervibe/artifacts/mockups/<feature>/` auto-refresh browser)
- **Port lifecycle**: cleanup on session end via SIGINT, OR `/supervibe-preview --kill <port>` manually

If task is non-visual (e.g., design tokens only): explicitly state "Preview: N/A (no visual mockup generated)".
