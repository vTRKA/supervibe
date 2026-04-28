# Checkbox

## Anatomy

```
[ <input type="checkbox"> ] [ checkmark indicator ] [ label-text ]
[ helper-text? ]
```

Slots:
- `input` — required, native `<input type="checkbox">`, visually hidden but focusable
- `indicator` — visual square that draws border, fill, and checkmark/dash glyph
- `label-text` — required, clickable label content
- `helper-text` — optional, sub-line, linked via `aria-describedby`

## Variants

Single boolean control. Visual differs only by **state** (see below). For a checkbox **group** see `radio.md.tpl` patterns adapted with `name` shared across checkboxes inside a `<fieldset>`.

## Sizes

| Size | Box | Type ramp | Touch target |
|------|-----|-----------|--------------|
| `sm` | 14×14 | text-sm | 32×32 (label row) |
| `md` (default) | 18×18 | text-base | 40×40 |
| `lg` | 22×22 | text-md | 44×44 |

## States

| State | Visual treatment |
|-------|-----------------|
| `unchecked` | Border `--color-border-strong`, bg `--color-bg`, no glyph |
| `checked` | Border + bg `--color-action`, white checkmark |
| `indeterminate` | Border + bg `--color-action`, white dash |
| `:hover` | Border `--color-action`, slight bg tint |
| `:focus-visible` | 3px ring `--color-action` at 20% alpha around indicator |
| `[disabled]` | Opacity 0.5, cursor not-allowed, no hover effects |
| `[aria-invalid="true"]` | Border `--color-danger` |

## Tokens consumed

- Color: `--color-action`, `--color-action-fg`, `--color-fg`, `--color-fg-muted`, `--color-border`, `--color-border-strong`, `--color-bg`, `--color-danger`
- Spacing: `--space-1` through `--space-3`
- Radius: `--radius-sm`
- Type: `--text-sm` / `--text-base` / `--text-md`, `--font-body`
- Motion: `--duration-quick`, `--ease-out-quad`

## Accessibility

- Native `<input type="checkbox">` mandatory — never replace with a `<div role="checkbox">` unless implementing full ARIA pattern (Space toggles, focus, state announcement).
- Label association: either wrap input in `<label>` or use `<label for>` matching `id`. Required regardless of visual layout.
- Indeterminate state: ARIA-aware via JS — `inputEl.indeterminate = true` (not an HTML attribute). Screen readers announce "mixed".
- Focus ring on the indicator (since the input itself is visually hidden) via `:has()` or sibling selector.
- Click target ≥40×40 — extend hit area through label padding, not by enlarging the visual box.
- Helper text linked via `aria-describedby`.

## Native HTML reference

```html
<label class="checkbox checkbox-md">
  <input class="checkbox-input" type="checkbox" name="terms" aria-describedby="terms-helper" />
  <span class="checkbox-indicator" aria-hidden="true">
    <svg class="checkbox-check" viewBox="0 0 16 16">...</svg>
    <svg class="checkbox-dash"  viewBox="0 0 16 16">...</svg>
  </span>
  <span class="checkbox-label">I accept the terms</span>
</label>
<p id="terms-helper" class="field-helper">You can revoke later in settings.</p>
```

## CSS reference

```css
.checkbox { display: inline-flex; align-items: center; gap: var(--space-2); cursor: pointer; min-height: 40px; }
.checkbox-input { position: absolute; opacity: 0; width: 0; height: 0; }
.checkbox-indicator {
  display: inline-flex; align-items: center; justify-content: center;
  width: 18px; height: 18px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  transition: background-color var(--duration-quick) var(--ease-out-quad),
              border-color     var(--duration-quick) var(--ease-out-quad);
}
.checkbox-check, .checkbox-dash { display: none; color: var(--color-action-fg); }
.checkbox:hover .checkbox-indicator { border-color: var(--color-action); }
.checkbox-input:focus-visible + .checkbox-indicator {
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-action) 20%, transparent);
}
.checkbox-input:checked + .checkbox-indicator {
  background: var(--color-action); border-color: var(--color-action);
}
.checkbox-input:checked + .checkbox-indicator .checkbox-check { display: block; }
.checkbox-input:indeterminate + .checkbox-indicator {
  background: var(--color-action); border-color: var(--color-action);
}
.checkbox-input:indeterminate + .checkbox-indicator .checkbox-dash { display: block; }
.checkbox:has(.checkbox-input[disabled]) { opacity: 0.5; cursor: not-allowed; }
.checkbox-label { font-family: var(--font-body); font-size: var(--text-base); color: var(--color-fg); }
```

## Anti-patterns

- `<div role="checkbox">` without keyboard handlers — Space won't toggle, fails WCAG 2.1.1
- Checkmark drawn by background-image only — fails forced-colors mode
- Tiny visual box (12×12) without enlarged label hit area — fails WCAG 2.5.5
- Color-only checked state (e.g., just changing border color, no glyph) — fails WCAG 1.4.1
- Setting indeterminate via attribute (`indeterminate=""` on HTML) — only the JS property works

## Adapter notes

If the project uses a component library, see `skills/component-library-integration/SKILL.md` for token-bridging patterns. The native spec above is the source of truth — adapters re-skin it with project tokens.
