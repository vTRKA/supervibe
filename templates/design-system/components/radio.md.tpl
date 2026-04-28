# Radio

## Anatomy

```
<fieldset>
  <legend> [ group label ] </legend>
  [ <input type="radio"> ] [ dot indicator ] [ label-text ]   ← repeats
  [ helper-text? | error-text? ]
</fieldset>
```

Slots:
- `fieldset` — required group container
- `legend` — required group label (visible or `sr-only`)
- `input` — required, native `<input type="radio">`, all options share the same `name`
- `indicator` — visual circle that draws border + filled dot
- `label-text` — required per option

## Variants

Single visual variant; layout may be **horizontal** or **vertical**. For "tile" radios (large card-style options) keep underlying markup identical — only the indicator/label wrapping changes.

## Sizes

| Size | Circle | Type ramp | Touch target |
|------|--------|-----------|--------------|
| `sm` | 14×14 | text-sm | 32×32 (label row) |
| `md` (default) | 18×18 | text-base | 40×40 |
| `lg` | 22×22 | text-md | 44×44 |

## States

| State | Visual treatment |
|-------|-----------------|
| `unchecked` | Border `--color-border-strong`, bg `--color-bg`, no dot |
| `checked` | Border `--color-action`, inner dot `--color-action` |
| `:hover` | Border `--color-action`, slight bg tint |
| `:focus-visible` | 3px ring `--color-action` at 20% alpha around indicator |
| `[disabled]` | Opacity 0.5, cursor not-allowed |
| `fieldset[aria-invalid="true"]` | Error-text visible, group border `--color-danger` if shown |

## Tokens consumed

- Color: `--color-action`, `--color-fg`, `--color-fg-muted`, `--color-border`, `--color-border-strong`, `--color-bg`, `--color-danger`
- Spacing: `--space-1` through `--space-3`
- Radius: `--radius-pill` (circle)
- Type: `--text-sm` / `--text-base` / `--text-md`, `--font-body`, `--weight-medium` (legend)
- Motion: `--duration-quick`, `--ease-out-quad`

## Accessibility

- Group MUST be wrapped in `<fieldset>` with `<legend>` — radios without grouping fail WCAG 1.3.1.
- All radios in the group share the same `name` attribute — without this, the browser allows multiple selections.
- Native `<input type="radio">` provides arrow-key navigation between options automatically (Down/Right = next, Up/Left = previous, also wraps).
- Use `<label for>` or wrap input in `<label>`. Hit area extends across the label.
- For required group: `aria-required="true"` on the fieldset; visible asterisk in legend.
- Error message linked via `aria-describedby` on the fieldset.
- Never use radio for boolean toggles — use checkbox or switch instead.

## Native HTML reference

```html
<fieldset class="radio-group" aria-describedby="plan-helper">
  <legend class="radio-legend">Choose a plan</legend>

  <label class="radio radio-md">
    <input class="radio-input" type="radio" name="plan" value="free" />
    <span class="radio-indicator" aria-hidden="true"></span>
    <span class="radio-label">Free</span>
  </label>

  <label class="radio radio-md">
    <input class="radio-input" type="radio" name="plan" value="pro" checked />
    <span class="radio-indicator" aria-hidden="true"></span>
    <span class="radio-label">Pro</span>
  </label>

  <p id="plan-helper" class="field-helper">You can change later anytime.</p>
</fieldset>
```

## CSS reference

```css
.radio-group { border: 0; padding: 0; margin: 0; display: flex; flex-direction: column; gap: var(--space-2); }
.radio-legend { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--color-fg); margin-bottom: var(--space-1); padding: 0; }
.radio { display: inline-flex; align-items: center; gap: var(--space-2); cursor: pointer; min-height: 40px; }
.radio-input { position: absolute; opacity: 0; width: 0; height: 0; }
.radio-indicator {
  display: inline-flex; align-items: center; justify-content: center;
  width: 18px; height: 18px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-pill);
  background: var(--color-bg);
  transition: border-color var(--duration-quick) var(--ease-out-quad),
              box-shadow   var(--duration-quick) var(--ease-out-quad);
}
.radio-indicator::after {
  content: ""; width: 8px; height: 8px;
  border-radius: var(--radius-pill);
  background: var(--color-action);
  transform: scale(0);
  transition: transform var(--duration-quick) var(--ease-out-quad);
}
.radio:hover .radio-indicator { border-color: var(--color-action); }
.radio-input:focus-visible + .radio-indicator {
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-action) 20%, transparent);
}
.radio-input:checked + .radio-indicator { border-color: var(--color-action); }
.radio-input:checked + .radio-indicator::after { transform: scale(1); }
.radio:has(.radio-input[disabled]) { opacity: 0.5; cursor: not-allowed; }
.radio-label { font-family: var(--font-body); font-size: var(--text-base); color: var(--color-fg); }
```

## Anti-patterns

- Using checkboxes for single-selection — allows multiple selection, fails affordance
- Missing `<fieldset>` wrap — screen readers don't announce the group context
- Different `name` per radio — breaks mutual exclusivity
- Custom `<div role="radio">` without arrow-key handlers — breaks WCAG 2.1.1
- Radio for boolean (yes/no) — use checkbox or switch instead

## Adapter notes

If the project uses a component library, see `skills/component-library-integration/SKILL.md` for token-bridging patterns. The native spec above is the source of truth — adapters re-skin it with project tokens.
