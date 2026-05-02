---
name: prototype-handoff
namespace: process
description: >-
  Use AFTER a prototype is explicitly approved (.approval.json present with
  status=approved) to package it as a stack-agnostic handoff bundle at
  .supervibe/artifacts/prototypes/<slug>/handoff/ that any framework developer
  can pick up and promote to production. Triggers: 'утверди прототип', 'готов к
  разработке', 'передай разработчикам', 'handoff to dev', 'stack-agnostic
  export'.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
  - Edit
phase: handoff
prerequisites:
  - prototype-approved
emits-artifact: handoff-bundle
confidence-rubric: confidence-rubrics/prototype.yaml
gate-on-exit: true
version: 1.1
last-verified: 2026-04-28T00:00:00.000Z
---

# Prototype Handoff

Package an approved native HTML/CSS/JS prototype into a **ready-for-development bundle** that any stack-developer agent (`laravel-developer`, `nextjs-developer`, `vue-implementer`, etc.) can pick up and promote into a real framework. The handoff bundle is stack-agnostic — it documents WHAT to build, not in which framework.

Readiness boundary: handoff requires **approved prototype + final tokens**. Draft prototypes may inform the product model, but their visual taste is not implementation guidance. The handoff bundle must be the single source of truth for developers.

## When to invoke

- After `supervibe:prototype` or `supervibe:landing-page` produced a prototype AND user explicitly approved it (`.supervibe/artifacts/prototypes/<slug>/.approval.json` exists with `status: "approved"`)
- After `/supervibe-design` Stage 8 fires
- Request examples include "approved, hand it off" and "ready for stack". Other-language trigger phrases remain in the frontmatter `Triggers:` metadata.

NOT for:
- Drafts or under-review prototypes - refuse with "Prototype is not approved. Get explicit approval through the `supervibe:prototype` feedback loop first."
- Production deployment — that's still the chosen `<stack>-developer` agent's job

## Hard constraints

1. **Approval marker required.** No `.supervibe/artifacts/prototypes/<slug>/.approval.json` with `status: "approved"` → refuse to run.
2. **Final tokens required.** `.supervibe/artifacts/prototypes/_design-system/manifest.json` must show final token metadata (`tokensState: "final"` or equivalent approved/final state) tied to the approved prototype.
3. **Stack-agnostic output.** Bundle does NOT pick a framework. It describes the prototype in framework-neutral terms; per-stack adapter hints are notes, not code.
4. **Verbatim copy of approved files.** No "improvements" during handoff — the prototype is already approved as-is.
5. **Inventory + traceability.** Every component used + every token consumed listed with file:line refs so downstream developer doesn't have to grep.
6. **No competing prototypes.** If multiple alternatives remain active, pick one approved prototype and mark the rest parked/rejected before claiming ready-for-development.

## Step 0 — Read source of truth (required)

1. Read `.supervibe/artifacts/prototypes/<slug>/.approval.json`. Parse `status`, `viewports`, `designSystemVersion`, `approvedAt`. If `status !== "approved"` → STOP.
2. Read `.supervibe/artifacts/prototypes/<slug>/config.json` for declared viewports, interaction depth, structure.
3. Read `.supervibe/artifacts/prototypes/_design-system/manifest.json` to confirm system version matches `approval.designSystemVersion` and tokens are final. If mismatch (system was updated after approval) → WARN user; ask whether to re-approve against new system OR proceed with stale snapshot only when final token state is preserved.
4. Check `.supervibe/artifacts/prototypes/<slug>/alternatives/` and sibling candidate prototypes. If competing prototypes are still active, STOP until exactly one source is approved and the rest are parked/rejected.
5. Read every file in `.supervibe/artifacts/prototypes/<slug>/` to inventory components and tokens used.

## Procedure

### Stage 1 — Validate approval

1. Confirm `.approval.json` exists and parses.
2. Confirm `status === "approved"`.
3. Confirm `.supervibe/artifacts/prototypes/_design-system/` still exists at the recorded `designSystemVersion`.
4. Confirm final tokens exist and are tied to this visual approval.
5. Confirm there is one selected prototype and no active competing prototypes.
6. If any check fails, refuse and tell user what's missing.

### Stage 2 — Build handoff directory

```
.supervibe/artifacts/prototypes/<slug>/handoff/
├── README.md                ← what + when + by whom + viewport list + how to consume
├── index.html               ← copied verbatim from <slug>/index.html
├── pages/                   ← copied
├── styles/                  ← copied (system.css still imports ../../_design-system/tokens.css)
├── scripts/                 ← copied
├── content/copy.md          ← copied
├── components-used.json     ← inventory (see Stage 3)
├── tokens-used.json         ← inventory (see Stage 4)
├── viewport-spec.json       ← exact breakpoints + container queries used
└── stack-agnostic.md        ← per-stack adapter hints (see Stage 5)
```

### Stage 3 — Component inventory

Walk every HTML file under `<slug>/`. For each `<button>`, `<input>`, `<form>`, `<dialog>`, etc. that maps to a documented design-system component, record:

```json
{
  "components": [
    {
      "name": "button",
      "designSystemRef": ".supervibe/artifacts/prototypes/_design-system/components/button.md",
      "occurrences": [
        { "file": "index.html", "line": 47, "variant": "primary",   "size": "md" },
        { "file": "index.html", "line": 102, "variant": "secondary", "size": "md" },
        { "file": "pages/checkout.html", "line": 28, "variant": "primary", "size": "lg" }
      ]
    }
  ]
}
```

Save to `handoff/components-used.json`.

### Stage 4 — Token inventory

Grep every `var(--*)` reference in `styles/`. Group by token category. Output:

```json
{
  "tokens": {
    "color": ["--color-action", "--color-action-hover", "--color-fg", "--color-bg", "--color-border"],
    "spacing": ["--space-1", "--space-2", "--space-4", "--space-6"],
    "radius": ["--radius-md"],
    "type": ["--text-base", "--text-md", "--text-2xl"],
    "motion": ["--duration-quick", "--ease-out-quad"]
  },
  "rawValues": {
    "_warning": "These are direct values that bypass tokens. Should be 0 in approved handoff. Investigate any non-empty.",
    "hex": [],
    "px": [],
    "cubicBezier": []
  }
}
```

Save to `handoff/tokens-used.json`.

### Stage 5 — Adapter hints (target-aware)

Read `.supervibe/artifacts/prototypes/<slug>/config.json` for `target`. Branch:

- `target: web` → produce `handoff/stack-agnostic.md` covering React, Vue, Svelte, vanilla — same as v1 (the existing template).
- `target: chrome-extension` → ALSO copy `templates/handoff-adapters/chrome-extension.md.tpl` to `handoff/extension-adapter.md` and fill prototype-specific notes.
- `target: electron` → ALSO copy `templates/handoff-adapters/electron.md.tpl` to `handoff/electron-adapter.md`.
- `target: tauri` → ALSO copy `templates/handoff-adapters/tauri.md.tpl` to `handoff/tauri-adapter.md`.
- `target: mobile-native` -> ASK user one question: "Production stack - React Native, Flutter, or native (Swift/Kotlin)?". Based on answer copy `react-native.md.tpl` or `flutter.md.tpl` to `handoff/<rn-or-flutter>-adapter.md`. For native (Swift/Kotlin): produce a manual hand-off note ("HTML sketches are layout reference; native implementation is greenfield - share with platform-native designer").

For any non-web target, the per-target adapter file goes alongside (not instead of) `stack-agnostic.md` — the latter still covers token+component inventory, the former covers runtime mapping.

Verification: each target's adapter file must exist in `handoff/` before the bundle is considered complete.

For `target: web`, the body of `handoff/stack-agnostic.md` follows this template:

```markdown
# Stack-Agnostic Handoff: <slug>

Approved: 2026-04-28 by <user>
Viewports: 375, 1440
Design system: .supervibe/artifacts/prototypes/_design-system/ (commit <sha>)

## What this is

Native HTML/CSS/JS prototype. To promote to production, pick a framework
and re-implement components AS-IS. Tokens and motion stay; markup is the
contract.

## Per-stack adapter hints

### React / Next.js
- Each `<button class="btn btn-primary">` becomes `<Button variant="primary" />`
- Tokens: import `.supervibe/artifacts/prototypes/_design-system/tokens.css` directly OR run
  `supervibe:tokens-export --target=tailwind` to get a tailwind theme
- State machinery: keep useState minimal; the prototype's `data-loading="true"`
  attribute pattern transfers verbatim

### Vue 3 / Nuxt
- Component-per-file. The prototype's `pages/<page>.html` maps to
  `pages/<page>.vue`. Inline styles forbidden — all styles via tokens
  (use scoped CSS or CSS modules)
- For Pinia state: prototype data-attributes + JS handlers in
  `scripts/` are the source of state shape

### Svelte / SvelteKit
- Direct mapping. Prototype's HTML is closest to Svelte's syntax.
- Token CSS file imported in `app.css`. Use Svelte's class:directive
  for variant switches.

### Laravel Blade
- Components: `<x-button variant="primary" size="md">` per Blade convention.
- Token CSS file linked from layout.

### Vanilla / no framework
- Copy `index.html`, `styles/`, `scripts/` to deploy target.
- Keep `.supervibe/artifacts/prototypes/_design-system/` as a sibling for token updates.

## Components to build (count: <N>)

See `components-used.json` for full inventory.

## Tokens to wire (count: <N>)

See `tokens-used.json`. Run `supervibe:tokens-export` for framework-specific format.

## Reviews already done

- UI polish: <count> issues resolved (see `_reviews/polish.md`)
- Accessibility: WCAG AA <pass/fail> (see `_reviews/a11y.md`)
- SEO (landing only): <count> findings resolved (see `_reviews/seo.md`)

## Open questions for stack-developer

(To be filled during handoff Q&A — what's ambiguous about the prototype
that the implementer will need to decide in framework context: client
state vs server state, hydration boundary, route nesting, etc.)
```

### Stage 6 — README

Write `handoff/README.md`:

```markdown
# Handoff: <slug>

**Approved:** <ISO date> by <user>
**Approval marker:** `../.approval.json`
**Design system version:** <commit-sha>
**Viewports:** 375, 1440
**Feedback rounds:** <N>

## To promote to production

1. Pick a framework (or none — vanilla is fine for static).
2. Read `stack-agnostic.md` for per-framework adapter hints.
3. Read `components-used.json` + `tokens-used.json` for the inventory.
4. Re-implement files as the framework requires.
5. Import tokens via `supervibe:tokens-export --target=<framework>` OR by
   linking `.supervibe/artifacts/prototypes/_design-system/tokens.css` directly.

## Verification before merging to production

- All declared viewports (375, 1440) render without horizontal scroll
- Token-discipline grep clean (no raw hex / magic px / inline cubic-bezier)
- WCAG AA check still passing in framework (a11y is structural, transfers)
- Lighthouse mobile-slow-4G: LCP < 2.5s, CLS < 0.1 (landing only)
- Reduced-motion respected
```

### Stage 7 — Score

Score the handoff bundle against `prototype.yaml` rubric ≥9 (same rubric as the prototype itself; this is the approval audit).

## Output contract

```
=== Prototype Handoff ===
Source:         .supervibe/artifacts/prototypes/<slug>/                (.approval.json: approved)
Bundle:         .supervibe/artifacts/prototypes/<slug>/handoff/
Components:     <N> documented in components-used.json
Tokens:         <N> documented in tokens-used.json
Viewports:      375, 1440
Stack-agnostic adapter hints: 5 frameworks documented (React, Vue, Svelte, Laravel, vanilla)
Reviews carry-over: polish + a11y + seo (where applicable)
Status:         ready-for-development

Confidence: <N>.<dd>/10
Override:   <true|false>
Rubric:     prototype
```

## Guard rails

- DO NOT run on un-approved prototypes. `.approval.json` with `status: "approved"` is the gate.
- DO NOT run without final tokens. Candidate tokens are for visual proof, not production handoff.
- DO NOT modify the prototype during handoff. Copy verbatim.
- DO NOT pick a framework. Bundle is stack-agnostic.
- DO NOT skip the design-system version check. If system drifted post-approval, WARN.
- DO NOT claim ready-for-development while competing prototypes remain active.
- DO NOT delete the source `.supervibe/artifacts/prototypes/<slug>/` files — handoff is a copy, not a move.

## Verification

- `.supervibe/artifacts/prototypes/<slug>/handoff/` exists with all 9 expected files/dirs
- `components-used.json` enumerates ≥1 component per page
- `tokens-used.json.rawValues.{hex,px,cubicBezier}` are empty arrays
- Design-system version recorded matches `.supervibe/artifacts/prototypes/_design-system/` HEAD and final token state
- No active competing prototypes remain for the same surface
- README explains the bundle in ≤2 minutes of reading

## Related

- `supervibe:prototype` + `supervibe:landing-page` — produce the source prototype
- `supervibe:brandbook` — produces the design system this bundle inherits
- `supervibe:tokens-export` — invoked by downstream `<stack>-developer` to convert tokens
- `commands/supervibe-design.md` — Stage 8 invokes this skill
- `<stack>-developer` agents — consumers of the handoff bundle
