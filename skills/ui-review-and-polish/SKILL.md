---
name: ui-review-and-polish
namespace: process
description: 'Use AFTER a UI mockup, prototype, desktop/mobile shell, browser extension view, or implemented screen exists TO review layout, visual hierarchy, responsiveness, accessibility basics, interaction states, copy fit, and design-system adherence before handoff or implementation.'
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
phase: review
prerequisites:
  - ui-artifact
emits-artifact: ui-polish-report
confidence-rubric: confidence-rubrics/prototype.yaml
gate-on-exit: true
version: 1.2
last-verified: 2026-05-10T00:00:00.000Z
---

# UI Review And Polish

## Overview

Ui Review And Polish provides a reusable Supervibe operating method for Use AFTER a UI mockup, prototype, desktop/mobile shell, browser extension view, or implemented screen exists TO review layout, visual hierarchy, responsiveness, accessibility basics, interaction states, copy fit, and design-system adherence before handoff or implementation.
It keeps the work evidence-first, scope-bounded, confidence-scored, and verified before completion claims.
Review an existing UI artifact and produce a prioritized polish report. This
skill is review-only: it identifies issues and concrete fixes, but it does not
rewrite the UI unless the user explicitly asks for implementation after review.

## When to Use

Use after a UI mockup, prototype, desktop/mobile shell, browser extension view,
or implemented screen exists and needs review before approval, handoff, or
production claim. Do not use it to invent a visual direction from scratch; use
the design or prototype flow first.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source of truth, preserve retrieval evidence, apply scope safety, use real producers with runtime receipts for durable delegated outputs, verify before completion claims, and keep confidence below gate when evidence is partial.

## Step 0 - Read Source Of Truth

1. Identify the artifact type: prototype, framework screen, extension view,
   Tauri/Electron webview, or mobile-native mock.
2. Read the applicable design system, tokens, component docs, or local style
   conventions before judging visuals.
3. Read the target viewport list from the artifact config, task brief, or
   existing test setup. If no viewport is declared, default to mobile and
   desktop and mark the assumption.
4. Read existing UI tests, screenshots, preview notes, and open feedback if
   present.

## Local Design Expert Reference

Read `docs/references/design-expert-knowledge.md` before review. Use the
`Eight-Pass Expert Routine` through Design Pass Triage as a completeness map
for the evidence that should exist. Classify relevant evidence as `required |
reuse | delegated | skipped | N/A` with rationale. Existing approved design
systems normally make preference/product fit and visual-system evidence `reuse`;
candidate or needs_revision systems are review gaps, not prototype-ready sources.
Review should focus on local evidence, IA/user-flow, responsive/platform,
quality, and feedback/approval gaps. External references are supplemental; use
the internet only for current references or official platform evidence after
local data has been checked.

## Decision tree

```
Artifact is a prototype with a runnable preview
  -> Open or serve it, inspect declared mobile and desktop viewports, and cite screenshot/browser evidence.

Artifact is an implemented framework screen
  -> Run the local UI, typecheck, lint, test, or screenshot command defined by the project.

Artifact targets desktop, extension, or mobile-native
  -> Apply the matching platform viewport, density, input, and shell policy before judging layout.

Approved design system exists
  -> Review token/component adherence and treat deviations as findings.

Design system is missing, candidate, or needs_revision
  -> Mark design-system evidence as a gap instead of approving visual readiness.

Brief is legal, finance, health, government, security, or other regulated trust
  -> Require domain evidence before accepting palette, copy, trust cues, or data-display defaults.
```

## Review Dimensions

Evaluate these eight dimensions in order:

1. Layout integrity: no overlap, clipping, accidental overflow, unstable sizing,
   or nested-card clutter.
2. Responsive behavior: content fits at every declared viewport, with useful
   density and no viewport-scaled font hacks.
3. Visual hierarchy: headings, controls, panels, and repeated items use size and
   spacing appropriate to their role.
4. Design-system adherence: colors, type, radius, spacing, icons, motion, and
   components come from approved tokens or local patterns.
5. Interaction states: hover, focus, active, disabled, loading, empty, error, and
   success states are present where users need them.
6. Accessibility basics: keyboard path, focus visibility, contrast, target size,
   labels, reduced motion, and semantic structure.
7. Copy fit: text fits containers, uses domain-appropriate language, and avoids
   instructional UI text when the interface should be self-evident.
8. Handoff readiness: findings are specific enough for a developer or designer
   to fix without re-discovery.

## Design Expert Knowledge

Use `docs/references/design-expert-knowledge.md` to make the review complete, not just visually tasteful. Cover or mark N/A with rationale: Accessibility, Touch & Interaction, Performance, Style Selection, Layout & Responsive, Typography & Color, Animation, Forms & Feedback, Navigation Patterns, and Charts & Data.

For Accessibility, verify keyboard, focus, labels, contrast, semantics, target size, and reduced motion. For Performance, verify image sizing, layout shift risk, font loading, main-thread cost, and list virtualization where relevant. For Charts & Data, verify chart fit, legends, tooltips, non-color-only encoding, scale behavior, and empty/error states.

## Anti-Generic AI Aesthetic Gate

Treat **generic AI-generated aesthetics** as a review failure, not a matter of
personal taste. When a UI claims creative quality, verify these gates or mark
them N/A with rationale:

- **Bold Aesthetic Direction Gate** - the artifact names a clear point of view
  beyond "modern", "clean", or "premium".
- **Product-Specific Visual Language Gate** - the visual language explains why
  it belongs to this product, audience, trust burden, and workflow.
- **Unforgettable Detail Gate** - at least one memorable composition, motion,
  type, narrative, or interaction signature is present.
- **Typography Courage Gate** - display/body type, loading, fallback, language
  coverage, and voice are intentional; Inter, Roboto, Arial, or system fonts are
  not accepted as defaults without product rationale.
- **Cliche palette rejection** - purple gradients, vague aurora effects, glass
  panels, or evenly timid palettes require evidence; otherwise flag them as
  generic.
- **Composition diversity** - alternative directions must differ on at least
  three axes across palette, typography, motion, imagery, hierarchy, density,
  composition, and interaction.

## Web Interface Micro-Polish

For web-facing artifacts, include these checks in the review:

- `transition: all` is forbidden; transitions list explicit properties.
- Changing or comparable numbers use `font-variant-numeric: tabular-nums` or an
  equivalent `tabular-nums` utility.
- Heading anchors account for sticky headers with `scroll-margin-top` when
  applicable.
- Brand names, ids, and code tokens use `translate="no"` or equivalent
  no-translate handling.
- Flex children that truncate include `min-w-0` or an equivalent min-width
  reset.
- Dates, numbers, and currency use `Intl.DateTimeFormat`,
  `Intl.NumberFormat`, or another locale-aware formatter.
- Hydration-sensitive values, browser-only state, inputs, images, safe areas,
  dark mode, and URL state avoid mismatch, flicker, layout shift, and broken
  deep links.

## Procedure

1. Inspect the artifact files and nearby patterns.
2. Run the available local verification for the surface:
   - Prototype: open/serve it and inspect declared viewports when tooling exists.
   - Framework screen: run the relevant UI test, typecheck, lint, or screenshot
     command if project conventions define one.
   - Static-only artifact: use grep and file reads, then state that browser
     verification was unavailable.
3. Record findings with severity:
   - `blocker`: breaks core use, hides data, blocks interaction, or violates
     accessibility in a way that prevents use.
   - `high`: likely production-quality defect or repeated workflow friction.
   - `medium`: visible polish issue with local impact.
   - `low`: refinement that is useful but not required for handoff.
4. For every finding, cite the file and the exact UI region or selector.
5. Propose the smallest fix that addresses the cause.
6. Score the artifact against the configured rubric. If confidence is below 9,
   list the missing evidence and stop before approval.

## Output Contract

```
UI_POLISH_REPORT
Artifact: <path or URL>
Viewports checked: <list>
Verification: <commands or manual inspection evidence>
Confidence: <N>/10

Findings:
- <severity> <file:line or selector> - <issue>
  Fix: <smallest concrete change>

Approval readiness: <ready | blocked>
```

## Guard Rails

- Do not invent a design system when none exists. Mark the absence as a gap.
- Do not approve a UI with overlapping text, clipped controls, or unreadable
  contrast.
- Do not recommend decorative rewrites when a targeted spacing, hierarchy, or
  state fix is enough.
- Do not use generic advice without a cited UI region.
- Do not claim browser verification happened unless a browser, screenshot, or
  local preview command actually ran.

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

## Verification

- Confirm every emitted artifact exists and matches the Output contract.
- Run the validator, test, dry-run, or audit command named by this skill when one exists.
- Include concrete command/output evidence before claiming the skill completed successfully.
- If verification cannot run, state the blocker and keep confidence below the passing gate.

## Related

- `agents/_design/ui-polish-reviewer` - specialist agent that usually owns this
  review.
- `supervibe:prototype` - creates native HTML prototypes before this review.
- `supervibe:design-intelligence` - supplies retrieval-backed design evidence.
- `supervibe:verification` - required before claiming an artifact is ready.
