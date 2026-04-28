# Textarea

## Anatomy

```
[ label ]
[ <textarea> ]
[ helper-text? | error-text? ] [ char-counter? ]
```

Slots:
- `label` — required, associated via `for`/`id`
- `textarea` — required, native `<textarea>` element
- `helper-text` / `error-text` — optional, linked via `aria-describedby`
- `char-counter` — optional, live region announcing remaining characters when `maxlength` set

## Variants

| Variant | Use case | Implementation |
|---------|----------|----------------|
| `fixed` | Predictable layout, no growth | `rows` attribute, `resize: vertical` |
| `auto-grow` | Adapt to content | JS resize on `input` event, capped by `--max-rows` |
| `rows-min/max` | Bounded auto-grow | CSS `field-sizing: content` (modern) + `min-height`/`max-height` fallback |

## Sizes

| Size | Padding (y / x) | Type ramp | Min rows |
|------|-----------------|-----------|----------|
| `sm` | space-1 / space-2 | text-sm | 2 |
| `md` (default) | space-2 / space-3 | text-base | 3 |
| `lg` | space-3 / space-4 | text-md | 4 |

## States

| State | Visual treatment |
|-------|-----------------|
| `idle` (empty) | Border `--color-border`, placeholder `--color-fg-muted` |
| `idle` (filled) | Border `--color-border`, value `--color-fg` |
| `:hover` | Border `--color-border-strong` |
| `:focus-visible` | Border `--color-action`, 3px ring `--color-action` at 20% alpha |
| `[disabled]` | Opacity 0.5, cursor not-allowed, bg `--color-bg-subtle` |
| `[aria-invalid="true"]` | Border `--color-danger`, error-text visible |
| `[readonly]` | bg `--color-bg-subtle`, cursor default |

## Tokens consumed

- Color: `--color-fg`, `--color-fg-muted`, `--color-border`, `--color-border-strong`, `--color-action`, `--color-bg`, `--color-bg-subtle`, `--color-danger`
- Spacing: `--space-1` through `--space-4`
- Radius: `--radius-md`
- Type: `--text-sm` / `--text-base` / `--text-md`, `--font-body`, `--leading-body`
- Motion: `--duration-quick`, `--ease-out-quad`

## Accessibility

- `<label for>` association mandatory; placeholder is NOT a label.
- `aria-describedby` links helper text + error text + char-counter.
- `aria-invalid="true"` for error state.
- Char counter must be a live region (`aria-live="polite"`) when value approaches limit, but silent for normal typing to avoid noisy SR output.
- Default `resize: vertical` (never `none`); never use a fixed pixel height that crops content silently.
- Keep visible focus ring; never rely solely on caret blink.

## Native HTML reference

```html
<div class="field">
  <label class="field-label" for="bio">Bio</label>
  <textarea id="bio" class="field-textarea field-textarea-md"
            rows="3" maxlength="280"
            aria-describedby="bio-helper bio-counter"
            aria-invalid="false"></textarea>
  <div class="field-row">
    <p id="bio-helper" class="field-helper">A short personal description.</p>
    <p id="bio-counter" class="field-counter" aria-live="polite">280 left</p>
  </div>
</div>
```

## CSS reference

```css
.field-textarea {
  width: 100%;
  font-family: var(--font-body);
  font-size: var(--text-base);
  line-height: var(--leading-body);
  color: var(--color-fg);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  resize: vertical;
  transition: border-color var(--duration-quick) var(--ease-out-quad),
              box-shadow   var(--duration-quick) var(--ease-out-quad);
}
.field-textarea-md { padding: var(--space-2) var(--space-3); min-height: calc(var(--space-2) * 2 + var(--leading-body) * 3em); }
.field-textarea::placeholder { color: var(--color-fg-muted); }
.field-textarea:hover { border-color: var(--color-border-strong); }
.field-textarea:focus-visible {
  outline: none;
  border-color: var(--color-action);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-action) 20%, transparent);
}
.field-textarea[disabled] { opacity: 0.5; cursor: not-allowed; background: var(--color-bg-subtle); }
.field-textarea[aria-invalid="true"] { border-color: var(--color-danger); }
.field-textarea[readonly] { background: var(--color-bg-subtle); }
/* Modern auto-grow */
@supports (field-sizing: content) {
  .field-textarea-auto { field-sizing: content; min-height: 3lh; max-height: 12lh; resize: none; }
}
.field-row { display: flex; justify-content: space-between; gap: var(--space-2); }
.field-counter { font-size: var(--text-sm); color: var(--color-fg-muted); }
```

## Anti-patterns

- Fixed pixel `height` that crops content with `overflow: hidden` — invisible data loss
- `resize: none` on a fixed-row textarea — user can't see long content
- Placeholder as the only label — fails WCAG 3.3.2
- Char-counter `aria-live="assertive"` firing on every keypress — screen-reader spam
- Disabling browser spellcheck on freeform user content — accessibility regression for dyslexic users

## Adapter notes

If the project uses a component library, see `skills/component-library-integration/SKILL.md` for token-bridging patterns. The native spec above is the source of truth — adapters re-skin it with project tokens.
