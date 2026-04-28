# Non-web design surfaces

> Relocated from CLAUDE.md as part of Phase 1 token-economy plan. Content byte-identical.

`/evolve-design` Stage 0 asks user the target surface: `web` | `chrome-extension` | `electron` | `tauri` | `mobile-native`. Viewport defaults from `templates/viewport-presets/<target>.json`. Specialist designer:

- web → `ux-ui-designer` + `creative-director`
- chrome-extension → `extension-ui-designer`
- electron → `electron-ui-designer`
- tauri → `tauri-ui-designer`
- mobile-native → `mobile-ui-designer`

Same brandbook (target-aware via `templates/brandbook-target-baselines/<target>.md`) + same handoff flow with target-specific adapter (`templates/handoff-adapters/<target>.md.tpl`). Prototype runtime adapts (HTML for web/extension/electron/tauri renderers; mobile-native HTML is fidelity sketch — production = React Native / Flutter / native).
