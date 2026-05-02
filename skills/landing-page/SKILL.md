---
name: landing-page
namespace: process
description: "Use WHEN building a marketing or product landing page as a native HTML/CSS/JS prototype to scaffold with SEO meta, analytics hooks, copy review, accessibility, and explicit approval lifecycle for stack-agnostic handoff. RU: используется КОГДА строится маркетинговый или продуктовый landing как нативный HTML/CSS/JS прототип — каркас с SEO, аналитикой, copy review, a11y и явным lifecycle утверждения для переноса в любой стек. Trigger phrases: 'сделай лендинг', 'нужна landing страница', 'построй landing', 'дизайн посадочной'."
allowed-tools: [Read, Grep, Glob, Bash, Write, Edit]
phase: exec
prerequisites: [design-system-approved]
emits-artifact: prototype
confidence-rubric: confidence-rubrics/prototype.yaml
gate-on-exit: true
version: 2.0
last-verified: 2026-04-28
---

# Landing Page

## Design Intelligence Preflight

Before section order, CTA, style, typography, conversion, or visual treatment decisions, run project memory, code search, and internal `supervibe:design-intelligence` lookup for product, landing, style, color, typography, UX, and stack evidence.

Build a marketing landing page as a **native HTML / CSS / JS** prototype with SEO + analytics + accessibility baked in from the start. Sibling of `supervibe:prototype` — same lifecycle and discipline, but with extra concerns specific to public-facing marketing surfaces.

## When to invoke

User asks for a landing page: "сделай лендинг", "build a landing", "посадочная для X", "marketing page". The brief usually specifies the audience (B2B / B2C / dev-tool / consumer) and a competitor reference ("в стиле Linear" / "как Stripe").

NOT for:
- In-product flows (login, dashboard, settings) — that's `supervibe:prototype`
- Brand work without a target page — that's `supervibe:brandbook` first

## Hard constraints (same as `supervibe:prototype`)

1. **Native only.** No frameworks, no build step, no npm. Pure HTML + CSS + JS.
2. **Design system is source of truth.** All visuals come through `.supervibe/artifacts/prototypes/_design-system/tokens.css`.
3. **Two viewports default** — `375px` mobile + `1440px` desktop. Ask user before adding more.
4. **One question at a time** in markdown with progress.
5. **Explicit approval lifecycle**: draft → review → revisions → approved → handoff.

Plus landing-specific:

6. **SEO scaffolding from day one.** `<title>`, meta description, Open Graph, Twitter card, canonical, structured-data JSON-LD — all present from the first commit, not added later.
7. **Analytics hooks defined.** Even if the analytics provider isn't wired yet, every CTA + form submit + scroll-depth milestone must have a `data-analytics-event` attribute the future stack can hook into.
8. **Lighthouse-ready.** Performance budget: LCP < 2.5s on slow 4G mobile. Image strategy AVIF/WebP with explicit width/height. No layout shifts (`aspect-ratio`).
9. **Existing artifact mode is explicit.** Same as `supervibe:prototype`: if old `.supervibe/artifacts/prototypes/`, `.supervibe/artifacts/mockups/`, or `.supervibe/artifacts/presentations/` artifacts exist and the brief is ambiguous, ask continue existing vs new from scratch vs alternative before opening old files.
10. **Preview feedback button is mandatory.** Same as `supervibe:prototype`: the served preview must show the `Feedback` button and must not use `--no-feedback`.

## Step 0 — Read source of truth (required)

1. **Design system check** — same as `supervibe:prototype`. Required: `.supervibe/artifacts/prototypes/_design-system/{tokens.css, components/, voice.md}`. STOP if missing.
2. **Brand direction check** — `.supervibe/artifacts/brandbook/direction.md` (mood-board, palette intent, tone). Reference but don't reinvent.
3. **Artifact mode check** — run `node "<resolved-supervibe-plugin-root>/scripts/lib/design-artifact-intake.mjs" --json --brief "<brief>"`. If `needsQuestion: true`, ask whether to continue an existing artifact, create a new landing from scratch, or create an alternative. Do not open old landing prototype files as source until the user chooses.
4. **Memory check** — `supervibe:project-memory --query "landing"` for prior landing decisions, A/B test results, conversion data.
5. **Competitive reference** — if brief named a competitor, invoke `supervibe:mcp-discovery` for `web-crawl`. Use Firecrawl to scrape the reference. Extract: hero structure, section count, CTA placement, social proof shape. Do NOT clone — extract patterns, then apply through OUR design system.

## Decision tree — landing structure

```
What landing kind is this?
├─ Hero → features → social proof → CTA
│   → Classic SaaS landing (default)
├─ Hero → demo video → feature deep-dive → pricing → CTA
│   → Product-focused (typical when product is visual)
├─ Hero → problem → solution → testimonials → FAQ → CTA
│   → Conversion-optimized (lead gen, signup-driven)
├─ Storytelling scroll → reveal-on-scroll narrative
│   → Editorial (brand-heavy, high motion)
└─ Single big CTA, ≤2 sections
    → Squeeze page (campaign, paid traffic landing)

ASK: "Какая структура нужна?" — multiple choice in markdown
```

## Procedure

### Stage 1 — Setup + viewport question

1. Pick slug: `.supervibe/artifacts/prototypes/landing-<topic>/`.
2. **Single question on viewports** (markdown formatted):
   ```markdown
   **Шаг 1/4: Viewports.**
   Стандарт — 375px (mobile) + 1440px (desktop). Что нужно?
   - ✅ Стандартные
   - ➕ + 768px (tablet)
   - ➕ + 1920px (wide)
   - ✏️ Свои
   ```
3. **Single question on landing structure** (after viewports answered).
4. **Single question on tone** ("деловой / тёплый / провокационный / брутальный / минималистичный").
5. **Single question on competitor references** (zero, one, or up-to-three URLs).

Each question waits for explicit answer. Save all to `.supervibe/artifacts/prototypes/landing-<topic>/config.json`.

### Stage 2 — File layout

```
.supervibe/artifacts/prototypes/landing-<topic>/
├── config.json                  { "viewports": [375, 1440], "structure": "saas-classic", "tone": "warm", ... }
├── index.html                   landing entry — has full SEO + OG + JSON-LD + analytics scaffolding
├── styles/
│   ├── reset.css
│   ├── system.css               imports ../../_design-system/tokens.css
│   └── landing.css              section composition (no token literals)
├── scripts/
│   └── analytics-stub.js        empty hooks ready to wire to GA/Plausible/Posthog
├── assets/
│   └── images/                  AVIF/WebP only, with .webp fallback
├── content/
│   └── copy.md                  raw text content (so copywriter agent can review separately)
├── seo/
│   ├── og-image.png             1200x630 social card
│   └── meta.json                site title, description, canonical, structured-data
└── _reviews/                    ui-polish + a11y + seo audit reports
```

### Stage 3 — Build

1. Read design system tokens, write semantic HTML5 (`<header>`, `<main>`, `<section>`, `<article>`, `<footer>`).
2. SEO scaffolding in `<head>`:
   ```html
   <title>{{tone-appropriate title, ≤60 chars}}</title>
   <meta name="description" content="{{≤160 chars, single sentence value prop}}">
   <link rel="canonical" href="{{TBD}}">
   <meta property="og:title" content="...">
   <meta property="og:description" content="...">
   <meta property="og:image" content="seo/og-image.png">
   <meta property="og:type" content="website">
   <meta name="twitter:card" content="summary_large_image">
   <script type="application/ld+json">{ "@context": "https://schema.org", ... }</script>
   ```
3. Analytics hooks on every CTA + form + scroll milestone:
   ```html
   <a href="#signup" data-analytics-event="hero-cta-click" data-analytics-section="hero">Get started</a>
   ```
4. Image discipline: explicit width/height, `loading="lazy"` below the fold, `loading="eager" fetchpriority="high"` on LCP image, `aspect-ratio` on parent to avoid CLS.
5. Animations from `.supervibe/artifacts/prototypes/_design-system/motion.css` only. Reduced-motion respected.

### Stage 4 — Live preview

Same as `supervibe:prototype` — `supervibe:preview-server --root .supervibe/artifacts/prototypes/landing-<topic>/` with mandatory feedback overlay. Verify `#supervibe-fb-toggle` / visible `Feedback` button before presenting the URL.

### Stage 5 — Feedback loop (required)

After URL delivered:

```markdown
**Лендинг готов:** http://localhost:3047
**Viewports:** 375 / 1440
**Структура:** {{chosen}}
**SEO + analytics hooks:** wired
**Состояние:** draft

Что делаем дальше?

- ✅ **Утвердить** — фиксирую `approved`, копирую в `.supervibe/artifacts/prototypes/landing-<topic>/handoff/`
- ✎ **Доработать** — что поменять? Опиши одной мыслью, я итерирую
- 🔀 **Альтернатива** — предложу 2 другие структуры/тона
- 📊 **Провести reviews** — accessibility-reviewer + ui-polish-reviewer + seo-specialist параллельно
- 🛑 **Стоп** — оставить как draft
```

Wait for explicit choice.

### Stage 6 — Approval marker

When user says "утвердить":

1. Write `.supervibe/artifacts/prototypes/landing-<topic>/.approval.json`:
   ```json
   {
     "status": "approved",
     "approvedAt": "<ISO>",
     "approvedBy": "<user>",
     "viewports": [375, 1440],
     "structure": "saas-classic",
     "tone": "warm",
     "designSystemVersion": "<sha>",
     "previewUrl": "http://localhost:3047",
     "lighthouseTarget": { "lcp": "2.5s", "cls": "0.1", "tbt": "200ms" },
     "approvalScope": "full"
   }
   ```
2. Update `config.json`: `"approval": "approved"`.
3. Stop here — handoff to ready-for-development handled by `/supervibe-design` Stage 7.

## Output contract

```
=== Landing Page ===
Slug:           landing-<topic>
Location:       .supervibe/artifacts/prototypes/landing-<topic>/
Viewports:      [375, 1440]
Structure:      <saas-classic | product | conversion | editorial | squeeze>
SEO scaffolding: ✓ title + description + OG + Twitter + JSON-LD + canonical
Analytics hooks: <count> data-analytics-event attributes wired
Lighthouse target: LCP <2.5s, CLS <0.1, TBT <200ms (mobile slow-4G)
Preview URL:    http://localhost:NNNN
Approval:       <draft | approved>     ← .supervibe/artifacts/prototypes/<slug>/.approval.json

Confidence: <N>.<dd>/10
Override:   <true|false>
Rubric:     prototype
```

## Guard rails

Same as `supervibe:prototype`, plus:
- DO NOT skip SEO meta tags. Even on a draft, scaffolding must be present.
- DO NOT inline analytics provider code. Just `data-analytics-event` attributes; provider wiring is downstream's job.
- DO NOT use placeholder Lorem Ipsum past Stage 1. Actual copy from copywriter (or user-provided) must be in by Stage 3.
- DO NOT exceed Lighthouse mobile budgets without justification ADR.
- DO NOT reuse or edit an old landing artifact without the artifact-mode question when the brief is ambiguous.
- DO NOT disable preview feedback overlay for landing previews.

## Verification

- `grep -E 'meta name="description"|og:title|og:image|application/ld\+json' .supervibe/artifacts/prototypes/landing-*/index.html` → all present
- `grep -rE 'data-analytics-event=' .supervibe/artifacts/prototypes/landing-*/` → ≥3 hits (hero CTA, primary CTA, footer CTA at minimum)
- All `<img>` have `width=` AND `height=` (no CLS)
- Reduced-motion respected (no entrance animation longer than 100ms when `prefers-reduced-motion: reduce`)
- Lighthouse mobile-slow-4G: LCP <2.5s, CLS <0.1
- `find . -name '*.html' -path '*/.supervibe/artifacts/prototypes/landing-*'` opens cleanly in browser without console errors

## Anti-patterns (skill-level — fail conditions)

- `asking-multiple-questions-at-once` — bundling >1 question into one user message. ALWAYS one question with `Шаг N/M:` progress label.
- `advancing-without-feedback-prompt` — concluding delivery without printing the 5-choice feedback block (✅ / ✎ / 🔀 / 📊 / 🛑) and waiting for explicit user choice.
- `framework-coupling` — emitting `import … from`, `require()`, `<script src="…cdn…">`, `<script src="…unpkg…">`, or any `node_modules/` reference inside the prototype directory.
- `silent-viewport-expansion` — adding viewport widths beyond what `.supervibe/artifacts/prototypes/<slug>/config.json` declares without re-asking the user.
- `silent-existing-artifact-reuse` — reading or modifying a prior design artifact before the user chose continue existing vs new from scratch.
- `missing-preview-feedback-button` — presenting a preview URL without the visible `Feedback` overlay button.
- `random-regen-instead-of-tradeoff-alternatives` — when user dislikes a direction, re-rolling without producing 2-3 documented alternatives via `templates/alternatives/tradeoff.md.tpl`.

## Related

- `supervibe:prototype` — sibling for in-product flows (no SEO/analytics concerns)
- `supervibe:brandbook` — produces the design system both consume
- `supervibe:preview-server` — auto-spawns the live URL
- `supervibe:tokens-export` — when approved, exports tokens to whichever framework downstream picks
- `agents/_design/copywriter` — invoked at Stage 3 if user-provided copy is incomplete
- `agents/_design/prototype-builder` — implements the HTML/CSS/JS
- `agents/_design/ui-polish-reviewer` + `accessibility-reviewer` — Stage 5 reviews
- `agents/_product/seo-specialist` — Stage 5 SEO audit
- `commands/supervibe-design.md` — full orchestrator
