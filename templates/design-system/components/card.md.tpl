# Card

## Anatomy

```
[ media? ]
[ heading ]
[ body ]
[ actions? ]
[ footer? ]
```

Slots:
- `media` — optional image / video / illustration at top, edge-to-edge
- `heading` — required, semantic `<h2>`-`<h4>` per page hierarchy
- `body` — required, paragraph(s) of supporting content
- `actions` — optional, button row aligned right (or full-width on mobile)
- `footer` — optional, meta info (timestamp, author), `--color-fg-muted`

## Variants

| Variant | Visual treatment | Use case |
|---------|-----------------|----------|
| `outline` | Border `--color-border`, bg `--color-bg` | Default density, list contexts |
| `elevated` | No border, bg `--color-bg-elevated`, shadow `--shadow-md` | Floating above a busy backdrop |
| `filled` | No border, bg `--color-bg-subtle` | Subdued grouping inside a section |

## Sizes / Density

| Density | Padding | Heading ramp |
|---------|---------|--------------|
| `tight` | space-3 | text-md |
| `comfortable` (default) | space-4 | text-lg |

## States

Static cards have no states. **Interactive cards** (entire card is a link or button):

| State | Visual treatment |
|-------|-----------------|
| `idle` | Variant default |
| `:hover` | Border `--color-border-strong` (outline) / shadow `--shadow-lg` (elevated) / bg shift (filled) |
| `:focus-visible` | 2px outline `--color-action`, offset 2px on the wrapper |
| `:active` | Slight inset / scale 0.99 |

## Tokens consumed

- Color: `--color-fg`, `--color-fg-muted`, `--color-border`, `--color-border-strong`, `--color-bg`, `--color-bg-elevated`, `--color-bg-subtle`, `--color-action`
- Spacing: `--space-3`, `--space-4`, `--space-6`
- Radius: `--radius-lg`
- Type: `--text-base`, `--text-lg`, `--text-md`, `--font-body`, `--font-display`, `--leading-body`, `--leading-display`
- Shadow: `--shadow-md`, `--shadow-lg`
- Motion: `--duration-quick`, `--ease-out-quad`

## Accessibility

- If the **entire card is clickable**, wrap content in a single `<a>` or `<button>` — don't nest interactive elements (a link inside a card-link makes a confused tab order).
- For cards with multiple actions inside, the card itself must NOT be clickable — use one primary action button or visible link inside.
- Heading inside the card uses the appropriate `<hN>` for page hierarchy — don't downgrade to `<div>`.
- Media: `<img>` requires `alt`. Decorative media uses `alt=""`.
- Touch target on interactive cards ≥44×44, satisfied by adequate padding.
- Focus ring stays on the wrapper element, not on its children, when the card is the link.

## Native HTML reference

```html
<!-- Static card -->
<article class="card card-outline card-comfortable">
  <img class="card-media" src="..." alt="" />
  <h3 class="card-heading">Quarterly report</h3>
  <p class="card-body">Revenue up 18% over Q1.</p>
  <div class="card-actions">
    <button class="btn btn-primary btn-sm" type="button">Open</button>
    <button class="btn btn-ghost btn-sm" type="button">Share</button>
  </div>
  <p class="card-footer">Updated 3 hours ago</p>
</article>

<!-- Interactive card (whole-card link) -->
<a class="card card-elevated card-comfortable card-link" href="/post/42">
  <h3 class="card-heading">A great article</h3>
  <p class="card-body">Lead paragraph...</p>
</a>
```

## CSS reference

```css
.card {
  display: flex; flex-direction: column; gap: var(--space-3);
  border-radius: var(--radius-lg);
  font-family: var(--font-body);
  color: var(--color-fg);
  text-decoration: none;
}
.card-comfortable { padding: var(--space-4); }
.card-tight       { padding: var(--space-3); }
.card-outline   { background: var(--color-bg); border: 1px solid var(--color-border); }
.card-elevated  { background: var(--color-bg-elevated); box-shadow: var(--shadow-md); }
.card-filled    { background: var(--color-bg-subtle); }
.card-media { margin: calc(var(--space-4) * -1) calc(var(--space-4) * -1) 0; border-top-left-radius: var(--radius-lg); border-top-right-radius: var(--radius-lg); width: calc(100% + var(--space-4) * 2); display: block; }
.card-heading { font-family: var(--font-display); font-size: var(--text-lg); line-height: var(--leading-display); margin: 0; }
.card-body { line-height: var(--leading-body); margin: 0; }
.card-actions { display: flex; gap: var(--space-2); margin-top: auto; }
.card-footer { font-size: var(--text-sm); color: var(--color-fg-muted); margin: 0; }
.card-link { transition: border-color var(--duration-quick) var(--ease-out-quad), box-shadow var(--duration-quick) var(--ease-out-quad); }
.card-link:hover.card-outline  { border-color: var(--color-border-strong); }
.card-link:hover.card-elevated { box-shadow: var(--shadow-lg); }
.card-link:focus-visible { outline: 2px solid var(--color-action); outline-offset: 2px; }
.card-link:active { transform: scale(0.99); }
```

## Anti-patterns

- Card with **multiple** interactive layers (whole-card link + a button inside) — broken tab order, ambiguous click target
- `<div>` heading inside card — defeats document outline
- Inline shadow `style="box-shadow: ..."` — bypass token discipline
- Decorative `<div>` soup wrapping every leaf (`<div class="card-content"><div class="card-inner">...`) — bloat without semantics
- Removing focus ring on interactive cards — fails WCAG 2.4.7

## Adapter notes

If the project uses a component library, see `skills/component-library-integration/SKILL.md` for token-bridging patterns. The native spec above is the source of truth — adapters re-skin it with project tokens.
