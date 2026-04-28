---
name: prototype
namespace: process
description: "Use WHEN user asks for design/mockup/UI exploration BEFORE implementing in framework to produce 1:1 native-HTML prototype in /prototypes for brand approval, feedback iteration, and frame­work-agnostic 1:1 transfer. RU: используется КОГДА пользователь просит дизайн/макет/исследование UI ДО реализации во фреймворке — создаёт 1:1 нативный HTML-прототип в /prototypes для утверждения, цикла обратной связи и переноса в любой фреймворк. Trigger phrases: 'сделай мокап', 'покажи как будет выглядеть', 'нарисуй UI', 'нужен прототип', 'сделай макет'."
allowed-tools: [Read, Grep, Glob, Bash, Write, Edit]
phase: exec
prerequisites: [design-system-approved]
emits-artifact: prototype
confidence-rubric: confidence-rubrics/prototype.yaml
gate-on-exit: true
version: 2.0
last-verified: 2026-04-28
---

# Prototype

Build a **native HTML / CSS / JS** prototype that materializes an approved design system into a clickable, viewport-correct mockup. The prototype is for design approval and stack-agnostic handoff — never for production deployment.

## When to invoke

AFTER `supervibe:brandbook` has produced an approved design system at `prototypes/_design-system/`. Triggered by user requests like "сделай мокап", "build a prototype of X", "покажи как будет выглядеть", "design the checkout flow".

NOT for:
- Implementing in a real framework — that is `<stack>-developer` agents AFTER prototype is approved and handed off
- Production landing pages — `supervibe:landing-page` covers SEO + analytics requirements
- Pure visual exploration without interaction — that's brandbook moodboard territory

## Hard constraints

1. **Native only.** No React, Vue, Svelte, Next.js, Nuxt, Astro, Tailwind preprocessor, npm dependencies. Pure HTML + CSS + JS. The output must work by opening `index.html` in any browser without a build step.
2. **Design system is source of truth.** Every color, spacing, type ramp, radius, motion timing comes from `prototypes/_design-system/tokens.css`. Raw hex values, magic pixel numbers, ad-hoc cubic-beziers are forbidden. If the system doesn't have it, ask user to extend the system FIRST.
3. **Two viewports by default** — `375px` (mobile) and `1440px` (desktop). The user may request more (e.g. `768px` tablet, `1920px` wide-screen) but the default is exactly these two. Ask user upfront before building.
4. **One question at a time.** Never dump 5 questions in one message. Use markdown formatting with progress indicator ("Шаг 2/5: viewports").
5. **Approval lifecycle is explicit.** Every prototype passes through draft → review → revisions → approved → handoff. The agent never proceeds across a stage without user signal.

## Step 0 — Read source of truth (required)

1. **Design system check.** Read `prototypes/_design-system/tokens.css`, `prototypes/_design-system/components/*.md`, `prototypes/_design-system/voice.md`. If any are missing → STOP. Tell user: "Не могу строить прототип без утверждённой дизайн-системы. Запусти `/supervibe-design <бриф>` или `supervibe:brandbook` для согласования tokens + components ПЕРВЫМ".
2. **Memory check.** `supervibe:project-memory --query <topic>` — surface any prior prototype on this surface or related decisions.
3. **Brief read.** Get the user's exact wording. If unclear (≥3 ambiguities), enter clarification dialogue (one question at a time).

## Target surfaces (Шаг 0 — ASK BEFORE viewport)

Prototype skill supports five target runtimes. Ask user FIRST:

**Шаг 0/N:** На какую платформу делаем прототип?
- `web` — браузерный сайт/SaaS (default 375 mobile + 1440 desktop)
- `chrome-extension` — расширение браузера (popup + options + side-panel)
- `electron` — Electron desktop app (main + settings windows)
- `tauri` — Tauri desktop app (Rust + webview)
- `mobile-native` — нативное мобильное (iOS/Android — React Native / Flutter / SwiftUI)

После выбора — загружу `templates/viewport-presets/<target>.json` и спрошу про viewport'ы (default/optional/custom).

For `mobile-native`: prototype is HTML simulation of mobile UI within an iframe with the chosen viewport size — note that final implementation will be React Native / Flutter / native; the HTML prototype is a fidelity sketch only.

For `tauri` / `electron`: HTML/CSS/JS still works (renderer is webview-based), but constraints differ (see preset `constraints` field). Do NOT use Node APIs in HTML — IPC bridges only via documented preload exposed APIs.

For `chrome-extension`: HTML/CSS/JS works. Manifest constraints (CSP — no inline handlers) must be respected even at prototype stage.

## Decision tree — viewport configuration

```
What viewports does this prototype need?
├─ Read templates/viewport-presets/<target>.json for defaults + optional
├─ DEFAULT (web): [375, 1440] — mobile + desktop. Cover 95% of cases.
├─ DEFAULT (extension): popup 360x600 + options 1024x768 + side-panel 400x800
├─ DEFAULT (electron/tauri): 1280x800 main + 800x600 settings
├─ DEFAULT (mobile-native): iPhone 15 393x852 + Pixel 8 412x915
└─ User can choose any subset of defaults+optional, or custom widths.

ASK (one question, after target chosen):
  "Использовать стандартные viewport'ы для <target>: <list> или нужны другие?"

Wait for explicit answer. Save chosen viewports + target + runtime + constraints
to prototypes/<slug>/config.json BEFORE any HTML written.

The pre-write hook (scripts/hooks/pre-write-prototype-guard.mjs) blocks every
file write to prototypes/<slug>/ until config.json exists.
```

## Decision tree — interaction depth

```
What level of fidelity does this prototype need?
├─ Visual-only — static screens, hover states, no real navigation
│   → just HTML + CSS, no JS
├─ Click-through flow — moves between screens on user click
│   → light JS, anchor-routed (no SPA, no client router)
├─ Realistic interaction — form validation, animations,
│   skeleton loaders, micro-interactions
│   → CSS animations + Web Animations API + Intersection Observer
│   (defer to supervibe:interaction-design-patterns for recipes)
└─ Data-fed mock — fake API responses, realistic content state
    → fetch() against local JSON files in prototypes/<slug>/mocks/
```

## Procedure

### Stage 1 — Setup

1. Pick a slug for the prototype: `prototypes/<feature-slug>/` (kebab-case, ≤30 chars).
2. Read `config.json` if it exists; otherwise ask **target surface** question first (see "Target surfaces" section above), then load `$CLAUDE_PLUGIN_ROOT/templates/viewport-presets/<target>.json`, then ask **viewports** question. Save answer to `prototypes/<slug>/config.json` BEFORE any other write — the pre-write hook enforces this. The config.json structure: `{ "target": "web|chrome-extension|electron|tauri|mobile-native", "viewports": [...], "runtime": "<from preset>", "constraints": [...from preset] }`.
3. Confirm interaction depth level (visual-only / click-through / realistic / data-fed). One question, multiple-choice format.
4. Create directory layout:
   ```
   prototypes/<slug>/
   ├── config.json              { "viewports": [375, 1440], "interaction": "click-through", "approval": "draft" }
   ├── index.html               entry point
   ├── pages/                   per-flow HTML files
   ├── styles/
   │   ├── reset.css            normalize / reset
   │   ├── system.css           imports from ../../_design-system/tokens.css
   │   └── pages.css            per-page composition (no token literals)
   ├── scripts/                 native JS modules
   ├── mocks/                   fake JSON if interaction='data-fed'
   ├── assets/                  per-prototype images (icons in design-system, not here)
   └── _reviews/                ui-polish + a11y reports land here later
   ```

### Stage 2 — One question at a time

The prototype-builder agent (or this skill, when run inline) asks user-facing questions ONE AT A TIME, formatted as:

```markdown
**Шаг 1/4: Viewports.**
Использовать стандартные 375px (mobile) + 1440px (desktop)?

- ✅ Да, стандартные
- ➕ Добавить 768px (tablet)
- ➕ Добавить 1920px (wide)
- ✏️ Свои размеры (укажи)
```

Wait for explicit answer. Then next question. Never combine.

### Stage 3 — Build

1. Build the chosen viewports as separate breakpoint blocks in `styles/pages.css` using container queries OR a single `@media (min-width)` cascade. Pick one and keep consistent.
2. Compose components by reading `prototypes/_design-system/components/<name>.md` for each — NEVER invent component patterns; if the design system doesn't have what you need, STOP and ask user to extend the system.
3. Animations come from `prototypes/_design-system/motion.css` (named keyframes + named easings + named durations) — apply, don't author new motion in the prototype.
4. **No framework imports.** Verify `<script src=>` and `<link href=>` reference only relative files. No CDN, no `import` from npm. Greppable: `grep -rE '(unpkg|cdn|jsdelivr|https://.*\.(js|css))' prototypes/<slug>/` must return zero results.

### Stage 4 — Live preview

1. Invoke `supervibe:preview-server` with `--root prototypes/<slug>/`. It spawns `http://localhost:NNNN` with SSE hot-reload, idle-shutdown 30 min.
2. Print URL to user. Hand-off to user for visual review.
3. Ensure server stays alive while feedback loop runs.

### Stage 5 — Feedback loop (required)

After delivering the URL, the skill EXPLICITLY prompts feedback:

```markdown
**Прототип готов:** http://localhost:3047
**Viewports:** 375px (mobile), 1440px (desktop)
**Состояние:** draft

Что делаем дальше?

- ✅ **Утвердить** — фиксирую состояние как `approved`, готовлю handoff в `prototypes/<slug>/handoff/`
- ✎ **Доработать** — расскажи что поменять, итерируем
- 🔀 **Альтернатива** — предложу 2 другие визуальные/композиционные направления
- 🛑 **Стоп** — оставить как draft, вернёмся позже
```

Do NOT proceed without explicit choice. If "Доработать" → ask one clarifying question per round. If "Альтернатива" → spawn `prototypes/<slug>/alternatives/<variant-name>/` with the variant; user can compare side-by-side.

### Stage 6 — Approval marker

When user explicitly says "утвердить" / "approve" / "✅":

1. Write `prototypes/<slug>/.approval.json`:
   ```json
   {
     "status": "approved",
     "approvedAt": "<ISO date>",
     "approvedBy": "<user — from git config user.name>",
     "viewports": [375, 1440],
     "designSystemVersion": "<commit-sha of _design-system/ at approval time>",
     "previewUrl": "http://localhost:3047",
     "feedbackRounds": 3,
     "approvalScope": "full | viewport-mobile | viewport-desktop | layout-only"
   }
   ```

2. Update `config.json`: `"approval": "approved"`.
3. Stop here. The skill does not write the handoff — that is `prototype-handoff` skill or the `/supervibe-design` command's Stage 7.

### Stage 7 — Score + done

1. Score against `prototype.yaml` rubric (≥9 to ship).
2. Print final summary including approval state, file count, viewport count, link to `_reviews/`.

## Output contract

```
=== Prototype ===
Slug:           <slug>
Location:       prototypes/<slug>/
Viewports:      [375, 1440]   (mobile, desktop)
Interaction:    click-through
Files:          index.html (1) + pages (N) + styles (M) + scripts (K)
Design system:  prototypes/_design-system/  (commit: <sha>)
Preview URL:    http://localhost:NNNN
Approval:       <draft | approved>     ← saved at prototypes/<slug>/.approval.json
Feedback rounds: <count>

Confidence: <N>.<dd>/10
Override:   <true|false>
Rubric:     prototype
```

## Guard rails

- DO NOT install any npm package or import any framework. Native only.
- DO NOT exceed 2 viewports unless user explicitly asked for more.
- DO NOT proceed past delivery without explicit feedback choice.
- DO NOT mark approved without `.approval.json` artifact.
- DO NOT extend the design system inside a prototype dir — design system extensions go through `supervibe:brandbook`.
- DO NOT ask >1 question per message.
- DO NOT use raw hex / magic px / ad-hoc cubic-bezier — everything from tokens.

## Verification

- `find prototypes/<slug>/ -name '*.html'` shows expected structure
- `grep -rE '(unpkg|cdn|jsdelivr|node_modules|import .* from)' prototypes/<slug>/` returns 0 hits
- `grep -rE '#[0-9a-f]{3,8}|rgb\(|rgba\(' prototypes/<slug>/styles/pages.css` returns 0 hits (all colors via var(--token))
- Open prototype at each declared viewport in DevTools, confirm no horizontal overflow at 375px
- Approval marker written when user says "утвердить" / "approve"
- `prefers-reduced-motion: reduce` honored — animations disabled or shortened to ≤100ms

## Anti-patterns (skill-level — fail conditions)

- `asking-multiple-questions-at-once` — bundling >1 question into one user message. ALWAYS one question with `Шаг N/M:` progress label.
- `advancing-without-feedback-prompt` — concluding delivery without printing the 5-choice feedback block (✅ / ✎ / 🔀 / 📊 / 🛑) and waiting for explicit user choice.
- `framework-coupling` — emitting `import … from`, `require()`, `<script src="…cdn…">`, `<script src="…unpkg…">`, or any `node_modules/` reference inside the prototype directory.
- `silent-viewport-expansion` — adding viewport widths beyond what `prototypes/<slug>/config.json` declares without re-asking the user.
- `random-regen-instead-of-tradeoff-alternatives` — when user dislikes a direction, re-rolling without producing 2-3 documented alternatives via `templates/alternatives/tradeoff.md.tpl`.

## Related

- `supervibe:brandbook` — produces the design system this skill consumes (PREREQUISITE)
- `supervibe:interaction-design-patterns` — animation recipes referenced from `motion.css`
- `supervibe:preview-server` — auto-spawned at Stage 4 for live URL
- `supervibe:landing-page` — sibling skill for marketing-page-specific concerns (SEO, analytics)
- `agents/_design/prototype-builder` — the implementer agent that wraps this skill
- `agents/_design/ui-polish-reviewer` — invoked after delivery for 8-dim review
- `agents/_design/accessibility-reviewer` — invoked after delivery for WCAG check
- `commands/supervibe-design.md` — full pipeline orchestrator (brand → spec → prototype → review → handoff)
