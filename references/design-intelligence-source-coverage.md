# Design Intelligence Source Coverage

Source commit: `b7e3af8`

This document is the local coverage map for the design intelligence import. It
exists so design agents and validators know which source families are available
locally, which folders to read, and which families were intentionally skipped or
deferred.

## Adapted Families

| Family | Status | Local path | Rationale |
| --- | --- | --- | --- |
| Main design CSV data | adapted | `skills/design-intelligence/data/*.csv` | Core retrieval evidence for product, style, color, typography, UX, charts, icons, landing, app interface, React performance, and UI reasoning. |
| Duplicate data trees | adapted | `skills/design-intelligence/data/manifest.json` | Manifest records canonical family names, duplicate checksum comparison, imported row counts, and checksums. |
| Stack CSV data | adapted | `skills/design-intelligence/data/stacks/*.csv` | Stack-aware UI handoff evidence for web, mobile, framework, component-library, and 3D surfaces. |
| Slide decision CSV data | adapted | `skills/design-intelligence/data/slides/*.csv` | Deck strategy, layout, copy, chart, color, typography, and background evidence. |
| Logo, icon, CIP collateral CSV data | adapted | `skills/design-intelligence/data/collateral/*.csv` | Brand/collateral evidence with approved brandbook precedence. |
| Search and reasoning scripts | adapted | `scripts/lib/design-intelligence-search.mjs` | Algorithmic value ported to Node-only runtime: CSV parsing, search, domain inference, recommendation synthesis, evidence formatting, and stable checksums. |
| Brand scripts | adapted | `scripts/lib/design-brand-asset-auditor.mjs` | Asset validation, palette comparison, and brand-to-token sync checks adapted for Supervibe artifacts. |
| Brand, design-system, UI styling, slides references | adapted | `skills/design-intelligence/references/*.md` | Curated into compact Supervibe reference cards, not copied as command surfaces. |
| Base and platform templates | adapted | `skills/design-intelligence/references/ui-styling-reference.md` | Used as template-structure and platform-scope guidance only. |

## Local Data Domains

Core domains under `skills/design-intelligence/data/`:

- `products.csv`
- `styles.csv`
- `colors.csv`
- `typography.csv`
- `ux-guidelines.csv`
- `app-interface.csv`
- `charts.csv`
- `icons.csv`
- `landing.csv`
- `google-fonts.csv`
- `react-performance.csv`
- `ui-reasoning.csv`

Stack domains under `skills/design-intelligence/data/stacks/`:

- `angular.csv`
- `astro.csv`
- `flutter.csv`
- `html-tailwind.csv`
- `jetpack-compose.csv`
- `laravel.csv`
- `nextjs.csv`
- `nuxt-ui.csv`
- `nuxtjs.csv`
- `react.csv`
- `react-native.csv`
- `shadcn.csv`
- `svelte.csv`
- `swiftui.csv`
- `threejs.csv`
- `vue.csv`

Slide domains under `skills/design-intelligence/data/slides/`:

- `slide-backgrounds.csv`
- `slide-charts.csv`
- `slide-color-logic.csv`
- `slide-copy.csv`
- `slide-layout-logic.csv`
- `slide-layouts.csv`
- `slide-strategies.csv`
- `slide-typography.csv`

Collateral domains under `skills/design-intelligence/data/collateral/`:

- `cip-deliverables.csv`
- `cip-industries.csv`
- `cip-mockup-contexts.csv`
- `cip-styles.csv`
- `icon-styles.csv`
- `logo-colors.csv`
- `logo-industries.csv`
- `logo-styles.csv`

Reference cards under `skills/design-intelligence/references/`:

- `asset-and-collateral-reference.md`
- `brand-reference.md`
- `design-system-reference.md`
- `professional-ui-priority-reference.md`
- `slide-deck-reference.md`
- `ui-styling-reference.md`

## Skipped Or Deferred Families

| Family | Status | Rationale |
| --- | --- | --- |
| Installer/update CLI source and package sidecars | skipped | Installer/update behavior and package mechanics are not plugin runtime. Useful design guidance was adapted into Node search and references. |
| CI workflows, previews, screenshots, generated coverage, caches | skipped | Demo and CI files do not belong in plugin runtime. |
| Font binaries and font license sidecars | deferred-with-rationale | Require separate asset-pack approval and license review before bundling. Font availability and pairing evidence stays in `google-fonts.csv`. |
| Low-signal design/draft backup files | skipped | Backup/reference notes are noisy and are not read by the local search runtime; stronger structured rows already cover the useful design dimensions. |

Every skipped or deferred family is listed in
`skills/design-intelligence/data/manifest.json` so future agents do not silently
re-import it. External references remain allowed only for current examples,
official platform docs, live competitor pages, or fresh visual evidence that the
local pack cannot contain.
