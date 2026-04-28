# Button

## Anatomy

```
[ leading-icon? ] [ label ] [ trailing-icon? ] [ loading-spinner? ]
```

Slots:
- `leading-icon` — optional, 16-20px, color-fg
- `label` — required, body weight 500
- `trailing-icon` — optional (chevron, external-link, etc.)
- `loading-spinner` — replaces label when `data-loading="true"`

## Variants

| Variant | Use case | Token mapping |
|---------|----------|---------------|
| `primary` | Single most important action per screen | bg=action, fg=action-fg, hover=action-hover |
| `secondary` | Secondary actions, equal weight options | bg=bg-elevated, fg=fg, border=border-strong |
| `ghost` | Tertiary, low-affordance | bg=transparent, fg=fg-muted, hover bg=bg-subtle |
| `danger` | Destructive (delete, leave) | bg=danger, fg=action-fg |

## Sizes

| Size | Padding (y / x) | Type ramp | Min height |
|------|-----------------|-----------|-----------|
| `sm` | space-1 / space-3 | text-sm | 32px |
| `md` (default) | space-2 / space-4 | text-base | 40px |
| `lg` | space-3 / space-6 | text-md | 48px |

## States

| State | Visual treatment |
|-------|-----------------|
| `idle` | Variant default |
| `:hover` | Variant hover token; transition `var(--duration-quick) var(--ease-out-quad)` |
| `:active` | Variant active (scale 0.98 + slightly darker) |
| `:focus-visible` | 2px outline color-action, offset 2px |
| `[disabled]` | Opacity 0.5, cursor not-allowed |
| `[data-loading="true"]` | Spinner replaces label, button disabled |

## Tokens consumed

- Color: `--color-action`, `--color-action-hover`, `--color-action-fg`, `--color-fg`, `--color-fg-muted`, `--color-border`, `--color-border-strong`, `--color-bg-elevated`, `--color-bg-subtle`, `--color-danger`
- Spacing: `--space-1` through `--space-6`
- Radius: `--radius-md` (default)
- Type: `--text-sm` / `--text-base` / `--text-md`, `--weight-medium`
- Motion: `--duration-quick`, `--ease-out-quad`

## Accessibility

- Native `<button>` element (NOT `<div onclick>`).
- Focus ring visible at 2px / offset 2px / `outline-color: var(--color-action)`.
- Touch target ≥44×44 (apply via `min-height` + adequate padding) at mobile-tier viewports.
- Loading state: `aria-busy="true"`, label remains in accessible name (visually hidden, screen-reader reads).
- Disabled state: `aria-disabled="true"` if button must remain in tab order; otherwise `disabled` attribute.
- Icon-only button: REQUIRES `aria-label` or `<span class="sr-only">label</span>`.

## Native HTML reference

```html
<button class="btn btn-primary btn-md" type="button">
  <svg class="btn-icon" aria-hidden="true">...</svg>
  <span class="btn-label">Save changes</span>
</button>

<button class="btn btn-primary btn-md" type="button" data-loading="true" aria-busy="true">
  <svg class="btn-spinner" aria-hidden="true">...</svg>
  <span class="sr-only">Saving</span>
</button>
```

## CSS reference

```css
.btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  border-radius: var(--radius-md);
  font-family: var(--font-body);
  font-weight: var(--weight-medium);
  border: 1px solid transparent;
  cursor: pointer;
  transition: background-color var(--duration-quick) var(--ease-out-quad),
              color           var(--duration-quick) var(--ease-out-quad),
              transform       var(--duration-instant) var(--ease-out-quad);
}
.btn-md  { padding: var(--space-2) var(--space-4); font-size: var(--text-base); min-height: 40px; }
.btn-primary { background: var(--color-action);    color: var(--color-action-fg); }
.btn-primary:hover { background: var(--color-action-hover); }
.btn-primary:active { transform: scale(0.98); }
.btn:focus-visible { outline: 2px solid var(--color-action); outline-offset: 2px; }
.btn[disabled] { opacity: 0.5; cursor: not-allowed; }
```

## Anti-patterns

- Using `<div onclick>` instead of `<button>` — breaks keyboard, breaks screen-reader
- Removing focus ring without replacement — fails WCAG 2.4.7
- Loading state that hides the label entirely without `sr-only` — screen-reader user has no idea what's loading
- Touch target <44×44 on mobile-tier viewports — fails WCAG 2.5.5
- Inline `style="background: #..."` — bypass token discipline
