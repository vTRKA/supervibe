---
name: brandbook
namespace: process
description: >-
  Use WHEN starting new product OR major brand reset BEFORE production handoff
  to materialize an explicit design-system lifecycle at
  .supervibe/artifacts/prototypes/_design-system/. Candidate tokens guide review
  packets only; approved design-system state unlocks prototype work; final
  handoff metadata is stamped only after prototype approval. Triggers: 'нужен
  бренд', 'разработай бренд', 'фирстиль', 'брендбук', 'rebrand', 'design
  system', 'дизайн-система'.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
  - Edit
phase: brainstorm
prerequisites: []
emits-artifact: design-system
confidence-rubric: confidence-rubrics/brandbook.yaml
gate-on-exit: true
version: 2.1
last-verified: 2026-04-28T00:00:00.000Z
---

# Brandbook

## Design Intelligence Preflight

Before brand direction, palette, typography, or collateral recommendations, run project memory, code search, and internal `supervibe:design-intelligence` lookup. Use product, style, color, typography, brand, logo, icon, and CIP rows as advisory evidence only; approved memory and user feedback take precedence.

## Local Design Expert Reference

Read `docs/references/design-expert-knowledge.md` before writing direction or candidate tokens. Start with Design Pass Triage from the `Eight-Pass Expert Routine` and classify brand-owned passes as `required | reuse | delegated | skipped | N/A` with rationale. For new products and rebrands, run the required preference intake, product fit, local evidence lookup, reference scan, visual system, quality, and feedback/approval passes. For an approved existing system, reuse prior preference and visual-system decisions unless the user asks for a rebrand or material direction change. For a candidate existing system, resume review and section approval; do not treat it as prototype-ready. External references are supplemental; use the internet only for current references or official platform evidence after local data has been checked.

Materialize a brand into an **explicit, machine-readable design system lifecycle** at `.supervibe/artifacts/prototypes/_design-system/`. Candidate tokens are for review packets/styleboards only; `design_system.status = approved` plus every required section approved unlocks prototype work; final handoff metadata is written only after visual approval of an approved prototype.

The design system is a **long-lived project asset**. Full-pass mode is for the first run or an explicit rebrand. Subsequent `/supervibe-design` runs reuse the approved system and add only narrow, approved extensions. Never make users re-approve palette, typography, spacing, motion, and components just because they asked for a new mockup.

This skill replaces "vibes-based" brand work with a contract: tokens are explicit values in versioned files, components are named with documented states + variants, motion has named keyframes / easings / durations, voice has DO/DON'T examples. Adding a hue or radius or font weight that isn't in the system requires a system extension dialogue, not a one-off.

## When to invoke

- New product, no design system exists
- Major brand reset (rename, repositioning, market change)
- Audit found token drift (raw hex / magic spacing values in prototypes that aren't in the system)
- User reviewed several prototypes and asked "why does each look slightly different?" — answer: no source-of-truth design system

NOT for:
- Tweaking one button color in an approved system → that's a system-extension dialogue (this skill, brief mode)
- Marketing direction without operational tokens → that's `.supervibe/artifacts/brandbook/direction.md` (separate moodboard artifact)

## Hard constraints

1. **One question at a time.** Brand work is deeply collaborative; never overwhelm with a 5-question dump.
2. **Markdown-formatted dialogue** with dynamic progress indicator: use `Step N/M`, where `M` is the count of required questions after triage, not a fixed eight-step count.
3. **Approval is explicit** at the SYSTEM level and split into candidate, needs_revision, approved, and final handoff metadata. Required section approvals (`palette`, `typography`, `spacing-density`, `radius-elevation`, `motion`, `component-set`, `copy-language`, `accessibility-platform`) must be recorded so the user can change one area without redoing the full system.
4. **Output is machine-readable** — `tokens.css` parseable by any tool; `components/<name>.md` parseable for component cards; `motion.css` consumable by every prototype.
5. **Versioned + reversible** — each approved section gets a git commit; reverting is git revert, not "undo".
6. **Alternatives are first-class** — when user rejects a direction, this skill produces 2 alternatives with explicit tradeoffs documented, never random regen.

## Continuation Contract

Full-pass mode can draft all required sections in one run when triage marks a new design system or rebrand as `required` and the brief gives enough context. The maximum full-pass shape has eight sections, but reuse/extension mode must not force them. Do not stop after internal section drafting unless a real blocker appears; do stop for the required review packet before setting `design_system.status = approved`.

Use candidate completion markers for intermediate sections when the recommended/default choice is clear. A candidate marker must record the rationale, source evidence, and what the user can revise later in `.supervibe/artifacts/prototypes/_design-system/.approvals/<section>.json`. Candidate markers are not user approval and cannot unlock prototypes.

The design-system review packet is a chat-level gate. Ask explicit approval/revision for every required section before writing `design_system.status = approved` in `design-flow-state.json`; final handoff metadata is not stamped until an approved prototype proves the visual direction. If the user says stop, pause, skip, or asks to review a specific section manually, honor that instruction and persist partial state.

## Step 0 — Read source of truth (required)

1. Read `.supervibe/artifacts/brandbook/direction.md` if exists (creative-director's moodboard + intent doc).
2. Read `.supervibe/artifacts/prototypes/_design-system/` if exists — discover what's already approved vs what needs work.
   - If `design-flow-state.json` or `manifest.json` says `approved`, enter **reuse/extension mode** by default.
   - If status is `candidate` or `needs_revision`, enter review/resume mode by default and do not unlock prototype work.
   - In reuse/extension mode, print a short system summary and ask only about the missing token/component/asset capability needed for the current brief.
   - Full rebuild is allowed only when the user says rebrand, major reset, or explicitly approves replacing the system.
3. Read `supervibe:project-memory --query brand` for prior brand decisions, retired directions, locked constraints.
4. Read user's brief / requirements doc if pointed at one.

**Step 0b — Preference Coverage Matrix Gate.**

Before writing candidate tokens, `manifest.json`, `design-flow-state.json`, or section markers for a new product, new visual direction, or rebrand, satisfy the Preference Coverage Matrix. The saved `.supervibe/artifacts/brandbook/preferences.json` must set `first_user_design_gate_ack=true` and cover: visual direction and tone, audience/trust posture, information density, typography personality, palette mood, motion intensity, component feel, and reference borrow/avoid.

Ask one question at a time only for missing or ambiguous axes; do not dump all eight questions. If the user already gave clear preferences in the brief, persist those as source=`user` and ask one confirmation or priority question before writing candidate tokens. If the user explicitly says "no preference" or "use defaults", persist source=`explicit-default`, name each default, and continue. source=`inferred` is forbidden for this matrix. This gate cannot be satisfied by delegated approval markers. Only the visual approval/finalize step is a chat-level gate; candidate markers and delegated defaults cannot replace it.

If the brief points at an older prototype or path such as `docs/old prototypes`, ask the Old artifact reference scope question before reading the old files or writing brand artifacts. Record the borrow/avoid answer into the `reference borrow/avoid` axis.

If the brief points at a website, PDF, image/screenshot, Figma link, or other external/local reference, ask the Reference source scope question before scraping, opening, uploading, parsing, or using it: functional inventory only, information architecture, visual inspiration, authoritative brand source, ignore, or stop. Record that answer into the `reference borrow/avoid` axis.

Use the executable design wizard contract from `scripts/lib/design-wizard-catalog.mjs` when `/supervibe-design` invokes this skill. The wizard owns `questionQueue`, `decisions`, `coverage`, and `guided defaults checklist` state. If the user says to use defaults, show the guided defaults checklist before durable token writes; every axis must expose `Accept default / Compare alternatives / Customize` so defaults remain editable instead of silently closing the design interview.

Before approval, create or show `styleboard.html` in `.supervibe/artifacts/prototypes/_design-system/` or `.scratch/<run-id>/`. It must contain palette swatches, typography samples, density examples, controls, table, dialog, shell, motion notes, and component feel examples. The review styleboard is allowed only after mode, target, viewport policy, creative alternatives, anti-generic guardrail, reference scope, visual direction, density, palette mood, typography personality, component feel, and motion intensity are recorded. Before that, only diagnostic scratch is allowed; it may explain evidence or blockers, but it must not present a full visual direction. The styleboard is required evidence for section approval; markdown summaries alone are not enough for visual-system approval.

Use dry-run mode for uncertain or first-pass generation: show diagnostic scratch in chat or write it to `.supervibe/artifacts/prototypes/_design-system/.scratch/<run-id>/` only. Promote to `.supervibe/artifacts/brandbook/` or `_design-system/` after `first_user_design_gate_ack=true`, the complete matrix evidence exists, and `/supervibe-design` `writeGate.durableWritesAllowed=true`.

When the brandbook skill produces durable design-system outputs for `/supervibe-design`, do not hand-write invocation receipts. Use `node <resolved-supervibe-plugin-root>/scripts/workflow-receipt.mjs issue --command /supervibe-design --skill supervibe:brandbook ...` so the receipt is runtime-issued with HMAC provenance, artifact hashes, ledger entry, and the shared workflow `artifact-links.json`.

For new product, new visual direction, or rebrand runs, `.supervibe/artifacts/brandbook/direction.md` must exist and `creative_direction.status = selected` must be recorded before candidate tokens, section markers, or prototype unlock. Direction output must show 2-3 candidate directions, anti-generic checklist results, references, borrow/avoid notes, and why the selected direction is not just a repaint of older prototypes.

**Step 0a — Determine target baseline.**

Read the active prototype's `.supervibe/artifacts/prototypes/<slug>/config.json` for `target`. If no active prototype yet, ASK the user one question:

> **Step 0/N:** Which platform is the brandbook targeting?
> - `web` - browser (default)
> - `chrome-extension` — popup/options/side-panel
> - `electron` / `tauri` — desktop
> - `mobile-native` — iOS+Android
> - `mixed` - frontend plus extension at the same time (use web baseline plus extension override)

Read `templates/brandbook-target-baselines/<target>.md` as the starting baseline. Use its density/type-scale/motion budget/component-list as DEFAULTS that the user can override during Sections 3, 4, 5, 6.

For `target: mixed`, load `web.md` as primary and surface-specific deltas from the secondary target's file when relevant.

## Decision tree — system scope

```
What's the user asking for?
├─ "I have a brand, materialize it as a system"
│   → tokens + components + motion + voice (full pass, ~8 sections, 1-2 hour dialogue)
├─ "Make another mockup/prototype in this project"
│   → reuse approved system; add an extension only if the system lacks a required token/component
├─ "I want to explore brand directions"
│   → defer to creative-director agent first; come back here when direction approved
├─ "Just tokens, I have components covered"
│   → tokens only (palette, type, spacing, radius)
├─ "Just one section needs update" (e.g. palette refresh)
│   → that section + downstream impact analysis (which prototypes break)
└─ "We need a system but I'm not sure what"
    → start with palette + type + spacing (minimum viable system),
      add components / motion / voice as prototypes prove the need
```

## Procedure (full pass — 8 sections)

Each section is its OWN decision record. Ask ONE question per message only when the current section cannot be safely completed from the brief, approved direction, target baseline, and defaults.

### Section 1 — Palette intent (≤6 questions)

```markdown
**Step N/M: Palette - primary.**

Which primary color carries the brand emotion?
Name a HEX value or provide an association such as "deep night blue" or "nuclear green".

(Alternatives can be shown on the next step after the direction is narrowed.)
```

Wait. Then secondary, accent, neutrals, success/warning/danger semantic, gradients, dark-mode strategy. **One question per message.**

After user answers each: write to `.supervibe/artifacts/prototypes/_design-system/tokens.css`:
```css
:root {
  --color-primary-500: #...; /* + semantic alias */
  --color-primary-600: ...;
  /* full 50→950 ramp via OKLCH or HSL math */
}
```

Plus accessibility check per pair (WCAG AA contrast ≥4.5:1 for body, ≥3:1 for UI components). Show the user any pair that fails.

Minimum token coverage:
- color ramps: primary, secondary, accent, neutral, success, warning, danger, info, surface, overlay
- semantic aliases: background, foreground, muted, border, ring, focus, link, selection, chart-1..chart-8
- theme modes: light, dark, high-contrast if target requires it

### Section 2 — Typography intent

Similar dialogue: display family, body family, mono family, weight strategy (variable axis vs static), language coverage (Cyrillic? CJK? RTL?), fallback chain, license. Output to `tokens.css`:
```css
:root {
  --font-display: '<family>', serif;
  --font-body: '<family>', sans-serif;
  --font-mono: '<family>', monospace;
  --text-xs: 0.75rem;  /* + ramp */
  --leading-snug: 1.25;
}
```

### Section 3 — Spacing + sizing

Base unit (4 / 8 px), scale logic (geometric / arithmetic / hybrid), radius tiers, elevation tiers. Output to `tokens.css`:
```css
:root {
  --space-1: 4px;  /* through --space-32: 128px */
  --radius-none: 0; --radius-sm: 4px; --radius-md: 8px; --radius-lg: 16px; --radius-pill: 9999px;
  --shadow-sm: ...;  /* through --shadow-xl */
}
```

Minimum token coverage:
- spacing: `--space-0` through `--space-32`, plus layout aliases (`--layout-gutter`, `--layout-section`, `--layout-sidebar`)
- sizing: controls, avatars, icons, hit targets, max content widths
- radius: none/sm/md/lg/xl/pill plus component aliases
- elevation: shadow and border treatments for flat, raised, floating, overlay
- z-index: base, sticky, dropdown, modal, toast, feedback-overlay

### Section 4 — Motion (interactive in interaction-design-patterns)

Timing tiers, easing curves, named keyframes for common animations. Output to `motion.css`:
```css
:root {
  --duration-instant: 100ms;
  --duration-quick: 200ms;
  --duration-considered: 350ms;
  --duration-deliberate: 600ms;

  --ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1);
  --ease-in-out-back: cubic-bezier(0.68, -0.55, 0.265, 1.55);
  --ease-spring: ...;
}

@keyframes fade-up { from {opacity:0; transform:translateY(8px);} to {opacity:1; transform:none;} }
@keyframes pulse-ring { ... }
```

Reference `supervibe:interaction-design-patterns` for the full menu of approaches. The system declares which timings + easings ARE the brand's vocabulary; prototypes don't author new ones.

Before adding video or animated media, run `node "<resolved-supervibe-plugin-root>/scripts/detect-media-capabilities.mjs" --json`. If `video=false`, document non-video alternatives in the motion section: live CSS/WAAPI prototype, storyboard frames, static poster, SVG/Lottie spec if an existing asset is available. Do not promise rendered video without this capability.

### Section 5 — Voice (copy)

Brand personality (3-5 adjectives with negative-space pairs), CTA verb voice, error message tone, microcopy patterns. Output to `voice.md`:
```markdown
# Voice

**Personality:** trustworthy not stiff, warm not soft, precise not cold

**CTA verbs:** "Get started" not "Submit", "Continue" not "OK"
**Errors:** actionable + empathetic — "Email looks off — check the @" not "Invalid input"
**Microcopy:** plain language, no jargon unless audience expects it (dev-tool: jargon ok; consumer: never)

## DO
- ...
## DON'T
- ...
```

### Section 6 — Components baseline (minimum viable, OPEN-ended)

Define the components every UI needs. ONE component per dialogue round. For each, document:
- Anatomy (slots: leading icon, label, trailing icon, etc.)
- States (idle, hover, active, focus, disabled, loading, error, success)
- Variants (primary, secondary, ghost, danger; sm/md/lg)
- Tokens consumed (which palette/spacing/radius)
- Accessibility requirements (focus indicator, keyboard, ARIA role)

Starter set (templates pre-shipped at `templates/design-system/components/<name>.md.tpl`):
button, input, select, textarea, checkbox, radio, toggle, card, modal, toast, tabs, nav, badge.

Expanded catalog to consider before declaring the system "complete enough":
- Navigation: breadcrumb, sidebar, topbar, command palette, dropdown menu, context menu, pagination, stepper
- Disclosure: accordion, popover, tooltip, drawer, sheet, hover card
- Data display: data table, metric card, chart shell, timeline, activity feed, empty state, skeleton, progress, status indicator
- Forms: slider, date picker, file upload, search box, combobox, segmented control, validation summary
- Feedback: alert, banner, inline error, confirmation dialog, loading overlay
- Media: avatar, image frame, video/poster block, gallery, before/after compare
- Layout: split pane, resizable panel, dashboard grid, page shell, settings shell

If the project picks a component library, map which items are inherited from the library and which are Supervibe-owned overrides. Do not leave "library default" components visually ungoverned.

This list is a **starting point — open, not closed.** Add or remove components as the project requires (data table, tree, kbd, popover, tooltip, accordion, drawer, command palette, splitter, etc.). If user picks a component library in Section 6.5, the spec list becomes the set of components for which our spec is authoritative; the rest are inherited from the library.

Output: copy each chosen template to `.supervibe/artifacts/prototypes/_design-system/components/<name>.md` and fill it with the project's specifics.

### Section 6.5 — Component library decision (one question)

**Step 6.5/8:** Choose the component approach.

- A) **Custom components** - build from scratch; maximum control, longer build. Start at templates/design-system/components/.
- B) **shadcn/ui** (React) - copy-paste primitives, our tokens, source of truth in this repository.
- C) **MUI** (React) - mature library; generate theme.ts from our tokens.
- D) **Mantine** (React) - similar to MUI, more modern and flexible.
- E) **Radix UI / HeadlessUI** - behavior only; visual language remains fully ours.
- F) **Angular Material / PrimeVue / Quasar / other** - name the target explicitly.

After selection, run `supervibe:component-library-integration` to generate the bridge before Section 7. Do not skip the bridge: without it, the chosen library renders with its default visual language and our tokens become decoration.

For target=mobile-native, library options shift:
- React Native: Tamagui / NativeBase / RN Paper
- Flutter: Material 3 default / Cupertino / Forui
- iOS native: SwiftUI defaults + custom
- Android native: Material 3 + custom

### Section 7 — Accessibility baseline

Document:
- WCAG target level (AA default; AAA if specified)
- Touch-target minimum (44×44 default for mobile)
- Reduced-motion strategy (which animations disabled vs shortened)
- Keyboard navigation patterns (skip-link, focus-trap-on-modal, focus return)
- Screen-reader announcement patterns (aria-live for status, alt text policy)

Output to `.supervibe/artifacts/prototypes/_design-system/accessibility.md`.

### Section 8 — System manifest

Candidate output: `.supervibe/artifacts/prototypes/_design-system/manifest.json` plus `.supervibe/artifacts/prototypes/_design-system/design-flow-state.json`. Candidate output is a review packet; it does not unlock prototype work:
```json
{
  "version": "1.0.0",
  "status": "candidate",
  "tokensState": "candidate",
  "prototypeUnlock": "blocked-until-design-system-approved",
  "sections": {
    "palette": "candidate",
    "typography": "candidate",
    "spacing-density": "candidate",
    "radius-elevation": "candidate",
    "motion": "candidate",
    "component-set": "candidate",
    "copy-language": "candidate",
    "accessibility-platform": "candidate"
  },
  "extensionPolicy": "extensions require user approval; ad-hoc tokens forbidden in prototypes"
}
```

The design-system approval record is stored in `design-flow-state.json`. Do not accept blanket approval unless the review packet/styleboard was shown first in the current run and every required section summary is visible with an approve/revise/compare alternative/stop choice:

```json
{
  "creative_direction": { "status": "selected" },
  "design_system": {
    "status": "approved",
    "approved_at": "<ISO>",
    "approved_by": "<user>",
    "approved_sections": [
      "palette",
      "typography",
      "spacing-density",
      "radius-elevation",
      "motion",
      "component-set",
      "copy-language",
      "accessibility-platform"
    ],
    "feedback_hash": "<hash-or-message-evidence>"
  }
}
```

After prototype approval, `/supervibe-design` may add final handoff metadata by setting `tokensState: "final"`, `visualApprovalPrototype: ".supervibe/artifacts/prototypes/<slug>/"`, `approvedAt`, and `approvedBy`.

### Approval markers per section

After each section completes, write a per-section completion marker to `.supervibe/artifacts/prototypes/_design-system/.approvals/<section>.json` so partial work survives session restarts and the next session knows what's left. Status must be explicit: `draft`, `candidate`, `needs_revision`, or `approved`. Candidate markers are not user approval; only explicit approved markers plus `design-flow-state.json` can unlock prototype work.

### Extension mode (fast path for later mockups)

When a candidate or approved system already exists:

1. Read current system files, `design-flow-state.json`, and manifest.
2. If the system is candidate or needs_revision, resume section review instead of starting prototype work.
3. Identify the smallest missing unit: token, component variant, motion recipe, copy pattern, asset treatment, or target-specific override.
4. Write `.supervibe/artifacts/prototypes/_design-system/extensions/<yyyy-mm-dd>-<slug>.md`.
5. Ask one approval question for that extension only.
6. On approval, update the relevant token/component file and append the extension id to `manifest.json.extensions`.
7. Continue prototype work without replaying Sections 1-8 only when `design_system.status = approved` and required sections remain approved.

## Alternatives generation

When user rejects a direction, this skill produces 2 explicit alternatives, each documenting:
- What changed vs the rejected option
- Why this might fit better
- Tradeoff cost (e.g. "softer palette → less category distinctiveness; gain: warmth")

Output each alternative to `.supervibe/artifacts/prototypes/_design-system/.alternatives/<section>-<variant-name>.css` so user can compare side-by-side without losing the rejected one.

## Output contract

```
=== Brandbook ===
Location:       .supervibe/artifacts/prototypes/_design-system/
Sections:       palette / typography / spacing / motion / voice / components (N) / accessibility
Approval:       <candidate | needs_revision | approved design system | final handoff metadata after prototype approval>
Components:     button, input, ... (N total)
Tokens:         tokens.css (X lines), motion.css (Y lines)
Accessibility:  WCAG AA (or AAA per project)
Approved at:    <ISO when final; candidate runs use generatedAt>
Manifest:       .supervibe/artifacts/prototypes/_design-system/manifest.json
Flow state:     .supervibe/artifacts/prototypes/_design-system/design-flow-state.json

Confidence: <N>.<dd>/10
Override:   <true|false>
Rubric:     brandbook
```

## Guard rails

- ONE question per message. Always.
- DO NOT stop after internal section drafting when the next section can proceed with safe defaults, but DO stop for the design-system review packet before writing approved state.
- DO NOT treat a single broad style choice as complete preference intake for a new design system; the Preference Coverage Matrix must be complete before candidate tokens.
- DO NOT use source=`inferred` or agent-filled preferences in `preferences.json`; use source=`user` or source=`explicit-default` only, with `first_user_design_gate_ack=true`.
- DO NOT promote dry-run or scratch review packets into durable `.supervibe/artifacts/brandbook/` or `_design-system/` paths before the first user design gate evidence exists.
- DO NOT create a durable or full visual `styleboard.html` before the required styleboard axes, viewport policy, creative alternatives, and anti-generic guardrail are recorded; use diagnostic scratch only.
- DO NOT write candidate tokens or section markers for a new/rebrand run until `.supervibe/artifacts/brandbook/direction.md` exists and the creative direction is selected.
- DO NOT inline raw hex / magic numbers anywhere. Tokens or it's not done.
- DO NOT advance to component design before palette + type + spacing have candidate markers (downstream depends on these).
- DO NOT unlock prototype work from candidate or needs_revision design-system state.
- DO NOT mark final handoff metadata without visual approval on an approved prototype.
- DO NOT mark approved without `design-flow-state.json`, `manifest.json`, per-section markers in `.approvals/`, `approved_by`, `approved_at`, `approved_sections`, and feedback evidence.
- DO NOT accept bulk approval unless the user has already seen a full review packet/styleboard with all required section summaries and explicit choices.
- DO NOT delete rejected alternatives — keep them in `.alternatives/` for future reference.

## Verification

- `find .supervibe/artifacts/prototypes/_design-system/ -type f` shows expected files
- `.supervibe/artifacts/prototypes/_design-system/tokens.css` parses (no syntax errors)
- `.supervibe/artifacts/prototypes/_design-system/manifest.json` valid JSON
- `.supervibe/artifacts/prototypes/_design-system/design-flow-state.json` valid JSON and blocks prototype until every required section is approved
- Every component in `components/` has the 4 required sections (anatomy, states, variants, tokens)
- Contrast check on every text-on-bg pair in palette: WCAG AA passing
- `prefers-reduced-motion` strategy documented
- ≥1 alternative documented for any rejected primary direction (no silent regen)

## Anti-patterns (skill-level — fail conditions)

- `asking-multiple-questions-at-once` — bundling >1 question into one user message. ALWAYS one question with `Step N/M:` progress label.
- `advancing-without-feedback-prompt` — concluding delivery without printing the 5-choice feedback block (✅ / ✎ / 🔀 / 📊 / 🛑) and waiting for explicit user choice.
- `random-regen-instead-of-tradeoff-alternatives` — when user dislikes a direction, re-rolling without producing 2-3 documented alternatives via `templates/alternatives/tradeoff.md.tpl`.

## Related

- `agents/_design/creative-director` — produces brand DIRECTION (mood-board, intent) BEFORE this skill materializes the system
- `supervibe:tokens-export` — when system approved, exports to framework-specific format (Tailwind / MUI / CSS vars / Style Dictionary) for downstream stack
- `supervibe:prototype` + `supervibe:landing-page` — consume this system; cannot run without it (prerequisite: `design-system-approved`)
- `supervibe:interaction-design-patterns` — animation recipe library; system DECLARES which timings/easings to use
- `commands/supervibe-design.md` — full pipeline orchestrator
