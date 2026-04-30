# Design Intelligence Source Coverage

Source commit: `b7e3af8`

| Family | Status | Local path | Rationale |
| --- | --- | --- | --- |
| Main design CSV data | adapted | `skills/design-intelligence/data/*.csv` | Core retrieval evidence for product, style, color, typography, UX, charts, icons, landing, app interface, React performance, and UI reasoning. |
| Duplicate data trees | adapted | `skills/design-intelligence/data/manifest.json` | Manifest records canonical tree and duplicate checksum comparison. |
| Stack CSV data | adapted | `skills/design-intelligence/data/stacks/*.csv` | Stack-aware UI handoff evidence. |
| Slide decision CSV data | adapted | `skills/design-intelligence/data/slides/*.csv` | Deck strategy, layout, copy, chart, color, typography, and background evidence. |
| Logo, icon, CIP collateral CSV data | adapted | `skills/design-intelligence/data/collateral/*.csv` | Brand/collateral evidence with approved brandbook precedence. |
| Search and reasoning scripts | adapted | `scripts/lib/design-intelligence-search.mjs` | Ported algorithmic value to Node-only runtime. |
| Brand scripts | adapted | `scripts/lib/design-brand-asset-auditor.mjs` | Ported asset validation, palette comparison, and brand-to-token sync checks. |
| Brand, design-system, UI styling, slides references | adapted | `skills/design-intelligence/references/*.md` | Curated into compact Supervibe reference cards. |
| Base and platform templates | adapted | `skills/design-intelligence/references/ui-styling-reference.md` | Used as template-structure and platform-scope guidance only. |
| CLI TypeScript source and package sidecars | skipped | none | Installer/update behavior and package mechanics are not plugin runtime. |
| CI workflows, previews, screenshots, generated coverage, pycache | skipped | none | Not useful for runtime design intelligence. |
| Font binaries and font license sidecars | deferred-with-rationale | none | Require separate packaging and license review before bundling. |
| Low-signal draft/design backup files | skipped | manifest excluded assets | Kept out of default lookup to avoid noisy recommendations. |

Every skipped or deferred family is listed in `skills/design-intelligence/data/manifest.json` so future agents do not silently re-import it.
