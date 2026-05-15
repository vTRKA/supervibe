# Design Intelligence Source Coverage

Source commit: `b7e3af8`

This document is the local coverage map for the design intelligence import. It
exists so design agents and validators know which source families are available
locally, which folders to read, and which families were intentionally skipped or
deferred.

## Adapted Families

| Family | Status | Local path | Rationale |
| --- | --- | --- | --- |
| Main design CSV data | adapted | `skills/design-intelligence/data/*.csv` | Core retrieval evidence for product, style, color, typography, UX, charts, icons, landing, app interface, React performance, and UI reasoning. The app-interface runtime CSV is a merged web plus native platform superset. |
| Duplicate data trees | adapted | `skills/design-intelligence/data/manifest.json` | Manifest records canonical family names, duplicate checksum comparison, imported row counts, checksums, source variants, canonical choices, and adaptation rationales. |
| Stack CSV data | adapted | `skills/design-intelligence/data/stacks/*.csv` | Stack-aware UI handoff evidence for web, mobile, framework, component-library, and 3D surfaces. |
| Logo, icon, CIP collateral CSV data | adapted | `skills/design-intelligence/data/collateral/*.csv` | Brand/collateral evidence with approved brandbook precedence. |
| Search and reasoning scripts | adapted | `scripts/lib/design-intelligence-search.mjs` | Algorithmic value ported to Node-only runtime: CSV parsing, search, domain inference, recommendation synthesis, evidence formatting, and stable checksums. |
| Brand scripts | adapted | `scripts/lib/design-brand-asset-auditor.mjs` | Asset validation, palette comparison, and brand-to-token sync checks adapted for Supervibe artifacts. |
| Brand, design-system, and UI styling references | adapted | `skills/design-intelligence/references/*.md` | Curated into compact Supervibe reference cards, not copied as command surfaces. |
| Creative reference packs | adapted | `skills/design-intelligence/references/creative/*.md` | Curated local tier-2 creative packs plus `docs/references/creative-reference-taxonomy.md`; used to choose borrow/avoid moves without treating famous products as style authority. |
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
- `ui-styling-reference.md`

Creative reference packs under `skills/design-intelligence/references/creative/`:

- `creative-editorial.md`
- `creative-luxury.md`
- `creative-experimental-web.md`
- `creative-mobile-native.md`
- `creative-data-products.md`
- `creative-ai-products.md`
- `creative-devtools.md`
- `creative-regulated-trust.md`

Taxonomy: `docs/references/creative-reference-taxonomy.md`.

## Source Variant Contract

`skills/design-intelligence/data/manifest.json` is the durable contract for
source variants. Every domain must carry:

- `sourceVariant`: the canonical coverage strategy.
- `canonicalChoice`: why the runtime CSV is the local source of truth.
- `adaptationRationale`: the exact reason for any local adaptation.
- `sourceVariants`: neutral source paths, row counts, checksums, disposition,
  and rationale for each covered variant.

Five domains have explicit adaptation coverage:

| Domain | Canonical choice |
| --- | --- |
| `app-interface` | Merged web package rows and native source-tree rows so agents cover browser, iOS, Android, and React Native interface practice. |
| `color` | Format-normalized runtime CSV with the same parsed row content and stable packaged checksum. |
| `icons` | 105-row local/source-tree superset covering the 104-row packaged variant plus the guideline row. |
| `landing` | 34-row sanitized superset that preserves modern patterns and fixes malformed trailing packaged rows. |
| `style` | Terminology-normalized runtime names with alias keywords for prior source-variant names. |

The validator fails if a future import adds a source variant without a neutral
path, rows, checksum, disposition, rationale, canonical choice, and runtime
coverage entry.

## Advanced Prototype Tool Families

The local design intelligence pack is allowed to inform, but not automatically
approve, advanced prototype tooling. Agents may consider these external
libraries through the Prototype Capability Plan when the brief warrants them:

- Motion, GSAP, Lottie/lottie-web, and Rive for motion or designer-authored
  animation.
- Three.js, PixiJS, Canvas, SVG, WebGL/WebGPU, and Theatre.js for 3D,
  generative visuals, particle systems, spatial scenes, or orchestrated
  timelines.
- D3, Observable Plot, ECharts, Visx, Recharts, and MapLibre GL for charts,
  dense data visualization, and maps.
- Rough.js, Matter.js, Monaco, and CodeMirror for sketch-like visuals, physics,
  and code-editor prototypes.

These libraries remain external runtime choices. A prototype may use them only
when the capability plan records purpose, artifact scope, license/security,
bundle/performance, accessibility, reduced-motion fallback, and verification.

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
