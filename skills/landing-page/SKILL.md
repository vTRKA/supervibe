---
name: landing-page
namespace: process
description: >-
  Use when building a marketing or product landing page as a native HTML/CSS/JS
  prototype to deliver design-system grounding, SEO, analytics hooks,
  accessibility, preview feedback, approval lifecycle, and handoff readiness.
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

# Landing Page

## Overview

This skill builds a marketing or product landing page as a native HTML/CSS/JS
prototype. It shares the prototype lifecycle but adds landing-specific SEO,
analytics, conversion, performance, copy, and public-surface review discipline.

Detailed file layouts, SEO snippets, analytics examples, landing structure
patterns, capability-plan fields, review matrices, and handoff evidence live in
[Loop Evidence Patterns](../../references/skills/loop-evidence-patterns.md#landing-page-evidence-patterns).

## Local Design Expert Reference

Read `docs/references/design-expert-knowledge.md` before design-facing output. Use `supervibe:design-intelligence`, `designContextPreflight()`, or `searchDesignIntelligence()` before external lookup. Start with Design Pass Triage from the `Eight-Pass Expert Routine` and classify evidence as `required | reuse | delegated | skipped | N/A`.

Do not force all eight passes when an approved design system already covers the surface. If the design system is candidate or needs_revision, resume approval instead of treating it as production-ready. If a missing token, component, asset, or interaction is found, request a narrow design-system extension instead of a full restart.

External references are supplemental; local project memory, approved tokens, accessibility, and code evidence win. Preview and feedback flows should run through the preview server with `--daemon` when a live review URL is required.

## When to Use

Use when the user asks for a landing page, marketing page, campaign page, product
launch page, or conversion page and an approved design system exists.

Do not use for in-product flows, dashboards, settings, or brand work without a
target page. Route those to prototype or brandbook workflows first.

## Design Intelligence Preflight

Before section order, CTA, style, typography, conversion, or visual treatment
decisions, check project memory, code search, and internal
`supervibe:design-intelligence` evidence for product, landing, style, color,
typography, UX, and stack history. For regulated-trust briefs, gather domain
evidence before creative defaults.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source
of truth, preserve retrieval evidence, apply scope safety, use real producers
with runtime receipts for durable delegated outputs, verify before completion
claims, and keep confidence below gate when evidence is partial.

## Step 0 - Read source of truth

1. Confirm `.supervibe/artifacts/prototypes/_design-system/design-flow-state.json`
   has `design_system.status = "approved"` and required sections approved; STOP
   for candidate, missing, needs-revision, or incomplete systems.
2. Read `_design-system/tokens.css`, `components/`, and `voice.md`.
3. Read `.supervibe/artifacts/brandbook/direction.md` for palette intent, mood,
   and tone without reinventing it.
4. Run design artifact intake for the brief. If old artifacts exist and the brief
   is ambiguous, ask continue existing, new from scratch, or alternative before
   opening old prototype files.
5. Check project memory for prior landing, conversion, A/B, copy, and design
   decisions.
6. If the brief names competitor or reference URLs, use approved web-crawl
   tooling when available, extract IA and evidence, and avoid copying visual
   style, copy, palette, typography, imagery, or motion unless explicitly
   approved as inspiration.

## Prototype Capability Policy

Landing pages are capability-aware artifacts. Use `native-static` or `enhanced-native` for normal HTML/CSS/JS output. Escalate to `bundled-dependency`, `framework-sandbox`, or `handoff-only` only with a written Prototype Capability Plan that names scope, security, performance, accessibility, reduced-motion fallback, and verification.

## Decision tree

```
Approved design system is missing
  -> STOP and resume design-system approval.

Existing artifact mode is ambiguous
  -> ask one artifact-mode question before reading old files.

Landing needs heavy media, charts, 3D, maps, editors, or runtime dependency
  -> write a Prototype Capability Plan before implementation.

Landing structure is unspecified
  -> ask one structure question, then record the choice in config.

Draft is delivered
  -> show feedback prompt and wait for approve/revise/alternative/review/stop.
```

## Hard constraints

- Default output is native static or enhanced native HTML/CSS/JS. Dependencies
  require a written Prototype Capability Plan with scope, security, performance,
  accessibility, reduced-motion, and verification evidence.
- All visuals come through approved design-system tokens and components.
- Default viewports are 375px mobile and 1440px desktop; ask before adding more.
- Ask one question at a time with progress.
- Draft to review to revision to approval to handoff is explicit; do not skip
  lifecycle gates.
- SEO scaffolding, analytics hooks, image dimensions, reduced motion, preview
  feedback button, and Lighthouse budgets are required from the start.

## Procedure

1. Pick slug `.supervibe/artifacts/prototypes/landing-<topic>/`.
2. Ask one viewport question, then one landing-structure question, then one tone
   question, then one competitor/reference question. Save answers to `config.json`.
3. Classify prototype mode. If dependency or production-only effect is needed,
   write `decisions/prototype-capability-plan.md` before file creation.
4. Create the landing file layout with `index.html`, token-backed styles,
   analytics stub, assets, copy, SEO metadata, and review outputs.
5. Build semantic HTML with title, description, canonical, Open Graph, Twitter
   card, structured data, analytics attributes on CTAs/forms/scroll milestones,
   explicit image sizes, LCP priority for hero media, and reduced-motion
   fallbacks.
6. Run live preview only after design-flow state allows prototype work. Serve
   with mandatory feedback overlay and verify the visible Feedback button before
   presenting the URL.
7. After URL delivery, show one feedback prompt with choices:
   approve, revise, alternative, run reviews, or stop. Wait for explicit choice.
8. If approved, write `.approval.json`, update `config.json`, and stop. Handoff
   is performed by the owning design workflow or `prototype-handoff`.

## Feedback prompt

After presenting the landing preview URL, show exactly one lifecycle prompt and
wait:

- ✅ Approve - write approval metadata and stop before implementation handoff.
- ✎ Revise - collect one focused landing-page change request.
- 🔀 Alternative - create a meaningfully different section/order/visual variant.
- 📊 Run reviews - dispatch conversion, accessibility, SEO, and visual checks.
- 🛑 Stop - archive current draft state without approval.

## Required anti-patterns

- `asking-multiple-questions-at-once` - bundling structure, copy, visual, and
  approval decisions into one prompt.
- `advancing-without-feedback-prompt` - moving from preview into approval or
  handoff without the explicit lifecycle choice above.
- `random-regen-instead-of-tradeoff-alternatives` - generating another landing
  direction without named conversion, hierarchy, copy, or visual tradeoffs.
- `unapproved-dependency-coupling` - adding analytics runtimes, animation
  libraries, forms, maps, charts, or media dependencies before a capability plan.
- `silent-viewport-expansion` - adding unapproved breakpoints or device targets.
- `silent-existing-artifact-reuse` - reusing an old landing artifact without the
  artifact-mode question.
- `missing-preview-feedback-button` - presenting a preview URL without a visible
  feedback overlay and lifecycle prompt.

## When not to use

- Do not bypass the command or workflow that owns durable prototype artifacts.
- Do not build from a candidate, missing, or needs-revision design system.
- Do not replace copy, SEO, accessibility, or polish reviewers with controller
  summaries when reviewer evidence is required.

## Common rationalizations

- "SEO can be added after design" - reject; metadata and structured data are
  part of the first landing scaffold.
- "The visual reference should be cloned because the user likes it" - reject;
  extract IA and apply the approved design system unless copying was explicitly
  authorized and legally safe.
- "The feedback overlay is optional for a draft" - reject; preview feedback is a
  lifecycle gate for landing prototypes.

## User Approval Gate

Preview feedback button is mandatory: verify `#supervibe-fb-toggle` is visible before presenting the URL. The browser feedback overlay is supplemental and cannot approve the artifact. Do not use `--no-feedback` for approval flows. Wait for explicit choice from the chat-level feedback prompt. Do NOT proceed without explicit choice.

## Red flags

- Landing work starts before approved design-system state is confirmed.
- CTA or form elements lack `data-analytics-event`.
- Images lack width/height or a stable aspect ratio.
- External runtime dependencies appear without a Prototype Capability Plan.
- A preview URL is shown without a visible Feedback button and lifecycle prompt.

## Checklist

- Approved design system, brand direction, artifact mode, memory, and references
  checked.
- Viewports, structure, tone, and references recorded in `config.json`.
- SEO, analytics, accessibility, performance, image, and reduced-motion evidence
  included.
- Preview feedback overlay verified.
- Approval marker written only after explicit approval.

## Failure modes

- Old artifact reuse silently overrides the user's current brief.
- Marketing polish bypasses approved tokens and creates one-off visuals.
- Placeholder copy ships past Stage 1 without copywriter/user source.
- The prototype is approved without review evidence for public-surface risks.

## Output contract

Fields: `Slug`, `Location`, `Viewports`, `Structure`, `SEO scaffolding`,
`Analytics hooks`, `Lighthouse target`, `Preview URL`, `Approval`,
`Confidence`, `Override`, and `Rubric`.

`Approval` is `draft` until `.approval.json` with `status: "approved"` exists.

## Guard rails

- Do not skip SEO meta tags or structured data.
- Do not inline analytics provider code; use `data-analytics-event` hooks.
- Do not use placeholder copy past Stage 1.
- Do not exceed Lighthouse mobile budgets without a documented product tradeoff.
- Do not reuse old landing artifacts before the artifact-mode question.
- Do not disable preview feedback overlay.

## Verification

- SEO grep finds description, Open Graph image/title, canonical, Twitter card,
  and `application/ld+json` in `index.html`.
- Analytics grep finds at least hero CTA, primary CTA, and footer CTA events.
- All images have width, height, and stable aspect ratio.
- Reduced motion is respected.
- Lighthouse mobile-slow-4G target: LCP under 2.5s, CLS under 0.1, TBT under
  200ms, or a documented blocker/tradeoff exists.
- Browser preview opens without console errors and visible Feedback button exists.

## Supporting references

- [Landing page evidence patterns](../../references/skills/loop-evidence-patterns.md#landing-page-evidence-patterns)
  - landing structures, file layout, SEO/analytics snippets, review and approval
  matrices.

## Related

- `supervibe:prototype` - sibling for in-product flows.
- `supervibe:brandbook` - design-system source.
- `supervibe:preview-server` - live URL and feedback overlay.
- `supervibe:tokens-export` - downstream token conversion.
- `supervibe:prototype-handoff` - approved prototype packaging.
