---
name: prototype
namespace: process
description: >-
  Use WHEN user asks for design, mockup, or UI exploration BEFORE framework
  implementation to build a capability-aware HTML/CSS/JS prototype for visual
  approval, feedback iteration, and stack-agnostic handoff. Triggers:
  'сделай мокап', 'покажи как будет выглядеть', 'нарисуй UI',
  'нужен прототип', 'сделай макет'.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
  - Edit
phase: exec
prerequisites:
  - design-system-approved
emits-artifact: prototype
confidence-rubric: confidence-rubrics/prototype.yaml
gate-on-exit: true
version: 2.1
last-verified: 2026-05-14T00:00:00.000Z
---

# Prototype

## Overview

Build a native HTML/CSS/JS prototype that materializes the approved design
system into a clickable, viewport-correct mockup. The prototype exists for
design approval and implementation handoff; it is not production code.

This skill keeps the workflow, gates, and output contract. Reusable directory
layouts, config JSON examples, capability-plan fields, data-fed mock shapes,
approval markers, and verification snippets live in
`references/skills/prototype-examples.md`.

## Local Design Expert Reference

Read `docs/references/design-expert-knowledge.md` before design-facing output. Use `supervibe:design-intelligence`, `designContextPreflight()`, or `searchDesignIntelligence()` before external lookup. Start with Design Pass Triage from the `Eight-Pass Expert Routine` and classify evidence as `required | reuse | delegated | skipped | N/A`.

Do not force all eight passes when an approved design system already covers the surface. If the design system is candidate or needs_revision, resume approval instead of treating it as production-ready. If a missing token, component, asset, or interaction is found, request a narrow design-system extension instead of a full restart.

External references are supplemental; local project memory, approved tokens, accessibility, and code evidence win. Preview and feedback flows should run through the preview server with `--daemon` when a live review URL is required.

## When to Use

Use this skill after `supervibe:brandbook` has produced an approved design
system and the user asks for:
- A mockup, design preview, UI exploration, clickable flow, or prototype.
- A viewport-specific proof for web, extension, desktop webview, or mobile UI.
- A framework-agnostic visual handoff before stack implementation.
- A data-fed mock with local fixtures and explicit fake API contracts.
- A distinct design variant set for approval.

Do not use it for production landing pages, real framework implementation, or
brand exploration without an approved design system.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source
of truth, preserve retrieval evidence, apply scope safety, use real producers
with runtime receipts for durable delegated outputs, verify before completion
claims, and keep confidence below gate when evidence is partial.

## Step 0 - Read source of truth

Before writing prototype files:
1. Read `.supervibe/artifacts/prototypes/_design-system/design-flow-state.json`,
   `manifest.json`, `tokens.css`, `motion.css`, `voice.md`,
   `accessibility.md`, and relevant `components/*.md`.
2. Stop if `design_system.status !== "approved"` or any required section is
   missing from `approved_sections`.
3. Run `node scripts/lib/design-artifact-intake.mjs --json --brief "<brief>"`
   and ask the artifact-mode question if existing artifacts are ambiguous.
4. Run project memory, code search, CodeGraph/design-intelligence lookup for the
   surface, target platform, UX, style, chart, icon, accessibility, and stack
   evidence.
5. Read the user's exact brief and identify blocking ambiguities. Ask one
   question at a time only when the next write cannot proceed safely.

If the design system lacks a required token, component, motion recipe, asset
treatment, or copy pattern, route a narrow extension through
`supervibe:brandbook` before building.

## Decision tree

Target surface:
- `web` -> default 375px mobile plus 1440px desktop.
- `chrome-extension` -> popup, options, and side-panel presets.
- `electron` or `tauri` -> webview prototype with desktop viewport constraints.
- `mobile-native` -> HTML simulation of native mobile viewports.

Interaction depth:
- Visual-only -> semantic HTML and CSS, no JS required.
- Click-through -> anchor-routed pages or minimal JS navigation.
- Realistic interaction -> CSS, WAAPI, Intersection Observer, local JS modules,
  and `supervibe:interaction-design-patterns` recipes.
- Data-fed -> local `mocks/` contract, scenarios, and fixtures before fetch
  logic is claimed, including `mock-contract.json`, `mock-scenarios.json`, and
  `api-fixtures/`.

Capability mode:
- `native-static` or `enhanced-native` are defaults.
- `bundled-dependency`, `framework-sandbox`, or `handoff-only` require
  `decisions/prototype-capability-plan.md` before implementation.

Capability library families that require a Prototype Capability Plan when used: Motion, GSAP, Lottie, Rive, Three.js, PixiJS, D3, Observable Plot, ECharts, MapLibre, Theatre.js, Rough.js, Matter.js, Monaco, CodeMirror.

## Procedure

1. Choose or confirm a kebab-case slug under
   `.supervibe/artifacts/prototypes/<slug>/`.
2. Ask the target surface question before viewport questions unless an existing
   `config.json` already answers it.
3. Load `templates/viewport-presets/<target>.json`, ask the viewport question,
   and write `config.json` before any HTML/CSS/JS prototype files.
4. Confirm interaction depth and, for `data-fed`, run
   `supervibe:mock-data-contract` before local fetch logic. Data-fed mock
   output must include `mocks/mock-contract.json`, `mocks/mock-scenarios.json`,
   and `mocks/api-fixtures/`.
5. Classify capability mode. Write a prototype capability plan before using
   dependencies, framework sandboxes, advanced media, maps, charts, code
   editors, 3D, physics, or handoff-only storyboards.
6. Create the prototype directory layout and import the shared design system.
7. Build with semantic HTML, token-based CSS variables, approved components,
   approved motion recipes, and local assets.
8. Keep dependencies relative/local. Remote CDN, `node_modules/`, and unplanned
   `import from` references are forbidden unless documented in the capability
   plan and reviewer notes.
9. For explicit multi-variant output, write `variant-manifest.json` and separate
   fullscreen artifacts under `variants/<variant-id>/`; do not deliver a tabbed
   comparison shell as the primary artifact.
10. Start `supervibe:preview-server` with feedback enabled and verify the
    visible Feedback button plus shared design-system asset responses.
11. Deliver the preview URL, declared viewports, draft state, and one feedback
    gate: Approve, Revise, Alternative, or Stop.
12. On explicit approval only, write `.approval.json`, set `config.json`
    approval to `approved`, and stop before implementation handoff.

## Preview Feedback Gate

For design previews, run `supervibe:preview-server --root .supervibe/artifacts/prototypes --label <slug> --daemon` and present `http://localhost:NNNN/<slug>/` as the review URL. Verify that shared design-system tokens return HTTP 200 through the server before handoff. Never use `file://` verification for prototype review or approval. Do not use `--no-feedback` for approval flows; it is diagnostic-only and blocks prototype approval.

## Design Diversity Benchmark

For any distinct alternative request, produce a meaningfully different variant rather than a same shell, new paint pass. Record why the variant changes at least one structural experience axis and name the tradeoff for palette, typography, motion, imagery, hierarchy, density, composition, or interaction.

Artifact-level diversity evidence must list `domLayoutSignature`, `cssTokenSignature`, `screenshotViewportPlan`, and `interactionMotionSignature`; if these signatures are effectively unchanged, the prototype is not a distinct alternative.

## User Approval Gate

Preview feedback button is mandatory. The browser feedback overlay is supplemental and cannot approve the artifact. Do NOT proceed without explicit choice from the chat-level feedback prompt.

## Feedback prompt

After presenting a preview URL, show exactly one lifecycle prompt and wait:

- ✅ Approve - write approval metadata and stop before implementation handoff.
- ✎ Revise - collect one focused change request and keep the same direction.
- 🔀 Alternative - create a meaningfully different variant with named tradeoffs.
- 📊 Run reviews - dispatch visual, accessibility, and interaction checks.
- 🛑 Stop - archive current draft state without pretending it is approved.

## Required anti-patterns

- `asking-multiple-questions-at-once` - bundling target, viewport, dependency,
  and approval decisions into one prompt.
- `advancing-without-feedback-prompt` - building past the preview gate without
  the explicit lifecycle choice above.
- `random-regen-instead-of-tradeoff-alternatives` - creating another variant
  without naming which design axes changed and what tradeoff it makes.
- `unapproved-dependency-coupling` - adding framework, chart, media, or 3D
  runtime dependencies before a Prototype Capability Plan.
- `silent-viewport-expansion` - adding desktop, mobile, extension, or desktop
  app targets beyond the approved viewport set.
- `silent-existing-artifact-reuse` - reading or continuing old prototype
  artifacts before asking whether to continue, start fresh, or fork.
- `missing-preview-feedback-button` - presenting a preview URL without a visible
  feedback overlay and verified feedback target.

## Examples

- Simple dashboard mockup: use `native-static`, the web viewport preset, design
  tokens, approved card/table/button specs, preview-server verification, and a
  draft feedback gate.
- Settings flow: use click-through depth with anchor pages, local JS only for
  navigation state, and no dependency plan.
- Data-fed billing screen: produce `mocks/mock-contract.json`,
  `mocks/mock-scenarios.json`, and one fixture under `mocks/api-fixtures/` per
  scenario before wiring local `fetch()` calls.
- Interactive chart or 3D scene: write a capability plan that names the library,
  native alternative rejected, bundle/performance budget, accessibility fallback,
  reduced-motion fallback, and verification commands.

See `references/skills/prototype-examples.md` for concrete file trees, JSON
templates, grep audits, capability-plan fields, variant manifests, and approval
marker samples.

## When not to use

- Do not use this skill to bypass design-system approval or `/supervibe-design`
  write gates.
- Do not build from candidate or needs-revision design-system state.
- Do not reuse or edit old design artifacts before the artifact-mode question
  when the brief is ambiguous.
- Do not replace required producer, reviewer, preview, or receipt paths with
  controller-authored inline outputs.
- Do not use `file://` as delivery verification.

## Common rationalizations

- "It is only a mockup, so raw hex is fine." Reject; prototypes prove the design
  system and must use tokens.
- "The dependency is just for a prototype." Reject without a capability plan,
  local bundle strategy, and fallback.
- "The preview works in the file browser." Reject; feedback overlay and shared
  token paths must be verified through the preview server.
- "The old mockup is obviously the source." Reject until the user chooses
  continue existing, new from scratch, or alternative.

## Red flags

- Prototype CSS contains raw colors, magic spacing, ad-hoc easing, or local
  component patterns not approved in `_design-system/`.
- `config.json` is missing or declares viewports different from what was built.
- Preview URL is delivered without the visible Feedback button.
- Distinct variants change only palette/type while layout, hierarchy, density,
  and interaction stay the same.
- Data-fed mock files exist without `mock-contract.json`,
  `mock-scenarios.json`, and `api-fixtures/`.

## Checklist

- Approved design system confirmed.
- Artifact mode resolved before reading old prototype sources.
- Target and viewports saved to `config.json`.
- Interaction depth and capability mode recorded.
- Required capability plan written before dependency or handoff-only mode.
- Components and motion recipes consumed from the design system.
- No remote runtime imports unless planned and reviewed.
- Preview server started with feedback enabled and shared tokens returning 200.
- Feedback gate presented after URL delivery.
- Approval marker written only after explicit user approval.

## Failure modes

- Prototype becomes production implementation and bypasses stack agents.
- Design-system gaps are patched locally instead of extended through brandbook.
- Preview validation misses mobile overflow, reduced-motion behavior, or feedback
  capture.
- Variants are presented as alternatives without Design Diversity Benchmark
  evidence.
- Data-fed demos drift from backend expectations because mock contracts were
  skipped.

## Output contract

Return these fields:
- `slug`: prototype slug and artifact path.
- `target`: web, chrome-extension, electron, tauri, or mobile-native.
- `viewports`: declared viewport set from `config.json`.
- `interaction`: visual-only, click-through, realistic, or data-fed.
- `mode`: native-static, enhanced-native, bundled-dependency,
  framework-sandbox, or handoff-only.
- `files`: index, pages, styles, scripts, mocks, assets, reviews, variants.
- `designSystem`: source path and approval status.
- `previewUrl`: Supervibe preview-server URL with feedback enabled.
- `approval`: draft, revised, alternative, approved, or stopped.
- `verification`: targeted checks and blockers.
- `confidence`: numeric score, override flag, and `prototype` rubric.

## Guard rails

- Ask one user-facing question at a time.
- Do not exceed the declared viewport set without asking.
- Do not build from an unapproved design system.
- Do not disable the preview feedback overlay.
- Do not install, import, or bundle dependencies without a capability plan.
- Do not extend the design system inside a prototype directory.
- Do not mark approved without `.approval.json` and explicit user signal.
- Do not claim frontend-before-backend readiness for data-fed mocks without
  `mock-contract.json`, `mock-scenarios.json`, and `api-fixtures/`.

## Verification

- `config.json` exists before HTML/CSS/JS and matches the target/viewports built.
- HTML files exist in the expected prototype structure.
- Grep CSS for raw colors and local literals; design values should use
  `var(--token)` or approved local aliases.
- Grep runtime files for CDN, `node_modules`, and unplanned imports; every
  exception must be named in the capability plan.
- Open the preview URL at each declared viewport and check no horizontal
  overflow at mobile width.
- Confirm `#supervibe-fb-toggle` or the visible Feedback button is present.
- Confirm shared design-system imports return HTTP 200 through the server.
- If data-fed, confirm mock contract, scenarios, and fixtures cover every local
  fetch target.
- Emulate reduced motion and verify animations are disabled or shortened.

## Supporting references

- `references/skills/prototype-examples.md`
- `references/skills/design-patterns.md`
- `references/checklists/accessibility.md`
- `references/checklists/performance.md`
- `references/skill-baseline/skill-anatomy-baseline.md`

## Related

- `supervibe:brandbook` produces the approved design system.
- `supervibe:interaction-design-patterns` supplies motion recipes.
- `supervibe:mock-data-contract` owns data-fed mock contracts and fixtures.
- `supervibe:preview-server` serves live previews with feedback enabled.
- `supervibe:landing-page` handles production marketing-page concerns.
- `agents/_design/prototype-builder` implements the prototype.
- `agents/_design/ui-polish-reviewer` reviews visual and interaction quality.
- `agents/_design/accessibility-reviewer` checks WCAG and reduced motion.
- `commands/supervibe-design.md` orchestrates brand, prototype, review, and
  handoff.
