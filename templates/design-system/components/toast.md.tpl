# Toast

## Anatomy

```
[ icon ] [ message [ title? ] [ description ] ] [ action? ] [ dismiss? ]
```

Slots:
- `icon` — required, semantic per variant (info / check / warning / error)
- `message` — required, single-line title; optional second-line description
- `action` — optional, single-button shortcut (e.g., "Undo")
- `dismiss` — optional close button (`aria-label="Dismiss"`); always present for errors

Toasts are stacked in a fixed-position **toast region** (top-right, top-center, or bottom-center per app convention).

## Variants

| Variant | Tone token | Icon | Auto-dismiss |
|---------|-----------|------|--------------|
| `info` | `--color-info` | i | 5s |
| `success` | `--color-success` | ✓ | 4s |
| `warning` | `--color-warning` | ! | 8s |
| `error` | `--color-danger` | × | NEVER |

## Sizes

Single size — toasts must remain compact. Width: `min(380px, 92vw)`.

## States

| State | Visual treatment |
|-------|-----------------|
| `entering` | Translate-in from edge + fade 0→1 over 200ms |
| `visible` | Resting at full opacity |
| `exiting` | Fade 1→0 + translate-out 150ms, then DOM removal |
| `:hover` | Auto-dismiss timer paused (per WCAG 2.2.1) |
| `:focus-within` | Timer paused; focus ring on dismiss button |

## Tokens consumed

- Color: `--color-fg`, `--color-fg-muted`, `--color-bg-elevated`, `--color-border`, `--color-info`, `--color-success`, `--color-warning`, `--color-danger`, `--color-action`
- Spacing: `--space-2`, `--space-3`, `--space-4`
- Radius: `--radius-md`
- Type: `--text-sm`, `--text-base`, `--font-body`, `--weight-medium`
- Shadow: `--shadow-lg`
- Motion: `--duration-base`, `--ease-out-quad`
- Z-index: `--z-toast`

## Accessibility

- The toast region is a **live region** at the page root: `<div role="region" aria-label="Notifications" id="toast-region">`.
- Each toast inside uses:
  - `role="status"` + `aria-live="polite"` for `info` / `success`
  - `role="alert"` + `aria-live="assertive"` for `warning` / `error`
- **Never auto-dismiss errors** — user MUST acknowledge by clicking dismiss. Auto-dismiss errors fail WCAG 2.2.1.
- Pause timer on hover/focus (WCAG 2.2.1 `pause-stop-hide`).
- Dismiss button is keyboard-reachable (Tab into the live region or via app shortcut).
- Provide a "view all notifications" page for users who missed transient toasts.

## Native HTML reference

```html
<!-- Region (single instance per page) -->
<div class="toast-region" role="region" aria-label="Notifications" id="toast-region"></div>

<!-- A single toast template, injected into the region -->
<div class="toast toast-success" role="status" aria-live="polite">
  <svg class="toast-icon" aria-hidden="true">...</svg>
  <div class="toast-message">
    <p class="toast-title">Saved</p>
    <p class="toast-description">Your changes are live.</p>
  </div>
  <button class="toast-action" type="button">Undo</button>
  <button class="toast-dismiss" type="button" aria-label="Dismiss">
    <svg aria-hidden="true">...</svg>
  </button>
</div>
```

## CSS reference

```css
.toast-region {
  position: fixed; top: var(--space-4); right: var(--space-4);
  display: flex; flex-direction: column; gap: var(--space-2);
  z-index: var(--z-toast);
  pointer-events: none; /* let pages stay interactive; toasts re-enable below */
}
.toast {
  pointer-events: auto;
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  align-items: center;
  gap: var(--space-3);
  width: min(380px, 92vw);
  padding: var(--space-3) var(--space-4);
  background: var(--color-bg-elevated);
  color: var(--color-fg);
  border-left: 4px solid var(--color-info);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  font-family: var(--font-body); font-size: var(--text-sm);
  animation: toast-in var(--duration-base) var(--ease-out-quad);
}
.toast-info    { border-left-color: var(--color-info);    }
.toast-success { border-left-color: var(--color-success); }
.toast-warning { border-left-color: var(--color-warning); }
.toast-error   { border-left-color: var(--color-danger);  }
.toast-icon { color: currentColor; }
.toast-info    .toast-icon { color: var(--color-info);    }
.toast-success .toast-icon { color: var(--color-success); }
.toast-warning .toast-icon { color: var(--color-warning); }
.toast-error   .toast-icon { color: var(--color-danger);  }
.toast-title { font-weight: var(--weight-medium); margin: 0; }
.toast-description { color: var(--color-fg-muted); margin: 0; }
.toast-action { background: none; border: 0; color: var(--color-action); font-weight: var(--weight-medium); cursor: pointer; }
.toast-dismiss { background: none; border: 0; color: var(--color-fg-muted); cursor: pointer; padding: var(--space-1); }
.toast-dismiss:focus-visible { outline: 2px solid var(--color-action); outline-offset: 2px; border-radius: var(--radius-sm); }
@keyframes toast-in { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) { .toast { animation: none; } }
```

## Anti-patterns

- Auto-dismissing **error** toasts — users miss critical info, fails WCAG 2.2.1
- Long-form content in a toast (>2 lines description) — use an inline alert or modal instead
- Toasts for confirmations the user just performed and obviously knows about ("You clicked Save")
- Stacking >3 toasts simultaneously — collapse to a "+N more" affordance
- `role="alert"` on info-level toasts — interrupts screen-reader user mid-sentence

## Adapter notes

If the project uses a component library, see `skills/component-library-integration/SKILL.md` for token-bridging patterns. The native spec above is the source of truth — adapters re-skin it with project tokens.
