---
name: seo-audit
namespace: process
description: "Use WHEN auditing or building public pages for SEO to verify technical SEO + content SEO using best-practices-researcher for current 2026 patterns"
allowed-tools: [Read, Grep, Glob, Bash]
phase: review
prerequisites: []
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1.0
last-verified: 2026-04-27
---

# SEO Audit

## When to invoke

- Before publishing landing page / blog post / product page
- After major content restructure
- Quarterly site-wide audit

## Step 0 — Read source of truth (MANDATORY)

1. Identify pages in scope (`prototypes/landing/` or live URLs)
2. Read sitemap, robots.txt
3. Invoke `best-practices-researcher` for current 2026 SEO patterns (via research-cache, TTL 30d)

## Procedure

1. Invoke `seo-specialist` agent for technical audit
2. Invoke `best-practices-researcher` for current pattern updates
3. Cross-check:
   - Meta titles ≤60 chars, descriptions ≤155
   - Schema.org per page type
   - Canonical URLs
   - hreflang (multi-locale)
   - Sitemap currency
   - Internal linking (no orphans, anchor variety)
4. Run Lighthouse SEO audit
5. Check Core Web Vitals impact
6. Score with confidence-scoring

## Output contract

Returns:
- Lighthouse SEO score
- Schema validation result
- Findings table (CRITICAL/MAJOR/MINOR)
- Best-practices delta (if researcher found changes since last verify)

## Guard rails

- DO NOT: skip researcher consultation (SEO changes constantly)
- DO NOT: rubber-stamp Lighthouse 100 (manual checks still needed)
- ALWAYS: cite research-cache file used

## Related

- `agents/_product/seo-specialist` — performs audit
- `agents/_ops/best-practices-researcher` — fetches current patterns
