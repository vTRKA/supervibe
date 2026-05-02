---
name: seo-audit
namespace: process
description: "Use WHEN auditing or building public pages for SEO to verify technical SEO + content SEO using best-practices-researcher for current 2026 patterns. RU: Используется КОГДА проверяешь или собираешь публичные страницы под SEO — валидирует technical SEO + content SEO с актуальными паттернами 2026 через best-practices-researcher. Trigger phrases: 'SEO audit', 'мета-теги', 'проверь SEO', 'seo чеклист'."
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

## Step 0 — Read source of truth (required)

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

## Audit dimensions

| Dimension | Checks |
|-----------|--------|
| Crawlability | robots.txt, sitemap, canonical, status codes, no accidental noindex |
| Metadata | title, description, open graph, twitter cards, locale alternates |
| Structured data | Schema.org type, required fields, validation result |
| Content | search intent fit, headings, internal links, duplicate/thin content |
| Performance | Core Web Vitals, image weight, render blocking, mobile layout |
| Accessibility | semantic headings, alt text, meaningful link text |
| International | hreflang, canonical per locale, localized metadata |
| Freshness | lastmod, stale claims, publication/update dates |

## Current-research policy

SEO guidance changes. Use current primary or reputable sources when:
- the page targets search traffic,
- schema requirements are uncertain,
- Google or other search guidance may have changed,
- the user asks for "latest" or "2026" practice.

Record the source or research-cache entry used. If no current lookup is possible, label the audit as baseline technical SEO and do not claim current best-practice completeness.

## Output severity

- `CRITICAL`: page may not be indexed or may point search engines to the wrong URL.
- `MAJOR`: ranking, snippet quality, schema eligibility, or Core Web Vitals likely harmed.
- `MINOR`: polish, consistency, or opportunity item.

## Verification

- The scoped page list is explicit.
- Lighthouse or equivalent technical audit was run when a runnable page exists.
- Schema validation was run or blocked with reason.
- Sitemap, robots, canonical, and metadata were checked.
- Best-practice source or research-cache entry is cited.
- Core Web Vitals risk is stated.
- Indexing blockers are separated from ranking opportunities.
- Public-page scope is explicit.
- Recheck command or browser URL is included.

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
