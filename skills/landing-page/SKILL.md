---
name: landing-page
namespace: process
description: "Use WHEN building a marketing or product landing page to scaffold with SEO, analytics, copy review, and accessibility check from the start"
allowed-tools: [Read, Grep, Glob, Bash, Write, Edit]
phase: exec
prerequisites: []
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1.0
last-verified: 2026-04-27
---

# Landing Page

## When to invoke

WHEN building a marketing landing page, product page, feature page, or any page where conversion / SEO / first-impression matters.

NOT for: internal admin pages, dashboards (those use `evolve:new-feature`).

## Step 0 — Read source of truth (MANDATORY)

1. Read brandbook at `prototypes/_brandbook/` (if missing, invoke `evolve:brandbook` first)
2. Read existing landing pages for consistency
3. Read SEO conventions / meta-tag patterns from `CLAUDE.md`
4. Read analytics setup (which platform: GTM, Plausible, Mixpanel, etc.)

## Decision tree

```
Landing page type?
├─ Hero + features + CTA (standard) → 4-section template
├─ Long-form sales page → multi-section with social proof, FAQ
├─ Feature spotlight → focused single message
└─ Coming-soon / waitlist → minimal with email capture
```

## Procedure

1. **Brandbook check** (Step 0)
2. **Page structure**:
   - Above-the-fold hero with primary CTA
   - 2-4 supporting sections (features / proof / FAQ)
   - Footer with secondary CTAs and legal
3. **Copy** — invoke `copywriter` agent for headlines, body, CTAs
4. **SEO** — meta title (≤60 chars), meta description (≤155 chars), OG tags, schema.org JSON-LD, canonical URL
5. **Performance** — Core Web Vitals targets: LCP <2.5s, INP <200ms, CLS <0.1; image optimization (AVIF/WebP, srcset, lazy loading), critical CSS inlined
6. **Accessibility** — invoke `accessibility-reviewer`; semantic HTML, alt text, focus order, contrast
7. **Analytics** — page view event, CTA click events with consistent naming
8. **Score** — `evolve:confidence-scoring` artifact-type=agent-output; ≥9 required
9. **Pre-publish review** — `ui-polish-reviewer` for visual

## Output contract

Returns:
- Landing page files (HTML/Vue/React/etc. per stack)
- SEO meta confirmation
- CWV measurement (Lighthouse output)
- Accessibility report
- Analytics events declared

## Guard rails

- DO NOT: launch without copywriter review (placeholder copy = brand damage)
- DO NOT: skip alt text on images
- DO NOT: hardcode tracking IDs (use env vars)
- DO NOT: defer SEO meta to "later" (rarely happens)
- ALWAYS: brandbook compliance check
- ALWAYS: CWV measurement before publish

## Verification

- Lighthouse score ≥90 on Performance + SEO + Accessibility
- Copy reviewer approval recorded
- Analytics events present in code AND tracking plan

## Related

- `evolve:brandbook` — prerequisite source of truth
- `evolve:prototype` — design step before this
- Phase 3 agents: `copywriter`, `seo-specialist`, `accessibility-reviewer`, `analytics-implementation`
