# Mobile Native Brandbook Baseline

## Platform conventions take precedence
The brandbook here defines DESIGN INTENT, not pixel-perfect output. Final implementation honours platform HIG.

### iOS — follow Human Interface Guidelines
- SF Pro Text/Display (system) for typography
- 17pt body default
- Tab bar bottom; navigation bar top
- Sheet (modal) presentation
- Haptics for confirmations
- Easing: cubic-bezier(0.4, 0, 0.2, 1) (system default)

### Android — follow Material 3
- Roboto / system default
- 16sp body default
- Bottom nav (≤5 items) or nav rail (tablet)
- Bottom sheets for transient surfaces
- Material elevation tokens
- Easing: M3 standard `emphasized` for entering, `decelerated` for exiting

## Touch targets
- iOS: 44×44 pt minimum
- Android: 48×48 dp minimum

## Motion budget
- Within-screen: 100–250 ms
- Between-screen: 250–400 ms (iOS push) / 250–500 ms (Android shared-element)
- Battery-aware: avoid >3s continuous animation

## Density
- Compact, but generous tap targets
- Safe-area mandatory: top notch, bottom home-indicator, side gestures

## Component baseline (minimum)
button, text-field, list-item, card, sheet, dialog, snackbar, tab-bar/bottom-nav, app-bar, fab (Android), segmented-control (iOS), badge, chip

## Platform divergence policy
Brandbook captures intent; per-platform spec captures realisation. Each component spec MUST have iOS + Android sub-sections noting differences.
