# Input

## Anatomy

```
[ label ]
[ leading-icon? ] [ <input> ] [ trailing-icon? ]
[ helper-text? | error-text? ]
```

Slots:
- `label` — required, sits above input, associated via `for`/`id`
- `leading-icon` — optional, 16-20px, color-fg-muted, decorative (`aria-hidden`)
- `input` — required, native `<input>` element
- `trailing-icon` — optional (clear, search submit, password toggle); if interactive, must be a `<button>`
- `helper-text` — optional contextual hint, color-fg-muted
- `error-text` — replaces helper when invalid; programmatically linked

## Variants

| Variant | Use case | `type` attribute |
|---------|----------|------------------|
| `text` | Generic single-line input | `text` |
| `email` | Email address | `email` |
| `tel` | Phone number | `tel` |
| `url` | URL | `url` |
| `search` | Search query | `search` |
| `number` | Numeric value | `number` |
| `password` | Secret value | `password` |

## Sizes

| Size | Padding (y / x) | Type ramp | Min height |
|------|-----------------|-----------|-----------|
| `sm` | space-1 / space-2 | text-sm | 32px |
| `md` (default) | space-2 / space-3 | text-base | 40px |
| `lg` | space-3 / space-4 | text-md | 48px |

## States

| State | Visual treatment |
|-------|-----------------|
| `idle` (empty) | Border `--color-border`, placeholder `--color-fg-muted` |
| `idle` (filled) | Border `--color-border`, value `--color-fg` |
| `:hover` | Border `--color-border-strong` |
| `:focus-visible` | Border `--color-action`, 3px ring `--color-action` at 20% alpha |
| `:active` | Same as focus |
| `[disabled]` | Opacity 0.5, cursor not-allowed, bg `--color-bg-subtle` |
| `[aria-invalid="true"]` | Border `--color-danger`, error-text visible |
| `[readonly]` | bg `--color-bg-subtle`, cursor default, no focus ring change |

## Tokens consumed

- Color: `--color-fg`, `--color-fg-muted`, `--color-border`, `--color-border-strong`, `--color-action`, `--color-bg`, `--color-bg-subtle`, `--color-danger`
- Spacing: `--space-1` through `--space-4`
- Radius: `--radius-md`
- Type: `--text-sm` / `--text-base` / `--text-md`, `--font-body`
- Motion: `--duration-quick`, `--ease-out-quad`

## Accessibility

- `<label for="id">` MUST be associated with `<input id="id">` — never use placeholder as the only label.
- Helper text linked via `aria-describedby`; error text appended to the same description list.
- Invalid state: `aria-invalid="true"` on input + `aria-describedby` includes error-text id.
- Required: `required` attribute + visible asterisk in label (not just color).
- Focus ring NEVER removed — replace at minimum with the same 3px ring spec.
- Touch target: input ≥40px tall on mobile, label tappable row.

## Native HTML reference

```html
<div class="field">
  <label class="field-label" for="email">Email</label>
  <div class="field-input-wrap">
    <svg class="field-icon" aria-hidden="true">...</svg>
    <input id="email" class="field-input field-input-md" type="email"
           aria-describedby="email-helper email-error"
           aria-invalid="false" required />
  </div>
  <p id="email-helper" class="field-helper">We never share your email.</p>
  <p id="email-error" class="field-error" hidden>Enter a valid email.</p>
</div>
```

## CSS reference

```css
.field { display: flex; flex-direction: column; gap: var(--space-1); }
.field-label { font-size: var(--text-sm); color: var(--color-fg); font-weight: var(--weight-medium); }
.field-input-wrap { position: relative; display: flex; align-items: center; }
.field-input {
  width: 100%;
  font-family: var(--font-body);
  color: var(--color-fg);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  transition: border-color var(--duration-quick) var(--ease-out-quad),
              box-shadow   var(--duration-quick) var(--ease-out-quad);
}
.field-input-md { padding: var(--space-2) var(--space-3); font-size: var(--text-base); min-height: 40px; }
.field-input::placeholder { color: var(--color-fg-muted); }
.field-input:hover { border-color: var(--color-border-strong); }
.field-input:focus-visible {
  outline: none;
  border-color: var(--color-action);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-action) 20%, transparent);
}
.field-input[disabled] { opacity: 0.5; cursor: not-allowed; background: var(--color-bg-subtle); }
.field-input[aria-invalid="true"] { border-color: var(--color-danger); }
.field-input[readonly] { background: var(--color-bg-subtle); }
.field-helper { font-size: var(--text-sm); color: var(--color-fg-muted); }
.field-error  { font-size: var(--text-sm); color: var(--color-danger); }
```

## Anti-patterns

- Placeholder as the only label — vanishes on focus, fails WCAG 3.3.2
- Color-only error indication — fails WCAG 1.4.1; pair with icon + text
- Removing focus ring without an equivalent replacement — fails WCAG 2.4.7
- Disabling browser autofill styling without restoring contrast
- `<div contenteditable>` instead of `<input>` — breaks form submission, autofill, mobile keyboards

## Adapter notes

If the project uses a component library, see `skills/component-library-integration/SKILL.md` for token-bridging patterns. The native spec above is the source of truth — adapters re-skin it with project tokens.
