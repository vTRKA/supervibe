# Electron Brandbook Baseline

## Density (desktop comfortable)
- Base unit: 8px
- Line-height: 1.5 body
- Touch targets ≤ 32px allowed (mouse-driven typically)
- Account for trackpad gestures + scroll-wheel

## Typography scale
- 12, 13, 14, 15, 16, 18, 20, 24, 32 (px)
- Body: 13–14px (smaller than web — desktop viewing distance closer)
- System font preferred (`-apple-system, "Segoe UI", "Ubuntu"`)

## Motion budget
- Component micro: 120–180ms
- Window/panel transitions: 200–280ms
- Heavy animations: avoid (battery, fan)
- Reduced-motion: collapse

## Component baseline
button, input, select, checkbox, radio, toggle, table (essential for desktop), tree, tabs, sidebar, toolbar, menubar, contextmenu, dialog, toast, badge, splitter

## Platform conventions (CRITICAL)
- macOS: traffic-light placement, sheet dialogs, sidebar drawers, ⌘ shortcuts
- Windows: minimize-maximize-close on right, ribbon or menubar, Ctrl shortcuts
- Linux: respect GTK / Qt theming where possible

## A11y baseline
- Keyboard nav for ALL features (no mouse-only)
- Native menus where possible (screen-reader friendly)
- Respect OS dark/light mode via `prefers-color-scheme`
