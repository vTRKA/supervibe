# Chrome Extension Brandbook Baseline

## Density (TIGHTER than web)
- Base unit: 8px (vs web's 16px)
- Line-height: 1.4 for body
- Popup must fit in ≤ 600×800 px — design for compactness

## Typography scale
- 11, 12, 13, 14, 16, 18 (px) — narrower range than web
- Body: 13px/1.4 typical
- No display sizes — popups don't have hero space

## Motion budget (tight)
- Component micro: 100–150ms (popup may close — fast feedback critical)
- NO page transitions in popup
- Side-panel may use web tier
- Reduced-motion: instant

## Component baseline (subset)
button, input, select, toggle, list-item, badge, divider, link
(modal/toast/tabs/nav typically out of scope for popup; OK for options page)

## A11y baseline
- Same WCAG AA
- Popup: keyboard-only flows MUST work (some users mouse-disable in extensions)
- Test on macOS VoiceOver + Windows NVDA — popup screen-reader behaviour varies

## Surface-specific notes
- popup (360×600): one main task, ≤3 levels of hierarchy
- options page (1024×768): full-page web-app conventions
- side-panel (400×800): persistent — design for prolonged viewing
