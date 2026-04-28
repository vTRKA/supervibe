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

Build a marketing landing page as a **native HTML / CSS / JS** prototype with SEO + analytics + accessibility baked in from the start. Sibling of `evolve:prototype` — same lifecycle and discipline, but with extra concerns specific to public-facing marketing surfaces.

## When to invoke

User asks for a landing page: "сделай лендинг", "build a landing", "посадочная для X", "marketing page". The brief usually specifies the audience (B2B / B2C / dev-tool / consumer) and a competitor reference ("в стиле Linear" / "как Stripe").

NOT for:
- In-product flows (login, dashboard, settings) — that's `evolve:prototype`
- Brand work without a target page — that's `evolve:brandbook` first

## Hard constraints (same as `evolve:prototype`)

1. **Native only.** No frameworks, no build step, no npm. Pure HTML + CSS + JS.
2. **Design system is source of truth.** All visuals come through `prototypes/_design-system/tokens.css`.
3. **Two viewports default** — `375px` mobile + `1440px` desktop. Ask user before adding more.
4. **One question at a time** in markdown with progress.
5. **Explicit approval lifecycle**: draft → review → revisions → approved → handoff.

Plus landing-specific:

6. **SEO scaffolding from day one.** `<title>`, meta description, Open Graph, Twitter card, canonical, structured-data JSON-LD — all present from the first commit, not added later.
7. **Analytics hooks defined.** Even if the analytics provider isn't wired yet, every CTA + form submit + scroll-depth milestone must have a `data-analytics-event` attribute the future stack can hook into.
8. **Lighthouse-ready.** Performance budget: LCP < 2.5s on slow 4G mobile. Image strategy AVIF/WebP with explicit width/height. No layout shifts (`aspect-ratio`).

## Step 0 — Read source of truth (MANDATORY)

1. **Design system check** — same as `evolve:prototype`. Required: `prototypes/_design-system/{tokens.css, components/, voice.md}`. STOP if missing.
2. **Brand direction check** — `prototypes/_brandbook/direction.md` (mood-board, palette intent, tone). Reference but don't reinvent.
3. **Memory check** — `evolve:project-memory --query "landing"` for prior landing decisions, A/B test results, conversion data.
4. **Competitive reference** — if brief named a competitor, invoke `evolve:mcp-discovery` for `web-crawl`. Use Firecrawl to scrape the reference. Extract: hero structure, section count, CTA placement, social proof shape. Do NOT clone — extract patterns, then apply through OUR design system.

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

1. Pick slug: `prototypes/landing-<topic>/`.
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

Each question waits for explicit answer. Save all to `prototypes/landing-<topic>/config.json`.

### Stage 2 — File layout

```
prototypes/landing-<topic>/
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
5. Animations from `prototypes/_design-system/motion.css` only. Reduced-motion respected.

### Stage 4 — Live preview

Same as `evolve:prototype` — `evolve:preview-server --root prototypes/landing-<topic>/`.

### Stage 5 — Feedback loop (MANDATORY)

After URL delivered:

```markdown
**Лендинг готов:** http://localhost:3047
**Viewports:** 375 / 1440
**Структура:** {{chosen}}
**SEO + analytics hooks:** wired
**Состояние:** draft

Что делаем дальше?

- ✅ **Утвердить** — фиксирую `approved`, копирую в `prototypes/landing-<topic>/handoff/`
- ✎ **Доработать** — что поменять? Опиши одной мыслью, я итерирую
- 🔀 **Альтернатива** — предложу 2 другие структуры/тона
- 📊 **Провести reviews** — accessibility-reviewer + ui-polish-reviewer + seo-specialist параллельно
- 🛑 **Стоп** — оставить как draft
```

Wait for explicit choice.

### Stage 6 — Approval marker

When user says "утвердить":

1. Write `prototypes/landing-<topic>/.approval.json`:
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
3. Stop here — handoff to ready-for-development handled by `/evolve-design` Stage 7.

## Output contract

```
=== Landing Page ===
Slug:           landing-<topic>
Location:       prototypes/landing-<topic>/
Viewports:      [375, 1440]
Structure:      <saas-classic | product | conversion | editorial | squeeze>
SEO scaffolding: ✓ title + description + OG + Twitter + JSON-LD + canonical
Analytics hooks: <count> data-analytics-event attributes wired
Lighthouse target: LCP <2.5s, CLS <0.1, TBT <200ms (mobile slow-4G)
Preview URL:    http://localhost:NNNN
Approval:       <draft | approved>     ← prototypes/<slug>/.approval.json

Confidence: <N>.<dd>/10
Override:   <true|false>
Rubric:     prototype
```

## Guard rails

Same as `evolve:prototype`, plus:
- DO NOT skip SEO meta tags. Even on a draft, scaffolding must be present.
- DO NOT inline analytics provider code. Just `data-analytics-event` attributes; provider wiring is downstream's job.
- DO NOT use placeholder Lorem Ipsum past Stage 1. Actual copy from copywriter (or user-provided) must be in by Stage 3.
- DO NOT exceed Lighthouse mobile budgets without justification ADR.

## Verification

- `grep -E 'meta name="description"|og:title|og:image|application/ld\+json' prototypes/landing-*/index.html` → all present
- `grep -rE 'data-analytics-event=' prototypes/landing-*/` → ≥3 hits (hero CTA, primary CTA, footer CTA at minimum)
- All `<img>` have `width=` AND `height=` (no CLS)
- Reduced-motion respected (no entrance animation longer than 100ms when `prefers-reduced-motion: reduce`)
- Lighthouse mobile-slow-4G: LCP <2.5s, CLS <0.1
- `find . -name '*.html' -path '*/prototypes/landing-*'` opens cleanly in browser without console errors

## Related

- `evolve:prototype` — sibling for in-product flows (no SEO/analytics concerns)
- `evolve:brandbook` — produces the design system both consume
- `evolve:preview-server` — auto-spawns the live URL
- `evolve:tokens-export` — when approved, exports tokens to whichever framework downstream picks
- `agents/_design/copywriter` — invoked at Stage 3 if user-provided copy is incomplete
- `agents/_design/prototype-builder` — implements the HTML/CSS/JS
- `agents/_design/ui-polish-reviewer` + `accessibility-reviewer` — Stage 5 reviews
- `agents/_product/seo-specialist` — Stage 5 SEO audit
- `commands/evolve-design.md` — full orchestrator
