# Toggle (Switch)

## Anatomy

```
[ label-text ] [ track [ thumb ] ]
```

Two markup paths:

1. **Restyled checkbox** — `<input type="checkbox" role="switch">`, native semantics + custom visuals
2. **Button switch** — `<button role="switch" aria-checked="true|false">`, when no form value is needed

Slots:
- `label-text` — required, describes what the switch controls
- `track` — visual rail
- `thumb` — sliding circle indicator

## Variants

| Variant | When to use |
|---------|-------------|
| `restyled-checkbox` | Form-submitted setting (sends value with form) |
| `button-switch` | Async setting persisted via API on toggle (no form) |

## Sizes

| Size | Track | Thumb | Touch target |
|------|-------|-------|--------------|
| `sm` | 28×16 | 12×12 | 32×32 |
| `md` (default) | 36×20 | 16×16 | 40×40 |
| `lg` | 44×24 | 20×20 | 44×44 |

## States

| State | Visual treatment |
|-------|-----------------|
| `off` | Track `--color-border-strong`, thumb left |
| `on` | Track `--color-action`, thumb right |
| `:hover` | Track tint shifts one step |
| `:focus-visible` | 3px ring `--color-action` at 20% alpha around track |
| `[disabled]` / `[aria-disabled="true"]` | Opacity 0.5, cursor not-allowed |

## Tokens consumed

- Color: `--color-action`, `--color-action-fg`, `--color-fg`, `--color-fg-muted`, `--color-border-strong`, `--color-bg`
- Spacing: `--space-1` through `--space-3`
- Radius: `--radius-pill`
- Type: `--text-sm` / `--text-base`, `--font-body`
- Motion: `--duration-quick`, `--ease-out-quad`

## Accessibility

- Announce state changes — both markup paths produce "on"/"off" or "checked"/"unchecked" via screen readers.
- `role="switch"` is preferred over `role="checkbox"` when the control toggles a system setting (not a form value).
- Keyboard: Space toggles (works natively for both `<input type="checkbox">` and `<button>`).
- Visible label text is mandatory — icon-only switches fail WCAG 2.5.3 unless paired with `aria-label`.
- Focus ring on track is required — never rely on color alone for state.
- Don't animate state change >200ms — slow transitions delay feedback.

## Native HTML reference

```html
<!-- Variant 1: restyled checkbox -->
<label class="toggle toggle-md">
  <input class="toggle-input" type="checkbox" role="switch" name="notifications" />
  <span class="toggle-track" aria-hidden="true">
    <span class="toggle-thumb"></span>
  </span>
  <span class="toggle-label">Email notifications</span>
</label>

<!-- Variant 2: button switch -->
<button class="toggle-btn toggle-md" type="button" role="switch" aria-checked="false">
  <span class="toggle-label">Dark mode</span>
  <span class="toggle-track" aria-hidden="true">
    <span class="toggle-thumb"></span>
  </span>
</button>
```

## CSS reference

```css
.toggle, .toggle-btn { display: inline-flex; align-items: center; gap: var(--space-2); cursor: pointer; min-height: 40px; background: none; border: 0; padding: 0; }
.toggle-input { position: absolute; opacity: 0; width: 0; height: 0; }
.toggle-track {
  position: relative;
  width: 36px; height: 20px;
  background: var(--color-border-strong);
  border-radius: var(--radius-pill);
  transition: background-color var(--duration-quick) var(--ease-out-quad);
}
.toggle-thumb {
  position: absolute;
  top: 2px; left: 2px;
  width: 16px; height: 16px;
  background: var(--color-action-fg);
  border-radius: var(--radius-pill);
  transition: transform var(--duration-quick) var(--ease-out-quad);
}
.toggle-input:checked + .toggle-track,
.toggle-btn[aria-checked="true"] .toggle-track { background: var(--color-action); }
.toggle-input:checked + .toggle-track .toggle-thumb,
.toggle-btn[aria-checked="true"] .toggle-track .toggle-thumb { transform: translateX(16px); }
.toggle-input:focus-visible + .toggle-track,
.toggle-btn:focus-visible .toggle-track {
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-action) 20%, transparent);
}
.toggle:has(.toggle-input[disabled]),
.toggle-btn[aria-disabled="true"] { opacity: 0.5; cursor: not-allowed; }
.toggle-label { font-family: var(--font-body); font-size: var(--text-base); color: var(--color-fg); }
```

## Anti-patterns

- Using a toggle for non-boolean choices (3+ states) — use a segmented button or radio group
- Toggle that triggers a destructive irreversible action — use a button + confirm dialog instead
- Switch without a visible label — fails WCAG 2.5.3
- Spring-back / loading animations >300ms — feels broken on slow networks; pair instant visual flip with `aria-busy` if persisting async
- Changing the meaning of "on" between contexts (e.g., "on = mute" in one place, "on = sound" in another) — confusing

## Adapter notes

If the project uses a component library, see `skills/component-library-integration/SKILL.md` for token-bridging patterns. The native spec above is the source of truth — adapters re-skin it with project tokens.
