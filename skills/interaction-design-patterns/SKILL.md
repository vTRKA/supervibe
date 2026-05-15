---
name: interaction-design-patterns
namespace: process
description: >-
  Use WHEN designing micro-interactions, animations, transitions, loading states
  or motion-heavy hero treatments to choose timing, easing, fallback, and
  performance-safe implementation patterns before prototype work. Triggers:
  'добавь анимацию', 'нужны переходы', 'микроинтеракция', 'оживи интерфейс'.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
  - Edit
phase: exec
prerequisites: []
emits-artifact: prototype
confidence-rubric: confidence-rubrics/prototype.yaml
gate-on-exit: true
version: 1.2
last-verified: 2026-05-14T00:00:00.000Z
---

# Interaction Design Patterns

## Overview

This skill is the workflow entrypoint for motion decisions. It keeps the
decision path, safety gates, and output contract here, while reusable recipes,
tables, CSS snippets, library comparisons, media choices, and anti-patterns live
in `references/skills/design-patterns.md`.

Use it to select a motion approach that is consistent with the approved design
system, respects reduced-motion users, and can be verified in the prototype
preview without introducing unnecessary runtime weight.

## When to Use

Use this skill when UI work includes:
- Hover, active, focus, selected, drag, swipe, or gesture states.
- Page, route, modal, drawer, toast, accordion, or list transitions.
- Loading states, skeletons, progress indicators, or optimistic feedback.
- Scroll reveals, shared-element transitions, View Transitions API, FLIP, or
  physics-like release behavior.
- A single signature "WOW" moment that needs explicit justification.
- Video, GIF, Lottie, SVG animation, Canvas, WebGL, or Three.js decisions.

Do not use it for static layout, content-only screens, or raw brand exploration.
Those belong to `supervibe:brandbook` or the owning design command.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source
of truth, preserve retrieval evidence, apply scope safety, use real producers
with runtime receipts for durable delegated outputs, verify before completion
claims, and keep confidence below gate when evidence is partial.

## Step 0 - Read source of truth

Before choosing or implementing motion:
1. Read `.supervibe/artifacts/prototypes/_design-system/motion.css`.
2. Read relevant component specs under
   `.supervibe/artifacts/prototypes/_design-system/components/`.
3. Confirm the project reduced-motion policy in the design system.
4. Check target/browser constraints from the active prototype `config.json`.
5. Run project memory, code search, and design-intelligence lookup for related
   UX, accessibility, stack, performance, and brand guidance.
6. For video/GIF/rendered media promises, run
   `node scripts/detect-media-capabilities.mjs --json` first.

If the design system is missing the timing, easing, component state, or media
policy needed for the prototype, stop and route through a design-system
extension instead of inventing motion locally.

## Decision tree

Choose the lightest implementation that satisfies the interaction:
- Single state change between two values -> CSS transition.
- Repeating decorative motion -> CSS keyframes, paused off-screen.
- Dynamic JS values or chained timing -> Web Animations API.
- Scroll-triggered reveal -> Intersection Observer plus CSS class.
- Scroll-linked progress/parallax -> native scroll-driven animation only with
  fallback; otherwise use static or observer-driven behavior.
- Reordered layout or moved element -> FLIP.
- Route/list/detail continuity -> View Transitions API with FLIP fallback.
- Drag-release or natural settling -> spring solver only when the feel matters.
- Thousands of elements or custom rendering -> Canvas 2D.
- Real 3D, shaders, or large particle fields -> WebGL or Three.js with explicit
  capability plan.

Use the timing and easing tables in `references/skills/design-patterns.md`.
Prototype defaults are native CSS, WAAPI, and Intersection Observer. Escalate to
Motion One, GSAP, Lottie, Three.js, or another library only when the prototype
capability plan explains why native approaches are insufficient.

## Prototype Capability Plan Discipline

Escalating to Motion, GSAP, Three.js, Lottie, or another runtime family requires a Prototype Capability Plan before implementation. Do not paste a CDN player or remote runtime snippet into a prototype; use local assets or a planned bundle path with license, performance, accessibility, reduced-motion, and verification evidence.

## Procedure

1. Classify each interaction by trigger, purpose, duration tier, and component
   state.
2. Map the interaction to an approved design-system token or motion recipe.
3. Read `references/skills/design-patterns.md` for the relevant recipe and
   copy only the needed pattern into the prototype.
4. Select easing and duration from `motion.css`; if the value is absent, request
   a design-system extension.
5. For a WOW moment, document why that moment earns extra attention and cap the
   product at one or two signature effects.
6. Implement with compositor-safe properties first: `transform`, `opacity`,
   `filter`, `color`, `background-color`, and carefully measured `box-shadow`.
7. Add `prefers-reduced-motion: reduce` fallback before delivery.
8. Pause or remove off-screen idle animation with Intersection Observer.
9. Run the prototype through the Supervibe preview server when files are
   generated, then verify reduced motion, touch behavior, viewport fit, and
   frame stability.
10. Record the selected approach, fallback, verification result, and confidence
    score in the prototype output.

## Required anti-patterns

- `asking-multiple-questions-at-once` - bundling motion purpose, duration,
  library, media, viewport, and approval decisions into one prompt.
- `advancing-without-feedback-prompt` - carrying a motion decision into
  prototype delivery without the owning prototype feedback gate.
- `random-regen-instead-of-tradeoff-alternatives` - swapping animation styles
  without naming the UX purpose, accessibility cost, and performance tradeoff.

## Examples

- Button press feedback: use a 100-150ms CSS transition, approved quick easing,
  and a subtle `transform` or color change. Do not add JS or a library.
- Product card to detail view: try View Transitions API with unique
  `view-transition-name`; keep a FLIP or instant navigation fallback for older
  browsers.
- Loading state over 200ms: use skeletons shaped like final content, not a
  generic spinner, and disable shimmer under reduced motion.
- Hero shader request: require a capability plan, static poster fallback,
  performance budget, and viewport screenshot evidence before treating it as
  deliverable.

See `references/skills/design-patterns.md` for code snippets, media tables,
library escalation criteria, and anti-patterns.

## When not to use

- Do not use this skill to bypass the command or workflow that owns durable
  design or prototype artifacts.
- Do not author ad-hoc motion tokens inside a prototype.
- Do not use it when project memory, code search, CodeGraph/design evidence, or
  required verification is missing and the output would claim certainty.
- Do not replace a specialist producer, worker, reviewer, or preview tool that
  must issue runtime evidence.

## Common rationalizations

- "It is just a small animation." Reject when it changes component behavior,
  accessibility, performance, or design-system vocabulary.
- "The browser will probably optimize it." Reject until transform/opacity,
  layer count, and frame timing are verified.
- "A library will make it feel premium." Reject unless the capability plan names
  the interaction native APIs cannot cover.
- "Reduced motion can come later." Reject; fallback is part of the motion spec.

## Red flags

- A prototype contains raw `cubic-bezier(...)`, duration literals, or keyframes
  not declared by the approved design system.
- Motion changes layout properties such as `width`, `height`, `top`, `left`,
  `margin`, or `padding` during interaction.
- A WOW effect blocks first paint, navigation, or user action.
- Hover-only behavior hides essential controls on touch devices.
- A video, GIF, Lottie, WebGL, or Three.js promise appears without capability
  evidence and a non-motion fallback.

## Checklist

- Source of truth and target constraints read.
- Interaction purpose, trigger, and tier named.
- Native-first implementation selected or escalation justified.
- Reduced-motion fallback implemented and tested.
- Off-screen or idle animation paused.
- Browser and touch fallback documented.
- Preview URL and verification evidence captured when a prototype is generated.
- Confidence score stays below gate when evidence is partial.

## Failure modes

- The skill becomes a recipe dump instead of a decision workflow.
- A reference snippet is copied without aligning it to approved tokens.
- Prototype delivery uses `file://` or static screenshots and misses preview
  feedback/reduced-motion verification.
- A heavy media effect ships without fallback, bundle budget, or browser proof.

## Design Preview Daemon

When motion decisions are verified in `.supervibe/artifacts/prototypes` or `.supervibe/artifacts/mockups`, start `supervibe:preview-server` with `--daemon` so the feedback overlay, hot reload, and long-running review session stay alive while the user reviews the design.

## Feedback Boundary

The browser feedback overlay is supplemental and cannot approve the artifact; motion feedback is revision input for the owning prototype or landing delivery gate.

## Output contract

Return these fields:
- `elements`: interaction targets and user-triggered states.
- `approach`: CSS transition, keyframes, WAAPI, Intersection Observer, FLIP,
  View Transitions API, Canvas, WebGL, or planned library.
- `tokens`: duration, easing, keyframe, and component state names from
  `.supervibe/artifacts/prototypes/_design-system/`.
- `fallbacks`: reduced-motion, browser, touch, and media fallback behavior.
- `verification`: preview URL, viewport checks, reduced-motion result, and
  performance notes.
- `confidence`: numeric score, override flag, and `prototype` rubric.

## Guard rails

- Do not animate layout properties during interactive motion.
- Do not add a runtime library before native CSS, WAAPI, Canvas, SVG, or local
  assets have been considered.
- Do not use more than two WOW effects in one product surface.
- Always respect `prefers-reduced-motion: reduce`.
- Always serve generated prototypes through `supervibe:preview-server` and keep
  the feedback overlay available.
- Always provide fallback for View Transitions API, scroll-driven animation, and
  rendered media features.

## Verification

- Open the prototype in the declared viewports through the preview server.
- Emulate `prefers-reduced-motion: reduce` and confirm large translation/scale
  animations are disabled or shortened.
- Audit animation properties with a grep or CSS review for layout-triggering
  properties.
- Use DevTools Performance or equivalent browser evidence for complex motion;
  check for layout and paint spikes during interaction.
- Confirm screen-reader and keyboard status changes are not hidden behind
  animation.
- Confirm touch devices do not depend on hover-only behavior.

## Supporting references

- `references/skills/design-patterns.md`
- `references/checklists/accessibility.md`
- `references/checklists/performance.md`
- `references/skill-baseline/skill-anatomy-baseline.md`

## Related

- `agents/_design/creative-director` sets motion language and signature moments.
- `agents/_design/prototype-builder` implements motion in prototype artifacts.
- `agents/_design/ui-polish-reviewer` reviews feel, hierarchy, and polish.
- `agents/_design/accessibility-reviewer` verifies reduced-motion behavior.
- `supervibe:brandbook` owns `motion.css` and approved motion vocabulary.
- `supervibe:prototype` consumes the selected recipe during prototype build.
- `supervibe:preview-server` serves verification previews with feedback enabled.
