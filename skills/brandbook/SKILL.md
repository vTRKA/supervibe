---
name: brandbook
namespace: process
description: "Use WHEN starting new product OR major brand reset BEFORE any prototype to materialize an explicit design system as source of truth (tokens, components, voice, motion, accessibility) at prototypes/_design-system/. The system is approved by the user FIRST; every prototype downstream consumes it without invention. RU: используется КОГДА запускается новый продукт ИЛИ крупный rebrand ДО любого прототипа — материализует явную дизайн-систему как источник истины (tokens, components, voice, motion, accessibility) в prototypes/_design-system/. Система утверждается пользователем ПЕРВЫМ; каждый downstream-прототип потребляет её без выдумывания. Trigger phrases: 'нужен бренд', 'разработай бренд', 'фирстиль', 'брендбук', 'rebrand', 'design system', 'дизайн-система'."
allowed-tools: [Read, Grep, Glob, Bash, Write, Edit]
phase: brainstorm
prerequisites: []
emits-artifact: design-system
confidence-rubric: confidence-rubrics/brandbook.yaml
gate-on-exit: true
version: 2.1
last-verified: 2026-04-28T00:00:00.000Z
---

# Brandbook

Materialize a brand into an **explicit, approved, machine-readable design system** at `prototypes/_design-system/`. The system is the ONLY source of visual truth — every prototype, every component, every animation downstream consumes it. The user approves the system FIRST, before any pixel of UI is built.

This skill replaces "vibes-based" brand work with a contract: tokens are explicit values in versioned files, components are named with documented states + variants, motion has named keyframes / easings / durations, voice has DO/DON'T examples. Adding a hue or radius or font weight that isn't in the system requires a system extension dialogue, not a one-off.

## When to invoke

- New product, no design system exists
- Major brand reset (rename, repositioning, market change)
- Audit found token drift (raw hex / magic spacing values in prototypes that aren't in the system)
- User reviewed several prototypes and asked "why does each look slightly different?" — answer: no source-of-truth design system

NOT for:
- Tweaking one button color in an approved system → that's a system-extension dialogue (this skill, brief mode)
- Marketing direction without operational tokens → that's `prototypes/_brandbook/direction.md` (separate moodboard artifact)

## Hard constraints

1. **One question at a time.** Brand work is deeply collaborative; never overwhelm with a 5-question dump.
2. **Markdown-formatted dialogue** with progress indicator: "Шаг 3/8: палитра — primary".
3. **Approval is explicit** at the SYSTEM level. Each section (palette, type, spacing, radius, motion, voice, components-baseline) signed off separately so the user can change their mind on type without redoing palette.
4. **Output is machine-readable** — `tokens.css` parseable by any tool; `components/<name>.md` parseable for component cards; `motion.css` consumable by every prototype.
5. **Versioned + reversible** — each approved section gets a git commit; reverting is git revert, not "undo".
6. **Alternatives are first-class** — when user rejects a direction, this skill produces 2 alternatives with explicit tradeoffs documented, never random regen.

## Step 0 — Read source of truth (MANDATORY)

1. Read `prototypes/_brandbook/direction.md` if exists (creative-director's moodboard + intent doc).
2. Read `prototypes/_design-system/` if exists — discover what's already approved vs what needs work.
3. Read `evolve:project-memory --query brand` for prior brand decisions, retired directions, locked constraints.
4. Read user's brief / requirements doc if pointed at one.

**Step 0a — Determine target baseline.**

Read the active prototype's `prototypes/<slug>/config.json` for `target`. If no active prototype yet, ASK the user one question:

> **Шаг 0/8:** На какую платформу будет brandbook?
> - `web` — браузер (default)
> - `chrome-extension` — popup/options/side-panel
> - `electron` / `tauri` — desktop
> - `mobile-native` — iOS+Android
> - `mixed` — фронт + extension одновременно (используем web baseline + extension override)

Read `templates/brandbook-target-baselines/<target>.md` as the starting baseline. Use its density/type-scale/motion budget/component-list as DEFAULTS that the user can override during Sections 3, 4, 5, 6.

For `target: mixed`, load `web.md` as primary and surface-specific deltas from the secondary target's file when relevant.

## Decision tree — system scope

```
What's the user asking for?
├─ "I have a brand, materialize it as a system"
│   → tokens + components + motion + voice (full pass, ~8 sections, 1-2 hour dialogue)
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

Each section is its OWN dialogue. User approves before next starts. ONE question per message.

### Section 1 — Palette intent (≤6 questions)

```markdown
**Шаг 1/8: Палитра — primary.**

Какой основной цвет несёт эмоцию бренда?
Назови HEX или дай ассоциацию (например "глубокий ночной синий" / "термоядерный зелёный").

(Альтернативы покажу следующим шагом, когда определимся с направлением.)
```

Wait. Then secondary, accent, neutrals, success/warning/danger semantic, gradients, dark-mode strategy. **One question per message.**

After user answers each: write to `prototypes/_design-system/tokens.css`:
```css
:root {
  --color-primary-500: #...; /* + semantic alias */
  --color-primary-600: ...;
  /* full 50→950 ramp via OKLCH or HSL math */
}
```

Plus accessibility check per pair (WCAG AA contrast ≥4.5:1 for body, ≥3:1 for UI components). Show the user any pair that fails.

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

Reference `evolve:interaction-design-patterns` for the full menu of approaches. The system declares which timings + easings ARE the brand's vocabulary; prototypes don't author new ones.

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

This list is a **starting point — open, not closed.** Add or remove components as the project requires (data table, tree, kbd, popover, tooltip, accordion, drawer, command palette, splitter, etc.). If user picks a component library in Section 6.5, the spec list becomes the set of components for which our spec is authoritative; the rest are inherited from the library.

Output: copy each chosen template to `prototypes/_design-system/components/<name>.md` and fill it with the project's specifics.

### Section 6.5 — Component library decision (one question)

**Шаг 6.5/8:** Выбираем подход к компонентам.

- A) **Свои компоненты** — пишем с нуля, максимум контроля, дольше build. Старт = templates/design-system/components/.
- B) **shadcn/ui** (React) — copy-paste primitives, наши токены, источник истины — наш репозиторий.
- C) **MUI** (React) — готовая библиотека, мы делаем theme.ts с нашими токенами.
- D) **Mantine** (React) — как MUI, более современный, гибкий.
- E) **Radix UI / HeadlessUI** — только логика, визуал полностью наш.
- F) **Angular Material / PrimeVue / Quasar / другое** — указываем явно.

После выбора — запустим `evolve:component-library-integration` для генерации bridge перед тем как переходить к Section 7. Не пропускаем bridge: без него выбранная библиотека рендерится в её дефолтном визуале и наши токены становятся декорацией.

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

Output to `prototypes/_design-system/accessibility.md`.

### Section 8 — System manifest

Final output: `prototypes/_design-system/manifest.json`:
```json
{
  "version": "1.0.0",
  "approvedAt": "<ISO>",
  "approvedBy": "<user>",
  "sections": {
    "palette": "approved",
    "typography": "approved",
    "spacing": "approved",
    "motion": "approved",
    "voice": "approved",
    "components": "approved (button, input, ...)",
    "accessibility": "approved (WCAG AA)"
  },
  "extensionPolicy": "extensions require user approval; ad-hoc tokens forbidden in prototypes"
}
```

### Approval markers per section

After each section dialogue completes, write a per-section approval to `prototypes/_design-system/.approvals/<section>.json` so partial work survives session restarts and the next session knows what's left.

## Alternatives generation

When user rejects a direction, this skill produces 2 explicit alternatives, each documenting:
- What changed vs the rejected option
- Why this might fit better
- Tradeoff cost (e.g. "softer palette → less category distinctiveness; gain: warmth")

Output each alternative to `prototypes/_design-system/.alternatives/<section>-<variant-name>.css` so user can compare side-by-side without losing the rejected one.

## Output contract

```
=== Brandbook ===
Location:       prototypes/_design-system/
Sections:       palette / typography / spacing / motion / voice / components (N) / accessibility
Approval:       <full | partial: palette+type only | etc.>
Components:     button, input, ... (N total)
Tokens:         tokens.css (X lines), motion.css (Y lines)
Accessibility:  WCAG AA (or AAA per project)
Approved at:    <ISO>
Manifest:       prototypes/_design-system/manifest.json

Confidence: <N>.<dd>/10
Override:   <true|false>
Rubric:     brandbook
```

## Guard rails

- ONE question per message. Always.
- DO NOT proceed to next section without explicit approval of the current.
- DO NOT inline raw hex / magic numbers anywhere. Tokens or it's not done.
- DO NOT advance to component design before palette + type + spacing approved (downstream depends on these).
- DO NOT mark approved without `manifest.json` + per-section markers in `.approvals/`.
- DO NOT delete rejected alternatives — keep them in `.alternatives/` for future reference.

## Verification

- `find prototypes/_design-system/ -type f` shows expected files
- `prototypes/_design-system/tokens.css` parses (no syntax errors)
- `prototypes/_design-system/manifest.json` valid JSON
- Every component in `components/` has the 4 required sections (anatomy, states, variants, tokens)
- Contrast check on every text-on-bg pair in palette: WCAG AA passing
- `prefers-reduced-motion` strategy documented
- ≥1 alternative documented for any rejected primary direction (no silent regen)

## Anti-patterns (skill-level — fail conditions)

- `asking-multiple-questions-at-once` — bundling >1 question into one user message. ALWAYS one question with `Шаг N/M:` progress label.
- `advancing-without-feedback-prompt` — concluding delivery without printing the 5-choice feedback block (✅ / ✎ / 🔀 / 📊 / 🛑) and waiting for explicit user choice.
- `random-regen-instead-of-tradeoff-alternatives` — when user dislikes a direction, re-rolling without producing 2-3 documented alternatives via `templates/alternatives/tradeoff.md.tpl`.

## Related

- `agents/_design/creative-director` — produces brand DIRECTION (mood-board, intent) BEFORE this skill materializes the system
- `evolve:tokens-export` — when system approved, exports to framework-specific format (Tailwind / MUI / CSS vars / Style Dictionary) for downstream stack
- `evolve:prototype` + `evolve:landing-page` — consume this system; cannot run without it (prerequisite: `design-system-approved`)
- `evolve:interaction-design-patterns` — animation recipe library; system DECLARES which timings/easings to use
- `commands/evolve-design.md` — full pipeline orchestrator
