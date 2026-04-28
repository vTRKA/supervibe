# Select

## Anatomy

```
[ label ]
[ <select> [ <option>* ] ] [ chevron ]
[ helper-text? | error-text? ]
```

Slots:
- `label` — required, associated via `for`/`id`
- `select` — required, native `<select>` element with one or more `<option>`
- `chevron` — decorative, drawn via `background-image` or absolute-positioned SVG, `aria-hidden`
- `helper-text` / `error-text` — optional, linked via `aria-describedby`

## Variants

| Variant | Use case | Markup |
|---------|----------|--------|
| `single` | Pick one option | `<select>` |
| `multiple` | Pick many options | `<select multiple>` (renders as scrollable list) |

## Sizes

| Size | Padding (y / x) | Type ramp | Min height |
|------|-----------------|-----------|-----------|
| `sm` | space-1 / space-2 | text-sm | 32px |
| `md` (default) | space-2 / space-3 | text-base | 40px |
| `lg` | space-3 / space-4 | text-md | 48px |

## States

| State | Visual treatment |
|-------|-----------------|
| `idle` | Border `--color-border` |
| `:hover` | Border `--color-border-strong` |
| `:focus-visible` | Border `--color-action`, 3px ring `--color-action` at 20% alpha |
| `open` (native) | OS-controlled popup; chevron may rotate via `:focus` |
| `[disabled]` | Opacity 0.5, cursor not-allowed |
| `[aria-invalid="true"]` | Border `--color-danger` |

## Tokens consumed

- Color: `--color-fg`, `--color-fg-muted`, `--color-border`, `--color-border-strong`, `--color-action`, `--color-bg`, `--color-bg-subtle`, `--color-danger`
- Spacing: `--space-1` through `--space-6`
- Radius: `--radius-md`
- Type: `--text-sm` / `--text-base` / `--text-md`, `--font-body`
- Motion: `--duration-quick`, `--ease-out-quad`

## Accessibility

- `<label for>` association is mandatory.
- Native `<select>` provides keyboard support automatically: arrow keys move, type-ahead search, ESC closes — keep it.
- `aria-describedby` for helper/error text.
- `aria-invalid="true"` for invalid state.
- Multi-select: provide a separate visible hint ("Hold Ctrl/Cmd to select multiple") because affordance isn't obvious.
- Required: `required` attribute + visible asterisk in label.
- If a custom dropdown replaces native, it MUST implement: `role="combobox"`, `aria-expanded`, `aria-controls`, listbox with `role="listbox"` and `role="option"` children, full keyboard parity (arrows, Home/End, type-ahead, ESC).

## Native HTML reference

```html
<div class="field">
  <label class="field-label" for="country">Country</label>
  <div class="field-select-wrap">
    <select id="country" class="field-select field-select-md"
            aria-describedby="country-helper" required>
      <option value="" disabled selected>Choose a country</option>
      <option value="ru">Russia</option>
      <option value="us">United States</option>
      <option value="de">Germany</option>
    </select>
    <svg class="field-chevron" aria-hidden="true">...</svg>
  </div>
  <p id="country-helper" class="field-helper">Used for tax calculation.</p>
</div>
```

## CSS reference

```css
.field-select-wrap { position: relative; display: flex; align-items: center; }
.field-select {
  width: 100%;
  font-family: var(--font-body);
  color: var(--color-fg);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  appearance: none;
  -webkit-appearance: none;
  padding-right: var(--space-6); /* room for chevron */
  transition: border-color var(--duration-quick) var(--ease-out-quad),
              box-shadow   var(--duration-quick) var(--ease-out-quad);
}
.field-select-md { padding: var(--space-2) var(--space-3); padding-right: var(--space-6); font-size: var(--text-base); min-height: 40px; }
.field-select:hover { border-color: var(--color-border-strong); }
.field-select:focus-visible {
  outline: none;
  border-color: var(--color-action);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-action) 20%, transparent);
}
.field-select[disabled] { opacity: 0.5; cursor: not-allowed; }
.field-select[aria-invalid="true"] { border-color: var(--color-danger); }
.field-chevron {
  position: absolute;
  right: var(--space-2);
  pointer-events: none;
  color: var(--color-fg-muted);
}
.field-select[multiple] { padding-right: var(--space-3); min-height: 8rem; }
```

## Anti-patterns

- Replacing native `<select>` with a `<div>`-based dropdown without ARIA combobox parity — breaks keyboard, screen reader, mobile pickers
- Long lists (>15 options) without scroll — pair with search filter or use a typeahead combobox
- Multi-select without visible hint — users don't discover Ctrl/Cmd
- Hiding the chevron entirely — removes affordance signaling it's a dropdown
- Styling `<option>` heavily — most browsers ignore custom CSS on options inside the OS popup

## Adapter notes

If the project uses a component library, see `skills/component-library-integration/SKILL.md` for token-bridging patterns. The native spec above is the source of truth — adapters re-skin it with project tokens.
