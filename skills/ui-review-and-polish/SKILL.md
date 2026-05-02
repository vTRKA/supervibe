---
name: ui-review-and-polish
namespace: process
description: "Use AFTER a UI mockup, prototype, desktop/mobile shell, browser extension view, or implemented screen exists TO review layout, visual hierarchy, responsiveness, accessibility basics, interaction states, copy fit, and design-system adherence before handoff or implementation."
allowed-tools: [Read, Grep, Glob, Bash]
phase: review
prerequisites: [ui-artifact]
emits-artifact: ui-polish-report
confidence-rubric: confidence-rubrics/prototype.yaml
gate-on-exit: true
version: 1.1
last-verified: 2026-05-02
---

# UI Review And Polish

Review an existing UI artifact and produce a prioritized polish report. This
skill is review-only: it identifies issues and concrete fixes, but it does not
rewrite the UI unless the user explicitly asks for implementation after review.

## When to invoke

Use after a UI mockup, prototype, desktop/mobile shell, browser extension view,
or implemented screen exists and needs review before approval, handoff, or
production claim. Do not use it to invent a visual direction from scratch; use
the design or prototype flow first.

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
`Eight-Pass Expert Routine` as a completeness map for the evidence that should
exist: preference/product fit, local evidence, reference scan, IA/user-flow,
visual system, responsive/platform, quality, and feedback/approval. External
references are supplemental; use the internet only for current references or
official platform evidence after local data has been checked.

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
