# Third-Party Design Intelligence

Supervibe 2.0 includes an adapted design intelligence data pack sourced from a pinned MIT-licensed upstream repository at commit `b7e3af80f6e331f6fb456667b82b12cade7c9d35`.

## Adapted

- CSV design knowledge tables for product type, style, color, typography, UX, app interface, chart, icon, landing, Google Fonts, React performance, and UI reasoning guidance.
- Stack-specific UI guidance CSVs.
- Slide strategy, layout, copy, typography, color, background, and chart decision data.
- Logo, icon, and CIP collateral guidance.
- Algorithmic ideas for BM25 lookup, token validation, brand context extraction, asset validation, palette comparison, and brand-to-token sync.

## Not Imported As Runtime

- Python scripts, original CJS scripts, installer/update CLI behavior, CI workflows, screenshots, preview demos, generated coverage artifacts, pycache, and font binaries.
- Platform templates and CLI TypeScript sources are reference-only. They do not create new Supervibe commands or package scripts.

## Runtime Policy

The shipped plugin uses Node-only lookup and validation. Imported data is advisory evidence; approved project memory, approved design-system tokens, codebase facts, and accessibility requirements take precedence.
